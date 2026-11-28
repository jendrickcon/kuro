import type { VisualCue } from "@contracts/episode.schema";

type FactCardCue = Extract<VisualCue, { type: "fact-card" }>;

export function FactCardVisual({ cue }: { cue: FactCardCue }) {
  return (
    <div className="rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] p-2.5">
      <h3 className="text-[11px] font-bold text-[var(--kuro-accent-ink)] break-words">
        {cue.title}
      </h3>
      <p className="font-mono-kuro mt-1 text-lg font-extrabold tracking-tight text-[var(--kuro-ink)] break-words sm:text-xl">
        {cue.value}
      </p>
      <p className="mt-1 text-xs leading-snug font-medium text-[var(--kuro-ink-muted)] break-words">
        {cue.explanation}
      </p>
    </div>
  );
}
