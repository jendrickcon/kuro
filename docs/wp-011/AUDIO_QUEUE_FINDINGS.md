# WP-011 Technical Findings — Full Episode Audio Queue, Prefetching, and Synchronization

## 1. Queue Architecture & Synchronization
- **Orchestrator:** `src/lib/tts/episode-audio-queue-engine.ts` (`createEpisodeAudioQueueEngine`) wrapped for React by `src/hooks/use-episode-audio-queue.ts`, `src/components/kuro/player/audio-status-bar.tsx`, and `src/components/kuro/player/caption-panel.tsx`.
- **Single-element synchronization:** Reuses one controlled `HTMLAudioElement` per episode session (`loadAndPlay`, `resume`, `pause`, `stop`, `dispose`). Active speaker (`PodcastStage`), `CaptionPanel`, progress bar, and `ContextualMonitor` stay strictly bound to `entries[currentIndex]`.
- **Turn progression & guards:** Advances strictly on native `ended` (or explicit per-turn fallback timer when that turn failed). Dual `sessionToken`, `playbackToken`, and `replayCycleToken` counters reject stale `ended`, `play`, `error`, and late pre-replay/pre-abort responses across Pause/Resume, `Prev`/`Next`, `Restart`, `Replay`, episode changes, and unmount.

## 2. Concurrency, Lookahead & Retry-After Policy
- **Concurrency cap (`MAX_TTS_CONCURRENCY = 2`):** Never exceeds 2 simultaneous `POST /api/tts` calls (`Concurrency 3` blocked by design per WP-010 3/3 `429` evidence).
- **Priority & lookahead (`PREFETCH_LOOKAHEAD = 2`):** Always prioritizes `currentIndex`, filling remaining slot capacity within `[currentIndex .. min(last, currentIndex + 2)]`, narrowing lookahead to `1` after an exhausted capacity failure and pausing speculative lookahead while `paused`, `cooldownActive`, or `outageState !== "none"`.
- **Shared `Retry-After` cooldown (`src/lib/tts/retry-after.ts`):** Parses numeric seconds and HTTP-date headers, clamped to `1s–30s` (default `8s`), managed by one shared `cooldownTimer`. Cooldown stays intact across `provider_outage` so `Retry hosted audio` and `Retry voice` display `"Retry available in Xs"` while disabled; cancelling or pausing prevents unrequested auto-fetches when cooldown expires.

## 3. Attempt Bounds & Whole-Episode Maximums
- **Per-segment automatic limit:** `MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT = 2` (`1` initial + `1` post-cooldown capacity retry on `429`/`503`/`504`; `0` retries on `TTS_NOT_CONFIGURED`, auth `401`/`403`, safety, `INVALID_TTS_INPUT`, `TTS_AUDIO_INVALID`, or decode failures).
- **Per-cycle manual retry limit:** `MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE = 1`, `MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE = 3` (`2` auto + `1` manual per segment per cycle, reset only by a new episode or explicit `Replay` / cycle restart after cooldown).
- **Per-segment provider cap:** `3` typical automatic upstream calls (capacity fail + post-cooldown retry hitting max `1` server empty-audio regeneration), bounded strictly by `MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT × 2 = 4` (plus at most `1–2` upstream calls on explicit user `Retry voice`).
- **Whole-episode theoretical maximum:** Quick (8–10 turns): `8–10` normal, `16–20` max auto client calls (`<= 32–40` theoretical max upstream calls). Detailed (12–15 turns): `12–15` normal, `24–30` max auto client calls — halted earlier by `OUTAGE_CONSECUTIVE_CAPACITY_FAILURES = 2`.

## 4. Transient Failure Recovery on Replay & Targeted Retry (PR #6 Patch)
- **Root causes fixed:**
  1. `replay()` (and `play()` from `complete`) previously left transiently failed segments in `"failed"`, leaving turns silent even after cache reuse (`6 of 8 turns ready`).
  2. All segment failures collapsed into untyped `"failed"` without distinguishing recoverable (`rate_limited`, `provider_unavailable`, `timeout`, `network`, bounded audio failure) from permanent (`configuration`, `auth`, `invalid`, `safety`).
  3. `retryCurrentSegment()` lacked a per-cycle bound, cleared cooldown timers, and pumped unrelated turns.
  4. Re-entering `"skipped"` or `"cancelled"` turns could stay stuck preparing, and `CaptionPanel` showed `"Audio unavailable — showing caption"` whenever `audioAvailability === "partial"` even on cached/recovered clips.
  5. `handleOutageTriggered("provider_outage")` cleared `cooldownTimer`, dropping active `Retry-After` countdowns on `Retry hosted audio`.
- **Failure classification (`SegmentFailureClass`):**
  - *Transient/recoverable:* `429` (`TTS_RATE_LIMITED`), `503` (`TTS_PROVIDER_UNAVAILABLE`), timeouts (`504`/`RequestAbortedError`), transient network errors, and generic retryable synthesis/playback failures (`unknown_retryable`).
  - *Permanent/non-retryable:* `TTS_NOT_CONFIGURED`, `401`/`403` auth errors, `INVALID_TTS_INPUT`, safety policy rejections, and explicit `retryable === false` errors (`manualRetryAllowed = false`).
