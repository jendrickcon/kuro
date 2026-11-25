# WP-007 Handoff — Kuro Production Multi-Host Podcast Player

## 1. Status & Replacement Choice
- **Status:** **Complete** (`feat/wp-007-multi-host-player`, branched from verified `main` `562c11dfe97b0f810660d94c52511c0546e09ee4`).
- **EpisodePreview decision:** Replaced `EpisodePreview` directly with `EpisodePlayer` (`src/components/kuro/episode-preview.tsx` removed) so `KuroSkeleton` mounts `EpisodePlayer` directly with a monotonic `instanceId` key and focus restoration on exit.
- **WP-008 readiness:** **Ready** — all WP-007 acceptance checks passed.

## 2. Architecture & Files Created / Changed
- **Playback & export:**
  - `src/hooks/use-episode-playback.ts`: React-safe local state (`currentSegmentIndex`, `status`, `reactionHostId`, token-guarded single-timer effect with full cleanup on pause/step/restart/replace/unmount), bounded timed preview duration (`clamp(2500 + text.length * 35, 2500, 8000)`, or bounded `segment.durationMs`), and optional audio metadata checks (`audioUrl`, `durationMs`, `audioFormat`).
  - `src/lib/episode/transcript.ts`: `buildTranscriptText()` and `buildTranscriptFilename()` producing ordered plain text with title, topic, tone, length, hosts/roles, and zero secrets/raw JSON/audio links.
- **Visual templates (`src/components/kuro/visuals/`):** `comparison-visual.tsx`, `timeline-visual.tsx`, `process-visual.tsx`, `fact-card-visual.tsx`, and neutral studio standby `no-visual.tsx` (never labelled "None").
- **Player components (`src/components/kuro/player/`):**
  - `stage-theme.ts`: Lightweight `StageTheme = "contemporary"` boundary (Contemporary Studio default).
  - `contextual-monitor.tsx`: Back-wall studio monitor validating cues via `VisualCueSchema.safeParse()` with safe `NoVisual` fallback and dev-only warning.
  - `kurozo-host.tsx`: Original flat-motion CSS geometric Kurozos rendered dynamically from `episode.hosts[]` with 6 role crests (`explainer`, `learner`, `skeptic`, `storyteller`, `specialist`, `moderator`), per-host mics/LEDs, overhead wall stage-light emphasis, posture/look states, and **zero containment halos**.
  - `podcast-stage.tsx`: Unified studio wall, HUD (`STANDBY`/`● ON AIR`/`PAUSED`/`COMPLETE`, `KURO STUDIO`, turn counter), upper wall monitor above hosts, closer/larger host seats behind curved shared desk, and aligned desk nameplates.
  - `caption-panel.tsx`, `playback-controls.tsx`, `transcript-download.tsx`, `player-notice.tsx`, `episode-player.tsx`: Synchronized `aria-live` captions, previous turn line, completion banner/replay, `44px+` transport/download controls (`Blob` + revoked `objectURL`), and honest timed/mock disclosures.
- **App wiring:** Updated `src/app/globals.css`, `src/app/page.tsx`, `src/components/kuro/kurozo-preview.tsx` (reads fixture `hosts[]` instead of hard-coded names), and `src/components/kuro/kuro-skeleton.tsx`.

## 3. Verification & Observed Results
- **Quality checks:** `npm install` (lockfile unchanged), `npm run typecheck`, `npm run lint`, `npm run test:schema` (11/11), and `npm run build` all passed with exit code `0`; built CSS confirmed `@media (prefers-reduced-motion:reduce)`.
- **Scope & secret scan:** Zero `speechSynthesis`, `prototype/`, hard-coded `Maya`/`Leo`/`Sam`, `hostA`/`hostB`, secrets, or modifications to `contracts/`, `fixtures/`, `prototype/`, `SPEC.md`, or `AGENTS.md`.
- **Browser verification (`http://localhost:3000`):**
  - Zero console/hydration errors; 100% requests (`8–9/8–9`) served from `localhost:3000`.
  - Verified 2-host sample (`9` turns) & 3-host custom (`12` turns): Play auto-advance, Pause hold, Resume, Prev/Next clamping, Restart, Replay, episode completion returning all hosts to `Idle`, Leave/Back timer cleanup with topic preservation, all 5 visuals (`comparison`, `timeline`, `process`, `fact-card`, `none` standby), and transcript download (`opportunity-cost-on-a-commute-transcript.txt`).
  - **Viewports (`320×640`, `390×844`, `768×800`, `1280×800`):** Zero horizontal overflow (`right <= viewportWidth` verified per element bounding box; `320×640` 3-host seats `84.3×95px`, controls `44–48px`); `1280×800` Turn 7 Process stage + captions fit cleanly (`782.5px` height inside `800px`).
  - **Accessibility & reduced motion:** Verified Tab order, visible focus rings, `Enter`/`Space` activation, and non-color speaking indicators (`● Speaking`, active mic LED, HUD status, caption speaker label). **Limitation noted:** Headless `webview_browser` does not expose `emulateMedia()` or `evaluate()`, so live reduced-motion CSS runtime emulation and `documentElement.scrollWidth` JS read were not directly instrumented there and are backed by built CSS inspection (`@media (prefers-reduced-motion:reduce)`) and DOM bounding-box checks.

## 4. Boundaries & Future Work (Not Implemented Here)
- **Hosted audio (WP-010 / WP-011):** `WP-010` generates segment audio after `WP-003B`; `WP-011` connects real segment audio and partial-audio fallback to `useEpisodePlayback`. Timed silent playback is honest preview behavior only.
- **Future customization (document-only):** Post-MVP themes (*Contemporary Studio*, *Retro Broadcast*, *Noir*, *Student Study Session*, *Commute Lounge*) and host edits (name, role, voice, accent, appearance, personality) remain deferred and unexposed in WP-007/WP-008.
- **Git evidence:** Branch `feat/wp-007-multi-host-player` from `562c11dfe97b0f810660d94c52511c0546e09ee4`; commit hash and push result recorded in the WP-007 checkpoint/final handoff.
