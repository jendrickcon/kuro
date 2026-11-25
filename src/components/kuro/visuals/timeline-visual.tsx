import type { VisualCue } from "@contracts/episode.schema";

type TimelineCue = Extract<VisualCue, { type: "timeline" }>;

export function TimelineVisual({ cue }: { cue: TimelineCue }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-extrabold leading-snug text-slate-950 break-words sm:text-base">
        {cue.title}
      </h3>
      <ul className="relative space-y-2 pl-4 before:absolute before:top-2 before:bottom-2 before:left-1.5 before:w-0.5 before:bg-blue-200">
        {cue.points.map((point, index) => (
          <li
            key={`${point.label}-${index}`}
            className="relative min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-2xs before:absolute before:top-3 before:-left-[13px] before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-blue-700 before:bg-white"
          >
            <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-extrabold text-blue-950">
              {point.label}
            </span>
            <p className="mt-1 text-xs leading-snug font-medium text-slate-800 break-words sm:text-sm">
              {point.description}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
