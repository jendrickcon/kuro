# WP-008 Handoff — Kuro Mock-Powered Milestone QA & Freeze

## 1. Status & Milestone Scope
- **Status:** Complete on `test/wp-008-mock-milestone` (branched from merged `main` `1a729e1eca6a9135898062eefbe3aca6ecb30c03`).
- **Deployment status:** **Application integration complete; Vercel verification pending owner authentication** (`vercel` CLI not installed, `.vercel` absent, `vercel-plugin` awaiting user sign-in).
- **Truthfulness boundary:** Zero real Gemini script generation, zero hosted TTS voices, zero browser `speechSynthesis`, and zero audio playback/download exist in `src/`. Timed silent playback and mock/sample fixtures power this milestone.

## 2. Integration & HTTP Matrix (`POST /api/episodes` & `/`)
- `GET /`: HTTP `200`, serves `"Kuro"` and `"More voices. Clearer ideas."`.
- Boundary rejections (`400 INVALID_INPUT`): empty/whitespace input, `9` chars, `2,501` chars, `hostCount: 4`, malformed JSON.
- Boundary acceptances (`200 ok: true`, schema-validated): `10` chars, `2,500` chars, `(2, Quick Casual)`, `(2, Detailed Serious -> representative quick fixture labeled honestly)`, `(3, Quick Casual -> representative detailed fixture labeled honestly)`, `(3, Detailed Serious)`.

## 3. End-to-End Browser QA (`http://localhost:3000`, 0 Console Errors / 0 Failed Requests)
- **Flow A (Sample fallback):** `"Try sample episode"` opened `"Sample episode"`, 2 Kurozos, Turn 3 `Comparison`, Turn 6 `Key Fact`, Pause/Resume, `.txt` transcript download (`opportunity-cost-on-a-commute-transcript.txt`, 1,514 B), clean exit.
- **Flow B (2-host custom):** Casual/Quick/2 hosts displayed honest `"Mock mode"` wait state, `"Mock episode"` + mock disclosure notice, timed auto-advance to `COMPLETE`, `"Replay episode"`, and preserved custom topic on exit.
- **Flow C (3-host custom):** Serious/Detailed/3 hosts displayed Maya, Leo, and Sam all speaking behind shared curved desk, `Timeline` (Turn 3), `Process` (Turn 7), `Comparison` (Turn 10), `Standby`, `Prev`/`Next`/`Restart`, and transcript download (`2,032 B`).
- **Flow D & reliability:** Empty / `9`-char / `2,501`-char errors (`role="alert"`, `aria-invalid`, `aria-describedby`, focus return, zero silent truncation); rapid double-click on submit sent `1` POST request; reload reset cleanly to Create form. **Tool limitation:** `webview_browser` lacks `page.route()`/offline toggle, so client network-drop triggering `RecoverableErrorCard` was verified in `src/components/kuro/kuro-skeleton.tsx` rather than live request abortion.
- **Responsive (`320×640`, `360×800`, `390×844`, `768×800`, `1024×768`, `1280×800`, `1440×900`):** Zero horizontal overflow (`containerOverflow: []`, `btnOverflow: []`) across Create (`320×640`) and 3-host player across all 7 widths; zero containment halos; captions clear and unobstructed.
- **Accessibility:** `h1 -> h2` hierarchy, `<label>` / `<fieldset>` / `<legend>`, keyboard Tab focus + disabled `Prev`/`Next` bounds, `44–57.7px` buttons, non-color speaking indicators (`● ON AIR`, `● Speaking`, mic LED). Reduced-motion live emulation unavailable in `webview_browser`; verified in built CSS (`@media (prefers-reduced-motion:reduce)`).

## 4. Demo Fallback & Next Work Packages
- **Fallbacks preserved:** In-app `"Try sample episode"` button (`getSampleEpisode()`) plus standalone [prototype/index.html](../../prototype/index.html) (`node --check prototype/app.js` passed).
- **Vercel manual dashboard steps (if not signing into `vercel-plugin`):** Import `https://github.com/jendrickcon/kuro` -> Framework Preset `Next.js` -> Root `./` -> default commands -> zero env vars required for mock milestone -> deploy and smoke-test `/` + `/api/episodes`.
- **Readiness:** **Ready for WP-009 Gemini script generation** (once `WP-008` is reviewed/merged and `GEMINI_API_KEY` + `WP-003B` spike run).
