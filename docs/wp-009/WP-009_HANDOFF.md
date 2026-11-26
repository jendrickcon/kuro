# WP-009 Handoff — Live Gemini Structured Script Generation

## 1. Status
**Complete** — Live Gemini script generation, structured schema compatibility, Zod validation with bounded 1-attempt repair, timeout/503-backoff hardening, honest generated-vs-sample UI disclosure, regression tests, and live UI checks passed on `feat/wp-009-gemini-script-generation` with `.env.local` server credentials.

## 2. Files Added or Changed (`feat/wp-009-gemini-script-generation`)
- **Dependencies:** `@google/genai@^3.6.1` in `package.json` & `package-lock.json`; `"test:generation"` script (`21` checks).
- **Server Gemini integration:**
  - `src/lib/episode/gemini-prompt.ts`: System/user/repair prompts + compact flat `visualCue` JSON Schema avoiding Gemini constraint-state-limit errors.
  - `src/lib/episode/gemini-client.ts`: Bounded `@google/genai` Interactions transport (`thinking_level: "low"`, `max_output_tokens: 8192`, `45_000` ms timeout, `RequestAbortedError -> 504`, `503`-only backoff `maxRetries: 2` / `maxElapsedTime: 8000`).
  - `src/lib/episode/gemini-service.ts`: `normalizeVisualCue`, exact `request.hostCount` enforcement, 1 bounded repair retry, `status: "ready"`, and explicit `KURO_GENERATION_MODE=mock` opt-in.
  - `src/app/api/episodes/route.ts`: Validates `CreateEpisodeRequestSchema`, runs live Gemini by default (no silent mock fallback).
- **UI, env, tests & docs:** Minimal honest UI updates (`src/app/page.tsx`, `src/components/kuro/*`), `.env.example` (names only), `scripts/test-gemini-generation.mjs`, `docs/wp-009/TECHNICAL_FINDINGS.md`, and this handoff.

## 3. Live Verification Results & Remaining Limitations
- **Verified temporary test model:** `gemini-3.5-flash-lite` (process-level override; `.env.local` primary model remains `gemini-3.8-flash` and code default remains `gemini-4-hydrogen`). Both `gemini-3.8-flash` and `gemini-4-hydrogen` returned temporary upstream HTTP `503 service_unavailable` high-demand errors during the check window (recorded as upstream capacity limitations, not implementation failures).
- **Bounded live runs:** Test A (`2` Kuromates casual: `4149 ms`, `1` attempt, `0` repairs, `9` segments, `1` `fact-card`, Zod pass, `ep_gen_33c16b5713fe`) and Test B (`3` Kuromates serious: `6532 ms`, `1` attempt, `0` repairs, `8` segments, `1` `fact-card`, Zod pass, `ep_gen_6b14f9b3b37e`) both returned HTTP `200`, `status: "ready"`.
- **Browser & regression:** Live form -> `"Generated episode"` player (no sample/mock badge), short-input preservation (`0` API calls), `320x640` mobile check (`0` overflow), `typecheck`, `lint`, `test:schema` (`11`), `test:generation` (`21`), `build`, and secret/legacy-naming scans all passed.
- **Remaining limitations:** No segmented TTS or audio stitching yet (deferred to `WP-010`); `gemini-3.8-flash` / `gemini-4-hydrogen` live calls can be spot-checked once upstream `503` demand clears.

## 4. Exact Next Action
Review and merge **PR #4** (`https://github.com/jendrickcon/kuro/pull/4`) into `main`, then authorize **WP-010** from the updated `main`.
