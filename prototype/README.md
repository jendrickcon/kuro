# Kuro — Standalone Interactive Podcast Studio Prototype (`WP-004.5`)

**More voices. Clearer ideas.**

This folder contains a self-contained HTML, CSS, and JavaScript interactive podcast studio prototype for **Kuro** and its **Kuromate** conversational host mascots. It is separate from the production Next.js application under `src/`.

## How to Open

1. Open `prototype/index.html` directly in Google Chrome (via `file://`, double-clicking the file, or `Ctrl+O`).
2. **No server, npm, build tools, API keys, or internet connection are required.**

## Shared Studio, Kuromates & Prototype Environments

- **Shared podcast studio stage:** Kuromates share one curved podcast desk with individual microphones, activity lights, an `ON AIR` indicator, aligned desk nameplates, and an integrated studio monitor for contextual visuals (`comparison`, `timeline`, `process`, `fact-card`, or a live Kuro waveform when `none`).
- **Embodied CSS Kuromates:** Each Kuromate is built purely with HTML and CSS (head, eyes, speaking wave bars, torso, arms, hands, seated base, and role variations for `explainer`, `curious`, and `challenger`) rendered dynamically from `hosts[]` across `idle`, `speaking`, `listening`, `reacting`, `paused`, and `completed` states.
- **Prototype environment selector:** Lets reviewers preview **Studio** (default), **Study Room**, and **Commute Lounge** backdrops and props without resetting playback or altering episode data.
- **Subtle CSS camera framing:** Uses CSS classes (`wide`, `speaker-focus`, `visual-focus`) rather than real 3D or Canvas rendering.
- **Provisional prototype disclaimer:** Kuromates, environments, and body animations are prototype-only CSS designs (no final illustration, 3D animation, lip sync, or trademark clearance).

## What Is Simulated

- **Sample conversations only:** Choosing options or submitting a topic loads embedded prewritten 2-Kuromate or 3-Kuromate sample episodes locally. **No real Gemini script generation occurs.**
- **Preparation state:** Displays a ~1.5-second local preparation sequence (*"Gathering your Kuromates"*, *"Assigning each Kuromate a perspective"*, *"Preparing the sample conversation"*) with zero fake percentages.
- **Browser preview voice:** Uses `window.speechSynthesis` / `SpeechSynthesisUtterance` purely as a local preview (not Gemini TTS, generated audio, or downloadable production audio).
- **Transcript download:** Generates a plain-text `.txt` file locally using `Blob` and `URL.createObjectURL`. Combined audio download is excluded because browser speech synthesis cannot export stitched audio.

## Known `file://` & Browser Speech Limitations

- Available voices from `speechSynthesis.getVoices()` vary by OS and browser and populate asynchronously via `voiceschanged`.
- If speech synthesis is unavailable, errors, or finishes too rapidly (`<250ms`), the prototype automatically continues with timed silent captions (`2.5–8s` per turn).
- Uses classic `<script defer>` and `<link rel="stylesheet">` (no ES modules or `fetch()`) so `file://` execution works without CORS restrictions.
