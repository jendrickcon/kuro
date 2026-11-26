# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a difficult topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students. Listeners follow distinct AI host voices with synchronized captions, lightweight active-speaker animation, a structured contextual visual, and downloadable audio and transcripts.

## Hackathon

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/)
- **Internal deadline:** December 7, 2026 (Manila time); official deadline December 7, 2026 at 5:00 PM EST (~December 8, 6:00 AM Manila) — remaining hours are emergency buffer only.
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page; official rules control.

## Current Status

- **Milestone (`WP-008`):** Verified mock-powered Next.js application (`WP-001`–`WP-005`, `WP-007`, `WP-008.5` onboarding, and `WP-008.6` **Kuromates** rename on `main`; `WP-008` QA on `test/wp-008-mock-milestone`).
- **Pending live AI (`WP-009`+):** Live Gemini script generation, hosted segmented TTS voices, and stitched audio downloads follow `WP-008`.

## Core MVP (Mock Milestone Active)

- Input 10–2,500 chars; choose **Casual** or **Serious** tone, **Quick** (~8–10 turns) or **Detailed** (~12–15 turns) length, and **2** or **3** Kuromates.
- Production studio player (`Try sample episode` fallback or validated mock API) with shared-desk **Kuromates**, 5 contextual monitor visuals, timed silent playback, synchronized captions, and `.txt` transcript download (plus `prototype/index.html` standalone demo).
- Live multi-host Gemini scripts and segmented/stitched audio follow `WP-003B`.

See [SPEC.md](./SPEC.md) for the full specification, episode contract, exclusions, and roadmap.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, Zod
- **AI & Audio (Pending `WP-003B`):** One verified Gemini Flash-class model + segmented TTS with verified stitching
- **Hosting & Workflow:** Vercel (pending owner auth), GitHub

## Local Setup

Prerequisites: Node.js 24+ and npm. Zero API keys are needed for the mock milestone (`GEMINI_API_KEY` in `.env.example` is server-side only for `WP-003B`/live AI; never prefix with `NEXT_PUBLIC_`).

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:schema
npm run build
npm run start
```

## Team Lanes

| Member | Primary Tooling | Ownership |
| --- | --- | --- |
| Project Owner | Antigravity (`Neon` lead) | Product scope, architecture, frontend/integration, deploy, PR review, sole `main` merge authority |
| Lucky | Claude Code (`Opus` -> `Sonnet` / `Fable`) | UI/UX research, wireframes, visual system, isolated UI branches, demo visuals |
| JR | Codex (`Astra` -> `Sol` / `Terra`) | Episode contract, Zod schemas, Gemini/TTS spike, audio stitching, API routes, backend tests |

See [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for branch rules, contributor onboarding, and handoff standards.

## Notice

Kuro is a provisional product name used for the hackathon prototype and may change following formal brand and trademark clearance.
