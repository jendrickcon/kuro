# WP-011 Consolidated Handoff — Full Episode Audio Queue, Synchronization & Transient Recovery

## Status
**Complete** — Generated full quick episodes play hosted Kuromate audio in dialogue order with max-2 prefetching, synchronized Kuromates/captions/visuals, bounded `Retry-After` recovery, **transient failure recovery across Replay and targeted `Retry voice`**, clean object-URL cleanup, and passing local, proxy-browser, and automated verification.

## Files Changed
- **New:** [retry-after.ts](../../src/lib/tts/retry-after.ts), [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts), [use-episode-audio-queue.ts](../../src/hooks/use-episode-audio-queue.ts), [audio-status-bar.tsx](../../src/components/kuro/player/audio-status-bar.tsx), [test-audio-queue.mjs](../../scripts/test-audio-queue.mjs), [AUDIO_QUEUE_FINDINGS.md](./AUDIO_QUEUE_FINDINGS.md), `docs/wp-011/WP-011_HANDOFF.md`.
- **Modified:** [object-url-manager.ts](../../src/lib/tts/object-url-manager.ts), [episode-player.tsx](../../src/components/kuro/player/episode-player.tsx), [playback-controls.tsx](../../src/components/kuro/player/playback-controls.tsx), [caption-panel.tsx](../../src/components/kuro/player/caption-panel.tsx), [player-notice.tsx](../../src/components/kuro/player/player-notice.tsx), [page.tsx](../../src/app/page.tsx), [package.json](../../package.json), [README.md](../../README.md).
- **Removed (superseded):** `src/hooks/use-segment-tts-preview.ts`, `src/components/kuro/player/segment-voice-preview.tsx`.
- **Untouched protected files:** `contracts/episode.schema.ts`, `src/lib/episode/*`, `src/app/api/episodes/route.ts`, `src/app/api/tts/route.ts`, `.env.local` (ignored). Zero new npm packages added.

## Transient Recovery & Bounds (PR #6 Patch)
- **Failure classification (`SegmentFailureClass`):** Separates recoverable transient failures (`429`, `503`, timeouts, network errors, retryable audio failures) from permanent failures (`TTS_NOT_CONFIGURED`, auth `401`/`403`, invalid input, safety policy, explicit `retryable: false`).
- **Replay recovery:** Preserves every cached clip (`0` refetches), resets only eligible transient failures (`idle`) with fresh `manualRetriesUsedInCycle = 0`, aborts stale pre-replay fetches via `replayCycleToken`, keeps active `Retry-After` cooldowns intact, narrows post-failure lookahead to `1`, and preserves permanent failures as timed captions.
- **Targeted `Retry voice`:** Targets strictly `entries[currentIndex]` (`0` unrelated requests, preserves episode cache & cooldown), shows disabled `"Retry available in Xs"` countdown during cooldown, deduplicates clicks, enforces `MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE = 1` (`MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE = 3`), clears `"Audio unavailable — showing caption"` on recovery (and prepares `"Preparing <HostName>’s voice"`), and returns `"Voice unavailable again — continuing with captions."` on second failure.
- **`provider_outage` cooldown fix:** Keeps active `Retry-After` cooldown running when `provider_outage` trips so `Retry hosted audio` respects cooldown before firing manual retries.

## Verification Evidence
- **Live `/api/tts` browser test (`localhost:3000`, Sample Episode):** Live Gemini free-tier quota returned HTTP `429` across `4` bounded requests (`~9s` spacing), tripping `"Hosted audio unavailable"` cleanly (`0` retry storm, `0` console/hydration errors, `0` client calls to `generativelanguage.googleapis.com`, `320x640` mobile check zero overflow).
- **Deterministic local proxy browser verification (`localhost:3002` -> unmodified compiled server `127.0.0.1:3001`):**
  - *Replay recovery:* Pass 1 `7 of 9 turns ready` (`seg_02` & `seg_05` mocked `429 Retry-After: 2`) -> **Replay** completed **`9 of 9 turns ready`** with `0` refetches for all `7` cached turns (`totalCalls = 13`, `maxConcurrent = 2`), synchronized speakers/captions, and cleared `"Audio unavailable — showing caption"`.
  - *Targeted Retry & failure bound:* Paused Turn 2 verified `"Retry available in 4s"` -> `"3s"` countdown + `320x640` layout (`305px <= 320px`), `Retry voice` called only `seg_02` (`callsBySegment.seg_02 = 3`) and recovered `2 -> 3 of 9 turns ready`; second-failure `503` showed `"Voice unavailable again — continuing with captions."` and disabled Retry at `3` calls max (`0` console/hydration errors).
- **Automated suites & quality:** `npm ci` (`0` vulnerabilities), `typecheck`, `lint`, `test:schema` (`11/11`), `test:generation` (`33/33`), `test:tts` (`28/28`), `test:audio-queue` (`50/50` covering baseline + `P1`–`P25`), `next build`, `git diff --check`, and secret/bundle/`speechSynthesis`/storage/line-limit scans passed. Zero `.wav`/`.mp3`/`.py` tracked.

## PR State & Remaining Action
- **Base `main`:** `9919142c26fdfd98fa2b553d333ba76ac3e11d97` · **Branch:** `feat/wp-011-full-episode-audio` (PR #6 remains **OPEN**).
- **Known limitation:** Live hosted Gemini TTS free-tier quota may still return `429`; Vercel Preview sits behind Deployment Protection (`401` unauthenticated).
- **Next action:** Review open PR #6 in an authenticated Vercel Preview session under live quota headroom (`Play` -> fallback if `429` -> `Replay` / `Retry voice` recovery) and merge when satisfied.
