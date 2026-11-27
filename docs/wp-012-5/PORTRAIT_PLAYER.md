# WP-012.5 — 9:16 Portrait Podcast Player Specification

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Baseline:** `origin/main` `fe21cf1` (`WP-012` + roadmap sync merged; deterministic `selectEditorialShot` implemented) `[Verified]`

---

## 1. 9:16 Portrait Frame & Safe Zones (`[Proposed]`)

Kuro shifts from a wide multi-box desk to a **mobile-first `9:16` portrait studio player** optimized for commuting college students on phones, desktop theater viewing, and vertical screen recording.

```text
┌─────────────────────────────────────┐
│ TOP HEADER (compact strip)          │
│ [← / Episodes]   ON AIR   04 / 12   │
├─────────────────────────────────────┤
│ TOP ~38%: CONTEXTUAL VISUAL ZONE    │
│ • VisualCue active -> Chart/Card    │
│ • VisualCue "none" -> Topic motif   │
│   & studio lighting depth           │
├─────────────────────────────────────┤
│ MIDDLE ~38%: EDITORIAL KUROMATE     │
│ • 1 of 5 deterministic camera shots │
│ • Active speaker focus (Close-Up /  │
│   Reaction / Two-Shot / Wide /      │
│   Visual-Explanation shift)         │
│ • 2.5D CSS depth + mic cue          │
├─────────────────────────────────────┤
│ BOTTOM ~24%: CAPTIONS & CONTROLS    │
│ • Active speaker pill + caption     │
│ • MM:SS ──────●────── MM:SS scrub   │
│ • [Prev] [Play/Pause] [Next] [↻]    │
│ • [Download .wav] [Download .txt]   │
└─────────────────────────────────────┘
```

### Safe-Zone Rules (`[Proposed]`)
- **No overlapping collisions:** Contextual visuals NEVER cover the active Kuromate's face/upper torso or drop into the bottom caption zone; captions NEVER cover the playback transport controls.
- **Mobile (`320px–430px`):** `9:16` stage sits comfortably within viewport width (`max-w-[420px]`, `0` horizontal scroll, caption + controls stay legible down to `320×640`).
- **Desktop (`1024px–1440px+`):** Portrait stage (`aspect-[9/16]` constrained gracefully to viewport height `min(82vh, 760px)`) sits centered inside a focused studio theater layout, paired optionally with a clean desktop side column showing Episode Title, Topic summary, Turn-Jump Transcript list, and `.wav` / `.txt` download buttons (keeping the primary portrait stage pure and unobstructed).

---

## 2. Deterministic Editorial Camera Shot Grammar (`[Proposed]`)

Instead of keeping all `2` or `3` Kuromates equally sized in fixed seats on every turn, `Screen 4` runs an **editorial camera projection** derived deterministically from `WP-012`'s compiled timeline (`activeSegmentIndex`, `activeHost`, `activeSegment.emotion`, `activeSegment.visualCue`, `playbackStatus`, and `episode.hosts[]` `[Verified]`):

| Shot Type | Deterministic Trigger (`selectEditorialShot`) | Visual Composition (Layered 2.5D CSS + SVG) | Reduced-Motion Equivalent |
| --- | --- | --- | --- |
| **1. Current-Speaker Close-Up** *(Default)* | Mid-episode turn (`emotion` `"neutral"`/`"explaining"`, `visualCue.type === "none"`, not boundary/complete) | Active speaker (`audioOwnerHostId`) framed centered (`sizeVariant="closeup"`), active mic LED on owner only. | Static centered speaker frame (`scale` transition disabled). |
| **2. Reaction Shot** | `activeSegment.emotion === "reacting"` OR (`reactionHostId !== null && reactionHostId !== activeSegment.speakerId`) | Frames reacting host beside active speaker when distinct (`isAudioOwner` stays strictly `false` on listener so non-speaking host never claims audio). | Static reaction posture badge (`Reacting`), zero sweep. |
| **3. Two-Shot** | `activeSegment.emotion === "curious"` AND `previousHost` exists AND `previousHost.id !== activeSegment.speakerId` | Frames `[previousHost, activeHost]` in original left-to-right cast order (`sizeVariant="standard"`). | Static side-by-side two-host framing. |
| **4. Wide Opening / Transition / Closing Shot** | `playbackStatus === "complete"` OR `isBufferingAtBoundary` OR `activeSegmentIndex === 0` OR final segment (`segments.length - 1`) | Full dynamic cast (`2` or `3` `hosts[]`) shown together over shared curved desk with role nameplates. | Static full-cast framing (`2` or `3` hosts). |
| **5. Visual-Explanation Shot** | `activeSegment.visualCue.type !== "none"` (`comparison`, `timeline`, `process`, or `fact-card`) | Upper `ContextualMonitor` receives `priority="visual"` while active speaker docks lower-right (`sizeVariant="docked"`). | Contextual card emphasized cleanly above docked speaker. |

