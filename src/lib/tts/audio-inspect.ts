import { TTS_MAX_AUDIO_BYTES } from "@/lib/tts/tts-contract";

export const ALLOWED_TTS_AUDIO_MIME_TYPES = ["audio/wav", "audio/mpeg", "audio/ogg"] as const;
export type AllowedTtsAudioMimeType = (typeof ALLOWED_TTS_AUDIO_MIME_TYPES)[number];

export type AudioInspectionFailureReason =
  | "empty_audio"
  | "malformed_base64"
  | "unexpected_mime"
  | "oversized_audio"
  | "invalid_header";

export interface InspectedAudioResult {
  mimeType: AllowedTtsAudioMimeType;
  container: "wav" | "mp3" | "ogg";
  codec?: string;
  sampleRateHz?: number;
  channels?: number;
  bitDepth?: number;
  byteLength: number;
  dataBytes?: number;
  durationMs?: number;
  hasValidHeader: true;
}

/** Typed failure thrown when returned TTS bytes fail container, header, or size checks. */
export class AudioInspectionError extends Error {
  readonly reason: AudioInspectionFailureReason;

  constructor(reason: AudioInspectionFailureReason, message: string) {
    super(message);
    this.name = "AudioInspectionError";
    this.reason = reason;
  }
}

export function normalizeDeclaredAudioMime(rawMimeType: string | undefined): AllowedTtsAudioMimeType | null {
  if (!rawMimeType) return null;
  const baseMime = rawMimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (baseMime === "audio/wav" || baseMime === "audio/x-wav" || baseMime === "audio/wave") {
    return "audio/wav";
  }
  if (baseMime === "audio/mpeg" || baseMime === "audio/mp3") {
    return "audio/mpeg";
  }
  if (baseMime === "audio/ogg") {
    return "audio/ogg";
  }
  return null;
}

const STRICT_BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64Bounded(base64Data: string, maxBytes: number): Buffer {
  const cleaned = base64Data.replace(/\s+/g, "");
  if (cleaned.length === 0) {
    throw new AudioInspectionError("empty_audio", "Voice provider returned empty audio data.");
  }
  if (cleaned.length % 4 !== 0 || !STRICT_BASE64_REGEX.test(cleaned)) {
    throw new AudioInspectionError("malformed_base64", "Voice provider returned malformed base64 audio.");
  }

  const paddingBytes = cleaned.endsWith("==") ? 2 : cleaned.endsWith("=") ? 1 : 0;
  const expectedByteLength = (cleaned.length * 3) / 4 - paddingBytes;
  if (expectedByteLength <= 0) {
    throw new AudioInspectionError("empty_audio", "Voice provider returned empty audio payload.");
  }
  if (expectedByteLength > maxBytes) {
    throw new AudioInspectionError("oversized_audio", "Generated audio segment exceeded maximum allowed byte size.");
  }

  const decoded = Buffer.from(cleaned, "base64");
  if (decoded.length === 0) {
    throw new AudioInspectionError("empty_audio", "Decoded audio payload was empty.");
  }
  if (decoded.length > maxBytes) {
    throw new AudioInspectionError("oversized_audio", "Decoded audio segment exceeded maximum allowed byte size.");
  }
  return decoded;
}

