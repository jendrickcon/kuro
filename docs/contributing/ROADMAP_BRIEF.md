# Kuro Project Roadmap Brief

**Production Deployment:** [https://kuro-enuhri.vercel.app](https://kuro-enuhri.vercel.app) · **Main SHA:** `f3c8b6a` (`WP-012` merged)

**Team Aliases:** **Lucky = Angel** · **JR = John Rae** · **Project Owner = Jendrick** *(two contributors + owner lead; no fourth contributor)*

Status legend: **Complete (`Verified`)** · **Next** · **Blocked (`Awaiting WP-012.5`)** · **Owner confirmation required** · **Proposed (`Post-Hackathon`)**

## Completed Foundation & Core Engine (`WP-001`–`WP-012` — `Complete [Verified]`)
- **WP-001–WP-008.6 (`Complete [Verified]`):** Product pitch, locked MVP scope ([SPEC.md](../../SPEC.md)), UI/UX specs (`docs/wp-002/`), Zod contracts (`contracts/episode.schema.ts`), Next.js skeleton, `prototype/index.html`, creation flow, shared-desk player, onboarding docs, and Kuromate terminology.
- **WP-009 Gemini Script Generation (`Complete [Verified]`):** Live Gemini `gemini-3.8-flash` (+ `gemini-3.5-flash-lite` fallback) structured dialogue validated strictly against `EpisodeSchema`.
- **WP-010 Segmented TTS & WP-011 Audio Queue (`Complete [Verified]`):** Allowlisted Kuromate role profiles, unified loading state, and sequential playback foundation.
- **WP-011.5 TTS Resilience & Primary Swap (`Complete [Verified]`):** Switched primary TTS to Deepgram Aura-2 (`DEEPGRAM_API_KEY`, `KURO_TTS_PROVIDER=deepgram`) with Gemini `gemini-3.8-flash-lite-tts` fallback, `long_quota_wait` circuit breaker, and Layer-1 Kuromate voice identities.
- **WP-012 Hybrid Batch Compilation (`Complete [Verified]`):** Fixed Layer-1 Deepgram ownership (`Maya=aura-2-thalia-en`, `Leo=aura-2-hermes-en`, `Sam=aura-2-orion-en`, Guests 1–3=`athena`/`arcas`/`luna`), bounded server retry (`<= 3` attempts), `casual` prosody prompt tuning, vendor/voice response header removal, in-browser `24 kHz` mono PCM WAV stitching (`wav-stitcher.ts`), `Quick` full-compile / `Detailed` 4-turn rolling batches, strict `NO AUDIO, NO ADVANCE` invariant, `MM:SS` scrubber, `.wav` & `.txt` downloads, and explicit zero-key `Sample Preview` vs. live `503` blocking.

### Separate Post-Merge Spot-Check (`Pending — Owner`, NOT a work package)
- Run 1 live `Quick` (`casual`, Leo = `Hermes`) ear-check and 1 live `Detailed` (`12–15` turns) multi-batch transition & `.wav` download check on [https://kuro-enuhri.vercel.app](https://kuro-enuhri.vercel.app).

## Active & Upcoming Hackathon Packages (`WP-012.5`–`WP-020`)

| WP | Scope | Owner & Status |
| --- | --- | --- |
| **WP-012.5** | **Product Experience Architecture & Workflow:** Owner-led 5-screen flow (`Home -> Podcast Generator -> Broadcast-Style Unified Preparation -> 9:16 Portrait Speaker-Focused Player -> Episodes from this Session`), layered 2.5D HTML/CSS + SVG (no Canvas/WebGL waiver; Three.js deferred), strict `NO AUDIO, NO ADVANCE`, and in-memory session episodes. | **Jendrick (Project Owner)** — **`Next`** |
| **WP-013** | **Kuromate & Full Visual Redesign:** Built on top of approved `WP-012.5` structure (without redefining site map or playback flow): two original cat-inspired Kuromates + one comfy Kuromate, character states, typography, site UI/UX, studio composition, contextual charts, responsive design, and **static prototype first** (`docs/wp-013/`, `prototype/wp-013/`) before runtime integration. | **Lucky (Angel)** — **`Blocked` until `WP-012.5` merges** |
| **WP-014** | **Trusted-Source Experience:** Improve generation from **pasted study material** and clearly distinguish source-based explanations from open-topic generation *(honoring `SPEC.md`: no PDF upload, live web search, or claim citations)*. | **Owner confirmation required** |
| **WP-015** | **Interaction & Accessibility Polish:** Animation refinement, responsive behavior, reduced motion, keyboard navigation, loading transitions, and smaller UX details. | **Owner confirmation required** *(provisional: Lucky + owner integration)* |
| **WP-016** | **Reliability & Recovery:** Built around approved `WP-012.5` screens and transitions (without redefining primary site structure): API/provider failures, `429`/`503`/timeouts, error pages (`404`/`500`), recovery UX, security, Vercel diagnostics, observability, and complete testing architecture — **audit + recovery prototype first** (`docs/wp-016/`, `prototype/wp-016/`). | **JR (John Rae)** — **`Blocked` until `WP-012.5` merges** |
| **WP-017** | **Responsible AI Safeguards:** Privacy guidance, uncertainty handling, informational-use notices, and safe-generation boundaries. | **Owner confirmation required** *(provisional: JR)* |
| **WP-018** | **Demo & Backup Mode:** Polished pre-generated episodes that remain usable if script generation or hosted audio is unavailable. | **Owner confirmation required** *(provisional: Owner integration + team assets)* |
| **WP-019** | **Release-Candidate QA:** Feature freeze, end-to-end testing, desktop/mobile/accessibility checks, deployment validation, and final defect correction. | **Owner confirmation required** *(provisional: Owner + JR, team review)* |
| **WP-020** | **Hackathon Submission Package:** Final README, screenshots, architecture explanation, demo script/video, limitations, and submission materials. | **Owner confirmation required** *(provisional: Whole team, owner-led)* |

## Locked Execution Sequence
1. **Roadmap Documentation Sync** (`chore/sync-roadmap-docs` — current step).
2. **`WP-012.5` Owner-Led Structure & Working Workflow** (`Jendrick` — branch after sync merges).
3. **Owner Review & Approval of `WP-012.5`** (merge into `main`).
4. **Parallel Phase-1 Member Work (starts ONLY after `WP-012.5` merges):**
   - **Lucky (`WP-013` Phase 1):** Visual system, original Kuromates & static visual prototype (`docs/wp-013/`, `prototype/wp-013/`).
   - **JR (`WP-016` Phase 1):** Reliability/security audit & recovery prototype (`docs/wp-016/`, `prototype/wp-016/`).
5. **Sequential Integration & Finish:** `WP-013` runtime integration -> `WP-014` -> `WP-015` -> `WP-016` runtime integration -> `WP-017` -> `WP-018` -> `WP-019` -> `WP-020`.

## Post-Hackathon Stretch Ideas (`Proposed` — Not in MVP)
Optional bounded Three.js/WebGL studio spike (with CSS fallback), theme customization (*Contemporary Studio*, *Retro Broadcast*, *Noir*, *Student Study Session*, *Commute Lounge*), editable host names/personalities/accessories, document/URL ingestion, citations, comprehension quizzes, offline LLMs, and optional minimal Supabase persistence.

---

> **Would you like a brief explanation of Kuro’s roadmap, completed work packages, and the next package relevant to your role?**
