# WP-009 Technical Findings — Live Gemini Structured Script Generation

> **Labels:** `[Verified]` observed in tools/build/tests/live API | `[Mocked]` deterministic tests | `[Capacity-limited]` transient upstream HTTP 503

## 1. SDK, Allowlisted Models & Bounded Fallback `[Verified]`
- **SDK & API:** `@google/genai@3.6.1` GA Interactions API (`ai.interactions.create`, `store: false`, `stream: false`, `response_format: { type: "text", mime_type: "application/json", schema }`, `generation_config: { thinking_level: "low", max_output_tokens: 8192 }`, `GEMINI_REQUEST_TIMEOUT_MS = 45_000`, SDK `retries: { strategy: "none" }`).
- **Server allowlists (`src/lib/episode/gemini-client.ts`, `gemini-service.ts`):**
  - Primary default: `gemini-3.8-flash` (`ALLOWED_GEMINI_TEXT_MODELS`: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-4-hydrogen`).
  - Automatic capacity fallback (`GEMINI_FALLBACK_MODEL`): strictly `gemini-3.5-flash-lite` (`ALLOWED_GEMINI_FALLBACK_MODELS`). `gemini-4-hydrogen` is accepted only via explicit `GEMINI_TEXT_MODEL` override; arbitrary model IDs fail (`503`, `retryable: false`) with `0` provider calls.
- **Hard execution caps:** `MAX_MODEL_CHOICES = 2`, `MAX_MODEL_SWITCHES = 1`, `MAX_REPAIR_ATTEMPTS = 1`, `MAX_PROVIDER_ATTEMPTS = 3` (0 hidden SDK retries).
- **Trigger rules:** Fallback switches once immediately **only** on HTTP `429` (`rate_limited`), HTTP `503` / `service_unavailable`, or timeout (`AbortError` / `RequestAbortedError` / `RequestTimeoutError` / `408` / `504`). Auth errors (`401`/`403`), safety rejections, missing key, unsupported model config, internal errors, and normal schema/Zod failures never trigger capacity fallback (schema failures stay on the active model for at most 1 repair).
- **Schema compatibility fix:** Compact flat `visualCue` schema (`buildGeminiEpisodeJsonSchema`) avoids Gemini HTTP `400` constraint-state limits; `normalizeVisualCue`, exact `request.hostCount`, and `EpisodeSchema.safeParse()` enforce all bounds.

## 2. Live Verification Evidence `[Verified]` / `[Capacity-limited]`
- **Bounded live fallback test (default `.env.local` primary):** Requested `gemini-3.8-flash` (hit transient `503` capacity -> immediate single switch to `gemini-3.5-flash-lite`) -> HTTP `200`, `ok: true`, `status: "ready"`, `ep_gen_20e157fae213`, `2` hosts, `8` segments, `EpisodeSchema` & `CreateEpisodeResponseSchema` pass (`fallbackUsed: true`, `providerAttempts: 2`, `repairAttempts: 0`, `latencyMs: 7442`, no mock fallback).
- **Prior bounded live checks (`gemini-3.5-flash-lite`):** Test A (`2` Kuromates casual: `4149 ms`, `1` attempt, `9` segments, `1` `fact-card`, `ep_gen_33c16b5713fe`) & Test B (`3` Kuromates serious: `6532 ms`, `1` attempt, `8` segments, `1` `fact-card`, `ep_gen_6b14f9b3b37e`) passed HTTP `200` with `0` browser console/hydration errors and `0` horizontal overflow at `320x640`.

## 3. Metadata, UI Disclosure & Security `[Verified]`
- `/api/episodes` logs non-secret server metadata (`requestedModel`, `resolvedModel`, `fallbackUsed`, `providerAttempts`, `repairAttempts`, `latencyMs`), never returns model names to the client, and sets `X-Kuro-Fallback-Used`; `PlayerNotice` displays `"Generated using an available Gemini model."` when fallback was used.
- `.env.local` is gitignored (`.gitignore:70:.env.*`) and untracked; client source and `.next/static` contain zero secrets, SDK imports, or model IDs; missing keys fail explicitly without mock fallback.
