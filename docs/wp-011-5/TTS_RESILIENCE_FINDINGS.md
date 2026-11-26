# WP-011.5 — TTS Resilience Findings and Hosted Fallback Architecture

> **Evidence Key:** `[Verified]` code/GitHub/header inspection · `[Measured]` live/isolated timing & byte probe (`2026-11-26`) · `[Officially documented]` vendor docs & licenses · `[Inferred]` capacity/cost estimate · `[Recommended]` selected design · `[Deferred]` post-hackathon option

## 1. Root Cause & Primary Quota Evidence
- **`gemini-3.8-flash-tts` Daily Limit (`[Verified]` & `[Measured]`):** Live `v1beta` `interactions.create` calls returned `HTTP 429` with `"Rate limit exceeded for model gemini-3.8-flash-tts (limit: 10 requests per day on Free Tier)."`, `Retry-After: 68036` (~`18h 54m` during initial audit) and `65877` / `65803` (~`18h 17m` during runtime Matrix A/C), resetting around midnight Pacific time.
- **Shared Project Pool (`[Verified]`):** Local `.env.local`, Vercel Preview, and Vercel Production share the same `GEMINI_API_KEY` Google Cloud project quota. Once `10 RPD` is spent on primary Flash TTS, subsequent requests fail with `429` regardless of client `1,500 ms` pacing or concurrency `1`.
- **Previous Kuro Defect (`[Verified]`):** [gemini-tts-client.ts](../../src/lib/tts/gemini-tts-client.ts) discarded `Retry-After > 120s`, and [retry-after.ts](../../src/lib/tts/retry-after.ts) defaulted missing values to `8,000 ms` — producing misleading `"Retry available in 7s"` waits and repeated doomed requests against an 18-hour quota wall.

## 2. Flash-Lite Fallback Evidence
- **Live Compatibility & Separate Quota Pool (`[Measured]`):** Immediately after Flash TTS returned `10 RPD` `429`, `gemini-3.8-flash-lite-tts` returned `HTTP 200` on `3/3` initial audit spikes (`2,548–3,482 ms`), `4/4` production-server Matrix A/B probes (`2,394–3,908 ms`), and `2/2` opening browser buffer turns in Matrix C (`3,433 ms` Turn 1 + `3,229 ms` Turn 2).
- **Own Free Tier Ceiling (`[Measured]`):** On Turn 3 of Matrix C (after exhausting ~10 cumulative daily Flash-Lite Free Tier calls across audit + local probes), Flash-Lite also returned `HTTP 429` (`Retry-After: 65780`, `long_quota_wait`), proving both models have Free Tier `10 RPD` caps (`~20` combined daily turns) and validating deterministic daily-limit exhaustion handling.

