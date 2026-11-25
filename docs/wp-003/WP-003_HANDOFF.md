# WP-003 Consolidated Handoff — Kuro: AI & Audio Technical Spike

## 1. Status
**Partially complete: WP-003A complete, WP-003B blocked**
- **WP-003A (Complete):** Strict TypeScript/Zod contract, valid/invalid fixtures, real `tsc --strict` + Zod runtime validation (external temp dir), minimal API contract, input-limit verdict, and generation-progress verdict.
- **WP-003B (Blocked):** Live Gemini structured generation, segmented TTS, audio-format inspection, concurrency test, and audio stitching could not run because `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GOOGLE_GENAI_API_KEY` are not configured in this environment (`ffmpeg`/`ffprobe` also absent).

## 2. Files Added
- `contracts/episode.schema.ts`: Source-of-truth Zod schemas & inferred TypeScript types (`VisualCue` discriminated union, `Episode`, cross-field refinements, API request/response).
- `fixtures/episode.quick.two-host.json`: Valid quick 2-host fixture (9 turns; `comparison`, `fact-card`, `none`).
- `fixtures/episode.detailed.three-host.json`: Valid detailed 3-host fixture (12 turns; `timeline`, `process`, `comparison`, `none`).
- `fixtures/invalid/invalid-host-count.json`, `invalid-speaker-reference.json`, `invalid-visual-cue.json`: Single-fault negative fixtures.
- `docs/wp-003/TECHNICAL_FINDINGS.md`: Environment/credential audit, verified vs. blocked results, input-limit & stitching verdicts.
- `docs/wp-003/API_CONTRACT.md`: Minimal synchronous `POST /api/episodes` boundary, error/partial-success handling, WP-004 mock rules.
- `docs/wp-003/WP-003_HANDOFF.md`: Consolidated spike summary and next action.

## 3. Decisions Locked
- **Strict `VisualCue` union:** `.strict()` discriminated union across 5 types; legacy `payload` rejected; explicit `{ type: "none" }` per segment; `0–3` meaningful visuals per episode, none consecutive.
- **Episode invariants:** Dynamic `hosts[]` (`2–3`, default `2`), hard turn bounds (`quick` 8–10, `detailed` 12–15), every host speaks at least once, contiguous `0..N-1` order, valid `speakerId`, mobile text limits.
- **Input limit:** Recommend tightening WP-002's `10–4,000` to **`10–2,500` trimmed chars** with hard rejection (no silent truncation).
- **API & progress:** Single synchronous `POST /api/episodes`; UI uses honest indeterminate/rotating wait copy rather than claiming live backend stage events.

## 4. Verification Summary
- Compiled `contracts/episode.schema.ts` with `tsc --strict` and executed actual Zod `.safeParse()` against all 5 fixtures + edge-case assertions in a disposable temp folder outside the repo (deleted after run).
- Verified exact line counts, zero secrets, zero edits to WP-001/WP-002 docs, and zero app/dependency files in repo.

## 5. Risks & Blocked Follow-Up
- Live Flash-class model ID, real TTS audio container/encoding, concurrency (`2` vs `3`), single-request latency on `detailed` episodes, and WAV stitching feasibility remain unverified until `GEMINI_API_KEY` is configured locally for `WP-003B`.

## 6. WP-004 Readiness & Immediate Next Action
- **WP-004 readiness:** **Ready for WP-004 using mocks, with WP-003B still pending.**
- **Next action:** Review and merge `spike/wp-003-ai-audio` into `main`; proceed with `WP-004` (Next.js skeleton, Zod install, mock `/api/episodes`, Vercel preview) while configuring server-side `GEMINI_API_KEY` locally to execute `WP-003B` before live AI integration.
