import type { DialogueSegment, Episode, Host, HostRole } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { getSegmentDurationMs } from "@/hooks/use-episode-playback";
import {
  createEpisodeObjectUrlPool,
  type EpisodeObjectUrlPool,
  type ObjectUrlApi,
} from "@/lib/tts/object-url-manager";
import {
  classifyRetryAfter,
  parseRetryAfterMs,
  parseRetryAfterRawSeconds,
  sanitizeRetryAfterSeconds,
  type TtsQuotaClass,
} from "@/lib/tts/retry-after";
import type { TtsErrorCode, TtsRoutePreference } from "@/lib/tts/tts-contract";
import {
  INITIAL_AUDIO_BUFFER_SIZE,
  MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT,
  MAX_TTS_CONCURRENCY,
  MIN_TTS_REQUEST_INTERVAL_MS,
  PREFETCH_LOOKAHEAD,
  RATE_LIMIT_COOLDOWN_MAX_MS,
  RATE_LIMIT_COOLDOWN_MIN_MS,
  resolveTtsRequestIntervalMs,
} from "@/lib/tts/tts-pacing-config";

export {
  INITIAL_AUDIO_BUFFER_SIZE,
  MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT,
  MAX_TTS_CONCURRENCY,
  MIN_TTS_REQUEST_INTERVAL_MS,
  PREFETCH_LOOKAHEAD,
  RATE_LIMIT_COOLDOWN_MAX_MS,
  RATE_LIMIT_COOLDOWN_MIN_MS,
  resolveTtsRequestIntervalMs,
};

export const MAX_CAPACITY_RETRIES_PER_SEGMENT = MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT;
/** Client issues at most 1 initial request + 1 post-cooldown capacity retry per segment automatically. */
export const MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT =
  1 + MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT;
/** Bounded manual retries allowed per failed segment within a single playback/replay cycle. */
export const MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE = 1;
/** Combined automatic + manual client attempts allowed per segment within a single replay cycle. */
export const MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE =
  MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT + MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE;
/** Typical automatic upstream Gemini calls per segment (capacity fail + 1 post-cooldown retry hitting 1 server empty-audio regen; absolute ceiling 4). */
export const MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT = 3;
export const OUTAGE_CONSECUTIVE_NON_CAPACITY_ERRORS = 2;
export const CAPACITY_RETRY_FALLBACK_COOLDOWN_MS = 2_000;
export const DEFAULT_LONG_QUOTA_CIRCUIT_WINDOW_MS = 30 * 60 * 1000;

export interface TtsSessionCircuitState {
  primaryOpen: boolean;
  primaryResetAtMs: number | null;
  lastRetryAfterSeconds: number | null;
  quotaClass: TtsQuotaClass;
}

export interface TtsSessionCircuit {
  isPrimaryOpen: (nowMs?: number) => boolean;
  openPrimary: (nowMs: number, retryAfterSeconds?: number | null) => void;
  reset: () => void;
  getState: (nowMs?: number) => TtsSessionCircuitState;
}

/**
 * In-memory session-level circuit breaker preventing repeated calls to a daily-quota-exhausted
 * primary TTS model across segments and episodes in the same active session.
 */
export function createTtsSessionCircuit(): TtsSessionCircuit {
  let primaryOpen = false;
  let primaryResetAtMs: number | null = null;
  let lastRetryAfterSeconds: number | null = null;
  let quotaClass: TtsQuotaClass = "none";

  function refreshIfExpired(nowMs: number) {
    if (primaryOpen && primaryResetAtMs !== null && nowMs >= primaryResetAtMs) {
      primaryOpen = false;
      primaryResetAtMs = null;
      lastRetryAfterSeconds = null;
      quotaClass = "none";
    }
  }

  return {
    isPrimaryOpen(nowMs = Date.now()) {
      refreshIfExpired(nowMs);
      return primaryOpen;
    },
    openPrimary(nowMs, retryAfterSeconds) {
      const sanitized = sanitizeRetryAfterSeconds(retryAfterSeconds);
      const windowMs =
        sanitized !== undefined ? sanitized * 1000 : DEFAULT_LONG_QUOTA_CIRCUIT_WINDOW_MS;
      primaryOpen = true;
      primaryResetAtMs = nowMs + windowMs;
      lastRetryAfterSeconds = sanitized ?? null;
      quotaClass = "long_quota_wait";
    },
    reset() {
      primaryOpen = false;
      primaryResetAtMs = null;
      lastRetryAfterSeconds = null;
      quotaClass = "none";
    },
    getState(nowMs = Date.now()) {
      refreshIfExpired(nowMs);
      return {
        primaryOpen,
        primaryResetAtMs,
        lastRetryAfterSeconds,
        quotaClass,
      };
    },
  };
}

let browserSessionCircuit: TtsSessionCircuit | null = null;

export function getBrowserTtsSessionCircuit(): TtsSessionCircuit {
  if (!browserSessionCircuit) {
    browserSessionCircuit = createTtsSessionCircuit();
  }
  return browserSessionCircuit;
}

export function resetBrowserTtsSessionCircuit(): void {
  browserSessionCircuit?.reset();
}

const REACTION_START_DELAY_MS = 80;
const REACTION_END_DELAY_MS = 760;
const VALID_ROLES = new Set<HostRole>([
  "explainer",
  "learner",
  "skeptic",
  "storyteller",
  "specialist",
  "moderator",
]);
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

export type AudioPreparationStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "partial"
  | "cooldown"
  | "unavailable"
  | "cancelled";

export type SegmentQueueStatus =
  | "idle"
  | "queued"
  | "generating"
  | "ready"
  | "playing"
  | "paused"
  | "completed"
  | "retry-wait"
  | "failed"
  | "skipped"
  | "cancelled";

export type EpisodePlaybackStatus =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "autoplay-blocked"
  | "complete";

export type EpisodeAudioMode = "hosted" | "timed-fallback";
export type QueueOutageState =
  | "none"
  | "config_error"
  | "auth_error"
  | "provider_outage"
  | "quota_exhausted";
export type EpisodeAudioSourceSummary =
  | "primary"
  | "fallback"
  | "mixed"
  | "caption-only"
  | "pending";
export type SegmentFailureCategory = "transient" | "permanent";
export type SegmentFailureClass =
  | "capacity"
  | "timeout"
  | "network"
  | "audio"
  | "configuration"
  | "auth"
  | "safety"
  | "invalid"
  | "unknown";

export type RetryDisabledReason =
  | "cooldown"
  | "generating"
  | "in_flight"
  | "limit_reached"
  | "permanent";

export type FetchSegmentAudioResult =
  | {
      ok: true;
      blob: Blob;
      contentType: string;
      durationMs: number | null;
      fallbackUsed?: boolean;
      quotaClass?: TtsQuotaClass;
      retryAfterHeader?: string | null;
      profileId?: string | null;
    }
  | {
      ok: false;
      httpStatus: number;
      errorCode: TtsErrorCode;
      message: string;
      retryable: boolean;
      retryAfterHeader?: string | null;
      quotaClass?: TtsQuotaClass;
      fallbackUsed?: boolean;
      isNetworkError?: boolean;
    };

export interface FetchSegmentAudioPayload {
  segmentId: string;
  speakerId: string;
  role: HostRole;
  text: string;
  routePreference?: TtsRoutePreference;
}

export interface AudioDriverCallbacks {
  onLoadedMetadata: (durationMs: number | null) => void;
  onCanPlay: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onDecodeError: () => void;
}

export type AudioPlayOutcome =
  | { ok: true }
  | { ok: false; reason: "autoplay_blocked" | "decode_error" | "aborted" };

export interface AudioDriver {
  verifyPlayable?: (url: string) => Promise<boolean>;
  loadAndPlay: (
    url: string,
    startTimeSec: number,
    callbacks: AudioDriverCallbacks,
  ) => Promise<AudioPlayOutcome>;
  resume: (callbacks?: AudioDriverCallbacks) => Promise<AudioPlayOutcome>;
  pause: () => number;
  stop: () => void;
  getCurrentTimeSec: () => number;
  dispose: () => void;
}

