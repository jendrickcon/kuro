# WP-009 Technical Findings — Live Gemini Structured Script Generation

> **Labels:** `[Verified]` observed in tools/build/tests/live API | `[Mocked]` deterministic transport tests | `[Capacity-limited]` transient upstream HTTP 503

## 1. SDK, Models & Schema Compatibility `[Verified]`
- **SDK & API:** `@google/genai@3.6.1` GA Interactions API (`ai.interactions.create`, `store: false`, `stream: false`, `response_format: { type: "text", mime_type: "application/json", schema }`).
- **Configured models:** Code fallback remains `gemini-4-hydrogen` (`DEFAULT_GEMINI_TEXT_MODEL`); local `.env.local` primary model remains `gemini-3.8-flash` (untouched).
- **Schema state-limit fix:** Nested `minItems`/`maxItems` and a 5-branch `anyOf` inside `segments[].visualCue` triggered Gemini HTTP `400 invalid_request` (constraint-state limit). `buildGeminiEpisodeJsonSchema` now emits a compact flat `visualCue` schema; `normalizeVisualCue` strips extraneous keys, `generateGeminiEpisode` verifies exact `request.hostCount`, and `EpisodeSchema.safeParse()` enforces all bounds (max 1 bounded repair retry).
- **Transport hardening:** `generation_config: { thinking_level: "low", max_output_tokens: 8192 }`, `GEMINI_REQUEST_TIMEOUT_MS = 45_000`, `RequestAbortedError -> 504`, and bounded `503`-only SDK backoff (`maxRetries: 2`, `maxElapsedTime: 8000`).

## 2. Live Verification Evidence (`gemini-3.5-flash-lite` Override) `[Verified]`
- **Auth & upstream capacity `[Capacity-limited]`:** `ai.models.list()` succeeded (listing `gemini-3.8-flash`, `gemini-4-hydrogen`, `gemini-3.5-flash-lite`). Both `gemini-3.8-flash` and `gemini-4-hydrogen` returned upstream HTTP `503 service_unavailable` ("high demand, spikes in demand are usually temporary") — recorded as temporary upstream capacity limits, not implementation failures.
- **Test A (2-Kuromate quick casual — Opportunity cost):** HTTP `200`, `ok: true`, `status: "ready"`, `ep_gen_33c16b5713fe`, `4149 ms`, `1` attempt (`0` repairs), `2` hosts (`Maya` 5, `Leo` 4), `9` contiguous segments, `1` `fact-card` visual, `EpisodeSchema` & `CreateEpisodeResponseSchema` pass.
- **Test B (3-Kuromate quick serious — Inflation):** HTTP `200`, `ok: true`, `status: "ready"`, `ep_gen_6b14f9b3b37e`, `6532 ms`, `1` attempt (`0` repairs), `3` hosts (`Maya` 3, `Leo` 3, `Sam` 2), `8` contiguous segments, `1` `fact-card` visual, `EpisodeSchema` & `CreateEpisodeResponseSchema` pass.
- **Live UI check (`http://localhost:3000`):** Invalid input `"short"` preserved with `0` API calls; valid submit showed honest `"Working"` loading copy -> HTTP `200` -> `"Generated episode"` badge (no `"Sample episode"` / `"Mock episode"` badge), 2 Kuromates playable across turns, `0` horizontal overflow across `71` elements at `320x640`, `"Try sample episode"` remains separate, `0` console/hydration errors.

## 3. Security & Boundaries `[Verified]`
- `.env.local` is gitignored (`.gitignore:70:.env.*`) and untracked; zero API-key prefixes, private credentials, or `@google/genai` imports appear in client source, docs, git diff, or `.next/static`.
- Missing `GEMINI_API_KEY` fails explicitly (`503 SCRIPT_GENERATION_FAILED`) with zero silent mock fallback; TTS/audio generation remains out of scope for WP-009 (`WP-010`).
