import type { VisualCue } from "@contracts/episode.schema";

type ProcessCue = Extract<VisualCue, { type: "process" }>;

export function ProcessVisual({ cue }: { cue: ProcessCue }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-extrabold leading-snug text-slate-950 break-words sm:text-base">
        {cue.title}
      </h3>
      <ol className="space-y-1.5">
        {cue.steps.map((step, index) => (
          <li
            key={`${step.label}-${index}`}
            className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-2xs"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-extrabold text-white"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-slate-950 break-words sm:text-sm">
                <span className="sr-only">Step {index + 1}: </span>
                {step.label}
              </p>
              <p className="mt-0.5 text-xs leading-snug text-slate-700 break-words">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
