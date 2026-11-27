import type { DialogueSegment, Episode, Host, HostRole } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { getSegmentDurationMs } from "@/hooks/use-episode-playback";
import {
  resolveEpisodeVoiceIdentities,
  type KuromateIdentityProfileId,
} from "@/lib/tts/kuromate-identity-ids";
import {
  createEpisodeObjectUrlPool,
  type EpisodeObjectUrlPool,
  type ObjectUrlApi,
} from "@/lib/tts/object-url-manager";
import {
  classifyRetryAfter,
  parseRetryAfterMs,
  type TtsQuotaClass,
} from "@/lib/tts/retry-after";
import type {
  HostedTtsHealthState,
  TtsErrorCode,
  TtsRoutePreference,
} from "@/lib/tts/tts-contract";
import { ROLE_TO_PROFILE_ID } from "@/lib/tts/kuromate-identity-ids";
import {
  buildEpisodeAudioFilename,
  parseWavBuffer,
  resolveInterTurnPauseMs,
  resolveTimelineStateAtMs,
  stitchSegmentsToWav,
  type CompiledTimelineSegment,
  type ParsedWavPcm,
} from "@/lib/tts/wav-stitcher";
import {
  createTtsSessionCircuit,
  type TtsSessionCircuit,
} from "@/lib/tts/episode-audio-queue-engine";
import { MIN_TTS_REQUEST_INTERVAL_MS, resolveTtsRequestIntervalMs } from "@/lib/tts/tts-pacing-config";

export const TTS_BATCH_SIZE = 4;
export const PRIMARY_TTS_CONCURRENCY = 4;
export const FALLBACK_TTS_CONCURRENCY = 1;
export const FALLBACK_PACING_MS = MIN_TTS_REQUEST_INTERVAL_MS;
export const MAX_CLIENT_AUTO_RETRIES_PER_TURN = 1;

export type EpisodeSourceKind = "generated" | "mock" | "sample";

export type EpisodeCompilationState =
  | "idle"
  | "preparing"
  | "compiling-opening-batch"
  | "ready-to-play"
  | "compiling-background"
  | "buffering-at-boundary"
  | "failed-retryable"
  | "failed-blocking"
  | "complete"
  | "cancelled"
  | "disposed";

export type TurnCompilationState =
  | "pending"
  | "queued"
  | "requesting"
  | "validating"
  | "ready"
  | "retrying"
  | "failed-retryable"
  | "failed-blocking"
  | "cancelled";

export type BatchCompilationStatus =
  | "pending"
  | "compiling"
  | "ready"
  | "failed"
  | "cancelled";

export type TurnFailureReason =
  | "capacity"
  | "timeout"
  | "unavailable"
  | "config_error"
  | "auth_error"
  | "safety"
  | "invalid_audio"
  | "oversized"
  | "identity_mismatch"
  | "invalid_input"
  | "cancelled";

export interface CompilerSegmentRequestPayload {
  segmentId: string;
  speakerId: string;
  role: HostRole;
  profileId: string;
  voiceIdentityId: KuromateIdentityProfileId;
  voiceId: string;
  avatarId: string;
  hostName: string;
  routePreference?: TtsRoutePreference;
  text: string;
}

export type FetchCompiledSegmentResult =
  | {
      ok: true;
      bytes: ArrayBuffer | Uint8Array;
      contentType: string;
      durationMs: number | null;
      fallbackUsed: boolean;
      retryUsed?: boolean;
      providerAttempts?: number;
      quotaClass?: TtsQuotaClass;
      hostedState?: HostedTtsHealthState;
      retryAfterHeader?: string | null;
      profileId?: string | null;
      voiceIdentityId?: string | null;
      requestId?: string | null;
    }
  | {
      ok: false;
      httpStatus: number;
      errorCode: TtsErrorCode;
      message: string;
      retryable: boolean;
      retryAfterHeader?: string | null;
      quotaClass?: TtsQuotaClass;
      hostedState?: HostedTtsHealthState;
      fallbackUsed?: boolean;
      voiceIdentityId?: string | null;
    };

export type FetchCompiledSegmentFn = (
  payload: CompilerSegmentRequestPayload,
  signal: AbortSignal,
) => Promise<FetchCompiledSegmentResult>;