- **Replay & completion recovery policy:** Preserves every cached segment (`objectUrl !== null`, `0` refetches), resets only eligible transient failures (plus stale `"skipped"`/`"cancelled"` entries) to `"idle"` with fresh `manualRetriesUsedInCycle = 0`, aborts stale in-flight fetches under a bumped `replayCycleToken`, honors active `Retry-After` cooldowns before regenerating, preserves permanent failures cleanly as timed captions, and never clears active `Audio unavailable` state onto already recovered turns.
- **Targeted `Retry voice` policy:** Operates strictly on `entries[currentIndex]` (`0` unrelated segment calls, preserves all cached clips and active `Retry-After` cooldown), enforces `"Retry available in Xs"` disabled countdown + rapid-click/in-flight dedupe + `1` retry per cycle, clears `"Audio unavailable — showing caption"` on success, and returns cleanly with `"Voice unavailable again — continuing with captions."` on repeat failure.

## 5. Cache & Object-URL Lifecycle
- **Session-only cache:** In-memory active-episode entries keyed by `episodeId:segmentId:speakerId:role:fnv1aHash(text)`. Zero IndexedDB, `localStorage` blobs, or backend storage. Replay/Restart/Prev reuse cached clips (`0` refetches).
- **Object URL pool (`createEpisodeObjectUrlPool`):** Guarantees every blob URL is revoked **exactly once** upon cache replacement, decode failure, `Back to form`, episode switch, or unmount.

## 6. Browser, Proxy & Automated Evidence
- **Automated Node checks:** `test:schema` (`11/11`), `test:generation` (`33/33`), `test:tts` (`28/28`), and `test:audio-queue` (`50/50` assertions covering `33` baseline checks + `P1`–`P25` Replay/targeted-retry recovery, cooldown enforcement, stale-response rejection, and zero `speechSynthesis`).
- **Live `/api/tts` browser verification (`localhost:3000`, Sample Episode `9` turns):** Pressing **Play** triggered `4` `POST /api/tts` calls in two batches (`~9s` cooldown spacing), all returning live Gemini free-tier HTTP `429`. Bounded outage circuit breaker halted cleanly at `"Hosted audio unavailable"` (`0` retry storm, `0` console/hydration errors, `0` requests to `generativelanguage.googleapis.com`, `320x640` mobile check zero overflow).
- **Deterministic local proxy browser verification (`localhost:3002` -> unmodified production build `127.0.0.1:3001`, explicit mock `/api/tts` 429/503 + real playable 24kHz WAV):**
  - *Replay recovery (`mode=replay`):* Pass 1 completed at `7 of 9 turns ready` (`seg_02` and `seg_05` timed out twice with `429 Retry-After: 2`). **Replay** completed at `9 of 9 turns ready`, clearing `"Audio unavailable — showing caption"` cleanly with `0` refetches for all `7` cached turns (`totalCalls = 13`, `maxConcurrent = 2`, synchronized speakers/captions).
  - *Targeted retry recovery (`mode=retry-ok` + `320x640`):* Paused Turn 2 (`seg_02`) displayed disabled `"Retry available in 4s"` -> `"3s"` during cooldown; `320x640` stacked cleanly (`305px <= 320px`, `44px` controls); clicking **Retry voice** after cooldown fetched ONLY `seg_02` (`callsBySegment.seg_02 = 3`, `0` refetches on `seg_01`/`seg_03`), removed `"Audio unavailable — showing caption"`, and incremented `2 -> 3 of 9 turns ready`.
  - *Targeted retry second failure (`mode=retry-fail`):* Clicking **Retry voice** against `503` showed `"Voice unavailable again — continuing with captions."`, disabled the Retry button (`disabled: true`), and capped `seg_02` at `3` calls max (`0` console/hydration errors).
- **Baseline WP-011 live run & stitching spike (prior to final patch):** Initial `6/8` quick live episode (`Understanding Opportunity Cost`, `3,813 ms` avg WAV latency), `3`-Kuromate `4`-viewport layout check, `localhost:3001` missing-key `503 TTS_NOT_CONFIGURED` check, and RIFF/C2PA WAV stitching spike (`9,030 ms` temp WAV deleted after verification).

## 7. Vercel Preview, Quota & Deferred Scope
- **Quota reality:** Google free-tier Gemini TTS RPM/RPD limits can still rate-limit live `gemini-3.8-flash-tts` bursts (`429`); transient recovery makes previously skipped turns recoverable via **Replay** and **Retry voice** without re-billing cached clips once quota headroom returns.
- **Vercel Preview:** Auto-deployed from `feat/wp-011-full-episode-audio`; direct automated access without a Vercel team session returns `401` Deployment Protection.
- **Deferred:** Persistent audio storage, production combined audio download UI, offline caching, video export.
