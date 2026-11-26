# WP-011.5 — Final Handoff (TTS Resilience and Hosted Fallback)

## Status
- **Status:** `Complete (Hardened)` — primary/fallback routing, voice identity stabilization, dual-quota session circuit recovery, cohesive UI notices, automated suites, production build, and live HTTP identity WAV probes passed. Final-patch browser walkthrough and post-push live Preview walkthrough were intentionally skipped at the Project Owner’s wrap-up request (`4%` session quota).
- **Branch:** `audit/wp-011-5-tts-resilience` (PR [#7](https://github.com/jendrickcon/kuro/pull/7), kept **OPEN**, zero changes to `main` `d6575dac99d83ba21305ed9191e02e9086c0fdfc`).

## Files Changed
- **Server Runtime & Identity:** [.env.example](../../.env.example), [kuromate-identity-ids.ts](../../src/lib/tts/kuromate-identity-ids.ts), [kuromate-voice-identities.ts](../../src/lib/tts/kuromate-voice-identities.ts), [voice-profiles.ts](../../src/lib/tts/voice-profiles.ts), [gemini-service.ts](../../src/lib/episode/gemini-service.ts), [retry-after.ts](../../src/lib/tts/retry-after.ts), [tts-contract.ts](../../src/lib/tts/tts-contract.ts), [gemini-tts-client.ts](../../src/lib/tts/gemini-tts-client.ts), [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts), [tts-route-handler.ts](../../src/lib/tts/tts-route-handler.ts)
- **Client Queue & UI:** [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts), [use-episode-audio-queue.ts](../../src/hooks/use-episode-audio-queue.ts), [unified-loading-state.ts](../../src/lib/episode/unified-loading-state.ts), [generation-status.tsx](../../src/components/kuro/generation-status.tsx), [player-notice.tsx](../../src/components/kuro/player/player-notice.tsx), [episode-player.tsx](../../src/components/kuro/player/episode-player.tsx), [audio-status-bar.tsx](../../src/components/kuro/player/audio-status-bar.tsx)
- **Tests:** [scripts/test-tts.mjs](../../scripts/test-tts.mjs), [scripts/test-audio-queue.mjs](../../scripts/test-audio-queue.mjs)
- **Consolidated Docs (retained):** [TTS_RESILIENCE_FINDINGS.md](./TTS_RESILIENCE_FINDINGS.md), [WP-011-5_HANDOFF.md](./WP-011-5_HANDOFF.md)
- **Removed Superseded Audit Files (`git rm`):** `TTS_RESILIENCE_AUDIT.md`, `PROVIDER_COMPARISON.md`, `LOCAL_TTS_FEASIBILITY.md`, `IMPLEMENTATION_PLAN.md`

## Key Fixes Included
- **Stable Two-Layer Kuromate Voices:** Decouples Layer 1 host identity (`Maya -> Sulafat`, `Leo -> Puck`, `Sam -> Kore`, generated/unknown -> collision-safe `kuromate_guest_01..03_v1`) from Layer 2 role style (`explainer`, `learner`, `skeptic`, etc.) across both Flash TTS and Flash-Lite TTS, updates `assembleEpisodeCandidate` `voiceId`, isolates `buildSegmentCacheKey` by `voiceIdentityId`, and emits `X-Kuro-TTS-Identity`.
- **Dual-Model Quota Circuit & Notice Cohesion:** Adds `allHostedDailyExhausted` / `HostedTtsHealthStateSchema` (`X-Kuro-TTS-Hosted-State`) so both-model daily limits stop redundant automatic/manual retries and second-episode `/api/tts` calls until reset while retaining cached clips, hides `"Retry hosted audio"`, and prevents silent/caption-only turns from displaying `"Hosted audio active"`.
- **Kokoro & Sample Audio Evaluation:** Documents storage-vs-inference realities, defers browser/server Kokoro hosting (`~109–120 MiB` client download / `GPL-3.0-or-later` eSpeak / cold-start & infra overhead) behind Paid Gemini Tier 1 or Deepgram/Azure, and proposes future CDN sample audio (zero binary audio committed).

## Automated Verification & Build
- `npm run typecheck` & `npm run lint`: Passed (`0` errors).
- `npm run test:schema` (`11`), `npm run test:generation` (`33`), `npm run test:tts` (`49`), `npm run test:audio-queue` (`47`): All passed.
- `npm run build` & `git diff --check`: Clean production build (`/`, `/_not-found`, `/api/episodes`, `/api/tts`).
- `.next/static/` & Client Security Scan: `0` Gemini model IDs, `0` prebuilt voice names, `0` secrets/SDK imports, `0` new deps (`package.json` & `package-lock.json` untouched).

## Live HTTP & Earlier Preview Evidence
- **Final-Patch Local HTTP Probes (`127.0.0.1:3000/api/tts`):** `LEO_EXPLAINER` (`200 OK`, `audio/wav`, `203,548 B`, `X-Kuro-TTS-Identity: kuromate_leo_v1`, `X-Kuro-TTS-Profile: kuromate_explainer_v1`, `X-Kuro-TTS-Hosted-State: fallback_active`) and `MAYA_LEARNER` (`200 OK`, `audio/wav`, `185,788 B`, `X-Kuro-TTS-Identity: kuromate_maya_v1`, `X-Kuro-TTS-Profile: kuromate_learner_v1`, `X-Kuro-TTS-Hosted-State: fallback_active`).
- **Prior PR #7 Hosted Preview (`dpl_A1gwQk83aCdYRSfbq3oC9GFXZcjL`):** Verified Flash-Lite fallback WAV playback + timed-caption exhaustion (`0` console/Google errors). **Note:** Browser walkthrough of this latest hardening patch commit was deferred due to owner session-quota wrap-up (`4%`); recommended for PR #7 Preview check & subjective listening review before merge.

## Pull Request & Next Action
- **PR #7:** [https://github.com/jendrickcon/kuro/pull/7](https://github.com/jendrickcon/kuro/pull/7) — title `feat(wp-011.5): add resilient Kuro TTS fallback`, kept **OPEN** for owner review.
- **Next Action:** Owner confirms Vercel Preview check turns green on the pushed hardening commit, verifies Leo/Maya role-swap audio on Preview after daily quota headroom, and decides whether to merge PR #7 into `main`.
