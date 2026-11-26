# WP-009 Technical Findings — Gemini Structured Script Generation

> **Labels:** `[Verified]` observed in tools/build/tests | `[Mocked]` deterministic transport tests | `[Blocked]` live API call pending server `GEMINI_API_KEY`

## 1. SDK & API Surface Verification `[Verified]`
- **Package installed:** `@google/genai@3.6.1` (`"type": "module"`, Node `>=22.0.0`, compatible with Kuro `engines.node: "24.x"` and Next.js `16.4.6`). Avoided deprecated `@google/generative-ai`.
- **API chosen:** GA `v1` **Interactions API** (`ai.interactions.create(...)`) with `store: false`, `stream: false`, `system_instruction`, `response_format: { type: "text", mime_type: "application/json", schema }`, `generation_config: { max_output_tokens: 4096 }`, and per-request `timeout_ms` + `AbortController.signal` (`25_000` ms default).
- **Verified model choice:** `gemini-4-hydrogen` default via server env `GEMINI_TEXT_MODEL` (recommended fast, balanced general & structured-output model; `gemini-3.5-flash-lite` documented as lowest-cost fallback). Avoided legacy/deprecated `gemini-2.x` / `1.5` IDs.

## 2. Schema & Prompt Alignment (`contracts/episode.schema.ts`) `[Verified]`
- Kept `contracts/episode.schema.ts` and `ErrorCodeSchema` completely unchanged (`INVALID_INPUT`, `SCRIPT_GENERATION_FAILED`, `SCRIPT_VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`).
- Per upstream `@google/genai` `TextResponseFormat` notes (`text-response-format.ts`), Gemini's JSON Schema subset ignores/rejects complex `minLength`/`maxLength`/`uniqueItems` keywords; therefore `buildGeminiEpisodeJsonSchema` enforces structural `object`/`array`/`enum`/`anyOf` and tight `minItems`/`maxItems` (`hosts` `2–3`, `segments` `8–15`, `points` `2–4`, `steps` `3–5`), while prompt constraints + authoritative `EpisodeSchema.safeParse()` enforce all string caps and cross-turn invariants.
- **Bounded repair:** On malformed JSON, `empty_response`, or Zod failure on Attempt 1, `generateGeminiEpisode` issues at most **1** bounded repair prompt listing Zod issue paths, then returns `502 SCRIPT_VALIDATION_FAILED` (`retryable: true`) if Attempt 2 fails.

## 3. Credential Audit & Security `[Verified]` / `[Blocked]`
- **Credential check `[Verified]`:** Boolean existence check across `Process`/`User`/`Machine` envs and `.env*` files confirmed `GEMINI_API_KEY` is currently unset (`False`). Zero secret values exist in repo or build.
- **Live generation `[Blocked]`:** Could not execute live `gemini-4-hydrogen` latency/quality calls without a valid `GEMINI_API_KEY`. Code behavior is verified with deterministic mocked `GeminiTextTransport` unit tests (`npm run test:generation`) plus real server `503` (no-key live mode) and `200` (`KURO_GENERATION_MODE=mock`) HTTP checks.
- **No silent mock fallback `[Verified]`:** `resolveGenerationMode()` defaults to `"live"`. When `GEMINI_API_KEY` is absent in live mode, `/api/episodes` returns HTTP `503` cleanly so `RecoverableErrorCard` lets users retry, edit input, or explicitly choose `"Try sample episode"`.
