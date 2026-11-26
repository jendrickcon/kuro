import type { CSSProperties } from "react";
import type { Host } from "@contracts/episode.schema";

export type KuromateHostState =
  | "idle"
  | "speaking"
  | "captioning"
  | "listening"
  | "reacting"
  | "paused"
  | "complete";

export interface KuromateHostProps {
  host: Host;
  state: KuromateHostState;
  lookDirection: "left" | "right" | "center";
  seatPosition: "left" | "center" | "right";
  hostCount: 2 | 3;
}

/**
 * Reusable embodied Kuromate mascot rendered from episode.hosts[].
 * Uses an original flat-motion geometric style with subtle overhead stage lighting
 * and active microphone LED emphasis — never large enclosing containment halos.
 */
export function KuromateHost({
  host,
  state,
  lookDirection,
  seatPosition,
  hostCount,
}: KuromateHostProps) {
  const accentStyle = { "--kuromate-accent": host.accentColor } as CSSProperties;

  return (
    <div
      className={`kuromate-seat ${hostCount === 3 && seatPosition === "center" ? "kuromate-seat--center-trio" : ""}`}
      data-state={state}
      data-role={host.role}
      data-look={lookDirection}
      data-seat={seatPosition}
      data-host-count={hostCount}
      style={accentStyle}
    >
      <div aria-hidden="true" className="kuromate-stage-light" />

      <div aria-hidden="true" className="kuromate-body">
        <div className="kuromate-crest">
          <span className="kuromate-crest-a" />
          <span className="kuromate-crest-b" />
        </div>

        <div className="kuromate-head">
          <span className="kuromate-head-highlight" />
          <div className="kuromate-eyes">
            <span className="kuromate-eye kuromate-eye--left" />
            <span className="kuromate-eye kuromate-eye--right" />
          </div>
          <div className="kuromate-mouth">
            <span className="kuromate-wave-bar" />
            <span className="kuromate-wave-bar" />
            <span className="kuromate-wave-bar" />
          </div>
        </div>

        <div className="kuromate-torso-wrap">
          <span className="kuromate-arm kuromate-arm--left">
            <span className="kuromate-hand" />
          </span>
          <div className="kuromate-torso">
            <span className="kuromate-collar" />
            <span className="kuromate-badge" />
          </div>
          <span className="kuromate-arm kuromate-arm--right">
            <span className="kuromate-hand" />
          </span>
        </div>

        <div className="kuromate-lower" />
      </div>

      <div aria-hidden="true" className="kuromate-mic">
        <div className="kuromate-mic-head">
          <span className="kuromate-mic-led" />
        </div>
        <div className="kuromate-mic-neck" />
      </div>
    </div>
  );
}
