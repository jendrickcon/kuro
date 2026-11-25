# Kuro — Minimal Frontend/Server API Contract (WP-003)

> **Source of truth:** `contracts/episode.schema.ts` (Zod schemas + inferred TypeScript types).
> **Boundary goal:** Smallest synchronous HTTP contract needed for `WP-004` mock skeleton and later live Gemini/TTS integration — no queues, databases, or streaming infrastructure in MVP.

## 1. Endpoint & Synchronous Strategy
- **Endpoint:** `POST /api/episodes`
- **Transport:** Single synchronous JSON request/response for MVP.
- **Why synchronous:** Keeps `WP-004` through `WP-007` minimal with zero Redis/job-queue overhead. Revisit only if live `WP-003B` measurements prove single-request execution exceeds Vercel function timeouts.

## 2. Request Shape (`CreateEpisodeRequestSchema`)
```json
{
  "input": "Explain opportunity cost using a college student choosing among studying, commuting, and part-time work.",
  "tone": "casual",
  "length": "quick",
  "hostCount": 2
}
```
- `input`: trimmed string, `10–2,500` chars (hard-rejected outside range; never silently truncated).
- `tone`: `"casual"` (default) | `"serious"`.
- `length`: `"quick"` (8–10 turns, default) | `"detailed"` (12–15 turns).
- `hostCount`: `2` (default) | `3`.

## 3. Success Shape (`CreateEpisodeSuccessSchema`, HTTP `200`)
```json
{
  "ok": true,
  "episode": { "...validated Episode object..." }
}
```
- `episode.hosts` has 2 or 3 entries; every `segment.speakerId` matches a host; every host speaks at least once; `order` is contiguous `0..N-1`; `visualCue` conforms strictly to `VisualCueSchema`.
- Generated media fields (`audioUrl`, `durationMs`, `audioFormat`, `combinedAudioUrl`, `combinedAudio`, `transcriptUrl`) remain optional so mock episodes work before live TTS exists.

## 4. Failure & Partial-Success Shape (`CreateEpisodeFailureSchema`)
```json
{
  "ok": false,
  "error": {
    "code": "TTS_PARTIAL_FAILURE",
    "message": "Some voice clips could not be generated. Captions remain available for every turn.",
    "retryable": true
  },
  "partialEpisode": { "...optional validated Episode with available audioUrls..." }
}
```
- **Error codes & HTTP mapping:**
  - `INVALID_INPUT` (`400`, `retryable: false`)
  - `RATE_LIMITED` (`429`, `retryable: true`)
  - `SCRIPT_GENERATION_FAILED` / `SCRIPT_VALIDATION_FAILED` / `TTS_FAILED` / `INTERNAL_ERROR` (`502`/`500`, `retryable: true`)
  - `TTS_PARTIAL_FAILURE` / `AUDIO_STITCH_FAILED` (`200` or `206` JSON with `partialEpisode`, `retryable: true` — frontend still opens playable player with `PartialAudioNotice` and/or disabled combined audio download)

## 5. Generation-Progress Verdict (Answering WP-002)
- Because MVP uses **one synchronous `POST /api/episodes` response**, the server does **not** emit real stage-completion events.
- **UI rule for `WP-005`:** Do **not** display percentages or claim confirmed backend milestones. Show calm, honest rotating status messages (*"Preparing your conversation..."*, *"Drafting multi-host dialogue..."*, *"Generating voices and captions..."*) with an indeterminate pulse, clearly treated as client-side wait feedback until real streaming is ever added.

## 6. Frontend Expectations & `WP-004` Mock Behavior
- **Mock route (`WP-004` / `WP-006`):** Validate body with `CreateEpisodeRequestSchema`; return `400 INVALID_INPUT` on invalid input; wait ~600–900ms to exercise loading UI; return `fixtures/episode.quick.two-host.json` (`hostCount: 2`) or `fixtures/episode.detailed.three-host.json` (`hostCount: 3`) wrapped in `{ ok: true, episode }`.
- **Visual cue defensive rule:** Frontend validates or safely dispatches on `visualCue.type`; any unrecognized or invalid cue falls back cleanly to `{ type: "none" }`.
- **Transcript export:** Generated purely client-side from validated `episode.hosts` + `episode.segments` (no server endpoint needed).
- **Combined audio download:** Enabled only when `episode.combinedAudioUrl` (or `episode.combinedAudio.url`) is present and verified; otherwise disabled with honest helper copy.
