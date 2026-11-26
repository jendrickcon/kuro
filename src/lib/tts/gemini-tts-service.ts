import {
  AudioInspectionError,
  decodeAndInspectTtsAudio,
  type InspectedAudioResult,
} from "@/lib/tts/audio-inspect";
import {
  ALLOWED_GEMINI_TTS_MODELS,
  classifyGeminiTtsError,
  createGeminiTtsTransport,
  GEMINI_TTS_TIMEOUT_MS,
  GeminiTtsError,
  PRIMARY_GEMINI_TTS_MODEL,
  type AllowedGeminiTtsModel,
  type GeminiTtsTransport,
} from "@/lib/tts/gemini-tts-client";
import {
  GenerateTtsFailureSchema,
  TTS_MAX_AUDIO_BYTES,
  type GenerateTtsFailure,
  type GenerateTtsRequest,
  type TtsErrorCode,
} from "@/lib/tts/tts-contract";
import { resolveKuromateVoiceProfile, type KuromateVoiceProfile } from "@/lib/tts/voice-profiles";

/** Single model choice in WP-010 (automatic TTS fallback is deferred until live need is proven). */
export const MAX_TTS_MODEL_CHOICES = 1;
/** At most one bounded regeneration when provider returns empty or corrupt audio bytes. */
export const MAX_TTS_REGENERATION_ATTEMPTS = 1;
/** Absolute cap on upstream TTS provider calls per request. */
export const MAX_TTS_PROVIDER_ATTEMPTS = 2;

export interface GenerateSegmentTtsMeta {
  segmentId: string;
  speakerId: string;
  profileId: string;
  requestedModel: string;
  resolvedModel: string;
  fallbackUsed: boolean;
  providerAttempts: number;
  latencyMs: number;
  byteLength?: number;
  durationMs?: number;
  container?: string;
  errorCode?: TtsErrorCode;
}

export type GenerateSegmentTtsResult =
  | {
      ok: true;
      httpStatus: 200;
      audioBytes: Buffer;
      audio: InspectedAudioResult;
      profile: KuromateVoiceProfile;
      meta: GenerateSegmentTtsMeta;
    }
  | {
      ok: false;
      httpStatus: number;
      response: GenerateTtsFailure;
      retryAfterSeconds?: number;
      meta: GenerateSegmentTtsMeta;
    };

export interface GenerateSegmentTtsOptions {
  apiKey?: string;
  model?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxAudioBytes?: number;
  signal?: AbortSignal;
  transport?: GeminiTtsTransport;
}

export function isAllowedGeminiTtsModel(value: string): value is AllowedGeminiTtsModel {
  return (ALLOWED_GEMINI_TTS_MODELS as readonly string[]).includes(value);
}

export function resolveGeminiTtsModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.GEMINI_TTS_MODEL?.trim();
  return configured && configured.length > 0 ? configured : PRIMARY_GEMINI_TTS_MODEL;
}

function buildFailureResult(
  httpStatus: number,
  code: TtsErrorCode,
  message: string,
  retryable: boolean,
  meta: GenerateSegmentTtsMeta,
  retryAfterSeconds?: number,
): GenerateSegmentTtsResult {
  const response = GenerateTtsFailureSchema.parse({
    ok: false,
    error: { code, message, retryable },
  });
  return {
    ok: false,
    httpStatus,
    response,
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    meta: { ...meta, errorCode: code },
  };
}

function mapProviderFailure(
  error: GeminiTtsError,
  meta: GenerateSegmentTtsMeta,
): GenerateSegmentTtsResult {
  switch (error.kind) {
    case "missing_key":
    case "unsupported_model":
      return buildFailureResult(503, "TTS_NOT_CONFIGURED", error.message, false, meta);
    case "rate_limited":
      return buildFailureResult(
        429,
        "TTS_RATE_LIMITED",
        error.message,
        true,
        meta,
        error.retryAfterSeconds,
      );
    case "timeout":
      return buildFailureResult(504, "TTS_TIMEOUT", error.message, true, meta);
    case "service_unavailable":
    case "unavailable":
      return buildFailureResult(503, "TTS_PROVIDER_UNAVAILABLE", error.message, error.retryable, meta);
    case "empty_audio":
    case "invalid_audio":
    case "oversized_audio":
      return buildFailureResult(502, "TTS_AUDIO_INVALID", error.message, error.retryable, meta);
    case "auth_error":
    case "safety_blocked":
      return buildFailureResult(502, "TTS_GENERATION_FAILED", error.message, false, meta);
    case "client_aborted":
      return buildFailureResult(499, "TTS_GENERATION_FAILED", error.message, false, meta);
    case "internal":
    default:
      return buildFailureResult(500, "INTERNAL_ERROR", error.message, error.retryable, meta);
  }
}

