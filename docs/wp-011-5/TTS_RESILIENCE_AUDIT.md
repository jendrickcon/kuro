# WP-011.5A — TTS Resilience & Gemini Quota Audit

> **Evidence Labels:** `[Verified]` direct repo/log inspection · `[Measured]` isolated spike/benchmark · `[Officially documented]` Google/provider docs accessed `2026-11-26` · `[Inferred]` engineering conclusion · `[Recommended]` proposed action · `[Unknown]` undocumented quota detail

## 1. Current Failure Diagnosis & Vercel Timeline
- **Primary Root Cause (`[Measured]`):** Google’s Free Tier enforces a strict **10 requests per day (RPD)** project-level quota on `gemini-3.8-flash-tts`, resetting at midnight Pacific time (`retry-after: 68036` seconds = `18h53m56s`). Sequential pacing (`1,500 ms`, concurrency `1`) mitigates per-minute bursts (`RPM`), not an already-exhausted daily quota (`RPD`).
- **Shared Quota Scope (`[Officially documented]` & `[Verified]`):** Gemini API quotas apply **per Google Cloud project, not per API key**. Local `.env.local` testing, Vercel Preview (`dpl_6kHVrRC6CK9cSo5CgrFfiVr1PwGF`), and Vercel Production (`dpl_4idt9mXNroiSazpEDw94A1fLpmK2`) share the same project quota.
- **Application Defects Found (`[Verified]`):**
  1. [gemini-tts-client.ts](../../src/lib/tts/gemini-tts-client.ts) rejects `retry-after > 120`s (`readRetryAfterSeconds` returns `undefined`), discarding `68036`s RPD reset headers.
  2. [retry-after.ts](../../src/lib/tts/retry-after.ts) defaults missing headers to `DEFAULT_RATE_LIMIT_COOLDOWN_MS = 8_000` (`"Retry available in 7s"`), misclassifying daily RPD exhaustion as a 7–8s transient RPM pause.
  3. [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts) treats all `429` errors as recoverable per turn and **Replay** retries every missing segment (`16` futile calls observed in Vercel logs).
  4. [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts) hard-caps `MAX_TTS_MODEL_CHOICES = 1` with no capacity failover to allowlisted `gemini-3.8-flash-lite-tts` (unlike [gemini-service.ts](../../src/lib/episode/gemini-service.ts)).
- **Recorded Failure Timeline (`2026-11-26`, `[Verified]` & `[Measured]`):**
  - `12:36:18.449Z` (Preview, `iad1`): `POST /api/episodes` -> `200 OK` (`9,265 ms`, `gemini-3.5-flash-lite` fallback).
  - `12:36:19.592Z` & `12:36:28.115Z` (Preview): `POST /api/tts` `seg_01` -> `429 TTS_RATE_LIMITED` (`229/96 ms`) -> `"Voice unavailable"` (`0 of 2`) -> **Continue with timed captions** -> `16` Replay calls (`12:37:44Z–12:39:54Z`) all `429`.
  - `12:53:39.123Z` (Production `dpl_4idt9mXNroiSazpEDw94A1fLpmK2`, `sin1`, after **14 min idle**): `POST /api/episodes` -> `200 OK` (`6,159 ms`); very first `POST /api/tts` at `12:53:40.500Z` -> immediate `429 TTS_RATE_LIMITED` (`181 ms`). Zero unhandled `500`s (`get_runtime_errors` empty across 24h).
  - `13:06:02.230Z` (Spike Call A): Direct `gemini-3.8-flash-tts` -> `429`, `retry-after: 68036`, `"limit: 10 requests per day on Free Tier"`.

## 2. Official Gemini TTS Documentation Audit (`2026-11-26`)
Sources: `speech-generation.md`, `models/gemini-3.8-flash-tts.md`, `models/gemini-3.8-flash-lite-tts.md`, `rate-limits.md`, `pricing.md` (`[Officially documented]`).

| Property | `gemini-3.8-flash-tts` | `gemini-3.8-flash-lite-tts` | Impact on Kuro |
| --- | --- | --- | --- |
| API / SDK | `v1beta` Interactions (`store: false`) | `v1beta` Interactions (`store: false`) | Zero new SDK (`@google/genai@3.6.1`) |
| Limits (In / Out) | `8,192` / `16,384` tokens | `8,192` / `16,384` tokens | Same `320`-char bound holds |
| Output Format | `audio/wav` (`24 kHz` mono PCM + `C2PA`) | `audio/wav` (`24 kHz` mono PCM + `C2PA`) | Matches [audio-inspect.ts](../../src/lib/tts/audio-inspect.ts) |
| Free Tier Terms | Free; data used to improve Google (`Yes`) | Free; data used to improve Google (`Yes`) | Public/free limit strict; not private |
| Free Quota | Observed `10 RPD` (`[Measured]`); RPM `[Unknown]` | Undisclosed publicly `[Unknown]`; >3/day verified | Needs separate/paid quota for scale |
| Paid Std (<=Dec 31, 2026) | `$0.50/1M` text; `$9/1M` audio (`$0.00225/10s`) | `$0.50/1M` text; `$6/1M` audio (`$0.0015/10s`) | Doubles `Jan 1, 2027` (`$18` / `$12` / 1M audio) |
| Paid Terms | Data NOT used to improve products (`No`); `$10/10m` spend cap Tier 1 | Same Paid Tier privacy (`No` training) | Billing Tier 1 (`$250` cap) resolves `10 RPD` |
| Languages | `>130` (incl. English, Filipino, Cebuano, Iloko) | `>100` (incl. English, Filipino, Cebuano, Iloko) | Preserves Taglish & English study topics |
| Multi-speaker | Max **`2` speakers** in `speech_config.speakers` | Max **`2` speakers** in `speech_config.speakers` | Breaks 3-Kuromate MVP in [SPEC.md](../../SPEC.md) |

