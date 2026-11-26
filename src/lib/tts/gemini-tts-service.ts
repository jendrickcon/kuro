import {
  AudioInspectionError,
  decodeAndInspectTtsAudio,
  inspectTtsAudioBuffer,
  type InspectedAudioResult,
} from "@/lib/tts/audio-inspect";
import {
  createDeepgramTtsTransport,
  DEEPGRAM_TTS_TIMEOUT_MS,
  type DeepgramTtsTransport,
} from "@/lib/tts/deepgram-tts-client";
import {
  ALLOWED_GEMINI_TTS_FALLBACK_MODELS,
  ALLOWED_GEMINI_TTS_MODELS,
  classifyGeminiTtsError,
  createGeminiTtsTransport,
  GEMINI_TTS_TIMEOUT_MS,
  GeminiTtsError,
  isTtsCapacityFallbackEligible,
  LITE_GEMINI_TTS_MODEL,
  PRIMARY_GEMINI_TTS_MODEL,
  type AllowedGeminiTtsFallbackModel,
  type AllowedGeminiTtsModel,
  type GeminiTtsTransport,
} from "@/lib/tts/gemini-tts-client";
import type { KuromateIdentityProfileId } from "@/lib/tts/kuromate-identity-ids";
import type { TtsQuotaClass } from "@/lib/tts/retry-after";
import {
  GenerateTtsFailureSchema,
  TTS_MAX_AUDIO_BYTES,
  type GenerateTtsFailure,
  type GenerateTtsRequest,
  type HostedTtsHealthState,
  type TtsErrorCode,
  type TtsRoutePreference,
} from "@/lib/tts/tts-contract";
import {
  resolveKuromateSynthesisProfile,
  type ResolvedKuromateTtsProfile,
} from "@/lib/tts/voice-profiles";

/** Primary Gemini Flash TTS plus one allowlisted Gemini Flash-Lite TTS fallback. */
export const MAX_TTS_MODEL_CHOICES = 2;
/** Maximum automatic model switches permitted on one `/api/tts` request. */
export const MAX_TTS_MODEL_SWITCHES = 1;
/** At most one bounded regeneration when the active model returns empty or corrupt audio bytes. */
export const MAX_TTS_REGENERATION_ATTEMPTS = 1;
/**
 * Absolute ceiling on upstream TTS provider calls per request:
 * - Normal success: 1 call
 * - Primary capacity failure + fallback success: 2 calls
 * - Absolute max (1 primary capacity failure + 1 fallback + 1 malformed-audio repair): 3 calls
 */
export const MAX_TTS_PROVIDER_ATTEMPTS = 3;

/** Server-selected hosted TTS provider (never chosen by the browser). */
export type TtsProvider = "deepgram" | "gemini";

export interface GenerateSegmentTtsMeta {
  /** Active provider for sanitized server telemetry only. */
  provider?: TtsProvider;
  segmentId: string;
  speakerId: string;
  profileId: string;
  identityProfileId: KuromateIdentityProfileId;
  requestedModel: string;
  resolvedModel: string;
  routePreference: TtsRoutePreference;
  fallbackUsed: boolean;
  modelSwitches: number;
  providerAttempts: number;
  sdkRetryDisabled: true;
  quotaClass: TtsQuotaClass;
  hostedState: HostedTtsHealthState;
  retryAfterSeconds?: number;
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
      profile: ResolvedKuromateTtsProfile;
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
  fallbackModel?: string | null;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  maxAudioBytes?: number;
  signal?: AbortSignal;
  transport?: GeminiTtsTransport;
  /** Injectable primary transport for tests; production builds the native-fetch client from `DEEPGRAM_API_KEY`. */
  deepgramTransport?: DeepgramTtsTransport;
}

export function isAllowedGeminiTtsModel(value: string): value is AllowedGeminiTtsModel {
  return (ALLOWED_GEMINI_TTS_MODELS as readonly string[]).includes(value);
}

export function isAllowedGeminiTtsFallbackModel(
  value: string,
): value is AllowedGeminiTtsFallbackModel {
  return (ALLOWED_GEMINI_TTS_FALLBACK_MODELS as readonly string[]).includes(value);
}

