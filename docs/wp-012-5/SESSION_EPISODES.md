# WP-012.5 — Episodes from This Session Specification

> **Package:** `WP-012.5` — Product Experience Architecture and Workflow Prototype *(Owner-Led: Jendrick)*
> **Baseline:** `origin/main` `fe21cf1` (`WP-012` + roadmap sync merged; implemented via `createSessionEpisodeStore` with `MAX_SESSION_EPISODES = 5`) `[Verified]`

---

## 1. Strict In-Memory Scope & Architectural Constraints (`[Verified]` & `[Proposed]`)

Per locked Owner Decision #2, [SPEC.md](../../SPEC.md) Section 4 exclusions, and `scripts/test-audio-queue.mjs` Check #45 (`[Verified]`):

- **In-memory session store ONLY:** `SessionEpisodeStore` lives strictly in React/browser memory for the active tab session.
- **Prohibited APIs in `src/`:** Do **NOT** use `localStorage.setItem`, `indexedDB`, or `caches.open` anywhere in `src/` (`test-audio-queue.mjs` Check #45 hard-fails if any file in `src/` references `indexeddb`, `caches.open`, or `localstorage.setitem` `[Verified]`).
- **Prohibited claims:** Never display *"Cloud library"*, *"Account history"*, *"Saved across devices"*, *"Synced"*, or *"Permanent storage"*.
- **Memory & Blob lifecycle:** Every compiled episode kept in the session list retains its compiled WAV Blob(s) / object URLs strictly inside an explicit session pool, revoking all object URLs cleanly via `URL.revokeObjectURL` when the user removes an episode from the session or closes/unmounts the app `[Verified]`.
  - *(Memory guard `[Proposed]`: cap in-memory live generated session episodes sensibly — e.g., latest `5–8` episodes, ~2–5 MB WAV each — or prompt cleanly if older URLs are evicted.)*

---

## 2. Honest Copy & Non-Persistence Disclosure (`[Proposed]`)

Screen 5 must display this exact disclosure prominently above the session list:

> **Episodes generated in this session are not saved permanently.**
> *Refreshing or closing this tab clears generated audio from memory. Download `.wav` audio or `.txt` transcripts to keep an episode offline.*

Empty state (when no generated episode exists yet in this session):
- Clear plain-English summary: *"No episodes created in this session yet."*
- Primary CTA: **`Create a new episode`** (→ Screen 2)
- Secondary option: Built-in **`Sample Preview`** remains visible in its own dedicated section below so Screen 5 is never a dead screen on first visit.

---

## 3. Episode-Card Fields & Placement (`[Proposed]`)

Screen 5 cleanly separates **Current-Session Episodes** from **Built-in Sample & Future `WP-018` Backup Episodes** so users never confuse a live generated episode with a static demo:

### Card Data Fields
| Field | Source | Display Rule |
| --- | --- | --- |
| **Title** | `episode.title` (`<= 80` chars) | Clear heading (`text-wrap: balance`), `2`-line clamp max |
| **Source / Status Badge** | `source` (`generated` / `mock` / `sample` / future `backup`) | `Session episode` (with `Full WAV ready` or `Partial opening batch`), `Sample preview (captions only)`, or reserved slot label for `WP-018` pre-generated backup |
| **Topic Excerpt** | `episode.topic` | Single concise preview line (`line-clamp-2`) |
| **Cast & Parameters** | `episode.hosts[]`, `episode.tone`, `episode.length` | Dynamic host chips (`Maya`, `Leo`, optional `Sam`) + `Casual/Serious · Quick/Detailed · N turns` |
| **Duration & Timestamp** | `fullDurationMs` / `compiledDurationMs`, `createdAt` | `MM:SS` in `tabular-nums` + relative/clock timestamp (`e.g., Created 11:42 AM`) |
| **Asset Availability** | `canDownloadAudio`, transcript text | Clear non-color badges: `Audio WAV ready` / `Opening batch only` / `Captions preview` + `Transcript ready` |

---

## 4. Replay, Download & Delete Actions (`[Proposed]`)

Each session episode card supports up to 4 clear, accessible (`>= 44×44px`) actions:

1. **`Play again` (or `Continue listening` if mid-episode):**
   - Loads that episode directly into **Screen 4 (`9:16` Portrait Player)** using its already-compiled in-memory WAV/timeline (**`0` duplicate `/api/tts` calls** when 100% compiled `[Verified]`).
   - If a Detailed episode was only partially compiled before the user stepped out, resumes compilation cleanly from its preserved PCM clips without re-requesting valid turns.
2. **`Download WAV`:**
   - Enabled strictly when `100%` of spoken turns passed verification and `fullWavBlob !== null` (`kuro-episode-<slug>.wav`). Disabled with honest status text on `Sample Preview` or uncompiled Detailed episodes `[Verified]`.
3. **`Download transcript`:**
   - Generates and downloads `.txt` transcript cleanly via `buildEpisodeTranscriptText` (`src/lib/episode/transcript.ts` `[Verified]`).
4. **`Remove from session`:**
   - Deletes the episode from in-memory React state and immediately calls `URL.revokeObjectURL` on its Blob URLs so browser memory stays clean.
- Footer / Header CTA: **`Create another episode`** (→ Screen 2).

---

## 5. Sample & Future `WP-018` Backup Placement (`[Proposed]`)

- **Built-in Sample Episode:** Placed in a dedicated **"Sample & Backup Demos"** card group on Screen 5 labeled **`Sample Preview (No live keys required · Captions only)`**, launching Screen 4 with `source === "sample"` and `canDownloadAudio === false`.
- **Reserved `WP-018` Backup Slot (`[Proposed]`):** Design Screen 5's card list cleanly so `WP-018` can later append 1–2 polished pre-generated backup episodes (`source: "backup"`) into that same section without changing Screen 5's layout or card grammar.
