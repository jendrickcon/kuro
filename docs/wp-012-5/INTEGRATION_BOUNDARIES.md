# WP-012.5 — Integration Boundaries, Ownership & Rollback

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Baseline:** `origin/main` `fe21cf1` (`WP-012` + roadmap sync merged; implemented on `feat/wp-012-5-experience-architecture`) `[Verified]`

---

## 1. Execution Sequence & Parallelism Gate (`[Verified]` & `[Proposed]`)

Per Owner Authorization (Sections 1, 5, 8, 9):

```text
1. chore/sync-roadmap-docs  (Sync README, CONTRIBUTING, ROADMAP_BRIEF, AI_ONBOARDING)
        │  [Manual Merge to main]
        ▼
2. WP-012.5  (Owner-Led: Complete 5-Screen Product Experience & Working Workflow)
        │  [Owner Review & Manual Merge to main]
        ▼
   ┌────┴─────────────────────────────────────────────────────────┐
   ▼                                                              ▼
3A. WP-013 Phase 1 (Lucky / Angel)                 3B. WP-016 Phase 1 (JR / John Rae)
    Visual system, 2 cat + 1 comfy Kuromates,          Reliability/security/Vercel audit +
    chart polish & static visual prototype             recovery prototype around WP-012.5
    [docs/wp-013/ + prototype/wp-013/]                 [docs/wp-016/ + prototype/wp-016/]
```

- **Strict Gate:** Neither **Lucky (`WP-013`)** nor **JR (`WP-016`)** starts until `WP-012.5` is completed, reviewed, and merged into `main`.

---

## 2. Package Ownership Matrix (`[Proposed]` & `[Verified]`)

| Subsystem / Concern | `WP-012.5` (Jendrick — Project Owner) | `WP-013` (Lucky / Angel) | `WP-016` (JR / John Rae) |
| --- | --- | --- | --- |
| **Site Map, 5-Screen Sequence & Nav** | **Owns & locks** (`Home -> Create -> Broadcast Intro -> 9:16 Portrait Player -> Session Episodes`, mobile/desktop nav). | Uses `WP-012.5` structure as source of truth; **may not** redefine IA or playback flow without Owner approval. | Uses `WP-012.5` screens & transitions as recovery-UX structure; **may not** redefine site structure. |
| **Broadcast Loader & 9:16 Portrait Player Shell** | **Owns** functional Next.js structure, beat-sheet timing mapped to real compiler snapshots, 5 deterministic camera shot rules, `9:16` safe zones, scrubber & downloads. | **Upgrades** visual polish, art direction, typography, OKLCH palette, lighting depth, and contextual chart visual craft inside `WP-012.5`'s structure. | **Hardens** failure/recovery states (`429`, `503`, timeouts, partial failure, download errors, offline, `404`/`500`) inside the broadcast loader & portrait player. |
| **Kuromates & Design System** | Provides clean, modular starter tokens + original provisional SVG Kuromate renderer slots (`hosts[]` dynamic, responsive, reduced-motion ready). | **Owns final** `DESIGN.md`, non-reflex typography, OKLCH system, **two original cat-inspired Kuromates + one comfy Kuromate**, and final chart styling. | Preserves existing tokens in Phase-1 recovery prototype so Lucky can apply final `WP-013` styles later. |
| **Session Episodes (`Screen 5`)** | **Owns** in-memory `SessionEpisodeStore`, Blob lifecycle hygiene, honest non-persistence disclosure, replay/download/delete actions. | Polishes card layout, typography, empty state, and spacing. | Audits download/memory/abort edge cases and error states on session cards. |
| **Audio Backend, Compiler & Tests** | Reuses `WP-012` compiler, stitcher, and APIs cleanly with **zero** regression to invariants or backend routes. | Phase 1 touches **only** `docs/wp-013/` & `prototype/wp-013/` (zero `src/` edits). | **Owns** server hardening, `next.config.ts` security headers, Next.js `404`/`500` boundaries, Vercel diagnostics, and expanded regression suites. |

---

## 3. Non-Negotiable `WP-012` & `SPEC.md` Invariants (`[Verified]`)

