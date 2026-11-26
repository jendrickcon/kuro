# WP-011 Technical Findings — Full Episode Audio Queue, Prefetching, and Synchronization

## 1. Queue Architecture & Synchronization
- **Orchestrator:** `src/lib/tts/episode-audio-queue-engine.ts` (`createEpisodeAudioQueueEngine`) wrapped for React by `src/hooks/use-episode-audio-queue.ts` and `src/components/kuro/player/audio-status-bar.tsx`.
- **Single-element synchronization:** Reuses one controlled `HTMLAudioElement` per episode session (`loadAndPlay`, `resume`, `pause`, `stop`, `dispose`). Active speaker (`PodcastStage`), `CaptionPanel`, progress bar, and `ContextualMonitor` stay strictly bound to `entries[currentIndex]`.
- **Turn progression & guards:** Advances strictly on native `ended` (or explicit per-turn fallback timer when that turn failed). Dual `sessionToken` + `playbackToken` counters reject stale `ended`, `play`, `error`, or late fetch completions across Pause/Resume, `Prev`/`Next`, `Restart`, `Replay`, episode changes, and unmount.

## 2. Concurrency, Lookahead & Retry-After Policy
- **Concurrency cap (`MAX_TTS_CONCURRENCY = 2`):** Never exceeds 2 simultaneous `POST /api/tts` calls (`Concurrency 3` blocked by design per WP-010 3/3 `429` evidence).
- **Priority & lookahead (`PREFETCH_LOOKAHEAD = 2`):** Always prioritizes `currentIndex`, filling remaining slot capacity within `[currentIndex .. min(last, currentIndex + 2)]`. Pauses speculative lookahead (`idx > currentIndex`) if `consecutiveCapacityFailures > 0`, `paused`, `cooldownActive`, or `outageState !== "none"`.
- **Shared `Retry-After` cooldown (`src/lib/tts/retry-after.ts`):** Parses numeric seconds and HTTP-date headers, clamped to `1s–30s` (default `8s`), managed by one shared `cooldownTimer`. Cancellation during cooldown prevents future resume; pausing during cooldown prevents auto-fetching upon expiry until the user presses `Play`.

## 3. Attempt Bounds & Whole-Episode Maximums
- **Per-segment client limit:** `MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT = 2` (`1` initial + `1` post-cooldown capacity retry on `429`/`503`/`504`; `0` retries on `TTS_NOT_CONFIGURED`, auth `401`/`403`, safety, `INVALID_TTS_INPUT`, `TTS_AUDIO_INVALID`, or decode failures).
- **Per-segment provider cap:** `3` typical worst-case upstream calls (capacity fail + post-cooldown retry hitting max `1` server empty-audio regeneration), bounded strictly by client cap × server cap (`2 × 2 = 4`).
- **Whole-episode theoretical maximum:** Quick (8–10 turns): `8–10` normal, `16–20` max client calls (`<= 32–40` theoretical max upstream calls). Detailed (12–15 turns): `12–15` normal, `24–30` max client calls — capped earlier by `OUTAGE_CONSECUTIVE_CAPACITY_FAILURES = 2`.

## 4. Cache & Object-URL Lifecycle
- **Session-only cache:** In-memory active-episode entries keyed by `episodeId:segmentId:speakerId:role:fnv1aHash(text)`. Zero IndexedDB, `localStorage` blobs, or backend storage. Replay/Restart/Prev reuse cached clips (`0` refetches).
- **Object URL pool (`createEpisodeObjectUrlPool`):** Guarantees every blob URL is revoked **exactly once** upon cache replacement, decode failure, `Back to form`, episode switch, or unmount.

## 5. Partial-Failure & Timed Fallback Policy
- Any failed turn preserves its caption, contextual visual, and future segments, showing `"Voice unavailable for this turn. Continuing with captions."` and advancing via bounded fallback duration (`getSegmentDurationMs`), with manual **`Retry voice`** and **`Skip audio and continue`**.
- **Outage stop threshold:** Immediately halts background generation on `TTS_NOT_CONFIGURED` or auth errors (`0` retries), or after `2` consecutive exhausted capacity failures, surfacing **`Continue with timed captions`**, **`Retry hosted audio`**, and **`Return to form`**.
- Autoplay rejection on sequential turns pauses safely on that turn with **`Tap to continue audio`** (zero silent skip, zero `speechSynthesis`).

## 6. Hosted Live Test & Missing-Key Evidence
- **Generated 2-Kuromate quick episode (`Understanding Opportunity Cost`, 8 turns, `localhost:3000`):**
  - `6/8` hosted WAV clips (`6,850–9,560 ms`, avg latency `3,813 ms`, max in-flight concurrency `2`). Live `429` bursts triggered shared cooldown + explicit fallback cleanly (`seg_04`, `seg_07` timed fallback while captions/visuals stayed synced); **`Retry hosted audio`** resumed and completed turn `8/8`.
  - **Controls:** **`Replay`** replayed cached turns `1–3` with `0` extra `/api/tts` calls; **Pause/Resume** preserved turn `3` without refetching; **Prev/Next/Restart/Back to form** worked cleanly (`0` console/hydration errors; `0` requests to `generativelanguage.googleapis.com`).
- **Generated 3-Kuromate quick episode (`Active Recall vs Rereading on Your Commute`, 8 turns):** Played Turn 1 hosted (`6,580 ms`), auto-advanced across all `3` seats cleanly (`320x640`, `390x844`, `768x900`, `1280x800` zero horizontal overflow or button overlap).
- **Missing-key check (`localhost:3001`):** Sample episode `Play` returned `503 TTS_NOT_CONFIGURED` (`<= 2` calls, zero retry storm), halted cleanly, and **`Continue with timed captions`** ran timed playback across turns cleanly.

## 7. Local WAV Stitching Spike Verdict
- **Verdict: Verified for future integration.**
- Fetched `2` live `/api/tts` clips (`233,308 B` / `4,700 ms` + `215,548 B` / `4,330 ms`), stripped headers + trailing `7,656 B` `C2PA` metadata chunks via pure-TS RIFF parser, concatenated raw `24 kHz` mono `16-bit` PCM (`433,440 B`), wrote temporary combined `.wav` (`433,484 B`, exact `9,030 ms`, RMS `-18.8 dBFS`, zero embedded `RIFF`/`C2PA`), verified deletion of temp file (`0` audio committed).

## 8. Vercel Preview & Deferred Scope
- **Vercel Preview:** Auto-deployed on PR creation; requires server-only `GEMINI_API_KEY`, `GEMINI_TTS_MODEL=gemini-3.8-flash-tts`, `GEMINI_TEXT_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`, `KURO_GENERATION_MODE=live` (zero `NEXT_PUBLIC_*`).
- **Deferred:** Persistent audio storage, production combined audio download UI, offline caching, video export.
