# WP-011 Consolidated Handoff — Full Episode Audio Queue & Synchronization

## Status
**Complete** — Generated full quick episodes play hosted Kuromate audio automatically in dialogue order with max-2 prefetching, synchronized Kuromates/captions/visuals, bounded `Retry-After` recovery, resilient fallback, clean memory cleanup, and passing local + browser verification.

## Files Changed
- **New:** [retry-after.ts](../../src/lib/tts/retry-after.ts), [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts), [use-episode-audio-queue.ts](../../src/hooks/use-episode-audio-queue.ts), [audio-status-bar.tsx](../../src/components/kuro/player/audio-status-bar.tsx), [test-audio-queue.mjs](../../scripts/test-audio-queue.mjs), [AUDIO_QUEUE_FINDINGS.md](./AUDIO_QUEUE_FINDINGS.md), `docs/wp-011/WP-011_HANDOFF.md`.
- **Modified:** [object-url-manager.ts](../../src/lib/tts/object-url-manager.ts), [episode-player.tsx](../../src/components/kuro/player/episode-player.tsx), [playback-controls.tsx](../../src/components/kuro/player/playback-controls.tsx), [caption-panel.tsx](../../src/components/kuro/player/caption-panel.tsx), [player-notice.tsx](../../src/components/kuro/player/player-notice.tsx), [page.tsx](../../src/app/page.tsx), [package.json](../../package.json), [README.md](../../README.md).
- **Removed (superseded):** `src/hooks/use-segment-tts-preview.ts`, `src/components/kuro/player/segment-voice-preview.tsx`.
- **Untouched protected files:** `contracts/episode.schema.ts`, `src/lib/episode/*`, `src/app/api/episodes/route.ts`, `src/app/api/tts/route.ts`, `.env.local` (ignored). Zero new npm packages added.

## Functional Result & Failure Behavior
- Pressing **Play** prioritizes turn 0, prefetches within lookahead `2` at `MAX_TTS_CONCURRENCY = 2`, and drives turn progression via real `<audio>` `ended` events.
- **Pause/Resume** preserves `currentTime` without refetch; **Prev/Next/Restart/Replay** cancel stale timers/events and reuse session-cached clips (`0` extra fetches).
- `429` triggers a shared clamped `1s–30s` `Retry-After` cooldown; `2` consecutive exhausted capacity fails or any missing-key/auth error halts background bursts cleanly (`Continue with timed captions`, `Retry hosted audio`, `Return to form`); single-turn failures keep captions/visuals usable; autoplay blocks show `Tap to continue audio`.

## Live & Mocked Evidence
- **Live 2-Kuromate quick episode (`Understanding Opportunity Cost`, 8 turns):** `6/8` real WAV clips (`6.85–9.56s`, `3,813 ms` avg latency), `maxConcurrency = 2`, shared `429` recovery, full `8/8` completion, `0` Replay refetches, `0` console/hydration errors.
- **Live 3-Kuromate + 4 viewports (`320x640`, `390x844`, `768x900`, `1280x800`):** Side-by-side Kuromates, zero overflow or button overlap, verified `Tab` focus order.
- **Missing-key server (`localhost:3001`):** `503 TTS_NOT_CONFIGURED` halted at `<= 2` calls (`Continue with timed captions` succeeded).
- **Mocked tests:** `test:schema` (`11`), `test:generation` (`33`), `test:tts` (`28`), and `test:audio-queue` (`33` assertions covering all `40` WP-011 checks + `17` failure scenarios) all pass.

## Quality, Security & PR Evidence
- `npm ci`, `typecheck`, `lint`, all `4` test suites, `next build`, and secret/bundle/`speechSynthesis`/storage/stale-naming/line-limit scans passed. Zero `.wav`/`.py` tracked.
- **Stitching spike:** Verified (`2` live clips -> stripped `C2PA` -> temporary `9,030 ms` WAV -> temp deleted).
- **Base `main`:** `9919142c26fdfd98fa2b553d333ba76ac3e11d97` · **Branch:** `feat/wp-011-full-episode-audio` (PR remains **OPEN**).

## Deferred Scope & Immediate Next Action
- **Deferred:** Persistent audio storage, production combined audio download UI, offline audio, video generation.
- **Next action:** Review open WP-011 PR, verify Vercel Preview (ensure `GEMINI_API_KEY` and `GEMINI_TTS_MODEL=gemini-3.8-flash-tts` are configured in Preview), listen through a generated quick episode end-to-end, and merge when satisfied.
