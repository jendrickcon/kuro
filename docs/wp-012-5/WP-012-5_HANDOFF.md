# WP-012.5 — Implementation & Verification Handoff

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Starting `main` Hash:** `fe21cf1be3fb0359abefa5f75d4bfa78f67a6dec` (`fe21cf1`)
> **Implementation Branch:** `feat/wp-012-5-experience-architecture`

---

## 1. Implementation Summary (`Baseline` vs. `WP-012.5` Patched vs. Deferred)
- **Previous Baseline (`:3055`, `fe21cf1`):** Opened directly onto a single-stack creation form with no Home screen, no top/bottom navigation, wide horizontal shared-desk player (`792×454` at `1280×800`), and no session retention.
- **`WP-012.5` + PR #10 Immersive Portrait Player Refinement:**
  - **5-Screen Flow (`KuroAppShell`):** `Home` (`#home`, `"Welcome to Kuro"` + in-memory `"Hello, Jendrick!"` toggle + conditional `Continue listening` + `Try a sample episode`) -> `Create` (`#create`) -> `Preparation` (`#prepare`, unified broadcast beats 1–5 + safe `Skip intro` preserving `NO AUDIO, NO ADVANCE`) -> `Immersive 9:16 Portrait Player` (`#player`) -> `Session Episodes` (`#episodes`, `MAX_SESSION_EPISODES = 5`, exact-once Blob revocation).
  - **Immersive Mobile Viewport & Desktop Theater:** `< 768px` hides `AppNavigation` top header & bottom bar during playback (`100dvh × min(100vw, 430px)`, top overlay HUD with `←`, single-line truncated title, `Sample`, `02/09`, `Transcript` drawer button, `⋯` overflow menu). `>= 1024px` (`lg:`) pairs `h-[min(86dvh,780px)]` theater player with companion side rail (zero transcript duplication under the video).
  - **Synchronized 1–2 Line Subtitles (`subtitle-cues.ts` + `useSampleSegmentClock`):** Replaced the white `CaptionPanel` transcript card and `Previous —` paragraph with a 1–2 line subtitle overlay driven cleanly by `speechStartMs`/`speechDurationMs` in hosted playback and an rAF intra-segment clock during Sample Preview playback.
  - **Names-Only Cast Labels, Stable Seat Separation & 4-Plane CSS 3D Stage:** Removed `.kuro-nameplate-row`, debug labels, and all visible role pills; added floating name labels (`Maya`, `Leo`, `Sam`) only; separated `data-studio-seat` (`episode.hosts[]` index) from GPU-composited `data-camera-anchor` (`visual-left`/`visual-right` keep speakers on their own side); added perspective room architecture, volumetric spotlight, curved desk rim, and conditional `player-boundary` recovery overlay (`null` during smooth playback).
  - **Prohibited Boundaries Preserved:** Zero edits to `contracts/episode.schema.ts`, `src/app/api/**`, `src/lib/episode/gemini-*`, `src/lib/tts/*`, `package.json`, `package-lock.json`, `next.config.ts`, `AGENTS.md`, `SPEC.md`, `README.md`, `CONTRIBUTING.md`, `docs/contributing/**`, `docs/wp-013/**`, or `docs/wp-016/**`.

---

## 2. Automated & Real-Browser Verification Evidence
- **Automated Suites (`cmd /c` verification chain):** `npm run typecheck` (`0` errors), `npm run lint` (`0` warnings/errors), `npm run test:schema` (`11`), `npm run test:generation` (`33`), `npm run test:tts` (`68`), `npm run test:wav` (`21`), `npm run test:audio-queue` (`69`), `npm run test:experience` (`21` checks covering immersive header/nav hiding, `subtitle-cues.ts` fidelity & timing, names-only labels, accessible `TranscriptDrawer`, Maya/Leo/Sam seat-vs-camera invariants, and debug label removal), `npm run build` (`11` `.next/static/` assets), and `git diff --check` all exited `0`.
- **Real-Browser QA (`http://127.0.0.1:3061` deterministic mock proxy over `:3060` prod build):**
  - `0` horizontal overflow, `0` overlapping controls, `44px` tap targets, and `0` console/page/hydration errors across **`320×640`**, **`360×800`**, **`390×844`**, **`430×932`**, **`768×1024`**, **`1280×800`**, **`1440×900`**, **`1280×800 @ 150%` (`853×533`)**, and **`390×844 @ 150%` (`260×563`)**.
  - Verified: First-click Home `Try a sample episode` -> `#player`; hidden mobile header/bottom nav inside `#player`; advancing 1–2 line Sample Preview & live 3-host subtitle cues; Turn 3 Maya staying `data-studio-seat="left"` / `data-camera-anchor="visual-left"` (`+27.1px` clear gap above Maya even at `853×533` 150% zoom); accessible `TranscriptDrawer` (`role="dialog"`, `aria-modal="true"`, Escape focus restore, turn jump) and `⋯` actions menu; 3-host Detailed Batch-1 playback (`Maya`/`Leo`/`Sam` names only, zero role tags), Batch 2 boundary hold (`Preparing turns 5–8…`, `NO AUDIO, NO ADVANCE`), release recovery (`Download Audio (.wav)` unlocked at `12/12`), and Turn 10 Leo seat preservation (`data-studio-seat="center"`, visible at `+286.52px` below comparison card).
- **Security & Privacy Scans (`[Verified]`):** `0` leak hits across `46` scanned files (`11` `.next/static/` + `35` client files): `0` secrets, `0` provider/model/voice strings, `0` `speechSynthesis`, `0` storage APIs (`localStorage.setItem`/`sessionStorage.setItem`/`indexedDB`/`caches.open`), `0` Canvas/WebGL/Three.js, and `0` `transition: all`/bare `ease-in`.

---

## 3. Genuine Limitations, Deferred Scope & Owner Review Checklist
- **Known Limitations:** Real-browser QA ran via deterministic in-memory mock proxy (`0` live Gemini/Deepgram quota spent); OS `prefers-reduced-motion: reduce` could not be toggled dynamically inside the sandboxed browser (`prefers-reduced-motion: reduce` + `[data-reduced-motion="true"]` CSS rules and static rendering were verified statically via `test:experience` Check #23-27).
- **Deferred Scope:** **`WP-013`** (Lucky: bespoke two-cat + one-comfy Kuromate artwork, final typography/OKLCH palette, chart art direction inside `data-kuro-slot` seams); **`WP-016`** (JR: `404`/`500` error boundaries, failure/network hardening, security headers inside `data-kuro-recovery-slot` seams); **`WP-018`** (pre-generated offline backups in Screen 5).
- **Owner Review Checklist (PR #10 Preview):** Confirm `360×800` / `390×844` full-viewport vertical framing, advancing 1–2 line subtitle cues (Sample & live), Maya/Leo side anchoring on `visual-explanation`, accessible `Transcript` drawer, `1280×800` desktop theater side rail, and clean `WP-013`/`WP-016` seam preservation.
