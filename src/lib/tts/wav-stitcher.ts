import type {
  DialogueSegment,
  Episode,
  HostRole,
  VisualCue,
} from "@contracts/episode.schema";

export type SegmentEmotion = DialogueSegment["emotion"];
import type { KuromateIdentityProfileId } from "@/lib/tts/kuromate-identity-ids";
import {
  TTS_REQUIRED_BIT_DEPTH,
  TTS_REQUIRED_CHANNELS,
  TTS_REQUIRED_SAMPLE_RATE_HZ,
} from "@/lib/tts/tts-contract";

export const WAV_SAMPLE_RATE_HZ = TTS_REQUIRED_SAMPLE_RATE_HZ;
export const WAV_CHANNELS = TTS_REQUIRED_CHANNELS;
export const WAV_BIT_DEPTH = TTS_REQUIRED_BIT_DEPTH;
export const WAV_BYTES_PER_SAMPLE = WAV_BIT_DEPTH / 8;
export const WAV_SAMPLES_PER_MS = WAV_SAMPLE_RATE_HZ / 1000;
export const WAV_BYTES_PER_SECOND = WAV_SAMPLE_RATE_HZ * WAV_CHANNELS * WAV_BYTES_PER_SAMPLE;
export const WAV_HEADER_BYTES = 44;

/** Semantic pause durations (ms) inserted deterministically after spoken turns. */
export const PAUSE_REACTION_MS = 180;
export const PAUSE_STANDARD_HANDOFF_MS = 250;
export const PAUSE_TOPIC_TRANSITION_MS = 340;
export const PAUSE_FINAL_SEGMENT_MS = 0;

export type WavParseErrorCode =
  | "TRUNCATED_HEADER"
  | "INVALID_RIFF"
  | "INVALID_WAVE"
  | "TRUNCATED_CHUNK"
  | "INCONSISTENT_LENGTH"
  | "MISSING_FMT"
  | "MISSING_DATA"
  | "EMPTY_DATA"
  | "UNSUPPORTED_FORMAT"
  | "UNSUPPORTED_CHANNELS"
  | "UNSUPPORTED_SAMPLE_RATE"
  | "UNSUPPORTED_BIT_DEPTH"
  | "INVALID_SAMPLE_COUNT";

export class WavParseError extends Error {
  readonly code: WavParseErrorCode;

  constructor(code: WavParseErrorCode, message: string) {
    super(message);
    this.name = "WavParseError";
    this.code = code;
  }
}

export interface ParsedWavPcm {
  pcmBytes: Uint8Array;
  sampleRateHz: number;
  channels: number;
  bitDepth: number;
  dataBytes: number;
  sampleCount: number;
  durationMs: number;
}

export interface StitchSegmentInput {
  segmentId: string;
  order: number;
  speakerId: string;
  identityProfileId: KuromateIdentityProfileId;
  role: HostRole;
  turnKind?: SegmentEmotion;
  nextVisualCue?: VisualCue;
  nextTurnKind?: SegmentEmotion;
  pcmBytes: Uint8Array;
  sampleCount?: number;
  durationMs?: number;
  paddingAfterMs?: number;
}

export interface CompiledTimelineSegment {
  segmentId: string;
  order: number;
  speakerId: string;
  identityProfileId: KuromateIdentityProfileId;
  startSample: number;
  speechStartSample: number;
  speechEndSample: number;
  endSample: number;
  startMs: number;
  speechStartMs: number;
  speechEndMs: number;
  endMs: number;
  speechDurationMs: number;
  paddingAfterMs: number;
}

export interface StitchedWavResult {
  wavBytes: Uint8Array;
  wavBlob: Blob;
  totalSamples: number;
  totalDurationMs: number;
  byteLength: number;
  timeline: CompiledTimelineSegment[];
}

export interface TimelineLookupResult {
  segment: CompiledTimelineSegment;
  index: number;
  isSpeaking: boolean;
  isInPadding: boolean;
  segmentElapsedMs: number;
}

function readAsciiTag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

function writeAsciiTag(target: Uint8Array, offset: number, tag: string): void {
  for (let i = 0; i < 4; i += 1) {
    target[offset + i] = tag.charCodeAt(i);
  }
}

function samplesToMs(samples: number): number {
  return Math.round((samples * 1000) / WAV_SAMPLE_RATE_HZ);
}

/**
 * Pure client-safe RIFF/WAVE parser walking chunks dynamically (handles JUNK/unknown/C2PA chunks)
 * and enforcing 24 kHz, mono, 16-bit signed linear PCM with integer sample accounting.
 */
