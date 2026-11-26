# WP-011.5A Consolidated Handoff — TTS Resilience & Feasibility Audit

## Status
**Complete (Audit-Only — Pending Owner Review)** — Root-caused Kuro’s Vercel/local TTS unavailability to a Google Free Tier **10 requests per day (RPD)** limit on `gemini-3.8-flash-tts` amplified by a `>120s` `Retry-After` parser truncation defect, proved `gemini-3.8-flash-lite-tts` uses a separate RPD bucket (`3/3` HTTP `200 OK` WAV), benchmarked Kokoro.js (`q8`) externally, compared 6+ hosted/local options, and produced an approval-ready `WP-011.5B` implementation plan with **zero code, dependency, lockfile, or Vercel changes**.

## Documents Created (`docs/wp-011-5/` Only)
- [TTS_RESILIENCE_AUDIT.md](./TTS_RESILIENCE_AUDIT.md) — Vercel log timeline, Gemini official specs, Flash vs Flash-Lite bounded spike evidence, RPD vs RPM bug analysis, multi-speaker matrix, and session circuit-breaker design.
- [PROVIDER_COMPARISON.md](./PROVIDER_COMPARISON.md) — Comparison of Gemini Flash/Flash-Lite, Deepgram Aura-2, Azure AI Speech, Cartesia Sonic-3.6, ElevenLabs Flash v2.5, and OpenAI `gpt-4o-mini-tts`; cost/quota tables; security/licensing; weighted decision matrix.
- [LOCAL_TTS_FEASIBILITY.md](./LOCAL_TTS_FEASIBILITY.md) — Kokoro.js size & measured CPU benchmark (`q8`), eSpeak NG GPL ambiguity check, Piper/Sherpa-ONNX review, and browser `speechSynthesis` rejection.
- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — 4 architectures, fallback & disclosure policy, Section 27 recommendation block, and full `WP-011.5B` technical blueprint.
- [WP-011-5_HANDOFF.md](./WP-011-5_HANDOFF.md) — This consolidated handoff.

## Core Findings Summary
- **Why Vercel fails at `0 of 2` even with `1,500 ms` pacing (`[Verified]` & `[Measured]`):** Both Preview (`dpl_6kHVrRC6CK9cSo5CgrFfiVr1PwGF`) and Production (`dpl_4idt9mXNroiSazpEDw94A1fLpmK2`) share one Google project capped at **`10 RPD`** on `gemini-3.8-flash-tts` (`retry-after: 68036`s). [gemini-tts-client.ts](../../src/lib/tts/gemini-tts-client.ts) drops `retry-after > 120`s, causing [retry-after.ts](../../src/lib/tts/retry-after.ts) to loop `8s` cooldowns (`"Retry available in 7s"`) and Replay to fire repeated doomed `429` calls.
- **Flash-Lite TTS (`gemini-3.8-flash-lite-tts`) (`[Measured]`):** Returned `200 OK` (`2,548–3,482 ms`) on all `3` calls immediately after Flash TTS `429`, emitting valid `24 kHz` mono PCM WAV (`fmt `+`data`+`C2PA`) compatible with [audio-inspect.ts](../../src/lib/tts/audio-inspect.ts).
- **Independent Hosted Backup (`[Officially documented]`):** **Deepgram Aura-2** (`$200` free no-CC credit, REST `POST /v1/speak`, `mip_opt_out=true`, English accents) or **Azure AI Speech F0/S0** (`fil-PH` Taglish support, `500k` chars/mo free, zero training).
- **Local TTS (`[Measured]` & `[Verified]`):** `kokoro-js@1.2.1` (`q8` `88.08 MiB` + `20.60 MiB` WASM runtime ≈ `~109–120 MiB`, `28` English voices, zero Tagalog, `540.2 MB` peak RSS, measured CPU `RTF 1.859–2.761`) is too heavy/slow for cellular mobile fallback and ships `phonemizer@1.2.1` wrapping `eSpeak NG` (`GPL-3.0` compliance caveat). Browser `speechSynthesis` is **Not suitable**.
- **Request Granularity:** Keep **Option A (per-turn audio)**; Gemini multi-speaker TTS is officially capped at **`2` speakers** (breaks 3-Kuromate `hosts[]` MVP).

## Recommended Next Step (`WP-011.5B`)
Approve **`WP-011.5B`** (`feat/wp-011-5-tts-fallback`): preserve full `Retry-After` (>120s), add `rpd_exhausted` session circuit breaking, enable single bounded server failover `gemini-3.8-flash-tts -> gemini-3.8-flash-lite-tts` (`<= 2` provider attempts preserved) with transparent UI disclosure, and retain **Timed Captions** as emergency fallback (zero new npm packages).

## Owner Decisions Required Before `WP-011.5B`
1. Authorize **`WP-011.5B`** (`gemini-3.8-flash-lite-tts` bounded failover + RPD circuit breaker) and/or upgrading the Google AI Studio project to Paid **Tier 1** (`~$0.01`/8-turn episode, eliminating the `10 RPD` cap and data-training policy).
2. Confirm whether to include a **Deepgram Aura-2** (no-CC `$200` credit, English) or **Azure AI Speech** (`fil-PH` Taglish) REST backup behind an optional server env key during `WP-011.5B` or defer external vendors until post-hackathon.
3. Confirm keeping **Kokoro.js** deferred to post-hackathon desktop opt-in pending `phonemizer`/eSpeak licensing resolution.
