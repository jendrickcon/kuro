# Kuro — Focused UI/UX Research & Design Decisions (WP-002)

> **Product:** Kuro — *More voices. Clearer ideas.*
> **Primary MVP Persona:** A commuting college student turning a difficult topic, class reading, or pasted study material into a short, engaging visual-audio conversation that is easier to understand and replay.

## 1. Research Scope
Targeted examination of 5 current audio/learning products and 3 open-source/accessibility references to guide Kuro's creation flow, dynamic 2- or 3-host player, mobile commute ergonomics (320px+), caption readability, calm generation feedback, and structured contextual visuals.

## 2. Products & References Examined

| Reference | Status & Link | Pattern Studied | Fits Kuro | Avoid Copying |
| --- | --- | --- | --- | --- |
| **Google NotebookLM** | Current (`blog.google` / `notebooklm.google.com`) | Compact Studio generation toggles + clear async wait state | Minimal upfront controls (`tone`, `length`, `hosts`) without wizard steps | Multi-source sidebar, file/URL ingestion, vague multi-minute spinner |
| **Apple Podcasts** | Current (`apple.com/apple-podcasts`) | High-contrast synchronized text with speaker separation, usable without audio | Commute-readable captions; silent-judge demo comprehension | Separate searchable transcript reading mode, library chrome |
| **Spotify** | Current (`open.spotify.com`) | Bottom-anchored thumb play/pause bar + high-contrast active line focus | One-handed mobile playback dock | Hidden swipe-up caption drawer, busy art behind text |
| **Duolingo** | Current (`duolingo.com`) | Named character avatars paired with short 1–3 line spoken dialogue cues | Instant visual-to-voice mapping across 2 or 3 hosts | Quizzes, scoring gates, XP streaks, withholding captions |
| **Speechify** | Current (`speechify.com`) | Centered active-text anchor minimizing thumb scrolling on phones | Focused current-turn caption card instead of text walls | Document upload, extreme speed controls, jittery word jumps |
| **ElevenLabs UI** | Open-source (`github.com/elevenlabs/ui`) | `shadcn/ui` + Tailwind audio controls with explicit ARIA labels & keyboard nav | Composable React/Tailwind button & progress styling | Voice-agent orbs, live streaming widgets |
| **Media Chrome** | Open-source (`github.com/muxinc/media-chrome`) | Accessible native `<audio>` control patterns & keyboard conventions | Semantic ARIA labeling model for WP-007 React controls | Extra web-component runtime dependency |
| **WCAG 2.2 & NN/g** | Standards (`w3.org/TR/WCAG22/`, `nngroup.com`) | SC 2.5.8 target size (24px min / 44px touch best practice), 4.5:1 text contrast, `aria-live="polite"`, stage trackers vs. "liar" % bars | Accessible commute UI + honest stage-based AI progress | Fake percentage bars that stall at 99% |

*Note: Where live mobile interaction details could not be directly instrumented, choices are explicitly flagged as practitioner design judgment grounded in these documented patterns.*

## 3. Core Kuro UX Principles (Commuting Student Focus)
- **Fast entry:** One screen from landing to generation; zero onboarding tours or long marketing copy above the input.
- **Mobile-first (320px+), desktop-enhanced:** Zero horizontal scrolling at 320px; 44×44px minimum touch targets on primary controls.
- **One-handed commute ergonomics:** Primary playback controls stay docked at the bottom thumb zone on mobile.
- **Silent-first clarity:** Synchronized captions, named host badges, and one structured visual make Kuro understandable even with muted audio during judging.
- **Multi-host clarity without color-only cues:** Combine solid ring/border, `"Speaking"` badge + icon, subtle scale (`1.04`), and bold speaker header inside the caption card.
- **Calm, honest progress:** Named generation stages + indeterminate pulse avoid misleading percentages; partial failures degrade gracefully rather than breaking the session.

## 4. Locked UX Decisions (14 Required Decisions)

