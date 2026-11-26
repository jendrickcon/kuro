# Contributor Guide — Team Member JR (Contracts, Backend, AI & Testing)

## Primary Lane & Tooling
- **Owner:** Team Member **JR**
- **Primary AI Workflow:** Codex (`Astra` technical spike -> `Sol` backend/API implementation -> `Terra` tests & verification utilities), adaptable to any compatible coding agent.
- **Owns:** `contracts/episode.schema.ts`, Zod schemas & validation helpers, `fixtures/`, Gemini prompt construction, structured output enforcement, segmented TTS integration, audio format inspection & stitching, API routes (`src/app/api/`), error handling, reliability, security, and automated/manual test matrices.
- **Boundary:** Must not build a competing frontend or modify Lucky’s UI components unless explicitly requested by the Project Owner.

## Testing-First Completion Requirement
> **Implementation is not complete until the relevant test matrix passes or blocked tests are explicitly documented.**

For Gemini or segmented TTS work, JR’s AI **must never** mark a task finished simply because TypeScript compiles or routes lint cleanly. Require live evidence (when credentials exist) or realistic mocked failure/schema tests covering every contract path, and mark missing-key or missing-tooling checks honestly as `[Blocked]`.

## Required Verification Evidence Checklist
Every JR work package should record exact command outputs for applicable checks:
- Strict TypeScript check (`npm run typecheck`) and `npm run lint`
- Schema validation (`npm run test:schema`) plus valid/invalid fixture coverage (`EpisodeSchema`, `CreateEpisodeRequestSchema`, `VisualCueSchema`)
- Unit / API integration matrix (empty, `<10` chars, `10` chars, `2,500` chars, `>2,500` chars, invalid JSON, invalid `hostCount`)
- Failure & edge paths: rate limits (`429`), upstream timeouts, malformed model output, `TTS_PARTIAL_FAILURE`, `AUDIO_STITCH_FAILED`
- Audio verification (before any combined download claim): verify actual MIME type, container, sample rate, channels, byte length, and browser playability; never fake stitched audio downloads
- Server-only secret verification: keep `GEMINI_API_KEY` out of client bundles, zero `NEXT_PUBLIC_*` credential exposure, scan repo & `.next`
- Production build (`npm run build`) and reproducible check commands

## Creative Freedom Within Scope
JR has creative freedom over prompt engineering, retry backoff, concurrency bounds (`~2–3` TTS requests), helper organization, and test structure—provided `contracts/` compatibility holds, secrets stay server-side, frontend callers keep working cleanly, zero `SPEC.md` exclusions leak in, and major architectural changes get owner approval first.

## PR & Handoff Workflow
1. Work on one dedicated branch per assigned WP from updated `main`.
2. Commit and push cleanly; preserve existing passing tests and mock fallbacks.
3. Produce one consolidated handoff (`AGENTS.md` Section 5) listing `[Verified]` vs `[Blocked]` evidence honestly.
4. Open a PR targeting `main` using `.github/pull_request_template.md`, **leave the PR OPEN**, report the PR number and URL, and stop for Project Owner review.

## Stop Conditions
Stop and ask the Project Owner before changing `contracts/episode.schema.ts` fields/limits, adding a database, adding a second AI provider, changing API costs materially, committing real `.env` files, writing UI routes outside backend scope, or merging/closing any PR.
