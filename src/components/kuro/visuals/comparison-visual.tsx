import type { VisualCue } from "@contracts/episode.schema";

type ComparisonCue = Extract<VisualCue, { type: "comparison" }>;

export function ComparisonVisual({ cue }: { cue: ComparisonCue }) {
  const sides = [
    { key: "left", side: cue.left, accentClass: "border-t-blue-600", badgeClass: "text-blue-900 bg-blue-100" },
    { key: "right", side: cue.right, accentClass: "border-t-amber-600", badgeClass: "text-amber-950 bg-amber-100" },
  ];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-extrabold leading-snug text-slate-950 break-words sm:text-base">
        {cue.title}
      </h3>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
        {sides.map(({ key, side, accentClass, badgeClass }) => (
          <div
            key={key}
            className={`min-w-0 rounded-lg border border-slate-300 border-t-4 bg-white p-2.5 shadow-2xs ${accentClass}`}
          >
            <p className={`inline-block max-w-full rounded px-1.5 py-0.5 text-xs font-extrabold break-words ${badgeClass}`}>
              {side.label}
            </p>
            <p className="mt-1.5 text-xs leading-snug font-medium text-slate-900 break-words sm:text-sm">
              {side.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
