import type { VisualCue } from "@contracts/episode.schema";

type TimelineCue = Extract<VisualCue, { type: "timeline" }>;

export function TimelineVisual({ cue }: { cue: TimelineCue }) {
  return (
    <div className="space-y-1.5">
      <h3 className="font-display text-xs font-extrabold leading-snug text-[var(--kuro-ink)] break-words sm:text-sm">
        {cue.title}
      </h3>
      <ul className="relative space-y-1.5 pl-4 before:absolute before:top-2 before:bottom-2 before:left-1.5 before:w-0.5 before:bg-[var(--kuro-border-strong)]">
        {cue.points.map((point, index) => (
          <li
            key={`${point.label}-${index}`}
            className="relative min-w-0 rounded-lg border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-2.5 py-1.5 before:absolute before:top-2.5 before:-left-[13px] before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-[var(--kuro-accent)] before:bg-[var(--kuro-surface)]"
          >
            <span className="inline-block rounded-full bg-[var(--kuro-accent-soft)] px-2 py-0.5 text-[11px] font-extrabold text-[var(--kuro-accent-ink)]">
              {point.label}
            </span>
            <p className="mt-0.5 text-xs leading-snug font-medium text-[var(--kuro-ink)] break-words">
              {point.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
