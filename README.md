# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a difficult topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students. Listeners follow distinct AI host voices with synchronized captions, lightweight active-speaker animation, a structured contextual visual, and downloadable audio and transcripts.

## Hackathon

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/)
- **Internal deadline:** December 7, 2026 (Manila time); official deadline December 7, 2026 at 5:00 PM EST (~December 8, 6:00 AM Manila) — remaining hours are emergency buffer only.
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page; official rules control.

## Current Status

- **Phase:** `WP-001` complete (source-of-truth documentation and parallel sprint handoffs).
- **Next:** `WP-002` (UI/UX research & wireframes) and `WP-003` (AI/audio technical spike) run in parallel before `WP-004` initializes the Next.js application.

## Core MVP

- Input a topic or pasted study text; choose **Casual** or **Serious** tone, **Quick** (~8–10 turns) or **Detailed** (~12–15 turns) length, and **2** (default) or **3** hosts.
- Dynamic `hosts[]` conversation script with distinct per-host voices via segmented TTS.
- Sequential turn playback with active-speaker animation, synchronized captions, and one template-driven contextual visual.
- Downloadable combined audio (via verified stitching), downloadable transcript, and a polished pre-generated backup episode.

See [SPEC.md](./SPEC.md) for the full specification, episode contract, exclusions, and roadmap.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, selected shadcn/ui components, Zod
- **AI & Audio:** One verified Gemini Flash-class model for structured scripts + segmented TTS with verified stitching
- **Hosting & Workflow:** Vercel, GitHub

## Local Setup

Application initialization (`Next.js`, dependencies, and `.env.example`) belongs to `WP-004`. Once initialized:

1. Copy `.env.example` to `.env.local` and supply server-side API keys (never commit real secrets).
2. Install dependencies and start the local Next.js dev server (exact commands will be finalized in `WP-004`).

## Team Lanes

| Member | Primary Tooling | Ownership |
| --- | --- | --- |
| Project Owner | Antigravity (`Neon` lead) | Product scope, architecture, frontend/integration, deploy, PR review, sole `main` merge authority |
| Lucky | Claude Code (`Opus` -> `Sonnet` / `Fable`) | UI/UX research, wireframes, visual system, isolated UI branches, demo visuals |
| JR | Codex (`Astra` -> `Sol` / `Terra`) | Episode contract, Zod schemas, Gemini/TTS spike, audio stitching, API routes, backend tests |

See [AGENTS.md](./AGENTS.md) for branch rules, agent boundaries, and handoff standards.

## Notice

Kuro is a provisional product name used for the hackathon prototype and may change following formal brand and trademark clearance.
