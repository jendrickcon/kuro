export function NoVisual({
  episodeTitle,
  isPlaying,
}: {
  episodeTitle: string;
  isPlaying: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
          Kuro Studio
        </p>
        <p className="mt-0.5 text-xs font-bold text-slate-950 break-words sm:text-sm">
          {episodeTitle}
        </p>
      </div>
      <div
        aria-hidden="true"
        className={`kuro-standby-wave ${isPlaying ? "kuro-standby-wave--active" : ""}`}
      >
        <span className="kuro-standby-bar" />
        <span className="kuro-standby-bar" />
        <span className="kuro-standby-bar" />
        <span className="kuro-standby-bar" />
        <span className="kuro-standby-bar" />
      </div>
    </div>
  );
}
