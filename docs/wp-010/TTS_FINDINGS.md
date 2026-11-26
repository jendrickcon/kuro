# WP-010 Technical Findings — Segmented Expressive TTS Foundation

## 1. Official Documentation Consulted
- `gemini-api-guides/speech-generation.md` (Interactions API TTS, `speech_metadata`, prebuilt voices, unary WAV vs streaming PCM).
- `gemini-api-guides/models/gemini-3.8-flash-tts.md` & `gemini-3.8-flash-lite-tts.md` (8,192 input / 16,384 output limits, API schema parity).
- Installed `@google/genai@3.6.1` `dist/genai.d.ts` (`GoogleGenAIOptions`, `AudioContent`, `SpeechConfig`, `SpeechMetadata`).

## 2. API and Model Decision
- **Transport:** `@google/genai` `v1beta` Interactions API (`ai.interactions.create` with `store: false`, `stream: false`, `retries: { strategy: "none" }`, `response_format: { type: "audio", mime_type: "audio/wav" }`).
- **Why `v1beta`:** Live metadata probing showed `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` return `404` on default `v1` and `200` on `v1beta`. Isolated strictly to `src/lib/tts/gemini-tts-client.ts`; WP-009 text generation remains on `v1`.
- **Why Interactions API:** Keeps verbatim transcript (`input[].content[].text`) cleanly separated from sustained performance directions (`annotations: [{ type: "speech_metadata", style }]`) and voice selection (`speech_config: [{ voice }]`).
- **Model decision:** `GEMINI_TTS_MODEL=gemini-3.8-flash-tts` (`MAX_TTS_MODEL_CHOICES = 1`). `gemini-3.8-flash-lite-tts` is server-allowlisted for explicit config use but automatic TTS fallback is deferred because serial and 2-concurrent `gemini-3.8-flash-tts` requests succeeded 100% without capacity fallback need.

## 3. Server-Controlled Kuromate Voice Profiles (`src/lib/tts/voice-profiles.ts`)
| Role | Profile ID | Voice | Pace | Tone & Delivery Summary |
| --- | --- | --- | --- | --- |
| `explainer` | `kuromate_explainer_v1` | `Sulafat` | Measured, steady | Warm, clear, grounded; brief pauses before key definitions |
| `learner` | `kuromate_learner_v1` | `Puck` | Slightly quicker | Curious, responsive; natural questions, never cartoonish |
| `skeptic` | `kuromate_skeptic_v1` | `Kore` | Deliberate pauses | Direct, questioning, controlled emphasis without hostility |
| `storyteller` | `kuromate_storyteller_v1` | `Achird` | Varied cadence | Warm, relatable everyday examples; light non-theatrical lift |
| `specialist` | `kuromate_specialist_v1` | `Sadaltager` | Even, articulate | Calm confidence, clear articulation, avoids stiff jargon |
| `moderator` | `kuromate_moderator_v1` | `Erinome` | Balanced pace | Neutral, organized transitions and clear framing cues |

Browsers send only `{ segmentId, speakerId, role, text }` (`text <= 320` chars, matching `EpisodeSchema`); arbitrary voice IDs, styles, models, URLs, paths, or keys fail `400 INVALID_TTS_INPUT`.

## 4. Audio-Format Inspection Evidence
- **Payload encoding:** `interaction.output_audio.data` (strict base64) + `mime_type: "audio/wav"`.
- **Container & codec:** `RIFF`/`WAVE`, PCM `audioFormat=1` (`pcm_s16le`), `24,000 Hz`, `1` channel (mono), `16-bit`, `byteRate=48,000 B/s`.
- **Chunk discovery:** Every live WAV response contained 3 RIFF chunks: `fmt ` (`16 B`), `data` (PCM payload), and a trailing **`C2PA` (`7,656 B`)** provenance chunk. Dynamic RIFF chunk walking (`src/lib/tts/audio-inspect.ts`) is mandatory—assuming a raw 44-byte overhead would miscalculate duration and corrupt WP-011 stitching.
- **Playback:** Browser plays WAV directly via `Blob` + `URL.createObjectURL` with zero conversion or FFmpeg dependency.

## 5. Live Verification Matrix & Provisional 1–5 Scorecard
Bounded live total: `29.97s` generated across serial + concurrency probes (`45s` max budget). Audio remained transient (zero `.wav` files committed).

| Case (Role / Voice) | Status | Latency | Byte Length | Data Bytes | Duration | Rate / Level | Attempts / Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Explainer (`Sulafat`) | `200` | `3,729 ms` | `269,308 B` | `261,600 B` | `5,450 ms` | `3.12 w/s`, `-16.9 dBFS` | `1` / No |
| B. Learner (`Puck`) | `200` | `4,581 ms` | `340,828 B` | `333,120 B` | `6,940 ms` | `3.31 w/s`, `-18.9 dBFS` | `1` / No |
| C. Skeptic (`Kore`) | `200` | `3,613 ms` | `319,708 B` | `312,000 B` | `6,500 ms` | `2.31 w/s`, `-17.1 dBFS` | `1` / No |
| D. Storyteller Taglish (`Achird`) | `200` | `3,375 ms` | `245,308 B` | `237,600 B` | `4,950 ms` | `2.63 w/s`, `-18.8 dBFS` | `1` / No |

