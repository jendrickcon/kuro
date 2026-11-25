# Kuro — Component Inventory, States & Accessibility (WP-002)

> **Scope:** Conceptual React/Tailwind + selected shadcn/ui blueprint for `WP-004`, `WP-005`, and `WP-007`. No code or global state library introduced here.

## 1. Compact Component Inventory & WP Ownership

| Component | Conceptual Props / Data | Owner |
| --- | --- | --- |
| `KuroHeader` | `mode ("create" \| "player")`, `onNew()`, `onLoadSample()` | `WP-004` |
| `CreationForm` | `value`, `tone`, `length`, `hostCount`, `error`, `isSubmitting`, `onSubmit()` | `WP-005` |
| `TopicInput` | `value`, `minChars (10)`, `maxChars (4000)`, `error`, `onChange()`, `onUseExample()` | `WP-005` |
| `OptionSelector` | Reusable binary radiogroup (`label`, `options[2]`, `value`, `disabled`, `onChange()`) used for Tone, Length, HostCount | `WP-005` |
| `GenerationProgress` | `stageIndex (0..3)`, `topicPreview`, `onCancel()` | `WP-005` |
| `GenerationError` | `message`, `onRetry()`, `onEdit()`, `onLoadSample()` | `WP-005` |
| `EpisodeHeader` | `title`, `tone`, `length`, `hostCount` | `WP-007` |
| `HostStage` | `hosts: Host[]` (2 or 3), `activeSpeakerId`, `activeEmotion`, `isPlaying` | `WP-007` |
| `HostAvatar` | `host: Host`, `state ("idle" \| "speaking" \| "reacting")`, `compact (boolean)` | `WP-007` |
| `CaptionPanel` | `activeSegment`, `activeHost`, `previousSegment?`, `turnIndex`, `totalTurns`, `audioMissing` | `WP-007` |
| `PlaybackControls` | `isPlaying`, `canPrev`, `canNext`, `currentIndex`, `totalTurns`, `isFinished`, `onTogglePlay()`, `onPrev()`, `onNext()`, `onReplay()` | `WP-007` |
| `PartialAudioNotice` | `missingCount`, `totalTurns` | `WP-007` |
| `ContextVisual` | `visualCue?: VisualCue` (dispatches to `Comparison`, `Timeline`, `Process`, `FactCard`, or safe empty fallback) | `WP-007` |
| `DownloadActions` | `combinedAudioUrl?`, `isPreparingAudio`, `episode`, `onDownloadAudio()`, `onDownloadTranscript()` | `WP-007` |

## 2. Creation Component States (`WP-005`)

### `TopicInput` (Recommended Working Limit: `10–4,000` chars)
*Justification:* `< 10` chars lacks topic context; `> 4,000` chars (~650 words) inflates prompt latency/cost and exceeds a short commute study excerpt.
- **Empty:** Placeholder invites either a topic or pasted class notes; example chip visible below.
- **Focused:** Clear 2px high-contrast focus ring; textarea expands cleanly up to ~8 rows.
- **Filled:** Example chip stays quiet; show character counter only when `>= 3,000` chars or invalid.
- **Too short (`< 10` trimmed chars) / Empty submit:** Prevent submit; show inline error (`"Enter at least 10 characters or paste a short study passage."`) linked via `aria-describedby` + `aria-invalid="true"`.
- **Too long (`> 4,000` chars):** Show inline count & error (`"Keep input under 4,000 characters for a quick episode."`); disable submit until trimmed.
- **Invalid/unsupported input (whitespace/symbols only):** Treat as empty/too short with plain-language guidance.

### `OptionSelector` (Tone, Length, HostCount) & Submit Button
- **Selected:** High-contrast filled pill + bold label + `aria-checked="true"` (check/dot cue for non-color distinction).
- **Unselected:** Neutral border + `aria-checked="false"`.
- **Disabled:** Only while `isSubmitting` is true (`aria-disabled="true"`, muted opacity).
- **Keyboard focus:** Arrow keys or Tab move between options with visible focus ring; each group uses `role="radiogroup"` and `aria-labelledby`.
- **Primary button (`Create conversation`):** Active when input valid; loading/disabled with spinner when submitting.

