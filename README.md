# Kuro

**More voices. Clearer ideas.**

Kuro (*Kuro: Adaptive Conversations for Better Understanding*) transforms a difficult topic, class reading, or pasted study material into an adaptive multi-host conversation built for commuting college students. Listeners follow distinct AI host voices with synchronized captions, lightweight active-speaker animation, a structured contextual visual, and downloadable audio and transcripts.

## Hackathon

- **Event:** [SLAY HACKS 2026](https://slayy-hacks.devpost.com/)
- **Internal deadline:** December 7, 2026 (Manila time); official deadline December 7, 2026 at 5:00 PM EST (~December 8, 6:00 AM Manila) — remaining hours are emergency buffer only.
- **Eligibility note:** Each team member must independently verify eligibility on the official Devpost rules page; official rules control.

## Current Status

- **Completed (`WP-008`–`WP-011`):** Verified Next.js application with live Gemini script generation (`WP-009`), allowlisted Kuromate voices (`WP-010`), and full-episode audio queue playback with bounded prefetching and caption fallback (`WP-011` on `feat/wp-011-full-episode-audio`).
- **Deferred / Download limit:** Transcript `.txt` download is active; combined episode audio download, persistent storage, and offline audio remain deferred.

## Core MVP (Hosted Audio Active)

- Input 10–2,500 chars; choose **Casual** or **Serious** tone, **Quick** (~8–10 turns) or **Detailed** (~12–15 turns) length, and **2** or **3** Kuromates.
- Press **Play** for automatic hosted Kuromate voices with max-2 prefetching, synchronized captions, studio monitor visuals, shared `Retry-After` handling, explicit caption fallback, and `.txt` transcript download (plus `prototype/index.html` standalone demo).

See [SPEC.md](./SPEC.md) for the full specification, episode contract, exclusions, and roadmap.

## Tech Stack

- **App:** Next.js (App Router), React, TypeScript, Tailwind CSS, Zod
- **AI & Audio:** Gemini `gemini-3.8-flash` (`v1`) scripts + `gemini-3.8-flash-tts` (`v1beta`) segmented audio queue; combined audio download deferred
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
npm run test:audio-queue
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