## 3. Bounded Gemini Flash vs. Flash-Lite TTS Spike
Conducted outside the repository using `GEMINI_API_KEY` from local config (`~19.4s` live audio total, temp files deleted `[Verified]`):

| Call | Model & Voice | Status | Latency | Output | Measured Details (`[Measured]`) |
| --- | --- | --- | --- | --- | --- |
| Call A (13:06:02Z) | `gemini-3.8-flash-tts` (`Sulafat`) | **`429`** | `765 ms` | Quota error | `retry-after: 68036`; `limit: 10 requests per day on Free Tier` |
| Call B (+10s wait) | `gemini-3.8-flash-lite-tts` (`Sulafat`) | **`200`** | `3,482 ms` | Audio (`~8.6s`) | `22` input tokens, **`215` audio output tokens** (`outputs[]` block) |
| Call C (+3s wait) | `gemini-3.8-flash-lite-tts` (`Puck`) | **`200`** | `2,548 ms` | Audio (`~6.0s`) | `23` input tokens, **`150` audio output tokens** (`outputs[]` block) |
| SDK Check (12 words) | `gemini-3.8-flash-lite-tts` (`Sulafat`) | **`200`** | `2,999 ms` | `240,028 B` WAV | `4,840 ms`, `24 kHz` mono `pcm_s16le`, `fmt `+`data`+`C2PA` (`7,656 B`), `-15.77 dBFS` RMS |

- **Key Conclusions (`[Verified]` & `[Measured]`):**
  1. `gemini-3.8-flash-lite-tts` **does not share the exhausted `10 RPD` bucket** of `gemini-3.8-flash-tts`: it succeeded `3/3` times immediately after Call A’s `429`.
  2. Existing `6` Kuromate voice profiles (`Sulafat`, `Puck`, `Kore`, `Achird`, `Sadaltager`, `Erinome` in [voice-profiles.ts](../../src/lib/tts/voice-profiles.ts)) and `@google/genai` `v1beta` Interactions payloads work unchanged. *(Note: subjective listening comparison across all 6 profiles on Flash-Lite remains `[Unknown]` for the owner’s ear during review.)*
  3. On Free Tier, `1,500 ms` pacing (`~40 RPM` max) cannot exceed a project’s RPD budget: safest frequency for interactive Free Tier without billing is `1,500–2,000 ms` per call (`<=10` Flash + bounded Flash-Lite turns, `[Inferred]` <= ~`1–2` episodes/day without Paid Tier 1).

## 4. Multi-Speaker & Request-Granularity Decision Matrix
| Criterion | Option A: Per-Turn (`8–15` reqs) | Option B: Grouped `2–3` Turns (`3–6` reqs) | Option C: Full-Episode Multi-Speaker (`1` req) |
| --- | --- | --- | --- |
| **3-Kuromate `hosts[]` MVP** | **Full support** (up to 6+ roles) | Supported with speaker switching complexity | **Fails:** `[Officially documented]` hard limit = **`2` speakers** |
| **Caption & Visual Sync** | **Exact** (`onended` / turn boundaries) | Requires forced alignment / heuristic split | Poor: zero turn timestamps returned |
| **Failure Isolation & Retry** | **Per-turn retry + cached Replay** | Coarse rollback / broken boundary timing | Single failure loses whole episode |
| **RPM / RPD Pressure** | High (`8–15` reqs/ep) | Medium (`3–6` reqs/ep) | Lowest (`1` req/ep) |
| **Vercel Serverless Fit** | `3–5s`/req (`<=30s` limit safe) | `8–15s`/req (risks 30s timeout) | High timeout + payload risk (`>30s` / `>5 MB`) |
| **Hackathon Suitability** | **Best (`[Recommended]`)** | Poor cost/complexity tradeoff | Rejected (breaks 3 hosts & sync) |

## 5. Session-Level Client Circuit Breaker Design (`[Recommended]`)
Because Kuro intentionally excludes Redis/databases ([SPEC.md](../../SPEC.md)), stateful cross-tab tracking across serverless Vercel invocations is infeasible without adding infra. A **session-level client breaker** inside [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts) paired with server header classification solves repeated hammering:
- **Server signal (`[Recommended]`):** Preserve actual `Retry-After` seconds (`up to 86400s`) and classify `quotaScope: "rpm_transient"` (`<=120s`) vs `"rpd_exhausted"` (`>120s` or daily quota message) in `/api/tts` sanitized error metadata.
- **Client breaker rules:**
  1. `429` with `Retry-After > 120s` (RPD daily wall): **Never wait or loop 8s.** Immediately mark primary model exhausted for the session -> fail over cleanly to alternate hosted TTS (after user consent or bounded server switch) or enter `timed-captions`.
  2. `429` with `Retry-After <= 120s` (RPM burst): Enter shared cooldown for exact `Retry-After` (clamped `1–30s`). After **`2` consecutive capacity trips within `60s`** (or opening buffer exhaustion), open a **`45s` session cooldown** before attempting further background TTS calls; **Replay** skips permanently/daily-exhausted paths instead of re-sending 16 failing requests.
  3. A single successful `200 OK` closes the half-open probe cleanly.