export function resolveGeminiTtsModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.GEMINI_TTS_MODEL?.trim();
  return configured && configured.length > 0 ? configured : PRIMARY_GEMINI_TTS_MODEL;
}

export function resolveGeminiTtsFallbackModel(
  env: Record<string, string | undefined> = process.env,
  explicitOverride?: string | null,
):
  | { configured: true; model: AllowedGeminiTtsFallbackModel | null }
  | { configured: false; invalidModel: string } {
  if (explicitOverride === null) {
    return { configured: true, model: null };
  }
  const raw =
    explicitOverride !== undefined
      ? explicitOverride.trim()
      : env.GEMINI_TTS_FALLBACK_MODEL?.trim();
  if (!raw) {
    return { configured: true, model: LITE_GEMINI_TTS_MODEL };
  }
  const normalized = raw.toLowerCase();
  if (normalized === "none" || normalized === "off") {
    return { configured: true, model: null };
  }
  if (!isAllowedGeminiTtsFallbackModel(raw)) {
    return { configured: false, invalidModel: raw };
  }
  return { configured: true, model: raw };
}

/**
 * Resolves the server-side primary provider. `KURO_TTS_PROVIDER` is an allowlist (`deepgram` | `gemini`);
 * when unset, Deepgram is the default only if its key exists and no Gemini transport override was injected.
 */