### `GenerationProgress` & `GenerationError`
- **Stages:** `0: Understanding your topic` -> `1: Writing multi-host dialogue` -> `2: Recording host voices` -> `3: Preparing player` (indeterminate pulse on active stage; checkmark on completed stages).
- **Recoverable failure:** `GenerationError` displays plain-English cause + `Try again`, `Edit topic` (preserves user input), and `Try sample episode`.
- **Partial success:** Transitions directly to `player` with `PartialAudioNotice` active.

## 3. Player, Visual & Download States (`WP-007`)

### `HostStage` & `HostAvatar` (Dynamic `hosts[]` — 2 or 3 Hosts)
- **Layout:** Driven strictly by `hosts.length` (`grid-cols-2` for 2 hosts, `grid-cols-3` for 3 hosts on mobile and desktop left column). Never hard-code `hostA`/`hostB`.
- **MVP Character States:** `idle` (neutral, `0.72` opacity when another host speaks), `speaking` (solid accent ring, `1.04` scale, `"Speaking"` badge + speaker/wave icon), `reacting` (optional subtle nod/pulse on non-speaking host when `emotion === "reacting"`). All motion uses lightweight CSS transitions only.

### `PlaybackControls` & `CaptionPanel`
- **Ready:** Play button prominent (`48×48px`), Turn `1 of N`, first turn caption visible immediately.
- **Playing:** Pause icon + `"Pause"` `aria-label`; active host & caption sync to current turn.
- **Paused:** Play icon + `"Play"` `aria-label`; active host retains ring with `"Paused"` status tag.
- **Segment navigation (`Prev`/`Next`):** Immediately cancels active `<audio>`, switches turn index, updates host + caption + visual, and plays if already playing.
- **Segment audio unavailable:** Shows `"Audio unavailable — showing caption"` badge inside `CaptionPanel`; Play/Next stays responsive with gentle 4s hold or manual `Next turn`.
- **Episode finished:** Progress bar full, Play button swaps to `"Replay"`, download actions highlighted subtly.

### `ContextVisual`
- **Valid visual present:** Renders matching template (`comparison`, `timeline`, `process`, `fact-card`) from WP-003 validated schema.
- **No visual (`type: "none"` or omitted):** Collapses cleanly on mobile (zero blank gap); calm subtle placeholder or collapsed space on desktop.
- **Invalid visual fallback:** Silently falls back to `none` (never crashes UI or renders raw JSON).
- **Loading:** Not needed once episode JSON arrives; if hydrated asynchronously, render compact skeleton box.

### `DownloadActions`
- **Audio ready:** `Download audio` active (`44px` tall); brief `"Preparing..."` state while triggering download.
- **Audio unavailable:** `Download audio` disabled (`aria-disabled="true"`) with inline note explaining replay + transcript remain available.
- **Transcript:** Always enabled once script exists; exports formatted `.txt` locally.

## 4. Responsive & Accessibility Targets (WCAG 2.2 Guidance)
*Design targets below guide implementation and must be manually tested during WP-007/WP-008 before claiming conformance.*
- **Viewport & Zoom:** Usable at `320px` width and `200%` browser zoom with zero horizontal scrolling.
- **Touch Targets (WCAG 2.2 SC 2.5.8):** `44×44px` minimum for all primary controls (exceeds 24×24px AA minimum); `48×48px` for primary Play/Pause and Create CTA.
- **Contrast (SC 1.4.3 / 1.4.11):** `>= 4.5:1` for captions, labels, and body copy; `>= 3:1` for large headings, active host rings, icons, and focus outlines.
- **Semantic Controls & Keyboard:** Native `<button>`, `<textarea>`, and `<fieldset>`/`radiogroup`; full Tab/Enter/Space navigation; logical top-to-bottom focus order (`Header` -> `HostStage` -> `CaptionPanel` -> `ContextVisual` -> `DownloadActions` -> `PlaybackControls`); visible `:focus-visible` outlines everywhere.
- **Screen-Reader Announcements:** `aria-live="polite"` on generation stage label and a concise sr-only region announcing speaker/turn changes (e.g., `"Turn 3 of 9: Maya, Explainer"`), avoiding verbose live-region flooding; form errors linked via `aria-describedby`.
- **Reduced Motion (`prefers-reduced-motion: reduce`):** Disable host bounce/scale/pulse animations; retain solid border, bold `"Speaking"` badge, and high-contrast text cues.
