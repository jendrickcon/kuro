# Kuro — Low-Fidelity Wireframes (WP-002)

> **Viewports:** Mobile minimum `320px` (zero horizontal scroll, `44×44px` minimum primary targets); Desktop `1024px+`. Placeholders only — no production character art.

## 1. Mobile Creation State (`320px+`)
```text
+----------------------------------+
| Kuro         [Try sample ->]     |  Header (compact, 1 row)
| More voices. Clearer ideas.      |
+----------------------------------+
| Turn class notes or tough topics |  1-line student value prompt
| into a short multi-host audio    |
| conversation.                    |
|                                  |
| Topic or pasted study material   |  <label> for textarea
| +------------------------------+ |
| | Paste notes or enter a topic | |  Expandable textarea
| | ...                          | |  (3-8 rows, 10-4,000 chars)
| +------------------------------+ |
| [Try example: Opportunity cost]  |  1-tap college study chip
|                                  |
| Tone                             |
| [ *Casual*      |  Serious    ]  |  Binary pills (44px tall)
| Length                           |
| [ *Quick ~9t*   |  Detailed   ]  |
| Hosts                            |
| [ *2 hosts*     |  3 hosts    ]  |
|                                  |
| +------------------------------+ |
| |     Create conversation      | |  Primary CTA (48px tall)
| +------------------------------+ |
+----------------------------------+
```

## 2. Desktop Creation State (`1024px+`)
```text
+----------------------------------------------------------------------+
| Kuro  —  More voices. Clearer ideas.             [Try sample episode]|
+----------------------------------------------------------------------+
|                                                                      |
|           +----------------------------------------------+           |
|           | Turn class notes or tough study topics into  |           |
|           | a short multi-host conversation.             |           |
|           |                                              |           |
|           | Topic or pasted study material               |           |
|           | +------------------------------------------+ |           |
|           | | Paste lecture notes or type a topic...   | |           |
|           | |                                          | |           |
|           | +------------------------------------------+ |           |
|           | Example: [Opportunity cost for students]     |           |
|           |                                              |           |
|           | Tone            Length           Hosts       |           |
|           | [*Casual*|Ser]  [*Quick*|Det]    [*2*|3]     |           |
|           |                                              |           |
|           | +------------------------------------------+ |           |
|           | |           Create conversation            | |           |
|           | +------------------------------------------+ |           |
|           +----------------------------------------------+           |
+----------------------------------------------------------------------+
```

## 3. Mobile Generation State (`320px+`)
*Desktop uses the same centered `max-w-md` card — no separate desktop layout needed.*
```text
+----------------------------------+
| Kuro                             |
+----------------------------------+
| Building your conversation...    |  aria-live="polite" heading
| "Opportunity cost for students"  |  Truncated topic recap
|                                  |
| [v] 1. Understanding your topic  |  Done
| (*) 2. Writing multi-host script |  Active (calm pulse)
| ( ) 3. Recording host voices     |  Pending
| ( ) 4. Preparing player          |  Pending
|                                  |
| Usually takes 15-45 seconds.     |  Calm expectation copy
|                                  |
| [        Cancel & edit         ] |  44px secondary button
+----------------------------------+
```
*Error swap:* Replaces stepper with error banner + `[ Try again ]` (primary), `[ Edit topic ]`, and `[ Try sample episode ]`.

## 4. Mobile Two-Host Player (`320px+`)
```text
+----------------------------------+
| <- New        Kuro               |  Compact top bar
+----------------------------------+
| Opportunity Cost on a Bus Ride   |  Episode title (2 lines max)
| Casual · Quick · 2 hosts         |  Compact metadata
+----------------------------------+
| +-------------+  +-------------+ |  HostStage (grid-cols-2)
| | ((Avatar))  |  |  (Avatar)   | |  Active: solid ring + scale
| | Maya        |  |  Leo        | |  Idle: 0.72 opacity
| | Explainer   |  |  Learner    | |
| | [Speaking]  |  |  Listening  | |  Non-color badge + icon
| +-------------+  +-------------+ |
+----------------------------------+
| [Maya · Explainer]       Turn 3/9|  CaptionPanel (high contrast)
| "Every hour you spend at a shift |  16-18px, line-height 1.5
| is one hour you can't spend      |  Never overlaid on avatars
| reviewing for tomorrow's exam."  |
| Prev: Leo: "Wait, isn't cost..." |  Muted 1-line glance context
+----------------------------------+
| CONTEXT VISUAL · COMPARISON      |  ContextVisual (hidden if none)
| Studying vs. Part-Time Shift     |
| +-------------+  +-------------+ |
| | 2 hrs Study |  | 2 hrs Shift | |
| | Better exam |  | Extra cash  | |
| +-------------+  +-------------+ |
+----------------------------------+
| [Download audio] [Transcript]    |  DownloadActions (44px min)
+----------------------------------+
| ====o-----------   Turn 3 of 9   |  Sticky bottom PlaybackDock
| [Prev]  [  Play / Pause  ] [Next]|  44px/48px thumb targets
| [Replay]                         |
+----------------------------------+
```

