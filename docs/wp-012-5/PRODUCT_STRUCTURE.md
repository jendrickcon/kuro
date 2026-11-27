# WP-012.5 — Product Structure & Information Architecture

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick — Project Owner & Integration Lead)*
> **Baseline:** `origin/main` `fe21cf1` (`WP-012` + roadmap sync merged; implemented on `feat/wp-012-5-experience-architecture`) `[Verified]`
> **Evidence Key:** `[Verified]` current repo/code/contract · `[Proposed]` `WP-012.5` design target · `[Owner decision required]` explicit owner lock/confirmation

---

## 1. Purpose & Design Quality Bar (`[Proposed]`)

`WP-012.5` replaces Kuro's single-stack skeleton feel (`kuro-skeleton.tsx`) with the complete **5-screen product experience architecture** and working Next.js workflow **before** Lucky begins `WP-013` visual/character redesign and JR begins `WP-016` reliability/recovery hardening.

- **Not a throwaway grey wireframe (`[Proposed]`):** `WP-012.5` builds a complete, cohesive, responsive application guided by the approved external UI/motion skills (`better-design`, `make-interfaces-feel-better`, `frontend-design-deslop`, `motion-director`, `site-motion-excellence-director`, `web-motion-auditor`) while leaving clean component/token slots for Lucky's `WP-013` bespoke art direction and original two-cat + one-comfy Kuromate illustrations.
- **Rendering constraint (`[Verified]`):** Uses **layered 2.5D HTML/CSS + SVG** ONLY. Does **not** waive [SPEC.md](../../SPEC.md) Section 4's Canvas/WebGL exclusion; Three.js remains deferred to an optional late/post-MVP spike.

---

## 2. Site Map & 5-Screen Sequence (`[Proposed]`)

Kuro runs on `/` as one cohesive client-orchestrated application (preserving clean URL/navigation state without fragmenting in-memory session audio across full page reloads, since compiled `.wav` Blob URLs live strictly in browser memory `[Verified]`):

```text
Kuro App (/)
├── Screen 1: Home (/)
│   ├── Primary CTA ──> Screen 2: Podcast Generator
│   ├── Secondary CTA -> Screen 5: Episodes from this Session
│   ├── Conditional ──> Screen 4: 9:16 Portrait Player (Continue listening, when session episode exists)
│   └── Demo CTA ─────> Screen 4: 9:16 Portrait Player (Sample Preview, zero live TTS calls)
│
├── Screen 2: Podcast Generator
│   ├── Submit ───────> Screen 3: Unified Broadcast Preparation
│   └── Secondary CTA -> Screen 4: 9:16 Portrait Player (Sample Preview)
│
├── Screen 3: Unified Broadcast Preparation
│   ├── Quick Ready (100% WAV valid) / Detailed Batch 1 Ready (4/4 valid) ──> Screen 4: 9:16 Portrait Player
│   ├── Live Failure / 503 No-Key Recovery (Retry / Retry failed turn) ───> Screen 3 Recovery State
│   └── Cancel & Edit (preserves user text & selections) ──────────────────> Screen 2: Podcast Generator
│
├── Screen 4: 9:16 Portrait Podcast Player
│   ├── Top ~38%: Contextual visualization layer (behind/above speaker)
│   ├── Middle ~38%: Active Kuromate speaker & editorial camera cuts
│   ├── Bottom ~24%: Captions, MM:SS scrubber, transport, .wav & .txt downloads
│   ├── Create New / Back -> Screen 2 or Screen 1
│   └── Session Library ──> Screen 5: Episodes from this Session
│
└── Screen 5: Episodes from this Session
    ├── Play again ───> Screen 4: 9:16 Portrait Player (reuses in-memory audio, 0 extra TTS calls)
    ├── Sample / Backup -> Screen 4: 9:16 Portrait Player (Sample Preview / future WP-018)
    ├── Download .wav / .txt
    └── Create another -> Screen 2: Podcast Generator
```

---

## 3. Navigation Architecture (`[Proposed]`)

Keep primary navigation minimal and free of placeholder sections (no Accounts, Settings, Notifications, or Cloud Sync — all excluded in [SPEC.md](../../SPEC.md) Section 4 `[Verified]`):

