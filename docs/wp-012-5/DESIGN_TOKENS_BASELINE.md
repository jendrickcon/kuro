# WP-012.5 — Baseline Design Tokens & Studio Geometry

> **Status:** `WP-012.5 Baseline` *(Provisional structural design tokens — **NOT** Lucky’s final `WP-013` art direction or typography lock)*
> **Baseline:** `origin/main` `fe21cf1` · **Implemented in:** [layout.tsx](../../src/app/layout.tsx), [globals.css](../../src/app/globals.css)

---

## 1. Typography (`next/font/google`)

Wrapped cleanly inside `@layer base` in [globals.css](../../src/app/globals.css) so Tailwind `@layer utilities` classes such as `.truncate` (`white-space: nowrap`) always take precedence on single-line player headers:

| Role | CSS Variable | Google Font | Usage |
| --- | --- | --- | --- |
| **Display** | `--font-display` | `Bricolage_Grotesque` | Headings (`h1–h3`, `.font-display`), `text-wrap: balance` |
| **Body / UI** | `--font-sans` (`--font-body`) | `Onest` | Labels, forms, captions (`text-wrap: pretty`), synchronized subtitles |
| **Mono / Timing** | `--font-mono` | `JetBrains_Mono` | Clocks (`MM:SS / MM:SS`), turn counters, character count (`tabular-nums`) |

---

## 2. OKLCH Color System (Warm Broadcast Studio)

### Studio-Paper Light Surfaces
| Token | OKLCH Value | Purpose |
| --- | --- | --- |
| `--kuro-bg` | `oklch(0.974 0.009 78)` | App warm paper background |
| `--kuro-surface` | `oklch(0.996 0.004 78)` | Cards, generator form, transcript drawer & desktop rail |
| `--kuro-surface-muted` | `oklch(0.946 0.012 75)` | Secondary bands & nav hover fills |
| `--kuro-ink` | `oklch(0.205 0.018 52)` | Primary copy & headings (`>= 12:1` on surface) |
| `--kuro-ink-muted` | `oklch(0.45 0.017 56)` | Supporting copy (`>= 4.5:1` on surface) |
| `--kuro-border` | `oklch(0.868 0.014 72)` | Structural card dividers |
| `--kuro-border-strong` | `oklch(0.69 0.018 65)` | Interactive button/input borders (`>= 3:1` UI boundary) |

### Dark Broadcast Stage & Semantic Accents
| Token | OKLCH Value | Purpose |
| --- | --- | --- |
| `--kuro-studio-bg` | `oklch(0.185 0.018 50)` | Portrait player backdrop & immersive mobile shell fill |
| `--kuro-studio-surface` | `oklch(0.235 0.02 52)` | Broadcast prep panel & 3D visual bezel |
| `--kuro-studio-surface-hi` | `oklch(0.29 0.021 54)` | Desk surface rim gradient stop |
| `--kuro-studio-ink` | `oklch(0.962 0.008 75)` | High-contrast stage & subtitle text |
| `--kuro-studio-ink-muted` | `oklch(0.785 0.015 70)` | Secondary stage labels |
| `--kuro-studio-border` | `oklch(0.38 0.018 56)` | Stage borders & chip dividers |
| `--kuro-accent` | `oklch(0.505 0.168 33)` | Primary CTA terracotta-vermilion (`>= 5:1` with white text) |
| `--kuro-accent-hover` | `oklch(0.435 0.168 33)` | Primary button hover fill |
| `--kuro-accent-soft` | `oklch(0.948 0.028 40)` | Active step / turn highlight tint |
| `--kuro-accent-ink` | `oklch(0.365 0.132 33)` | Dark ink paired with `--kuro-accent-soft` |
| `--kuro-on-air` | `oklch(0.545 0.202 27)` | Recording/live signal accent |
| `--kuro-ready-*` / `--kuro-warn-*` / `--kuro-danger-*` | Semantic green / amber / red pairs | Session readiness, Sample/boundary notices, recoverable errors |
| `--kuro-focus-ring` | `oklch(0.51 0.17 33)` | `2.5px` visible keyboard `:focus-visible` outline (`2px` offset) |

