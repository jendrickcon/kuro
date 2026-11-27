# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students, with distinct Kuromate voices, synchronized captions, contextual visuals, and downloadable audio and transcripts.

## Hackathon & Live Production

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/) (Internal cutoff: Dec 7, 2026 Manila; official: Dec 7, 5:00 PM EST).
- **Live Production:** [kuro-enuhri.vercel.app](https://kuro-enuhri.vercel.app)
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page.

## Current Status & Sequence

- **Completed (`WP-001`–`WP-012`):** Verified live on `main` (`f3c8b6a`): Gemini structured scripts (`WP-009`), Deepgram Aura-2 primary TTS + Gemini Flash-Lite fallback (`WP-010`–`WP-011.5`), Layer-1 Kuromate voice identities (`Leo = Hermes`), hybrid batch compilation (`NO AUDIO, NO ADVANCE`), browser WAV stitching, timeline scrubber, `.wav` & `.txt` downloads, and zero-key `Sample Preview` (`WP-012`).
- **Next (`WP-012.5` -> `WP-020`):** Owner-led **`WP-012.5`** (experience architecture & 5-screen workflow) runs next before parallel `WP-013` (Lucky) and `WP-016` (JR). See [ROADMAP_BRIEF.md](./docs/contributing/ROADMAP_BRIEF.md).

## Core MVP

- Input 10–2,500 chars; choose **Casual** or **Serious**, **Quick** (8–10 turns) or **Detailed** (12–15 turns), and **2** or **3** Kuromates (`hosts[]`).
- **Hybrid batch audio (`NO AUDIO, NO ADVANCE`):** Quick compiles 100% before Play; Detailed compiles Batch 1 (4 turns) before Play and rolls 4-turn batches in background. Built-in **Sample Preview** works with zero keys (`0` TTS calls; captions only).

See [SPEC.md](./SPEC.md) for the locked specification, contract, and exclusions.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, Zod
- **AI & Audio:** Gemini `gemini-3.8-flash` (`v1`, fallback `gemini-3.5-flash-lite`) scripts + Deepgram Aura-2 primary TTS & Gemini `gemini-3.8-flash-lite-tts` (`v1beta`) fallback; in-browser `24 kHz` mono WAV stitching
- **Hosting & Workflow:** Vercel, GitHub

## Local Setup

Prerequisites: Node.js 24+ and npm. Zero keys are needed for `Sample Preview` or mock mode (`GEMINI_API_KEY`, `DEEPGRAM_API_KEY`, `KURO_TTS_PROVIDER`, `GEMINI_TEXT_MODEL`, `GEMINI_TTS_MODEL`, and `GEMINI_TTS_FALLBACK_MODEL` in `.env.example` stay server-side only; never `NEXT_PUBLIC_*`).

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm run test:schema
npm run test:generation
npm run test:tts
npm run test:wav
npm run test:audio-queue
npm run build
npm run start
```

## Team Lanes

| Member | Primary Tooling | Ownership |
| --- | --- | --- |
| Project Owner (`Jendrick`) | Antigravity (`Neon` lead) | Scope, architecture, `WP-012.5`, frontend/integration, deploy, PR review, sole `main` merge authority |
| Lucky (`Angel`) | Claude Code (`Opus` -> `Sonnet` / `Fable`) | UI/UX research, visual system, `WP-013` Kuromates/redesign, responsive/a11y polish, demo visuals |
| JR (`John Rae`) | Codex (`Astra` -> `Sol` / `Terra`) | Contracts, schemas, Gemini/TTS pipeline, WAV stitching, `WP-016` reliability/recovery & tests |

See [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for branch rules, onboarding, and handoff standards.

## Notice

Kuro is a provisional product name used for the hackathon prototype and may change following formal brand and trademark clearance.
