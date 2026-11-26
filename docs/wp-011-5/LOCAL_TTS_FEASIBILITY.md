# WP-011.5A — Local TTS Feasibility Audit (Kokoro.js, Piper & `speechSynthesis`)

> **Evidence Labels:** `[Measured]` isolated external Node benchmark (`2026-11-26`) · `[Verified]` npm/HF metadata & license files inspected · `[Officially documented]` upstream repo docs · `[Blocked]` browser WebGPU synthesis not bundled during audit-only WP-011.5A · `[Recommended]` audit decision

## 1. Kokoro.js Technical & Asset Audit (`2026-11-26`)
- **Packages & Upstream (`[Verified]`):** `kokoro-js@1.2.1` (`Apache-2.0`, `git+https://github.com/hexgrad/kokoro.git`, `dist.unpackedSize: 30,395,646 B` = `28.99 MiB`) depending on `@huggingface/transformers@^3.5.1` (`Apache-2.0`) and `phonemizer@^1.2.1` (`2.66 MiB` unpacked).
- **Verified Model Weight Sizes on HuggingFace (`onnx-community/Kokoro-82M-v1.0-ONNX`, `[Verified]`):**
  - `onnx/model_q8f16.onnx`: `86,033,585 B` (`82.05 MiB`)
  - `onnx/model_quantized.onnx` (`q8`): `92,361,116 B` (`88.08 MiB`) — standard CPU/WASM default
  - `onnx/model_q4f16.onnx`: `154,586,422 B` (`147.43 MiB`) · `onnx/model_fp16.onnx`: `163,234,740 B` (`155.67 MiB`)
  - `onnx/model_uint8.onnx`: `177,464,632 B` (`169.24 MiB`) · `onnx/model_q4.onnx`: `305,215,966 B` (`291.08 MiB`) · `onnx/model.onnx` (`fp32`): `325,532,232 B` (`310.45 MiB`)
  - **Voice weights (`onnx-community` repo):** `55` files totaling `28,725,248 B` (`27.39 MiB`, `~0.50 MiB` each); `kokoro-js@1.2.1` embeds `28` English voice embeddings (`voiceCount = 28`).
  - **Browser WASM runtime (`@huggingface/transformers@3.x` -> `onnxruntime-web@1.22.0-dev` `[Verified]`):** `ort-wasm-simd-threaded.jsep.wasm` (`21,596,019 B` = **`20.60 MiB`**) or `ort-wasm-simd-threaded.wasm` (`11,133,407 B` = **`10.62 MiB`**).
  - **Realistic First Browser Download (`q8` opt-in pack, `[Verified]`/`[Inferred]`):** `88.08 MiB` model + `20.60 MiB` JSEP WASM/WebGPU runtime + tokenizer/phonemizer/voices ≈ **`~109–120 MiB` minimum** (`fp16` WebGPU ≈ `~176 MiB`).
- **Hosting, Caching & CSP Implications (`[Officially documented]`):**
  - Weights **must stay external** (HuggingFace Hub CDN via Browser Cache API / IndexedDB in user browser; storing in Git or Vercel static exceeds bundle prudence and violates Kuro rules).
  - Browser inference should execute inside a dedicated **Web Worker** (`Transferable` `Float32Array`) to prevent UI freezes, and requires CSP `wasm-unsafe-eval` plus external CDN `connect-src` permissions. Optional Service Worker caching is unnecessary if Transformers.js Browser Cache API is used.
- **Language Support (`[Officially documented]` & `[Verified]`):** Kokoro-82M v1.0 supports American/British English, Japanese, Mandarin, Spanish, French, Hindi, Italian, and Brazilian Portuguese — **no Filipino / Tagalog voice or phonemizer rules**.

## 2. Isolated Kokoro.js Benchmark (`q8`, Node CPU ONNX) & 1–5 Scorecard
Measured outside the Kuro workspace (`%TEMP%\kuro-wp011-5-kokoro-bench`, subsequently deleted `[Verified]`):

| Run Case | Voice | Chars | Load / Synth Latency | Audio Duration | **RTF** (`Synth/Dur`) | Peak / RMS / Peak RSS |
| --- | --- | --- | --- | --- | --- | --- |
| Cold Load (`q8`, `cpu`) | — | — | `6,760 ms` load | — | — | `28` English voices loaded |
| Warm Load (cached) | — | — | `2,404 ms` load | — | — | `540.2 MB` RSS (`19 MB` heap, `34.1 MB` ext) |
| 1. Cold Explainer (EN) | `af_heart` | `112` | `21,605 ms` | `7,825 ms` | **`2.761`** | `-23.16 dBFS` RMS, `0.7776` peak, `24 kHz` |
| 2. Warm Explainer (EN) | `af_heart` | `91` | `14,942 ms` | `5,650 ms` | **`2.645`** | `-23.11 dBFS` RMS, `0.4200` peak |
| 3. Learner (EN) | `am_michael` | `103` | `20,114 ms` | `7,700 ms` | **`2.612`** | `-24.51 dBFS` RMS, `0.6211` peak |
| 4. Skeptic (EN) | `bm_george` | `107` | `19,484 ms` | `7,375 ms` | **`2.642`** | `-21.59 dBFS` RMS, `0.5092` peak |
| 5. Short Taglish | `af_bella` | `100` | `14,595 ms` | `7,850 ms` | **`1.859`** | `-21.94 dBFS` RMS, `0.5411` peak |