`WP-012.5`, `WP-013`, and `WP-016` MUST preserve all of the following on `main`:

1. **`NO AUDIO, NO ADVANCE`:** Live episodes never skip a failed turn and never substitute silent timed captions (`Sample Preview` and future `WP-018` backups are the sole caption-preview paths).
2. **Layer-1 Kuromate Voice Ownership:** `kuromate_maya_v1` (`aura-2-thalia-en` / `Sulafat`), `kuromate_leo_v1` (`aura-2-hermes-en` / `Puck`), `kuromate_sam_v1` (`aura-2-orion-en` / `Kore`), and `kuromate_guest_01..03_v1` (`athena`/`arcas`/`luna`); roles change style only.
3. **Hybrid Batch Compilation:** `Quick` (`8–10` turns) compiles 100% before Play; `Detailed` (`12–15` turns) compiles Batch 1 (`4` turns) before Play and rolls 4-turn batches in background with boundary buffering + auto-downshift to concurrency `1` + `1,500 ms` pacing on Gemini fallback.
4. **In-Browser WAV Stitching & Check #45:** Client stitches `24 kHz` mono 16-bit PCM WAV; zero `localStorage.setItem`, `indexedDB`, or `caches.open` in `src/`; zero `speechSynthesis` in `src/`; zero separate `audio-preparation-panel.tsx`.
5. **Privacy & Header Hygiene:** Zero API keys (`GEMINI_API_KEY`, `DEEPGRAM_API_KEY`), zero `NEXT_PUBLIC_*` secret vars, and zero vendor/voice headers (`X-Kuro-TTS-Provider`, `X-Kuro-TTS-Voice`) exposed to browsers or client bundles.
6. **Exclusions Protected:** Zero Canvas/WebGL/Three.js (deferred to optional late/post-MVP spike), zero user accounts/auth, zero database, zero PDF upload/web search/quizzes, zero Playwright/Husky/new runtime UI packages unless separately approved.

---

## 4. Planned `WP-012.5` Code Boundary & Rollback Strategy (`[Proposed]`)

- **Implemented `WP-012.5` runtime touchpoints (`feat/wp-012-5-experience-architecture`):**
  - Shell & Navigation: [layout.tsx](../../src/app/layout.tsx), [globals.css](../../src/app/globals.css), [page.tsx](../../src/app/page.tsx), [app-navigation.tsx](../../src/components/kuro/app-navigation.tsx), [kuro-app-shell.tsx](../../src/components/kuro/kuro-app-shell.tsx), [home-screen.tsx](../../src/components/kuro/home-screen.tsx), [session-episodes-screen.tsx](../../src/components/kuro/session-episodes-screen.tsx), modular player (`src/components/kuro/player/*`) & generator (`src/components/kuro/creation-form.tsx`).
  - Experience state & hooks: [navigation.ts](../../src/lib/experience/navigation.ts), [editorial-shot-selector.ts](../../src/lib/experience/editorial-shot-selector.ts), [downloads.ts](../../src/lib/experience/downloads.ts), [session-episode-store.ts](../../src/lib/experience/session-episode-store.ts), [use-session-episodes.ts](../../src/hooks/use-session-episodes.ts), plus additive beats in [unified-loading-state.ts](../../src/lib/episode/unified-loading-state.ts) and queue adapter helper in [use-episode-audio-queue.ts](../../src/hooks/use-episode-audio-queue.ts).
  - Completely untouched boundaries (`git diff --name-only` verified): `contracts/episode.schema.ts`, `src/app/api/*`, `src/lib/episode/gemini-*`, `src/lib/tts/*` (`wav-stitcher.ts`, `episode-batch-compiler.ts`, `gemini-tts-*`, `deepgram-tts-client.ts`, `tts-route-handler.ts`), `package-lock.json`, `next.config.ts`.
- **Clean Rollback Boundary:** Because `WP-012.5` sits strictly in the UI/workflow presentation and in-memory session wrapper layer above `EpisodeBatchCompiler`, reverting the `WP-012.5` merge commit restores `main` cleanly to `fe21cf1` with zero backend, contract, or audio-engine disruption.