export interface TimerDriver {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface EpisodeAudioQueueDeps {
  fetchSegmentAudio: (
    payload: FetchSegmentAudioPayload,
    signal: AbortSignal,
  ) => Promise<FetchSegmentAudioResult>;
  audioDriver: AudioDriver;
  urlApi?: ObjectUrlApi;
  timers?: TimerDriver;
  now?: () => number;
  minRequestIntervalMs?: number | string | null;
  sessionCircuit?: TtsSessionCircuit;
}

export interface SegmentQueueEntryView {
  segmentId: string;
  speakerId: string;
  order: number;
  cacheKey: string;
  status: SegmentQueueStatus;
  hasCachedAudio: boolean;
  audioSource: "primary" | "fallback" | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  failureClass: SegmentFailureClass | null;
  failureCategory: SegmentFailureCategory | null;
  retryable: boolean;
  retryAfterMs: number | null;
  requestAttempts: number;
  lastFailureAt: number | null;
  manualRetriesUsedInCycle: number;
  manualRetryAllowed: boolean;
  manualRetryAvailable: boolean;
  generationStartedAt: number | null;
  generationCompletedAt: number | null;
}

export interface EpisodeAudioQueueSnapshot {
  episodeId: string;
  replayCycle: number;
  audioPreparationStatus: AudioPreparationStatus;
  hasStartedPodcast: boolean;
  initialBufferTarget: number;
  initialBufferReadyCount: number;
  activePreparingTurnNumber: number | null;
  canStartPodcast: boolean;
  canStartPartialPodcast: boolean;
  canRetryPreparation: boolean;
  preparationMessage: string | null;
  minRequestIntervalMs: number;
  currentIndex: number;
  totalSegments: number;
  status: EpisodePlaybackStatus;
  stageStatus: PlaybackStatus;
  audioMode: EpisodeAudioMode;
  outageState: QueueOutageState;
  isHostedAudioPlaying: boolean;
  isTimedFallbackActive: boolean;
  activeSpeakerId: string;
  activeHost: Host | undefined;
  currentSegment: DialogueSegment | undefined;
  previousSegment: DialogueSegment | null;
  previousHost: Host | undefined;
  reactionHostId: string | null;
  playbackProgress: number;
  canPrev: boolean;
  canNext: boolean;
  readyCount: number;
  failedCount: number;
  inFlightCount: number;
  usedFallbackAudio: boolean;
  fallbackReadyCount: number;
  primaryReadyCount: number;
  primaryCircuitOpen: boolean;
  longQuotaExhausted: boolean;
  audioSourceSummary: EpisodeAudioSourceSummary;
  cooldownActive: boolean;
  cooldownRemainingMs: number;
  currentSegmentState: SegmentQueueStatus;
  currentSegmentHasAudio: boolean;
  currentSegmentFailed: boolean;
  currentSegmentRetryable: boolean;
  currentSegmentFailureClass: SegmentFailureClass | null;
  currentSegmentManualRetryAllowed: boolean;
  currentSegmentManualRetryDisabled: boolean;
  currentSegmentRetryDisabledReason: RetryDisabledReason | null;
  currentSegmentRetryLabel: string;
  notice: string | null;
  liveAnnouncement: string | null;
  segments: ReadonlyArray<SegmentQueueEntryView>;
  metrics: {
    providerRequestCount: number;
    cacheHitCount: number;
    maxObservedConcurrency: number;
    minObservedRequestIntervalMs: number | null;
    lastRequestStartedAtMs: number | null;
    rateLimitCount: number;
    completedTurnsCount: number;
  };
}

export interface EpisodeAudioQueueController {
  getSnapshot: () => EpisodeAudioQueueSnapshot;
  subscribe: (listener: (snapshot: EpisodeAudioQueueSnapshot) => void) => () => void;
  startPreparation: () => void;
  cancelPreparation: () => void;
  startPodcast: () => void;
  startWithCaptionsAndAvailableAudio: () => void;
  retryPreparation: () => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  previous: () => void;
  next: () => void;
  restart: () => void;
  replay: () => void;
  retryCurrentSegment: () => void;
  skipCurrentSegment: () => void;
  continueWithTimedCaptions: () => void;
  retryHostedAudio: () => void;
  refreshCooldownDisplay: () => void;
  dispose: () => void;
}

interface InternalSegmentEntry {
  segment: DialogueSegment;
  hostRole: HostRole | null;
  cacheKey: string;
  status: SegmentQueueStatus;
  objectUrl: string | null;
  audioSource: "primary" | "fallback" | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  failureClass: SegmentFailureClass | null;
  retryable: boolean;
  retryAfterMs: number | null;
  capacityRetriesUsed: number;
  manualRetriesUsedInCycle: number;
  lastFailureAt: number | null;
  requestAttempts: number;
  generationStartedAt: number | null;
  generationCompletedAt: number | null;
}

function hashTextFnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function buildSegmentCacheKey(
  episodeId: string,
  segment: DialogueSegment,
  hostRole: HostRole | "unknown",
): string {
  return `${episodeId}:${segment.id}:${segment.speakerId}:${hostRole}:${hashTextFnv1a(segment.text)}`;
}

/** Builds a deterministic idle snapshot matching server/initial client hydration. */
export function buildIdleEpisodeSnapshot(
  episode: Episode,
  options?: { minRequestIntervalMs?: number | string | null },
): EpisodeAudioQueueSnapshot {
  const orderedSegments = [...episode.segments].sort((a, b) => a.order - b.order);
  const hostsById = new Map<string, Host>(episode.hosts.map((h) => [h.id, h]));
  const currentSegment = orderedSegments[0];
  const activeSpeakerId = currentSegment?.speakerId ?? "";
  const activeHost = hostsById.get(activeSpeakerId);
  const initialBufferTarget = Math.min(INITIAL_AUDIO_BUFFER_SIZE, orderedSegments.length);
  const resolvedIntervalMs = resolveTtsRequestIntervalMs(options?.minRequestIntervalMs);

  return {
    episodeId: episode.id,
    replayCycle: 0,
    audioPreparationStatus: "idle",
    hasStartedPodcast: false,
    initialBufferTarget,
    initialBufferReadyCount: 0,
    activePreparingTurnNumber: initialBufferTarget > 0 ? 1 : null,
    canStartPodcast: false,
    canStartPartialPodcast: false,
    canRetryPreparation: false,
    preparationMessage: "Preparing Kuromate voices before starting playback.",
    minRequestIntervalMs: resolvedIntervalMs,
    currentIndex: 0,
    totalSegments: orderedSegments.length,
    status: "idle",
    stageStatus: "idle",
    audioMode: "hosted",
    outageState: "none",
    isHostedAudioPlaying: false,
    isTimedFallbackActive: false,
    activeSpeakerId,
    activeHost,
    currentSegment,
    previousSegment: null,
    previousHost: undefined,
    reactionHostId: null,
    playbackProgress: orderedSegments.length > 0 ? Math.round((1 / orderedSegments.length) * 100) : 0,
    canPrev: false,
    canNext: orderedSegments.length > 1,
    readyCount: 0,
    failedCount: 0,
    inFlightCount: 0,
    usedFallbackAudio: false,
    fallbackReadyCount: 0,
    primaryReadyCount: 0,
    primaryCircuitOpen: false,
    longQuotaExhausted: false,
    audioSourceSummary: "pending",
    cooldownActive: false,
    cooldownRemainingMs: 0,
    currentSegmentState: "idle",
    currentSegmentHasAudio: false,
    currentSegmentFailed: false,
    currentSegmentRetryable: false,
    currentSegmentFailureClass: null,
    currentSegmentManualRetryAllowed: false,
    currentSegmentManualRetryDisabled: false,
    currentSegmentRetryDisabledReason: null,
    currentSegmentRetryLabel: "Retry voice",
    notice: "Preparing opening Kuromate voices.",
    liveAnnouncement: null,
    segments: orderedSegments.map((seg) => {
      const host = hostsById.get(seg.speakerId);
      const role = host?.role ?? "unknown";
      return {
        segmentId: seg.id,
        speakerId: seg.speakerId,
        order: seg.order,
        cacheKey: buildSegmentCacheKey(episode.id, seg, role),
        status: "idle",
        hasCachedAudio: false,
        audioSource: null,
        durationMs: null,
        errorCode: null,
        errorMessage: null,
        failureClass: null,
        failureCategory: null,
        retryable: false,
        retryAfterMs: null,
        requestAttempts: 0,
        lastFailureAt: null,
        manualRetriesUsedInCycle: 0,
        manualRetryAllowed: false,
        manualRetryAvailable: false,
        generationStartedAt: null,
        generationCompletedAt: null,
      };
    }),
    metrics: {
      providerRequestCount: 0,
      cacheHitCount: 0,
      maxObservedConcurrency: 0,
      minObservedRequestIntervalMs: null,
      lastRequestStartedAtMs: null,
      rateLimitCount: 0,
      completedTurnsCount: 0,
    },
  };
}

const RECOVERABLE_FAILURE_CLASSES = new Set<SegmentFailureClass>([
  "capacity",
  "timeout",
  "network",
  "audio",
]);

function isRecoverableFailureClass(failureClass: SegmentFailureClass | null): boolean {
  return failureClass !== null && RECOVERABLE_FAILURE_CLASSES.has(failureClass);
}

function classifyFailureResult(
  res: Extract<FetchSegmentAudioResult, { ok: false }>,
): { failureClass: SegmentFailureClass; retryable: boolean } {
  if (res.errorCode === "TTS_NOT_CONFIGURED") {
    return { failureClass: "configuration", retryable: false };
  }
  if (res.errorCode === "TTS_PROVIDER_UNAVAILABLE" && !res.retryable) {
    return { failureClass: "configuration", retryable: false };
  }
  const isAuthFailure =
    res.errorCode === "TTS_GENERATION_FAILED" &&
    !res.retryable &&
    (res.httpStatus === 401 ||
      res.httpStatus === 403 ||
      /credential|key|auth/i.test(res.message));
  if (isAuthFailure) {
    return { failureClass: "auth", retryable: false };
  }
  if (res.errorCode === "INVALID_TTS_INPUT") {
    return { failureClass: "invalid", retryable: false };
  }
  if (res.errorCode === "TTS_GENERATION_FAILED" && !res.retryable) {
    return {
      failureClass: /safety|prohibited|blocklist|content_policy|content safety/i.test(res.message)
        ? "safety"
        : "unknown",
      retryable: false,
    };
  }
  if (res.isNetworkError) {
    return { failureClass: "network", retryable: true };
  }
  if (res.errorCode === "TTS_TIMEOUT") {
    return { failureClass: "timeout", retryable: true };
  }
  if (res.errorCode === "TTS_RATE_LIMITED") {
    return { failureClass: "capacity", retryable: true };
  }
  if (res.errorCode === "TTS_PROVIDER_UNAVAILABLE") {
    return { failureClass: "capacity", retryable: res.retryable };
  }
  if (res.errorCode === "TTS_AUDIO_INVALID") {
    return { failureClass: "audio", retryable: res.retryable };
  }
  return {
    failureClass: res.retryable ? "capacity" : "unknown",
    retryable: res.retryable,
  };
}

function isValidClientSegment(segment: DialogueSegment, host: Host | undefined): host is Host {
  if (!host || !VALID_ROLES.has(host.role)) {
    return false;
  }
  if (!SAFE_ID_REGEX.test(segment.id) || !SAFE_ID_REGEX.test(segment.speakerId)) {
    return false;
  }
  const trimmed = segment.text.trim();
  return trimmed.length >= 1 && trimmed.length <= 320;
}

const defaultTimers: TimerDriver = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Authoritative client orchestration engine for WP-011 full-episode audio playback:
 * prepares the opening 2-clip buffer before start, enforces concurrency 1 and >=1500ms
 * request pacing via one scheduler, treats 429s as non-fatal cooldowns, keeps captions synced,
 * recovers transient failures across Replay/Retry, and revokes every object URL once.
 */
export function createEpisodeAudioQueueEngine(
  episode: Episode,
  deps: EpisodeAudioQueueDeps,
): EpisodeAudioQueueController {
  const timers = deps.timers ?? defaultTimers;
  const now = deps.now ?? Date.now;
  const effectiveMinIntervalMs = resolveTtsRequestIntervalMs(deps.minRequestIntervalMs);
  const urlPool: EpisodeObjectUrlPool = createEpisodeObjectUrlPool(deps.urlApi);
  const sessionCircuit = deps.sessionCircuit ?? createTtsSessionCircuit();

  const orderedSegments = [...episode.segments].sort((a, b) => a.order - b.order);
  const hostsById = new Map<string, Host>(episode.hosts.map((h) => [h.id, h]));
  const initialBufferTarget = Math.min(INITIAL_AUDIO_BUFFER_SIZE, orderedSegments.length);

  const entries: InternalSegmentEntry[] = orderedSegments.map((segment) => {
    const host = hostsById.get(segment.speakerId);
    const role = host?.role ?? null;
    return {
      segment,
      hostRole: role,
      cacheKey: buildSegmentCacheKey(episode.id, segment, role ?? "unknown"),
      status: "idle",
      objectUrl: null,
      audioSource: null,
      durationMs: null,
      errorCode: null,
      errorMessage: null,
      failureClass: null,
      retryable: false,
      retryAfterMs: null,
      capacityRetriesUsed: 0,
      manualRetriesUsedInCycle: 0,
      lastFailureAt: null,
      requestAttempts: 0,
      generationStartedAt: null,
      generationCompletedAt: null,
    };
  });

  const listeners = new Set<(snapshot: EpisodeAudioQueueSnapshot) => void>();
  const inFlightControllers = new Map<number, AbortController>();

  let disposed = false;
  let sessionToken = 1;
  let playbackToken = 1;
  let replayCycle = 0;
  let replayCycleToken = 1;
  let audioPreparationStatus: AudioPreparationStatus = "idle";
  let hasStartedPodcast = false;
  let currentIndex = 0;
  let targetedRetryActiveIndex: number | null = null;
  let targetedRetryAutoPlay = false;
  let status: EpisodePlaybackStatus = "idle";
  let audioMode: EpisodeAudioMode = "hosted";
  let outageState: QueueOutageState = "none";
  let reactionHostId: string | null = null;
  let pausedTimeSec = 0;
  let loadedSegmentIndex: number | null = null;
  let consecutiveNonCapacityErrors = 0;

  let lastProviderRequestStartedAt: number | null = null;
  let minObservedRequestIntervalMs: number | null = null;
  let pacingTimer: unknown = null;
  let pacingTargetAtMs = 0;

  let cooldownUntilMs = 0;
  let cooldownTimer: unknown = null;
  let fallbackTimer: unknown = null;
  let reactStartTimer: unknown = null;
  let reactEndTimer: unknown = null;

  let providerRequestCount = 0;
  let cacheHitCount = 0;
  let maxObservedConcurrency = 0;
  let rateLimitCount = 0;
  let completedTurnsCount = 0;

  let notice: string | null = null;
  let liveAnnouncement: string | null = null;
  let lastAnnouncement = "";

  function setAnnouncement(message: string | null) {
    if (!message || message === lastAnnouncement) {
      return;
    }
    lastAnnouncement = message;
    liveAnnouncement = message;
  }

  function clearFallbackTimer() {
    if (fallbackTimer !== null) {
      timers.clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  }

  function clearReactionTimers() {
    if (reactStartTimer !== null) {
      timers.clearTimeout(reactStartTimer);
      reactStartTimer = null;
    }
    if (reactEndTimer !== null) {
      timers.clearTimeout(reactEndTimer);
      reactEndTimer = null;
    }
    reactionHostId = null;
  }

  function clearCooldownTimer() {
    if (cooldownTimer !== null) {
      timers.clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
    cooldownUntilMs = 0;
  }

  function clearPacingTimer() {
    if (pacingTimer !== null) {
      timers.clearTimeout(pacingTimer);
      pacingTimer = null;
    }
    pacingTargetAtMs = 0;
  }

  function stopActivePlaybackOnly() {
    playbackToken += 1;
    clearFallbackTimer();
    clearReactionTimers();
    deps.audioDriver.stop();
    pausedTimeSec = 0;
    loadedSegmentIndex = null;
  }

  function countInitialBufferReady(): number {
    let count = 0;
    for (let i = 0; i < initialBufferTarget; i += 1) {
      if (entries[i]?.objectUrl !== null) {
        count += 1;
      }
    }
    return count;
  }

  function evaluatePreparationStatus() {
    if (hasStartedPodcast || audioPreparationStatus === "cancelled" || audioMode === "timed-fallback") {
      return;
    }
    if (initialBufferTarget === 0) {
      audioPreparationStatus = "idle";
      return;
    }

    const bufReady = countInitialBufferReady();
    if (bufReady >= initialBufferTarget) {
      audioPreparationStatus = "ready";
      notice =
        initialBufferTarget === 1
          ? "1 opening voice ready."
          : `${initialBufferTarget} opening voices ready. Later voices will prepare during playback.`;
      setAnnouncement("Your Kuromates are ready.");
      return;
    }

    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > now();
    const e0 = entries[0];
    const e1 = entries[1];

    if (initialBufferTarget === 1) {
      if (e0?.status === "failed" || outageState !== "none") {
        audioPreparationStatus = "unavailable";
        notice =
          e0?.errorMessage ?? "Voice unavailable right now. Continue with timed captions or return to the form.";
      } else if (cooldownActive) {
        audioPreparationStatus = "cooldown";
        notice = "Voice generation is briefly paused.";
      } else {
        audioPreparationStatus = "preparing";
      }
      return;
    }

    if (!e0 || e0.objectUrl === null) {
      if (e0?.status === "failed" || outageState !== "none") {
        audioPreparationStatus = "unavailable";
        notice =
          e0?.errorMessage ??
          "Opening Kuromate voice could not be generated. Continue with timed captions or return to the form.";
      } else if (cooldownActive) {
        audioPreparationStatus = "cooldown";
        notice = "Voice generation is briefly paused.";
      } else {
        audioPreparationStatus = "preparing";
      }
      return;
    }

    if (e1 && (e1.status === "failed" || outageState !== "none")) {
      audioPreparationStatus = "partial";
      notice =
        "One voice is ready. Voice 2 is temporarily unavailable—start with captions and available audio.";
      setAnnouncement("Partial opening voices ready.");
    } else if (cooldownActive) {
      audioPreparationStatus = "cooldown";
      notice = "One voice is ready. Waiting briefly for the next turn.";
    } else {
      audioPreparationStatus = "preparing";
    }
  }

  function mapStageStatus(): PlaybackStatus {
    switch (status) {
      case "playing":
        return "playing";
      case "preparing":
      case "paused":
      case "autoplay-blocked":
        return "paused";
      case "complete":
        return "complete";
      case "idle":
      default:
        return "idle";
    }
  }

  function computeNotice(): string | null {
    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > now();
    if (entries[currentIndex]?.status === "failed" && notice) {
      return notice;
    }
    if (cooldownActive && hasStartedPodcast && outageState === "none" && audioMode === "hosted") {
      const secs = Math.max(1, Math.ceil((cooldownUntilMs - now()) / 1000));
      return `Voice generation is briefly paused. Preparing more voices in ${secs}s.`;
    }
    if (notice) {
      return notice;
    }
    const readyCount = entries.filter((e) => e.objectUrl !== null).length;
    if (audioMode === "timed-fallback") {
      return "Timed captions mode — hosted audio paused while captions and visuals remain active.";
    }
    if (!hasStartedPodcast) {
      if (audioPreparationStatus === "ready") {
        return initialBufferTarget === 1
          ? "1 opening voice ready."
          : `${initialBufferTarget} opening voices ready. Later voices will prepare during playback.`;
      }
      if (audioPreparationStatus === "partial") {
        return "One opening voice is ready. Voice 2 is unavailable right now.";
      }
      return "Creating the first voices so the conversation can begin smoothly.";
    }
    if (status === "preparing") {
      const hostName = entries[currentIndex]
        ? hostsById.get(entries[currentIndex].segment.speakerId)?.name
        : undefined;
      return hostName
        ? `Preparing ${hostName}’s voice — captions advance automatically once audio plays.`
        : "Preparing Kuromate audio — captions advance automatically once audio plays.";
    }
    if (status === "autoplay-blocked") {
      return "Tap to continue audio — your browser paused automatic playback between turns.";
    }
    if (cooldownActive) {
      const secs = Math.max(1, Math.ceil((cooldownUntilMs - now()) / 1000));
      return `Voice generation is briefly paused. Preparing more voices in ${secs}s.`;
    }
    if (status === "playing") {
      return `Hosted Kuromate audio active — ${readyCount} of ${entries.length} turns ready.`;
    }
    return "Hosted Kuromate audio ready — press Play to hear Kuromates speak in sequence.";
  }

  function isEntryManuallyRetryable(entry: InternalSegmentEntry | undefined): boolean {
    if (!entry || entry.objectUrl !== null) {
      return false;
    }
    if (outageState === "config_error" || outageState === "auth_error") {
      return false;
    }
    if (entry.status !== "failed") {
      return false;
    }
    return (
      entry.retryable &&
      isRecoverableFailureClass(entry.failureClass) &&
      entry.manualRetriesUsedInCycle < MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE
    );
  }

  function evaluateCurrentRetryUi(
    entry: InternalSegmentEntry | undefined,
    idx: number,
    cooldownActive: boolean,
    cooldownRemainingMs: number,
  ): {
    allowed: boolean;
    disabled: boolean;
    disabledReason: RetryDisabledReason | null;
    label: string;
  } {
    const hostName = entry ? (hostsById.get(entry.segment.speakerId)?.name ?? "Kuromate") : "Kuromate";
    if (!entry || entry.objectUrl !== null) {
      return { allowed: false, disabled: false, disabledReason: null, label: "Retry voice" };
    }
    if (inFlightControllers.has(idx) || entry.status === "generating" || targetedRetryActiveIndex === idx) {
      return {
        allowed: false,
        disabled: true,
        disabledReason: entry.status === "generating" ? "generating" : "in_flight",
        label: `Preparing ${hostName}’s voice`,
      };
    }
    if (outageState === "config_error" || outageState === "auth_error") {
      return { allowed: false, disabled: true, disabledReason: "permanent", label: "Retry voice" };
    }
    if (entry.failureClass !== null && !isRecoverableFailureClass(entry.failureClass)) {
      return { allowed: false, disabled: true, disabledReason: "permanent", label: "Retry voice" };
    }
    if (entry.status === "failed" && !entry.retryable) {
      return { allowed: false, disabled: true, disabledReason: "permanent", label: "Retry voice" };
    }
    if (entry.manualRetriesUsedInCycle >= MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE) {
      return { allowed: false, disabled: true, disabledReason: "limit_reached", label: "Retry voice" };
    }
    const canAttemptManual =
      entry.status === "failed" ||
      entry.status === "retry-wait" ||
      entry.status === "skipped" ||
      entry.status === "cancelled";
    if (!canAttemptManual) {
      return { allowed: false, disabled: false, disabledReason: null, label: "Retry voice" };
    }
    if (cooldownActive) {
      const secs = Math.max(1, Math.ceil(cooldownRemainingMs / 1000));
      return {
        allowed: true,
        disabled: true,
        disabledReason: "cooldown",
        label: `Retry available in ${secs}s`,
      };
    }
    if (inFlightControllers.size >= MAX_TTS_CONCURRENCY) {
      return {
        allowed: true,
        disabled: true,
        disabledReason: "in_flight",
        label: "Retry voice",
      };
    }
    return {
      allowed: true,
      disabled: false,
      disabledReason: null,
      label: "Retry voice",
    };
  }

  function buildPreparationMessage(
    bufReady: number,
    activePrepTurn: number | null,
    cooldownActive: boolean,
    cooldownRemainingMs: number,
  ): string | null {
    const secs = cooldownActive ? Math.max(1, Math.ceil(cooldownRemainingMs / 1000)) : 0;
    switch (audioPreparationStatus) {
      case "idle":
        return "Preparing Kuromate voices before starting playback.";
      case "preparing":
        if (activePrepTurn !== null) {
          return `Preparing voice ${activePrepTurn} of ${initialBufferTarget}`;
        }
        return "Preparing the opening voices";
      case "cooldown":
        if (bufReady === 1) {
          return secs > 0
            ? `One voice is ready. Waiting briefly for the next turn. Preparing more voices in ${secs}s.`
            : "One voice is ready. Waiting briefly for the next turn.";
        }
        return secs > 0
          ? `Voice generation is briefly paused. Preparing more voices in ${secs}s.`
          : "Voice generation is briefly paused.";
      case "ready":
        return initialBufferTarget === 1
          ? "1 opening voice ready."
          : `${initialBufferTarget} opening voices ready. Later voices will prepare during playback.`;
      case "partial":
        return "1 opening voice ready. Voice 2 is temporarily unavailable—you can start with captions and available audio.";
      case "unavailable":
        return (
          entries[0]?.errorMessage ??
          "Hosted voice unavailable. Continue with timed captions or return to the form."
        );
      case "cancelled":
      default:
        return "Voice preparation cancelled.";
    }
  }

  function buildSnapshot(): EpisodeAudioQueueSnapshot {
    const totalSegments = entries.length;
    const currentEntry = entries[currentIndex];
    const currentSegment = currentEntry?.segment;
    const previousSegment = currentIndex > 0 ? entries[currentIndex - 1]?.segment ?? null : null;
    const activeSpeakerId = currentSegment?.speakerId ?? "";
    const activeHost = hostsById.get(activeSpeakerId);
    const previousHost = previousSegment ? hostsById.get(previousSegment.speakerId) : undefined;
    const readyCount = entries.filter((e) => e.objectUrl !== null).length;
    const primaryReadyCount = entries.filter(
      (e) => e.objectUrl !== null && e.audioSource !== "fallback",
    ).length;
    const fallbackReadyCount = entries.filter(
      (e) => e.objectUrl !== null && e.audioSource === "fallback",
    ).length;
    const usedFallbackAudio = fallbackReadyCount > 0;
    const currentNowMs = now();
    const primaryCircuitOpen = sessionCircuit.isPrimaryOpen(currentNowMs);
    const longQuotaExhausted = outageState === "quota_exhausted";
    const audioSourceSummary: EpisodeAudioSourceSummary =
      audioMode === "timed-fallback"
        ? "caption-only"
        : primaryReadyCount > 0 && fallbackReadyCount > 0
          ? "mixed"
          : fallbackReadyCount > 0
            ? "fallback"
            : primaryReadyCount > 0
              ? "primary"
              : outageState === "quota_exhausted" ||
                  outageState === "config_error" ||
                  outageState === "auth_error"
                ? "caption-only"
                : "pending";
    const failedCount = entries.filter((e) => e.status === "failed").length;
    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > currentNowMs;
    const cooldownRemainingMs = cooldownActive ? Math.max(0, cooldownUntilMs - currentNowMs) : 0;
    const retryUi = evaluateCurrentRetryUi(currentEntry, currentIndex, cooldownActive, cooldownRemainingMs);

    const initialBufferReadyCount = countInitialBufferReady();
    const activePreparingTurnNumber =
      !hasStartedPodcast &&
      (audioPreparationStatus === "preparing" || audioPreparationStatus === "cooldown") &&
      initialBufferReadyCount < initialBufferTarget
        ? Math.min(initialBufferTarget, initialBufferReadyCount + 1)
        : null;
    const canStartPodcast =
      !hasStartedPodcast &&
      audioPreparationStatus === "ready" &&
      initialBufferTarget > 0 &&
      initialBufferReadyCount >= initialBufferTarget &&
      entries[0]?.objectUrl !== null;
    const canStartPartialPodcast =
      !hasStartedPodcast &&
      audioPreparationStatus === "partial" &&
      entries[0]?.objectUrl !== null;
    const canRetryPreparation =
      !hasStartedPodcast &&
      outageState !== "config_error" &&
      outageState !== "auth_error" &&
      ((audioPreparationStatus === "unavailable" &&
        entries[0]?.objectUrl === null &&
        isRecoverableFailureClass(entries[0]?.failureClass ?? null)) ||
        (audioPreparationStatus === "partial" &&
          entries[1]?.objectUrl === null &&
          isRecoverableFailureClass(entries[1]?.failureClass ?? null)));

    const isHostedAudioPlaying =
      hasStartedPodcast &&
      status === "playing" &&
      audioMode === "hosted" &&
      currentEntry?.status === "playing" &&
      currentEntry?.objectUrl !== null;
    const isTimedFallbackActive =
      hasStartedPodcast && status === "playing" && !isHostedAudioPlaying;

    return {
      episodeId: episode.id,
      replayCycle,
      audioPreparationStatus,
      hasStartedPodcast,
      initialBufferTarget,
      initialBufferReadyCount,
      activePreparingTurnNumber,
      canStartPodcast,
      canStartPartialPodcast,
      canRetryPreparation,
      preparationMessage: buildPreparationMessage(
        initialBufferReadyCount,
        activePreparingTurnNumber,
        cooldownActive,
        cooldownRemainingMs,
      ),
      minRequestIntervalMs: effectiveMinIntervalMs,
      currentIndex,
      totalSegments,
      status,
      stageStatus: mapStageStatus(),
      audioMode,
      outageState,
      isHostedAudioPlaying,
      isTimedFallbackActive,
      activeSpeakerId,
      activeHost,
      currentSegment,
      previousSegment,
      previousHost,
      reactionHostId,
      playbackProgress: totalSegments > 0 ? Math.round(((currentIndex + 1) / totalSegments) * 100) : 0,
      canPrev: currentIndex > 0,
      canNext: currentIndex < Math.max(0, totalSegments - 1),
      readyCount,
      failedCount,
      inFlightCount: inFlightControllers.size,
      usedFallbackAudio,
      fallbackReadyCount,
      primaryReadyCount,
      primaryCircuitOpen,
      longQuotaExhausted,
      audioSourceSummary,
      cooldownActive,
      cooldownRemainingMs,
      currentSegmentState: currentEntry?.status ?? "idle",
      currentSegmentHasAudio: currentEntry?.objectUrl !== null && currentEntry?.objectUrl !== undefined,
      currentSegmentFailed: currentEntry?.status === "failed",
      currentSegmentRetryable: currentEntry?.retryable ?? false,
      currentSegmentFailureClass: currentEntry?.failureClass ?? null,
      currentSegmentManualRetryAllowed: retryUi.allowed,
      currentSegmentManualRetryDisabled: retryUi.disabled,
      currentSegmentRetryDisabledReason: retryUi.disabledReason,
      currentSegmentRetryLabel: retryUi.label,
      notice: computeNotice(),
      liveAnnouncement,
      segments: entries.map((entry) => ({
        segmentId: entry.segment.id,
        speakerId: entry.segment.speakerId,
        order: entry.segment.order,
        cacheKey: entry.cacheKey,
        status: entry.status,
        hasCachedAudio: entry.objectUrl !== null,
        audioSource: entry.audioSource,
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        failureClass: entry.failureClass,
        failureCategory:
          entry.failureClass === null
            ? null
            : isRecoverableFailureClass(entry.failureClass)
              ? "transient"
              : "permanent",
        retryable: entry.retryable,
        retryAfterMs: entry.retryAfterMs,
        requestAttempts: entry.requestAttempts,
        lastFailureAt: entry.lastFailureAt,
        manualRetriesUsedInCycle: entry.manualRetriesUsedInCycle,
        manualRetryAllowed: isEntryManuallyRetryable(entry),
        manualRetryAvailable: isEntryManuallyRetryable(entry),
        generationStartedAt: entry.generationStartedAt,
        generationCompletedAt: entry.generationCompletedAt,
      })),
      metrics: {
        providerRequestCount,
        cacheHitCount,
        maxObservedConcurrency,
        minObservedRequestIntervalMs,
        lastRequestStartedAtMs: lastProviderRequestStartedAt,
        rateLimitCount,
        completedTurnsCount,
      },
    };
  }

  let currentSnapshot = buildSnapshot();

  function emit() {
    if (disposed) return;
    currentSnapshot = buildSnapshot();
    for (const listener of listeners) {
      listener(currentSnapshot);
    }
  }

  function scheduleReactionsForSegment(index: number, token: number) {
    clearReactionTimers();
    const seg = entries[index]?.segment;
    if (!seg || seg.emotion !== "reacting") {
      return;
    }

    const prevSeg = index > 0 ? entries[index - 1]?.segment : null;
    const candidateHost =
      (prevSeg && prevSeg.speakerId !== seg.speakerId
        ? hostsById.get(prevSeg.speakerId)
        : undefined) ?? episode.hosts.find((host) => host.id !== seg.speakerId);

    if (!candidateHost) {
      return;
    }

    const targetHostId = candidateHost.id;
    reactStartTimer = timers.setTimeout(() => {
      if (disposed || playbackToken !== token || status !== "playing") return;
      reactionHostId = targetHostId;
      emit();
    }, REACTION_START_DELAY_MS);

    reactEndTimer = timers.setTimeout(() => {
      if (disposed || playbackToken !== token || status !== "playing") return;
      reactionHostId = null;
      emit();
    }, REACTION_END_DELAY_MS);
  }

  function completeEpisode() {
    stopActivePlaybackOnly();
    clearPacingTimer();
    clearCooldownTimer();
    abortBackgroundRequests();
    status = "complete";
    notice = "Episode complete — Replay reuses generated Kuromate voices from memory.";
    setAnnouncement("Episode complete.");
    emit();
  }

  function handleCurrentTurnFinished(token: number, expectedIndex: number) {
    if (disposed || token !== playbackToken || expectedIndex !== currentIndex || status !== "playing") {
      return;
    }

    const entry = entries[expectedIndex];
    if (entry && entry.objectUrl) {
      entry.status = "completed";
    }
    completedTurnsCount += 1;

    if (expectedIndex >= entries.length - 1) {
      completeEpisode();
      return;
    }

    currentIndex = expectedIndex + 1;
    pausedTimeSec = 0;
    loadedSegmentIndex = null;
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function startTimedFallbackTurn(index: number, explicitMessage: string | null) {
    clearFallbackTimer();
    const entry = entries[index];
    if (!entry) return;

    const token = ++playbackToken;
    status = "playing";
    notice = explicitMessage;
    setAnnouncement(
      explicitMessage
        ? `Voice unavailable for turn ${index + 1}. Continuing with captions.`
        : null,
    );
    scheduleReactionsForSegment(index, token);

    const fallbackDurationMs = getSegmentDurationMs(entry.segment);
    fallbackTimer = timers.setTimeout(() => {
      handleCurrentTurnFinished(token, index);
    }, fallbackDurationMs);

    emit();
  }

  function markActiveClipsIdleAfterPause() {
    for (const entry of entries) {
      if (entry.status === "playing") {
        entry.status = "paused";
      }
    }
  }

  function playCachedEntry(index: number, startTimeSec: number) {
    const entry = entries[index];
    if (!entry || !entry.objectUrl) {
      return;
    }

    clearFallbackTimer();
    clearReactionTimers();

    const token = ++playbackToken;
    const session = sessionToken;
    const targetUrl = entry.objectUrl;
    loadedSegmentIndex = index;
    pausedTimeSec = startTimeSec;

    for (const item of entries) {
      if (item.status === "playing" && item !== entry) {
        item.status = item.objectUrl ? "ready" : "idle";
      }
    }

    entry.status = "playing";
    status = "playing";
    notice = null;
    setAnnouncement(index === 0 ? "Playing hosted Kuromate audio." : null);
    emit();

    void deps.audioDriver
      .loadAndPlay(targetUrl, startTimeSec, {
        onLoadedMetadata: (durationMs) => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
          if (durationMs !== null && durationMs > 0) {
            entry.durationMs = entry.durationMs ?? durationMs;
            emit();
          }
        },
        onCanPlay: () => {
          // Readiness verified cleanly.
        },
        onPlay: () => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
          scheduleReactionsForSegment(index, token);
        },
        onPause: () => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
        },
        onEnded: () => {
          handleCurrentTurnFinished(token, index);
        },
        onDecodeError: () => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
          handleSegmentPlaybackDecodeFailure(index);
        },
      })
      .then((outcome) => {
        if (disposed || session !== sessionToken || token !== playbackToken) {
          return;
        }
        if (outcome.ok) {
          pumpQueue();
          return;
        }
        if (outcome.reason === "autoplay_blocked") {
          clearFallbackTimer();
          clearReactionTimers();
          entry.status = "paused";
          status = "autoplay-blocked";
          notice = "Tap to continue audio — your browser blocked automatic playback for this turn.";
          setAnnouncement("Tap to continue audio.");
          emit();
          return;
        }
        if (outcome.reason === "decode_error") {
          handleSegmentPlaybackDecodeFailure(index);
        }
      });
  }