export interface BatchAudioDriverCallbacks {
  onLoadedMetadata?: (durationMs: number | null) => void;
  onTimeUpdate: (currentTimeSec: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onDecodeError: () => void;
}

export type BatchAudioPlayOutcome =
  | { ok: true }
  | { ok: false; reason: "autoplay_blocked" | "decode_error" | "aborted" };

export interface BatchAudioDriver {
  loadAndPlay: (
    url: string,
    startTimeSec: number,
    callbacks: BatchAudioDriverCallbacks,
  ) => Promise<BatchAudioPlayOutcome>;
  resume: (callbacks?: BatchAudioDriverCallbacks) => Promise<BatchAudioPlayOutcome>;
  seekTo: (timeSec: number) => void;
  pause: () => number;
  stop: () => void;
  getCurrentTimeSec: () => number;
  dispose: () => void;
}

export interface CompiledTurnSnapshot {
  segmentId: string;
  order: number;
  speakerId: string;
  expectedIdentityId: KuromateIdentityProfileId;
  batchIndex: number;
  state: TurnCompilationState;
  autoRetryUsed: boolean;
  failureReason: TurnFailureReason | null;
  errorMessage: string | null;
  durationMs: number | null;
  paddingAfterMs: number;
  fallbackUsed: boolean;
}

export interface CompiledBatchSnapshot {
  batchIndex: number;
  turnStartNumber: number;
  turnEndNumber: number;
  status: BatchCompilationStatus;
  completedTurns: number;
  totalTurns: number;
  startMs: number;
  endMs: number;
  hasObjectUrl: boolean;
}

export interface EpisodeBatchCompilerSnapshot {
  sessionId: number;
  episodeId: string;
  source: EpisodeSourceKind;
  isSamplePreview: boolean;
  compilationState: EpisodeCompilationState;
  playbackStatus: PlaybackStatus;
  isAutoplayBlocked: boolean;
  hasStartedPodcast: boolean;
  canPlay: boolean;
  canScrub: boolean;
  canDownloadAudio: boolean;
  isConfigBlocked: boolean;
  isBufferingAtBoundary: boolean;
  bufferingTurnRange: string | null;
  boundaryFailedBatchIndex: number | null;
  providerFallbackActivated: boolean;
  effectiveConcurrency: number;
  activeRequests: number;
  peakConcurrentRequests: number;
  ttsRequestCount: number;
  replayCount: number;
  activeBatchIndex: number;
  totalBatches: number;
  completedTurns: number;
  totalTurns: number;
  openingBatchReadyCount: number;
  openingBatchTotalCount: number;
  failedTurnIds: string[];
  failureMessage: string | null;
  hasRetryableFailure: boolean;
  hasBlockingFailure: boolean;
  compiledDurationMs: number;
  fullDurationMs: number | null;
  elapsedMs: number;
  playableRangeMs: number;
  activeSegmentIndex: number;
  activeSegment: DialogueSegment | undefined;
  previousSegment: DialogueSegment | null;
  activeSpeakerId: string;
  activeHost: Host | undefined;
  previousHost: Host | undefined;
  isSpeaking: boolean;
  isInPadding: boolean;
  reactionHostId: string | null;
  downloadFilename: string;
  fullAudioUrl: string | null;
  turns: CompiledTurnSnapshot[];
  batches: CompiledBatchSnapshot[];
  timeline: CompiledTimelineSegment[];
  hostIdentities: Readonly<Record<string, KuromateIdentityProfileId>>;
  objectUrlCount: number;
}

export interface EpisodeBatchCompilerOptions {
  source?: EpisodeSourceKind;
  fetchSegmentAudio: FetchCompiledSegmentFn;
  audioDriver: BatchAudioDriver;
  sessionCircuit?: TtsSessionCircuit;
  minFallbackIntervalMs?: number | string | null;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => number;
  clearTimeoutFn?: (id: number) => void;
  urlApi?: ObjectUrlApi;
}

export interface EpisodeBatchCompilerController {
  subscribe: (listener: (snapshot: EpisodeBatchCompilerSnapshot) => void) => () => void;
  getSnapshot: () => EpisodeBatchCompilerSnapshot;
  startCompilation: () => void;
  startPodcast: () => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  previous: () => void;
  next: () => void;
  seekToMs: (targetMs: number) => void;
  restart: () => void;
  replay: () => void;
  syncClock: (overrideElapsedMs?: number) => void;
  retryFailedTurns: () => void;
  cancel: () => void;
  dispose: () => void;
  getFullWavBlob: () => Blob | null;
  getBatchWavBlob: (batchIndex: number) => Blob | null;
}

interface InternalTurn {
  segment: DialogueSegment;
  order: number;
  host: Host;
  expectedIdentityId: KuromateIdentityProfileId;
  batchIndex: number;
  state: TurnCompilationState;
  autoRetryUsed: boolean;
  failureReason: TurnFailureReason | null;
  errorMessage: string | null;
  retryAfterMs: number | null;
  pcmBytes: Uint8Array | null;
  sampleCount: number;
  durationMs: number | null;
  paddingAfterMs: number;
  fallbackUsed: boolean;
  abortController: AbortController | null;
}

interface InternalBatch {
  batchIndex: number;
  turnIndices: number[];
  status: BatchCompilationStatus;
  startSample: number;
  endSample: number;
  startMs: number;
  endMs: number;
  wavBlob: Blob | null;
  objectUrl: string | null;
  timeline: CompiledTimelineSegment[];
}

function isBlockingFailure(
  errorCode: TtsErrorCode,
  httpStatus: number,
  quotaClass: TtsQuotaClass,
): { reason: TurnFailureReason; blocking: boolean } {
  if (errorCode === "TTS_NOT_CONFIGURED") {
    return { reason: "config_error", blocking: true };
  }
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 402) {
    return { reason: "auth_error", blocking: true };
  }
  if (httpStatus === 400 || errorCode === "INVALID_TTS_INPUT") {
    return { reason: "invalid_input", blocking: true };
  }
  if (errorCode === "TTS_IDENTITY_MISMATCH") {
    return { reason: "identity_mismatch", blocking: true };
  }
  if (errorCode === "TTS_RATE_LIMITED" || httpStatus === 429) {
    if (quotaClass === "long_quota_wait") {
      return { reason: "capacity", blocking: true };
    }
    return { reason: "capacity", blocking: false };
  }
  if (errorCode === "TTS_TIMEOUT" || httpStatus === 504 || httpStatus === 408) {
    return { reason: "timeout", blocking: false };
  }
  if (errorCode === "TTS_PROVIDER_UNAVAILABLE" || httpStatus === 503) {
    return { reason: "unavailable", blocking: false };
  }
  if (errorCode === "TTS_AUDIO_INVALID") {
    return { reason: "invalid_audio", blocking: false };
  }
  if (errorCode === "TTS_GENERATION_FAILED") {
    return { reason: "safety", blocking: true };
  }
  return { reason: "unavailable", blocking: false };
}

/**
 * Authoritative WP-012 Hybrid 4-Turn Batch Compiler & Stitched-Timeline Playback Controller.
 * Enforces NO AUDIO, NO ADVANCE for live episodes and zero network calls for Sample Preview.
 */
