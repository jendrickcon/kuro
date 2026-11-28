# WP-012.5 — 9:16 Portrait Podcast Player Specification

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Baseline:** `origin/main` `fe21cf1` · **Refinement:** Immersive 3D-layered Portrait Player, Synchronized 1–2 Line Subtitles, Names-Only Cast Labels & Camera-Seat Separation (`[Verified]`)

---

## 1. Immersive Mobile Frame, Desktop Theater & Safe Zones (`[Verified]`)

`Screen 4` (`#player`) adapts cleanly between an edge-to-edge vertical mobile broadcast player and a centered desktop theater workspace:

```text
┌─────────────────────────────────────┐
│ TOP OVERLAY HUD (inside frame)      │
│ [←]  Title… [Sample]  03/09 [Tx][⋯] │
├─────────────────────────────────────┤
│ DEPTH PLANE 1–2 (~35%): STUDIO +    │
│ • Ambient light / EQ bars on "none" │
│ • 3D visual card when cue active    │
├─────────────────────────────────────┤
│ DEPTH PLANE 3 (~35%): KUROMATE STAGE│
│ • GPU transform camera anchors      │
│ • Floating names only (Maya/Leo/Sam)│
│ • Curved 3D broadcast desk rim      │
├─────────────────────────────────────┤
│ DEPTH PLANE 4 (~20%): SUBS + DOCK   │
│ • Conditional recovery overlay      │
│ • 1–2 line live subtitle overlay    │
│ • MM:SS / MM:SS scrubber            │
│ • [Prev] [Play/Pause] [Next] [↻]    │
└─────────────────────────────────────┘
```

### Responsive Layout & Navigation Rules (`[Verified]`)
- **Mobile Immersive Mode (`< 768px`):** `AppNavigation` top header (`hidden md:block` via `shouldHideMobileAppHeader("player")`) and mobile bottom navigation bar (`shouldShowMobileBottomNav("player") === false`) both hide during playback. `.kuro-portrait-frame` fills `height: 100dvh; width: min(100vw, 430px)` respecting `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` with zero page scroll down to `320×640` and `260×563` (`390×844 @ 150%`).
- **Top Overlay HUD & Accessible Drawer / Overflow Menu:** Back (`←`), single-line truncated title, tiny `Sample` pill (Sample Preview only), compact turn counter, `Transcript` drawer button (`lg:hidden`), and `⋯` actions menu (`Download Audio (.wav)`, `Download transcript (.txt)`, `Session episodes`, `Create another episode`) sit cleanly inside the top frame scrim. `TranscriptDrawer` (`role="dialog"`, `aria-modal="true"`) moves focus on open, traps Tab, dismisses on `Escape`/backdrop, restores focus to its trigger, and enables clickable compiled turn jumps.
- **Desktop Theater (`>= 1024px` / `lg:`):** `AppNavigation` stays visible alongside `lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]` (`h-[min(86dvh,780px)]`). Episode Overview, `PlayerNotice`, clickable names-only Turn Transcript, `.wav` / `.txt` exports, and session links live strictly in the right companion rail without duplicating below the video.

---

## 2. Stable Studio Seats vs. Independent Editorial Camera Anchors (`[Verified]`)

`selectEditorialShot` separates each host's physical seat identity from transient camera framing and **never** transfers `audioOwnerHostId` away from `activeSegment.speakerId`:

- **Stable Studio Seat (`data-studio-seat`):** Derived strictly from `episode.hosts.findIndex((h) => h.id === host.id)` (2 hosts: `0 -> left`, `1 -> right`; 3 hosts: `0 -> left`, `1 -> center`, `2 -> right`) — never recomputed from filtered visible hosts.
- **Camera Anchors (`data-camera-anchor`, animated via GPU `translate3d`/`scale3d`/`rotateY`):**
  - `speaker-closeup`: Active speaker centered (`closeup-center`) at heroic broadcast bust scale (`~65%` portrait width on `360×800`).
  - `reaction-shot`: Listening/reacting host alongside active speaker (`two-shot-left`/`two-shot-right`) or centered (`reaction-center`), with `data-audio-owner="false"` on listeners.
  - `two-shot`: Previous + active host in preserved cast order (`two-shot-left`, `two-shot-right`) with `+6%` active-speaker boost.
  - `wide-shot`: Opening turn, final turn, playback complete, or boundary standby (`wide-left`, `wide-center`, `wide-right`), sizing 3-host panels cleanly with `0` horizontal overflow down to `320px` and `260px` (`390×844 @ 150%`).
  - `visual-explanation`: Upper contextual card (`comparison`, `timeline`, `process`, `fact-card`, centered via `data-visual-side="center"`) paired with the speaker center-docked beneath the card (`visual-center`) while `data-studio-seat` stays pinned per cast member (`Maya=left`, `Leo=right`, `Sam=center`).
- **Decoupled Figure Scaling, Angled Broadcast Mics & Native 1× Names-Only Labels (`[Verified]`):** Permanent `.kuro-nameplate-row` cards, debug shot badges, and rendered role labels (`Explainer`, `Learner`, `Skeptic`, `Idle`, `Listening`, `Captioning`) are omitted from active playback. `.kuromate-figure` scales cleanly via `scale3d` + `container-type: size` height/width safety clamps and renders angled seat-aware boom mics, while sibling `.kuromate-floating-label` (`Maya`, `Leo`, `Sam`) renders unscaled at `12px` along the curved desk top without descender clipping.

---

## 3. Synchronized 1–2 Line Subtitles & Conditional Recovery (`[Verified]`)

- **Deterministic Subtitle Segmentation ([subtitle-cues.ts](../../src/lib/experience/subtitle-cues.ts)):** Preserves exact wording and token order across every turn, prefers sentence/clause boundaries (`max 2` rendered lines), keeps short utterances as `1` cue, distributes duration proportionally over `0..durationMs`, and transitions smoothly (`180ms`).
- **Dual Timing Sources:** Hosted compiled WAV playback derives intra-segment offset from `snapshot.elapsedMs - timeline[i].speechStartMs` (`speechDurationMs`). Sample Preview pairs `useSampleSegmentClock` (`requestAnimationFrame` active only while `isSamplePreview && playbackStatus === "playing"`) with `getSegmentDurationMs(segment)` while leaving `episode-batch-compiler.ts` unmodified.
- **Conditional Recovery Overlay (`data-kuro-recovery-slot="player-boundary"`):** `AudioStatusBar` returns `null` during smooth playback and renders only on `isAutoplayBlocked`, `isBufferingAtBoundary` (`Preparing turns 5–8…`), `hasRetryableFailure`, `hasBlockingFailure`, or `isConfigBlocked`, preserving `NO AUDIO, NO ADVANCE`.
- **Dynamic Visual & Download Compliance:** `VisualCueSchema` `none` overlays ambient lighting + equalizer bars (`0px` flow height so close-ups/two-shots enjoy full studio headroom); active cues (`comparison`, `timeline`, `process`, `fact-card`) enter normal top-safe flow inside `clamp(96px, 22dvh, 204px)` (`max-height: 600px` compacts scroll body to `68px` while keeping top HUD buttons clear). `Download Audio (.wav)` enables only when `100%` of spoken turns stitch cleanly.
