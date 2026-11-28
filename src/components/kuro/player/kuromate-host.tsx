import type { CSSProperties } from "react";
import type { Host } from "@contracts/episode.schema";
import type { CameraAnchor, StudioSeat } from "@/lib/experience/editorial-shot-selector";

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
  studioSeat: StudioSeat;
  cameraAnchor: CameraAnchor;
  hostCount: 2 | 3;
  sizeVariant?: KuromateSizeVariant;
  isAudioOwner?: boolean;
}

/**
 * Refined provisional 2.5D/3D Kuromate character renderer driven dynamically by `episode.hosts[]`.
 * Exposes `data-kuro-slot="kuromate-renderer"` (WP-013 seam) with independent stable studio seat
 * (`data-studio-seat`) and camera framing (`data-camera-anchor`) plus floating names-only label.
 */
export function KuromateHost({
  host,
  state,
  lookDirection,
  studioSeat,
  cameraAnchor,
  hostCount,
  sizeVariant = hostCount === 3 ? "compact" : "standard",
  isAudioOwner = state === "speaking",
}: KuromateHostProps) {
  const accentStyle = { "--kuromate-accent": host.accentColor } as CSSProperties;
  const isActivelyTalking = isAudioOwner && (state === "speaking" || state === "captioning");

  return (
    <div
      data-kuro-slot="kuromate-renderer"
      data-host-id={host.id}
      data-kuromate-identity={host.name.toLowerCase()}
      data-studio-seat={studioSeat}
      data-camera-anchor={cameraAnchor}
      data-seat={studioSeat}
      data-role={host.role}
      data-look={lookDirection}
      data-state={state}
      data-host-count={hostCount}
      data-size-variant={sizeVariant}
      data-audio-owner={isAudioOwner ? "true" : "false"}
      className="kuromate-seat"
      style={accentStyle}
    >
      <div aria-hidden="true" className="kuromate-stage-light" />
      <div aria-hidden="true" className="kuromate-desk-shadow" />

      <div aria-hidden="true" className="kuromate-body">
        <div className="kuromate-crest">
          <span className="kuromate-crest-a" />
          <span className="kuromate-crest-b" />
        </div>

        <div className="kuromate-head">
          <span className="kuromate-head-highlight" />
          <span className="kuromate-rim-sheen" />
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

      <div
        data-kuro-floating-name="true"
        className={`kuromate-floating-label ${
          isActivelyTalking ? "kuromate-floating-label--active" : ""
        }`}
      >
        <span
          aria-hidden="true"
          className={`kuromate-label-dot ${
            isActivelyTalking ? "kuromate-label-dot--speaking" : ""
          }`}
        />
        <span className="truncate">{host.name}</span>
      </div>
    </div>
  );
}