export function resolveTtsProvider(
  env: Record<string, string | undefined> = process.env,
  hasGeminiTransportOverride: boolean = false,
): { configured: true; provider: TtsProvider } | { configured: false } {
  const raw = env.KURO_TTS_PROVIDER?.trim().toLowerCase();
  if (raw) {
    return raw === "deepgram" || raw === "gemini"
      ? { configured: true, provider: raw }
      : { configured: false };
  }
  const deepgramKeyPresent = Boolean(env.DEEPGRAM_API_KEY?.trim());
  return {
    configured: true,
    provider: !hasGeminiTransportOverride && deepgramKeyPresent ? "deepgram" : "gemini",
  };
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
    error: {
      code,
      message,
      retryable,
      ...(meta.quotaClass !== "none" ? { quotaClass: meta.quotaClass } : {}),
      hostedState: meta.hostedState,
    },
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
  resolvedQuotaClass: TtsQuotaClass,
  resolvedHostedState: HostedTtsHealthState,
  resolvedRetryAfterSeconds?: number,
): GenerateSegmentTtsResult {
  const enrichedMeta: GenerateSegmentTtsMeta = {
    ...meta,
    quotaClass: resolvedQuotaClass,
    hostedState: resolvedHostedState,
    ...(resolvedRetryAfterSeconds !== undefined ? { retryAfterSeconds: resolvedRetryAfterSeconds } : {}),
  };

  const finalMessage =
    resolvedHostedState === "all_hosted_daily_exhausted"
      ? "Kuro’s available hosted voice options have reached today’s project limit. The conversation can continue with captions."
      : error.message;

  switch (error.kind) {
    case "missing_key":
    case "unsupported_model":
      return buildFailureResult(503, "TTS_NOT_CONFIGURED", error.message, false, enrichedMeta);
    case "rate_limited":
      return buildFailureResult(
        429,
        "TTS_RATE_LIMITED",
        finalMessage,
        true,
        enrichedMeta,
        resolvedRetryAfterSeconds,
      );
    case "timeout":
      return buildFailureResult(504, "TTS_TIMEOUT", error.message, true, enrichedMeta);
    case "service_unavailable":
    case "unavailable":
      return buildFailureResult(
        503,
        "TTS_PROVIDER_UNAVAILABLE",
        error.message,
        error.retryable,
        enrichedMeta,
      );
    case "empty_audio":
    case "invalid_audio":
    case "oversized_audio":
      return buildFailureResult(
        502,
        "TTS_AUDIO_INVALID",
        error.message,
        error.retryable,
        enrichedMeta,
      );
    case "auth_error":
    case "safety_blocked":
    case "invalid_request":
      return buildFailureResult(502, "TTS_GENERATION_FAILED", error.message, false, enrichedMeta);
    case "client_aborted":
      return buildFailureResult(499, "TTS_GENERATION_FAILED", error.message, false, enrichedMeta);
    case "internal":
    default:
      return buildFailureResult(500, "INTERNAL_ERROR", error.message, error.retryable, enrichedMeta);
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

/**
 * Generates, inspects, and validates hosted Gemini audio for one dialogue segment
 * using identity-locked Kuromate base voices, role-based style, and bounded 1-switch fallback.
 */
export async function generateSegmentTts(
  request: GenerateTtsRequest,
  options: GenerateSegmentTtsOptions = {},
): Promise<GenerateSegmentTtsResult> {
  const startedAt = Date.now();
  const env = options.env ?? process.env;
  const requestedModel = options.model?.trim() || resolveGeminiTtsModel(env);
  const fallbackConfig = resolveGeminiTtsFallbackModel(env, options.fallbackModel);
  const routePreference: TtsRoutePreference = request.routePreference ?? "primary";
  const timeoutMs = options.timeoutMs ?? GEMINI_TTS_TIMEOUT_MS;
  const maxAudioBytes = options.maxAudioBytes ?? TTS_MAX_AUDIO_BYTES;

  const profile = resolveKuromateSynthesisProfile({
    voiceIdentityId: request.voiceIdentityId,
    voiceId: request.voiceId,
    avatarId: request.avatarId,
    speakerId: request.speakerId,
    hostName: request.hostName,
    role: request.role,
  });

  let metaProvider: TtsProvider | undefined;

  const makeMeta = (
    providerAttempts: number,
    resolvedModel: string,
    fallbackUsed: boolean,
    modelSwitches: number,
    quotaClass: TtsQuotaClass,
    hostedState: HostedTtsHealthState,
    retryAfterSeconds?: number,
  ): GenerateSegmentTtsMeta => ({
    segmentId: request.segmentId,
    speakerId: request.speakerId,
    profileId: profile.profileId,
    identityProfileId: profile.identityProfileId,
    requestedModel,
    resolvedModel,
    routePreference,
    fallbackUsed,
    modelSwitches,
    providerAttempts,
    sdkRetryDisabled: true,
    quotaClass,
    hostedState,
    ...(metaProvider ? { provider: metaProvider } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    latencyMs: Date.now() - startedAt,
  });

  if (!isAllowedGeminiTtsModel(requestedModel)) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Configured Kuromate voice model is not supported on this server. Captions remain active.",
      false,
      makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
    );
  }

  if (!fallbackConfig.configured) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Configured Kuromate fallback voice model is not supported on this server. Captions remain active.",
      false,
      makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
    );
  }

  const distinctFallbackModel =
    fallbackConfig.model && fallbackConfig.model !== requestedModel ? fallbackConfig.model : null;

  const providerSelection = resolveTtsProvider(env, options.transport !== undefined);
  if (!providerSelection.configured) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Configured Kuromate voice provider is not supported on this server. Captions remain active.",
      false,
      makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
    );
  }
  const useDeepgram = providerSelection.provider === "deepgram";
  metaProvider = providerSelection.provider;

  const apiKey =
    options.apiKey !== undefined ? options.apiKey.trim() : (env.GEMINI_API_KEY?.trim() ?? "");
  if (!apiKey && !useDeepgram) {
    return buildFailureResult(
      503,
      "TTS_NOT_CONFIGURED",
      "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
      false,
      makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
    );
  }

  let deepgramTransport: DeepgramTtsTransport | null = null;
  if (useDeepgram) {
    const deepgramApiKey = env.DEEPGRAM_API_KEY?.trim() ?? "";
    if (!deepgramApiKey) {
      return buildFailureResult(
        503,
        "TTS_NOT_CONFIGURED",
        "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
        false,
        makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
      );
    }
    try {
      deepgramTransport = options.deepgramTransport ?? createDeepgramTtsTransport(deepgramApiKey);
    } catch (err) {
      const providerErr = classifyGeminiTtsError(err);
      return mapProviderFailure(
        providerErr,
        makeMeta(0, requestedModel, false, 0, providerErr.quotaClass, "hosted_unavailable"),
        providerErr.quotaClass,
        "hosted_unavailable",
        providerErr.retryAfterSeconds,
      );
    }
  }

  if (options.signal?.aborted) {
    return buildFailureResult(
      499,
      "TTS_GENERATION_FAILED",
      "Voice preview request was cancelled.",
      false,
      makeMeta(0, requestedModel, false, 0, "none", "hosted_unavailable"),
    );
  }

  let transport: GeminiTtsTransport | null = null;
  try {
    transport = options.transport ?? (apiKey ? createGeminiTtsTransport(apiKey) : null);
  } catch (err) {
    if (!useDeepgram) {
      const providerErr = classifyGeminiTtsError(err);
      const errState: HostedTtsHealthState =
        providerErr.quotaClass === "long_quota_wait"
          ? "all_hosted_daily_exhausted"
          : "hosted_unavailable";
      return mapProviderFailure(
        providerErr,
        makeMeta(0, requestedModel, false, 0, providerErr.quotaClass, errState),
        providerErr.quotaClass,
        errState,
        providerErr.retryAfterSeconds,
      );
    }
    // Deepgram is primary: an unusable Gemini transport only disables the fallback.
    transport = null;
  }
  const geminiTransport: GeminiTtsTransport =
    transport ??
    (async () => {
      throw new GeminiTtsError(
        "missing_key",
        "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
        false,
      );
    });

  // Deepgram primary falls back only to the allowlisted Gemini Flash-Lite model, and only when Gemini is usable.
  const fallbackTargetModel: string | null = useDeepgram
    ? transport !== null
      ? fallbackConfig.model
      : null
    : distinctFallbackModel;
  const routedDirectlyToFallback = routePreference === "fallback" && fallbackTargetModel !== null;
  let activeModel: string = routedDirectlyToFallback ? fallbackTargetModel : requestedModel;
  let fallbackUsed = routedDirectlyToFallback;
  if (useDeepgram && routedDirectlyToFallback) {
    metaProvider = "gemini";
  }
  let modelSwitches = 0;
  let providerAttempts = 0;
  let regenerations = 0;
  let primaryQuotaClass: TtsQuotaClass = "none";
  let primaryRetryAfterSeconds: number | undefined;

  // Deepgram primary: exactly one attempt, then at most one switch to Gemini Flash-Lite on capacity errors.
  if (useDeepgram && deepgramTransport && !routedDirectlyToFallback) {
    providerAttempts = 1;
    const deepgramLabel = profile.deepgramVoice;
    try {
      const rawAudio = await deepgramTransport({
        voice: profile.deepgramVoice,
        text: request.text,
        timeoutMs: options.timeoutMs ?? DEEPGRAM_TTS_TIMEOUT_MS,
        signal: options.signal,
      });

      let inspected: { bytes: Buffer; metadata: InspectedAudioResult };
      try {
        inspected = inspectTtsAudioBuffer(rawAudio.bytes, rawAudio.mimeType, maxAudioBytes);
      } catch (inspectErr) {
        if (inspectErr instanceof AudioInspectionError) {
          return mapProviderFailure(
            mapInspectionError(inspectErr).error,
            makeMeta(1, deepgramLabel, false, 0, "none", "hosted_unavailable"),
            "none",
            "hosted_unavailable",
          );
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
          ...makeMeta(1, deepgramLabel, false, 0, "none", "primary_available"),
          byteLength: inspected.metadata.byteLength,
          durationMs: inspected.metadata.durationMs,
          container: inspected.metadata.container,
        },
      };
    } catch (err) {
      const providerErr = classifyGeminiTtsError(err, Boolean(options.signal?.aborted));
      if (
        fallbackTargetModel !== null &&
        modelSwitches < MAX_TTS_MODEL_SWITCHES &&
        isTtsCapacityFallbackEligible(providerErr) &&
        !options.signal?.aborted
      ) {
        if (providerErr.quotaClass !== "none") {
          primaryQuotaClass = providerErr.quotaClass;
        }
        if (providerErr.retryAfterSeconds !== undefined) {
          primaryRetryAfterSeconds = providerErr.retryAfterSeconds;
        }
        modelSwitches += 1;
        fallbackUsed = true;
        activeModel = fallbackTargetModel;
        metaProvider = "gemini";
      } else {
        const failedState: HostedTtsHealthState =
          providerErr.quotaClass === "long_quota_wait"
            ? "all_hosted_daily_exhausted"
            : "hosted_unavailable";
        return mapProviderFailure(
          providerErr,
          makeMeta(
            1,
            deepgramLabel,
            false,
            0,
            providerErr.quotaClass,
            failedState,
            providerErr.retryAfterSeconds,
          ),
          providerErr.quotaClass,
          failedState,
          providerErr.retryAfterSeconds,
        );
      }
    }
  }

  while (providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS) {
    providerAttempts += 1;

    const voiceForAttempt =
      activeModel === requestedModel ? profile.voice : profile.fallbackVoice;

    try {
      const rawAudio = await geminiTransport({
        model: activeModel,
        text: request.text,
        voice: voiceForAttempt,
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
          return mapProviderFailure(
            mapped.error,
            makeMeta(
              providerAttempts,
              activeModel,
              fallbackUsed,
              modelSwitches,
              primaryQuotaClass,
              "hosted_unavailable",
              primaryRetryAfterSeconds,
            ),
            primaryQuotaClass,
            "hosted_unavailable",
            primaryRetryAfterSeconds,
          );
        }
        throw inspectErr;
      }

      const successHostedState: HostedTtsHealthState = fallbackUsed
        ? "fallback_active"
        : "primary_available";

      return {
        ok: true,
        httpStatus: 200,
        audioBytes: inspected.bytes,
        audio: inspected.metadata,
        profile,
        meta: {
          ...makeMeta(
            providerAttempts,
            activeModel,
            fallbackUsed,
            modelSwitches,
            primaryQuotaClass,
            successHostedState,
            primaryRetryAfterSeconds,
          ),
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

      if (
        !routedDirectlyToFallback &&
        activeModel === requestedModel &&
        fallbackTargetModel !== null &&
        modelSwitches < MAX_TTS_MODEL_SWITCHES &&
        isTtsCapacityFallbackEligible(providerErr) &&
        providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS &&
        !options.signal?.aborted
      ) {
        if (providerErr.quotaClass !== "none") {
          primaryQuotaClass = providerErr.quotaClass;
        }
        if (providerErr.retryAfterSeconds !== undefined) {
          primaryRetryAfterSeconds = providerErr.retryAfterSeconds;
        }
        modelSwitches += 1;
        fallbackUsed = true;
        activeModel = fallbackTargetModel;
        continue;
      }

      const finalQuotaClass: TtsQuotaClass =
        providerErr.quotaClass !== "none" ? providerErr.quotaClass : primaryQuotaClass;
      const finalRetryAfterSeconds =
        providerErr.retryAfterSeconds ??
        (providerErr.kind === "rate_limited" ? undefined : primaryRetryAfterSeconds);

      const fallbackAlsoChecked =
        routedDirectlyToFallback || modelSwitches > 0 || distinctFallbackModel === null;
      const finalHostedState: HostedTtsHealthState =
        fallbackAlsoChecked && providerErr.quotaClass === "long_quota_wait"
          ? "all_hosted_daily_exhausted"
          : "hosted_unavailable";

      return mapProviderFailure(
        providerErr,
        makeMeta(
          providerAttempts,
          activeModel,
          fallbackUsed,
          modelSwitches,
          finalQuotaClass,
          finalHostedState,
          finalRetryAfterSeconds,
        ),
        finalQuotaClass,
        finalHostedState,
        finalRetryAfterSeconds,
      );
    }
  }

  return buildFailureResult(
    502,
    "TTS_AUDIO_INVALID",
    "Voice generation could not produce playable audio. Captions remain active—please try again.",
    true,
    makeMeta(
      providerAttempts,
      activeModel,
      fallbackUsed,
      modelSwitches,
      primaryQuotaClass,
      "hosted_unavailable",
      primaryRetryAfterSeconds,
    ),
  );
}