## 5. Mobile Three-Host Player (`320px+`, Dynamic `hosts[]`)
```text
+----------------------------------+
| <- New        Kuro               |
+----------------------------------+
| Opportunity Cost on a Bus Ride   |
| Casual · Quick · 3 hosts         |
+----------------------------------+
| +--------+ +--------+ +--------+ |  HostStage (grid-cols-3)
| | (Avtr) | |((Avtr))| | (Avtr) | |  48px avatars, 8px gap
| | Maya   | | Leo    | | Sam    | |  1-line truncated names
| | Expln. | | Lear.  | | Skept. | |  Short role tags
| |  Idle  | |[Speak] | |  Idle  | |  Active ring+scale+badge
| +--------+ +--------+ +--------+ |
+----------------------------------+
| [Leo · Learner]          Turn 4/9|  CaptionPanel (identical slot)
| "Okay, so even choosing a free   |
| study session has a real cost?"  |
| Prev: Maya: "Every hour you..."  |
+----------------------------------+
| [ContextVisual card if active]   |  Same vertical slot as 2-host
| [Download audio] [Transcript]    |
+----------------------------------+
| ======o---------   Turn 4 of 9   |  Sticky bottom PlaybackDock
| [Prev]  [  Play / Pause  ] [Next]|
+----------------------------------+
```

## 6. Desktop Episode Player (`1024px+`, 2-Column)
```text
+----------------------------------------------------------------------+
| <- New conversation    Kuro — More voices. Clearer ideas.            |
+----------------------------------------------------------------------+
| Opportunity Cost on a Bus Ride            Casual · Quick · 3 hosts   |
+------------------------------------+---------------------------------+
| LEFT COLUMN (~60%): Audio & Stage  | RIGHT COLUMN (~40%): Visual     |
|                                    |                                 |
| +--------+  +--------+  +--------+ | +-----------------------------+ |
| | (Avtr) |  |((Avtr))|  | (Avtr) | | | CONTEXT VISUAL · COMPARISON | |
| | Maya   |  | Leo    |  | Sam    | | | Studying vs. Part-Time Work | |
| | Expln. |  | Lear.  |  | Skept. | | |                             | |
| |  Idle  |  |[Speak] |  |  Idle  | | | [2 hrs Study] [2 hrs Shift] | |
| +--------+  +--------+  +--------+ | | Better exam   Extra cash    | |
|                                    | | score         for commute   | |
| +--------------------------------+ | +-----------------------------+ |
| | [Leo · Learner]       Turn 4/9 | |                                 |
| | "Okay, so even choosing a free | | (If cue is "none"/invalid:      |
| | study session has a real cost?"| |  compact subtle placeholder or  |
| | Prev: Maya: "Every hour..."    | |  clean collapse — never error)  |
| +--------------------------------+ |                                 |
|                                    | +-----------------------------+ |
| ====o--------------  Turn 4 of 9   | | Export                      | |
| [Prev] [Play/Pause] [Next] [Replay]| | [Download audio (.wav)]     | |
|                                    | | [Download transcript (.txt)]| |
+------------------------------------+---------------------------------+
```

## 7. Partial-Audio & Audio-Download-Unavailable State (Mobile)
```text
+----------------------------------+
| <- New        Kuro               |
+----------------------------------+
| (!) Some voice clips unavailable |  PartialAudioNotice (non-blocking)
| Available turns still play;      |  role="status"
| captions show for every turn.    |
+----------------------------------+
| [HostStage — active host ringed] |
+----------------------------------+
| [Sam · Skeptic]          Turn 6/9|
| (Audio unavailable — caption)    |  Inline badge on affected turn
| "What if you need the shift cash |  Caption remains crisp & readable
| just to pay for tomorrow's fare?"|
+----------------------------------+
| [Download audio (Disabled)]      |  Disabled button (aria-disabled)
| Combined audio unavailable —     |  Honest inline explanation
| replay here or get transcript.   |
| [Download transcript (.txt)]     |  Active primary fallback export
+----------------------------------+
| ========o-------   Turn 6 of 9   |
| [Prev]  [  Next turn  ]   [Next] |  Never freezes on missing clip
+----------------------------------+
```

## 8. Contextual Visual Templates & UX Bounds (For WP-003 Validation)
*UX recommendations for WP-003 strict discriminated union validation:*
- **Comparison:** 2 side-by-side blocks (`left` / `right`), title `<= 48` chars, label `<= 24` chars, value `<= 60` chars.
- **Timeline:** 2–4 chronological nodes stacked vertically on mobile, label `<= 20` chars, description `<= 70` chars.
- **Process:** 3–5 numbered vertical steps (`1 -> 2 -> 3`), step label `<= 24` chars, description `<= 70` chars.
- **Fact Card:** 1 emphasized hero value (`<= 24` chars), title `<= 40` chars, 1 short explanation (`<= 110` chars).
- **None / Invalid:** Renders nothing on mobile (no empty box); subtle neutral state or collapsed area on desktop.
