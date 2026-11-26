# Contributing to Kuro

**Kuro** (*More voices. Clearer ideas.*) transforms a difficult college topic, class reading, or pasted study material into an engaging multi-host conversation with dynamic `hosts[]` (`2` or `3`), synchronized captions, contextual visuals, and accessible controls.

## Current Milestone Status

- **Main (`Verified`):** Production creation flow and multi-host timed preview player (`WP-001`–`WP-007` + `WP-008.5`).
- **WP-008 (`In Review` / `Mock`):** Mock milestone freeze & QA evidence in open PR `#1` (`test/wp-008-mock-milestone`).
- **Live AI & Audio (`Blocked` / `Pending`):** Live Gemini script generation (`WP-009`), hosted segmented TTS (`WP-010`), and real audio/stitching (`WP-011`) await `WP-003B` provider verification and server-side `GEMINI_API_KEY`.

## Required First Instructions for Contributor AIs

> Before proposing or editing code, audit the repository and read `README.md`, `SPEC.md`, `AGENTS.md`, and `CONTRIBUTING.md`.

Next, identify who you are working with and **wait for their answer before assigning or modifying anything**:

> Which Kuro contributor are you: Team Member Lucky or Team Member JR?

*(Contributors may also answer **"I am the project owner."** If so, follow [SPEC.md](./SPEC.md) and [AGENTS.md](./AGENTS.md) directly instead of a member-specific lane.)*

Read [AI Onboarding Instructions](./docs/contributing/AI_ONBOARDING.md) for the exact step-by-step AI greeting, audit, setup, and roadmap flow.

## Dependency & Windows Setup

Kuro is a **Node.js + npm** Next.js/TypeScript project (`engines.node: "24.x"` in [package.json](./package.json)).

- **Dependency files:** [package.json](./package.json) and [package-lock.json](./package-lock.json) (`npm ci` installs exact locked versions; do **not** create `requirements.txt`).
- **Full setup steps:** See [Windows Setup Guide](./docs/contributing/SETUP_WINDOWS.md).

## Team Lanes & Contributor Guides

- [AI_ONBOARDING.md](./docs/contributing/AI_ONBOARDING.md) — Starter prompt and 6-step onboarding contract for Claude Code, Codex, and compatible AIs.
- [TEAM_LUCKY.md](./docs/contributing/TEAM_LUCKY.md) — Lucky’s UI/UX, visual direction, typography, accessibility, responsive, and mascot reference lane (Claude Code).
- [TEAM_JR.md](./docs/contributing/TEAM_JR.md) — JR’s schema, backend, Gemini/TTS pipeline, security, reliability, and testing-first lane (Codex).
- [ROADMAP_BRIEF.md](./docs/contributing/ROADMAP_BRIEF.md) — High-level completed, active, pending, and stretch work packages.
- [SETUP_WINDOWS.md](./docs/contributing/SETUP_WINDOWS.md) — Beginner-friendly Windows clone, `npm ci`, verification, and troubleshooting guide.

## Branch, PR & Verification Rules

- Always branch from up-to-date `main` using one dedicated branch per approved work package.
- Run local checks (`npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:schema`, `npm run build`) plus lane-specific verification before pushing.
- Open one PR targeting `main` using `.github/pull_request_template.md`, **leave the PR OPEN**, report the PR number and URL, and stop for Project Owner review. Only the Project Owner decides whether to merge or close PRs.

## Creative Freedom Rule

> Contributors and their AI tools have creative freedom over implementation details, research references, and presentation choices, provided they satisfy the assigned goal, accepted contracts, accessibility expectations, verification requirements, exclusions, and protected project decisions.

Creative freedom **never** permits changing Kuro’s name or tagline, expanding MVP scope in [SPEC.md](./SPEC.md), breaking `hosts[]`, altering `contracts/episode.schema.ts` without approval, exposing secrets (`NEXT_PUBLIC_*`), copying third-party characters/assets, editing another member’s lane unasked, skipping tests, or merging PRs without authorization.

## Protected Files & Optional Roadmap Prompt

Protect `README.md`, `SPEC.md`, `AGENTS.md`, `contracts/`, `fixtures/`, `prototype/`, and accepted WP handoffs unless a package explicitly covers them. After setup, ask contributors whether they want a brief overview of [ROADMAP_BRIEF.md](./docs/contributing/ROADMAP_BRIEF.md).
