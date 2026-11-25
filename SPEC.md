# Kuro — Product & Technical Specification

> **Tagline:** More voices. Clearer ideas.
> **Hackathon title:** Kuro: Adaptive Conversations for Better Understanding ([SLAY HACKS 2026](https://slayy-hacks.devpost.com/))
> **One-line pitch:** Kuro transforms topics and supplied information into adaptive multi-host conversations with distinct voices, synchronized captions, contextual visuals, and downloadable audio.

## 1. Problem & Primary Persona

Dense lecture readings, syllabi, and difficult study topics are hard to absorb on a phone during noisy commutes or short study breaks. Plain text feels fatiguing, while single-voice summaries miss the back-and-forth questioning that makes complex concepts click.

- **Primary MVP persona (locked):** A commuting college student who wants to turn a difficult topic, class reading, or pasted study material into a short, engaging visual-audio conversation that is easier to understand and replay.
- **Demo alignment:** Copy, defaults, accessibility choices, contextual visuals, and the Devpost demo center on a college study topic or pasted reading (general free-text topics remain accepted).

## 2. Product Value & Core Principle

Kuro is not merely an AI podcast generator. Information becomes easier to understand when explored through multiple voices (`explainer`, `learner`, `skeptic`, `storyteller`, `specialist`, `moderator`), relatable examples, synchronized visual context, and an accessible listening experience.

- Architecture and UI must support a dynamic `hosts[]` array (2 hosts by default, optional 3rd host in MVP; never hard-code `hostA`/`hostB` or `speakerOne`/`speakerTwo`).

## 3. Locked Hackathon MVP

**Inputs**
- Topic or pasted text (language inferred automatically from input)
- Tone: `casual` (default) or `serious`
- Length: `quick` (~8–10 dialogue turns, default) or `detailed` (~12–15 turns, only if reliable; no uncontrolled length)
- Host count: `2` (default) or `3` hosts via `hosts[]`

**Outputs**
- Validated multi-host script with deterministic turn order and distinct per-host voices
- Sequential dialogue playback, active-speaker indicator, and synchronized captions
- Lightweight React/CSS animated host states
- One template-driven contextual visual (`comparison`, `timeline`, `process`, `fact-card`, or `none`)
- One downloadable combined audio file (requires verified stitching; see Section 7)
- One downloadable transcript and one polished pre-generated backup episode

## 4. Explicit Exclusions (Out of Scope for MVP)

Do not implement unless the Project Owner explicitly approves a later work package:
- User accounts, authentication, personal libraries, social features, full analytics, or payments
- Language selector UI, PDF/file upload or parsing, reading-mode tabs, or switching among video/audio/reading modes
- Live recent-news retrieval, automatic web research, evidence-linked claim citations, source timestamping, or conflicting-report classification
- Quiz generation, comprehension scoring, or corrective follow-up conversations
- AI-generated video, browser MP4/video export, Canvas rendering, complex lip sync, voice cloning, custom character creation, or unlimited hosts
- Fully offline AI generation, local LLM installation, premature multi-provider AI abstraction, production background queues, or normalized multi-table databases
- Playwright, Husky, lint-staged, or complex GitHub Actions CI pipelines

## 5. Core User Flow

1. **Create screen:** Enter a topic or pasted study text; select tone (`casual`/`serious`), length (`quick`/`detailed`), and hosts (`2`/`3`).
2. **Generate state:** Display clear progress and a recoverable error state on failure.
3. **Multi-host player:** Play dialogue sequentially with active-speaker highlight, lightweight React/CSS avatar states, synchronized captions, progress display, and contextual visual slot.
4. **Download & replay:** Replay the episode, download combined audio (when verified), or download the transcript.

## 6. Minimal Episode Contract (WP-001 Baseline)

```ts
type HostRole = "explainer" | "learner" | "skeptic" | "storyteller" | "specialist" | "moderator";

type Host = {
  id: string; name: string; role: HostRole; voiceId: string; accentColor: string; avatarId: string;
};

type VisualCue = {
  type: "comparison" | "timeline" | "process" | "fact-card" | "none";
  title?: string;
  payload?: Record<string, unknown>; // Temporary WP-001 placeholder — replaced in WP-003
};

type DialogueSegment = {
  id: string; order: number; speakerId: string; text: string;
  emotion?: "neutral" | "curious" | "explaining" | "reacting";
  audioUrl?: string; durationMs?: number; visualCue?: VisualCue;
};

type Episode = {
  id: string; title: string; topic: string; tone: "casual" | "serious"; length: "quick" | "detailed";
  status: "mock" | "generating" | "ready" | "failed"; hosts: Host[]; segments: DialogueSegment[];
  combinedAudioUrl?: string; createdAt: string;
};
```

**Contract invariants:**
- `hosts` holds 2 or 3 items; every `segment.speakerId` must match a `host.id`; `order` is deterministic.
- `quick` targets 8–10 segments; `detailed` targets 12–15 segments.
- Generated media fields (`audioUrl`, `durationMs`, `combinedAudioUrl`) remain optional so mock episodes work before live APIs.
- **WP-003 mandatory refinement:** Replace loose `VisualCue.payload` with a strict discriminated union (`ComparisonVisualCue | TimelineVisualCue | ProcessVisualCue | FactCardVisualCue | NoVisualCue`) defining exact required fields, array bounds, max text lengths, Zod validation, valid/invalid fixtures, and frontend-safe fallback behavior before UI or Gemini integration begins.

## 7. AI, Segmented TTS, Playback & Persistence

- **Script generation:** Use one currently available Gemini Flash-class model verified against active account access in `WP-003` (never hard-code unverified/speculative model names). Keep the integration simple and single-provider.
- **Segmented TTS:** Generate speech per dialogue turn (not one uncontrolled multi-speaker clip) for reliable speaker switching, segment-level caption sync, visual cue triggers, measurable duration, single-segment retries, and consistent host voices. Limit concurrency to ~2–3 requests at a time.
- **WP-003 verification:** Inspect actual TTS response format (do not assume raw PCM or WAV beforehand), sample rate, bit depth, channels, container, voice availability, rate limits, retry behavior, browser playback, and Vercel compatibility.
- **Combined audio download:** Verify compatible audio parameters across turns, decode/stitch in dialogue order into one downloadable file (e.g., WAV), and verify in Chrome + one other player. If server stitching proves unreliable, keep sequential playback and treat combined download as a stretch goal — never fake it.
- **Player & demo video:** Native browser audio with a controlled sequential queue and React/CSS animations (no Canvas unless explicitly approved). Record the Devpost demo video via screen recording.
- **Persistence:** None in the initial skeleton (mock JSON, static sample, in-memory result, browser object URLs). If needed later, use a minimal Supabase layout: one `episodes` table (`jsonb` episode + minimal metadata) and one Storage bucket.

## 8. Contextual Visuals

Support one simple structured visual template (`comparison`, `timeline`, `process`, `fact-card`, or `none`) rendered by plain React components or simple SVG (e.g., comparing ₱100 purchasing power across two periods or illustrating a multi-step study concept). Never generate arbitrary images or unstructured payloads.

## 9. Quality, Schedule & Sprint Verification

- **Judging alignment (SLAY HACKS 2026):** Innovation & Originality, Technical Implementation, Real-World Impact, AI Integration & Responsible Use, User Experience & Presentation.
- **Required quality checks (once code exists):** TypeScript check, ESLint, production build, manual desktop + mobile-width testing, and 2–3 focused Zod schema tests if time permits.
- **Work packages & working schedule:**
  - **Days 1–2:** `WP-001` Foundation docs (Owner) -> parallel `WP-002` UI/UX research & wireframes (Lucky) + `WP-003` AI/audio spike (JR).
  - **Day 3:** `WP-004` Next.js skeleton + Vercel preview (Owner), `WP-005` Creation flow (Lucky), `WP-006` Mock Zod/API contract (JR), `WP-007` Mock multi-host player (Owner), `WP-008` Sprint verification.
  - **Days 4–7:** Real Gemini script generation, segmented TTS, sequential playback, active speaker/captions, combined WAV stitching attempt.
  - **Days 8–11:** Character animation, contextual visual, mobile polish, backup episode, full-team QA, demo video/screenshots, Devpost submission (internal cutoff Dec 7 Manila; emergency buffer thereafter).
- **Sprint 1 acceptance (`WP-008`):** Deployed mock app; working end-to-end flow on desktop & mobile widths; valid 2-host and 3-host mock episodes; zero exposed credentials; docs match repo.

## 10. Future Ideas (Post-Hackathon Roadmap)

Explicitly deferred beyond the current MVP:
- Broader domains (news, health, finance, business, entertainment), cultural localization controls, and dedicated language selection
- PDF/document ingestion, live news/web retrieval, evidence-linked claims, source timestamping, and conflicting-report classification
- Adaptive comprehension checks, quizzes, corrective follow-up conversations, and reading/audio/video mode switching
- Data-budget-aware downloads, offline/local LLM support, custom characters, richer animation, and optional minimal Supabase persistence

---
*Kuro is a provisional product name used for the hackathon prototype and may change following formal brand and trademark clearance.*