  function handleSegmentPlaybackDecodeFailure(index: number) {
    const entry = entries[index];
    if (!entry) return;
    stopActivePlaybackOnly();
    urlPool.revoke(entry.cacheKey);
    entry.objectUrl = null;
    entry.audioSource = null;
    entry.status = "failed";
    entry.errorCode = "TTS_AUDIO_INVALID";
    entry.errorMessage = "Could not decode hosted Kuromate audio in this browser.";
    entry.failureClass = "audio";
    entry.retryable = true;
    entry.lastFailureAt = now();
    if (targetedRetryActiveIndex === index) {
      targetedRetryActiveIndex = null;
      targetedRetryAutoPlay = false;
    }

    if (audioMode === "hosted" && hasStartedPodcast) {
      startTimedFallbackTurn(index, "Voice unavailable for this turn. Continuing with captions.");
      pumpQueue();
    } else {
      evaluatePreparationStatus();
      emit();
    }
  }

  function activateCurrentSegmentForPlayback() {
    const entry = entries[currentIndex];
    if (!entry) {
      return;
    }

    if (audioMode === "timed-fallback") {
      startTimedFallbackTurn(currentIndex, null);
      return;
    }

    if (entry.objectUrl) {
      cacheHitCount += 1;
      playCachedEntry(currentIndex, pausedTimeSec);
      pumpQueue();
      return;
    }

    if (entry.status === "skipped" || entry.status === "cancelled") {
      entry.status = "idle";
      entry.errorCode = null;
      entry.errorMessage = null;
      entry.failureClass = null;
      entry.retryAfterMs = null;
    }

    if (entry.status === "failed") {
      if (outageState !== "none") {
        stopActivePlaybackOnly();
        status = "paused";
        notice =
          entry.errorMessage ??
          "Hosted Kuromate voices are unavailable right now. Continue with timed captions or retry hosted audio.";
        setAnnouncement("Hosted voices unavailable.");
        emit();
        return;
      }
      startTimedFallbackTurn(currentIndex, "Voice unavailable for this turn. Continuing with captions.");
      pumpQueue();
      return;
    }

    // Current turn is missing audio: pause playback into preparing state and prioritize currentIndex.
    playbackToken += 1;
    clearFallbackTimer();
    clearReactionTimers();
    status = "preparing";
    if (entry.status === "idle") {
      entry.status = "queued";
    }
    const hostName = hostsById.get(entry.segment.speakerId)?.name;
    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > now();
    if (cooldownActive) {
      const secs = Math.max(1, Math.ceil((cooldownUntilMs - now()) / 1000));
      notice = `Voice generation is briefly paused. Preparing more voices in ${secs}s.`;
    } else {
      notice = hostName
        ? `Preparing ${hostName}’s voice…`
        : "Preparing Kuromate audio for the current turn…";
    }
    setAnnouncement(hostName ? `Preparing ${hostName}’s voice.` : "Preparing Kuromate audio.");
    emit();
    pumpQueue();
  }