---

## 3. Radii, 4-Plane 3D Studio CSS, Targets & Motion

- **Concentric Radii:** `--kuro-radius-sm: 8px`, `--kuro-radius-md: 12px`, `--kuro-radius-lg: 16px`, `--kuro-radius-xl: 20px`.
- **Interactive Hit Areas:** Minimum `44×44px` (`min-h-11` / `min-h-12`) across buttons, segmented selectors, nav tabs, drawer triggers, overflow items, and timeline slider, with tactile `scale(0.96)` press feedback on `.kuro-interactive:active:not(:disabled)`.
- **Pure CSS 3D Depth Stack (Zero WebGL / Image Assets):**
  - `.kuro-studio-stage` sets `perspective: 900px` and `--active-host-accent`; `.kuro-stage-architecture` (`transform-style: preserve-3d`) composes overhead speaker-tracking spotlight cone (`.kuro-stage-keylight`), angled acoustic panels (`.kuro-studio-slats` at `rotateY(±16deg)`), and floor perspective grid (`.kuro-stage-horizon` at `rotateX(62deg)`).
  - `.kuro-stage-hosts-stage` (`container-type: inline-size`) animates Kuromates strictly via GPU-composited `transform: translate3d(...) scale(...) rotateY(...)` (`360ms var(--kuro-ease-out)`) from CSS custom properties per `data-camera-anchor`, with `@media (max-height: 600px)` scaling (`0.68`) preventing card/character collisions under `150%` desktop zoom.
  - **Procedural Mascot Splash Bust (`data-kuro-slot="kuro-mascot"`, [kuro-mascot-ident.tsx](../../src/components/kuro/kuro-mascot-ident.tsx)):** Pure inline SVG + CSS `perspective: 900px` staggered ident (`2.22s` total, `300ms` fade exit): warm golden halo (`#F5BE58`), short broad silver-blue microphone grille with cyan sweep, deep navy headband (`#111C38`) with subtle cat points and cobalt earcups (`#1E4ED8` + cream `#F4E7CE`), matching cyan eyes (`#38E8FF`), smiling waveform mouth, and tiny coral controls (`#F06449`). Reduced motion disables all motion and renders the completed static mascot immediately.
- **Motion Tokens (Zero `transition: all`, Zero `ease-in`, Zero `opacity: 0` cut blank frames):**
  - Durations: `--kuro-duration-press: 90ms`, `--kuro-duration-fast: 160ms`, `--kuro-duration-base: 240ms`, `--kuro-duration-shot: 280ms`, `--kuro-duration-beat: 420ms`, plus `180ms` subtitle cue reveal (`0.78 -> 1` opacity).
  - Easing: `--kuro-ease-out: cubic-bezier(0.22, 1, 0.36, 1)`, `--kuro-ease-settle: cubic-bezier(0.2, 0, 0, 1)`.
  - **Reduced motion:** Full `@media (prefers-reduced-motion: reduce)` and `[data-reduced-motion="true"]` rules disable ambient loops, subtitle/drawer entrance shifts, and 3D camera glides while preserving static posture and state cues.

---

## 4. Breakpoints, Portrait Containment & Extension Boundaries

- **Breakpoints:** Compact Mobile `260px–430px` (`100dvh` edge-to-edge player on `< 768px`) -> Tablet `768px` (`430px × min(86dvh, 780px)` centered frame) -> Desktop Theater `1024px+` (`lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]` with side rail).
- **WP-013 & WP-016 Seam Attributes (do not break in downstream packages):**
  - **WP-013 Visual/Character Replacement:** `[data-kuro-slot="cast-preview"]`, `[data-kuro-slot="kuromate-renderer"]` (exposing `data-host-id`, `data-kuromate-identity`, `data-studio-seat`, `data-camera-anchor`, `data-audio-owner`, `data-state`, `data-size-variant`, `data-role`), `[data-kuro-slot="contextual-visual"]`.
  - **WP-016 Reliability/Recovery Placement:** `[data-kuro-recovery-slot="form-error"]`, `[data-kuro-recovery-slot="preparation"]`, `[data-kuro-recovery-slot="player-boundary"]`.