export function parseWavBuffer(input: ArrayBuffer | Uint8Array): ParsedWavPcm {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < WAV_HEADER_BYTES) {
    throw new WavParseError("TRUNCATED_HEADER", "WAV payload is smaller than 44-byte header.");
  }

  if (readAsciiTag(bytes, 0) !== "RIFF") {
    throw new WavParseError("INVALID_RIFF", "Audio payload does not start with RIFF.");
  }
  if (readAsciiTag(bytes, 8) !== "WAVE") {
    throw new WavParseError("INVALID_WAVE", "RIFF payload is not WAVE.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredRiffSize = view.getUint32(4, true);
  if (declaredRiffSize + 8 !== bytes.byteLength || declaredRiffSize < 36) {
    throw new WavParseError(
      "INCONSISTENT_LENGTH",
      "WAV RIFF chunk length does not match actual buffer length.",
    );
  }

  let offset = 12;
  let audioFormat: number | undefined;
  let channels: number | undefined;
  let sampleRateHz: number | undefined;
  let byteRate: number | undefined;
  let blockAlign: number | undefined;
  let bitsPerSample: number | undefined;
  let dataStart: number | undefined;
  let dataBytes: number | undefined;

  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) {
      throw new WavParseError("TRUNCATED_CHUNK", "WAV contains a truncated subchunk header.");
    }
    const chunkId = readAsciiTag(bytes, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const payloadStart = offset + 8;

    if (chunkSize > bytes.byteLength - payloadStart) {
      throw new WavParseError("TRUNCATED_CHUNK", `WAV chunk "${chunkId}" extends past buffer end.`);
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new WavParseError("MISSING_FMT", "WAV fmt chunk is smaller than 16 bytes.");
      }
      audioFormat = view.getUint16(payloadStart, true);
      channels = view.getUint16(payloadStart + 2, true);
      sampleRateHz = view.getUint32(payloadStart + 4, true);
      byteRate = view.getUint32(payloadStart + 8, true);
      blockAlign = view.getUint16(payloadStart + 12, true);
      bitsPerSample = view.getUint16(payloadStart + 14, true);
    } else if (chunkId === "data") {
      if (dataStart === undefined) {
        dataStart = payloadStart;
        dataBytes = chunkSize;
      }
    }

    offset = payloadStart + chunkSize + (chunkSize % 2);
  }

  if (audioFormat === undefined || channels === undefined || sampleRateHz === undefined || bitsPerSample === undefined) {
    throw new WavParseError("MISSING_FMT", "WAV payload is missing an fmt chunk.");
  }
  if (audioFormat !== 1) {
    throw new WavParseError("UNSUPPORTED_FORMAT", `Unsupported WAV format code: ${audioFormat}.`);
  }
  if (channels !== WAV_CHANNELS) {
    throw new WavParseError("UNSUPPORTED_CHANNELS", `Unsupported WAV channel count: ${channels}.`);
  }
  if (sampleRateHz !== WAV_SAMPLE_RATE_HZ) {
    throw new WavParseError("UNSUPPORTED_SAMPLE_RATE", `Unsupported sample rate: ${sampleRateHz} Hz.`);
  }
  if (bitsPerSample !== WAV_BIT_DEPTH) {
    throw new WavParseError("UNSUPPORTED_BIT_DEPTH", `Unsupported bit depth: ${bitsPerSample}-bit.`);
  }
  if (
    blockAlign !== WAV_BYTES_PER_SAMPLE ||
    byteRate !== WAV_BYTES_PER_SECOND
  ) {
    throw new WavParseError("UNSUPPORTED_FORMAT", "WAV byteRate or blockAlign is inconsistent with 24 kHz mono PCM16.");
  }
  if (dataStart === undefined || dataBytes === undefined) {
    throw new WavParseError("MISSING_DATA", "WAV payload is missing a data chunk.");
  }
  if (dataBytes === 0) {
    throw new WavParseError("EMPTY_DATA", "WAV data chunk contains zero audio bytes.");
  }
  if (dataBytes % WAV_BYTES_PER_SAMPLE !== 0) {
    throw new WavParseError("INVALID_SAMPLE_COUNT", "WAV data chunk byte length is not sample-aligned.");
  }

  const pcmBytes = bytes.slice(dataStart, dataStart + dataBytes);
  const sampleCount = dataBytes / WAV_BYTES_PER_SAMPLE;
  const durationMs = Math.max(1, samplesToMs(sampleCount));

  return {
    pcmBytes,
    sampleRateHz,
    channels,
    bitDepth: bitsPerSample,
    dataBytes,
    sampleCount,
    durationMs,
  };
}

