# WP-011.5A — Recommended Architecture & Implementation Plan (`WP-011.5B`)

> **Evidence Labels:** `[Verified]` · `[Measured]` · `[Officially documented]` · `[Recommended]` · `[Inferred]`

## 1. Four Proposed Architecture Options Compared
| Dimension | Arch 1: Gemini-Only (`Flash -> Flash-Lite -> Captions`) | Arch 2: Hosted Dual-Provider (`Gemini -> Deepgram/Azure -> Captions`) | Arch 3: Hosted + Optional Local (`Gemini -> Opt-in Kokoro -> Captions`) | Arch 4: Hybrid Resilient (`Gemini -> Fallback -> Opt-in Kokoro -> Captions`) |
| --- | --- | --- | --- | --- |
| **Quota Independence** | Moderate (separate Flash-Lite RPD `[Measured]`, same Google account) | **Complete** (`$200` Deepgram / `500k` Azure separate quota) | Full fallback once `109 MB` downloaded | **Maximum** (`Flash-Lite` / `Aura-2` + local opt-in) |
| **Client Data & Privacy** | Text leaves device (`Paid`: no train; `Free`: Google trains) | Text sent to 2nd provider (`mip_opt_out` / Azure no train) | Local stays on-device after CDN download | Local stays on-device after opt-in; hosted stays server-side |
| **Mobile Impact** | Clean (`~2.2 MB`/8-turn episode, zero extra JS) | Clean (`~2.2 MB`/8-turn episode, zero extra JS) | Heavy (`~109 MB` download, `540+ MB` RAM risk) | Clean default if local mode is desktop opt-in only |
| **Hackathon Readiness** | **Fastest (`0` new accounts/CC/SDKs)** | Fast (`1–2` days; needs external API key/account) | Low (`RTF > 2` CPU risk + eSpeak GPL ambiguity) | Defer local layer; ship hosted core cleanly in `WP-011.5B` |

## 2. Fallback Policy & User-Facing Disclosure Design (`[Recommended]`)
- **Failover Order (`WP-011.5B`):** `1.` Primary `gemini-3.8-flash-tts` -> `2.` Secondary `gemini-3.8-flash-lite-tts` (or `DEEPGRAM_API_KEY` if later enabled) -> `3.` *(Post-hackathon)* Opt-in desktop local pack -> `4.` Explicit **Timed Captions**.
- **Switch vs. Immediate-Stop Triggers:**
  - *Auto-switch once on same request (`/api/tts`):* Primary `429` (`rpd_exhausted` or after `1` RPM cooldown fails), `503 TTS_PROVIDER_UNAVAILABLE`, `504 TTS_TIMEOUT`, transient `502 TTS_AUDIO_INVALID` after 1 regen -> **capped at 1 server switch**.
  - *Immediate stop (`0` retries, `0` fallback):* Invalid input (`400`), `503 TTS_NOT_CONFIGURED` (no key), auth `401`/`403`, safety rejection.
- **Voice Consistency, Normalization & Replay:** Cached primary clips **remain reusable** alongside fallback clips for missing turns (no mid-episode wipe needed), normalized near `-16 dBFS` metadata awareness (`Flash -16.9..-18.9` vs `Flash-Lite -15.77` WAV `24 kHz` mono PCM — compatible for WP-012 stitching). Disclose voice shifts clearly without exposing raw model IDs:
  - *Copy:* `"Hosted voice service is busy. Continue with an alternate Kuromate voice?"` (and post-hackathon: `"Use local voice mode on this device?"`).

## 3. Phased Rollout Options & Section 27 Final Recommendation
- **Option A (`[Recommended]` Hackathon `WP-011.5B`):** Server-side `gemini-3.8-flash-lite-tts` failover + full `Retry-After > 120s` RPD classification + session circuit breaker + disclosure. **Effort:** ~`3–4 hours` (`Low` risk, `High` benefit).
- **Option B (Optional Local Kokoro Pack):** Opt-in worker (`q8`, size warning, IndexedDB/Cache). **Effort:** ~`2–3 days` (`Medium-High` risk due to `RTF > 2` CPU & GPL phonemizer review). Defer post-hackathon.
- **Option C (Independent Hosted Backup — Deepgram Aura-2 / Azure):** Add REST adapter (`fetch` only). **Effort:** ~`4–6 hours` (`Low-Medium` risk, needs separate API account). Recommended if Flash-Lite RPD proves small under multi-judge traffic or as Phase 2.

