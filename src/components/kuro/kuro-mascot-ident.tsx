"use client";

import { useId } from "react";

/** Approved Kuro brand mascot palette constants (non-speaking guide; not a Kuromate host). */
export const KURO_MASCOT_EYE_COLOR = "#38E8FF";
export const KURO_MASCOT_HALO_GOLD = "#F5BE58";
export const KURO_MASCOT_HEADSET_COBALT = "#1E4ED8";
export const KURO_MASCOT_BAND_NAVY = "#111C38";
export const KURO_MASCOT_CREAM_TRIM = "#F4E7CE";
export const KURO_MASCOT_CORAL_ACCENT = "#F06449";

export interface KuroMascotIdentProps {
  mode?: "splash" | "static";
  className?: string;
}

const GRILLE_ROW_YS = [104, 118, 132, 146, 160, 174] as const;
const GRILLE_COL_XS = [122, 160, 198] as const;

/**
 * Pure procedural inline SVG + CSS 3D bust of Kuro's studio guide mascot:
 * short broad silver-blue vintage broadcast microphone, visibly separate
 * cobalt-blue headset with subtle cat-pointed band accents, matching cyan eyes,
 * smiling audio-waveform mouth, and warm golden broadcast halo.
 */
export function KuroMascotIdent({
  mode = "static",
  className = "",
}: KuroMascotIdentProps) {
  const uid = useId().replace(/:/g, "");
  const ids = {
    haloGlow: `${uid}-halo-glow`,
    haloRing: `${uid}-halo-ring`,
    cyanRim: `${uid}-cyan-rim`,
    micBody: `${uid}-mic-body`,
    micBevel: `${uid}-mic-bevel`,
    grilleInterior: `${uid}-grille-interior`,
    grilleClip: `${uid}-grille-clip`,
    sweepGrad: `${uid}-sweep-grad`,
    collarGrad: `${uid}-collar-grad`,
    yokeGrad: `${uid}-yoke-grad`,
    bandGrad: `${uid}-band-grad`,
    cupGrad: `${uid}-cup-grad`,
    floorFade: `${uid}-floor-fade`,
  };

  return (
    <div
      data-kuro-slot="kuro-mascot"
      data-mascot-mode={mode}
      className={`kuro-mascot-stage relative select-none ${className}`}
    >
      <svg
        viewBox="0 0 320 290"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="h-auto w-full overflow-visible"
      >
        <defs>
          <radialGradient id={ids.haloGlow} cx="50%" cy="48%" r="50%">
            <stop offset="0%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0.42" />
            <stop offset="48%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0.16" />
            <stop offset="100%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0" />
          </radialGradient>

          <linearGradient id={ids.haloRing} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0.22" />
            <stop offset="28%" stopColor="#FFE19C" stopOpacity="0.96" />
            <stop offset="68%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0.88" />
            <stop offset="100%" stopColor={KURO_MASCOT_HALO_GOLD} stopOpacity="0.25" />
          </linearGradient>

          <radialGradient id={ids.cyanRim} cx="50%" cy="42%" r="48%">
            <stop offset="0%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0.28" />
            <stop offset="62%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0.06" />
            <stop offset="100%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0" />
          </radialGradient>

          <linearGradient id={ids.micBody} x1="16%" y1="8%" x2="86%" y2="92%">
            <stop offset="0%" stopColor="#F2F8FD" />
            <stop offset="34%" stopColor="#D3E2F1" />
            <stop offset="70%" stopColor="#9FB6CF" />
            <stop offset="100%" stopColor="#637994" />
          </linearGradient>

          <linearGradient id={ids.micBevel} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
            <stop offset="55%" stopColor="#B8CEE4" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#4A607A" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id={ids.grilleInterior} x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#1D2B40" />
            <stop offset="52%" stopColor="#111B2B" />
            <stop offset="100%" stopColor="#1A2639" />
          </linearGradient>

          <clipPath id={ids.grilleClip}>
            <rect x="102" y="92" width="116" height="92" rx="34" />
          </clipPath>

          <linearGradient id={ids.sweepGrad} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0" />
            <stop offset="50%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0.46" />
            <stop offset="100%" stopColor={KURO_MASCOT_EYE_COLOR} stopOpacity="0" />
          </linearGradient>

          <linearGradient id={ids.collarGrad} x1="12%" y1="0%" x2="88%" y2="100%">
            <stop offset="0%" stopColor="#DCE8F4" />
            <stop offset="48%" stopColor="#9DB4CC" />
            <stop offset="100%" stopColor="#5D728C" />
          </linearGradient>

          <linearGradient id={ids.yokeGrad} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#DCE7F3" />
            <stop offset="55%" stopColor="#89A0BA" />
            <stop offset="100%" stopColor="#44576F" stopOpacity="0.25" />
          </linearGradient>

          <linearGradient id={ids.bandGrad} x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="#263B6B" />
            <stop offset="50%" stopColor={KURO_MASCOT_BAND_NAVY} />
            <stop offset="100%" stopColor="#091024" />
          </linearGradient>

          <linearGradient id={ids.cupGrad} x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stopColor="#3B6EF6" />
            <stop offset="52%" stopColor={KURO_MASCOT_HEADSET_COBALT} />
            <stop offset="100%" stopColor="#102C85" />
          </linearGradient>

          <linearGradient id={ids.floorFade} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#6E849E" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#141922" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Stage Layer 1: Warm golden broadcast halo + cool cyan rim light */}
        <g data-mascot-part="halo" className="kuro-mascot-halo">
          <circle cx="160" cy="146" r="134" fill={`url(#${ids.haloGlow})`} />
          <circle cx="160" cy="136" r="98" fill={`url(#${ids.cyanRim})`} />
          <g transform="rotate(-7 160 154)">
            <ellipse
              cx="160"
              cy="154"
              rx="116"
              ry="38"
              stroke={`url(#${ids.haloRing})`}
              strokeWidth="6.5"
              strokeLinecap="round"
            />
            <ellipse
              cx="160"
              cy="154"
              rx="116"
              ry="38"
              stroke="#FFF2CC"
              strokeOpacity="0.35"
              strokeWidth="1.5"
            />
          </g>
        </g>

        {/* Stage Layer 2: Short, broad silver-blue vintage microphone bust & recessed upper grille */}
        <g data-mascot-part="mic-grille" className="kuro-mascot-mic">
          {/* Metallic U-yoke framing lower bust smoothly fading into studio backdrop */}
          <path
            d="M 84 178 V 222 C 84 252, 114 268, 160 268 C 206 268, 236 252, 236 222 V 178"
            stroke={`url(#${ids.yokeGrad})`}
            strokeWidth="10"
            strokeLinecap="round"
          />
          <rect x="148" y="256" width="24" height="24" rx="8" fill={`url(#${ids.floorFade})`} />

          {/* Main broad silver-blue vintage broadcast microphone body */}
          <path
            d="M 88 122 C 88 86, 116 74, 160 74 C 204 74, 232 86, 232 122 V 188 C 232 222, 206 244, 160 244 C 114 244, 88 222, 88 188 Z"
            fill={`url(#${ids.micBody})`}
            stroke={`url(#${ids.micBevel})`}
            strokeWidth="3"
          />

          {/* Top polished metallic ridge highlight */}
          <path
            d="M 116 83 C 134 78, 186 78, 204 83"
            stroke="#FFFFFF"
            strokeOpacity="0.82"
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Upper recessed vintage microphone grille with crisp horizontal & vertical slots */}
          <rect
            x="100"
            y="90"
            width="120"
            height="96"
            rx="35"
            fill={`url(#${ids.grilleInterior})`}
            stroke="#59708C"
            strokeWidth="2.5"
          />

          <g clipPath={`url(#${ids.grilleClip})`}>
            {GRILLE_ROW_YS.map((rowY) => (
              <rect
                key={`row-${rowY}`}
                x="100"
                y={rowY}
                width="120"
                height="4.2"
                rx="2.1"
                fill="#A9C2DC"
                fillOpacity="0.28"
              />
            ))}
            {GRILLE_COL_XS.map((colX) => (
              <rect
                key={`col-${colX}`}
                x={colX}
                y="90"
                width="3"
                height="96"
                fill="#8AA5C2"
                fillOpacity="0.16"
              />
            ))}

            {/* Diagonal cyan light sweep active during splash preparation beat */}
            <rect
              className="kuro-mascot-sweep"
              x="52"
              y="72"
              width="68"
              height="140"
              transform="skewX(-22)"
              fill={`url(#${ids.sweepGrad})`}
            />
          </g>

          {/* Distinct silver-blue lower housing collar + recessed mini control strip + 2 coral dots */}
          <g data-mascot-part="lower-collar">
            <path
              d="M 94 192 H 226 C 225 220, 202 238, 160 238 C 118 238, 95 220, 94 192 Z"
              fill={`url(#${ids.collarGrad})`}
              stroke="#485C75"
              strokeWidth="2"
            />
            <rect x="97" y="189" width="126" height="4.5" rx="2.25" fill="#172334" />
            <rect
              x="136"
              y="204"
              width="48"
              height="18"
              rx="6"
              fill="#121C2C"
              stroke="#526985"
              strokeWidth="1.5"
            />
            <rect x="147" y="211" width="3" height="5" rx="1.5" fill={KURO_MASCOT_EYE_COLOR} opacity="0.65" />
            <rect x="153" y="209" width="3" height="9" rx="1.5" fill={KURO_MASCOT_EYE_COLOR} opacity="0.85" />
            <rect x="159" y="207" width="3" height="12" rx="1.5" fill={KURO_MASCOT_EYE_COLOR} opacity="0.95" />
            <rect x="165" y="209" width="3" height="9" rx="1.5" fill={KURO_MASCOT_EYE_COLOR} opacity="0.85" />
            <rect x="171" y="211" width="3" height="5" rx="1.5" fill={KURO_MASCOT_EYE_COLOR} opacity="0.65" />

            <circle cx="116" cy="213" r="4.5" fill={KURO_MASCOT_CORAL_ACCENT} />
            <circle cx="114.6" cy="211.6" r="1.4" fill="#FFD6CC" fillOpacity="0.8" />
            <circle cx="204" cy="213" r="4.5" fill={KURO_MASCOT_CORAL_ACCENT} />
            <circle cx="202.6" cy="211.6" r="1.4" fill="#FFD6CC" fillOpacity="0.8" />
          </g>
        </g>

        {/* Stage Layer 3: Visibly separate cobalt-blue headset with subtle cat points */}
        <g data-mascot-part="headset" className="kuro-mascot-headset">
          {/* Deep navy structural headband arching cleanly above mic dome */}
          <path
            d="M 68 134 C 68 72, 104 48, 160 48 C 216 48, 252 72, 252 134"
            stroke={`url(#${ids.bandGrad})`}
            strokeWidth="15"
            strokeLinecap="round"
          />
          <path
            d="M 73 128 C 74 72, 107 50, 160 50 C 213 50, 246 72, 247 128"
            stroke="#598EF3"
            strokeOpacity="0.45"
            strokeWidth="2.4"
            strokeLinecap="round"
          />

          {/* Two subtle beveled cat-inspired pointed accents integrated into upper band */}
          <g data-mascot-part="cat-points">
            <path
              d="M 92 67 C 93 52, 99 39, 108 38 C 115 41, 118 52, 118 61 Z"
              fill={`url(#${ids.bandGrad})`}
              stroke="#598EF3"
              strokeOpacity="0.45"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M 228 67 C 227 52, 221 39, 212 38 C 205 41, 202 52, 202 61 Z"
              fill={`url(#${ids.bandGrad})`}
              stroke="#598EF3"
              strokeOpacity="0.45"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </g>

          {/* Left cobalt earcup + warm cream cushion trim + cyan edge accent */}
          <g>
            <rect
              x="48"
              y="110"
              width="32"
              height="74"
              rx="16"
              fill={`url(#${ids.cupGrad})`}
              stroke={KURO_MASCOT_EYE_COLOR}
              strokeOpacity="0.55"
              strokeWidth="1.8"
            />
            <rect x="74" y="118" width="9" height="58" rx="4.5" fill={KURO_MASCOT_CREAM_TRIM} />
            <path
              d="M 55 126 V 168"
              stroke="#93C5FD"
              strokeOpacity="0.45"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>

          {/* Right cobalt earcup + warm cream cushion trim + cyan edge accent */}
          <g>
            <rect
              x="240"
              y="110"
              width="32"
              height="74"
              rx="16"
              fill={`url(#${ids.cupGrad})`}
              stroke={KURO_MASCOT_EYE_COLOR}
              strokeOpacity="0.55"
              strokeWidth="1.8"
            />
            <rect x="237" y="118" width="9" height="58" rx="4.5" fill={KURO_MASCOT_CREAM_TRIM} />
            <path
              d="M 265 126 V 168"
              stroke="#93C5FD"
              strokeOpacity="0.45"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Stage Layer 4: Identical matching cyan-blue luminous eyes inside upper grille */}
        <g data-mascot-part="eyes" className="kuro-mascot-eyes">
          <g data-mascot-eye="left">
            <ellipse cx="134" cy="130" rx="16" ry="17" fill={KURO_MASCOT_EYE_COLOR} fillOpacity="0.24" />
            <ellipse cx="134" cy="130" rx="10" ry="11.5" fill={KURO_MASCOT_EYE_COLOR} />
            <circle cx="130.5" cy="125.5" r="3" fill="#ECFCFF" />
          </g>

          <g data-mascot-eye="right">
            <ellipse cx="186" cy="130" rx="16" ry="17" fill={KURO_MASCOT_EYE_COLOR} fillOpacity="0.24" />
            <ellipse cx="186" cy="130" rx="10" ry="11.5" fill={KURO_MASCOT_EYE_COLOR} />
            <circle cx="182.5" cy="125.5" r="3" fill="#ECFCFF" />
          </g>
        </g>

        {/* Stage Layer 5: Gentle smiling audio-waveform mouth below eyes */}
        <path
          data-mascot-part="waveform-smile"
          className="kuro-mascot-mouth"
          d="M 132 158 C 138 164, 143 157, 148 164 C 153 171, 157 160, 160 166 C 163 160, 167 171, 172 164 C 177 157, 182 164, 188 158"
          stroke={KURO_MASCOT_EYE_COLOR}
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
        />
      </svg>
    </div>
  );
}
