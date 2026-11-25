# Kuro — WP-003 Technical Findings & Spike Verdict

> **Status:** `Partially complete: WP-003A complete, WP-003B blocked`
> **Labels used:** `[Verified]` observed in this run | `[Recommended]` locked engineering choice | `[Blocked]` missing credentials/tools | `[Deferred]` scheduled for WP-003B/WP-004+

## 1. Test Environment & Credential Audit
- **Local runtime `[Verified]`:** Windows (`PowerShell 5.1`), `Node v24.21.0`, `npm 11.19.0`, `python` present; `ffmpeg` and `ffprobe` are **not installed** (`NOT FOUND`).
- **Credential availability `[Verified]`:** Checked boolean existence only (zero values read or logged) across Process, User, and Machine scopes:
  - `GEMINI_API_KEY`: not set
  - `GOOGLE_API_KEY`: not set
  - `GOOGLE_GENAI_API_KEY`: not set
- **Required env var for WP-003B / live integration `[Recommended]`:** Standardize on server-only `GEMINI_API_KEY` (never `NEXT_PUBLIC_*`, never committed).

## 2. Schema & Fixture Validation (`WP-003A`)
- **TypeScript strict compilation `[Verified]`:** Compiled `contracts/episode.schema.ts` with `tsc --strict` in a disposable temp folder outside the repo (`$env:TEMP\kuro-wp003-verify`, removed after test); zero errors, zero repo dependency files added.
- **Runtime Zod validation `[Verified]`:** Executed the compiled Zod schemas via Node 24 against all 5 committed fixtures plus edge-case checks (silent 3rd host, consecutive visuals, non-contiguous order, input length bounds, `TTS_PARTIAL_FAILURE` response).
  - Valid quick 2-host (`9` turns) & detailed 3-host (`12` turns) fixtures: **Passed**, covering all 5 `VisualCue` types (`comparison`, `timeline`, `process`, `fact-card`, `none`).
  - Invalid fixtures (`invalid-host-count`, `invalid-speaker-reference`, `invalid-visual-cue`): **Rejected** for their exact single intended error.
- **Contract rules locked `[Recommended]`:**
  - Strict `VisualCue` discriminated union with `.strict()` rejecting legacy `payload` and excess fields; every segment carries explicit `visualCue` (`{ type: "none" }` when unused).
  - Hard segment bounds (`quick`: 8–10, `detailed`: 12–15) to cap latency/TTS spend; server may retry script generation once before failing.
  - Every host in `hosts[]` (2–3 items) must speak at least once; `0–3` meaningful visuals per episode; no back-to-back meaningful visuals.
  - Text caps tuned for 320px mobile readability & short TTS turns: `title <= 80`, `host.name <= 20`, `segment.text <= 320` chars.

## 3. Input-Limit Verdict (Evaluating WP-002's `10–4,000` Proposal)
- **Decision `[Recommended]`:** Tighten MVP input range to **`10–2,500` trimmed characters** (~350–450 words) instead of WP-002's `4,000`.
- **Rationale:** Episodes are capped at 8–15 turns (~180–360 spoken words). Allowing 4,000 chars invites heavy summarization loss, higher latency, and unpredictable quota spend while 2,500 chars comfortably fits a college student's pasted reading excerpt or class notes.
- **Excess input handling `[Recommended]`:** Hard reject with inline validation copy (*"Keep your topic or pasted notes under 2,500 characters (~400 words) so the conversation stays focused."*). Never silently truncate user notes. (Record as a recommended follow-up note for `WP-005`; WP-002 files were left untouched.)

## 4. Live AI, TTS, Concurrency & Stitching Findings (`WP-003B`)
- **Model availability & structured generation `[Blocked]`:** Could not query available Gemini Flash-class models or test live JSON schema output because no API key is configured. Do not hard-code speculative model IDs; use `@google/genai` (official current JS/TS SDK) to verify a Flash-class model once `GEMINI_API_KEY` is provided.
- **Segmented TTS & audio format inspection `[Blocked]`:** Could not generate test clips or inspect real MIME type, container, codec, sample rate, bit depth, channels, or durations. Do not assume raw PCM or WAV prior to live header/payload inspection.
- **Concurrency & rate-limit testing `[Blocked]`:** Deferred until credentials exist; retain `SPEC.md` working target of concurrency `2` (safer default) vs. `3` to benchmark in WP-003B.
- **Combined-audio stitching verdict `[Blocked]`:** **Blocked by missing credentials or audio samples.** Cannot claim verified WAV/container stitching without inspecting actual TTS output bytes. Keep combined download strictly gated behind verified stitching (never fake it).

## 5. Risks, Limitations & Deferred Verification
- **Single-request latency risk `[Inferred]`:** Generating script + 8–15 TTS clips sequentially/at concurrency 2–3 may approach serverless timeout limits for `detailed` episodes; must be measured in WP-003B before live deployment.
- **Missing local `ffmpeg`/`ffprobe` `[Verified]`:** Pure JS/Node binary header inspection (or installing `ffprobe` / Python `wave`) will be needed when WP-003B inspects live TTS outputs; browser playback verification is `[Deferred]` to `WP-004`/`WP-007`.
- **Provisional voice IDs `[Deferred]`:** Mock fixtures use `voice_provisional_*` tokens until WP-003B verifies real provider voice names.
