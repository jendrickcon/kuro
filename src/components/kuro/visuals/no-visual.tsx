export function NoVisual({
  episodeTitle,
  isPlaying,
}: {
  episodeTitle: string;
  isPlaying: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[var(--kuro-ink-muted)]">Studio focus</p>
        <p className="mt-0.5 line-clamp-2 text-xs font-bold text-[var(--kuro-ink)] break-words sm:text-sm">
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