Browser playback checks on `localhost:3000`: Sample Turn 1 (`host_leo` / `Puck`, `312,508 B`, `6,350 ms` -> `6.3s`) and Turn 2 (`host_maya` / `Sulafat`, `377,308–401,308 B`, `7.7s` / `8.2s`) decoded and played natively; `Replay clip` reused the active object URL with zero extra POSTs.

- **Provisional 1–5 Scorecard (objective checks verified; subjective listening review requested from owner):**
  - Naturalness: `4/5` (verified modulated non-clipping RMS `-16.9` to `-18.9 dBFS`, peak `0.805–0.851`; owner listening check needed for vocal warmth).
  - Expressiveness: `4/5` (speaking rates differentiated cleanly across roles: Skeptic `2.31 w/s`, Storyteller `2.63`, Explainer `3.12`, Learner `3.31`).
  - Role fit & Distinctness: `4/5` (distinct prebuilt voices across all 6 roles + browser playback across Learner/Explainer).
  - Pronunciation: `4/5` (clean sentence duration proportions on English and short Taglish test; final Taglish accent check deferred to owner ear).
  - Latency reliability: `4/5` (serial `2.86–4.58s` on 16–22 word segments; bounded concurrency sensitive to burst RPM).

## 6. Concurrency, Failure & Cost Observations
- **Serial (`1`):** `4/4` HTTP `200`. **Concurrent (`2`):** `2/2` HTTP `200` (`2,879 ms`, `2,861 ms`).
- **Concurrent (`3` immediately after 6 calls):** `0/3` — all returned `429 TTS_RATE_LIMITED` with `Retry-After: 7`–`8s` (`retryable: true`). **WP-011 recommendation:** stay at sequential or max `2` concurrent calls with `Retry-After` honoring; defer `3`.
- **Failure codes (`MAX_TTS_PROVIDER_ATTEMPTS = 2`):** `INVALID_TTS_INPUT` (`400`, 0 calls), `TTS_NOT_CONFIGURED` (`503`, 0 calls), `TTS_RATE_LIMITED` (`429`, 1 call), `TTS_PROVIDER_UNAVAILABLE` (`503`, 1 call), `TTS_TIMEOUT` (`504`, 1 call), `TTS_GENERATION_FAILED` (`502` auth/safety/499 abort, max 1 call), `TTS_AUDIO_INVALID` (`502`, max 1 regeneration on empty/corrupt audio; 0 retries on MIME/oversize >5 MB), `INTERNAL_ERROR` (`500`). Captions, visuals, and turn controls stay active; zero `speechSynthesis`.
- **Token observation:** Standalone `5.68s` probe consumed `21` text input tokens + `142` audio output tokens (`163` total).

## 7. Security & Vercel Compatibility
- Server-only `GEMINI_API_KEY`; zero `NEXT_PUBLIC_GEMINI_*`; zero `@google/genai` or exact model IDs in browser code/bundle; `Cache-Control: no-store`; `export const runtime = "nodejs"; maxDuration = 30`; zero local disk writes or native binaries.
- **Required Vercel Preview env vars:** `GEMINI_API_KEY` (Secret), `GEMINI_TTS_MODEL=gemini-3.8-flash-tts`.

## 8. Reference Audit: `petergyang/video-explainer`
Inspected read-only via GitHub API (not cloned or installed):
- `skills/video-explainer/scripts/narrate.py`: Interactions `v1beta` `speech_metadata.style` separation, `store: false`, missing-audio checks, API key redaction -> adapted into `gemini-tts-client.ts` & `tts-route-handler.ts` (`0` code copied; dropped Python, raw PCM wrapping, local disk outputs).
- `skills/video-explainer/SKILL.md`, `reference.md`, `eval.md`, `scripts/qa.py`: voice direction and rubric checklists -> adapted for Kuromate profiles and WP-010 scorecard (`0` code copied; HyperFrames, FFmpeg, Blender, Kokoro-82M, Parakeet, yt-dlp, video rendering rejected).
- **License boundary:** Repo is MIT (`Copyright (c) 2026 Peter Yang`); bundled `fonts/OFL.txt` (`Inter`) is SIL OFL 1.1; external tools keep their own licenses. Only architectural concepts were reused; no files or packages imported.

## 9. Deferred to WP-011
Full-episode turn queue, automatic prefetching, complete caption-to-audio synchronization, audio-driven Kuromate speaking timings, partial episode generation, WAV chunk-stripped audio stitching, and optional download decisions remain deferred to WP-011.
