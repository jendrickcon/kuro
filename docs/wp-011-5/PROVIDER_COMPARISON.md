# WP-011.5A — Hosted Provider Comparison, Cost, Security & Decision Matrix

> **Evidence Labels:** `[Officially documented]` provider pricing/terms accessed `2026-11-26` · `[Verified]` codebase check · `[Measured]` spike data · `[Inferred]` cost & score estimate · `[Recommended]` selection

## 1. Hosted Alternative Provider Comparison (`2026-11-26`)
| Provider / Model | Free Tier / Credit | API Price | Quality, Voices & Taglish | Format, Latency & REST | Limits & Terms (`2026-11-26`) |
| --- | --- | --- | --- | --- | --- |
| **Gemini 3.8 Flash TTS** (Current Primary) | Free (`10 RPD` observed `[Measured]`) | `$0.50/1M` text, `$9/1M` audio (`$0.0135/min`, doubles `2027`) | High expressiveness; 6+ distinct voices; Filipino+English | `audio/wav` (`24 kHz` mono + `C2PA`); `~3–4.6s`; SDK/REST `v1beta` | Project-wide quota; Free tier trains Google; Paid (`Tier 1` `$250` cap) no training |
| **Gemini 3.8 Flash-Lite TTS** (Same-Vendor Backup) | Free (separate RPD from Flash `[Measured]`) | `$0.50/1M` text, `$6/1M` audio (`$0.009/min`, doubles `2027`) | Conversational clarity; matches 6 roles; Filipino+English | Exact `audio/wav` match (`24 kHz` mono + `C2PA`); `~2.5–3.5s` | Free quota cap `[Unknown]` (>3 ok); zero new SDK/terms; separate from Flash RPD |
| **Deepgram Aura-2** (`POST /v1/speak`) | **`$200` free credit**, no CC, no expiry | `$0.030/1k` chars (`Aura-1`: `$0.015/1k`) | Fluent English (`en-PH` accents); **no native Tagalog** | `linear16` (needs WAV header) or `mp3`; `<300 ms` TTFB; tiny REST fetch | Project concurrency limits (`429`); commercial OK; **`mip_opt_out=true`** opts out of training |
| **Azure AI Speech Neural** | **F0: `500k` chars/mo** free (CC or Students) | S0: `$15/1M` chars (`$0.015/1k`) | High neural expressiveness; SSML; native `fil-PH` & `en-PH` | REST `/cognitiveservices/v1` WAV (`riff-24khz-16bit-mono-pcm`); fast | F0 capped at **20 req/60s, 1 concurrent**; standard account needs CC (Students `$100` no-CC); **no training** |
| **Cartesia Sonic (`sonic-3.6`)** | `20k` credits/mo (**non-commercial**) | Paid from `$5/mo` (`100k` credits) | Expressive (`~90 ms` TTFB); 44 langs incl. **Tagalog/Filipino** | REST `/tts/bytes` WAV/PCM; low latency | Free plan strictly personal/non-commercial; concurrency tier-capped |
| **ElevenLabs Flash v2.5** | `10k` credits/mo (**non-commercial** + attr.) | Starter `$6/mo` (`30k`); `~$0.04/1k` chars API | Natural + **30+ langs incl. Tagalog**; `75 ms` model latency | REST `/v1/text-to-speech/{id}`; MP3 default (WAV/PCM tiers) | Free requires attribution & blocks commercial use; default **2-yr retention** unless disabled |
| **OpenAI `gpt-4o-mini-tts`** | **None** (requires CC prepaid) | `$0.60/1M` text + `$12/1M` audio (`~$0.015/min`) | High instruction steerability; multilingual | REST `/v1/audio/speech` WAV/PCM/MP3 | No free tier + credit card mandatory; excluded for no-card hackathon constraint |

- **Hosted Backup Selection (`[Recommended]`):** Short-term hackathon backup should use **`gemini-3.8-flash-lite-tts`** (already allowlisted, zero new vendor account/CC, separate RPD `[Measured]`). If a **genuinely independent** hosted vendor is required, **Deepgram Aura-2** (`$200` no-CC credit, trivial REST call) ranks first for zero-card English fallback, while **Azure AI Speech (F0/S0)** wins if native **Taglish (`fil-PH`)** and SSML are prioritized alongside student/CC verification. Cartesia/ElevenLabs free tiers are excluded due to non-commercial licensing restrictions.

## 2. Cost & Quota Model (`[Inferred]` Estimates on Locked Episode Bounds)
Assumptions: average Kuromate segment = `110` chars (~`5.5s` audio, `~22` input text tokens, `~138` audio tokens at `25/s`, WAV `~272 KB` at `24 kHz` 16-bit mono + `~7.7 KB` `C2PA`).
- **8-turn episode:** `~880` chars · `~44s` speech (`1,100` audio tokens) · `~2.18 MB` total audio payload · `8` TTS calls.
- **15-turn episode:** `~1,650` chars · `~82.5s` speech (`2,063` audio tokens) · `~4.08 MB` total audio payload · `15` TTS calls.

