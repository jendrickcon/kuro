# WP-012.5 — Implementation & Verification Handoff

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Starting `main` Hash:** `fe21cf1be3fb0359abefa5f75d4bfa78f67a6dec` (`fe21cf1`)
> **Implementation Branch:** `feat/wp-012-5-experience-architecture`

---

## 1. Implementation Summary (`Baseline` vs. `WP-012.5` vs. Deferred)
- **Previous Baseline (`:3055`, `fe21cf1`):** Opened directly onto a single-stack creation form with no Home screen, no top/bottom navigation, wide horizontal shared-desk player (`792×454` at `1280×800`), and no session retention (navigating back discarded the compiled episode immediately).
- **`WP-012.5` Implemented Architecture:**
  - **5-Screen Flow (`KuroAppShell`):** `Home` (`#home`, `"Welcome to Kuro"` + in-memory `"Hello, Jendrick!"` toggle + conditional `Continue listening` + `Try a sample episode`) -> `Create` (`#create`, preserved topic/notes, `10–2,500` char `tabular-nums` count, `Casual`/`Serious`, `Quick`/`Detailed`, `2`/`3` Kuromates) -> `Preparation` (`#prepare`, unified broadcast beats 1–5 + safe decorative `Skip intro` preserving `NO AUDIO, NO ADVANCE`) -> `Portrait Player` (`#player`, `max-w-[430px]` 9:16 mobile frame + desktop theater side rail, 5 deterministic camera shots, `4.5:1+` studio-paper captions, `MM:SS` scrubber, `.wav`/`.txt` exports) -> `Session Episodes` (`#episodes`, `MAX_SESSION_EPISODES = 5`, required non-persistence disclosure, `0`-call replay/`Continue`, `Remove` with exact-once Blob revocation, Sample + WP-018 backup slot).
  - **State & Memory Lifecycle:** `createSessionEpisodeStore` + `useSessionEpisodes` retain up to `5` compiled `EpisodeBatchCompilerController` instances across navigation, pausing cleanly on exit and disposing/revoking Blob URLs **exactly once** on eviction, `Remove`, `Cancel and edit`, or root unmount.
  - **Prohibited Boundaries Preserved:** Zero edits to `contracts/episode.schema.ts`, `src/app/api/**`, `src/lib/episode/gemini-*`, `src/lib/tts/*`, `package-lock.json`, `next.config.ts`, `AGENTS.md`, `SPEC.md`, `README.md`, `CONTRIBUTING.md`, `docs/contributing/**`, or `docs/wp-012/**`.

---

## 2. Design Baseline & Shot Selection
- **Fonts (`layout.tsx`):** `Bricolage_Grotesque`, `Onest`, and `JetBrains_Mono` (`display: "swap"`). See [DESIGN_TOKENS_BASELINE.md](./DESIGN_TOKENS_BASELINE.md).
- **Editorial Camera Shot Rules (`selectEditorialShot`):** Strictly derived from `EpisodeSchema` + `EpisodeBatchCompilerSnapshot`: `(1)` complete/boundary standby -> `wide-shot`; `(2)` `visualCue.type !== "none"` -> `visual-explanation`; `(3)` first/final segment -> `wide-shot`; `(4)` `reacting` emotion or distinct `reactionHostId` -> `reaction-shot` (`audioOwnerHostId` stays strictly on active speaker); `(5)` `curious` after different `previousHost` -> `two-shot`; `(6)` default -> `speaker-closeup`.

---

## 3. Automated & Real-Browser Verification Evidence
- **Automated Suites (`cmd /c` verification chain):** `npm run typecheck`, `npm run lint` (`0` warnings/errors), `npm run test:schema` (`11`), `npm run test:generation` (`33`), `npm run test:tts` (`68`), `npm run test:wav` (`21`), `npm run test:audio-queue` (`69`), `npm run test:experience` (`18` deterministic checks covering Section 11 items 1–27), `npm run build` (`27` `.next/static/` assets), and `git diff --check` all passed (`0` failures).
- **Real-Browser QA (`http://127.0.0.1:3061` deterministic mock proxy over `:3060` prod build):**
  - `0` horizontal overflow, `0` overlapping buttons, and `>= 44px` button height verified at **`320×640`**, **`390×844`**, **`430×932`**, **`768×1024`**, **`1280×800`**, **`1440×900`**, **`1280×800 @ 150% zoom`**, and **`390×844 @ 150% zoom`**.
  - Verified: Demo greeting toggle & reload reset; mobile bottom nav hidden inside Screen 4; Sample Preview (`0` `/api/tts` calls, `.wav` disabled, `.txt` enabled, all 9 shot turns); `502` script error & `Cancel and edit` input preservation; Quick 2-host compilation, WAV (`292,364 B`) & transcript (`1,448 B`) download, keyboard (`Space`/`ArrowLeft`/`ArrowRight`/`Tab`), zero-call Session `Continue`/`Play again` (`ttsCalls` stayed `18 -> 18`), Home `Continue listening` show/hide on `Remove`; Detailed 3-host Batch-1 `Start podcast`, boundary hold (`Preparing turns 5–8…`), and recovery unlock (`Download Audio (.wav)` enabled at `12/12`); `503` No-Key block (`Live voice generation is not configured`) with zero silent caption bypass; **`0` console or hydration errors**.
- **Security & Privacy Scans (`[Verified]`):** `0` secrets, `0` `deepgram`/`aura-2-`/vendor-header/model strings across `59` scanned files (`27` `.next/static/` + `32` client files), `0` `speechSynthesis`, `0` storage APIs (`localStorage.setItem`/`sessionStorage.setItem`/`indexedDB`/`caches.open`), `0` Canvas/WebGL/Three.js, `0` tracked audio/Python/skill files.

---

## 4. Genuine Limitations, Deferred Work & Owner Review Checklist
- **Known Limitations:** Live browser QA ran via deterministic in-memory mock proxy to avoid burning quota (`0` live Gemini/Deepgram calls during UI geometry pass); OS `prefers-reduced-motion: reduce` could not be toggled dynamically inside the sandboxed browser (`prefers-reduced-motion: reduce` + `[data-reduced-motion="true"]` CSS rules and static rendering were verified statically and via `test:experience` Check #25).
- **Deferred Scope:** **`WP-013`** (Lucky: bespoke two-cat + one-comfy Kuromate artwork, final typography/OKLCH palette, chart art direction into `data-kuro-slot` seams); **`WP-016`** (JR: `404`/`500` error boundaries, failure/network hardening, security headers inside `data-kuro-recovery-slot` seams); **`WP-018`** (pre-generated offline backups in Screen 5); persistent DB/Three.js post-MVP.
- **Owner Review Checklist (`https://kuro-enuhri.vercel.app` Preview after PR opens):**
  - Walk `Home -> Create -> Broadcast Preparation -> Portrait Player -> Episodes` on desktop and mobile (`390×844` / `320×640`).
  - Confirm `Continue listening`, `Sample Preview`, `Download Audio (.wav)`, `Remove`, and clear Lucky (`WP-013`) & JR (`WP-016`) seams.