- **Browser WebGPU vs. WASM Note (`[Blocked]` live test / `[Officially documented]`):** Live Chromium WebGPU compilation was not wired into Kuro during audit-only WP-011.5A (`no runtime edits`). On Windows/macOS WebGPU (`fp16`), community benchmarks (`StreamingKokoroJS`) report `RTF ~0.15–0.40` (faster than real time), whereas CPU WASM fallback on mid-range laptops/smartphones mirrors our measured `RTF 1.86–2.76` (2–3× slower than playback) and **`540–950 MB` browser memory**, triggering tab kills on mobile Safari/low-RAM phones.
- **1–5 Feasibility Scorecard (`[Measured]` & `[Officially documented]`):**
  - Naturalness (English): **`4 / 5`** (`24 kHz` clean non-clipping waveform; quieter `-23 dBFS` RMS needs gain normalization to match Gemini `-16 dBFS`).
  - Expressiveness: **`3 / 5`** (no turn-level `speech_metadata` acting tags).
  - Role fit (`3+` Kuromates): **`4 / 5`** (`af_heart`, `am_michael`, `bm_george` map cleanly across 3+ roles).
  - Voice distinctness: **`5 / 5`** (`28` built-in voices switching in-memory with zero extra download).
  - English pronunciation: **`4 / 5`** · **Taglish pronunciation: `2 / 5`** (English G2P anglicizes Filipino tokens).
  - Warm latency (CPU/mobile): **`1.5 / 5`** (`14.6–20.1s` per `~7.5s` turn = stalls real-time commuter playback unless WebGPU is verified on desktop).
  - Offline suitability (post-download): **`4 / 5`** on desktop Edge/Chrome; **`1 / 5` on mobile/cellular** (`~109 MB` cold transfer + `540+ MB` RAM).

## 3. Phonemizer Licensing Catch, Piper & Other Local Options
- **CRITICAL Licensing Finding (`[Verified]` in `node_modules` inspection):**
  - `kokoro-js@1.2.1`, `@huggingface/transformers`, `onnxruntime-web`, and `hexgrad/Kokoro-82M` weights carry **Apache-2.0 / MIT** licenses.
  - However, `phonemizer@1.2.1` (`"license": "Apache-2.0"` in `package.json`) explicitly declares `"Simple text to phones converter using eSpeak NG"` and ships `espeakng.worker` types (`phonemizer/types/espeakng.worker.d.ts`). Upstream **eSpeak NG is GNU `GPL-3.0-or-later`**. Shipping compiled `espeakng` WASM inside an Apache-2.0 wrapper creates **GPL copyleft compliance ambiguity** that must be cleared (or swapped for a non-GPL G2P) before commercial distribution.
- **Piper (`rhasspy/piper` vs. `OHF-Voice/piper1-gpl`) & Others (`[Officially documented]`):**
  - *Piper:* Smaller per-voice ONNX files (`20–60 MB`/voice, fast CPU synthesis), but `OHF-Voice/piper1-gpl` is **`GPL-3.0-or-later`** and individual voices inherit mixed dataset licenses (CC-BY, public domain, research-only); requires bundling multiple ~40 MB voice packs for 3 Kuromates (~120 MB). Reject.
  - *Sherpa-ONNX:* Apache-2.0 engine with official WASM examples, but per-model licenses vary and runtime adds complexity without solving Kokoro’s download/Taglish gaps.
  - *Coqui TTS forks:* Excluded (mixed CPML non-commercial / AGPL constraints).

## 4. Browser `speechSynthesis` Emergency Fallback Verdict
- **Classification (`[Officially documented]`): `Not suitable`** for Kuromate production or primary resilience (`Emergency accessibility fallback` only if explicitly requested by user OS tools, never as Kuro’s voice engine).
- **Evidence:** Voice catalog (`window.speechSynthesis.getVoices()`) differs arbitrarily across Windows Edge (`Natural` cloud voices), Windows Chrome, Android Google TTS (`en_us` formatting differences), and iOS Safari (silent drop without direct user gesture per `speak()` call); Chromium cuts off long utterances on GC; mobile `pause()`/`resume()` locks up; `localService` offline behavior is unpredictable; **cannot export/stitch `.wav` audio for WP-012**, breaking Kuromate identity and accessibility reliability compared to Kuro’s deterministic **Timed Captions**.
