import { GoogleGenAI } from "@google/genai";

/** Verified current Flash-class balanced model from Gemini API dev docs (`@google/genai` >= 3.5.0). */
export const DEFAULT_GEMINI_TEXT_MODEL = "gemini-4-hydrogen";
export const GEMINI_REQUEST_TIMEOUT_MS = 45_000;

export type GeminiProviderErrorKind =
  | "missing_key"
  | "timeout"
  | "rate_limited"
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

/** Classifies SDK/network errors safely without returning credentials or raw upstream payloads. */
export function classifyGeminiError(error: unknown): GeminiProviderError {
  if (error instanceof GeminiProviderError) {
    return error;
  }

  const name = readErrorName(error);
  const status = readErrorStatus(error);

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
      "unavailable",
      "Server AI credentials could not be verified. Edit your topic or try the sample episode.",
      false,
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
          retries: {
            strategy: "attempt-count-backoff",
            maxRetries: 2,
            backoff: {
              initialInterval: 800,
              maxInterval: 2500,
              exponent: 2,
              maxElapsedTime: 8000,
            },
            retryConnectionErrors: false,
          },
          retry_codes: ["503"],
          timeout_ms: request.timeoutMs,
          signal: controller.signal,
        },
      );

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
