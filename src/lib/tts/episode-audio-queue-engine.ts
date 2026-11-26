import type { DialogueSegment, Episode, Host, HostRole } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { getSegmentDurationMs } from "@/hooks/use-episode-playback";
import {
  createEpisodeObjectUrlPool,
  type EpisodeObjectUrlPool,
  type ObjectUrlApi,
} from "@/lib/tts/object-url-manager";
import { parseRetryAfterMs } from "@/lib/tts/retry-after";
import type { TtsErrorCode } from "@/lib/tts/tts-contract";

export const MAX_TTS_CONCURRENCY = 2;
export const PREFETCH_LOOKAHEAD = 2;
export const MAX_CAPACITY_RETRIES_PER_SEGMENT = 1;
/** Client issues at most 1 initial request + 1 post-cooldown capacity retry per segment automatically. */
export const MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT = 1 + MAX_CAPACITY_RETRIES_PER_SEGMENT;
/** Bounded manual retries allowed per failed segment within a single playback/replay cycle. */
export const MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE = 1;
/** Combined automatic + manual client attempts allowed per segment within a single replay cycle. */
export const MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE =
  MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT + MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE;
/** Theoretical upper bound on upstream Gemini calls per segment during automatic queue playback (capacity fail + 1 server regen retry). */
export const MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT = 3;
export const OUTAGE_CONSECUTIVE_CAPACITY_FAILURES = 2;
export const CAPACITY_RETRY_FALLBACK_COOLDOWN_MS = 2_000;

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
export type QueueOutageState = "none" | "config_error" | "auth_error" | "provider_outage";
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
    }
  | {
      ok: false;
      httpStatus: number;
      errorCode: TtsErrorCode;
      message: string;
      retryable: boolean;
      retryAfterHeader?: string | null;
      isNetworkError?: boolean;
    };

export interface FetchSegmentAudioPayload {
  segmentId: string;
  speakerId: string;
  role: HostRole;
  text: string;
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
}

export interface SegmentQueueEntryView {
  segmentId: string;
  speakerId: string;
  order: number;
  cacheKey: string;
  status: SegmentQueueStatus;
  hasCachedAudio: boolean;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  failureClass: SegmentFailureClass | null;
  retryable: boolean;
  retryAfterMs: number | null;
  requestAttempts: number;
  lastFailureAt: number | null;
  manualRetriesUsedInCycle: number;
  manualRetryAllowed: boolean;
  generationStartedAt: number | null;
  generationCompletedAt: number | null;
}

export interface EpisodeAudioQueueSnapshot {
  episodeId: string;
  replayCycle: number;
  currentIndex: number;
  totalSegments: number;
  status: EpisodePlaybackStatus;
  stageStatus: PlaybackStatus;
  audioMode: EpisodeAudioMode;
  outageState: QueueOutageState;
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
    rateLimitCount: number;
    completedTurnsCount: number;
  };
}

