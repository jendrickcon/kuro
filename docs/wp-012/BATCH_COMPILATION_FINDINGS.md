# WP-012 Technical Findings — Hybrid Podcast Compilation, Stable Identities, Timeline & Downloadable WAV

> **Evidence Key:** `[Verified]` code/contract/static scan · `[Measured]` live server/browser timing & byte inspection (`2026-11-27`) · `[Mocked]` deterministic proxy/harness verification · `[Owner Review Required]` subjective ear/PR review

## 1. Baseline & Explicit WP-012 Policy Changes (`[Verified]`)
- **Accepted Baseline:** Branched `feat/wp-012-hybrid-batch-compilation` from fast-forwarded `main` (`27680fd07a9073dc84dbcd75389a93468484eafd`, PR #7 / `WP-011.5` merged with Deepgram Aura-2 primary + Gemini Flash-Lite fallback).
- **Roadmaps & Ownership Unchanged:** Only `WP-012` is implemented; `WP-013+`, `AGENTS.md`, `SPEC.md`, `README.md`, `contracts/episode.schema.ts`, and contributor guides (`docs/contributing/`) remain untouched.
- **Explicit Policy Upgrades from WP-011 / WP-011.5:**
  1. **Identity-Owned Voices:** Moved Deepgram `deepgramVoice` from Layer-2 role profiles ([voice-profiles.ts](../../src/lib/tts/voice-profiles.ts)) into Layer-1 identities ([kuromate-voice-identities.ts](../../src/lib/tts/kuromate-voice-identities.ts)), replacing `aura-2-apollo-en` with `aura-2-aries-en` for Leo.
  2. **Bounded Server Retry:** Upgraded Deepgram primary recovery from `1` attempt before fallback (`WP-011.5`) to `1` initial attempt + at most `1` bounded transient retry (`250–2,000 ms`, default `350 ms`, abort-aware) + at most `1` capacity switch to Gemini Flash-Lite (`MAX_TTS_PROVIDER_ATTEMPTS = 3`).
  3. **Strict Audio Completeness (`NO AUDIO, NO ADVANCE`):** Replaced WP-011 partial/caption-only live fallback with 100% Quick compilation and 4-turn Detailed hybrid compilation + stitched browser WAV downloads.

## 2. Server Provider Attempt State Machine & Voice Ownership (`[Verified]`)
| Identity ID | Host / Slot | Deepgram Primary | Gemini Fallback |
| --- | --- | --- | --- |
| `kuromate_maya_v1` | Maya | `aura-2-thalia-en` | `Sulafat` |
| `kuromate_leo_v1` | Leo | `aura-2-aries-en` | `Puck` |
| `kuromate_sam_v1` | Sam | `aura-2-orion-en` | `Kore` |
| `kuromate_guest_01_v1` | Guest 1 | `aura-2-athena-en` | `Achird` |
| `kuromate_guest_02_v1` | Guest 2 | `aura-2-arcas-en` | `Sadaltager` |
| `kuromate_guest_03_v1` | Guest 3 | `aura-2-luna-en` | `Erinome` |

- **Roles Own Style Only:** `KUROMATE_VOICE_PROFILES` (`explainer`, `learner`, `skeptic`, `storyteller`, `specialist`, `moderator`) control pace, tone, emphasis, reactions, and fallback `styleInstruction` — never base voice selection.
- **Hard-Stops (0 Retry, 0 Switch):** Missing key, invalid `KURO_TTS_PROVIDER`, unsupported voice, `401`/`403`/`402`, `400`/`413`/`415`/`422`, safety rejection, client abort, oversized audio (`> 5 MB`), unexpected MIME, and `long_quota_wait` (`Retry-After > 120s`).
- **Telemetry & Safe Headers ([tts-route-handler.ts](../../src/lib/tts/tts-route-handler.ts)):** Fixes cosmetic `requestedModel` reporting (`aura-2-*` when `requestedProvider === "deepgram"`) and emits `X-Kuro-Request-Id`, `X-Kuro-TTS-Identity`, `X-Kuro-TTS-Profile`, `X-Kuro-TTS-Provider`, `X-Kuro-TTS-Voice`, `X-Kuro-TTS-Retry-Used`, `X-Kuro-TTS-Fallback-Used`, `X-Kuro-Provider-Attempts`, `X-Kuro-TTS-Hosted-State`, and `X-Kuro-Audio-Duration-Ms` (`gemini-3.8-*` model strings stay out of headers and browser code).

## 3. Browser WAV Format, Stitching & Timeline Contract (`[Verified]`)
- **WAV Parser & Stitcher ([wav-stitcher.ts](../../src/lib/tts/wav-stitcher.ts)):** Pure `Uint8Array` / `DataView` RIFF parser dynamically walking chunks (tolerates leading `JUNK` and trailing Gemini `C2PA` metadata) and enforcing `24,000 Hz`, mono (`1` ch), `16-bit` signed linear PCM (`48,000 B/s`) with exact integer sample math.
- **Inter-Turn Silence Policy (never substitutes missing speech):** `180 ms` (`reacting`), `250 ms` default speaker handoff, `340 ms` visual cue/topic transition, `0 ms` after final turn.
- **Timeline Invariants:** Monotonic non-overlapping segments (`startSample`, `speechStartSample`, `speechEndSample`, `endSample`, `startMs`, `speechStartMs`, `speechEndMs`, `endMs`, `paddingAfterMs`) queried by deterministic binary search (`resolveTimelineStateAtMs`). `isSpeaking` is strictly false during `paddingAfterMs` and boundary buffering.

## 4. Hybrid Compilation & Selected Rolling Playback Architecture (`[Verified]`)
- **Compiler Engine ([episode-batch-compiler.ts](../../src/lib/tts/episode-batch-compiler.ts)):** Explicit episode (`idle`, `compiling-opening-batch`, `ready-to-play`, `compiling-background`, `buffering-at-boundary`, `failed-retryable`, `failed-blocking`, `complete`, `cancelled`, `disposed`), batch, and turn states in batches of `4`.
- **Concurrency & Fallback Downshift:** Starts at max `4` concurrent per-turn requests (`PRIMARY_TTS_CONCURRENCY = 4`). Any `fallbackUsed: true` response permanently downshifts remaining work in that episode to concurrency `1` + `1,500 ms` minimum request spacing (`FALLBACK_TTS_CONCURRENCY = 1`, `FALLBACK_PACING_MS = 1500`).
- **Quick Episodes:** Compile 100% of spoken turns before enabling Play, full timeline scrubber, 0-call Replay, or `Download Audio (.wav)`.
- **Detailed Episodes (Selected Option A — Sequential Compiled Batch WAVs + Final Full WAV Unlock):**
  - Batch `0` (turns `1–4`) compiles and stitches into a playable 4-turn WAV before enabling Play. Batches `1..K` compile in background and stitch strictly in contiguous sample-offset order.
  - One controlled `HTMLAudioElement` plays Batch `0`, advancing seamlessly to Batch `1`, `2`, `3` only when ready (`NO AUDIO, NO ADVANCE`). An incomplete next batch pauses cleanly at the exact boundary (`Preparing turns 5–8…`, `isSpeaking = false`).
  - Once all batches succeed, `fullWavBlob` is stitched for `Download Audio (.wav)` and full scrubbing **without swapping or restarting the active audio element**.
- **Client Failure, Identity & Sample Policies:** Bounded `1` auto-retry per retryable turn; missing/mismatched `X-Kuro-TTS-Identity` or corrupt WAV is rejected; `retryFailedTurns()` preserves all completed PCM clips; `503 TTS_NOT_CONFIGURED` blocks live playback with `Retry` + `Cancel and edit`; **Sample Preview** opens cleanly with `0` `/api/tts` calls and `canDownloadAudio = false`.

## 5. Security, Measured Live Performance & Known Limitations
- **Live Deepgram Identity Probes (`[Measured]`, `:3000/api/tts`):**
  - `Maya (learner)` -> `kuromate_maya_v1` / `aura-2-thalia-en` (`200 OK`, `2,828 ms`, `3,520 ms` audio, `168,960 B` PCM, `24 kHz` mono `16-bit`, `fallbackUsed=false`)
  - `Leo (explainer)` -> `kuromate_leo_v1` / `aura-2-aries-en` (`200 OK`, `1,815 ms`, `3,600 ms` audio, `172,800 B` PCM, `24 kHz` mono `16-bit`, `fallbackUsed=false`)
  - `Sam (learner)` -> `kuromate_sam_v1` / `aura-2-orion-en` (`200 OK`, `7,441 ms`, `3,720 ms` audio, `178,560 B` PCM, `24 kHz` mono `16-bit`, `fallbackUsed=false`)
  - In-memory stitch of those 3 turns: **`2.31 ms`**, `544,364 B`, `11,340 ms` (`0 ms` timeline drift).
- **Live Quick Episode E2E (`[Measured]`, `:3000`):** `"Saving vs. Daily Coffee"` (8 turns) gated `Start podcast` until `8 of 8 ready`, played `0:47` real audio, downloaded `kuro-episode-saving-vs-daily-coffee.wav` (`2,273,804 B`), reached `08 / 08 COMPLETE`, and replayed with `0` new `/api/tts` calls (`10` before === `10` after).
- **Security Scan (`[Verified]`):** `.next/static/` (`11` assets) and client components/hooks contain `0` secrets, `0` Deepgram client/voice strings, `0` Gemini model/voice strings, `0` `@google/genai`, `0` `speechSynthesis`, `0` FFmpeg/Canvas/MP4, `0` new npm packages.
- **Known Limitations:** Live Detailed multi-batch browser playback was verified via mocked E2E (`12` turns + held `seg_05` boundary stop + release -> `Download Audio (.wav)`) and unit tests (`15` turns), rather than a live 15-turn provider run to avoid burning quota unnecessarily; subjective listening review of Leo (`aura-2-aries-en`) and Maya (`aura-2-thalia-en`) remains `[Owner Review Required]`.
