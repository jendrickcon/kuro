import {
  AudioInspectionError,
  decodeAndInspectTtsAudio,
  inspectTtsAudioBuffer,
  type AudioInspectionFailureReason,
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
/** At most one bounded regeneration when the active Gemini model returns empty or corrupt audio bytes. */
export const MAX_TTS_REGENERATION_ATTEMPTS = 1;
/** At most one bounded targeted retry on Deepgram for eligible transient capacity/incomplete failures. */
export const MAX_DEEPGRAM_TARGETED_RETRIES = 1;
export const DEEPGRAM_RETRY_MIN_DELAY_MS = 250;
export const DEEPGRAM_RETRY_DEFAULT_DELAY_MS = 350;
export const DEEPGRAM_RETRY_MAX_DELAY_MS = 2_000;
/**
 * Absolute ceiling on upstream TTS provider calls per request:
 * - Normal success: 1 call
 * - Primary fail + targeted retry (or 1 fallback): 2 calls
 * - Absolute max (Deepgram attempt 1 + targeted Deepgram retry + 1 Gemini fallback, or equivalent Gemini bound): 3 calls
 */
export const MAX_TTS_PROVIDER_ATTEMPTS = 3;

/** Server-selected hosted TTS provider (never chosen by the browser). */
export type TtsProvider = "deepgram" | "gemini";

export interface GenerateSegmentTtsMeta {
  /** Request correlation identifier for sanitized server logs and response headers. */
  requestId?: string;
  /** Initial configured primary provider requested for this call. */
  requestedProvider?: TtsProvider;
  /** Provider that handled the final/winning attempt (`deepgram` or `gemini`). */
  resolvedProvider?: TtsProvider;
  /** Active provider alias for sanitized server telemetry only. */
  provider?: TtsProvider;
  segmentId: string;
  speakerId: string;
  profileId: string;
  identityProfileId: KuromateIdentityProfileId;
  requestedModel: string;
  resolvedModel: string;
  /** Server-selected voice ID for telemetry/headers (excludes Gemini model IDs). */
  resolvedVoice?: string;
  routePreference: TtsRoutePreference;
  retryUsed?: boolean;
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
  requestId?: string;
  transport?: GeminiTtsTransport;
  /** Injectable primary transport for tests; production builds the native-fetch client from `DEEPGRAM_API_KEY`. */
  deepgramTransport?: DeepgramTtsTransport;
  /** Injectable abort-aware backoff timer for deterministic unit tests. */
  sleepFn?: (ms: number, signal?: AbortSignal) => Promise<void>;
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

/** Returns bounded abort-aware retry delay (ms) clamped strictly to [250, 2000] ms. */
export function resolveDeepgramRetryDelayMs(err: GeminiTtsError): number {
  if (err.retryAfterSeconds === undefined || !Number.isFinite(err.retryAfterSeconds)) {
    return DEEPGRAM_RETRY_DEFAULT_DELAY_MS;
  }
  const requestedMs = Math.round(err.retryAfterSeconds * 1000);
  return Math.min(DEEPGRAM_RETRY_MAX_DELAY_MS, Math.max(DEEPGRAM_RETRY_MIN_DELAY_MS, requestedMs));
}

/**
 * Determines whether a first Deepgram failure qualifies for 1 targeted retry on Deepgram.
 * Hard-stops (auth, invalid input, oversize, config, abort, safety, unexpected MIME, long quota) never retry.
 */
export function isDeepgramTargetedRetryEligible(
  err: GeminiTtsError,
  inspectErrReason?: AudioInspectionFailureReason,
): boolean {
  if (err.quotaClass === "long_quota_wait") {
    return false;
  }
  if (err.kind === "invalid_audio") {
    return inspectErrReason === "invalid_header";
  }
  return (
    err.kind === "rate_limited" ||
    err.kind === "service_unavailable" ||
    err.kind === "timeout" ||
    err.kind === "unavailable" ||
    err.kind === "empty_audio"
  );
}

/** Hard-stops must never retry Deepgram OR switch providers to Gemini Flash-Lite. */
function isDeepgramHardStopError(
  err: GeminiTtsError,
  inspectErrReason?: AudioInspectionFailureReason,
): boolean {
  if (err.quotaClass === "long_quota_wait") {
    return true;
  }
  if (
    err.kind === "missing_key" ||
    err.kind === "unsupported_model" ||
    err.kind === "auth_error" ||
    err.kind === "safety_blocked" ||
    err.kind === "invalid_request" ||
    err.kind === "client_aborted" ||
    err.kind === "oversized_audio"
  ) {
    return true;
  }
  return inspectErrReason === "unexpected_mime" || inspectErrReason === "oversized_audio";
}

function defaultAbortAwareSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false),
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false));
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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

  const sleep = options.sleepFn ?? defaultAbortAwareSleep;
  const providerSelection = resolveTtsProvider(env, options.transport !== undefined);
  const resolvedInitialProvider: TtsProvider | undefined = providerSelection.configured
    ? providerSelection.provider
    : undefined;
  const initialRequestedModel =
    resolvedInitialProvider === "deepgram" ? profile.deepgramVoice : requestedModel;

  let metaProvider: TtsProvider | undefined = resolvedInitialProvider;
  let retryUsed = false;
  let resolvedVoice: string =
    resolvedInitialProvider === "deepgram" ? profile.deepgramVoice : profile.voice;

  const makeMeta = (
    providerAttempts: number,
    resolvedModel: string,
    fallbackUsed: boolean,
    modelSwitches: number,
    quotaClass: TtsQuotaClass,
    hostedState: HostedTtsHealthState,
    retryAfterSeconds?: number,
    overrideResolvedVoice?: string,
  ): GenerateSegmentTtsMeta => ({
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(resolvedInitialProvider ? { requestedProvider: resolvedInitialProvider } : {}),
    ...(metaProvider ? { resolvedProvider: metaProvider, provider: metaProvider } : {}),
    segmentId: request.segmentId,
    speakerId: request.speakerId,
    profileId: profile.profileId,
    identityProfileId: profile.identityProfileId,
    requestedModel: initialRequestedModel,
    resolvedModel,
    resolvedVoice: overrideResolvedVoice ?? resolvedVoice,
    routePreference,
    retryUsed,
    fallbackUsed,
    modelSwitches,
    providerAttempts,
    sdkRetryDisabled: true,
    quotaClass,
    hostedState,
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
      makeMeta(0, initialRequestedModel, false, 0, "none", "hosted_unavailable"),
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
    resolvedVoice = profile.fallbackVoice;
  }
  let modelSwitches = 0;
  let providerAttempts = 0;
  let regenerations = 0;
  let primaryQuotaClass: TtsQuotaClass = "none";
  let primaryRetryAfterSeconds: number | undefined;

  // Deepgram primary: attempt 1 -> at most 1 bounded transient retry -> at most 1 capacity switch to Gemini Flash-Lite (max 3 total).
  if (useDeepgram && deepgramTransport && !routedDirectlyToFallback) {
    const deepgramVoice = profile.deepgramVoice;
    let shouldSwitchToGemini = false;
    let switchError: GeminiTtsError | null = null;

    for (let dgTry = 0; dgTry <= MAX_DEEPGRAM_TARGETED_RETRIES; dgTry += 1) {
      providerAttempts += 1;
      if (dgTry > 0) {
        retryUsed = true;
      }

      let inspectErrReason: AudioInspectionFailureReason | undefined;
      try {
        const rawAudio = await deepgramTransport({
          voice: deepgramVoice,
          text: request.text,
          timeoutMs: options.timeoutMs ?? DEEPGRAM_TTS_TIMEOUT_MS,
          signal: options.signal,
        });

        let inspected: { bytes: Buffer; metadata: InspectedAudioResult };
        try {
          inspected = inspectTtsAudioBuffer(rawAudio.bytes, rawAudio.mimeType, maxAudioBytes);
        } catch (inspectErr) {
          if (inspectErr instanceof AudioInspectionError) {
            inspectErrReason = inspectErr.reason;
            throw mapInspectionError(inspectErr).error;
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
            ...makeMeta(
              providerAttempts,
              deepgramVoice,
              false,
              0,
              "none",
              "primary_available",
              undefined,
              deepgramVoice,
            ),
            byteLength: inspected.metadata.byteLength,
            durationMs: inspected.metadata.durationMs,
            container: inspected.metadata.container,
          },
        };
      } catch (err) {
        const providerErr = classifyGeminiTtsError(err, Boolean(options.signal?.aborted));
        if (isDeepgramHardStopError(providerErr, inspectErrReason)) {
          const hardState: HostedTtsHealthState =
            providerErr.quotaClass === "long_quota_wait"
              ? "all_hosted_daily_exhausted"
              : "hosted_unavailable";
          return mapProviderFailure(
            providerErr,
            makeMeta(
              providerAttempts,
              deepgramVoice,
              false,
              0,
              providerErr.quotaClass,
              hardState,
              providerErr.retryAfterSeconds,
              deepgramVoice,
            ),
            providerErr.quotaClass,
            hardState,
            providerErr.retryAfterSeconds,
          );
        }

        if (
          dgTry < MAX_DEEPGRAM_TARGETED_RETRIES &&
          providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS &&
          isDeepgramTargetedRetryEligible(providerErr, inspectErrReason) &&
          !options.signal?.aborted
        ) {
          try {
            await sleep(resolveDeepgramRetryDelayMs(providerErr), options.signal);
          } catch (sleepErr) {
            const abortErr = classifyGeminiTtsError(sleepErr, true);
            return mapProviderFailure(
              abortErr,
              makeMeta(
                providerAttempts,
                deepgramVoice,
                false,
                0,
                "none",
                "hosted_unavailable",
                undefined,
                deepgramVoice,
              ),
              "none",
              "hosted_unavailable",
            );
          }
          continue;
        }

        if (
          fallbackTargetModel !== null &&
          modelSwitches < MAX_TTS_MODEL_SWITCHES &&
          isTtsCapacityFallbackEligible(providerErr) &&
          providerAttempts < MAX_TTS_PROVIDER_ATTEMPTS &&
          !options.signal?.aborted
        ) {
          shouldSwitchToGemini = true;
          switchError = providerErr;
          break;
        }

        const failedState: HostedTtsHealthState =
          providerErr.quotaClass === "long_quota_wait"
            ? "all_hosted_daily_exhausted"
            : "hosted_unavailable";
        return mapProviderFailure(
          providerErr,
          makeMeta(
            providerAttempts,
            deepgramVoice,
            false,
            0,
            providerErr.quotaClass,
            failedState,
            providerErr.retryAfterSeconds,
            deepgramVoice,
          ),
          providerErr.quotaClass,
          failedState,
          providerErr.retryAfterSeconds,
        );
      }
    }

    if (shouldSwitchToGemini && switchError && fallbackTargetModel !== null) {
      if (switchError.quotaClass !== "none") {
        primaryQuotaClass = switchError.quotaClass;
      }
      if (switchError.retryAfterSeconds !== undefined) {
        primaryRetryAfterSeconds = switchError.retryAfterSeconds;
      }
      modelSwitches += 1;
      fallbackUsed = true;
      activeModel = fallbackTargetModel;
      metaProvider = "gemini";
      resolvedVoice = profile.fallbackVoice;
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