export interface EpisodeAudioQueueController {
  getSnapshot: () => EpisodeAudioQueueSnapshot;
  subscribe: (listener: (snapshot: EpisodeAudioQueueSnapshot) => void) => () => void;
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
export function buildIdleEpisodeSnapshot(episode: Episode): EpisodeAudioQueueSnapshot {
  const orderedSegments = [...episode.segments].sort((a, b) => a.order - b.order);
  const hostsById = new Map<string, Host>(episode.hosts.map((h) => [h.id, h]));
  const currentSegment = orderedSegments[0];
  const activeSpeakerId = currentSegment?.speakerId ?? "";
  const activeHost = hostsById.get(activeSpeakerId);

  return {
    episodeId: episode.id,
    currentIndex: 0,
    totalSegments: orderedSegments.length,
    status: "idle",
    stageStatus: "idle",
    audioMode: "hosted",
    outageState: "none",
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
    cooldownActive: false,
    cooldownRemainingMs: 0,
    replayCycle: 0,
    currentSegmentState: "idle",
    currentSegmentHasAudio: false,
    currentSegmentFailed: false,
    currentSegmentRetryable: false,
    currentSegmentFailureClass: null,
    currentSegmentManualRetryAllowed: false,
    currentSegmentManualRetryDisabled: false,
    currentSegmentRetryDisabledReason: null,
    currentSegmentRetryLabel: "Retry voice",
    notice: "Hosted Kuromate audio ready — press Play to hear all Kuromates speak in sequence.",
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
        durationMs: null,
        errorCode: null,
        errorMessage: null,
        failureClass: null,
        retryable: false,
        retryAfterMs: null,
        requestAttempts: 0,
        lastFailureAt: null,
        manualRetriesUsedInCycle: 0,
        manualRetryAllowed: false,
        generationStartedAt: null,
        generationCompletedAt: null,
      };
    }),
    metrics: {
      providerRequestCount: 0,
      cacheHitCount: 0,
      maxObservedConcurrency: 0,
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
 * enforces concurrency <= 2, bounded lookahead, shared Retry-After cooldown,
 * single active playback token, explicit timed fallback, and exact-once object URL revocation.
 */
export function createEpisodeAudioQueueEngine(
  episode: Episode,
  deps: EpisodeAudioQueueDeps,
): EpisodeAudioQueueController {
  const timers = deps.timers ?? defaultTimers;
  const now = deps.now ?? Date.now;
  const urlPool: EpisodeObjectUrlPool = createEpisodeObjectUrlPool(deps.urlApi);

  const orderedSegments = [...episode.segments].sort((a, b) => a.order - b.order);
  const hostsById = new Map<string, Host>(episode.hosts.map((h) => [h.id, h]));

  const entries: InternalSegmentEntry[] = orderedSegments.map((segment) => {
    const host = hostsById.get(segment.speakerId);
    const role = host?.role ?? null;
    return {
      segment,
      hostRole: role,
      cacheKey: buildSegmentCacheKey(episode.id, segment, role ?? "unknown"),
      status: "idle",
      objectUrl: null,
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
  let currentIndex = 0;
  let targetedRetryActiveIndex: number | null = null;
  let targetedRetryAutoPlay = false;
  let status: EpisodePlaybackStatus = "idle";
  let audioMode: EpisodeAudioMode = "hosted";
  let outageState: QueueOutageState = "none";
  let reactionHostId: string | null = null;
  let pausedTimeSec = 0;
  let loadedSegmentIndex: number | null = null;
  let consecutiveCapacityFailures = 0;

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

  function stopActivePlaybackOnly() {
    playbackToken += 1;
    clearFallbackTimer();
    clearReactionTimers();
    deps.audioDriver.stop();
    pausedTimeSec = 0;
    loadedSegmentIndex = null;
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
    if (notice) {
      return notice;
    }
    const readyCount = entries.filter((e) => e.objectUrl !== null).length;
    if (audioMode === "timed-fallback") {
      return "Timed captions mode — hosted audio paused due to service unavailability. Captions and visuals remain active.";
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
    if (cooldownTimer !== null) {
      return "Voice generation is briefly paused — retrying when the provider allows.";
    }
    if (status === "playing") {
      return `Hosted Kuromate audio active — ${readyCount} of ${entries.length} turns ready.`;
    }
    return "Hosted Kuromate audio ready — press Play to hear all Kuromates speak in sequence.";
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
    if (!entry.retryable && entry.failureClass !== "audio") {
      return false;
    }
    // Wait: respect explicit non-retryable failure (e.g. unexpected MIME or oversized) unless transient/decode error.
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

  function buildSnapshot(): EpisodeAudioQueueSnapshot {
    const totalSegments = entries.length;
    const currentEntry = entries[currentIndex];
    const currentSegment = currentEntry?.segment;
    const previousSegment = currentIndex > 0 ? entries[currentIndex - 1]?.segment ?? null : null;
    const activeSpeakerId = currentSegment?.speakerId ?? "";
    const activeHost = hostsById.get(activeSpeakerId);
    const previousHost = previousSegment ? hostsById.get(previousSegment.speakerId) : undefined;
    const readyCount = entries.filter((e) => e.objectUrl !== null).length;
    const failedCount = entries.filter((e) => e.status === "failed").length;
    const cooldownActive = cooldownTimer !== null && cooldownUntilMs > now();
    const cooldownRemainingMs = cooldownActive ? Math.max(0, cooldownUntilMs - now()) : 0;
    const retryUi = evaluateCurrentRetryUi(currentEntry, currentIndex, cooldownActive, cooldownRemainingMs);

    return {
      episodeId: episode.id,
      replayCycle,
      currentIndex,
      totalSegments,
      status,
      stageStatus: mapStageStatus(),
      audioMode,
      outageState,
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
        durationMs: entry.durationMs,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        failureClass: entry.failureClass,
        retryable: entry.retryable,
        retryAfterMs: entry.retryAfterMs,
        requestAttempts: entry.requestAttempts,
        lastFailureAt: entry.lastFailureAt,
        manualRetriesUsedInCycle: entry.manualRetriesUsedInCycle,
        manualRetryAllowed: isEntryManuallyRetryable(entry),
        generationStartedAt: entry.generationStartedAt,
        generationCompletedAt: entry.generationCompletedAt,
      })),
      metrics: {
        providerRequestCount,
        cacheHitCount,
        maxObservedConcurrency,
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
          // Readiness confirmed; no noisy UI announcement needed.
        },
        onPlay: () => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
          scheduleReactionsForSegment(index, token);
        },
        onPause: () => {
          if (disposed || session !== sessionToken || token !== playbackToken) return;
          // Explicit pause() mutates state cleanly; stray browser pauses are tolerated cleanly.
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

    if (audioMode === "hosted") {
      startTimedFallbackTurn(index, "Voice unavailable for this turn. Continuing with captions.");
      pumpQueue();
    } else {
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

    // Revisit of skipped or aborted turn resets safely unless permanently failed.
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

    // Needs generation: enter preparing state and prioritize currentIndex immediately.
    playbackToken += 1;
    clearFallbackTimer();
    clearReactionTimers();
    status = "preparing";
    if (entry.status === "idle") {
      entry.status = "queued";
    }
    const hostName = hostsById.get(entry.segment.speakerId)?.name;
    notice =
      cooldownTimer !== null
        ? "Voice generation is briefly paused — retrying when the provider allows."
        : hostName
          ? `Preparing ${hostName}’s voice…`
          : "Preparing Kuromate audio for the current turn…";
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

      if (outageState === "none" && (status === "preparing" || status === "playing")) {
        notice = null;
        emit();
        pumpQueue();
      } else {
        emit();
      }
    }, remaining);
  }

  function shouldContinueBackgroundQueue(): boolean {
    if (disposed || audioMode !== "hosted" || outageState !== "none") {
      return false;
    }
    return status === "preparing" || status === "playing";
  }

  function pickNextCandidateIndex(): number | null {
    // Narrow lookahead after an exhausted capacity failure without blocking the immediate next turn.
    const lookahead = consecutiveCapacityFailures > 0 ? 1 : PREFETCH_LOOKAHEAD;
    const windowEnd = Math.min(entries.length - 1, currentIndex + lookahead);
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

    if (status === "preparing") {
      stopActivePlaybackOnly();
      status = "paused";
      notice = message;
      setAnnouncement(message);
    } else if (status === "playing") {
      // Allow a currently playing cached clip to finish, or surface recovery bar cleanly.
      notice = message;
    }
    emit();
  }

  function handleSegmentFetchSuccess(index: number, durationMs: number | null, blob: Blob) {
    const entry = entries[index];
    if (!entry) return;

    const wasTargetedRetry = targetedRetryActiveIndex === index;
    const shouldAutoPlayTargeted = wasTargetedRetry && targetedRetryAutoPlay;
    if (wasTargetedRetry) {
      targetedRetryActiveIndex = null;
      targetedRetryAutoPlay = false;
    }

    consecutiveCapacityFailures = 0;
    const url = urlPool.set(entry.cacheKey, blob);
    entry.objectUrl = url;
    entry.durationMs = durationMs;
    entry.status = "ready";
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.failureClass = null;
    entry.retryable = false;
    entry.retryAfterMs = null;
    entry.generationCompletedAt = now();

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

    if (
      isCapacityError &&
      classified.retryable &&
      entry.capacityRetriesUsed < MAX_CAPACITY_RETRIES_PER_SEGMENT &&
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
      if (index === currentIndex && status === "preparing") {
        notice = "Voice generation is briefly paused — retrying when the provider allows.";
        setAnnouncement("Voice generation paused for provider limit.");
      }
      scheduleSharedCooldown(waitMs);
      emit();
      return;
    }

    if (res.errorCode === "TTS_RATE_LIMITED") {
      // Honor rate-limit Retry-After cooldown across the queue even if automatic retries for this clip are exhausted.
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

    if (isCapacityError && !wasTargetedRetry) {
      consecutiveCapacityFailures += 1;
      if (consecutiveCapacityFailures >= OUTAGE_CONSECUTIVE_CAPACITY_FAILURES) {
        handleOutageTriggered(
          "provider_outage",
          "Hosted Kuromate voices are temporarily unavailable. Continue with timed captions or retry hosted audio.",
        );
        return;
      }
    } else if (!isCapacityError) {
      consecutiveCapacityFailures = 0;
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
      if (index === currentIndex && status === "preparing") {
        startTimedFallbackTurn(index, "Voice unavailable for this turn. Continuing with captions.");
      } else {
        emit();
      }
      pumpQueue();
      return;
    }

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
    entry.generationStartedAt = now();
    providerRequestCount += 1;
    emit();

    void deps
      .fetchSegmentAudio(
        {
          segmentId: entry.segment.id,
          speakerId: entry.segment.speakerId,
          role: host.role,
          text: entry.segment.text.trim(),
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
          return;
        }
        inFlightControllers.delete(index);
        if (result.ok) {
          handleSegmentFetchSuccess(index, result.durationMs, result.blob);
        } else {
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
    if (!shouldContinueBackgroundQueue() || cooldownTimer !== null || targetedRetryActiveIndex !== null) {
      return;
    }
    while (inFlightControllers.size < MAX_TTS_CONCURRENCY) {
      const nextIdx = pickNextCandidateIndex();
      if (nextIdx === null) {
        break;
      }
      startGenerationForIndex(nextIdx);
    }
  }

  function play() {
    if (disposed || entries.length === 0) return;

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
              // Readiness already confirmed before pause.
            },
            onPlay: () => {
              if (disposed || session !== sessionToken || resumeToken !== playbackToken) return;
              scheduleReactionsForSegment(resumeIndex, resumeToken);
            },
            onPause: () => {
              // Explicit pause() handles state transitions deterministically.
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
    if (disposed) return;
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
    if (status === "playing" || status === "preparing") {
      pause();
    } else {
      play();
    }
  }

  function moveToIndex(targetIndex: number) {
    if (disposed || entries.length === 0) return;
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
    if (disposed) return;
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
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    stopActivePlaybackOnly();
    replayCycle += 1;
    replayCycleToken += 1;
    abortBackgroundRequests();

    const isPermanentEpisodeOutage =
      outageState === "config_error" || outageState === "auth_error";
    const cooldownElapsed = cooldownTimer === null || cooldownUntilMs <= now();

    if (!isPermanentEpisodeOutage) {
      if (outageState === "provider_outage") {
        outageState = "none";
      }
      consecutiveCapacityFailures = 0;
      audioMode = "hosted";
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
        isPermanentEpisodeOutage ||
        (entry.failureClass !== null && !isRecoverableFailureClass(entry.failureClass)) ||
        (entry.status === "failed" && !entry.retryable);

      if (permanent) {
        if (entry.status !== "failed") {
          entry.status = "failed";
        }
        entry.retryable = false;
        continue;
      }

      // Reset eligible transient/aborted/skipped failures for progressive bounded replay recovery.
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
    if (disposed) return;
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
    consecutiveCapacityFailures = 0;
    if (outageState === "provider_outage") {
      outageState = "none";
      audioMode = "hosted";
    }

    entry.manualRetriesUsedInCycle += 1;
    entry.capacityRetriesUsed = MAX_CAPACITY_RETRIES_PER_SEGMENT;
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
    startGenerationForIndex(targetIdx);
  }

  function skipCurrentSegment() {
    if (disposed) return;
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
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
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
    targetedRetryActiveIndex = null;
    targetedRetryAutoPlay = false;
    outageState = "none";
    audioMode = "hosted";
    consecutiveCapacityFailures = 0;
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
    clearFallbackTimer();
    clearReactionTimers();
    clearCooldownTimer();
    abortBackgroundRequests();
    deps.audioDriver.dispose();
    urlPool.revokeAll();
    for (const item of entries) {
      item.objectUrl = null;
      if (item.status === "playing" || item.status === "generating" || item.status === "queued" || item.status === "retry-wait") {
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
