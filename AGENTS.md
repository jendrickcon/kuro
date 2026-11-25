# AGENTS.md — Collaboration & Repository Operating Guide

Read [README.md](./README.md) and [SPEC.md](./SPEC.md) before starting work. Keep the product name strictly **Kuro** (never `Kuro AI`, `KuroCast`, or `Klaro`) and the tagline strictly **"More voices. Clearer ideas."**

## 1. Team Lanes & Agent Families

| Member | Agent Family | File Ownership & Primary Lane | Strict Boundary |
| --- | --- | --- | --- |
| Project Owner | Antigravity (`Neon` lead; optional `Hydrogen`, `Carbon`) | Scope, architecture, root docs/config, frontend integration, Vercel deploy, PR review, sole `main` merge authority | Sole merge controller for `main` |
| Lucky | Claude Code (`Claude 5.5 Opus` research -> `Sonnet` UI -> `Fable` copy/polish) | UI/UX research, wireframes, visual system, responsive/a11y UI components on isolated branches, demo assets | Must not rewrite app architecture |
| JR | Codex (`Codex 6.2 Astra` spike -> `Sol` backend -> `6.1 Terra` utilities/tests) | Episode contract, Zod schemas, fixtures, prompts, Gemini/TTS pipeline, audio stitching, API routes, backend tests | Must not build a competing frontend |

- **One primary agent per work package:** Assign one lead agent and produce one consolidated final handoff per WP. Use secondary agents only for clearly isolated checks that genuinely save time — never spawn extra agents just because they exist.
- Never edit another member's files or active branch without explicit Project Owner instruction.

## 2. Branch, Documentation & Secret Rules

- `main` must stay reviewable and deployable. No direct commits to `main` after initial repository setup without explicit Project Owner authorization.
- Use one dedicated branch per approved WP (e.g., `docs/wp-001-foundation`, `research/wp-002-ui-ux`, `spike/wp-003-ai-audio`, `feat/wp-004-app-skeleton`, `feat/wp-005-creation-flow`, `feat/wp-007-multi-host-player`). Do not pre-create unused branches.
- **Standard PR workflow:** Work on one package branch -> verify locally -> commit and push -> open a titled, described GitHub PR -> **leave the PR OPEN** -> report the PR number and URL -> stop for Project Owner review. Only the owner decides whether to merge or close.
- **PR boundary:** Antigravity must never merge, close, reopen, or delete a pull request unless the project owner explicitly authorizes that exact action. No force-pushes to shared branches.
- **Onboarding & creative freedom:** New contributor guides live in [CONTRIBUTING.md](./CONTRIBUTING.md) and `docs/contributing/`. Contributors and their AIs have creative freedom inside their assigned package, accepted contracts, exclusions, and verification gates.
- **Doc size limits:** Keep `README.md < 80` lines, `SPEC.md < 180` lines, and `AGENTS.md < 120` lines. Do not add extra planning docs unless explicitly requested by the Project Owner.
- **Secrets:** Never commit secrets, never place API keys in client-side code, never put private credentials in `NEXT_PUBLIC_*`, and keep `.env.example` free of real values.

## 3. What Agents Must Not Implement

- Anything under **Explicit Exclusions** in [SPEC.md](./SPEC.md) (accounts/auth, language selector, PDF upload, live web/news retrieval, citations, quizzes, reading-mode tabs, AI video or MP4 export, Canvas, offline LLMs, voice cloning, Playwright/Husky/lint-staged/complex CI, multi-provider AI abstractions, normalized multi-table DBs).
- Hard-coded two-host fields (`hostA`, `hostB`, `speakerOne`, `speakerTwo`) — always use `hosts[]`.
- Unverified/speculative AI model names, assumed TTS formats (raw PCM or WAV before response inspection), or faked combined audio downloads.
- Work belonging to another work package without approval.

## 4. Verification Evidence Rules

Never claim any outcome without direct recorded evidence:
- **Pushed / Merged:** cite actual Git output and commit hash.
- **Pull request exists:** cite PR number or link.
- **API or TTS works:** cite recorded test command and observed response.
- **Deployment works:** cite a verified reachable preview URL.

## 5. Session Reporting & Final Handoff Format

**Start of task:** WP ID, branch name, expected files, session goal, known dependencies/blockers.

**End of task (one consolidated handoff per WP):**
- **Status:** `Complete` | `Partially complete` | `Blocked`
- **Files created or changed:** each file and what it controls
- **Decisions locked:** material decisions only
- **Verification performed:** exact commands/checks and results
- **Git evidence:** current branch, commit hash (if committed), push status, PR status, merge status
- **Remaining work / known problems / open decisions:** only genuine blockers or owner decisions
- **Recommended next action:** exact next step for the Project Owner

## 6. Stop Conditions

Stop and ask the Project Owner before:
- Changing the locked MVP, adding any excluded feature, or changing the product name, tagline, or team roles
- Adding a database, authentication, a major dependency, a second AI provider, Canvas, video export, or complex CI
- Making a technical choice that materially increases API cost
- Modifying another member's active branch, merging into `main`, or publishing/deploying with real secrets

If a minor uncertainty does not affect scope, cost, or safety, record the assumption and continue.