  function scheduleSharedCooldown(delayMs: number) {
    if (disposed) return;
    const targetUntil = now() + delayMs;
    if (cooldownTimer !== null && targetUntil <= cooldownUntilMs) {
      return;
    }
    if (cooldownTimer !== null) {
      timers.clearTimeout(cooldownTimer);
      cooldownTimer = null;
    }
    cooldownUntilMs = targetUntil;
    const remaining = Math.max(0, targetUntil - now());

    cooldownTimer = timers.setTimeout(() => {
      cooldownTimer = null;
      cooldownUntilMs = 0;
      if (disposed) return;

      for (const item of entries) {
        if (item.status === "retry-wait") {
          item.status = "queued";
        }
      }

      if (!hasStartedPodcast) {
        if (outageState === "none" && audioPreparationStatus !== "cancelled") {
          evaluatePreparationStatus();
        }
        emit();
        pumpQueue();
        return;
      }

      if (
        outageState === "none" &&
        (status === "preparing" || status === "playing" || targetedRetryActiveIndex !== null)
      ) {
        notice = null;
        emit();
        pumpQueue();
      } else {
        emit();
      }
    }, remaining);
  }

  function canScheduleAnyProviderWork(): boolean {
    if (disposed || audioMode !== "hosted") {
      return false;
    }
    if (outageState !== "none") {
      return false;
    }
    if (inFlightControllers.size >= MAX_TTS_CONCURRENCY) {
      return false;
    }
    if (cooldownTimer !== null && cooldownUntilMs > now()) {
      return false;
    }
    if (targetedRetryActiveIndex !== null) {
      return true;
    }
    if (!hasStartedPodcast) {
      return audioPreparationStatus === "preparing";
    }
    return status === "preparing" || status === "playing";
  }