/** Walks RIFF/WAVE chunks dynamically because Gemini TTS may include pre-data metadata chunks. */
function inspectWavBuffer(buffer: Buffer): InspectedAudioResult {
  if (buffer.length < 44) {
    throw new AudioInspectionError("invalid_header", "WAV audio payload is truncated.");
  }

  const riffTag = buffer.subarray(0, 4).toString("ascii");
  const waveTag = buffer.subarray(8, 12).toString("ascii");
  if (riffTag !== "RIFF" || waveTag !== "WAVE") {
    throw new AudioInspectionError("invalid_header", "Audio payload is missing a valid RIFF/WAVE header.");
  }

  let offset = 12;
  let audioFormat: number | undefined;
  let channels: number | undefined;
  let sampleRateHz: number | undefined;
  let byteRate: number | undefined;
  let bitsPerSample: number | undefined;
  let dataBytes: number | undefined;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkPayloadStart = offset + 8;

    if (chunkSize > buffer.length - chunkPayloadStart) {
      throw new AudioInspectionError("invalid_header", "WAV chunk header declares size past payload bounds.");
    }

    if (chunkId === "fmt " && chunkSize >= 16) {
      audioFormat = buffer.readUInt16LE(chunkPayloadStart);
      channels = buffer.readUInt16LE(chunkPayloadStart + 2);
      sampleRateHz = buffer.readUInt32LE(chunkPayloadStart + 4);
      byteRate = buffer.readUInt32LE(chunkPayloadStart + 8);
      bitsPerSample = buffer.readUInt16LE(chunkPayloadStart + 14);
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
    }

    offset = chunkPayloadStart + chunkSize + (chunkSize % 2);
  }

  if (
    audioFormat !== 1 ||
    channels === undefined ||
    channels < 1 ||
    channels > 2 ||
    sampleRateHz === undefined ||
    sampleRateHz <= 0 ||
    byteRate === undefined ||
    byteRate <= 0 ||
    bitsPerSample === undefined ||
    ![8, 16, 24, 32].includes(bitsPerSample)
  ) {
    throw new AudioInspectionError("invalid_header", "WAV audio fmt chunk is missing or unsupported.");
  }

  if (dataBytes === undefined || dataBytes <= 0) {
    throw new AudioInspectionError("invalid_header", "WAV audio payload contains no sample data.");
  }

  const durationMs = Math.max(1, Math.round((dataBytes / byteRate) * 1000));
  return {
    mimeType: "audio/wav",
    container: "wav",
    codec: `pcm_s${bitsPerSample}le`,
    sampleRateHz,
    channels,
    bitDepth: bitsPerSample,
    byteLength: buffer.length,
    dataBytes,
    durationMs,
    hasValidHeader: true,
  };
}

function inspectMpegBuffer(buffer: Buffer): InspectedAudioResult {
  const hasId3 = buffer.length >= 3 && buffer.subarray(0, 3).toString("ascii") === "ID3";
  const hasFrameSync = buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
  if (!hasId3 && !hasFrameSync) {
    throw new AudioInspectionError("invalid_header", "MPEG audio payload is missing a valid header.");
  }
  return {
    mimeType: "audio/mpeg",
    container: "mp3",
    byteLength: buffer.length,
    hasValidHeader: true,
  };
}

function inspectOggBuffer(buffer: Buffer): InspectedAudioResult {
  if (buffer.length < 4 || buffer.subarray(0, 4).toString("ascii") !== "OggS") {
    throw new AudioInspectionError("invalid_header", "OGG audio payload is missing an OggS capture header.");
  }
  return {
    mimeType: "audio/ogg",
    container: "ogg",
    byteLength: buffer.length,
    hasValidHeader: true,
  };
}

/** Decodes base64 TTS audio, enforces MIME/byte bounds, and verifies binary container headers. */
export function decodeAndInspectTtsAudio(
  base64Data: string,
  declaredMimeType: string | undefined,
  maxBytes: number = TTS_MAX_AUDIO_BYTES,
): { bytes: Buffer; metadata: InspectedAudioResult } {
  const normalizedMime = normalizeDeclaredAudioMime(declaredMimeType);
  if (!normalizedMime) {
    throw new AudioInspectionError(
      "unexpected_mime",
      "Voice provider returned an unexpected audio format.",
    );
  }

  const bytes = decodeBase64Bounded(base64Data, maxBytes);
  const metadata =
    normalizedMime === "audio/wav"
      ? inspectWavBuffer(bytes)
      : normalizedMime === "audio/mpeg"
        ? inspectMpegBuffer(bytes)
        : inspectOggBuffer(bytes);

  return { bytes, metadata };
}
