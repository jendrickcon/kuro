import { GoogleGenAI } from "@google/genai";
import {
  isDailyQuotaText,
  parseRetryAfterRawSeconds,
  sanitizeRetryAfterSeconds,
  SHORT_COOLDOWN_MAX_SECONDS,
  type TtsQuotaClass,
} from "@/lib/tts/retry-after";

export const PRIMARY_GEMINI_TTS_MODEL = "gemini-3.8-flash-tts";
export const LITE_GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts";

/** Server-side allowlist of supported Gemini TTS primary models (configurable only via server env). */
export const ALLOWED_GEMINI_TTS_MODELS = [
  PRIMARY_GEMINI_TTS_MODEL,
  LITE_GEMINI_TTS_MODEL,
] as const;

/** Server-side allowlist of supported automatic fallback TTS models. */
export const ALLOWED_GEMINI_TTS_FALLBACK_MODELS = [LITE_GEMINI_TTS_MODEL] as const;

export type AllowedGeminiTtsModel = (typeof ALLOWED_GEMINI_TTS_MODELS)[number];
export type AllowedGeminiTtsFallbackModel = (typeof ALLOWED_GEMINI_TTS_FALLBACK_MODELS)[number];

export const GEMINI_TTS_TIMEOUT_MS = 30_000;

export type GeminiTtsErrorKind =
  | "missing_key"
  | "unsupported_model"
  | "auth_error"
  | "safety_blocked"
  | "invalid_request"
  | "rate_limited"
  | "service_unavailable"
  | "timeout"
  | "client_aborted"
  | "unavailable"
  | "empty_audio"
  | "invalid_audio"
  | "oversized_audio"
  | "internal";

export class GeminiTtsError extends Error {
  readonly kind: GeminiTtsErrorKind;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | undefined;
  readonly quotaClass: TtsQuotaClass;

  constructor(
    kind: GeminiTtsErrorKind,
    message: string,
    retryable: boolean,
    retryAfterSeconds?: number,
    quotaClass: TtsQuotaClass = "none",
  ) {
    super(message);
    this.name = "GeminiTtsError";
    this.kind = kind;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
    this.quotaClass = quotaClass;
  }
}

export interface GeminiTtsRequest {
  model: string;
  text: string;
  voice: string;
  styleInstruction: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface GeminiTtsRawAudio {
  base64Data: string;
  mimeType: string;
}

export type GeminiTtsTransport = (request: GeminiTtsRequest) => Promise<GeminiTtsRawAudio>;

function readErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const rec = error as Record<string, unknown>;
  if (typeof rec.status === "number") return rec.status;
  if (typeof rec.statusCode === "number") return rec.statusCode;
  return undefined;
}

function readErrorName(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const rec = error as Record<string, unknown>;
  return typeof rec.name === "string" ? rec.name : "";
}

function readErrorSignalText(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const rec = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof rec.code === "string") parts.push(rec.code);
  if (typeof rec.message === "string") parts.push(rec.message);
  if (typeof rec.body === "string") parts.push(rec.body);
  if (typeof rec.status === "string") parts.push(rec.status);
  if (typeof rec.cause === "object" && rec.cause !== null) {
    const cause = rec.cause as Record<string, unknown>;
    if (typeof cause.code === "string") parts.push(cause.code);
    if (typeof cause.message === "string") parts.push(cause.message);
  }
  return parts.join(" ");
}

function readRetryAfterSeconds(error: unknown, signalText: string): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const rec = error as Record<string, unknown>;
  const headers = rec.headers;
  let rawValue: string | null = null;
  if (headers && typeof (headers as { get?: unknown }).get === "function") {
    rawValue = (headers as { get: (k: string) => string | null }).get("retry-after");
  } else if (typeof headers === "object" && headers !== null) {
    const headerRec = headers as Record<string, unknown>;
    const candidate = headerRec["retry-after"] ?? headerRec["Retry-After"];
    if (typeof candidate === "string" || typeof candidate === "number") {
      rawValue = String(candidate);
    }
  }
  if (!rawValue && signalText) {
    const match = signalText.match(/retry[-_ ]after\s*[:=]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      rawValue = match[1];
    }
  }
  if (!rawValue) return undefined;
  const parsedSeconds = parseRetryAfterRawSeconds(rawValue);
  return sanitizeRetryAfterSeconds(parsedSeconds);
}

const SAFETY_REJECTION_PATTERN =
  /\b(safety|prohibited_content|blocklist|content_policy|harm_category)\b/i;
const SERVICE_UNAVAILABLE_PATTERN = /\bservice_unavailable\b/i;
const RATE_LIMITED_PATTERN = /\bRESOURCE_EXHAUSTED\b/i;

/** Returns true only for capacity/transient transport errors eligible for 1-switch hosted fallback. */
export function isTtsCapacityFallbackEligible(error: GeminiTtsError): boolean {
  return (
    error.kind === "rate_limited" ||
    error.kind === "service_unavailable" ||
    error.kind === "timeout" ||
    error.kind === "unavailable"
  );
}

