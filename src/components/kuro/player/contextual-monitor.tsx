"use client";

import { useEffect, useRef } from "react";
import { VisualCueSchema, type VisualCue } from "@contracts/episode.schema";
import { ComparisonVisual } from "@/components/kuro/visuals/comparison-visual";
import { FactCardVisual } from "@/components/kuro/visuals/fact-card-visual";
import { ProcessVisual } from "@/components/kuro/visuals/process-visual";
import { TimelineVisual } from "@/components/kuro/visuals/timeline-visual";
import type { CameraAnchor } from "@/lib/experience/editorial-shot-selector";

const CUE_LABELS: Record<Exclude<VisualCue["type"], "none">, string> = {
  comparison: "Comparison",
  timeline: "Timeline",
  process: "Process",
  "fact-card": "Key Fact",
};

export interface ContextualMonitorProps {
  visualCue: unknown;
  isPlaying: boolean;
  priority?: "visual" | "speaker" | "cast";
  speakerAnchor?: CameraAnchor;
}

/**
 * Top safe-zone contextual display in Depth Plane 2 (`data-kuro-slot="contextual-visual"`).
 * Renders atmospheric lighting & equalizer silhouette when `visualCue.type === "none"` and
 * glides meaningful semantic HTML charts forward in 3D space when active.
 */
export function ContextualMonitor({
  visualCue,
  isPlaying,
  priority = "speaker",
  speakerAnchor = "closeup-center",
}: ContextualMonitorProps) {
  const warnedRef = useRef(false);
  const parsed = VisualCueSchema.safeParse(visualCue);
  const safeCue: VisualCue = parsed.success ? parsed.data : { type: "none" };

  useEffect(() => {
    if (!parsed.success && !warnedRef.current && process.env.NODE_ENV === "development") {
      warnedRef.current = true;
      console.warn("ContextualMonitor received an invalid visualCue; using ambient view.", parsed.error);
    }
  }, [parsed.success, parsed.error]);

  const visualSide =
    speakerAnchor === "visual-left"
      ? "right"
      : speakerAnchor === "visual-right"
        ? "left"
        : "center";

  if (safeCue.type === "none") {
    return (
      <div
        aria-hidden="true"
        data-kuro-slot="contextual-visual"
        data-cue-type="none"
        data-visual-priority={priority}
        data-visual-side="center"
        className="kuro-ambient-backdrop flex w-full items-center justify-center py-1"
      >
        <div className="kuro-ambient-equalizer-pill flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1">
          <div className={`kuro-standby-wave ${isPlaying ? "kuro-standby-wave--active" : ""}`}>
            <span className="kuro-standby-bar" />
            <span className="kuro-standby-bar" />
            <span className="kuro-standby-bar" />
            <span className="kuro-standby-bar" />
            <span className="kuro-standby-bar" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label={CUE_LABELS[safeCue.type]}
      data-kuro-slot="contextual-visual"
      data-cue-type={safeCue.type}
      data-visual-priority={priority}
      data-visual-side={visualSide}
      className="kuro-visual-card-3d w-full rounded-[var(--kuro-radius-lg)] border border-white/18 bg-[var(--kuro-studio-surface)]/92 p-2 shadow-lg backdrop-blur-xs"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-[var(--kuro-studio-ink-muted)]">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-[var(--active-host-accent,var(--kuro-accent))]"
          />
          <span>{CUE_LABELS[safeCue.type]}</span>
        </span>
      </div>

      <div className="kuro-visual-scroll max-h-[clamp(96px,22dvh,204px)] min-w-0 overflow-y-auto rounded-[var(--kuro-radius-md)] bg-[var(--kuro-surface)] p-2 text-[var(--kuro-ink)]">
        {safeCue.type === "comparison" ? <ComparisonVisual cue={safeCue} /> : null}
        {safeCue.type === "timeline" ? <TimelineVisual cue={safeCue} /> : null}
        {safeCue.type === "process" ? <ProcessVisual cue={safeCue} /> : null}
        {safeCue.type === "fact-card" ? <FactCardVisual cue={safeCue} /> : null}
      </div>
    </aside>
  );
}