  function pickNextCandidateIndex(): number | null {
    if (targetedRetryActiveIndex !== null) {
      const tEntry = entries[targetedRetryActiveIndex];
      if (!tEntry || tEntry.objectUrl !== null || inFlightControllers.has(targetedRetryActiveIndex)) {
        return null;
      }
      return tEntry.status === "idle" || tEntry.status === "queued"
        ? targetedRetryActiveIndex
        : null;
    }

    if (!hasStartedPodcast) {
      for (let idx = 0; idx < initialBufferTarget; idx += 1) {
        const entry = entries[idx];
        if (!entry) continue;
        if (entry.objectUrl !== null) continue;
        if (inFlightControllers.has(idx)) continue;
        if (entry.status === "idle" || entry.status === "queued") {
          return idx;
        }
        // Strictly Turn 1 before Turn 2; never jump to Turn 2 while Turn 1 is retry-waiting or failed.
        if (idx === 0) {
          return null;
        }
      }
      return null;
    }

    const windowEnd = Math.min(entries.length - 1, currentIndex + PREFETCH_LOOKAHEAD);
    for (let idx = currentIndex; idx <= windowEnd; idx += 1) {
      const entry = entries[idx];
      if (!entry || inFlightControllers.has(idx)) continue;
      if (entry.objectUrl !== null) continue;
      if (entry.status === "idle" || entry.status === "queued") {
        return idx;
      }
    }
    return null;
  }

