import type { VisualCue } from "@contracts/episode.schema";

type ComparisonCue = Extract<VisualCue, { type: "comparison" }>;

export function ComparisonVisual({ cue }: { cue: ComparisonCue }) {
  const sides = [
    {
      key: "left",
      side: cue.left,
      accentClass: "border-t-[var(--kuro-accent)]",
      badgeClass: "bg-[var(--kuro-accent-soft)] text-[var(--kuro-accent-ink)]",
    },
    {
      key: "right",
      side: cue.right,
      accentClass: "border-t-[var(--kuro-studio-bg)]",
      badgeClass: "bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)]",
    },
  ];

  return (
    <div className="space-y-1.5">
      <h3 className="font-display text-xs font-extrabold leading-snug text-[var(--kuro-ink)] break-words sm:text-sm">
        {cue.title}
      </h3>
      <div className="grid grid-cols-1 gap-1.5 min-[320px]:grid-cols-2">
        {sides.map(({ key, side, accentClass, badgeClass }) => (
          <div
            key={key}
            className={`min-w-0 rounded-lg border border-[var(--kuro-border)] border-t-4 bg-[var(--kuro-surface)] p-2 ${accentClass}`}
          >
            <p className={`inline-block max-w-full rounded px-1.5 py-0.5 text-[11px] font-extrabold break-words ${badgeClass}`}>
              {side.label}
            </p>
            <p className="mt-1 text-xs leading-snug font-medium text-[var(--kuro-ink)] break-words">
              {side.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
