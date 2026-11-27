"use client";

import { useEffect, useRef } from "react";
import { VisualCueSchema, type VisualCue } from "@contracts/episode.schema";
import { ComparisonVisual } from "@/components/kuro/visuals/comparison-visual";
import { FactCardVisual } from "@/components/kuro/visuals/fact-card-visual";
import { NoVisual } from "@/components/kuro/visuals/no-visual";
import { ProcessVisual } from "@/components/kuro/visuals/process-visual";
import { TimelineVisual } from "@/components/kuro/visuals/timeline-visual";

const CUE_LABELS: Record<VisualCue["type"], string> = {
  comparison: "Comparison",
  timeline: "Timeline",
  process: "Process",
  "fact-card": "Key Fact",
  none: "Standby",
};

export interface ContextualMonitorProps {
  visualCue: unknown;
  episodeTitle: string;
  isPlaying: boolean;
  monitorLabel: string;
  priority?: "visual" | "speaker" | "cast";
}

/**
 * Top safe-zone contextual display rendered in semantic HTML with high-contrast studio-paper
 * inner cards and WP-013 theme slot (`data-kuro-slot="contextual-visual"`).
 */
export function ContextualMonitor({
  visualCue,
  episodeTitle,
  isPlaying,
  monitorLabel,
  priority = "speaker",
}: ContextualMonitorProps) {
  const warnedRef = useRef(false);
  const parsed = VisualCueSchema.safeParse(visualCue);
  const safeCue: VisualCue = parsed.success ? parsed.data : { type: "none" };

  useEffect(() => {
    if (!parsed.success && !warnedRef.current && process.env.NODE_ENV === "development") {
      warnedRef.current = true;
      console.warn("ContextualMonitor received an invalid visualCue; rendering standby.", parsed.error);
    }
  }, [parsed.success, parsed.error]);

  const hasMeaningfulCue = safeCue.type !== "none";

  return (
    <aside
      aria-label="Studio contextual display"
      data-kuro-slot="contextual-visual"
      data-cue-type={safeCue.type}
      data-visual-priority={priority}
      className={`w-full rounded-[var(--kuro-radius-md)] border p-2 transition-colors ${
        hasMeaningfulCue || priority === "visual"
          ? "border-[var(--kuro-accent)]/70 bg-[var(--kuro-studio-surface)] shadow-md"
          : "border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)]/85"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-white/10 pb-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              hasMeaningfulCue
                ? "bg-[var(--kuro-accent)]"
                : isPlaying
                  ? "bg-emerald-400"
                  : "bg-slate-400"
            }`}
          />
          <span className="truncate text-[10px] font-bold tracking-wider text-[var(--kuro-studio-ink-muted)]">
            {monitorLabel}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--kuro-studio-ink)]">
          {CUE_LABELS[safeCue.type]}
        </span>
      </div>

      <div className="min-w-0 rounded-[var(--kuro-radius-sm)] bg-[var(--kuro-surface)] p-2 text-[var(--kuro-ink)]">
        {safeCue.type === "comparison" ? <ComparisonVisual cue={safeCue} /> : null}
        {safeCue.type === "timeline" ? <TimelineVisual cue={safeCue} /> : null}
        {safeCue.type === "process" ? <ProcessVisual cue={safeCue} /> : null}
        {safeCue.type === "fact-card" ? <FactCardVisual cue={safeCue} /> : null}
        {safeCue.type === "none" ? (
          <NoVisual episodeTitle={episodeTitle} isPlaying={isPlaying} />
        ) : null}
      </div>
    </aside>
  );
}