- **Audio boundary integrity:** When `isBufferingAtBoundary === true` (Detailed episode waiting on Batch `k+1`), `isSpeaking` is strictly `false` `[Verified]` — Kuromates settle into calm resting posture (`Preparing turns 5–8…`) with zero false speaking animation.

---

## 3. Contextual Visuals Layer (`[Proposed]` & `[Verified]`)

Supports all 5 strict `VisualCueSchema` types from `contracts/episode.schema.ts` `[Verified]` rendered in crisp **semantic HTML + inline SVG** (meeting WCAG 2.2 AA `4.5:1` contrast over studio surfaces, never Canvas/image generation):
- **`comparison`:** Dual-card contrast layout above/behind speaker (`title`, `left.label/value`, `right.label/value`).
- **`timeline`:** Horizontal/vertical sequenced node rail (`2–4` points) highlighting progression across the top zone.
- **`process`:** Compact vertical/stepped flow cards (`3–5` steps) with crisp step indices (`tabular-nums`).
- **`fact-card`:** Bold hero figure/term (`value`, `tabular-nums`) with concise explanation callout.
- **`none` (Standby):** Ambient topic-derived studio badge/title light bar (never an ugly blank grey box, and never noisy decorative clutter).

---

## 4. Captions, Transport Controls, Scrubber & Downloads (`[Proposed]` & `[Verified]`)

1. **Synchronized Captions (Bottom Safe Zone):**
   - Displays active Kuromate pill (accent color + non-color role/name text — never color alone) + crisp `text-wrap: pretty` caption line (`<= 320` chars `[Verified]`) + optional subtle previous-line context on taller viewports.
   - Explicit **`Sample Preview`** badge when `source === "sample"`; honest **`Preparing turns X–Y…`** status banner when Detailed batch boundary is buffering (`NO AUDIO, NO ADVANCE`).
2. **Timeline Scrubber & Clock:**
   - Displays `MM:SS / MM:SS` in strict `tabular-nums` (`make-interfaces-feel-better` `[Verified]`).
   - Accessible `<input type="range">` scrubber (`aria-label`, keyboard Left/Right seek) bounded strictly by `playableRangeMs` (full duration immediately on Quick; expanding dynamically as Detailed batches finish; disabled cleanly in Sample Preview timed mode `[Verified]`).
3. **Transport & Exports (`>= 44×44px` tap targets, `active:scale-[0.96]`):**
   - `Prev` · `Play / Pause / Replay` (optically centered triangle/pause icon) · `Next` · `Restart`.
   - **`Download Audio (.wav)`:** Enabled ONLY when `canDownloadAudio === true` (`100%` of spoken turns compiled & stitched into `fullWavBlob`, disabled with clear tooltip/label during Detailed background compile and on `Sample Preview` `[Verified]`).
   - **`Download Transcript (.txt)`:** Always enabled inside player (`downloadEpisodeTranscript` `[Verified]`).
4. **Dynamic 2 vs. 3 Kuromate Support (`hosts[]` `[Verified]`):**
   - Every shot, nameplate, accent dot, and caption pill iterates dynamically over `episode.hosts[]` — supporting `2` or `3` hosts equally without hard-coded `hostA`/`hostB` logic.
