import { getFixtureByHostCount } from "@/lib/episode/fixtures";

/**
 * Lightweight studio cast vignette rendered dynamically from fixture hosts[].
 * Exposes `data-kuro-slot="cast-preview"` so WP-013 can swap bespoke Kuromate artwork
 * cleanly without altering generator state or layout slots.
 */
export function KuromatePreview({ hostCount }: { hostCount: 2 | 3 }) {
  const { hosts } = getFixtureByHostCount(hostCount);
  const summaryText = hosts.map((host) => `${host.name} (${host.role})`).join(" · ");

  return (
    <section
      aria-label="Host preview"
      data-kuro-slot="cast-preview"
      className="overflow-hidden rounded-[var(--kuro-radius-xl)] border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-bg)] px-3.5 pt-3.5 pb-3 text-[var(--kuro-studio-ink)] sm:px-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-bold text-[var(--kuro-studio-ink)]">
            Selected Kuromate cast
          </h2>
          <p className="text-xs text-[var(--kuro-studio-ink-muted)]">
            Distinct roles collaborating around one study desk.
          </p>
        </div>
        <span className="font-mono-kuro rounded-full border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--kuro-studio-ink)]">
          {hosts.length} Kuromates
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mt-3 flex flex-col items-center rounded-[var(--kuro-radius-md)] border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)] px-3 pt-2.5"
      >
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-bg)] px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-[var(--kuro-studio-ink)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--kuro-accent)]" />
          <span>KURO STAGE</span>
        </div>

        <div className="flex w-full items-end justify-center gap-5 sm:gap-8">
          {hosts.map((host, idx) => {
            const elevated = hosts.length === 3 && idx === 1;
            return (
              <div
                key={host.id}
                className={`flex flex-col items-center ${elevated ? "-translate-y-1" : ""}`}
              >
                <div
                  className="flex h-7 w-9 flex-col items-center justify-center rounded-t-full rounded-b-lg border-2 border-white"
                  style={{ backgroundColor: host.accentColor }}
                >
                  <div className="flex gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-slate-950" />
                    <span className="h-1 w-1 rounded-full bg-slate-950" />
                  </div>
                </div>
                <div
                  className="-mt-0.5 h-3 w-7 rounded-t-md border-x-2 border-t-2 border-white/90"
                  style={{ backgroundColor: host.accentColor }}
                />
              </div>
            );
          })}
        </div>

        <div className="-mx-3 h-2.5 w-[106%] rounded-t-[50%] border-t-2 border-white/30 bg-[var(--kuro-studio-surface-hi)]" />
      </div>

      <p className="mt-2 text-center text-xs font-medium capitalize text-[var(--kuro-studio-ink)]">
        {summaryText}
      </p>
    </section>
  );
}