function mapInspectionError(err: AudioInspectionError): { error: GeminiTtsError; canRegenerate: boolean } {
  switch (err.reason) {
    case "empty_audio":
      return {
        error: new GeminiTtsError("empty_audio", err.message, true),
        canRegenerate: true,
      };
    case "malformed_base64":
    case "invalid_header":
      return {
        error: new GeminiTtsError("invalid_audio", err.message, true),
        canRegenerate: true,
      };
    case "oversized_audio":
      return {
        error: new GeminiTtsError("oversized_audio", err.message, false),
        canRegenerate: false,
      };
    case "unexpected_mime":
    default:
      return {
        error: new GeminiTtsError("invalid_audio", err.message, false),
        canRegenerate: false,
      };
  }
}

/** Generates, inspects, and validates hosted Gemini audio for one dialogue segment. */
export async function generateSegmentTts(
  request: GenerateTtsRequest,
  options: GenerateSegmentTtsOptions = {},
): Promise<GenerateSegmentTtsResult> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;
  const requestedModel = options.model?.trim() || resolveGeminiTtsModel(env);
  const timeoutMs = options.timeoutMs ?? GEMINI_TTS_TIMEOUT_MS;
  const maxAudioBytes = options.maxAudioBytes ?? TTS_MAX_AUDIO_BYTES;
  const profile = resolveKuromateVoiceProfile(request.role);

  const baseMeta = (providerAttempts: number): GenerateSegmentTtsMeta => ({
    segmentId: request.segmentId,
    speakerId: request.speakerId,
    profileId: profile.profileId,
    requestedModel,
    resolvedModel: requestedModel,
    fallbackUsed: false,
    providerAttempts,
    latencyMs: Date.now() - startedAt,
  });

  if (!isAllowedGeminiTtsModel(requestedModel)) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Configured Kuromate voice model is not supported on this server. Captions remain active.",
      false,
      baseMeta(0),
    );
  }

  const apiKey = options.apiKey !== undefined ? options.apiKey.trim() : (env.GEMINI_API_KEY?.trim() ?? "");
  if (!apiKey) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
      false,
      baseMeta(0),
    );
  }

  if (options.signal?.aborted) {
    return buildFailureResult(
      499,
      "TTS_GENERATION_FAILED",
      "Voice preview request was cancelled.",
      false,
      baseMeta(0),
    );
  }

  let transport: GeminiTtsTransport;
  try {
    transport = options.transport ?? createGeminiTtsTransport(apiKey);
  } catch (err) {
    const providerErr = classifyGeminiTtsError(err);
    return mapProviderFailure(providerErr, baseMeta(0));
  }

  let providerAttempts = 0;
  let regenerations = 0;

  while (providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS) {
    providerAttempts += 1;

    try {
      const rawAudio = await transport({
        model: requestedModel,
        text: request.text,
        voice: profile.voice,
        styleInstruction: profile.styleInstruction,
        timeoutMs,
        signal: options.signal,
      });

      let inspected: { bytes: Buffer; metadata: InspectedAudioResult };
      try {
        inspected = decodeAndInspectTtsAudio(rawAudio.base64Data, rawAudio.mimeType, maxAudioBytes);
      } catch (inspectErr) {
        if (inspectErr instanceof AudioInspectionError) {
          const mapped = mapInspectionError(inspectErr);
          if (
            mapped.canRegenerate &&
            regenerations < MAX_TTS_REGENERATION_ATTEMPTS &&
            providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS &&
            !options.signal?.aborted
          ) {
            regenerations += 1;
            continue;
          }
          return mapProviderFailure(mapped.error, baseMeta(providerAttempts));
        }
        throw inspectErr;
      }

      return {
        ok: true,
        httpStatus: 200,
        audioBytes: inspected.bytes,
        audio: inspected.metadata,
        profile,
        meta: {
          ...baseMeta(providerAttempts),
          byteLength: inspected.metadata.byteLength,
          durationMs: inspected.metadata.durationMs,
          container: inspected.metadata.container,
        },
      };
    } catch (err) {
      const providerErr = classifyGeminiTtsError(err, Boolean(options.signal?.aborted));
      if (
        providerErr.kind === "empty_audio" &&
        regenerations < MAX_TTS_REGENERATION_ATTEMPTS &&
        providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS &&
        !options.signal?.aborted
      ) {
        regenerations += 1;
        continue;
      }
      return mapProviderFailure(providerErr, baseMeta(providerAttempts));
    }
  }

  return buildFailureResult(
    502,
    "TTS_AUDIO_INVALID",
    "Voice generation could not produce playable audio. Captions remain active—please try again.",
    true,
    baseMeta(providerAttempts),
  );
}
