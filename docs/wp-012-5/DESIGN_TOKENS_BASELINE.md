# WP-012.5 — Baseline Design Tokens & Studio Geometry

> **Status:** `WP-012.5 Baseline` *(Provisional structural design tokens — **NOT** Lucky’s final `WP-013` art direction or typography lock)*
> **Baseline:** `origin/main` `fe21cf1` · **Implemented in:** [layout.tsx](../../src/app/layout.tsx), [globals.css](../../src/app/globals.css)

---

## 1. Typography (`next/font/google`)

Verified supported in Next.js `16.4.6` (`subsets: ["latin"]`, `display: "swap"`):

| Role | CSS Variable | Google Font | Usage |
| --- | --- | --- | --- |
| **Display** | `--font-display` | `Bricolage_Grotesque` | Headings (`h1–h3`, `.font-display`), `text-wrap: balance` |
| **Body / UI** | `--font-sans` (`--font-body`) | `Onest` | Labels, forms, captions (`text-wrap: pretty`), descriptions |
| **Mono / Timing** | `--font-mono` | `JetBrains_Mono` | Clocks (`MM:SS / MM:SS`), turn counters, character count (`tabular-nums`) |

---

## 2. OKLCH Color System (Warm Broadcast Studio)

### Studio-Paper Light Surfaces
| Token | OKLCH Value | Purpose |
| --- | --- | --- |
| `--kuro-bg` | `oklch(0.974 0.009 78)` | App warm paper background |
| `--kuro-surface` | `oklch(0.996 0.004 78)` | Cards, generator form, caption & transport dock |
| `--kuro-surface-muted` | `oklch(0.946 0.012 75)` | Secondary bands, status bar, nav hover fills |
| `--kuro-ink` | `oklch(0.205 0.018 52)` | Primary copy & headings (`>= 12:1` on surface) |
| `--kuro-ink-muted` | `oklch(0.45 0.017 56)` | Supporting copy (`>= 4.5:1` on surface) |
| `--kuro-border` | `oklch(0.868 0.014 72)` | Structural card dividers |
| `--kuro-border-strong` | `oklch(0.69 0.018 65)` | Interactive button/input borders (`>= 3:1` UI boundary) |

### Dark Broadcast Stage & Semantic Accents
| Token | OKLCH Value | Purpose |
| --- | --- | --- |
| `--kuro-studio-bg` | `oklch(0.185 0.018 50)` | Portrait player backdrop & dark active pills |
| `--kuro-studio-surface` | `oklch(0.235 0.02 52)` | Broadcast prep panel & monitor bezel |
| `--kuro-studio-surface-hi` | `oklch(0.29 0.021 54)` | Desk surface rim gradient stop |
| `--kuro-studio-ink` | `oklch(0.962 0.008 75)` | High-contrast stage foreground text |
| `--kuro-studio-ink-muted` | `oklch(0.785 0.015 70)` | Secondary stage labels |
| `--kuro-studio-border` | `oklch(0.38 0.018 56)` | Stage borders & chip dividers |
| `--kuro-accent` | `oklch(0.505 0.168 33)` | Primary CTA terracotta-vermilion (`>= 5:1` with white text) |
| `--kuro-accent-hover` | `oklch(0.435 0.168 33)` | Primary button hover fill |
| `--kuro-accent-soft` | `oklch(0.948 0.028 40)` | Active step / turn highlight tint |
| `--kuro-accent-ink` | `oklch(0.365 0.132 33)` | Dark ink paired with `--kuro-accent-soft` |
| `--kuro-on-air` | `oklch(0.545 0.202 27)` | Active `ON AIR` broadcast badge |
| `--kuro-ready-*` / `--kuro-warn-*` / `--kuro-danger-*` | Semantic green / amber / red pairs | Session readiness, Sample/boundary notices, recoverable errors |
| `--kuro-focus-ring` | `oklch(0.51 0.17 33)` | `2.5px` visible keyboard `:focus-visible` outline (`2px` offset) |

---

## 3. Radii, Elevation, Targets & Motion

- **Concentric Radii:** `--kuro-radius-sm: 8px`, `--kuro-radius-md: 12px`, `--kuro-radius-lg: 16px`, `--kuro-radius-xl: 20px`.
- **Elevation:** Structural `1px` `--kuro-border` combined with restrained `box-shadow` (`0 1px 2px ...` on `.kuro-card`, deeper studio theater drop shadow on `.kuro-portrait-frame`).
- **Interactive Hit Areas:** Minimum `44×44px` (`min-h-11` / `min-h-12`) across buttons, segmented selectors, nav tabs, and timeline slider, with tactile `scale(0.96)` press feedback on `.kuro-interactive:active:not(:disabled)`.
- **Motion Tokens (Zero `transition: all`, Zero `ease-in`):**
  - Durations: `--kuro-duration-press: 90ms`, `--kuro-duration-fast: 160ms`, `--kuro-duration-base: 240ms`, `--kuro-duration-shot: 280ms`, `--kuro-duration-beat: 420ms`.
  - Easing: `--kuro-ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--kuro-ease-settle: cubic-bezier(0.2, 0, 0, 1)`.
  - **Reduced motion:** Full `@media (prefers-reduced-motion: reduce)` and `[data-reduced-motion="true"]` rules disable entrance sweeps/ambient loops while retaining static active-speaker posture and state badges.

---

## 4. Breakpoints, Portrait Safe Zones & Extension Boundaries

- **Breakpoints:** Compact Mobile `320px–430px` -> Tablet `768px` -> Desktop Theater `1024px+` (`1160px` container cap; side-by-side `minmax(0,430px) minmax(0,1fr)` on `lg`).
- **9:16 Portrait Safe Zones (`.kuro-portrait-frame`, `max-width: 430px`):**
  - **Top (~38% guidance):** `.kuro-stage-visual-zone` (`ContextualMonitor`) rendered in flow layout above hosts.
  - **Middle (~38% guidance):** `.kuro-stage-hosts-zone` (editorial Kuromate shot + shared curved desk & role nameplates).
  - **Bottom (~24% guidance):** `CaptionPanel` + `AudioStatusBar` + `PlaybackControls` (scrubber, 4 transport actions, `.wav` & `.txt` downloads) stacked cleanly with zero clipping down to `320×640` and `150%` zoom.
- **WP-013 & WP-016 Seam Attributes (do not break in downstream packages):**
  - **WP-013 Visual/Character Replacement:** `[data-kuro-slot="cast-preview"]`, `[data-kuro-slot="kuromate-renderer"]` (honoring `data-audio-owner`, `data-state`, `data-size-variant`, `data-role`), `[data-kuro-slot="contextual-visual"]`.
  - **WP-016 Reliability/Recovery Placement:** `[data-kuro-recovery-slot="form-error"]`, `[data-kuro-recovery-slot="preparation"]`, `[data-kuro-recovery-slot="player-boundary"]`.