| Usage Tier | `1 × 8-Turn` | `1 × 15-Turn` | `10 Users` (`1×8t` each) | `100 Users` (`1×8t` each) | Quota / Bandwidth Impact |
| --- | --- | --- | --- | --- | --- |
| **Gemini Paid Flash** (`2026`) | `~$0.010` | `~$0.019` | `~$0.10` (`80` reqs) | `~$1.00` (`800` reqs) | Paid Tier 1 avoids `10 RPD` lock; `~2.2 MB`/ep Vercel egress |
| **Gemini Paid Flash-Lite** (`2026`) | `~$0.0067` | `~$0.0125` | `~$0.067` (`80` reqs) | `~$0.67` (`800` reqs) | Free Tier `10 RPD` hit on primary triggers switch cleanly |
| **Deepgram Aura-2** (`$0.03/1k`) | `~$0.026` | `~$0.050` | `~$0.26` (`~0.13%` of `$200`) | `~$2.64` (`~1.3%` of `$200`) | Covered by `$200` free credit (~`7,575` 8-turn episodes) |
| **Azure Neural F0 / S0** | `$0` F0 / `~$0.013` S0 | `$0` F0 / `~$0.025` S0 | `8.8k` chars (`1.8%` F0) | `88k` chars (`17.6%` F0) | Free F0 holds `568` 8-turn eps/mo (`1` concurrent req, `20 RPM`) |
| **Kokoro.js `q8` Local** | `$0` (`~109 MB` cold DL) | `$0` (`0 B` warm net) | `10 × ~109 MB` CDN | `100 × ~109 MB` CDN | **`~109 MB` cellular hit** first load; `0` Vercel function cost after CDN fetch |

*(Vercel bandwidth note: Vercel Functions stay well under 30s timeout for `~3s` WAV generation; `8`-turn hosted TTS consumes ~`2.2 MB` browser data vs `~109 MB` initial Kokoro `q8` + WASM download = ~`50` full episodes of cellular data upfront.)*

## 3. Security, Privacy & Licensing Audit (`[Officially documented]` & `[Verified]`)
- **Credentials & Data Egress:** All hosted providers stay **server-side only** in `/api/tts` (`GEMINI_API_KEY`, optional `DEEPGRAM_API_KEY` or `AZURE_SPEECH_KEY`, **never `NEXT_PUBLIC_*`**). Segment transcript text leaves the device on hosted calls; local Kokoro keeps text on-device while downloading ONNX weights via browser HTTPS (requiring strict CSP `connect-src` allowlist and external HuggingFace CDN hosting—never bundled into Vercel static assets).
- **Provider Retention / Training Terms:**
  - *Gemini Free Tier:* Prompts and outputs **may be reviewed/used by Google** (`Yes`); **Paid Tier:** **not used** (`No`).
  - *Deepgram:* Retains request data for Model Improvement Program by default unless **`mip_opt_out=true`** is sent per request.
  - *Azure AI Speech:* **Zero training retention** guaranteed by Microsoft Learn docs.
  - *ElevenLabs / Cartesia Free Tiers:* Commercial/public restriction (ElevenLabs also retains logs `2 years` by default unless configured `0`).

## 4. Weighted Decision Matrix (Section 26)
Weights: **Reliability `25%`** · **Voice quality `15%`** · **Quota independence `15%`** · **Integration effort `10%`** · **Latency `10%`** · **Cost `10%`** · **Mobile feasibility `5%`** · **Privacy `5%`** · **Licensing clarity `5%`** (`1–5` scale per criterion).

| Option | Rel (`25`) | Qual (`15`) | Indep (`15`) | Effort (`10`) | Lat (`10`) | Cost (`10`) | Mob (`5`) | Priv (`5`) | Lic (`5`) | **Weighted Total** | Rationale |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Gemini Flash + Flash-Lite fallback** | 4 | 5 | 3 | 5 | 4 | 5 | 5 | 3 | 5 | **4.25 / 5** | Separate Flash-Lite RPD proven; drops into existing `/api/tts`; zero new keys/SDKs; shares vendor billing risk |
| **Gemini + Deepgram Aura-2** | 5 | 4 | 5 | 3 | 5 | 4 | 5 | 4 | 5 | **4.45 / 5** | True vendor quota independence + `$200` no-CC credit + `mip_opt_out`; requires key/account + `en` only |
| **Gemini + Azure Speech Neural** | 4 | 4 | 5 | 3 | 5 | 4 | 5 | 5 | 4 | **4.25 / 5** | Native `fil-PH` + `500k` F0 + strong privacy; setup gated by CC/Students verification & XML SSML |
| **Gemini + ElevenLabs Flash v2.5** | 3 | 5 | 5 | 3 | 5 | 2 | 5 | 3 | 2 | **3.70 / 5** | Free tier blocks public/commercial use (`$6/mo` min + 2-yr default retention) |
| **Gemini + Cartesia Sonic-3.6** | 3 | 5 | 5 | 3 | 5 | 2 | 5 | 3 | 2 | **3.70 / 5** | Strong Tagalog & TTFB, but Free tier is strictly non-commercial (`$5/mo` min) |
| **Gemini + Kokoro.js optional local** | 3 | 4 | 5 | 1 | 2 | 4 | 1 | 5 | 2 | **3.05 / 5** | `109 MB` download, `RTF 1.86–2.76` CPU, no Tagalog, `phonemizer` eSpeak GPL risk |
| **Gemini Flash TTS only** | 1 | 5 | 1 | 5 | 4 | 5 | 5 | 3 | 5 | **3.10 / 5** | Current state: breaks cleanly after `10 RPD` across Preview/Prod |
| **Gemini + Timed Captions only** | 3 | 1 | 5 | 5 | 5 | 5 | 5 | 4 | 5 | **3.65 / 5** | Always resilient & accessible, but silent once `10 RPD` is spent |
| **Gemini + `speechSynthesis`** | 2 | 1 | 5 | 4 | 5 | 5 | 2 | 4 | 5 | **3.10 / 5** | Inconsistent OS voices, Android/iOS pause/GC failures, breaks Kuromate voice consistency |
