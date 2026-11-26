import { randomUUID } from "node:crypto";
import {
  CreateEpisodeResponseSchema,
  EpisodeSchema,
  type CreateEpisodeFailure,
  type CreateEpisodeRequest,
  type CreateEpisodeSuccess,
  type Episode,
} from "@contracts/episode.schema";
import {
  createGeminiTransport,
  DEFAULT_GEMINI_TEXT_MODEL,
  GEMINI_REQUEST_TIMEOUT_MS,
  GeminiProviderError,
  type GeminiTextTransport,
} from "@/lib/episode/gemini-client";
import {
  buildEpisodeSystemInstruction,
  buildEpisodeUserPrompt,
  buildGeminiEpisodeJsonSchema,
  buildRepairPrompt,
  type ValidationIssueSummary,
} from "@/lib/episode/gemini-prompt";

export type GenerationMode = "live" | "mock";

const HOST_ACCENTS = ["#2563EB", "#D97706", "#059669"] as const;

export interface GenerateEpisodeMeta {
  model: string;
  attempts: number;
  retries: number;
  latencyMs: number;
}

export interface GenerateEpisodeResult {
  httpStatus: number;
  response: CreateEpisodeSuccess | CreateEpisodeFailure;
  meta: GenerateEpisodeMeta;
}

export interface GenerateGeminiEpisodeOptions {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  transport?: GeminiTextTransport;
}

/** Uses explicit KURO_GENERATION_MODE=mock when set; defaults safely to live mode. */
export function resolveGenerationMode(
  env: Record<string, string | undefined> = process.env,
): GenerationMode {
  return env.KURO_GENERATION_MODE?.trim().toLowerCase() === "mock" ? "mock" : "live";
}

export function resolveGeminiModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env.GEMINI_TEXT_MODEL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_GEMINI_TEXT_MODEL;
}

function stripOptionalCodeFence(rawText: string): string {
  const trimmed = rawText.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}

function parseJsonObjectSafe(rawText: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(stripOptionalCodeFence(rawText)) };
  } catch {
    return { ok: false };
  }
}

function normalizeVisualCue(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return raw;
  }

  const cue = raw as Record<string, unknown>;
  switch (cue.type) {
    case "none":
      return { type: "none" };
    case "comparison":
      return { type: "comparison", title: cue.title, left: cue.left, right: cue.right };
    case "timeline":
      return { type: "timeline", title: cue.title, points: cue.points };
    case "process":
      return { type: "process", title: cue.title, steps: cue.steps };
    case "fact-card":
      return {
        type: "fact-card",
        title: cue.title,
        value: cue.value,
        explanation: cue.explanation,
      };
    default:
      return raw;
  }
}