| # | Decision | Recommendation | Reason | Main Trade-off |
| --- | --- | --- | --- | --- |
| 1 | Routes vs. states | Single primary route (`/`) switching `create` -> `generating` -> `player` states | No DB/persistence in MVP; avoids broken deep links on refresh and simplifies WP-004/005/007 | No shareable per-episode URLs |
| 2 | Topic input control | One auto-expanding `<textarea>` (3–8 rows, 10–4,000 chars) + 1 example chip | Fastest one-handed entry for either a short topic or pasted class notes | Less visual split between topic vs. excerpt (solved by placeholder) |
| 3 | Option selectors | Three compact 2-option segmented pill groups (`Casual`/`Serious`, `Quick`/`Detailed`, `2`/`3 hosts`), CTA **"Create conversation"** | All 3 options are binary; single-tap scannable with zero dropdowns at 320px | Takes 3 stacked rows (~170px), still fits above mobile fold |
| 4 | 2 hosts on mobile | Symmetric 2-column horizontal stage (`grid-cols-2`) driven by `hosts[]` | Immediate conversational framing above captions with zero horizontal scroll | Role labels must stay 1–2 words |
| 5 | 3 hosts on mobile | Dynamic 3-column compact stage (`grid-cols-3` from `hosts.length`) with 48px avatars & truncated 1-line names | All 3 hosts stay visible simultaneously at 320px (~96px/card) without hard-coded slots | Tighter card width; relies on short first names & role tags |
| 6 | Non-color active speaker | 4 combined cues: solid ring/border + `"Speaking"` icon pill + `1.04` scale (idle `0.72` opacity) + caption speaker header | Accessible for color-blind users, bright sunlight, and muted judging | Slightly denser host card metadata |
| 7 | Caption placement | Dedicated high-contrast `CaptionPanel` directly below `HostStage` (never over avatar art) + muted 1-line prior turn | Natural top-to-bottom scan; recovers glance context on a bumpy commute | Does not show full scrollable script (avoids excluded reading tab) |
| 8 | Contextual visual placement | Mobile: compact card below captions, above sticky dock; Desktop: persistent right column (`~40%` width) | Keeps mobile captions above the fold while making desktop screenshots/demos shine | On very small phones, visual may sit partially below the fold |
| 9 | Sticky playback controls | Sticky bottom thumb dock on mobile (`~76px`); inline bar in left column on desktop | Reliable one-handed Play/Pause & turn skip even while inspecting the visual | Reserves bottom padding on mobile scroll area |
| 10 | Generation progress | 4-stage stepper + indeterminate active pulse + Cancel/Edit (UI-only calm timing fallback if WP-003 returns a single response) | Avoids NN/g "liar bar" stalls while reassuring users during 15–45s waits | Less precise than per-turn counters unless WP-003 streams stages |
| 11 | Partial audio failure | Playable episode + non-blocking `PartialAudioNotice` banner + inline unavailable badge + manual Next / 4s readable hold | Prevents one failed TTS turn from ruining the student's study episode or demo | Audio pauses briefly on missing turns |
| 12 | Unavailable audio download | Keep `Download transcript` enabled; show `Download audio` disabled with concise inline reason | Honest expectation management matching `SPEC.md` ("never fake it") | Adds one short helper line when stitching fails or in mock mode |
| 13 | Primary hackathon screenshot | Desktop Episode Player mid-playback (active host ring, clear caption, structured `Comparison` or `Process` visual side-by-side) | Communicates "More voices. Clearer ideas." in a single silent frame | Requires a 2nd screenshot to showcase the Create form |
| 14 | Demo video journey | 60–90s flow: Create screen -> college opportunity-cost prompt (`Casual`, `Quick`, `3 hosts`) -> Generation stages -> 2–3 spoken turns with visual cue -> Replay + Downloads (pre-generated backup ready) | Proves end-to-end AI value, dynamic 3-host clarity, and accessibility quickly | Focuses on one study scenario rather than all 4 visual templates |

## 5. Key UX Risks & Mitigations
- **3-host crowding at 320px:** Enforce 1-word host names, 1–2 word roles, and 8px grid gaps; verify at 320px width during WP-007.
- **Unpredictable visual payloads:** WP-003's strict discriminated union + silent fallback to hidden visual prevents layout breakage.
- **Slow live TTS during judging:** Keep a polished one-tap `"Try sample episode"` backup trigger on the Create screen.

*Deferred post-hackathon concepts remain strictly separated in `SPEC.md` Section 10.*
