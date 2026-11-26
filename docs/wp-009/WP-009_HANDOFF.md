# WP-009 Handoff — Live Gemini Structured Script Generation

## 1. Status
**Complete** — Server-only Gemini structured script generation, allowlisted primary-to-fallback routing (`gemini-3.8-flash` -> `gemini-3.5-flash-lite`), compact schema validation with 1-attempt repair, non-secret server metadata, honest UI fallback disclosure, automated suite (`33` generation checks, `11` schema checks), and bounded live verification all passed on `feat/wp-009-gemini-script-generation`.

## 2. Files Added or Changed (`feat/wp-009-gemini-script-generation`)
- **Dependencies & env template:** `@google/genai@^3.6.1` (`package.json`, `package-lock.json`); `.env.example` adds `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` alongside empty `GEMINI_API_KEY=`, `GEMINI_TEXT_MODEL=`, `KURO_GENERATION_MODE=`.
- **Server Gemini integration:**
  - `src/lib/episode/gemini-client.ts`: Model allowlists, `45_000` ms timeout, `thinking_level: "low"`, `max_output_tokens: 8192`, `retries: { strategy: "none" }`, `isCapacityFallbackEligible`, and sanitized error classification (`timeout`, `rate_limited`, `service_unavailable`, `auth_error`, `safety_blocked`, `unavailable`, `missing_key`, `unsupported_model`).
  - `src/lib/episode/gemini-prompt.ts`: Compact flat `visualCue` JSON Schema avoiding Gemini constraint-state limits + Kuromate system/user/repair prompts.
  - `src/lib/episode/gemini-service.ts`: Hard caps (`MAX_MODEL_CHOICES = 2`, `MAX_MODEL_SWITCHES = 1`, `MAX_REPAIR_ATTEMPTS = 1`, `MAX_PROVIDER_ATTEMPTS = 3`), allowlist validation (`gemini-4-hydrogen` primary override only), `normalizeVisualCue`, `hostCount` check, and server metadata (`requestedModel`, `resolvedModel`, `fallbackUsed`, `providerAttempts`, `repairAttempts`, `latencyMs`).
  - `src/app/api/episodes/route.ts`: Validates input, logs non-secret generation metadata server-side, sets `X-Kuro-Fallback-Used` header (never exposes exact model IDs), no silent mock fallback.
- **UI, tests & docs:** Honest fallback/source disclosure (`src/app/page.tsx`, `src/components/kuro/*`), `"test:generation"` (`scripts/test-gemini-generation.mjs`), `docs/wp-009/TECHNICAL_FINDINGS.md`, and this handoff.

## 3. Verification Evidence & Boundaries
- **Automated suite:** `typecheck`, `lint`, `test:schema` (`11` checks), `test:generation` (`33` checks covering fallback triggers, non-fallback paths, allowlists, 3-call cap, schema repair, and client/model isolation), `build`, secret scans, legacy-naming scans, and `.next/static` scans all passed.
- **Bounded live verification:** Requesting `gemini-3.8-flash` primary switched cleanly once on upstream capacity to `gemini-3.5-flash-lite` (`fallbackUsed: true`, `providerAttempts: 2`, `repairAttempts: 0`, `latencyMs: 7442`, HTTP `200`, `status: "ready"`, `ep_gen_20e157fae213`, `2` hosts, `8` segments, `EpisodeSchema` pass).
- **Boundaries:** Protected files (`contracts/episode.schema.ts`, `fixtures/`, `SPEC.md`, `AGENTS.md`, `prototype/`) remain untouched; segmented TTS/audio stitching is deferred to `WP-010`.

## 4. Exact Next Action
Review and merge **PR #4** (`https://github.com/jendrickcon/kuro/pull/4`) into `main`, then authorize **WP-010** from the updated `main`.
