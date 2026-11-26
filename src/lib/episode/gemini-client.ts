import { GoogleGenAI } from "@google/genai";

export const PRIMARY_GEMINI_TEXT_MODEL = "gemini-3.8-flash";
export const FALLBACK_GEMINI_TEXT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_GEMINI_TEXT_MODEL = PRIMARY_GEMINI_TEXT_MODEL;

/** Server-side allowlist of primary text models permitted via GEMINI_TEXT_MODEL. */
export const ALLOWED_GEMINI_TEXT_MODELS = [
  PRIMARY_GEMINI_TEXT_MODEL,
  FALLBACK_GEMINI_TEXT_MODEL,
  "gemini-4-hydrogen",
] as const;

/** Server-side allowlist for automatic capacity fallback only. */
export const ALLOWED_GEMINI_FALLBACK_MODELS = [FALLBACK_GEMINI_TEXT_MODEL] as const;

export type AllowedGeminiTextModel = (typeof ALLOWED_GEMINI_TEXT_MODELS)[number];
export type AllowedGeminiFallbackModel = (typeof ALLOWED_GEMINI_FALLBACK_MODELS)[number];

export const GEMINI_REQUEST_TIMEOUT_MS = 45_000;

export type GeminiProviderErrorKind =
  | "missing_key"
  | "unsupported_model"
  | "auth_error"
  | "safety_blocked"
  | "timeout"
  | "rate_limited"
  | "service_unavailable"
  | "unavailable"
  | "empty_response"
  | "internal";

export class GeminiProviderError extends Error {
  readonly kind: GeminiProviderErrorKind;
  readonly retryable: boolean;

  constructor(kind: GeminiProviderErrorKind, message: string, retryable: boolean) {
    super(message);
    this.name = "GeminiProviderError";
    this.kind = kind;
    this.retryable = retryable;
  }
}

/** Capacity/transient errors that justify one bounded automatic switch to fallback. */
export function isCapacityFallbackEligible(kind: GeminiProviderErrorKind): boolean {
  return kind === "rate_limited" || kind === "service_unavailable" || kind === "timeout";
}

export interface GeminiTextRequest {
  model: string;
  systemInstruction: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  timeoutMs: number;
}

export type GeminiTextTransport = (request: GeminiTextRequest) => Promise<string>;

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

const SAFETY_REJECTION_PATTERN = /\b(safety|prohibited_content|blocklist|content_policy|harm_category)\b/i;
const SERVICE_UNAVAILABLE_PATTERN = /\bservice_unavailable\b/i;

/** Classifies SDK/network errors safely without returning credentials or raw upstream payloads. */
export function classifyGeminiError(error: unknown): GeminiProviderError {
  if (error instanceof GeminiProviderError) {
    return error;
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
    return new GeminiProviderError(
      "timeout",
      "Gemini took too long to generate the conversation. Please try again.",
      true,
    );
  }

  if (status === 429) {
    return new GeminiProviderError(
      "rate_limited",
      "The AI script service is temporarily busy. Please wait a moment and try again.",
      true,
    );
  }

  if (status === 401 || status === 403) {
    return new GeminiProviderError(
      "auth_error",
      "Server AI credentials could not be verified. Edit your topic or try the sample episode.",
      false,
    );
  }

  if (SAFETY_REJECTION_PATTERN.test(signalText)) {
    return new GeminiProviderError(
      "safety_blocked",
      "This topic could not be processed due to content safety limits. Edit your input or try the sample episode.",
      false,
    );
  }

  if (status === 503 || SERVICE_UNAVAILABLE_PATTERN.test(signalText)) {
    return new GeminiProviderError(
      "service_unavailable",
      "Live Gemini script generation is currently experiencing high demand. Please try again or open the sample episode.",
      true,
    );
  }

  if (
    name === "APIConnectionError" ||
    name === "ConnectionError" ||
    (typeof status === "number" && status >= 500) ||
    status === 400 ||
    status === 404
  ) {
    return new GeminiProviderError(
      "unavailable",
      "Live Gemini script generation is currently unavailable. Please try again or open the sample episode.",
      true,
    );
  }

  return new GeminiProviderError(
    "internal",
    "Unexpected script generation error. Your input is preserved—please try again.",
    true,
  );
}

/** Creates a bounded server-only transport backed by `@google/genai` Interactions API. */
export function createGeminiTransport(apiKey: string): GeminiTextTransport {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new GeminiProviderError(
      "missing_key",
      "Live Gemini script generation is not configured on this server.",
      false,
    );
  }

  const ai = new GoogleGenAI({ apiKey: trimmedKey });

  return async (request: GeminiTextRequest): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);

    try {
      const interaction = await ai.interactions.create(
        {
          model: request.model,
          system_instruction: request.systemInstruction,
          input: request.userPrompt,
          store: false,
          stream: false,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: request.jsonSchema,
          },
          generation_config: {
            thinking_level: "low",
            max_output_tokens: 8192,
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
          throw new GeminiProviderError(
            "safety_blocked",
            "This topic could not be processed due to content safety limits. Edit your input or try the sample episode.",
            false,
          );
        }
      }

      const text = typeof interaction.output_text === "string" ? interaction.output_text.trim() : "";
      if (!text) {
        throw new GeminiProviderError(
          "empty_response",
          "Gemini returned an empty response. Please try again.",
          true,
        );
      }

      return text;
    } catch (error) {
      if (controller.signal.aborted) {
        throw new GeminiProviderError(
          "timeout",
          "Gemini took too long to generate the conversation. Please try again.",
          true,
        );
      }
      throw classifyGeminiError(error);
    } finally {
      clearTimeout(timer);
    }
  };
}
