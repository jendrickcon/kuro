# WP-012.5 — Broadcast-Style Unified Preparation Sequence

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Baseline:** `origin/main` `fe21cf1` (`WP-012` + roadmap sync merged; additive `broadcastBeat*` + `resolvePreparationDisplayState`) `[Verified]`

---

## 1. Concept & Structural Constraints (`[Proposed]` & `[Verified]`)

Turn Kuro's real 5–12 second compilation wait into an engaging **short TV / news-program broadcast opening** inside **one continuous loading panel** (`Screen 3`), replacing a plain progress checklist while staying strictly tied to real `WP-012` pipeline events.

- **Single unified panel rule (`[Verified]`):** Keep everything inside the single preparation component (`generation-status.tsx` + `unified-loading-state.ts`). Never recreate a separate `audio-preparation-panel.tsx` (enforced by `scripts/test-audio-queue.mjs` Check #44 `[Verified]`).
- **Real state honesty (`[Proposed]`):** **Zero fake percentage bars (`0% -> 99%`).** Visual animations respond strictly to real milestone transitions and measured turn counts (`completedTurns / totalTurns` for Quick; `openingBatchReadyCount / openingBatchTotalCount` for Detailed `[Verified]`).
- **Live audio gate (`NO AUDIO, NO ADVANCE`, `[Verified]`):** Live generated episodes NEVER unlock `Start podcast` early and NEVER switch to silent timed captions on failure.

---

## 2. Broadcast Intro Beat Sheet & Real Processing-State Mapping (`[Proposed]`)

Target choreography builds from `site-motion-excellence-director` beat-sheet principles (`setup -> trigger -> primary move -> secondary support -> hold -> final state`), mapped 1-to-1 to real `UnifiedLoadingView` / `EpisodeBatchCompilerSnapshot` milestones:

| Beat | Typical Real Window | Real Pipeline State (`WP-012`) | Visual & Studio Scene Action (2.5D CSS + SVG) | Authentic UI Copy |
| --- | --- | --- | --- | --- |
| **Beat 1: Studio Power-Up** | `0–2s` (`generating_script` start) | `POST /api/episodes` dispatched (`scriptPhase === "generating"`) | Dark studio stage awakens: overhead key lights sweep on (`opacity` + `transform`), **Kuro** title ident locks into frame, subtle topic keyword tokens drift onto the background glass monitor. | `Preparing your conversation` · `Writing the discussion…` |
| **Beat 2: Cast Arrival** | `2–5s` (`validating_script`) | Script received; `EpisodeSchema` validating `hosts[]`, `segments[]`, `visualCue` (`scriptPhase === "validating"`) | Dynamic `2` or `3` **Kuromate silhouettes** (`hosts[]`) step into studio marks; episode title resolves softly across the header band once parsed. | `Checking the episode…` *(Validating turns & host roles)* |
| **Beat 3: Mics Live & Voice Compilation** | `5–11s` (`compiling_quick` / `compiling_opening`) | `EpisodeBatchCompiler` running parallel batch requests (`<= 4` concurrent Deepgram; `1` + `1500ms` if Gemini fallback) | Studio **microphone indicators light up sequentially** as individual verified turns pass `24 kHz` mono PCM + `X-Kuro-TTS-Identity` checks; compiled turn pills fill deterministically (`3 of 8 voices ready` or `Batch 1: 2 of 4 voices ready`). | `Compiling hosted audio` *(Quick)* / `Preparing the playable batch` *(Detailed)* + exact real count |
| **Beat 4: Calm Longer-Wait Hold** | `> 11s` (if Detailed/slow/fallback) | Still in `compiling_quick` or `compiling_opening` (e.g., Gemini fallback pacing) | Studio transitions seamlessly into a **calm ambient holding loop**: gentle breathing light rim on active mic rail, subtle waveform pulse **without jarring repeats or fake progress ticks**, clear notice if fallback voice routing is active. | Exact real count (`Compiling opening voices: 2 of 4 ready`) + fallback notice when `providerFallbackActivated === true` |
| **Beat 5: Ready to Broadcast** | When `canPlay === true` | **Quick:** `100%` turns valid + `fullWavBlob` stitched.<br>**Detailed:** Batch 1 (`4/4`) valid + Batch 0 stitched. | Episode title locks in cleanly with host badges (`Maya`, `Leo`, optional `Sam`/3rd host), studio **`ON AIR` standby indicator** illuminates, primary **`Start podcast`** button activates (`Enter` / click / tap). | `Ready to begin` · **`Start podcast`** |

---

## 3. Longer-Wait Calm Loop, Skip Intro & Reduced Motion (`[Proposed]`)

### Longer-Wait Hold Behavior
- The opening CSS choreography (~3–4s ident sweep + silhouette reveal) plays **once** per generation (`animation-iteration-count: 1`, never re-triggering on every React state tick).
- If real script or audio compilation takes longer (e.g., Gemini fallback downshift to `1` concurrent + `1,500 ms` pacing), the stage rests in a calm, GPU-composited (`transform`/`opacity` only) **studio standby hold** while real turn counts continue incrementing cleanly in an `aria-live="polite"` region.

### Safe `Skip intro` Behavior (`[Proposed]`)
- **During beats 1–4 (before `canPlay === true`):** An optional **`Skip animation`** / **`Jump to status`** toggle settles the intro graphics immediately to their calm static studio end-frame (showing real step status & turn count) — **never** skipping waiting for required audio (`NO AUDIO, NO ADVANCE`).
- **When `canPlay === true`:** If the user had already selected skip-intro or generation finished while the opening ident was still running, allow **`Start podcast`** immediately without forcing the user to wait for decorative animations to finish (`make-interfaces-feel-better` / `motion-director` rule: *"Never delay input or a result for an animation"*).

### `prefers-reduced-motion` Behavior (`[Proposed]`)
- Automatically honors `@media (prefers-reduced-motion: reduce)` AND provides a subtle in-panel static toggle if needed for testing/comfort:
  - Disables sweeping lights, silhouette entrances, and ambient loops (`animation: none`, `transition-duration: 1ms`).
  - Renders the settled studio preview card cleanly with crisp static step badges (`1`–`4`), real turn count (`X of Y ready`), and full `aria-live="polite"` updates so 100% of status, hierarchy, and actions remain identical `[Verified]`.

---

## 4. Cancellation & Error / Audio Readiness Gate (`[Verified]` & `[Proposed]`)

- **Cancellation (`Cancel and edit`):** Available throughout Beats 1–5; immediately calls `scriptAbortRef.current.abort()` (if in Beat 1–2) or `compiler.cancel()` (if in Beat 3–5), revokes all temporary Blob URLs, clears timers, and returns directly to **Screen 2** with all topic/study text and toggles preserved `[Verified]`.
- **Audio Readiness Gate (`NO AUDIO, NO ADVANCE`):**
  - **Quick:** `canStartPodcast` stays `false` until `completedTurns === totalTurns` and `fullWavBlob !== null`.
  - **Detailed:** `canStartPodcast` stays `false` until all `4` Batch-1 turns pass WAV + `24 kHz` mono PCM + `durationMs > 0` + `X-Kuro-TTS-Identity` verification (`openingBatchReadyCount === openingBatchTotalCount`).
  - **Live Failure / `503 TTS_NOT_CONFIGURED`:** Transitions smoothly inside the same panel to an honest recovery card (`failed_retryable` or `failed_blocking`):
    - **`503` No-Key / Auth `401`/`403`:** Shows configuration/auth message + **`Retry`** + **`Cancel and edit`** (zero silent caption fallback).
    - **Transient Turn Error:** Shows count of preserved valid turns + **`Retry failed turn`** (re-requests failed turns only) + **`Cancel and edit`**.
    - **Zero dead-end:** Mention cleanly that **`Try a sample episode`** remains available on Home/Generator as a preview if keys aren't configured yet.
