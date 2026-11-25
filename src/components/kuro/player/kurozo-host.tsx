import type { CSSProperties } from "react";
import type { Host } from "@contracts/episode.schema";

export type KurozoHostState =
  | "idle"
  | "speaking"
  | "listening"
  | "reacting"
  | "paused"
  | "complete";

export interface KurozoHostProps {
  host: Host;
  state: KurozoHostState;
  lookDirection: "left" | "right" | "center";
  seatPosition: "left" | "center" | "right";
  hostCount: 2 | 3;
}

/**
 * Reusable embodied Kurozo mascot rendered from episode.hosts[].
 * Uses an original flat-motion geometric style with subtle overhead stage lighting
 * and active microphone LED emphasis — never large enclosing containment halos.
 */
export function KurozoHost({
  host,
  state,
  lookDirection,
  seatPosition,
  hostCount,
}: KurozoHostProps) {
  const accentStyle = { "--kurozo-accent": host.accentColor } as CSSProperties;

  return (
    <div
      className={`kurozo-seat ${hostCount === 3 && seatPosition === "center" ? "kurozo-seat--center-trio" : ""}`}
      data-state={state}
      data-role={host.role}
      data-look={lookDirection}
      data-seat={seatPosition}
      data-host-count={hostCount}
      style={accentStyle}
    >
      <div aria-hidden="true" className="kurozo-stage-light" />

      <div aria-hidden="true" className="kurozo-body">
        <div className="kurozo-crest">
          <span className="kurozo-crest-a" />
          <span className="kurozo-crest-b" />
        </div>

        <div className="kurozo-head">
          <span className="kurozo-head-highlight" />
          <div className="kurozo-eyes">
            <span className="kurozo-eye kurozo-eye--left" />
            <span className="kurozo-eye kurozo-eye--right" />
          </div>
          <div className="kurozo-mouth">
            <span className="kurozo-wave-bar" />
            <span className="kurozo-wave-bar" />
            <span className="kurozo-wave-bar" />
          </div>
        </div>

        <div className="kurozo-torso-wrap">
          <span className="kurozo-arm kurozo-arm--left">
            <span className="kurozo-hand" />
          </span>
          <div className="kurozo-torso">
            <span className="kurozo-collar" />
            <span className="kurozo-badge" />
          </div>
          <span className="kurozo-arm kurozo-arm--right">
            <span className="kurozo-hand" />
          </span>
        </div>

        <div className="kurozo-lower" />
      </div>

      <div aria-hidden="true" className="kurozo-mic">
        <div className="kurozo-mic-head">
          <span className="kurozo-mic-led" />
        </div>
        <div className="kurozo-mic-neck" />
      </div>
    </div>
  );
}
