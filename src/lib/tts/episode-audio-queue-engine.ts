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
  retryable: boolean;
  retryAfterMs: number | null;
  requestAttempts: number;
  generationStartedAt: number | null;
  generationCompletedAt: number | null;
}

export interface EpisodeAudioQueueSnapshot {
  episodeId: string;
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
  currentSegmentFailed: boolean;
  currentSegmentRetryable: boolean;
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
  retryable: boolean;
  retryAfterMs: number | null;
  capacityRetriesUsed: number;
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
    currentSegmentState: "idle",
    currentSegmentFailed: false,
    currentSegmentRetryable: false,
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
        retryable: false,
        retryAfterMs: null,
        requestAttempts: 0,
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
      retryable: false,
      retryAfterMs: null,
      capacityRetriesUsed: 0,
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
  let currentIndex = 0;
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
      return "Preparing Kuromate audio — captions advance automatically once audio plays.";
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

    return {
      episodeId: episode.id,
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
      cooldownRemainingMs: cooldownActive ? Math.max(0, cooldownUntilMs - now()) : 0,
      currentSegmentState: currentEntry?.status ?? "idle",
      currentSegmentFailed: currentEntry?.status === "failed",
      currentSegmentRetryable: currentEntry?.retryable ?? false,
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
        retryable: entry.retryable,
        retryAfterMs: entry.retryAfterMs,
        requestAttempts: entry.requestAttempts,
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
    entry.retryable = true;

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
    notice =
      cooldownTimer !== null
        ? "Voice generation is briefly paused — retrying when the provider allows."
        : "Preparing Kuromate audio for the current turn…";
    setAnnouncement("Preparing Kuromate audio.");
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

      if (status === "preparing" || status === "playing") {
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
    // Pause speculative background prefetch while recovering from an exhausted capacity failure.
    const windowEnd =
      consecutiveCapacityFailures > 0
        ? currentIndex
        : Math.min(entries.length - 1, currentIndex + PREFETCH_LOOKAHEAD);
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
    clearCooldownTimer();
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

    consecutiveCapacityFailures = 0;
    const url = urlPool.set(entry.cacheKey, blob);
    entry.objectUrl = url;
    entry.durationMs = durationMs;
    entry.status = "ready";
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.retryable = false;
    entry.retryAfterMs = null;
    entry.generationCompletedAt = now();

    if (index === currentIndex && status === "preparing") {
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

    if (res.errorCode === "TTS_NOT_CONFIGURED") {
      entry.status = "failed";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
      entry.retryable = false;
      handleOutageTriggered("config_error", res.message);
      return;
    }

    const isAuthFailure =
      res.errorCode === "TTS_GENERATION_FAILED" &&
      !res.retryable &&
      (res.httpStatus === 401 ||
        res.httpStatus === 403 ||
        /credential|key|auth/i.test(res.message));

    if (isAuthFailure) {
      entry.status = "failed";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
      entry.retryable = false;
      handleOutageTriggered("auth_error", res.message);
      return;
    }

    const isCapacityError =
      res.errorCode === "TTS_RATE_LIMITED" ||
      res.errorCode === "TTS_PROVIDER_UNAVAILABLE" ||
      res.errorCode === "TTS_TIMEOUT";

    if (res.errorCode === "TTS_RATE_LIMITED") {
      rateLimitCount += 1;
    }

    if (isCapacityError && entry.capacityRetriesUsed < MAX_CAPACITY_RETRIES_PER_SEGMENT && outageState === "none") {
      const waitMs =
        res.errorCode === "TTS_RATE_LIMITED"
          ? parseRetryAfterMs(res.retryAfterHeader, now())
          : CAPACITY_RETRY_FALLBACK_COOLDOWN_MS;
      entry.capacityRetriesUsed += 1;
      entry.status = "retry-wait";
      entry.errorCode = res.errorCode;
      entry.errorMessage = res.message;
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

    entry.status = "failed";
    entry.errorCode = res.errorCode;
    entry.errorMessage = res.message;
    entry.retryable = res.retryable;
    entry.retryAfterMs = null;

    if (isCapacityError) {
      consecutiveCapacityFailures += 1;
      if (consecutiveCapacityFailures >= OUTAGE_CONSECUTIVE_CAPACITY_FAILURES) {
        handleOutageTriggered(
          "provider_outage",
          "Hosted Kuromate voices are temporarily unavailable. Continue with timed captions or retry hosted audio.",
        );
        return;
      }
    } else {
      consecutiveCapacityFailures = 0;
    }

    if (index === currentIndex && status === "preparing") {
      startTimedFallbackTurn(index, "Voice unavailable for this turn. Continuing with captions.");
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
      entry.retryable = false;
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
        if (disposed || localSession !== sessionToken || controller.signal.aborted) {
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
        if (disposed || localSession !== sessionToken || controller.signal.aborted) {
          return;
        }
        inFlightControllers.delete(index);
        handleSegmentFetchFailure(index, {
          ok: false,
          httpStatus: 503,
          errorCode: "TTS_PROVIDER_UNAVAILABLE",
          message: "Unable to reach hosted Kuromate audio right now.",
          retryable: true,
        });
      });
  }

  function pumpQueue() {
    if (!shouldContinueBackgroundQueue() || cooldownTimer !== null) {
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
      currentIndex = 0;
      pausedTimeSec = 0;
      loadedSegmentIndex = null;
      notice = null;
      activateCurrentSegmentForPlayback();
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
    stopActivePlaybackOnly();
    markActiveClipsIdleAfterPause();
    currentIndex = 0;
    pausedTimeSec = 0;
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function retryCurrentSegment() {
    if (disposed) return;
    const entry = entries[currentIndex];
    if (!entry) return;
    outageState = "none";
    audioMode = "hosted";
    consecutiveCapacityFailures = 0;
    clearCooldownTimer();
    entry.capacityRetriesUsed = 0;
    entry.errorCode = null;
    entry.errorMessage = null;
    entry.retryAfterMs = null;
    if (!entry.objectUrl) {
      entry.status = "queued";
    }
    notice = null;
    activateCurrentSegmentForPlayback();
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
    clearCooldownTimer();
    abortBackgroundRequests();
    audioMode = "timed-fallback";
    notice = null;
    startTimedFallbackTurn(currentIndex, null);
  }

  function retryHostedAudio() {
    if (disposed) return;
    outageState = "none";
    audioMode = "hosted";
    consecutiveCapacityFailures = 0;
    clearCooldownTimer();
    for (const item of entries) {
      if (item.status === "failed" || item.status === "cancelled" || item.status === "retry-wait") {
        item.status = item.objectUrl ? "ready" : "idle";
        item.capacityRetriesUsed = 0;
        item.errorCode = null;
        item.errorMessage = null;
        item.retryAfterMs = null;
      }
    }
    notice = null;
    activateCurrentSegmentForPlayback();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    sessionToken += 1;
    playbackToken += 1;
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
    dispose,
  };
}
