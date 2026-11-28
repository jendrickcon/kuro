import type { VisualCue } from "@contracts/episode.schema";

type ProcessCue = Extract<VisualCue, { type: "process" }>;

export function ProcessVisual({ cue }: { cue: ProcessCue }) {
  return (
    <div className="space-y-1.5">
      <h3 className="font-display text-xs font-extrabold leading-snug text-[var(--kuro-ink)] break-words sm:text-sm">
        {cue.title}
      </h3>
      <ol className="space-y-1">
        {cue.steps.map((step, index) => (
          <li
            key={`${step.label}-${index}`}
            className="flex min-w-0 items-start gap-2 rounded-lg border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-2 py-1.5"
          >
            <span
              aria-hidden="true"
              className="font-mono-kuro mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--kuro-studio-bg)] text-[11px] font-extrabold text-[var(--kuro-studio-ink)]"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-[var(--kuro-ink)] break-words">
                <span className="sr-only">Step {index + 1}: </span>
                {step.label}
              </p>
              <p className="text-[11px] leading-snug text-[var(--kuro-ink-muted)] break-words">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