| Surface | Placement | Items (Max 3 Destinations) | Behavior Rules |
| --- | --- | --- | --- |
| **Desktop (`>= 768px`)** | Compact sticky top bar (`56px` height) | `Kuro` *(wordmark -> Home)* · `Create` *(-> Generator)* · `Episodes` *(-> Session Episodes, with optional active-session count badge)* | Clean single-row header; collapses gracefully during active Screen 3 preparation/Screen 4 playback with a clear exit/back affordance so the studio remains unobstructed. |
| **Mobile (`< 768px`)** | Compact bottom tab bar (`min-h-14`, safe-area padded, `>= 44×44px` tap targets) | `Home` · `Create` · `Episodes` | Always reachable during Home, Generator, and Session Episodes; during Screen 4 portrait playback on `320px–430px`, hide or minimize global nav so `9:16` player controls own the thumb zone without double-stacking bars. |

- **State preservation rule:** Switching between `Home`, `Create`, and `Episodes` stays client-side so in-memory `EpisodeBatchCompiler` Blob URLs and active user draft text are never destroyed by an accidental page reload.
- **Navigation guard during generation:** If compilation is active in Screen 3 and the user selects a nav tab, confirm or treat it identically to explicit cancellation (abort active requests, keep form text intact) or keep nav disabled/secondary behind `Cancel and edit` so silent background requests never leak.

---

## 4. First-Page Hierarchy (Screen 1 — Home) (`[Proposed]`)

Screen 1 replaces jumping straight into a cold textarea with a calm, legible studio entry point built for a commuting college student on mobile first:

1. **Greeting & Prompt:**
   - **Default honest MVP copy:**
     - Headline: `Welcome to Kuro`
     - Subheading: `Ready to create a new episode?`
     - Supporting line (`1` short sentence): `Turn a tough topic or pasted class reading into a multi-host conversation with synchronized visuals and audio.`
   - **Demo / Configurable Greeting (`[Proposed]`):** Supports an in-memory/config toggle or prop to display `Hello, Jendrick!` for recorded demos. Must **NOT** imply real accounts, login, or server profiles, and must **NOT** call `localStorage.setItem` in `src/` (which fails `scripts/test-audio-queue.mjs` Check #45 `[Verified]`).
2. **Primary Action Hierarchy (`1` primary, clear secondary paths):**
   - **Primary CTA:** `Create a new episode` → opens **Screen 2 (Podcast Generator)**.
   - **Secondary CTA:** `Episodes from this session` → opens **Screen 5 (Episodes from this Session)**.
   - **Conditional Resume Card (`Continue listening`):** Rendered **only** when at least one generated or paused episode exists in current-session memory; shows episode title, Kuromate count (`2` or `3`), audio readiness, and `Continue listening` button jumping directly back into **Screen 4**.
   - **Guaranteed Demo Strip (`Try a sample episode`):** Compact card/button clearly labeled `Sample preview (no live keys needed)` opening **Screen 4** immediately with `source === "sample"` and `0` `/api/tts` requests `[Verified]`.

---

## 5. Responsive Desktop vs. Mobile Behavior (`[Proposed]`)

| Breakpoint | Target Devices | Layout Strategy | Verification Targets |
| --- | --- | --- | --- |
| **Compact Mobile (`320px–430px`)** | Commuting phone (`320×640`, `360×800`, `390×844`) | Full-bleed vertical rhythm; `9:16` player fills viewport cleanly (`max-w-[430px]` centered, `0` horizontal overflow); bottom nav (`Home \| Create \| Episodes`) on browse screens; `>= 44×44px` controls in thumb zone. | `320×640`, `390×844` |
| **Tablet (`768px–1023px`)** | Portrait/landscape tablet (`768×1024`) | Centered comfortable content column (`max-w-2xl` on Home/Create/Episodes); centered `9:16` portrait theater frame on Screen 4 with generous breathing room. | `768×1024` |
| **Desktop Theater (`1024px–1440px+`)** | Laptop/desktop (`1280×800`, `1440×900`) | Top nav bar; Home & Generator centered with studio-inspired asymmetry (`max-w-5xl`); **Screen 4** presents the **`9:16` Portrait Studio Stage (`max-w-[420px]`, `aspect-[9/16]` or bounded viewport height)** centered inside a dark theater backdrop alongside an optional collapsible/side desktop rail for episode info, compiled turn timeline / interactive transcript jump, and `.wav` / `.txt` download actions. | `1280×800`, `1440×900`, `150%` browser zoom |

- **No-shrink invariant:** Desktop does **not** stretch the portrait stage into wide 16:9 television boxes, and mobile does **not** squeeze desktop multi-column cards; each breakpoint uses intentional geometry while keeping the **9:16 portrait stage** as the shared creative centerpiece across every device.
