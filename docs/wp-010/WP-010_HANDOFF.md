# WP-010 Consolidated Handoff — Segmented Expressive TTS Foundation

## Status
**Complete** — Hosted Gemini TTS audio generated cleanly across distinct Kuromate roles, real RIFF/WAV bytes inspected, native browser playback verified, mocked & error matrices passed, and all security/bundle scans are green.

## Files Changed
- **New (`src/lib/tts/`):** `voice-profiles.ts` (6 allowlisted role profiles), `tts-contract.ts` (strict Zod schema `<=320` chars), `audio-inspect.ts` (base64/MIME/RIFF chunk inspector), `gemini-tts-client.ts` (`v1beta` Interactions transport + error classifier), `gemini-tts-service.ts` (orchestrator + `<=2` call bound), `tts-route-handler.ts`, `object-url-manager.ts`.
- **New (`src/app/`, `src/hooks/`, `src/components/`, `scripts/`, `docs/`):** `src/app/api/tts/route.ts` (`POST /api/tts`), `src/hooks/use-segment-tts-preview.ts`, `src/components/kuro/player/segment-voice-preview.tsx`, `scripts/test-tts.mjs`, `docs/wp-010/TTS_FINDINGS.md`, `docs/wp-010/WP-010_HANDOFF.md`.
- **Modified:** `src/components/kuro/player/episode-player.tsx`, `src/components/kuro/player/player-notice.tsx`, `src/hooks/use-episode-playback.ts`, `.env.example`, `package.json`, `README.md`.
- **Untouched:** `contracts/episode.schema.ts`, `src/lib/episode/*`, `src/app/api/episodes/route.ts`, `.env.local` (ignored). No new npm dependencies added.

## Functional Result
- Server-only `@google/genai@3.6.1` `v1beta` Interactions API synthesizes one turn at a time using `gemini-3.8-flash-tts` (`store: false`, `stream: false`, `response_format: { type: "audio", mime_type: "audio/wav" }`).
- Browsers send only `{ segmentId, speakerId, role, text }` (`<=320` chars); arbitrary voice names, models, styles, URLs, paths, or keys return `400 INVALID_TTS_INPUT` with zero provider calls.
- Client `SegmentVoicePreview` previews single turns (`Preview Kuromate voice`, `Replay clip`, `Stop`, `Retry voice preview`), preserves captions/visuals/navigation on failure, never calls Google directly, never uses `speechSynthesis`, and cleans up blob URLs and playback on stop, turn change, episode change, back to form, error, and unmount.

## Verified Live Evidence
- **Serial matrix (`gemini-3.8-flash-tts`, `29.97s` total live speech):**
  - Explainer (`Sulafat`): `200`, `3,729 ms`, `269,308 B`, `5,450 ms`, `3.12 w/s`, `-16.9 dBFS`, `1` attempt.
  - Learner (`Puck`): `200`, `4,581 ms`, `340,828 B`, `6,940 ms`, `3.31 w/s`, `-18.9 dBFS`, `1` attempt.
  - Skeptic (`Kore`): `200`, `3,613 ms`, `319,708 B`, `6,500 ms`, `2.31 w/s`, `-17.1 dBFS`, `1` attempt.
  - Storyteller Taglish (`Achird`): `200`, `3,375 ms`, `245,308 B`, `4,950 ms`, `2.63 w/s`, `-18.8 dBFS`, `1` attempt.
- **Audio container:** `audio/wav` (`RIFF`/`WAVE`, `fmt ` 24 kHz mono 16-bit PCM, `data`, plus trailing `7,656 B` `C2PA` metadata chunk).
- **Concurrency:** `2/2` concurrent calls succeeded (`2,879 ms` & `2,861 ms`); `3` concurrent calls burst immediately afterward hit `429 TTS_RATE_LIMITED` (`Retry-After: 7–8s`) cleanly.
- **Browser playback:** Desktop (`1280x800`) and mobile (`320x640`) verified in Chromium (`Hosted Kuromate voice preview · 6.5s`, `Clip ready · 6.5s`, zero-network `Replay clip`, consistent `[Replay clip, Stop]` order, zero overflow, zero console/hydration errors). Missing-key `503 TTS_NOT_CONFIGURED` preserved captions, visual, and `Next` turn navigation.

## Mocked & Quality Verification
- `npm run typecheck`, `npm run lint`, `npm run test:schema` (`11` pass), `npm run test:generation` (`33` pass), `npm run test:tts` (`28` assertions covering all `25` checks), and `npm run build` all pass cleanly.
- Client-bundle (`.next/static/`), secret, stale host-naming, browser-speech, and protected-path scans all passed with zero violations; zero audio files or `.py` files tracked.

## Blocked or Deferred Items
- **WP-011 deferred:** Full-episode turn queue, prefetching, full audio-caption synchronization, combined WAV stitching (must strip `fmt`/`C2PA` chunks cleanly), and download decisions.
- **Vercel Preview live verification:** Pending PR creation and owner configuring `GEMINI_API_KEY` + `GEMINI_TTS_MODEL=gemini-3.8-flash-tts` in Vercel Preview environment variables.

## PR & Git Evidence
- **Base `main`:** `211366356d4f4d5298fba3e72a27fd9ca48ddeba` (unchanged)
- **Branch:** `feat/wp-010-segmented-tts` (PR stays **OPEN** for owner review)

## Immediate Next Action
Review the open WP-010 PR, listen to sample Kuromate turns (`Preview Kuromate voice` on `explainer` and `learner`), confirm Preview env vars (`GEMINI_API_KEY`, `GEMINI_TTS_MODEL`), and authorize merge when satisfied. WP-011 has not started.
