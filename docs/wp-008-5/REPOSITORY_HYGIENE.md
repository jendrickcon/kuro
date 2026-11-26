# WP-008.5 Repository Hygiene Audit

## Audit Summary
Audited all `64` tracked files on accepted `origin/main` (`1a729e1eca6a9135898062eefbe3aca6ecb30c03`), untracked workspace entries (`git clean -nd`), and ignored developer caches (`git status --ignored`, `git clean -ndX`).

## Classification Across Repository

| Path / Group | Category | Disposition & Rationale |
| --- | --- | --- |
| `README.md`, `SPEC.md`, `AGENTS.md`, `LICENSE`, `.gitignore`, `.env.example` | Required | Canonical product scope, team lanes, license, ignore rules, server env template. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `next-env.d.ts` | Required | Locked Next.js / TypeScript / Tailwind v4 build & dependency graph. |
| `contracts/episode.schema.ts`, `fixtures/**`, `scripts/test-schema.mjs` | Required | Authoritative Zod contracts, valid/invalid fixtures, and schema test runner. |
| `src/**` (app routes, creation UI, studio player, visuals, hooks, episode lib) | Required | Active production mock application (`WP-004`, `WP-005`, `WP-007`); `episode-preview.tsx` was already removed in `WP-007`. |
| `docs/wp-002/**`, `docs/wp-003/**`, `docs/wp-004/**`, `docs/wp-004-5/**`, `docs/wp-005/**`, `docs/wp-007/**` | Useful historical evidence | Accepted specification, spike findings, and per-WP handoffs documenting locked decisions. |
| `prototype/**` (`index.html`, `styles.css`, `app.js`, `README.md`) | Useful historical evidence | Standalone `file://` reference & fallback demo preserved separately from `src/`. |
| `.next/`, `node_modules/`, `tsconfig.tsbuildinfo` | Generated and ignored | Excluded by `.gitignore`; kept untouched to avoid disrupting local dev caches. |
| Untracked clutter / screenshots / stray logs / `requirements.txt` / `.env*` | Duplicate / Obsolete / Local-only | **None present** (`git clean -nd` returned empty; `0` screenshots or logs inside repo). |

## Items Removed
- **None (`0` files removed).**

## Duplicate-Document & Dependency-File Decisions
- **Duplicate check:** Confirmed zero duplicate contracts, PR templates, or contributor onboarding guides (`docs/wp-008/` lives cleanly on open PR `#1`, untouched here). Zero unestablished fourth-contributor references exist in tracked files.
- **Dependency-file verdict:** Kuro is a Node.js/npm Next.js application (`package.json` + `package-lock.json`, installed via `npm ci`). Rejected `requirements.txt` as inappropriate for JS/TS. Added a single lightweight `"engines": { "node": "24.x" }` declaration in `package.json` matching the verified runtime (`Node v24.21.0`, compatible with `next@16.4.6` `>=20.9.0` and Vercel) without adding a duplicate `.nvmrc`.

## Final Verdict
> Repository hygiene audit complete; no tracked files were removed because every tracked file remains relevant or retains useful decision evidence.
