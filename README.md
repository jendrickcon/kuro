# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a difficult topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students. Listeners follow distinct AI host voices with synchronized captions, lightweight active-speaker animation, a structured contextual visual, and downloadable audio and transcripts.

## Hackathon

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/)
- **Internal deadline:** December 7, 2026 (Manila time); official deadline December 7, 2026 at 5:00 PM EST (~December 8, 6:00 AM Manila) — remaining hours are emergency buffer only.
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page; official rules control.

## Current Status

- **Phase:** `WP-004` mock Next.js application skeleton implemented on `feat/wp-004-app-skeleton` (`WP-001`, `WP-002`, and `WP-003A` merged to `main`; `WP-003B` live Gemini/TTS spike pending credentials).
- **Next:** Vercel preview verification, `WP-003B` live AI/audio spike, and `WP-005` / `WP-007` UI polish.

## Core MVP

- Input a topic or pasted study text; choose **Casual** or **Serious** tone, **Quick** (~8–10 turns) or **Detailed** (~12–15 turns) length, and **2** (default) or **3** hosts.
- Dynamic `hosts[]` conversation script with distinct per-host voices via segmented TTS.
- Sequential turn playback with active-speaker animation, synchronized captions, and one template-driven contextual visual.
- Downloadable combined audio (via verified stitching), downloadable transcript, and a polished pre-generated backup episode.

See [SPEC.md](./SPEC.md) for the full specification, episode contract, exclusions, and roadmap.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, Zod
- **AI & Audio:** One verified Gemini Flash-class model for structured scripts + segmented TTS with verified stitching
- **Hosting & Workflow:** Vercel, GitHub

## Local Setup

Prerequisites: Node.js 24+ and npm. No API key is needed for WP-004 mock mode (`GEMINI_API_KEY` in `.env.example` is server-side only for WP-003B/live AI; never prefix with `NEXT_PUBLIC_`).

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:schema
npm run build
```

## Team Lanes

| Member | Primary Tooling | Ownership |
| --- | --- | --- |
| Project Owner | Antigravity (`Neon` lead) | Product scope, architecture, frontend/integration, deploy, PR review, sole `main` merge authority |
| Lucky | Claude Code (`Opus` -> `Sonnet` / `Fable`) | UI/UX research, wireframes, visual system, isolated UI branches, demo visuals |
| JR | Codex (`Astra` -> `Sol` / `Terra`) | Episode contract, Zod schemas, Gemini/TTS spike, audio stitching, API routes, backend tests |

See [AGENTS.md](./AGENTS.md) for branch rules, agent boundaries, and handoff standards.

## Notice

Kuro is a provisional product name used for the hackathon prototype and may change following formal brand and trademark clearance.