  function abortBackgroundRequests() {
    for (const [idx, controller] of inFlightControllers.entries()) {
      controller.abort();
      inFlightControllers.delete(idx);
      const entry = entries[idx];
      if (entry && entry.status === "generating") {
        entry.status = "cancelled";
      }
    }
  }

  function handleOutageTriggered(kind: Exclude<QueueOutageState, "none">, message: string) {
    outageState = kind;
    clearPacingTimer();
    if (kind !== "provider_outage") {
      clearCooldownTimer();
    }
    for (const item of entries) {
      if (item.status === "retry-wait" || item.status === "queued") {
        item.status = "idle";
      }
    }
    for (const [idx, controller] of inFlightControllers.entries()) {
      controller.abort();
      inFlightControllers.delete(idx);
      const item = entries[idx];
      if (item && item.status === "generating") {
        item.status = "idle";
      }
    }

    if (!hasStartedPodcast) {
      evaluatePreparationStatus();
      emit();
      return;
    }

    if (status === "preparing") {
      stopActivePlaybackOnly();
      status = "paused";
      notice = message;
      setAnnouncement(message);
    } else if (status === "playing") {
      notice = message;
    }
    emit();
  }

  function finalizeVerifiedSegmentSuccess(
    index: number,
    url: string,
    durationMs: number | null,
    audioSource: "primary" | "fallback",
    wasTargetedRetry: boolean,
    shouldAutoPlayTargeted: boolean,
  ) {
    const entry = entries[index];
    if (!entry) return;

    consecutiveNonCapacityErrors = 0;
    entry.objectUrl = url;
    entry.audioSource = audioSource;
    entry.durationMs = durationMs;
    entry.status = "ready";
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.failureClass = null;
    entry.retryable = false;
    entry.retryAfterMs = null;
    entry.generationCompletedAt = now();

    if (!hasStartedPodcast) {
      evaluatePreparationStatus();
      emit();
      pumpQueue();
      return;
    }

    if (wasTargetedRetry && !shouldAutoPlayTargeted) {
      if (index === currentIndex) {
        notice = null;
      }
      emit();
      pumpQueue();
      return;
    }

    if (index === currentIndex && (status === "preparing" || shouldAutoPlayTargeted)) {
      pausedTimeSec = 0;
      playCachedEntry(currentIndex, pausedTimeSec);
      pumpQueue();
      return;
    }

    emit();
    pumpQueue();
  }

  function handleSegmentFetchSuccess(
    index: number,
    res: Extract<FetchSegmentAudioResult, { ok: true }>,
    localSession: number,
    localReplayCycle: number,
    controller: AbortController,
  ) {
    const entry = entries[index];
    if (!entry) {
      inFlightControllers.delete(index);
      return;
    }

    if (res.quotaClass === "long_quota_wait") {
      sessionCircuit.openPrimary(now(), parseRetryAfterRawSeconds(res.retryAfterHeader, now()));
    }

    const audioSource: "primary" | "fallback" = res.fallbackUsed ? "fallback" : "primary";
    const durationMs = res.durationMs;
    const blob = res.blob;
    const wasTargetedRetry = targetedRetryActiveIndex === index;
    const shouldAutoPlayTargeted = wasTargetedRetry && targetedRetryAutoPlay;

    const url = urlPool.set(entry.cacheKey, blob);

    if (!deps.audioDriver.verifyPlayable) {
      inFlightControllers.delete(index);
      if (wasTargetedRetry) {
        targetedRetryActiveIndex = null;
        targetedRetryAutoPlay = false;
      }
      finalizeVerifiedSegmentSuccess(
        index,
        url,
        durationMs,
        audioSource,
        wasTargetedRetry,
        shouldAutoPlayTargeted,
      );
      return;
    }

    void deps.audioDriver.verifyPlayable(url).then((playable) => {
      if (
        disposed ||
        localSession !== sessionToken ||
        localReplayCycle !== replayCycleToken ||
        controller.signal.aborted
      ) {
        inFlightControllers.delete(index);
        urlPool.revoke(entry.cacheKey);
        return;
      }

      inFlightControllers.delete(index);
      if (playable) {
        if (wasTargetedRetry) {
          targetedRetryActiveIndex = null;
          targetedRetryAutoPlay = false;
        }
        finalizeVerifiedSegmentSuccess(
          index,
          url,
          durationMs,
          audioSource,
          wasTargetedRetry,
          shouldAutoPlayTargeted,
        );
        return;
      }

      urlPool.revoke(entry.cacheKey);
      handleSegmentFetchFailure(index, {
        ok: false,
        httpStatus: 502,
        errorCode: "TTS_AUDIO_INVALID",
        message: "Could not verify playable hosted audio in this browser.",
        retryable: true,
      });
    });
  }

  function handleSegmentFetchFailure(
    index: number,
    res: Extract<FetchSegmentAudioResult, { ok: false }>,
  ) {
    const entry = entries[index];
    if (!entry) return;
    entry.generationCompletedAt = now();
    entry.lastFailureAt = now();

    const wasTargetedRetry = targetedRetryActiveIndex === index;
    const wasTargetedPaused = wasTargetedRetry && !targetedRetryAutoPlay;
    if (wasTargetedRetry) {
      targetedRetryActiveIndex = null;
      targetedRetryAutoPlay = false;
    }

    const classified = classifyFailureResult(res);

    if (classified.failureClass === "configuration") {
      entry.status = "failed";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
      entry.failureClass = "configuration";
      entry.retryable = false;
      handleOutageTriggered("config_error", res.message);
      return;
    }

    if (classified.failureClass === "auth") {
      entry.status = "failed";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
      entry.failureClass = "auth";
      entry.retryable = false;
      handleOutageTriggered("auth_error", res.message);
      return;
    }

    const isCapacityError =
      classified.failureClass === "capacity" ||
      classified.failureClass === "timeout" ||
      classified.failureClass === "network";

    if (res.errorCode === "TTS_RATE_LIMITED") {
      rateLimitCount += 1;
    }

    const quotaClassification =
      res.errorCode === "TTS_RATE_LIMITED"
        ? classifyRetryAfter(res.retryAfterHeader, {
            nowMs: now(),
            errorText: res.message,
            quotaClassHint: res.quotaClass,
          })
        : null;

    if (quotaClassification?.quotaClass === "long_quota_wait") {
      sessionCircuit.openPrimary(now(), quotaClassification.rawSeconds);
      clearCooldownTimer();
      entry.status = "failed";
      entry.errorCode = res.errorCode;
      entry.errorMessage =
        "Hosted Kuromate voices have reached today’s limit. You can continue with timed captions.";
      entry.failureClass = "capacity";
      entry.retryable = true;
      entry.retryAfterMs = null;
      entry.capacityRetriesUsed = MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT;
      handleOutageTriggered("quota_exhausted", entry.errorMessage);
      return;
    }

    if (
      isCapacityError &&
      classified.retryable &&
      entry.capacityRetriesUsed < MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT &&
      outageState === "none"
    ) {
      const waitMs =
        res.errorCode === "TTS_RATE_LIMITED"
          ? parseRetryAfterMs(res.retryAfterHeader, now())
          : CAPACITY_RETRY_FALLBACK_COOLDOWN_MS;
      entry.capacityRetriesUsed += 1;
      entry.status = "retry-wait";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
      entry.failureClass = classified.failureClass;
      entry.retryable = true;
      entry.retryAfterMs = waitMs;

      if (!hasStartedPodcast) {
        scheduleSharedCooldown(waitMs);
        evaluatePreparationStatus();
        emit();
        return;
      }

      if (index === currentIndex && status === "preparing") {
        const secs = Math.max(1, Math.ceil(waitMs / 1000));
        notice = `Voice generation is briefly paused. Preparing more voices in ${secs}s.`;
        setAnnouncement("Voice generation paused for provider limit.");
      }
      scheduleSharedCooldown(waitMs);
      emit();
      return;
    }

    if (res.errorCode === "TTS_RATE_LIMITED") {
      const cooldownMs = parseRetryAfterMs(res.retryAfterHeader, now());
      entry.retryAfterMs = cooldownMs;
      scheduleSharedCooldown(cooldownMs);
    } else {
      entry.retryAfterMs = null;
    }

    entry.status = "failed";
    entry.errorCode = res.errorCode;
    entry.errorMessage = res.message;
    entry.failureClass = classified.failureClass;
    entry.retryable = classified.retryable;

    // 429 rate limits degrade only the affected segment and trigger cooldown; they never terminate the full hosted session.
    const countsTowardPermanentOutage =
      res.errorCode !== "TTS_RATE_LIMITED" &&
      classified.failureClass !== "safety" &&
      classified.failureClass !== "invalid";

    if (countsTowardPermanentOutage && !wasTargetedRetry) {
      consecutiveNonCapacityErrors += 1;
      if (consecutiveNonCapacityErrors >= OUTAGE_CONSECUTIVE_NON_CAPACITY_ERRORS) {
        handleOutageTriggered(
          "provider_outage",
          "Hosted Kuromate voices are temporarily unavailable. Continue with timed captions or retry hosted audio.",
        );
        return;
      }
    } else if (!countsTowardPermanentOutage && res.errorCode !== "TTS_RATE_LIMITED") {
      consecutiveNonCapacityErrors = 0;
    }

    if (!hasStartedPodcast) {
      evaluatePreparationStatus();
      emit();
      pumpQueue();
      return;
    }

    const fallbackNotice = wasTargetedRetry
      ? "Voice unavailable again — continuing with captions."
      : "Voice unavailable for this turn. Continuing with captions.";

    if (wasTargetedPaused) {
      if (index === currentIndex) {
        notice = fallbackNotice;
      }
      emit();
      return;
    }

    if (index === currentIndex && status === "preparing") {
      startTimedFallbackTurn(index, fallbackNotice);
    } else {
      emit();
    }
    pumpQueue();
  }

