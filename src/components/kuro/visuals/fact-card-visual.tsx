import type { VisualCue } from "@contracts/episode.schema";

type FactCardCue = Extract<VisualCue, { type: "fact-card" }>;

export function FactCardVisual({ cue }: { cue: FactCardCue }) {
  return (
    <div className="rounded-xl border border-blue-300 bg-blue-50/90 p-3 shadow-2xs">
      <h3 className="text-xs font-extrabold uppercase tracking-wider text-blue-900 break-words">
        {cue.title}
      </h3>
      <p className="mt-1 text-xl font-extrabold tracking-tight text-slate-950 break-words sm:text-2xl">
        {cue.value}
      </p>
      <p className="mt-1 text-xs leading-relaxed font-medium text-slate-800 break-words sm:text-sm">
        {cue.explanation}
      </p>
    </div>
  );
}
