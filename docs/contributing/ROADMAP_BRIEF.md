# Kuro Project Roadmap Brief

Status legend: **Complete (`Verified`)** · **In Review (`Mock`)** · **Blocked (`Pending Credentials`)** · **Pending** · **Proposed (`Post-Hackathon`)**

## Completed Foundation & Mock Milestone
- **WP-001 Foundation (`Complete [Verified]`):** Product pitch, locked MVP scope, exclusions, team lanes (`README.md`, `SPEC.md`, `AGENTS.md`).
- **WP-002 UI/UX Spec (`Complete [Verified]`):** Commuting-student UX research, user flows, `320px+` wireframes, accessibility & state matrix (`docs/wp-002/`).
- **WP-003A Contracts & Fixtures (`Complete [Verified]`):** Authoritative Zod schemas (`contracts/episode.schema.ts`), 5 strict `VisualCue` types, valid 2-host/3-host and invalid `fixtures/`.
- **WP-004 App Skeleton (`Complete [Verified]`):** Next.js App Router, Tailwind CSS v4, Zod validation, `POST /api/episodes` mock endpoint (`docs/wp-004/`).
- **WP-004.5 Interactive Prototype (`Complete [Verified]`):** Standalone `prototype/index.html` shared-desk Kurozo studio demo.
- **WP-005 Creation Flow (`Complete [Verified]`):** Accessible topic/study notes form (`10–2,500` chars), selectors, loading/error states, sample trigger (`docs/wp-005/`).
- **WP-007 Multi-Host Player (`Complete [Verified]`):** Production shared-desk stage, embodied CSS Kurozos (`hosts[]`), studio monitor visuals, timed silent playback, synchronized captions, `.txt` transcript export (`docs/wp-007/`).
- **WP-008.5 Contributor Onboarding (`In Progress -> Merging Now`):** Repository hygiene audit, setup guide, Lucky & JR onboarding guides, PR review rules.

## Open Review & Active Blocker
- **WP-008 Mock Milestone QA (`In Review [Mock]` — Open PR `#1`):** End-to-end QA freeze of the mock-powered milestone (`test/wp-008-mock-milestone`); Vercel verification awaits owner auth.
- **WP-003B Live Provider Spike (`Blocked`):** Live Gemini Flash model probe, segmented TTS response format inspection, concurrency limits, and audio stitching test await `GEMINI_API_KEY` + audio inspection tooling.

## Upcoming Hackathon Packages
- **WP-009 Gemini Script Generation (`Pending` — JR lead after `WP-003B`):** Structured multi-host dialogue generation validating against `EpisodeSchema`.
- **WP-010 Segmented TTS Pipeline (`Pending` — JR lead after `WP-003B`):** Per-turn voice generation (`concurrency 2–3`), duration measurement, partial-failure handling, verified stitching.
- **WP-011 Real Audio Integration (`Pending` — Owner/Lucky UI + JR API):** Connect sequential turn audio + verified combined audio download cleanly to `EpisodePlayer`.
- **Final Polish & Submission (`Pending` — Full Team):** Responsive/a11y polish, reliable sample backup, Devpost submission screenshots & screen-recorded demo.

## Post-Hackathon Stretch Ideas (`Proposed` — Not in MVP)
Theme customization (*Contemporary Studio*, *Retro Broadcast*, *Noir*, *Student Study Session*, *Commute Lounge*), editable host names/personalities/accessories, document/URL ingestion, citations, comprehension quizzes, offline LLMs, optional minimal Supabase storage.

---

> **Would you like a brief explanation of Kuro’s roadmap, completed work packages, and the next package relevant to your role?**
