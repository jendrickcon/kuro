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
}

/** Studio wall display integrated behind hosts with schema-validated visual fallback. */
export function ContextualMonitor({
  visualCue,
  episodeTitle,
  isPlaying,
  monitorLabel,
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
      data-cue-type={safeCue.type}
      className={`kuro-studio-monitor mx-auto w-full rounded-xl border-2 p-2.5 transition-colors sm:p-3 ${
        hasMeaningfulCue
          ? "border-slate-500 bg-slate-950/95 shadow-lg"
          : "max-w-lg border-slate-600/80 bg-slate-950/85"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${
              hasMeaningfulCue ? "bg-sky-400" : isPlaying ? "bg-emerald-400" : "bg-slate-500"
            }`}
          />
          <span className="truncate text-[11px] font-extrabold tracking-wider text-sky-200">
            {monitorLabel}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-slate-100">
          {CUE_LABELS[safeCue.type]}
        </span>
      </div>

      <div className="min-w-0 rounded-lg bg-slate-50 p-2.5 text-slate-950 sm:p-3">
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