export function createEpisodeBatchCompiler(
  episode: Episode,
  options: EpisodeBatchCompilerOptions,
): EpisodeBatchCompilerController {
  const source: EpisodeSourceKind = options.source ?? "generated";
  const isSamplePreview = source === "sample";
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimeoutFn ?? ((fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number);
  const clearTimer = options.clearTimeoutFn ?? ((id) => globalThis.clearTimeout(id));
  const fallbackIntervalMs = resolveTtsRequestIntervalMs(options.minFallbackIntervalMs);
  const sessionCircuit = options.sessionCircuit ?? createTtsSessionCircuit();
  const urlPool: EpisodeObjectUrlPool = createEpisodeObjectUrlPool(options.urlApi);

  const orderedSegments = [...episode.segments].sort((a, b) => a.order - b.order);
  const hostsById = new Map<string, Host>(episode.hosts.map((h) => [h.id, h]));
  const identityMap = resolveEpisodeVoiceIdentities(episode.hosts);
  const hostIdentities = Object.fromEntries(identityMap.entries()) as Record<
    string,
    KuromateIdentityProfileId
  >;
  const downloadFilename = buildEpisodeAudioFilename(episode);

  let sessionToken = 1;
  let disposed = false;
  let cancelled = false;
  let compilationState: EpisodeCompilationState = isSamplePreview ? "complete" : "idle";
  let playbackStatus: PlaybackStatus = "idle";
  let isAutoplayBlocked = false;
  let hasStartedPodcast = isSamplePreview;
  let isConfigBlocked = false;
  let providerFallbackActivated = sessionCircuit.isPrimaryOpen(now());
  let effectiveConcurrency = providerFallbackActivated ? FALLBACK_TTS_CONCURRENCY : PRIMARY_TTS_CONCURRENCY;
  let activeRequests = 0;
  let peakConcurrentRequests = 0;
  let ttsRequestCount = 0;
  let replayCount = 0;
  let lastRequestStartMs = 0;
  let schedulerTimerId: number | null = null;
  let sampleAdvanceTimerId: number | null = null;

  let playingBatchIndex = 0;
  let currentSegmentIndex = 0;
  let elapsedMs = 0;
  let pausedAtTimeSec = 0;
  let wantsToPlayAfterBoundary = false;
  let isBufferingAtBoundary = false;
  let boundaryFailedBatchIndex: number | null = null;
  let fullWavBlob: Blob | null = null;
  let fullAudioUrl: string | null = null;
  let fullDurationMs: number | null = null;
  let compiledTimeline: CompiledTimelineSegment[] = [];
  let compiledDurationMs = 0;

  const turns: InternalTurn[] = orderedSegments.map((seg, idx) => {
    const host = hostsById.get(seg.speakerId) ?? episode.hosts[0];
    const nextSeg = idx + 1 < orderedSegments.length ? orderedSegments[idx + 1] : null;
    const batchIndex = Math.floor(idx / TTS_BATCH_SIZE);
    const expectedIdentityId = identityMap.get(host.id) ?? "kuromate_guest_01_v1";
    const paddingAfterMs = resolveInterTurnPauseMs(
      seg,
      nextSeg,
      idx === orderedSegments.length - 1,
    );
    return {
      segment: seg,
      order: seg.order,
      host,
      expectedIdentityId,
      batchIndex,
      state: isSamplePreview ? "ready" : "pending",
      autoRetryUsed: false,
      failureReason: null,
      errorMessage: null,
      retryAfterMs: null,
      pcmBytes: null,
      sampleCount: 0,
      durationMs: isSamplePreview ? getSegmentDurationMs(seg) : null,
      paddingAfterMs,
      fallbackUsed: false,
      abortController: null,
    };
  });

  const batchCount = Math.max(1, Math.ceil(turns.length / TTS_BATCH_SIZE));
  const batches: InternalBatch[] = Array.from({ length: batchCount }, (_, bIdx) => {
    const startIdx = bIdx * TTS_BATCH_SIZE;
    const endIdx = Math.min(turns.length, startIdx + TTS_BATCH_SIZE);
    const turnIndices: number[] = [];
    for (let i = startIdx; i < endIdx; i += 1) {
      turnIndices.push(i);
    }
    return {
      batchIndex: bIdx,
      turnIndices,
      status: isSamplePreview ? "ready" : "pending",
      startSample: 0,
      endSample: 0,
      startMs: 0,
      endMs: 0,
      wavBlob: null,
      objectUrl: null,
      timeline: [],
    };
  });

  if (isSamplePreview) {
    let cursorMs = 0;
    compiledTimeline = turns.map((t, idx) => {
      const dur = t.durationMs ?? 3000;
      const startMs = cursorMs;
      const endMs = startMs + dur;
      cursorMs = endMs;
      return {
        segmentId: t.segment.id,
        order: idx,
        speakerId: t.host.id,
        identityProfileId: t.expectedIdentityId,
        startSample: startMs * 24,
        speechStartSample: startMs * 24,
        speechEndSample: endMs * 24,
        endSample: endMs * 24,
        startMs,
        speechStartMs: startMs,
        speechEndMs: endMs,
        endMs,
        speechDurationMs: dur,
        paddingAfterMs: 0,
      };
    });
    compiledDurationMs = cursorMs;
    fullDurationMs = cursorMs;
  }

  const listeners = new Set<(snap: EpisodeBatchCompilerSnapshot) => void>();

  function clearScheduledTimers() {
    if (schedulerTimerId !== null) {
      clearTimer(schedulerTimerId);
      schedulerTimerId = null;
    }
    if (sampleAdvanceTimerId !== null) {
      clearTimer(sampleAdvanceTimerId);
      sampleAdvanceTimerId = null;
    }
  }

  function isOpeningBatchRequiredCount(): number {
    return episode.length === "quick" ? turns.length : batches[0]?.turnIndices.length ?? 0;
  }

  function isAllBatchesReady(): boolean {
    return batches.every((b) => b.status === "ready");
  }

  function isCanPlay(): boolean {
    if (disposed || cancelled || isConfigBlocked) return false;
    if (isSamplePreview) return true;
    if (turns.length === 0) return false;
    if (episode.length === "quick") {
      return isAllBatchesReady() && fullWavBlob !== null;
    }
    return batches[0]?.status === "ready" && batches[0]?.objectUrl !== null;
  }

  function resolveSnapshot(): EpisodeBatchCompilerSnapshot {
    const failedTurnIds = turns
      .filter((t) => t.state === "failed-retryable" || t.state === "failed-blocking")
      .map((t) => t.segment.id);
    const hasRetryableFailure = turns.some((t) => t.state === "failed-retryable");
    const hasBlockingFailure = turns.some((t) => t.state === "failed-blocking");
    const firstError = turns.find((t) => t.errorMessage !== null)?.errorMessage ?? null;

    let activeSegIdx = currentSegmentIndex;
    let isSpeaking = false;
    let isInPadding = false;
    let reactionHostId: string | null = null;

    if (isSamplePreview) {
      activeSegIdx = Math.max(0, Math.min(turns.length - 1, currentSegmentIndex));
      isSpeaking = playbackStatus === "playing";
    } else if (compiledTimeline.length > 0 && !isBufferingAtBoundary) {
      const lookup = resolveTimelineStateAtMs(compiledTimeline, elapsedMs);
      if (lookup) {
        activeSegIdx = lookup.index;
        isSpeaking = playbackStatus === "playing" && lookup.isSpeaking;
        isInPadding = playbackStatus === "playing" && lookup.isInPadding;
      }
    }

    const activeTurn = turns[activeSegIdx];
    const previousTurn = activeSegIdx > 0 ? turns[activeSegIdx - 1] : null;
    if (isSpeaking && activeTurn?.segment.emotion === "reacting") {
      reactionHostId =
        (previousTurn && previousTurn.host.id !== activeTurn.host.id ? previousTurn.host.id : null) ??
        episode.hosts.find((h) => h.id !== activeTurn.host.id)?.id ??
        null;
    }

    const bufferingBatch =
      isBufferingAtBoundary && playingBatchIndex + 1 < batches.length
        ? batches[playingBatchIndex + 1]
        : null;
    const bufferingTurnRange = bufferingBatch
      ? `${bufferingBatch.turnIndices[0] + 1}–${
          bufferingBatch.turnIndices[bufferingBatch.turnIndices.length - 1] + 1
        }`
      : null;

    const openingCount = isOpeningBatchRequiredCount();
    const openingReady = turns
      .slice(0, openingCount)
      .filter((t) => t.state === "ready").length;
    const completedTurns = turns.filter((t) => t.state === "ready").length;
    const canDownload = !isSamplePreview && !disposed && !cancelled && isAllBatchesReady() && fullWavBlob !== null;
    const canScrub =
      !isSamplePreview &&
      !disposed &&
      !cancelled &&
      hasStartedPodcast &&
      compiledDurationMs > 0 &&
      (episode.length === "quick" ? isAllBatchesReady() : batches[0]?.status === "ready");

    return {
      sessionId: sessionToken,
      episodeId: episode.id,
      source,
      isSamplePreview,
      compilationState,
      playbackStatus,
      isAutoplayBlocked,
      hasStartedPodcast,
      canPlay: isCanPlay(),
      canScrub,
      canDownloadAudio: canDownload,
      isConfigBlocked,
      isBufferingAtBoundary,
      bufferingTurnRange,
      boundaryFailedBatchIndex,
      providerFallbackActivated,
      effectiveConcurrency,
      activeRequests,
      peakConcurrentRequests,
      ttsRequestCount,
      replayCount,
      activeBatchIndex: playingBatchIndex,
      totalBatches: batches.length,
      completedTurns,
      totalTurns: turns.length,
      openingBatchReadyCount: openingReady,
      openingBatchTotalCount: openingCount,
      failedTurnIds,
      failureMessage: firstError,
      hasRetryableFailure,
      hasBlockingFailure,
      compiledDurationMs,
      fullDurationMs,
      elapsedMs,
      playableRangeMs: compiledDurationMs,
      activeSegmentIndex: activeSegIdx,
      activeSegment: activeTurn?.segment,
      previousSegment: previousTurn?.segment ?? null,
      activeSpeakerId: activeTurn?.host.id ?? "",
      activeHost: activeTurn?.host,
      previousHost: previousTurn?.host,
      isSpeaking,
      isInPadding,
      reactionHostId,
      downloadFilename,
      fullAudioUrl,
      turns: turns.map((t) => ({
        segmentId: t.segment.id,
        order: t.order,
        speakerId: t.host.id,
        expectedIdentityId: t.expectedIdentityId,
        batchIndex: t.batchIndex,
        state: t.state,
        autoRetryUsed: t.autoRetryUsed,
        failureReason: t.failureReason,
        errorMessage: t.errorMessage,
        durationMs: t.durationMs,
        paddingAfterMs: t.paddingAfterMs,
        fallbackUsed: t.fallbackUsed,
      })),
      batches: batches.map((b) => ({
        batchIndex: b.batchIndex,
        turnStartNumber: b.turnIndices[0] + 1,
        turnEndNumber: b.turnIndices[b.turnIndices.length - 1] + 1,
        status: b.status,
        completedTurns: b.turnIndices.filter((i) => turns[i].state === "ready").length,
        totalTurns: b.turnIndices.length,
        startMs: b.startMs,
        endMs: b.endMs,
        hasObjectUrl: b.objectUrl !== null,
      })),
      timeline: compiledTimeline,
      hostIdentities,
      objectUrlCount: urlPool.size(),
    };
  }

  function emit() {
    if (disposed) return;
    const snap = resolveSnapshot();
    for (const listener of listeners) {
      listener(snap);
    }
  }

  function recomputeCompilationStatus() {
    if (disposed) {
      compilationState = "disposed";
      return;
    }
    if (cancelled) {
      compilationState = "cancelled";
      return;
    }
    if (isSamplePreview) {
      compilationState = "complete";
      return;
    }
    if (isConfigBlocked || turns.some((t) => t.state === "failed-blocking")) {
      compilationState = "failed-blocking";
      return;
    }
    if (turns.some((t) => t.state === "failed-retryable")) {
      compilationState = "failed-retryable";
      return;
    }
    if (isBufferingAtBoundary) {
      compilationState = "buffering-at-boundary";
      return;
    }
    if (isAllBatchesReady() && fullWavBlob !== null) {
      compilationState = "complete";
      return;
    }
    if (episode.length === "detailed" && batches[0]?.status === "ready") {
      compilationState = hasStartedPodcast ? "compiling-background" : "ready-to-play";
      return;
    }
    compilationState = "compiling-opening-batch";
  }

  function stitchBatchAt(batchIndex: number) {
    const batch = batches[batchIndex];
    if (!batch) return;
    if (batchIndex > 0 && batches[batchIndex - 1].status !== "ready") return;
    const allBatchReady = batch.turnIndices.every((i) => turns[i].state === "ready" && turns[i].pcmBytes);
    if (!allBatchReady) return;

    const startOffsetSamples =
      batchIndex === 0 ? 0 : batches[batchIndex - 1].endSample;

    const stitched = stitchSegmentsToWav(
      batch.turnIndices.map((idx) => {
        const t = turns[idx];
        return {
          segmentId: t.segment.id,
          order: t.order,
          speakerId: t.host.id,
          identityProfileId: t.expectedIdentityId,
          role: t.host.role,
          turnKind: t.segment.emotion,
          pcmBytes: t.pcmBytes!,
          sampleCount: t.sampleCount,
          paddingAfterMs: t.paddingAfterMs,
        };
      }),
      {
        startOffsetSamples,
        isEpisodeTail: batchIndex === batches.length - 1,
      },
    );

    batch.startSample = startOffsetSamples;
    batch.endSample = startOffsetSamples + stitched.totalSamples;
    batch.startMs = stitched.timeline[0]?.startMs ?? Math.round((startOffsetSamples * 1000) / 24000);
    batch.endMs = stitched.timeline[stitched.timeline.length - 1]?.endMs ?? batch.startMs;
    batch.wavBlob = stitched.wavBlob;
    batch.objectUrl = urlPool.set(`batch:${sessionToken}:${batchIndex}`, stitched.wavBlob);
    batch.timeline = stitched.timeline;
    batch.status = "ready";
  }

  function stitchBatchAndContiguousTimeline(triggerBatchIndex: number) {
    // Stitch contiguous prefix cleanly in sample order whenever batch b-1 is ready
    const nextTimeline: CompiledTimelineSegment[] = [];
    let contiguousEnd = 0;
    for (let bIdx = 0; bIdx < batches.length; bIdx += 1) {
      const b = batches[bIdx];
      const turnsReady = b.turnIndices.every((i) => turns[i].state === "ready" && turns[i].pcmBytes);
      if (!turnsReady) break;
      const expectedOffset = bIdx === 0 ? 0 : batches[bIdx - 1].endSample;
      if (b.status !== "ready" || b.startSample !== expectedOffset) {
        stitchBatchAt(bIdx);
      }
      if (b.status !== "ready") break;
      nextTimeline.push(...b.timeline);
      contiguousEnd = b.endMs;
    }
    compiledTimeline = nextTimeline;
    compiledDurationMs = contiguousEnd;

    // When all batches finish cleanly, assemble the complete downloadable full-episode WAV
    if (isAllBatchesReady() && !fullWavBlob) {
      const fullStitched = stitchSegmentsToWav(
        turns.map((t) => ({
          segmentId: t.segment.id,
          order: t.order,
          speakerId: t.host.id,
          identityProfileId: t.expectedIdentityId,
          role: t.host.role,
          turnKind: t.segment.emotion,
          pcmBytes: t.pcmBytes!,
          sampleCount: t.sampleCount,
          paddingAfterMs: t.paddingAfterMs,
        })),
        { startOffsetSamples: 0, isEpisodeTail: true },
      );
      fullWavBlob = fullStitched.wavBlob;
      fullAudioUrl = urlPool.set(`full:${sessionToken}`, fullStitched.wavBlob);
      fullDurationMs = fullStitched.totalDurationMs;
      compiledTimeline = fullStitched.timeline;
      compiledDurationMs = fullStitched.totalDurationMs;
    }

    // If waiting at boundary for the next batch and it is now ready, resume cleanly when safe
    const waitingNextIdx = playingBatchIndex + 1;
    if (
      isBufferingAtBoundary &&
      (triggerBatchIndex === waitingNextIdx || batches[waitingNextIdx]?.status === "ready") &&
      batches[waitingNextIdx]?.status === "ready"
    ) {
      isBufferingAtBoundary = false;
      boundaryFailedBatchIndex = null;
      recomputeCompilationStatus();
      if (wantsToPlayAfterBoundary && !cancelled && !disposed) {
        void startBatchPlayback(waitingNextIdx, 0);
        return;
      }
    }

    recomputeCompilationStatus();
    emit();
  }

  function makeDriverCallbacks(tokenAtStart: number, batchIdx: number): BatchAudioDriverCallbacks {
    return {
      onTimeUpdate(currentTimeSec) {
        if (disposed || cancelled || tokenAtStart !== sessionToken || batchIdx !== playingBatchIndex) {
          return;
        }
        const batch = batches[batchIdx];
        if (!batch) return;
        const nextMs = Math.min(batch.endMs, batch.startMs + Math.round(currentTimeSec * 1000));
        elapsedMs = Math.max(elapsedMs, nextMs);
        const lookup = resolveTimelineStateAtMs(compiledTimeline, elapsedMs);
        if (lookup) {
          currentSegmentIndex = lookup.index;
        }
        emit();
      },
      onPlay() {
        if (disposed || cancelled || tokenAtStart !== sessionToken) return;
        playbackStatus = "playing";
        isAutoplayBlocked = false;
        emit();
      },
      onPause() {
        if (disposed || cancelled || tokenAtStart !== sessionToken) return;
        if (playbackStatus === "playing" && !isBufferingAtBoundary) {
          playbackStatus = "paused";
          emit();
        }
      },
      onEnded() {
        if (disposed || cancelled || tokenAtStart !== sessionToken || batchIdx !== playingBatchIndex) {
          return;
        }
        const nextBatchIdx = batchIdx + 1;
        if (nextBatchIdx >= batches.length) {
          elapsedMs = fullDurationMs ?? compiledDurationMs;
          playbackStatus = "complete";
          wantsToPlayAfterBoundary = false;
          emit();
          return;
        }

        const nextBatch = batches[nextBatchIdx];
        if (nextBatch.status === "ready" && nextBatch.objectUrl) {
          void startBatchPlayback(nextBatchIdx, 0);
          return;
        }

        // Strict NO AUDIO, NO ADVANCE enforcement at boundary
        elapsedMs = batches[batchIdx].endMs;
        if (nextBatch.status === "failed") {
          isBufferingAtBoundary = false;
          boundaryFailedBatchIndex = nextBatchIdx;
          wantsToPlayAfterBoundary = false;
          playbackStatus = "paused";
          recomputeCompilationStatus();
          emit();
          return;
        }

        isBufferingAtBoundary = true;
        boundaryFailedBatchIndex = null;
        wantsToPlayAfterBoundary = true;
        playbackStatus = "paused";
        recomputeCompilationStatus();
        emit();
      },
      onDecodeError() {
        if (disposed || cancelled || tokenAtStart !== sessionToken) return;
        playbackStatus = "paused";
        wantsToPlayAfterBoundary = false;
        emit();
      },
    };
  }

  async function startBatchPlayback(batchIndex: number, offsetWithinBatchSec: number) {
    const batch = batches[batchIndex];
    if (!batch || !batch.objectUrl || cancelled || disposed) return;
    const tokenAtStart = sessionToken;
    playingBatchIndex = batchIndex;
    pausedAtTimeSec = Math.max(0, offsetWithinBatchSec);
    elapsedMs = batch.startMs + Math.round(pausedAtTimeSec * 1000);
    isBufferingAtBoundary = false;
    boundaryFailedBatchIndex = null;

    const outcome = await options.audioDriver.loadAndPlay(
      batch.objectUrl,
      pausedAtTimeSec,
      makeDriverCallbacks(tokenAtStart, batchIndex),
    );
    if (disposed || cancelled || tokenAtStart !== sessionToken) return;
    if (outcome.ok) {
      playbackStatus = "playing";
      isAutoplayBlocked = false;
      const lookup = resolveTimelineStateAtMs(compiledTimeline, elapsedMs);
      if (lookup) currentSegmentIndex = lookup.index;
    } else if (outcome.reason === "autoplay_blocked") {
      playbackStatus = "paused";
      isAutoplayBlocked = true;
    } else if (outcome.reason !== "aborted") {
      playbackStatus = "paused";
    }
    recomputeCompilationStatus();
    emit();
  }

  function downshiftToSequentialFallback(reason: "fallback" | "circuit", retryAfterHeader?: string | null) {
    providerFallbackActivated = true;
    effectiveConcurrency = FALLBACK_TTS_CONCURRENCY;
    const nowMs = now();
    if (reason === "circuit") {
      const cls = classifyRetryAfter(retryAfterHeader, { nowMs });
      if (cls.quotaClass === "long_quota_wait") {
        sessionCircuit.openPrimary(nowMs, cls.rawSeconds);
      }
    }
  }

  function applyFailureToTurn(
    turnIndex: number,
    reason: TurnFailureReason,
    blocking: boolean,
    message: string,
    retryAfterMs: number | null = null,
  ) {
    const turn = turns[turnIndex];
    const batch = batches[turn.batchIndex];

    // Bounded 1 automatic retry strictly for that turn when non-blocking and not already retried
    if (!blocking && !turn.autoRetryUsed && !isConfigBlocked && !cancelled && !disposed) {
      turn.autoRetryUsed = true;
      turn.state = "retrying";
      turn.failureReason = reason;
      turn.errorMessage = message;
      turn.retryAfterMs = retryAfterMs;
      recomputeCompilationStatus();
      emit();
      scheduleNextDispatch(retryAfterMs ?? 0);
      return;
    }

    turn.state = blocking ? "failed-blocking" : "failed-retryable";
    turn.failureReason = reason;
    turn.errorMessage = message;
    turn.retryAfterMs = null;
    batch.status = "failed";

    if (reason === "config_error") {
      isConfigBlocked = true;
      // Stop further unstarted/pending requests cleanly
      for (const other of turns) {
        if (other.state === "pending" || other.state === "queued") {
          other.state = "cancelled";
        }
      }
    }

    if (isBufferingAtBoundary && turn.batchIndex === playingBatchIndex + 1) {
      isBufferingAtBoundary = false;
      boundaryFailedBatchIndex = turn.batchIndex;
      wantsToPlayAfterBoundary = false;
    }

    recomputeCompilationStatus();
    emit();
  }

  function pickNextRunnableTurnIndex(): number | null {
    if (turns.some((t) => t.state === "failed-blocking")) {
      return null;
    }
    // Prioritize opening batch (Batch 0) strictly before later batches, then sequential batches, and honor retrying turns
    const candidates = turns
      .map((t, idx) => ({ t, idx }))
      .filter(
        ({ t }) =>
          t.state === "pending" || t.state === "queued" || t.state === "retrying",
      );
    if (candidates.length === 0) return null;

    // For Detailed episodes, prioritize Batch 0 completely before starting Batches >= 1
    if (episode.length === "detailed" && batches[0]?.status !== "ready") {
      const b0 = candidates.find(({ t }) => t.batchIndex === 0);
      return b0 ? b0.idx : null;
    }

    return candidates[0].idx;
  }

  function scheduleNextDispatch(extraDelayMs: number = 0) {
    if (disposed || cancelled || isSamplePreview || isConfigBlocked) return;
    if (schedulerTimerId !== null) {
      clearTimer(schedulerTimerId);
      schedulerTimerId = null;
    }

    const runnableIdx = pickNextRunnableTurnIndex();
    if (runnableIdx === null) return;
    if (activeRequests >= effectiveConcurrency) return;

    const currentNowMs = now();
    let waitMs = extraDelayMs;
    if (providerFallbackActivated && lastRequestStartMs > 0) {
      const elapsedSinceLast = currentNowMs - lastRequestStartMs;
      if (elapsedSinceLast < fallbackIntervalMs) {
        waitMs = Math.max(waitMs, fallbackIntervalMs - elapsedSinceLast);
      }
    }

    const turnWait = turns[runnableIdx]?.retryAfterMs ?? 0;
    if (turnWait > waitMs) waitMs = turnWait;

    if (waitMs <= 0) {
      void dispatchTurn(runnableIdx);
      // Fill remaining concurrency slots up to effectiveConcurrency (<= 4) synchronously
      if (activeRequests < effectiveConcurrency) {
        scheduleNextDispatch(0);
      }
      return;
    }

    const scheduledToken = sessionToken;
    schedulerTimerId = setTimer(() => {
      schedulerTimerId = null;
      if (disposed || cancelled || scheduledToken !== sessionToken) return;
      pumpQueue();
    }, waitMs);
  }

  function pumpQueue() {
    if (disposed || cancelled || isSamplePreview || isConfigBlocked) return;
    while (activeRequests < effectiveConcurrency) {
      const nextIdx = pickNextRunnableTurnIndex();
      if (nextIdx === null) break;
      if (providerFallbackActivated && lastRequestStartMs > 0) {
        const elapsed = now() - lastRequestStartMs;
        if (elapsed < fallbackIntervalMs) {
          scheduleNextDispatch(fallbackIntervalMs - elapsed);
          break;
        }
      }
      const retryDelay = turns[nextIdx].retryAfterMs ?? 0;
      if (retryDelay > 0) {
        turns[nextIdx].retryAfterMs = null;
        scheduleNextDispatch(retryDelay);
        break;
      }
      void dispatchTurn(nextIdx);
    }
  }

  async function dispatchTurn(turnIndex: number) {
    const turn = turns[turnIndex];
    if (!turn || disposed || cancelled || isConfigBlocked) return;

    const batch = batches[turn.batchIndex];
    const tokenAtDispatch = sessionToken;
    const controller = new AbortController();
    turn.abortController = controller;
    turn.state = "requesting";
    turn.retryAfterMs = null;
    if (batch.status === "pending" || batch.status === "failed") {
      batch.status = "compiling";
    }

    activeRequests += 1;
    if (activeRequests > peakConcurrentRequests) {
      peakConcurrentRequests = activeRequests;
    }
    ttsRequestCount += 1;
    lastRequestStartMs = now();
    recomputeCompilationStatus();
    emit();

    const payload: CompilerSegmentRequestPayload = {
      segmentId: turn.segment.id,
      speakerId: turn.host.id,
      role: turn.host.role,
      profileId: ROLE_TO_PROFILE_ID[turn.host.role],
      voiceIdentityId: turn.expectedIdentityId,
      voiceId: turn.host.voiceId,
      avatarId: turn.host.avatarId,
      hostName: turn.host.name,
      ...(providerFallbackActivated || sessionCircuit.isPrimaryOpen(now())
        ? { routePreference: "fallback" as TtsRoutePreference }
        : {}),
      text: turn.segment.text,
    };

    try {
      const res = await options.fetchSegmentAudio(payload, controller.signal);

      // Reject stale completions after cancel / dispose / new session
      if (disposed || cancelled || tokenAtDispatch !== sessionToken || controller.signal.aborted) {
        return;
      }

      turn.abortController = null;

      if (!res.ok) {
        if (res.fallbackUsed || res.quotaClass === "long_quota_wait") {
          downshiftToSequentialFallback(
            res.quotaClass === "long_quota_wait" ? "circuit" : "fallback",
            res.retryAfterHeader,
          );
        }
        const cls = res.quotaClass ?? classifyRetryAfter(res.retryAfterHeader, { nowMs: now() }).quotaClass;
        const mapped = isBlockingFailure(res.errorCode, res.httpStatus, cls);
        const retryWait =
          !mapped.blocking && res.httpStatus === 429
            ? parseRetryAfterMs(res.retryAfterHeader, now())
            : !mapped.blocking
              ? 300
              : null;
        applyFailureToTurn(
          turnIndex,
          mapped.reason,
          mapped.blocking || !res.retryable,
          res.message,
          retryWait,
        );
        return;
      }

      // Section 19 strict identity check: missing or wrong identity NEVER becomes playable audio!
      if (!res.voiceIdentityId || res.voiceIdentityId !== turn.expectedIdentityId) {
        applyFailureToTurn(
          turnIndex,
          "identity_mismatch",
          true,
          "Returned audio voice identity did not match the expected Kuromate.",
        );
        return;
      }

      if (!res.contentType.toLowerCase().includes("audio/wav")) {
        applyFailureToTurn(
          turnIndex,
          "invalid_audio",
          false,
          "Voice response was not a valid 24 kHz WAV stream.",
          300,
        );
        return;
      }

      turn.state = "validating";
      emit();

      let parsed: ParsedWavPcm;
      try {
        parsed = parseWavBuffer(res.bytes);
      } catch {
        applyFailureToTurn(
          turnIndex,
          "invalid_audio",
          false,
          "Voice audio failed WAV header or PCM integrity checks.",
          300,
        );
        return;
      }

      if (res.fallbackUsed) {
        downshiftToSequentialFallback("fallback", res.retryAfterHeader);
        if (res.quotaClass === "long_quota_wait") {
          sessionCircuit.openPrimary(
            now(),
            classifyRetryAfter(res.retryAfterHeader, { nowMs: now() }).rawSeconds,
          );
        }
      }

      turn.pcmBytes = parsed.pcmBytes;
      turn.sampleCount = parsed.sampleCount;
      turn.durationMs = parsed.durationMs;
      turn.fallbackUsed = res.fallbackUsed;
      turn.failureReason = null;
      turn.errorMessage = null;
      turn.state = "ready";

      stitchBatchAndContiguousTimeline(turn.batchIndex);
      if (hasStartedPodcast && compiledTimeline.length > 0) {
        const lookup = resolveTimelineStateAtMs(compiledTimeline, elapsedMs);
        if (lookup) currentSegmentIndex = lookup.index;
      }
      recomputeCompilationStatus();
      emit();
    } catch {
      if (disposed || cancelled || tokenAtDispatch !== sessionToken || controller.signal.aborted) {
        return;
      }
      applyFailureToTurn(
        turnIndex,
        "unavailable",
        false,
        "Unable to reach hosted voice service for this turn.",
        400,
      );
    } finally {
      activeRequests = Math.max(0, activeRequests - 1);
      turn.abortController = null;
      if (!disposed && !cancelled && tokenAtDispatch === sessionToken) {
        pumpQueue();
      }
    }
  }

  function clearSamplePlaybackTimer() {
    if (sampleAdvanceTimerId !== null) {
      clearTimer(sampleAdvanceTimerId);
      sampleAdvanceTimerId = null;
    }
  }

  function scheduleSampleAdvance(segIdx: number) {
    clearSamplePlaybackTimer();
    if (disposed || cancelled || !isSamplePreview || playbackStatus !== "playing") return;
    const seg = turns[segIdx];
    if (!seg) return;
    const dur = seg.durationMs ?? 3000;
    const tokenAtSchedule = sessionToken;
    sampleAdvanceTimerId = setTimer(() => {
      sampleAdvanceTimerId = null;
      if (disposed || cancelled || tokenAtSchedule !== sessionToken || playbackStatus !== "playing") {
        return;
      }
      if (segIdx + 1 < turns.length) {
        currentSegmentIndex = segIdx + 1;
        elapsedMs = compiledTimeline[currentSegmentIndex]?.startMs ?? elapsedMs + dur;
        emit();
        scheduleSampleAdvance(currentSegmentIndex);
      } else {
        playbackStatus = "complete";
        elapsedMs = compiledDurationMs;
        emit();
      }
    }, dur);
  }

  function seekInternal(targetMs: number, preservePlayingState: boolean) {
    if (disposed || cancelled || isSamplePreview) return;
    const clampedMs = Math.max(0, Math.min(compiledDurationMs, Math.round(targetMs)));
    if (compiledTimeline.length === 0) return;

    const lookup = resolveTimelineStateAtMs(compiledTimeline, clampedMs);
    if (!lookup) return;

    const targetTurn = turns[lookup.index];
    const targetBatch = batches[targetTurn.batchIndex];
    if (!targetBatch || targetBatch.status !== "ready" || !targetBatch.objectUrl) {
      return;
    }

    const offsetSec = Math.max(0, (clampedMs - targetBatch.startMs) / 1000);
    elapsedMs = clampedMs;
    currentSegmentIndex = lookup.index;
    const wasPlaying = preservePlayingState && playbackStatus === "playing";

    if (targetBatch.batchIndex === playingBatchIndex && wasPlaying) {
      options.audioDriver.seekTo(offsetSec);
      pausedAtTimeSec = offsetSec;
      emit();
      return;
    }

    pausedAtTimeSec = offsetSec;
    if (wasPlaying) {
      void startBatchPlayback(targetBatch.batchIndex, offsetSec);
    } else {
      playingBatchIndex = targetBatch.batchIndex;
      emit();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(resolveSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return resolveSnapshot();
    },
    startCompilation() {
      if (disposed || cancelled || isSamplePreview) return;
      if (compilationState !== "idle") return;
      if (sessionCircuit.isAllHostedDailyExhausted(now())) {
        providerFallbackActivated = true;
        effectiveConcurrency = FALLBACK_TTS_CONCURRENCY;
        for (let i = 0; i < turns.length; i += 1) {
          turns[i].state = "failed-blocking";
          turns[i].failureReason = "capacity";
          turns[i].errorMessage =
            "Hosted Kuromate voices reached today’s project limit. Please try again later.";
        }
        for (const b of batches) b.status = "failed";
        recomputeCompilationStatus();
        emit();
        return;
      }
      recomputeCompilationStatus();
      emit();
      pumpQueue();
    },
    startPodcast() {
      if (!isCanPlay()) return;
      hasStartedPodcast = true;
      emit();
      this.play();
    },
    play() {
      if (!isCanPlay()) return;
      hasStartedPodcast = true;
      if (isSamplePreview) {
        if (playbackStatus === "complete") {
          currentSegmentIndex = 0;
          elapsedMs = 0;
        }
        playbackStatus = "playing";
        emit();
        scheduleSampleAdvance(currentSegmentIndex);
        return;
      }

      if (playbackStatus === "complete") {
        replayCount += 1;
        elapsedMs = 0;
        currentSegmentIndex = 0;
        void startBatchPlayback(0, 0);
        return;
      }

      if (isBufferingAtBoundary) {
        wantsToPlayAfterBoundary = true;
        emit();
        return;
      }

      if (playbackStatus === "paused" && batches[playingBatchIndex]?.objectUrl && !isAutoplayBlocked) {
        void options.audioDriver
          .resume(makeDriverCallbacks(sessionToken, playingBatchIndex))
          .then((outcome) => {
            if (disposed || cancelled) return;
            if (outcome.ok) {
              playbackStatus = "playing";
              emit();
            } else if (outcome.reason === "autoplay_blocked") {
              isAutoplayBlocked = true;
              playbackStatus = "paused";
              emit();
            }
          });
        return;
      }

      const startBatch = batches[playingBatchIndex]?.objectUrl ? playingBatchIndex : 0;
      const startOffsetSec =
        startBatch === playingBatchIndex ? Math.max(0, (elapsedMs - (batches[startBatch]?.startMs ?? 0)) / 1000) : 0;
      void startBatchPlayback(startBatch, startOffsetSec);
    },
    pause() {
      if (disposed) return;
      wantsToPlayAfterBoundary = false;
      if (isSamplePreview) {
        clearSamplePlaybackTimer();
        if (playbackStatus === "playing") {
          playbackStatus = "paused";
          emit();
        }
        return;
      }
      if (playbackStatus === "playing") {
        pausedAtTimeSec = options.audioDriver.pause();
        playbackStatus = "paused";
        emit();
      }
    },
    togglePlayPause() {
      if (playbackStatus === "playing") {
        this.pause();
      } else {
        this.play();
      }
    },
    previous() {
      if (disposed || cancelled) return;
      if (isSamplePreview) {
        currentSegmentIndex = Math.max(0, currentSegmentIndex - 1);
        elapsedMs = compiledTimeline[currentSegmentIndex]?.startMs ?? 0;
        emit();
        if (playbackStatus === "playing") scheduleSampleAdvance(currentSegmentIndex);
        return;
      }
      const prevIdx = Math.max(0, currentSegmentIndex - 1);
      const targetSeg = compiledTimeline[prevIdx];
      if (targetSeg) {
        seekInternal(targetSeg.speechStartMs, playbackStatus === "playing");
      }
    },
    next() {
      if (disposed || cancelled) return;
      if (isSamplePreview) {
        currentSegmentIndex = Math.min(turns.length - 1, currentSegmentIndex + 1);
        elapsedMs = compiledTimeline[currentSegmentIndex]?.startMs ?? 0;
        emit();
        if (playbackStatus === "playing") scheduleSampleAdvance(currentSegmentIndex);
        return;
      }
      const nextIdx = Math.min(compiledTimeline.length - 1, currentSegmentIndex + 1);
      const targetSeg = compiledTimeline[nextIdx];
      if (targetSeg) {
        seekInternal(targetSeg.speechStartMs, playbackStatus === "playing");
      }
    },
    seekToMs(targetMs) {
      seekInternal(targetMs, true);
    },
    restart() {
      if (disposed || cancelled) return;
      if (isSamplePreview) {
        clearSamplePlaybackTimer();
        currentSegmentIndex = 0;
        elapsedMs = 0;
        playbackStatus = "paused";
        emit();
        return;
      }
      options.audioDriver.stop();
      playingBatchIndex = 0;
      currentSegmentIndex = 0;
      elapsedMs = 0;
      pausedAtTimeSec = 0;
      playbackStatus = "paused";
      emit();
    },
    replay() {
      if (!isCanPlay() && !isSamplePreview) return;
      if (isSamplePreview) {
        currentSegmentIndex = 0;
        elapsedMs = 0;
        playbackStatus = "playing";
        replayCount += 1;
        emit();
        scheduleSampleAdvance(0);
        return;
      }
      replayCount += 1;
      currentSegmentIndex = 0;
      elapsedMs = 0;
      playingBatchIndex = 0;
      void startBatchPlayback(0, 0);
    },
    syncClock(overrideElapsedMs) {
      if (disposed || cancelled || isSamplePreview) return;
      const batch = batches[playingBatchIndex];
      if (!batch) return;
      const nextElapsed =
        overrideElapsedMs !== undefined
          ? Math.max(0, Math.min(compiledDurationMs, Math.round(overrideElapsedMs)))
          : batch.startMs + Math.round(options.audioDriver.getCurrentTimeSec() * 1000);
      elapsedMs = nextElapsed;
      const lookup = resolveTimelineStateAtMs(compiledTimeline, elapsedMs);
      if (lookup) {
        currentSegmentIndex = lookup.index;
      }
      emit();
    },
    retryFailedTurns() {
      if (disposed || cancelled || isSamplePreview) return;
      const wasStoppedAtBoundary =
        hasStartedPodcast &&
        boundaryFailedBatchIndex !== null &&
        boundaryFailedBatchIndex === playingBatchIndex + 1;
      isConfigBlocked = false;
      boundaryFailedBatchIndex = null;
      const affectedBatches = new Set<number>();
      let anyReset = false;

      for (const turn of turns) {
        if (turn.state === "failed-retryable" || turn.state === "failed-blocking") {
          turn.state = "pending";
          turn.autoRetryUsed = false;
          turn.failureReason = null;
          turn.errorMessage = null;
          turn.retryAfterMs = null;
          affectedBatches.add(turn.batchIndex);
          anyReset = true;
        } else if (turn.state === "cancelled") {
          turn.state = "pending";
          affectedBatches.add(turn.batchIndex);
        }
      }
      if (!anyReset) return;

      for (const bIdx of affectedBatches) {
        batches[bIdx].status = "pending";
      }
      if (wasStoppedAtBoundary && affectedBatches.has(playingBatchIndex + 1)) {
        isBufferingAtBoundary = true;
        wantsToPlayAfterBoundary = true;
      }
      recomputeCompilationStatus();
      emit();
      pumpQueue();
    },
    cancel() {
      if (disposed || cancelled) return;
      cancelled = true;
      sessionToken += 1;
      clearScheduledTimers();
      options.audioDriver.stop();
      for (const turn of turns) {
        turn.abortController?.abort();
        turn.abortController = null;
        if (turn.state !== "ready") {
          turn.state = "cancelled";
        }
      }
      for (const batch of batches) {
        if (batch.status !== "ready") {
          batch.status = "cancelled";
        }
        batch.wavBlob = null;
        batch.objectUrl = null;
      }
      fullWavBlob = null;
      fullAudioUrl = null;
      urlPool.revokeAll();
      playbackStatus = "idle";
      wantsToPlayAfterBoundary = false;
      isBufferingAtBoundary = false;
      activeRequests = 0;
      compilationState = "cancelled";
      emit();
    },
    dispose() {
      if (disposed) return;
      sessionToken += 1;
      disposed = true;
      cancelled = true;
      clearScheduledTimers();
      options.audioDriver.dispose();
      for (const turn of turns) {
        turn.abortController?.abort();
        turn.abortController = null;
      }
      for (const batch of batches) {
        batch.wavBlob = null;
        batch.objectUrl = null;
      }
      fullWavBlob = null;
      fullAudioUrl = null;
      urlPool.revokeAll();
      listeners.clear();
    },
    getFullWavBlob() {
      return fullWavBlob;
    },
    getBatchWavBlob(batchIndex) {
      return batches[batchIndex]?.wavBlob ?? null;
    },
  };
}