/** Deterministic conversational pause policy without fragile text heuristics. */
export function resolveInterTurnPauseMs(
  current: { emotion: SegmentEmotion },
  next: { emotion: SegmentEmotion; visualCue?: VisualCue | null } | null | undefined,
  isFinalEpisodeSegment: boolean,
): number {
  if (isFinalEpisodeSegment || !next) {
    return PAUSE_FINAL_SEGMENT_MS;
  }
  if (current.emotion === "reacting" || next.emotion === "reacting") {
    return PAUSE_REACTION_MS;
  }
  if (next.visualCue && next.visualCue.type !== "none") {
    return PAUSE_TOPIC_TRANSITION_MS;
  }
  return PAUSE_STANDARD_HANDOFF_MS;
}

/** Generates deterministic zero-filled 24 kHz mono 16-bit PCM silence for intentional inter-turn pauses. */
export function createSilencePcm(durationMs: number): Uint8Array {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return new Uint8Array(0);
  }
  const sampleCount = Math.round(durationMs * WAV_SAMPLES_PER_MS);
  return new Uint8Array(sampleCount * WAV_BYTES_PER_SAMPLE);
}

/** Writes a deterministic 44-byte RIFF/WAVE header around raw 24 kHz mono 16-bit PCM bytes. */
export function wrapPcm16MonoToWav(pcmBytes: Uint8Array): Uint8Array {
  if (pcmBytes.byteLength === 0 || pcmBytes.byteLength % WAV_BYTES_PER_SAMPLE !== 0) {
    throw new WavParseError(
      "INVALID_SAMPLE_COUNT",
      "Cannot build WAV from empty or unaligned PCM payload.",
    );
  }
  const wav = new Uint8Array(WAV_HEADER_BYTES + pcmBytes.byteLength);
  writeAsciiTag(wav, 0, "RIFF");
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeAsciiTag(wav, 8, "WAVE");
  writeAsciiTag(wav, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, WAV_CHANNELS, true);
  view.setUint32(24, WAV_SAMPLE_RATE_HZ, true);
  view.setUint32(28, WAV_BYTES_PER_SECOND, true);
  view.setUint16(32, WAV_BYTES_PER_SAMPLE, true);
  view.setUint16(34, WAV_BIT_DEPTH, true);
  writeAsciiTag(wav, 36, "data");
  view.setUint32(40, pcmBytes.byteLength, true);
  wav.set(pcmBytes, WAV_HEADER_BYTES);
  return wav;
}

/**
 * Concatenates validated turn PCM buffers + deterministic silence padding into one RIFF/WAVE payload
 * and builds a sample-exact monotonic playback timeline with zero floating-point drift.
 */
