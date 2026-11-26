# WP-011.5 — Final Handoff (TTS Resilience and Hosted Fallback)

## Status
- **Status:** `Complete` — runtime fallback, tests, production build, local Matrix A–D, security scans, Vercel env setup, and live hosted Vercel Preview fallback + audio playback verification all passed.
- **Branch:** `audit/wp-011-5-tts-resilience` (PR [#7](https://github.com/jendrickcon/kuro/pull/7), kept **OPEN**, zero changes to `main` `d6575dac99d83ba21305ed9191e02e9086c0fdfc`).

## Files Changed
- **Server Runtime & Config:** [.env.example](../../.env.example), [retry-after.ts](../../src/lib/tts/retry-after.ts), [tts-contract.ts](../../src/lib/tts/tts-contract.ts), [gemini-tts-client.ts](../../src/lib/tts/gemini-tts-client.ts), [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts), [tts-route-handler.ts](../../src/lib/tts/tts-route-handler.ts)
- **Client Queue & UI:** [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts), [use-episode-audio-queue.ts](../../src/hooks/use-episode-audio-queue.ts), [unified-loading-state.ts](../../src/lib/episode/unified-loading-state.ts), [generation-status.tsx](../../src/components/kuro/generation-status.tsx), [player-notice.tsx](../../src/components/kuro/player/player-notice.tsx), [episode-player.tsx](../../src/components/kuro/player/episode-player.tsx), [audio-status-bar.tsx](../../src/components/kuro/player/audio-status-bar.tsx)
- **Tests:** [scripts/test-tts.mjs](../../scripts/test-tts.mjs), [scripts/test-audio-queue.mjs](../../scripts/test-audio-queue.mjs)
- **Consolidated Docs (retained):** [TTS_RESILIENCE_FINDINGS.md](./TTS_RESILIENCE_FINDINGS.md), [WP-011-5_HANDOFF.md](./WP-011-5_HANDOFF.md)
- **Removed Superseded Audit Files (`git rm`):** `TTS_RESILIENCE_AUDIT.md`, `PROVIDER_COMPARISON.md`, `LOCAL_TTS_FEASIBILITY.md`, `IMPLEMENTATION_PLAN.md`

## Functional Result
- **Primary -> Flash-Lite Failover:** Eligible capacity failures (`429`, daily quota, `503`, `timeout`, transient `unavailable`) switch **at most once** to allowlisted `gemini-3.8-flash-lite-tts` (`MAX_TTS_PROVIDER_ATTEMPTS = 3`). Auth, missing key, safety, invalid input, unsupported model, oversize, and bad MIME never switch models.
- **Long `Retry-After` & Session Circuit:** Values `> 120s` / daily RPD classify as `long_quota_wait`, open an in-memory session circuit (`routePreference: "fallback"`), skip 8s loops/18h timers, and emit sanitized headers (`X-Kuro-TTS-Fallback-Used`, `X-Kuro-TTS-Quota-Class`, `X-Kuro-TTS-Retry-After`, `X-Kuro-TTS-Profile`).
- **UI & Cache:** Unified loading panel shows `"Primary hosted voices were busy, so Kuro prepared an available Kuromate voice."` and player shows `"Hosted voice service was busy, so Kuro used an available Kuromate voice."` once without model IDs. Fallback WAV clips cache identically and Replay makes `0` extra fetches.

## Automated Tests & Build
- `npm ci`: Passed cleanly (`0` vulnerabilities).
- `npm run typecheck` & `npm run lint`: Passed (`0` errors).
- `npm run test:schema` (`11`), `npm run test:generation` (`33`), `npm run test:tts` (`41`), `npm run test:audio-queue` (`45`): All passed.
- `npm run build` & `git diff --check`: Clean production build (`/`, `/_not-found`, `/api/episodes`, `/api/tts`).

## Live Verification Summary
- **Matrix A & B (`localhost:3000/api/tts`):** `explainer` (`Sulafat`) hit primary daily `429` (`65877s`) -> switched once (`2` attempts) -> Flash-Lite `200 OK` WAV (`3,908 ms`, `266,908 B`, `5,400 ms`, `24 kHz` mono `pcm_s16le` + `C2PA`). `learner` (`Puck`, `2,394 ms`), `skeptic` (`Kore`, `2,969 ms`), and Taglish (`Sulafat`, `2,961 ms`) all passed with `1` attempt and `routePreference: "fallback"`; in-memory WAV PCM stitch confirmed compatible (`462,720 B` / `9,640 ms`).
- **Matrix C (`localhost:3000` Browser):** Quick 8-turn episode prepared opening 2 voices via live fallback (`396 KB` / `8.09s` Turn 1, `300 KB` / `6.10s` Turn 2), played real audio for Turns 1–2, displayed fallback notices cleanly with zero model IDs, passed `0`-call Replay, `320×640`/`390×844`/`1280×800`, keyboard `Tab`/`Enter`, reduced-motion CSS, and `0` console/Google leaks. Turn 3 hit Flash-Lite’s Free Tier `10 RPD` cap (`65780s`), transitioning cleanly without loops to explicit timed captions through Turn 8 completion.
- **Matrix D (`127.0.0.1:3002` Mocked Proxy):** Verified deterministic both-model `long_quota_wait` (`1` call, `Daily limit`, no countdown timer -> `Continue with timed captions`) and `short_cooldown` (`3s` countdown -> `2` calls -> recoverable timed captions) with `0` console errors.

## Vercel Preview Evidence
- **Environment Variable:** `GEMINI_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts` added (`encrypted`) on Vercel for `preview` and `production` alongside existing server vars (zero `NEXT_PUBLIC_*` added).
- **Verified Preview Deployment:** [`dpl_A1gwQk83aCdYRSfbq3oC9GFXZcjL`](https://vercel.com/enuhri/kuro/A1gwQk83aCdYRSfbq3oC9GFXZcjL) (`https://kuro-mu2vdv30h-enuhri.vercel.app`, `READY`) for code commit `01a692fbe06381b7c78878699c11ce4b5a8c5542`.
- **Hosted Browser & Runtime Logs (`iad1`):** `seg_01` switched once after primary `429` (`retryAfterSeconds=64219`, `providerAttempts=2`) -> Flash-Lite `200` WAV (`425,308 B`, `8,700 ms`, `2,665 ms`); `seg_02` skipped primary (`routePreference="fallback"`, `providerAttempts=1`) -> Flash-Lite `200` WAV (`409,468 B`, `8,370 ms`, `2,344 ms`); real audio played Turns 1–2 with episode fallback notice; `seg_03` hit Flash-Lite `429` (`64190s`) and recovered cleanly into `Timed captions mode` at `1280×800` and `320×640` with `0` runtime/console/Google leaks.

## Pull Request & Next Action
- **PR #7:** [https://github.com/jendrickcon/kuro/pull/7](https://github.com/jendrickcon/kuro/pull/7) — title `feat(wp-011.5): add resilient Kuro TTS fallback`, kept **OPEN** for owner review and subjective ear check (`Flash-Lite` EN + Taglish roles).
- **Next Action:** Owner reviews PR #7 and decides whether to merge into `main`.