/** Merges Gemini draft fields with server-controlled metadata and host palette tokens. */
export function assembleEpisodeCandidate(
  rawDraft: unknown,
  request: CreateEpisodeRequest,
): Record<string, unknown> | null {
  if (typeof rawDraft !== "object" || rawDraft === null || Array.isArray(rawDraft)) {
    return null;
  }

  const draft = rawDraft as Record<string, unknown>;
  const rawHosts = Array.isArray(draft.hosts) ? draft.hosts : [];

  const enrichedHosts = rawHosts.map((item, idx) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      return item;
    }
    const hostObj = item as Record<string, unknown>;
    const role = typeof hostObj.role === "string" ? hostObj.role : "explainer";
    return {
      id: hostObj.id,
      name: hostObj.name,
      role: hostObj.role,
      voiceId: `voice_provisional_${role}_0${idx + 1}`,
      accentColor: HOST_ACCENTS[idx % HOST_ACCENTS.length],
      avatarId: `avatar_${role}_0${idx + 1}`,
    };
  });

  const normalizedSegments = Array.isArray(draft.segments)
    ? draft.segments.map((item) => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return item;
        }
        const segObj = item as Record<string, unknown>;
        return {
          ...segObj,
          visualCue: normalizeVisualCue(segObj.visualCue),
        };
      })
    : draft.segments;

  return {
    id: `ep_gen_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    title: draft.title,
    topic: request.input,
    tone: request.tone,
    length: request.length,
    status: "ready",
    hosts: enrichedHosts,
    segments: normalizedSegments,
    createdAt: new Date().toISOString(),
  };
}

function failureResult(
  httpStatus: number,
  code: CreateEpisodeFailure["error"]["code"],
  message: string,
  retryable: boolean,
  meta: GenerateEpisodeMeta,
): GenerateEpisodeResult {
  const parsed = CreateEpisodeResponseSchema.parse({
    ok: false,
    error: { code, message, retryable },
  }) as CreateEpisodeFailure;
  return { httpStatus, response: parsed, meta };
}

function mapProviderFailure(
  error: GeminiProviderError,
  meta: GenerateEpisodeMeta,
): GenerateEpisodeResult {
  if (error.kind === "rate_limited") {
    return failureResult(429, "RATE_LIMITED", error.message, error.retryable, meta);
  }
  if (error.kind === "timeout") {
    return failureResult(504, "SCRIPT_GENERATION_FAILED", error.message, error.retryable, meta);
  }
  if (error.kind === "missing_key") {
    return failureResult(503, "SCRIPT_GENERATION_FAILED", error.message, error.retryable, meta);
  }
  if (error.kind === "unavailable" || error.kind === "empty_response") {
    return failureResult(502, "SCRIPT_GENERATION_FAILED", error.message, error.retryable, meta);
  }
  return failureResult(500, "INTERNAL_ERROR", error.message, error.retryable, meta);
}

/**
 * Generates and Zod-validates one structured multi-Kuromate script via Gemini,
 * performing at most one bounded repair retry before failing explicitly.
 */
export async function generateGeminiEpisode(
  request: CreateEpisodeRequest,
  options: GenerateGeminiEpisodeOptions = {},
): Promise<GenerateEpisodeResult> {
  const startedAt = Date.now();
  const model = options.model?.trim() || resolveGeminiModel(process.env);
  const timeoutMs = options.timeoutMs ?? GEMINI_REQUEST_TIMEOUT_MS;
  const apiKey = options.apiKey !== undefined ? options.apiKey.trim() : (process.env.GEMINI_API_KEY?.trim() ?? "");

  if (!apiKey && !options.transport) {
    return failureResult(
      503,
      "SCRIPT_GENERATION_FAILED",
      "Live Gemini script generation is not configured on this server. Edit your notes or try the sample episode.",
      false,
      { model, attempts: 0, retries: 0, latencyMs: Date.now() - startedAt },
    );
  }

  let transport: GeminiTextTransport;
  try {
    transport = options.transport ?? createGeminiTransport(apiKey);
  } catch (err) {
    const providerErr =
      err instanceof GeminiProviderError
        ? err
        : new GeminiProviderError("internal", "Unable to initialize script generator.", true);
    return mapProviderFailure(providerErr, {
      model,
      attempts: 0,
      retries: 0,
      latencyMs: Date.now() - startedAt,
    });
  }

  const systemInstruction = buildEpisodeSystemInstruction();
  const jsonSchema = buildGeminiEpisodeJsonSchema(request);
  let lastRaw = "";
  let lastIssues: ValidationIssueSummary[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const userPrompt =
      attempt === 1
        ? buildEpisodeUserPrompt(request)
        : buildRepairPrompt(request, lastRaw, lastIssues);

    try {
      const rawText = await transport({
        model,
        systemInstruction,
        userPrompt,
        jsonSchema,
        timeoutMs,
      });

      lastRaw = rawText;
      const parsedJson = parseJsonObjectSafe(rawText);
      if (!parsedJson.ok) {
        lastIssues = [{ path: "json", message: "Response was not valid JSON." }];
        continue;
      }

      const candidate = assembleEpisodeCandidate(parsedJson.value, request);
      const checked = EpisodeSchema.safeParse(candidate);
      if (checked.success) {
        if (checked.data.hosts.length !== request.hostCount) {
          lastIssues = [
            {
              path: "hosts",
              message: `Expected exactly ${request.hostCount} hosts, got ${checked.data.hosts.length}.`,
            },
          ];
          continue;
        }

        const episode: Episode = checked.data;
        const success = CreateEpisodeResponseSchema.parse({
          ok: true,
          episode,
        }) as CreateEpisodeSuccess;
        return {
          httpStatus: 200,
          response: success,
          meta: {
            model,
            attempts: attempt,
            retries: attempt - 1,
            latencyMs: Date.now() - startedAt,
          },
        };
      }

      lastIssues = checked.error.issues.map((issue) => ({
        path: issue.path.join(".") || "episode",
        message: issue.message,
      }));
    } catch (err) {
      const providerErr =
        err instanceof GeminiProviderError
          ? err
          : new GeminiProviderError(
              "internal",
              "Unexpected script generation failure. Please try again.",
              true,
            );

      if (providerErr.kind === "empty_response" && attempt === 1) {
        lastRaw = "";
        lastIssues = [{ path: "response", message: "Previous response was empty." }];
        continue;
      }

      return mapProviderFailure(providerErr, {
        model,
        attempts: attempt,
        retries: attempt - 1,
        latencyMs: Date.now() - startedAt,
      });
    }
  }

  return failureResult(
    502,
    "SCRIPT_VALIDATION_FAILED",
    "Generated script could not pass Kuro episode validation after one repair attempt. Please try again or adjust your input.",
    true,
    {
      model,
      attempts: 2,
      retries: 1,
      latencyMs: Date.now() - startedAt,
    },
  );
}