  function startGenerationForIndex(index: number) {
    const entry = entries[index];
    if (!entry || disposed || inFlightControllers.has(index) || entry.objectUrl !== null) {
      return;
    }

    const host = hostsById.get(entry.segment.speakerId);
    if (!isValidClientSegment(entry.segment, host)) {
      entry.status = "failed";
      entry.errorCode = "INVALID_TTS_INPUT";
      entry.errorMessage = "Dialogue turn is invalid for hosted voice playback.";
      entry.failureClass = "invalid";
      entry.retryable = false;
      entry.lastFailureAt = now();
      if (targetedRetryActiveIndex === index) {
        targetedRetryActiveIndex = null;
        targetedRetryAutoPlay = false;
      }
      if (!hasStartedPodcast) {
        evaluatePreparationStatus();
        emit();
        pumpQueue();
        return;
      }
      if (index === currentIndex && status === "preparing") {
        startTimedFallbackTurn(index, "Voice unavailable for this turn. Continuing with captions.");
      } else {
        emit();
      }
      pumpQueue();
      return;
    }

    const startedAt = now();
    if (lastProviderRequestStartedAt !== null) {
      const interval = Math.max(0, startedAt - lastProviderRequestStartedAt);
      if (minObservedRequestIntervalMs === null || interval < minObservedRequestIntervalMs) {
        minObservedRequestIntervalMs = interval;
      }
    }
    lastProviderRequestStartedAt = startedAt;

    const controller = new AbortController();
    const localSession = sessionToken;
    const localReplayCycle = replayCycleToken;
    inFlightControllers.set(index, controller);
    if (inFlightControllers.size > maxObservedConcurrency) {
      maxObservedConcurrency = inFlightControllers.size;
    }

    entry.status = "generating";
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.retryAfterMs = null;
    entry.requestAttempts += 1;
    entry.generationStartedAt = startedAt;
    providerRequestCount += 1;
    emit();

    const routePreference: TtsRoutePreference | undefined =
      sessionCircuit.isPrimaryOpen(startedAt) || entry.capacityRetriesUsed > 0
        ? "fallback"
        : undefined;

    void deps
      .fetchSegmentAudio(
        {
          segmentId: entry.segment.id,
          speakerId: entry.segment.speakerId,
          role: host.role,
          text: entry.segment.text.trim(),
          ...(routePreference ? { routePreference } : {}),
        },
        controller.signal,
      )
      .then((result) => {
        if (
          disposed ||
          localSession !== sessionToken ||
          localReplayCycle !== replayCycleToken ||
          controller.signal.aborted
        ) {
          inFlightControllers.delete(index);
          return;
        }
        if (result.ok) {
          handleSegmentFetchSuccess(
            index,
            result,
            localSession,
            localReplayCycle,
            controller,
          );
        } else {
          inFlightControllers.delete(index);
          handleSegmentFetchFailure(index, result);
        }
      })
      .catch(() => {
        if (
          disposed ||
          localSession !== sessionToken ||
          localReplayCycle !== replayCycleToken ||
          controller.signal.aborted
        ) {
          inFlightControllers.delete(index);
          return;
        }
        inFlightControllers.delete(index);
        handleSegmentFetchFailure(index, {
          ok: false,
          httpStatus: 503,
          errorCode: "TTS_PROVIDER_UNAVAILABLE",
          message: "Unable to reach hosted Kuromate audio right now.",
          retryable: true,
          isNetworkError: true,
        });
      });
  }

  function pumpQueue() {
    if (!canScheduleAnyProviderWork()) {
      return;
    }
    const nextIdx = pickNextCandidateIndex();
    if (nextIdx === null) {
      return;
    }

    const targetEntry = entries[nextIdx];
    const host = targetEntry ? hostsById.get(targetEntry.segment.speakerId) : undefined;
    if (!targetEntry || !isValidClientSegment(targetEntry.segment, host)) {
      clearPacingTimer();
      startGenerationForIndex(nextIdx);
      return;
    }

    const currentTime = now();
    const minAllowedAt =
      lastProviderRequestStartedAt !== null
        ? lastProviderRequestStartedAt + effectiveMinIntervalMs
        : 0;
    const nextAllowedAt = Math.max(minAllowedAt, cooldownUntilMs);

    if (currentTime < nextAllowedAt) {
      if (pacingTimer === null || pacingTargetAtMs < nextAllowedAt) {
        clearPacingTimer();
        pacingTargetAtMs = nextAllowedAt;
        const delayMs = Math.max(1, nextAllowedAt - currentTime);
        pacingTimer = timers.setTimeout(() => {
          pacingTimer = null;
          pacingTargetAtMs = 0;
          if (disposed) return;
          pumpQueue();
        }, delayMs);
      }
      return;
    }

    clearPacingTimer();
    startGenerationForIndex(nextIdx);
  }

  function startPreparation() {
    if (disposed || entries.length === 0 || hasStartedPodcast) {
      return;
    }
    if (audioMode === "timed-fallback") {
      return;
    }
    if (outageState === "config_error" || outageState === "auth_error") {
      evaluatePreparationStatus();
      emit();
      return;
    }
    if (audioPreparationStatus === "cancelled") {
      return;
    }
    audioPreparationStatus = "preparing";
    evaluatePreparationStatus();
    emit();
    pumpQueue();
  }

  function cancelPreparation() {
    if (disposed) return;
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    sessionToken += 1;
    playbackToken += 1;
    replayCycleToken += 1;
    clearPacingTimer();
    clearCooldownTimer();
    clearFallbackTimer();
    clearReactionTimers();
    deps.audioDriver.stop();
    abortBackgroundRequests();
    for (const item of entries) {
      if (item.status === "queued" || item.status === "retry-wait" || item.status === "generating") {
        item.status = "cancelled";
      }
    }
    audioPreparationStatus = "cancelled";
    notice = "Voice preparation cancelled.";
    emit();
  }

  function retryPreparation() {
    if (disposed || hasStartedPodcast || entries.length === 0) return;
    if (outageState === "config_error" || outageState === "auth_error") return;
    if (cooldownTimer !== null && cooldownUntilMs > now()) return;

    outageState = "none";
    audioMode = "hosted";
    consecutiveNonCapacityErrors = 0;

    for (let idx = 0; idx < initialBufferTarget; idx += 1) {
      const item = entries[idx];
      if (!item || item.objectUrl !== null) continue;
      if (item.failureClass !== null && !isRecoverableFailureClass(item.failureClass)) continue;
      if (item.status === "failed" && !item.retryable) continue;
      item.status = "idle";
      item.capacityRetriesUsed = 0;
      item.errorCode = null;
      item.errorMessage = null;
      item.failureClass = null;
      item.retryAfterMs = null;
    }

    audioPreparationStatus = "preparing";
    evaluatePreparationStatus();
    emit();
    pumpQueue();
  }