```text
Preferred architecture:
Architecture 4 (Hybrid resilient stack) long-term; Architecture 1 extended with independent secondary-provider readiness for the hackathon.

Hackathon implementation:
WP-011.5B: Server-side Flash TTS -> bounded 1-switch failover to gemini-3.8-flash-lite-tts (with optional Deepgram Aura-2 REST adapter hook behind env toggle), full Retry-After (>120s) RPD detection, session circuit breaker, voice-switch disclosure, and Timed Captions.

Post-hackathon implementation:
Paid Tier 1 Gemini TTS + Deepgram Aura-2 / Azure Speech backup + optional desktop-only user-enabled Kokoro.js (q8) Web Worker pack after eSpeak GPL clearance.

Hosted fallback:
gemini-3.8-flash-lite-tts (immediate zero-account backup with proven separate RPD); Deepgram Aura-2 REST (independent external backup, $200 no-CC credit).

Local fallback:
None in hackathon MVP (Kokoro.js deferred behind explicit desktop opt-in in post-hackathon WP).

Emergency fallback:
Explicit Timed Captions mode (browser speechSynthesis rejected).

Reason:
Live probes proved 10 RPD on gemini-3.8-flash-tts triggered endless 8s retries because readRetryAfterSeconds discarded Retry-After > 120s, while gemini-3.8-flash-lite-tts succeeded 3/3 times with identical 24 kHz WAV output and Kokoro q8 ran too slowly on CPU (RTF 1.86-2.76, ~109 MB download, GPL phonemizer risk) for commuter mobile MVP.
```

## 4. `WP-011.5B` Implementation Plan (Execution Blueprint — Requires Owner Approval)
- **Package / Branch:** `WP-011.5B` · branch `feat/wp-011-5-tts-fallback` (from updated `main`).
- **Expected Files Changed:** `src/lib/tts/gemini-tts-client.ts`, `gemini-tts-service.ts`, `tts-contract.ts`, `tts-route-handler.ts`, `retry-after.ts`, `episode-audio-queue-engine.ts`, `src/hooks/use-episode-audio-queue.ts`, `src/components/kuro/generation-status.tsx`, `player/audio-status-bar.tsx`, `player/player-notice.tsx`, `.env.example`, `scripts/test-tts.mjs`, `scripts/test-audio-queue.mjs`, `docs/wp-011-5/`.
- **Dependencies:** **`0` new npm packages** (`@google/genai@3.6.1` + native `fetch`). **Env vars:** Server-only `GEMINI_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts` (default fallback), optional `GEMINI_API_KEY` Tier-1 billing, zero `NEXT_PUBLIC_*`.
- **Data Flow & Call Bounds:**
  `Browser Queue -> POST /api/tts -> gemini-3.8-flash-tts (max 1 attempt)` --(`429`/`503`/`504`)--> `gemini-3.8-flash-lite-tts (max 1 attempt)` -> `RIFF inspect -> 200 WAV + X-Kuro-Voice-Fallback` OR `429 (Retry-After + quotaScope: rpm_transient | rpd_exhausted)` -> `Client Circuit Breaker -> Disclosed Alternate Voice OR Timed Captions`. Max `2` upstream calls per HTTP `/api/tts` request (`MAX_TTS_PROVIDER_ATTEMPTS = 2` preserved!).
- **Circuit Breaker, UI & Accessibility:** Preserve `Retry-After` up to `86,400s` (`readRetryAfterSeconds` returns full seconds); mark `rpd_exhausted` (`Retry-After > 120s`) in session state so Replay does not fire `16` hopeless `429`s; surface `aria-live="polite"` status + disclosure notice when fallback model active; keep `min-h-11` buttons and mobile disclosure (`320px` safe). Mobile-data disclosure unnecessary in `WP-011.5B` (`0` large model downloads).
- **Test & Live Verification Matrices:** Extend `test:tts` (RPD `68036`s header propagation, `rpd_exhausted` classification, single server switch `Flash -> Flash-Lite`, auth/safety no-failover, max `2` provider calls, optional Deepgram toggle check) and `test:audio-queue` (session circuit opens on RPD without 8s loop, Replay skips exhausted model, disclosed notice clears properly). Live test: generate `8`-turn episode on Vercel Preview & `:3000`, verify fallback switch + captions + logs + `320×640`.
- **Vercel Setup & Rollback:** Add optional `GEMINI_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts` to Preview/Production; instant rollback via setting `GEMINI_TTS_FALLBACK_MODEL=none` / empty or reverting merge commit.
- **Acceptance Criteria:** `1)` Zero infinite `"Retry available in 7s"` on RPD limit; `2)` `Flash 429 -> Flash-Lite 200` within `<= 2` provider calls; `3)` All existing `test:schema`/`generation`/`tts`/`audio-queue`/`typecheck`/`lint`/`build` pass; `4)` Zero secrets/model IDs in `.next/static`.
- **Stop Conditions & Exclusions:** Stop before adding Tier 1 billing, adding external paid keys without owner approval, downloading local models, adding Redis/DB/WP-012 audio download/WP-013 redesign. **Estimated Effort:** `3–4 hours` (focused backend + queue/UI sprint).
