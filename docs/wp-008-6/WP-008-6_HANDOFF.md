# WP-008.6 Handoff — Rename Kuro Hosts to Kuromates

## 1. Naming Decision & Terminology Rule
- **Decision:** Retired the earlier provisional host mascot term across all tracked repository source files, prototype assets, styles, and documentation in favor of **Kuromate** (singular) / **Kuromates** (plural).
- **Source-of-truth guidance:** Added the explicit rule to [CONTRIBUTING.md](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md) (*"Kuro’s conversational hosts are called Kuromates. 'Kuromate' is singular and 'Kuromates' is plural."*). Retained product identity **Kuro** and neutral schema type `Host` (`contracts/episode.schema.ts`) unchanged.

## 2. Files Renamed & Modified (`chore/wp-008-6-rename-kuromates`)
- **Renamed via `git mv`:**
  - `src/components/kuro/kuromate-preview.tsx` (`KuromatePreview`)
  - `src/components/kuro/player/kuromate-host.tsx` (`KuromateHost`, `KuromateHostState`, `KuromateHostProps`)
- **Modified application source & styles:** `src/components/kuro/creation-form.tsx`, `src/components/kuro/player/podcast-stage.tsx`, `src/app/globals.css` (`--kuromate-*`, `.kuromate-*`, `@keyframes kuromate-*`).
- **Modified prototype:** `prototype/index.html`, `prototype/styles.css`, `prototype/app.js`, `prototype/README.md`.
- **Modified documentation:** `AGENTS.md`, `CONTRIBUTING.md`, `docs/contributing/TEAM_LUCKY.md`, `docs/contributing/ROADMAP_BRIEF.md`, `docs/wp-004-5/WP-004-5_HANDOFF.md`, `docs/wp-005/WP-005_HANDOFF.md`, `docs/wp-007/WP-007_HANDOFF.md`.
- **Historical integrity preserved:** Zero commit hashes, dates, or test metrics were altered in prior handoffs; renamed file links updated only for files renamed in this package.

## 3. Search & Verification Results
- **Case-insensitive retired-term scan (`git ls-files` & `git grep -in`):** `0` remaining tracked path or content matches across the entire repository.
- **Quality checks:** `npm ci` (lockfile unchanged), `npm run typecheck`, `npm run lint`, `npm run test:schema` (`11/11`), `npm run build`, `node --check prototype/app.js`, and `git diff --check` all passed cleanly.
- **Local smoke verification (`http://localhost:3000`):** Verified `"Meet your Kuromates"` preview, 2-host sample and 3-host custom players, captions, contextual visuals, controls, transcript download, and `320×640` / `1280×800` layouts with zero console errors.

## 4. Git Evidence, Limitations & Next Action
- **Base & branch:** `chore/wp-008-6-rename-kuromates` created from `main` (`b0014c08b4d3dea99104e29eac065cfe6b32211c`); commit/PR metadata reported upon PR creation (PR `#1` untouched).
- **Known limitation:** Mock-only fixtures and timed silent playback remain unchanged until `WP-009` / `WP-010`.
- **Exact next action:** Project Owner reviews and merges the open `WP-008.6` pull request into `main` before authorizing `WP-009`.