  function startPodcast() {
    if (disposed || entries.length === 0 || hasStartedPodcast) return;
    const readyBuf = countInitialBufferReady();
    if (
      audioPreparationStatus !== "ready" ||
      readyBuf < initialBufferTarget ||
      entries[0]?.objectUrl === null
    ) {
      return;
    }
    hasStartedPodcast = true;
    audioMode = "hosted";
    currentIndex = 0;
    pausedTimeSec = 0;
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function startWithCaptionsAndAvailableAudio() {
    if (disposed || entries.length === 0 || hasStartedPodcast) return;
    if (audioPreparationStatus !== "partial" || entries[0]?.objectUrl === null) {
      return;
    }
    hasStartedPodcast = true;
    audioMode = "hosted";
    currentIndex = 0;
    pausedTimeSec = 0;
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function play() {
    if (disposed || entries.length === 0) return;

    if (!hasStartedPodcast) {
      if (audioPreparationStatus === "ready" && entries[0]?.objectUrl !== null) {
        startPodcast();
        return;
      }
      if (audioPreparationStatus === "partial" && entries[0]?.objectUrl !== null) {
        startWithCaptionsAndAvailableAudio();
        return;
      }
      hasStartedPodcast = true;
      audioPreparationStatus = "idle";
      currentIndex = 0;
      pausedTimeSec = 0;
      activateCurrentSegmentForPlayback();
      return;
    }

    if (status === "complete") {
      replay();
      return;
    }

    if ((status === "paused" || status === "autoplay-blocked") && audioMode === "hosted") {
      const entry = entries[currentIndex];
      if (entry && entry.objectUrl && loadedSegmentIndex === currentIndex && pausedTimeSec > 0) {
        const resumeToken = ++playbackToken;
        const session = sessionToken;
        const resumeIndex = currentIndex;
        status = "playing";
        entry.status = "playing";
        notice = null;
        emit();
        void deps.audioDriver
          .resume({
            onLoadedMetadata: (durationMs) => {
              if (disposed || session !== sessionToken || resumeToken !== playbackToken) return;
              if (durationMs !== null && durationMs > 0) {
                entry.durationMs = entry.durationMs ?? durationMs;
                emit();
              }
            },
            onCanPlay: () => {
              // Readiness confirmed before pause.
            },
            onPlay: () => {
              if (disposed || session !== sessionToken || resumeToken !== playbackToken) return;
              scheduleReactionsForSegment(resumeIndex, resumeToken);
            },
            onPause: () => {
              // Explicit pause() handles state transitions cleanly.
            },
            onEnded: () => {
              handleCurrentTurnFinished(resumeToken, resumeIndex);
            },
            onDecodeError: () => {
              if (disposed || session !== sessionToken || resumeToken !== playbackToken) return;
              handleSegmentPlaybackDecodeFailure(resumeIndex);
            },
          })
          .then((outcome) => {
            if (disposed || session !== sessionToken || resumeToken !== playbackToken) return;
            if (outcome.ok) {
              scheduleReactionsForSegment(resumeIndex, resumeToken);
              pumpQueue();
            } else if (outcome.reason === "autoplay_blocked") {
              entry.status = "paused";
              status = "autoplay-blocked";
              notice = "Tap to continue audio — your browser blocked automatic playback.";
              setAnnouncement("Tap to continue audio.");
              emit();
            } else if (outcome.reason === "decode_error") {
              handleSegmentPlaybackDecodeFailure(resumeIndex);
            }
          });
        return;
      }
      activateCurrentSegmentForPlayback();
      return;
    }

    if (status === "playing" || status === "preparing") {
      return;
    }

    activateCurrentSegmentForPlayback();
  }

  function pause() {
    if (disposed || !hasStartedPodcast) return;
    if (status !== "playing" && status !== "preparing") {
      return;
    }

    playbackToken += 1;
    clearFallbackTimer();
    clearReactionTimers();
    if (status === "playing" && audioMode === "hosted" && entries[currentIndex]?.objectUrl) {
      pausedTimeSec = deps.audioDriver.pause();
    } else {
      deps.audioDriver.stop();
      pausedTimeSec = 0;
      loadedSegmentIndex = null;
    }
    markActiveClipsIdleAfterPause();
    status = "paused";
    notice = "Playback paused.";
    emit();
  }

  function togglePlayPause() {
    if (!hasStartedPodcast) {
      return;
    }
    if (status === "playing" || status === "preparing") {
      pause();
    } else {
      play();
    }
  }

  function moveToIndex(targetIndex: number) {
    if (disposed || entries.length === 0 || !hasStartedPodcast) return;
    const bounded = Math.max(0, Math.min(entries.length - 1, targetIndex));
    const wasActive = status === "playing" || status === "preparing" || status === "autoplay-blocked";

    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    stopActivePlaybackOnly();
    markActiveClipsIdleAfterPause();
    currentIndex = bounded;
    pausedTimeSec = 0;
    notice = null;

    if (wasActive) {
      activateCurrentSegmentForPlayback();
      return;
    }

    status = bounded === 0 && status === "idle" ? "idle" : "paused";
    emit();
  }

  function previous() {
    moveToIndex(currentIndex - 1);
  }

  function next() {
    moveToIndex(currentIndex + 1);
  }

  function restart() {
    if (disposed || !hasStartedPodcast) return;
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    stopActivePlaybackOnly();
    markActiveClipsIdleAfterPause();
    currentIndex = 0;
    pausedTimeSec = 0;
    status = "paused";
    notice = "Returned to turn 1 — cached Kuromate clips are ready to play.";
    emit();
  }

  function replay() {
    if (disposed || entries.length === 0) return;
    hasStartedPodcast = true;
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    stopActivePlaybackOnly();
    clearPacingTimer();
    replayCycle += 1;
    replayCycleToken += 1;
    abortBackgroundRequests();

    const isPermanentEpisodeOutage =
      outageState === "config_error" || outageState === "auth_error";
    const skipUnfetchedRetriesOnReplay =
      isPermanentEpisodeOutage || outageState === "quota_exhausted";
    const cooldownElapsed = cooldownTimer === null || cooldownUntilMs <= now();

    if (!isPermanentEpisodeOutage) {
      if (outageState === "provider_outage") {
        outageState = "none";
      }
      consecutiveNonCapacityErrors = 0;
      if (outageState !== "quota_exhausted") {
        audioMode = "hosted";
      }
    }

    for (const entry of entries) {
      if (cooldownElapsed) {
        entry.manualRetriesUsedInCycle = 0;
      }
      if (entry.objectUrl !== null) {
        entry.status = "ready";
        entry.errorCode = null;
        entry.errorMessage = null;
        entry.failureClass = null;
        entry.retryable = false;
        entry.retryAfterMs = null;
        continue;
      }

      const permanent =
        skipUnfetchedRetriesOnReplay ||
        (entry.failureClass !== null && !isRecoverableFailureClass(entry.failureClass)) ||
        (entry.status === "failed" && !entry.retryable);

      if (permanent) {
        if (entry.status !== "failed") {
          entry.status = "failed";
        }
        entry.retryable = false;
        continue;
      }

      entry.status = "idle";
      entry.capacityRetriesUsed = 0;
      entry.errorCode = null;
      entry.errorMessage = null;
      entry.failureClass = null;
      entry.retryable = false;
      entry.retryAfterMs = null;
    }

    currentIndex = 0;
    pausedTimeSec = 0;
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function retryCurrentSegment() {
    if (disposed || !hasStartedPodcast) return;
    const targetIdx = currentIndex;
    const entry = entries[targetIdx];
    if (!entry) return;

    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > now();
    if (
      !isEntryManuallyRetryable(entry) ||
      cooldownActive ||
      inFlightControllers.has(targetIdx) ||
      entry.status === "generating" ||
      targetedRetryActiveIndex !== null ||
      inFlightControllers.size >= MAX_TTS_CONCURRENCY
    ) {
      return;
    }

    const shouldAutoPlayAfterRetry = status === "playing" || status === "preparing";
    stopActivePlaybackOnly();
    consecutiveNonCapacityErrors = 0;
    if (outageState === "provider_outage" || outageState === "quota_exhausted") {
      outageState = "none";
      audioMode = "hosted";
    }

    entry.manualRetriesUsedInCycle += 1;
    entry.capacityRetriesUsed = MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT;
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.failureClass = null;
    entry.retryAfterMs = null;
    entry.status = "queued";

    targetedRetryActiveIndex = targetIdx;
    targetedRetryAutoPlay = shouldAutoPlayAfterRetry;
    status = shouldAutoPlayAfterRetry ? "preparing" : "paused";

    const hostName = hostsById.get(entry.segment.speakerId)?.name ?? "Kuromate";
    notice = `Preparing ${hostName}’s voice…`;
    setAnnouncement(`Preparing ${hostName}’s voice.`);
    emit();
    pumpQueue();
  }

  function skipCurrentSegment() {
    if (disposed || !hasStartedPodcast) return;
    const entry = entries[currentIndex];
    if (entry && entry.status === "failed") {
      entry.status = "skipped";
    }
    if (currentIndex < entries.length - 1) {
      next();
    } else {
      completeEpisode();
    }
  }

  function continueWithTimedCaptions() {
    if (disposed) return;
    hasStartedPodcast = true;
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    clearPacingTimer();
    clearCooldownTimer();
    abortBackgroundRequests();
    audioMode = "timed-fallback";
    notice = null;
    startTimedFallbackTurn(currentIndex, null);
  }

  function retryHostedAudio() {
    if (disposed) return;
    if (outageState === "config_error" || outageState === "auth_error") {
      return;
    }
    if (cooldownTimer !== null && cooldownUntilMs > now()) {
      return;
    }
    if (!hasStartedPodcast) {
      retryPreparation();
      return;
    }
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    outageState = "none";
    audioMode = "hosted";
    consecutiveNonCapacityErrors = 0;
    for (const item of entries) {
      if (item.objectUrl !== null) continue;
      if (item.failureClass !== null && !isRecoverableFailureClass(item.failureClass)) {
        continue;
      }
      if (item.status === "failed" && !item.retryable) {
        continue;
      }
      if (item.status === "failed" || item.status === "cancelled" || item.status === "retry-wait") {
        item.status = "idle";
        item.capacityRetriesUsed = 0;
        item.errorCode = null;
        item.errorMessage = null;
        item.failureClass = null;
        item.retryAfterMs = null;
      }
    }
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function refreshCooldownDisplay() {
    if (disposed || cooldownTimer === null) return;
    emit();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    sessionToken += 1;
    playbackToken += 1;
    replayCycleToken += 1;
    clearPacingTimer();
    clearFallbackTimer();
    clearReactionTimers();
    clearCooldownTimer();
    abortBackgroundRequests();
    deps.audioDriver.dispose();
    urlPool.revokeAll();
    for (const item of entries) {
      item.objectUrl = null;
      item.audioSource = null;
      if (
        item.status === "playing" ||
        item.status === "generating" ||
        item.status === "queued" ||
        item.status === "retry-wait"
      ) {
        item.status = "cancelled";
      }
    }
    listeners.clear();
  }

  return {
    getSnapshot: () => currentSnapshot,
    subscribe(listener) {
      if (disposed) {
        return () => {};
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    startPreparation,
    cancelPreparation,
    startPodcast,
    startWithCaptionsAndAvailableAudio,
    retryPreparation,
    play,
    pause,
    togglePlayPause,
    previous,
    next,
    restart,
    replay,
    retryCurrentSegment,
    skipCurrentSegment,
    continueWithTimedCaptions,
    retryHostedAudio,
    refreshCooldownDisplay,
    dispose,
  };
}
