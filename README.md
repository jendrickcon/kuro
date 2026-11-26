# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a difficult topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students. Listeners follow distinct AI host voices with synchronized captions, lightweight active-speaker animation, a structured contextual visual, and downloadable audio and transcripts.

## Hackathon

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/)
- **Internal deadline:** December 7, 2026 (Manila time); official deadline December 7, 2026 at 5:00 PM EST (~December 8, 6:00 AM Manila) — remaining hours are emergency buffer only.
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page; official rules control.

## Current Status

- **Completed (`WP-008`–`WP-010`):** Verified Next.js application (`WP-008` mock milestone, `WP-008.6` **Kuromates** rename, `WP-009` live Gemini script generation on `main`, and `WP-010` single-turn hosted Kuromate TTS preview on `feat/wp-010-segmented-tts`).
- **Pending live orchestration (`WP-011`+):** Full-episode audio queue, synchronized audio playback, and stitched downloads follow `WP-010`.

## Core MVP (Mock Milestone Active)

- Input 10–2,500 chars; choose **Casual** or **Serious** tone, **Quick** (~8–10 turns) or **Detailed** (~12–15 turns) length, and **2** or **3** Kuromates.
- Production studio player (`Try sample episode` fallback or validated mock API) with shared-desk **Kuromates**, 5 contextual monitor visuals, timed silent playback, synchronized captions, and `.txt` transcript download (plus `prototype/index.html` standalone demo).
- Live multi-host Gemini scripts and segmented/stitched audio follow `WP-003B`.

See [SPEC.md](./SPEC.md) for the full specification, episode contract, exclusions, and roadmap.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, Zod
- **AI & Audio:** Gemini `gemini-3.8-flash` (`v1`) scripts + `gemini-3.8-flash-tts` (`v1beta`) single-turn voices; full audio stitching pending `WP-011`
- **Hosting & Workflow:** Vercel, GitHub

## Local Setup

Prerequisites: Node.js 24+ and npm. Zero API keys are needed for the sample/mock flow (`GEMINI_API_KEY`, `GEMINI_TEXT_MODEL`, and `GEMINI_TTS_MODEL` in `.env.example` are server-side only; never prefix with `NEXT_PUBLIC_`).

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:schema
npm run test:generation
npm run test:tts
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
