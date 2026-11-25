# Kuro — User Flow Specification (WP-002)

> **Product:** Kuro — *More voices. Clearer ideas.*
> **Primary Persona:** A commuting college student turning a difficult topic, class reading, or pasted study material into a short, engaging visual-audio conversation that is easier to understand and replay.

## 1. Commute Context & Primary Task
- **Context:** One-handed phone use on public transit, earphones in a noisy cabin, intermittent glance attention, small screen (320px+), limited prep time before class, and sensitivity to mobile data/reliability.
- **Primary Task:** Paste a confusing passage or enter a study topic, confirm defaults in seconds, listen/follow captions with one contextual visual, and replay or download before getting off the ride.

## 2. Single-Route State Architecture (`/`)
Kuro runs on one primary route (`/`) transitioning through three explicit UI states (`create` -> `generating` -> `player`), plus a compact **"Try sample episode"** button on `create` that opens the pre-generated backup episode immediately in `player`.

```text
[STATE 1: CREATE]
  |-- Enter topic/pasted text (or tap 1 study example chip)
  |-- Defaults pre-selected: Casual | Quick (8-10 turns) | 2 hosts (or toggle 3)
  |-- (Optional) "Try sample episode" --------------------------> [STATE 3: PLAYER (Backup)]
  v
[Click "Create conversation"] -> Client validation (10-4,000 chars)
  |-- Invalid -> Inline error linked via aria-describedby (stay in CREATE)
  v
[STATE 2: GENERATING]
  |-- 4 calm stages + indeterminate pulse ("Cancel & edit" returns to CREATE with text intact)
  |-- Fatal error -> [GENERATION ERROR] -> "Try again" OR "Edit topic" OR "Try sample episode"
  v
[STATE 3: EPISODE PLAYER]
  |-- All turns ready -> Sequential playback + active host + captions + contextual visual
  |-- Some turns missing audio -> [STATE 4: PARTIAL AUDIO NOTICE] (playable turns + captions for all)
  v
[REPLAY & EXPORT]
  |-- Replay from Turn 1
  |-- Download transcript (.txt / .md client-generated from validated script)
  |-- Download audio (combined file if verified; disabled + clear explanation if unavailable)
  |-- "New conversation" -> Returns to CREATE (preserves form clarity)
```

## 3. End-to-End Happy Path
1. **Create (`create`):** Student sees the Kuro header, a one-line value statement, one expandable textarea, and one optional example chip (*"Explain opportunity cost using a college student choosing between studying, commuting, and part-time work."*). Binary pills default to **Casual**, **Quick**, and **2 hosts** (student can tap **3 hosts**). Student taps **"Create conversation"**.
2. **Generate (`generating`):** Form transitions to a focused 4-stage progress card (`Understanding your topic` -> `Writing multi-host dialogue` -> `Recording host voices` -> `Preparing player`). If the student taps **Cancel & edit**, their input text and option choices are preserved.
3. **Play & Follow (`player`):** Episode opens ready to play (user taps Play to satisfy mobile autoplay policies, or plays immediately on direct user gesture where permitted). Hosts render dynamically from `hosts[]`; the active host highlights via ring, badge, and subtle scale; the current turn's caption updates in lockstep; when a turn carries a valid `visualCue`, the contextual visual card updates cleanly.
4. **Replay & Download:** At episode end (or anytime), the student can tap **Replay**, **Download audio** (when verified stitched audio exists), **Download transcript**, or **New conversation**.

## 4. Generation Failure Path
- **Trigger:** Network drop, rate limit, timeout, or invalid script response.
- **Behavior:** Show a calm, non-technical error card explaining what failed without clearing the student's pasted notes.
- **Actions:** Primary **"Try again"** (retries same payload), secondary **"Edit topic"** (returns to `create` with input intact), and subtle **"Open sample episode"** fallback so a user or judge is never stranded.
- **Rule:** Never display a faked or empty episode player on failure.

## 5. Partial-Audio Path (State 4)
- **Trigger:** Script validated cleanly, but one or more dialogue turns failed TTS synthesis (`audioUrl` missing on those segments).
- **Behavior:** Open the player with a dismissible/non-blocking `PartialAudioNotice` banner at top. Available turns play normally; when playback reaches a turn without audio, highlight the active speaker, show its caption with a subtle `"Audio unavailable — showing caption"` tag, and either hold briefly (~4s) or let the student tap **Next turn** (never freeze or skip silently).

## 6. Download Path
- **Transcript download:** Always available once script exists; exports speaker-labeled plain text (`[Host Name (Role)]: text`) locally in the browser with zero extra network cost.
- **Combined audio download:** Enabled only when `combinedAudioUrl` is verified ready. Shows brief `"Preparing file..."` state if assembling blob. If unavailable (stitching failed or mock-only mode), button renders disabled with inline note: `"Combined audio unavailable for this episode — replay here or download the transcript."`

## 7. Demo Video & Screenshot Plan
- **Primary hackathon screenshot:** Desktop `player` state mid-episode with 3 hosts (or 2 hosts), active-speaker badge, crisp caption, and a `Comparison` visual card side-by-side.
- **Demo video (60–90s screen recording):** Create screen (paste/tap opportunity-cost study prompt, pick `Casual` / `Quick` / `3 hosts`) -> calm generation stages -> live multi-host playback across 2–3 speaker handoffs with synced captions & contextual visual -> Replay + Transcript & Audio download (keep backup episode ready if live API stalls).
