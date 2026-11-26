# WP-009 Handoff — Live Gemini Structured Script Generation

## 1. Status
**Partially complete** — Server-side Gemini structured generation, Zod validation with bounded repair, timeout/error mapping, honest generated-vs-sample UI disclosure, `.env.example`, repeatable mocked test suite, and documentation are implemented and verified. **Live Gemini verification is blocked pending a server-side `GEMINI_API_KEY`.**

## 2. Files Added or Changed (`feat/wp-009-gemini-script-generation`)
- **Dependencies:** Installed `@google/genai` (`^3.6.1`) in [package.json](../../package.json) & `package-lock.json`; added `"test:generation"` script.
- **Server Gemini integration:**
  - `src/lib/episode/gemini-prompt.ts`: System/user/repair prompts + Gemini `TextResponseFormat` JSON Schema aligned with `EpisodeSchema`.
  - `src/lib/episode/gemini-client.ts`: Bounded `@google/genai` Interactions transport (`store: false`, `timeout_ms`, `AbortController`, sanitized error classifier).
  - `src/lib/episode/gemini-service.ts`: `generateGeminiEpisode` (1 bounded repair retry, `status: "ready"`, server-assigned accents/IDs/topic), `resolveGenerationMode`, `resolveGeminiModel`.
  - `src/app/api/episodes/route.ts`: Validates `CreateEpisodeRequestSchema`, runs live Gemini by default or `createMockEpisode` strictly when `KURO_GENERATION_MODE=mock` (no silent fallback).
- **Minimal honest UI updates:** `src/app/page.tsx` (`"Timed preview"`), `src/components/kuro/creation-form.tsx` (`"2 Kuromates"`/`"3 Kuromates"` + honest description), `src/components/kuro/generation-status.tsx`, `src/components/kuro/form-error.tsx` (adds `"Try sample episode"` recovery action), `src/components/kuro/kuro-skeleton.tsx` (`"generated" | "mock" | "sample"` source), `src/components/kuro/player/episode-player.tsx`, and `src/components/kuro/player/player-notice.tsx`.
- **Tests, env & docs:** `scripts/test-gemini-generation.mjs`, `.env.example` (names only: `GEMINI_API_KEY=`, `GEMINI_TEXT_MODEL=`, `KURO_GENERATION_MODE=`), `docs/wp-009/TECHNICAL_FINDINGS.md`, and this handoff.

## 3. Verification Evidence & Honest Boundaries
- **Verified `[Verified]` / `[Mocked]`:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:schema`, `npm run test:generation`, `npm run build`, local HTTP endpoint tests (`503` live missing key, `400 INVALID_INPUT`, `200` with `KURO_GENERATION_MODE=mock`), browser smoke verification of recoverable error -> `"Try sample episode"`, and client-bundle/retired-term scans (exact counts in PR report).
- **Blocked `[Blocked]`:** Live Gemini API response latency, real structured dialogue quality, and repair rates on live `gemini-4-hydrogen` could not be measured because `GEMINI_API_KEY` is unset. Zero TTS or audio generation added (`WP-010`).

## 4. Exact Next Action
Review and merge this WP-009 PR, set server-only `GEMINI_API_KEY` in `.env.local` (and Vercel project env) to run the bounded 2-Kuromate & 3-Kuromate live smoke verification, then assign `WP-010` segmented TTS.
