# WP-002 Consolidated Handoff — Kuro UI/UX Specification

## 1. Status
**Complete** — UI/UX research, user flows, mobile/desktop wireframes, and component-state/accessibility specs are finalized on `research/wp-002-ui-ux` with zero application code added.

## 2. Files Created (`docs/wp-002/`)
- `UX_RESEARCH.md` (`< 160` limit): Verifiable product/OSS research, commute-first UX principles, and all 14 locked UX decisions with reasons and trade-offs.
- `USER_FLOW.md` (`< 120` limit): Commuting college student flow, single-route state model (`/`), happy/error/partial-audio/download paths, and demo video journey.
- `WIREFRAMES.md` (`< 220` limit): Mobile (`320px+`) and desktop (`1024px+`) wireframes for Create, Generate, 2-Host Player, 3-Host Player, Partial-Audio state, and Contextual Visual bounds.
- `COMPONENT_STATES.md` (`< 160` limit): 14-component inventory, full input/generation/player/visual/download state matrix, WCAG 2.2 targets, and `WP-005`/`WP-007` ownership split.
- `WP-002_HANDOFF.md` (`< 100` limit): Summary handoff, conflicts, risks, and next actions.

## 3. Material Decisions Locked
- **Single route (`/`)** transitioning `create` -> `generating` -> `player` plus one-tap `"Try sample episode"` backup access.
- **Creation UX:** One expandable textarea (`10–4,000` chars) + 1 student example chip; 3 binary pill groups defaulting to **Casual**, **Quick**, **2 hosts**; CTA **"Create conversation"**.
- **Dynamic Multi-Host Stage:** Driven strictly by `hosts[]` (`grid-cols-2` for 2 hosts, `grid-cols-3` for 3 hosts at 320px+); 4 non-color active-speaker cues (ring, `"Speaking"` icon pill, scale/opacity, caption speaker header).
- **Layout & Playback:** Dedicated high-contrast `CaptionPanel` below `HostStage`; contextual visual below captions on mobile and right column (`~40%`) on desktop; sticky bottom thumb dock on mobile.
- **Honest Failure & Progress:** 4-stage progress tracker (no fake percentages); playable partial-audio fallback with `PartialAudioNotice`; disabled `Download audio` with honest helper copy when stitching is unavailable.

## 4. Research Evidence Summary
Examined 5 products (**Google NotebookLM**, **Apple Podcasts**, **Spotify**, **Duolingo**, **Speechify**) and 3 OSS/standards references (**ElevenLabs UI**, **Media Chrome**, **WCAG 2.2 / NN/g**). Full table, links, adopted patterns, and rejected patterns are in `UX_RESEARCH.md`.

## 5. Prompt vs. Repo Overrides Recorded
- `AGENTS.md` assigns `WP-002` to Lucky (`Claude 5.5 Opus`) and limits extra docs unless owner-requested; this task temporarily assigns `WP-002` execution to Neon and authorizes `docs/wp-002/` while keeping Lucky's long-term UI/UX lane (`WP-005`) intact.
- `README.md`, `SPEC.md`, and `AGENTS.md` were read completely and left unmodified.

## 6. Open Questions & Risks
- **WP-003 coordination (non-blocking for WP-002):** Confirm whether generation returns a single response (UI uses calm timed stage labels) or real stage/stream updates, and validate recommended text/item bounds for the strict `VisualCue` union in `WIREFRAMES.md` Section 8.
- **Risk — 3-host density at 320px:** Enforce 1-word host names and concise role labels; verify on a 320px viewport during `WP-007`.
- **Risk — Live TTS latency during judging:** Pre-generated backup episode must be wired to `"Try sample episode"` in `WP-004`/`WP-007`.

## 7. Implementation Boundaries
- **WP-004 (Owner / Neon):** Initialize Next.js/Tailwind/selected shadcn/ui/Zod, route shell (`/`), `KuroHeader`, mock data wiring, Vercel preview.
- **WP-005 (Lucky / Sonnet):** `CreationForm`, `TopicInput`, `OptionSelector`, `GenerationProgress`, `GenerationError` on `feat/wp-005-creation-flow`.
- **WP-007 (Owner / Neon + Lucky/JR support):** `EpisodeHeader`, `HostStage`, `HostAvatar`, `CaptionPanel`, `PlaybackControls`, `PartialAudioNotice`, `ContextVisual` templates, `DownloadActions` on `feat/wp-007-player`.

## 8. Git & Verification Note
- Branch: `research/wp-002-ui-ux` created from verified `main` (`abaf193bef8469673f1f0f3e183f980c23b1bd1f`).
- Exact measured line counts, scope/identity/secret checks, final WP-002 commit hash, and push status are recorded in the consolidated session handoff after commit. Do not merge without Project Owner review.

## 9. Exact Next Action
1. Project Owner reviews `docs/wp-002/` and accepts WP-002 (merge into `main` when ready).
2. Run/complete `WP-003` (JR + Codex Astra) to lock the strict `VisualCue` Zod union, Gemini Flash-class model, and TTS/stitching spike.
3. Begin `WP-004` (Next.js skeleton & Vercel preview) once WP-002 and WP-003 contracts align.
