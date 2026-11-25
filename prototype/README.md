# Kuro — Standalone Interactive Prototype (`WP-004.5`)

**More voices. Clearer ideas.**

This folder contains a self-contained HTML, CSS, and JavaScript interactive prototype for **Kuro** and its **Kurozo** conversational host mascots. It is completely separate from the production Next.js application under `src/`.

## How to Open

1. Open `prototype/index.html` directly in Google Chrome (via `file://`, double-clicking the file, or `Ctrl+O`).
2. **No server, npm, build tools, API keys, or internet connection are required.**

## What Is Simulated

- **Sample conversations only:** Choosing options or submitting a topic loads embedded prewritten 2-Kurozo or 3-Kurozo sample episodes locally. **No real Gemini script generation occurs.**
- **Preparation state:** Displays a ~1.5-second local preparation sequence (*"Gathering your Kurozos"*, *"Assigning each Kurozo a perspective"*, *"Preparing the sample conversation"*) with zero fake percentages.
- **Browser preview voice:** Uses the browser's built-in `window.speechSynthesis` / `SpeechSynthesisUtterance` API purely as a local preview. It is **not** Gemini TTS, generated audio, or downloadable production audio.
- **Transcript download:** Generates a plain-text `.txt` file locally in the browser using `Blob` and `URL.createObjectURL`. Combined audio download is not included because browser speech synthesis cannot export a stitched audio file.

## Kurozo Mascot System

- **Kurozos** are provisional CSS-only mascots representing each host inside the prototype, rendered dynamically from `hosts[]` with `--host-accent` and role variants (`explainer`, `curious`, `challenger`).
- The production mascot identity may be refined after the hackathon, and this CSS prototype does not establish final trademark or character-design clearance.

## Known `file://` & Browser Speech Limitations

- Available voices from `speechSynthesis.getVoices()` vary by operating system and browser, and Chrome populates them asynchronously via `voiceschanged`.
- If fewer distinct voices are installed than hosts, the prototype safely reuses available voices while keeping host identities visually distinct.
- Some browsers require a direct user click before speaking; if `speechSynthesis` is unavailable or fails, the prototype automatically falls back to timed silent captions (`2.5–8s` per turn).
- Uses classic `<script defer>` and `<link rel="stylesheet">` (no ES module imports or `fetch()`) so `file://` execution works without CORS restrictions.