export function stitchSegmentsToWav(
  segments: readonly StitchSegmentInput[],
  options?: {
    startOffsetSamples?: number;
    isEpisodeTail?: boolean;
  },
): StitchedWavResult {
  if (segments.length === 0) {
    throw new WavParseError("EMPTY_DATA", "Cannot stitch an empty segment list.");
  }

  const startOffsetSamples = Math.max(0, Math.round(options?.startOffsetSamples ?? 0));
  const isEpisodeTail = options?.isEpisodeTail ?? true;
  const seenIds = new Set<string>();
  let prevOrder = -1;

  const chunks: Uint8Array[] = [];
  const timeline: CompiledTimelineSegment[] = [];
  let cursorSamples = startOffsetSamples;
  let localPcmBytes = 0;

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seenIds.has(seg.segmentId)) {
      throw new WavParseError("INVALID_SAMPLE_COUNT", `Duplicate segmentId "${seg.segmentId}" in stitch input.`);
    }
    seenIds.add(seg.segmentId);
    if (seg.order <= prevOrder) {
      throw new WavParseError("INVALID_SAMPLE_COUNT", "Stitch segment order must be strictly increasing.");
    }
    prevOrder = seg.order;

    if (seg.pcmBytes.byteLength === 0 || seg.pcmBytes.byteLength % WAV_BYTES_PER_SAMPLE !== 0) {
      throw new WavParseError(
        "EMPTY_DATA",
        `Segment "${seg.segmentId}" lacks valid aligned PCM bytes.`,
      );
    }

    const speechSamples = seg.sampleCount ?? seg.pcmBytes.byteLength / WAV_BYTES_PER_SAMPLE;
    const isFinalInEpisode = isEpisodeTail && i === segments.length - 1;
    const paddingMs = isFinalInEpisode
      ? PAUSE_FINAL_SEGMENT_MS
      : (seg.paddingAfterMs ??
        resolveInterTurnPauseMs(
          { emotion: seg.turnKind ?? "neutral" },
          i + 1 < segments.length
            ? {
                emotion: segments[i + 1].turnKind ?? "neutral",
                visualCue: segments[i + 1].nextVisualCue ?? seg.nextVisualCue,
              }
            : seg.nextTurnKind
              ? { emotion: seg.nextTurnKind, visualCue: seg.nextVisualCue }
              : null,
          isFinalInEpisode,
        ));

    const paddingPcm = createSilencePcm(paddingMs);
    const paddingSamples = paddingPcm.byteLength / WAV_BYTES_PER_SAMPLE;

    const startSample = cursorSamples;
    const speechStartSample = cursorSamples;
    const speechEndSample = speechStartSample + speechSamples;
    const endSample = speechEndSample + paddingSamples;

    const startMs = samplesToMs(startSample);
    const speechStartMs = samplesToMs(speechStartSample);
    const speechEndMs = samplesToMs(speechEndSample);
    const endMs = samplesToMs(endSample);

    timeline.push({
      segmentId: seg.segmentId,
      order: seg.order,
      speakerId: seg.speakerId,
      identityProfileId: seg.identityProfileId,
      startSample,
      speechStartSample,
      speechEndSample,
      endSample,
      startMs,
      speechStartMs,
      speechEndMs,
      endMs,
      speechDurationMs: Math.max(1, speechEndMs - speechStartMs),
      paddingAfterMs: Math.max(0, endMs - speechEndMs),
    });

    chunks.push(seg.pcmBytes);
    localPcmBytes += seg.pcmBytes.byteLength;
    if (paddingPcm.byteLength > 0) {
      chunks.push(paddingPcm);
      localPcmBytes += paddingPcm.byteLength;
    }

    cursorSamples = endSample;
  }

  const combinedPcm = new Uint8Array(localPcmBytes);
  let writeOffset = 0;
  for (const chunk of chunks) {
    combinedPcm.set(chunk, writeOffset);
    writeOffset += chunk.byteLength;
  }

  const wavBytes = wrapPcm16MonoToWav(combinedPcm);
  const wavCopy = new Uint8Array(wavBytes.byteLength);
  wavCopy.set(wavBytes);
  const wavBlob = new Blob([wavCopy.buffer], { type: "audio/wav" });
  const localSamples = localPcmBytes / WAV_BYTES_PER_SAMPLE;

  return {
    wavBytes,
    wavBlob,
    totalSamples: localSamples,
    totalDurationMs: samplesToMs(localSamples),
    byteLength: wavBytes.byteLength,
    timeline,
  };
}

/** Deterministic binary-search lookup mapping elapsed timeline milliseconds to segment + speaking/padding state. */
export function resolveTimelineStateAtMs(
  timeline: readonly CompiledTimelineSegment[],
  elapsedMs: number,
): TimelineLookupResult | null {
  if (timeline.length === 0) {
    return null;
  }

  const clampedMs = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const last = timeline[timeline.length - 1];
  if (clampedMs >= last.endMs) {
    return {
      segment: last,
      index: timeline.length - 1,
      isSpeaking: false,
      isInPadding: false,
      segmentElapsedMs: Math.max(0, last.endMs - last.startMs),
    };
  }

  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const item = timeline[mid];
    if (clampedMs < item.startMs) {
      hi = mid - 1;
    } else if (clampedMs >= item.endMs) {
      lo = mid + 1;
    } else {
      const isSpeaking = clampedMs >= item.speechStartMs && clampedMs < item.speechEndMs;
      const isInPadding = !isSpeaking && clampedMs >= item.speechEndMs && clampedMs < item.endMs;
      return {
        segment: item,
        index: mid,
        isSpeaking,
        isInPadding,
        segmentElapsedMs: Math.max(0, clampedMs - item.speechStartMs),
      };
    }
  }

  const fallbackIdx = Math.max(0, Math.min(timeline.length - 1, lo));
  const fallback = timeline[fallbackIdx];
  return {
    segment: fallback,
    index: fallbackIdx,
    isSpeaking: false,
    isInPadding: false,
    segmentElapsedMs: 0,
  };
}

/** Creates a deterministic cross-platform safe `.wav` download filename from episode title or ID. */
export function buildEpisodeAudioFilename(episode: Pick<Episode, "id" | "title">): string {
  const slugify = (raw: string) =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "");

  const base = slugify(episode.title) || slugify(episode.id) || "episode";
  return `kuro-episode-${base}.wav`;
}
