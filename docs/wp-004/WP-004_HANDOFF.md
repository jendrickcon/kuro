# WP-004 Handoff — Kuro Application Skeleton (Mocks Only)

## 1. Status
**Partially complete** — Local Next.js App Router + TypeScript + Tailwind + Zod mock skeleton is built and verified on `feat/wp-004-app-skeleton`; Vercel preview deployment is pending (`vercel` CLI not installed/authenticated locally).

## 2. Architecture & Schema Decision
- **Single authoritative contract:** Kept `contracts/episode.schema.ts` at the repository root (zero duplication, full Git history intact, zero doc path drift) and mapped `@contracts/*` and `@fixtures/*` in `tsconfig.json`.
- **UI library choice:** Used semantic HTML + Tailwind CSS v4 without installing `shadcn/ui` packages in WP-004.

## 3. Files & Dependencies Added
- **Runtime deps:** `next@16.4.6`, `react@19.3.1`, `react-dom@19.3.1`, `zod@^4.6.7`.
- **Dev deps:** `typescript@^5.9.0`, `tailwindcss@^4.3.5`, `@tailwindcss/postcss@^4.3.5`, `eslint@^9.39.0`, `eslint-config-next@16.4.6`, `@types/node`, `@types/react`, `@types/react-dom`.
- **Skeleton files:** `package.json`, `next.config.ts`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `.env.example`, `scripts/test-schema.mjs`, `src/app/{layout.tsx,globals.css,page.tsx}`, `src/app/api/episodes/route.ts`, `src/lib/episode/{fixtures.ts,mock-service.ts}`, `src/components/kuro/{kuro-skeleton.tsx,creation-form.tsx,generation-status.tsx,episode-preview.tsx}`, minimal `README.md` update.

## 4. Mock Behavior vs. Deferred Work
- `POST /api/episodes` validates requests with `CreateEpisodeRequestSchema` (`10–2,500` trimmed chars, no silent truncation), returns `INVALID_INPUT` (`400`) on bad payloads, and returns validated 2-host (`quick`) or 3-host (`detailed`) mock fixtures with zero external AI/TTS calls or keys.
- `EpisodePreview` renders a clear **"Mock episode"** badge, dynamic `hosts[]` cards, turn stepping, caption text, and `visualCue.type` label.
- **Deferred:** `WP-003B` live Gemini/TTS/stitching, `WP-005` creation polish, and `WP-007` full audio player & exports.

## 5. Next Steps
1. Connect `jendrickcon/kuro` in Vercel Dashboard (or install/login `vercel` CLI) to verify a preview deployment of `feat/wp-004-app-skeleton`.
2. Merge `feat/wp-004-app-skeleton` into `main` when approved, then run `WP-005` and `WP-003B` (once `GEMINI_API_KEY` is configured locally).
