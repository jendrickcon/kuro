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

export type KuromateSizeVariant = "closeup" | "standard" | "compact" | "docked";

export interface KuromateHostProps {
  host: Host;
  state: KuromateHostState;
  lookDirection: "left" | "right" | "center";
  seatPosition: "left" | "center" | "right";
  hostCount: 2 | 3;
  sizeVariant?: KuromateSizeVariant;
  isAudioOwner?: boolean;
}

/**
 * Refined provisional Kuromate character renderer driven dynamically by `episode.hosts[]`.
 * Marks `data-kuro-slot="kuromate-renderer"` so WP-013 can drop in final original artwork
 * cleanly while preserving active-audio ownership boundaries (`isAudioOwner`).
 */
export function KuromateHost({
  host,
  state,
  lookDirection,
  seatPosition,
  hostCount,
  sizeVariant = hostCount === 3 ? "compact" : "standard",
  isAudioOwner = state === "speaking",
}: KuromateHostProps) {
  const accentStyle = { "--kuromate-accent": host.accentColor } as CSSProperties;

  return (
    <div
      data-kuro-slot="kuromate-renderer"
      data-host-id={host.id}
      className={`kuromate-seat ${
        hostCount === 3 && seatPosition === "center" && sizeVariant === "compact"
          ? "kuromate-seat--center-trio"
          : ""
      }`}
      data-state={state}
      data-role={host.role}
      data-look={lookDirection}
      data-seat={seatPosition}
      data-host-count={hostCount}
      data-size-variant={sizeVariant}
      data-audio-owner={isAudioOwner ? "true" : "false"}
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