## 3. Final Architecture (`[Recommended]` & `[Verified]`)
`POST /api/tts` ([tts-route-handler.ts](../../src/lib/tts/tts-route-handler.ts) + [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts)) implements one bounded failover path with strict allowlists (`PRIMARY_GEMINI_TTS_MODEL`, `LITE_GEMINI_TTS_MODEL`) and zero new dependencies:
1. Validate server config (`GEMINI_API_KEY`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts`, rollback via `none`/`off`) before any upstream call.
2. Reject arbitrary client `model`, `fallbackModel`, `voice`, `style`, or `apiKey` fields in [tts-contract.ts](../../src/lib/tts/tts-contract.ts) (`GenerateTtsRequestSchema.strict()`). Only allow optional `routePreference: "primary" | "fallback"`.
3. Call primary (`gemini-3.8-flash-tts`), or skip straight to allowlisted Flash-Lite when `routePreference === "fallback"` and fallback is enabled and distinct from primary.
4. On eligible primary capacity errors (`429`, daily quota, `503`, `timeout`/`RequestTimeoutError`/`RequestAbortedError`, transient `unavailable`) — never on missing key, auth error (`401`/`403`), safety rejection, invalid input, unsupported config, oversize, or unexpected MIME — switch **at most once** to `gemini-3.8-flash-lite-tts`.
5. Emit sanitized headers (`X-Kuro-TTS-Fallback-Used`, `X-Kuro-TTS-Quota-Class`, `X-Kuro-TTS-Retry-After` `<= 86400`, `X-Kuro-TTS-Profile`) and non-secret `[kuro/tts]` telemetry; never expose model IDs or raw provider errors in UI responses.
6. **Emergency fallback (`[Verified]`):** When both models fail, preserve generated script & cached clips and enter explicit timed captions (`Continue with timed captions`) without `speechSynthesis`.

## 4. Explicit Attempt & Call Bounds (`[Verified]`)
| Scope | Limit / Rule | Source |
| --- | --- | --- |
| Server models & switches | `MAX_TTS_MODEL_CHOICES = 2`, `MAX_TTS_MODEL_SWITCHES = 1`, `0` hidden SDK retries (`retryOptions: { attempts: 1 }`) | [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts) |
| Server upstream attempts / req | `1` normal · `2` primary fail + fallback · **`3` absolute max** (`MAX_TTS_PROVIDER_ATTEMPTS = 3`, incl. `<= 1` empty/corrupt audio repair) | [gemini-tts-service.ts](../../src/lib/tts/gemini-tts-service.ts) |
| Client auto attempts / segment | `<= 2` (`1` initial + `<= 1` post-short-cooldown retry with `routePreference: "fallback"`, skipping replay of primary -> `<= 3` upstream calls total) | [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts) |
| Theoretical episode upstream ceiling | **8-turn:** `9` calls (circuit opens Turn 1) / `24` worst-case · **15-turn:** `16` (circuit opens Turn 1) / `45` worst-case | Derived from per-segment bounds |
| Manual user retry & reset | `1` manual retry per failed segment per playback/replay cycle; counters reset per new episode or clean replay after cooldown; zero calls on cached Replay | [episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts) |

## 5. Circuit Breaker & Quota Classification (`[Verified]`)
- `classifyRetryAfter` ([retry-after.ts](../../src/lib/tts/retry-after.ts)) separates **`short_cooldown`** (`Retry-After <= 120s`, clamped `1–30s`) from **`long_quota_wait`** (`Retry-After > 120s` or daily/RPD text, `cooldownMs = null`).
- When Flash-Lite succeeds after a primary `long_quota_wait` (or `429 long_quota_wait` occurs), in-memory `TtsSessionCircuit` ([episode-audio-queue-engine.ts](../../src/lib/tts/episode-audio-queue-engine.ts)) marks primary open until `now + min(Retry-After, 86400) * 1000` (default `30m` if absent), without Redis/KV/DB or `localStorage`, and without scheduling an 18h `setTimeout`.
- Turns `2..N` and new episodes in the same browser session send `routePreference: "fallback"` (`1` server call each). When both models return `long_quota_wait`, `outageState = "quota_exhausted"` halts background loops immediately and surfaces `"Hosted Kuromate voices have reached today’s limit. You can continue with timed captions."` with zero 8s retry loop.

## 6. Audio Compatibility & Kuromate Role Results (`[Measured]`)
All Flash-Lite outputs matched primary WAV container expectations (`audio/wav`, RIFF/WAVE `fmt ` + `data` `24,000 Hz` mono `pcm_s16le` + `7,656 B` trailing `C2PA` chunk) and verified compatible for in-memory PCM concatenation (`462,720 B` / `9,640 ms` stitched from `probe_a1` + `probe_b1`) and browser `HTMLAudioElement` playback/cache/Replay:

| Probe | Role / Voice / Language | Route & Attempts | Latency | Size / Duration | Levels |
| --- | --- | --- | --- | --- | --- |
| `probe_a1` | `explainer` (`Sulafat`, EN) | Default (`2` attempts, fallback) | `3,908 ms` | `266,908 B` / `5,400 ms` | `-18.13 dBFS` RMS, `0.8517` peak |
| `probe_b1` | `learner` (`Puck`, EN) | `fallback` (`1` attempt) | `2,394 ms` | `211,228 B` / `4,240 ms` | `-20.43 dBFS` RMS, `0.6281` peak |
| `probe_b2` | `skeptic` (`Kore`, EN) | `fallback` (`1` attempt) | `2,969 ms` | `284,668 B` / `5,770 ms` | `-17.03 dBFS` RMS, `0.8831` peak |
| `probe_b3` | `explainer` (`Sulafat`, Taglish) | `fallback` (`1` attempt) | `2,961 ms` | `335,068 B` / `6,820 ms` | `-17.67 dBFS` RMS, `0.8192` peak |

All 6 roles in [voice-profiles.ts](../../src/lib/tts/voice-profiles.ts) resolve deterministically (`3.4 dB` RMS spread across tested voices). Subjective owner ear listening review of Flash-Lite pacing and Taglish pronunciation remains recommended during PR review.

## 7. Deferred Providers & Local TTS Conclusion (`[Deferred]`)
- **Independent Hosted Backup (`[Deferred]`):** **Deepgram Aura-2** (`$200` no-CC credit, `$0.030/1k` chars, `mip_opt_out=true`, English only) ranks first if vendor-independent redundancy is later needed; **Azure AI Speech** (`500k` F0 chars/mo, zero training, native `fil-PH` Taglish) leads for Taglish quality once student/CC setup is acceptable. Cartesia/ElevenLabs free tiers are excluded due to non-commercial restrictions. Do not add `DEEPGRAM_API_KEY`, Azure credentials, or multi-provider abstractions in WP-011.5.
- **Local Browser TTS — Kokoro.js (`[Deferred]`):** Audited `kokoro-js@1.2.1` + `onnx-community/Kokoro-82M-v1.0-ONNX` (`q8` `88.08 MiB` + `20.60 MiB` JSEP WASM ≈ `~109–120 MiB` cold download, `540.2 MB` peak RSS, `6,760 ms` cold load, measured CPU `RTF 1.859–2.761`, `28` EN voices, zero Tagalog, `phonemizer@1.2.1` / `eSpeak NG` `GPL-3.0-or-later` license caveat). Too heavy for hackathon defaults; deferred post-hackathon as an explicit opt-in desktop feature outside Git.

## 8. Security, Licensing, Cost & Remaining Limitations (`[Officially documented]` & `[Verified]`)
- **Security & Privacy:** `GEMINI_API_KEY`, `GEMINI_TTS_MODEL`, `GEMINI_TTS_FALLBACK_MODEL`, and `@google/genai` remain strictly server-side (`0` `NEXT_PUBLIC_*` TTS vars; `.env.local` ignored/untracked). Google Cloud Free Tier prompts/outputs may be used by Google (`No` on Paid Tier 1); script generator ([gemini-service.ts](../../src/lib/episode/gemini-service.ts)) text fallback (`gemini-3.8-flash` -> `gemini-3.5-flash-lite`) stays isolated.
- **Cost & Quota Note (`[Inferred]`):** Paid 2026 rates estimate `~$0.010` / 8-turn on Flash TTS vs `~$0.0067` / 8-turn on Flash-Lite TTS (`~2.18 MB` WAV/ep). Until Paid Tier 1 billing or an independent provider is enabled, Free Tier limits hosted audio to `10 RPD` Flash + `~10 RPD` Flash-Lite per project.
- **Per-Turn Granularity Retained (`[Officially documented]`):** Gemini multi-speaker `speech_config` caps at `2` speakers, which would break Kuro’s `3`-Kuromate [SPEC.md](../../SPEC.md) MVP and exact per-turn caption/visual sync.
