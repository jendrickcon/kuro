# Contributor Guide — Team Member Lucky (UI/UX & Frontend Presentation)

## Primary Lane & Tooling
- **Owner:** Team Member **Lucky**
- **Primary AI Workflow:** Claude Code (`Opus` research -> `Sonnet` UI implementation -> `Fable` copy/polish), adaptable to any compatible coding agent.
- **Owns:** UI/UX research, wireframes, typography & spacing systems, information hierarchy, visual direction, responsive layouts (`320px+`), accessibility, Kuromate mascot direction, frontend polish, and hackathon screenshots/demo assets.
- **Boundary:** Must not rewrite backend contracts, app architecture, or alter `SPEC.md` scope/exclusions without Project Owner approval.

## Research-Before-Implementation Workflow
Before designing or editing UI in a new package, examine current public products and open-source UI/accessibility references:
- **Products:** Google NotebookLM, Spotify, Apple Podcasts, ElevenLabs, Riverside, Descript, Duolingo, Khan Academy, Speechify.
- **Open-Source & UI Systems:** Media Chrome, shadcn/ui, Radix UI, accessible media players, caption panels, and educational multimedia layouts.

### Mascot & Visual Reference Boundaries (Originality Rule)
Lucky may study Kurzgesagt’s publicly visible educational visual principles—simplified geometric silhouettes, bold color systems, clear visual hierarchy, character consistency, and digestible explanatory framing—to inform **original** Kuro design decisions.

**Never copy or trace:**
- Do not imitate Kurzgesagt’s specific characters, planets, textures, palettes, or motion language.
- Do not reuse third-party illustrations, icons, or source assets as Kuro’s work.

## Core Design Guardrails
- **Identity:** Strictly **Kuro** — *"More voices. Clearer ideas."* Built for a commuting college student reviewing tough material on phone or laptop.
- **Multi-Host Architecture:** Render dynamically from `episode.hosts[]` (`2` or `3` hosts); never hard-code names (`Maya`/`Leo`/`Sam`) or `hostA`/`hostB`.
- **Stage & Speaking Cues:** Keep hosts cohesive around one studio stage (no enclosing glow halos); combine non-color indicators (mic light, speaker label, caption accent, posture, stage framing).
- **Responsive & Accessible UX:** Zero horizontal overflow at `320px`, `44×44px` minimum primary touch targets, semantic HTML/ARIA (`aria-live="polite"`, fieldsets, labels), high contrast, and full `prefers-reduced-motion` posture preservation.

## Creative Freedom Within Scope
Lucky and Claude have creative freedom to elevate typography, spacing rhythm, layout composition, host proportions, contextual monitor styling, caption readability, and visual storytelling—provided every change meets the assigned WP goal, Kuro identity, `SPEC.md` exclusions, existing contracts, accessibility goals, and acceptance tests.

## Required Verification & PR Workflow
1. Work on your assigned WP branch from clean `main`.
2. Run `npm ci` (only on clean/initial setup), `npm run typecheck`, `npm run lint`, `npm run test:schema`, and `npm run build`.
3. Inspect mobile (`320px`, `390px`) and desktop (`1280px`) layouts, keyboard navigation, focus states, reduced motion, and zero console errors.
4. Provide one consolidated handoff matching `AGENTS.md` Section 5.
5. Push branch, open a PR with `.github/pull_request_template.md`, **leave the PR OPEN**, report its URL, and stop for Project Owner review.

## Stop Conditions
Stop and ask the Project Owner before changing `contracts/episode.schema.ts`, adding theme/host customization UI or excluded features, importing external artwork/audio libraries, editing backend/API code outside your lane, deploying, or merging/closing PRs.
