# WP-008.5 Handoff — Repository Hygiene & Contributor Onboarding

## 1. Status & Authorization Scope
- **Status:** Complete on `chore/wp-008-5-contributor-handoff` (branched from accepted `main` `1a729e1eca6a9135898062eefbe3aca6ecb30c03`).
- **One-time merge exception:** The owner explicitly authorized Antigravity to merge WP-008.5 after checks pass. All future pull requests must remain **OPEN** for Project Owner review (`AGENTS.md` updated accordingly).

## 2. Files Added or Changed
- Updated [package.json](../../package.json): added `"engines": { "node": "24.x" }` (no dependencies changed; zero `requirements.txt`).
- Updated [AGENTS.md](../../AGENTS.md): codified open-PR stop workflow, owner-only merge/close rule, and [CONTRIBUTING.md](../../CONTRIBUTING.md) link.
- Added [.github/pull_request_template.md](../../.github/pull_request_template.md): lightweight PR checklist (zero GitHub Actions/bots).
- Added [CONTRIBUTING.md](../../CONTRIBUTING.md), [AI_ONBOARDING.md](../contributing/AI_ONBOARDING.md), [TEAM_LUCKY.md](../contributing/TEAM_LUCKY.md), [TEAM_JR.md](../contributing/TEAM_JR.md), [ROADMAP_BRIEF.md](../contributing/ROADMAP_BRIEF.md), and [SETUP_WINDOWS.md](../contributing/SETUP_WINDOWS.md).
- Added [REPOSITORY_HYGIENE.md](./REPOSITORY_HYGIENE.md) and this handoff.

## 3. Hygiene, Onboarding & Role Guides Summary
- **Hygiene:** Audited all `64` tracked files, ignored caches (`.next/`, `node_modules/`, `tsconfig.tsbuildinfo`), and untracked paths (`0` clutter found; `0` tracked files removed).
- **Onboarding & setup:** Starter prompt and 6-step AI interaction contract instruct Claude Code, Codex, and compatible agents to audit the repo, ask **Team Member Lucky / Team Member JR / Project Owner**, offer AI-assisted or manual Windows PowerShell `npm ci` setup (no owner username hard-coded), ask the roadmap overview question, and stop for package assignment.
- **Lucky (`TEAM_LUCKY.md`):** Research-first UI/UX, typography, accessibility, `320px+`, `hosts[]`, original visual direction (Kurzgesagt strictly as conceptual reference, never copied), creative freedom within scope.
- **JR (`TEAM_JR.md`):** Backend, schemas, Gemini/TTS, security, reliability, and testing-first completion (*implementation incomplete until test matrix passes or blockers documented*).
- **Roadmap prompt (`ROADMAP_BRIEF.md`):** Separates `[Verified]`, `[Mock]` (`WP-008` PR `#1`), `[Blocked]` (`WP-003B`), `[Pending]` (`WP-009`–`WP-011`), and `[Proposed]` post-MVP work cleanly.

## 4. Verification, PR & Next Decisions
- **Verification:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:schema`, `npm run build`, doc line-limit checks, relative link checks, secret scan, and `git diff --check` verified prior to commit; PR `#1` untouched. Final commit, PR, and `--merge` evidence reported in the WP-008.5 final response.
- **Remaining owner decisions:** Review/merge open PR `#1` (`test/wp-008-mock-milestone`), complete Vercel verification, and assign next package (`WP-003B` / `WP-009`) once `GEMINI_API_KEY` is configured.
- **Exact next action:** Share the starter onboarding prompt from `docs/contributing/AI_ONBOARDING.md` with Lucky and JR, then handle PR `#1` and Vercel verification separately.