/** Classifies TTS provider and network errors into safe, non-secret user messages. */
export function classifyGeminiTtsError(
  error: unknown,
  abortedByCaller: boolean = false,
): GeminiTtsError {
  if (error instanceof GeminiTtsError) {
    return error;
  }

  if (abortedByCaller) {
    return new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false);
  }

  const name = readErrorName(error);
  const status = readErrorStatus(error);
  const signalText = readErrorSignalText(error);

  if (
    name === "AbortError" ||
    name === "RequestAbortedError" ||
    name === "RequestTimeoutError" ||
    status === 408 ||
    status === 504
  ) {
    return new GeminiTtsError(
      "timeout",
      "Kuromate voice generation took too long. Captions remain active—please try again.",
      true,
    );
  }

  if (status === 429 || RATE_LIMITED_PATTERN.test(signalText)) {
    const retryAfterSeconds = readRetryAfterSeconds(error, signalText);
    const isLongQuota =
      (retryAfterSeconds !== undefined && retryAfterSeconds > SHORT_COOLDOWN_MAX_SECONDS) ||
      isDailyQuotaText(signalText);
    const quotaClass: TtsQuotaClass = isLongQuota ? "long_quota_wait" : "short_cooldown";
    const message = isLongQuota
      ? "Hosted Kuromate voices have reached today’s limit. You can continue with timed captions."
      : "Hosted Kuromate voices are temporarily busy. Captions remain active—please wait a moment and retry.";
    return new GeminiTtsError("rate_limited", message, true, retryAfterSeconds, quotaClass);
  }

  if (status === 401 || status === 403) {
    return new GeminiTtsError(
      "auth_error",
      "Voice service credentials could not be verified on this server. Captions remain active.",
      false,
    );
  }

  if (SAFETY_REJECTION_PATTERN.test(signalText)) {
    return new GeminiTtsError(
      "safety_blocked",
      "This segment could not be voiced due to content safety limits. Captions remain active.",
      false,
    );
  }

  if (status === 400 || status === 404) {
    return new GeminiTtsError(
      "invalid_request",
      "This segment could not be voiced right now. Captions remain active.",
      false,
    );
  }

  if (status === 503 || SERVICE_UNAVAILABLE_PATTERN.test(signalText)) {
    return new GeminiTtsError(
      "service_unavailable",
      "Hosted Kuromate voice service is experiencing high demand. Captions remain active—please try again.",
      true,
    );
  }

  if (
    name === "APIConnectionError" ||
    name === "ConnectionError" ||
    (typeof status === "number" && status >= 500)
  ) {
    return new GeminiTtsError(
      "unavailable",
      "Hosted Kuromate voice service is temporarily unavailable. Captions remain active—please try again.",
      true,
    );
  }

  return new GeminiTtsError(
    "internal",
    "Unexpected voice generation error. Captions remain active—please try again.",
    true,
  );
}

/** Creates a server-only `@google/genai` v1beta Interactions TTS transport (`store: false`, zero hidden retries). */
export function createGeminiTtsTransport(apiKey: string): GeminiTtsTransport {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new GeminiTtsError(
      "missing_key",
      "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
      false,
    );
  }

  // Gemini 3.8 TTS models require v1beta; keep v1beta isolated to TTS without affecting WP-009 text generation.
  const ai = new GoogleGenAI({
    apiKey: trimmedKey,
    httpOptions: {
      apiVersion: "v1beta",
      retryOptions: { attempts: 1 },
    },
  });

  return async (request: GeminiTtsRequest): Promise<GeminiTtsRawAudio> => {
    if (request.signal?.aborted) {
      throw new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false);
    }

    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = false;

    const onCallerAbort = () => {
      callerAborted = true;
      controller.abort();
    };
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);

    try {
      const interaction = await ai.interactions.create(
        {
          model: request.model,
          store: false,
          stream: false,
          input: [
            {
              type: "user_input",
              content: [
                {
                  type: "text",
                  text: request.text,
                  annotations: [
                    {
                      type: "speech_metadata",
                      style: request.styleInstruction,
                    },
                  ],
                },
              ],
            },
          ],
          response_format: {
            type: "audio",
            mime_type: "audio/wav",
          },
          generation_config: {
            speech_config: [{ voice: request.voice }],
          },
        },
        {
          retries: { strategy: "none" },
          timeout_ms: request.timeoutMs,
          signal: controller.signal,
        },
      );

      const interactionStatus = (interaction as { status?: unknown }).status;
      if (interactionStatus === "failed") {
        const serializedStatus = JSON.stringify({
          status: interactionStatus,
          outputs: (interaction as { outputs?: unknown }).outputs,
        });
        if (SAFETY_REJECTION_PATTERN.test(serializedStatus)) {
          throw new GeminiTtsError(
            "safety_blocked",
            "This segment could not be voiced due to content safety limits. Captions remain active.",
            false,
          );
        }
      }

      const base64Data =
        typeof interaction.output_audio?.data === "string" ? interaction.output_audio.data : "";
      if (!base64Data.trim()) {
        throw new GeminiTtsError(
          "empty_audio",
          "Hosted voice provider returned no audio for this segment. Captions remain active.",
          true,
        );
      }

      const mimeType =
        typeof interaction.output_audio?.mime_type === "string"
          ? interaction.output_audio.mime_type
          : "audio/wav";

      return { base64Data, mimeType };
    } catch (error) {
      if (callerAborted) {
        throw new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false);
      }
      if (timedOut || controller.signal.aborted) {
        throw new GeminiTtsError(
          "timeout",
          "Kuromate voice generation took too long. Captions remain active—please try again.",
          true,
        );
      }
      throw classifyGeminiTtsError(error, false);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  };
}
