const PREVIEW_HOSTS_TWO = [
  { id: "maya", name: "Maya", role: "Explainer", accent: "#2563EB" },
  { id: "leo", name: "Leo", role: "Learner", accent: "#D97706" },
] as const;

const PREVIEW_HOSTS_THREE = [
  { id: "maya", name: "Maya", role: "Explainer", accent: "#2563EB" },
  { id: "sam", name: "Sam", role: "Skeptic", accent: "#7C3AED" },
  { id: "leo", name: "Leo", role: "Learner", accent: "#D97706" },
] as const;

/** Lightweight shared-desk vignette showing 2 or 3 Kurozos without isolated cards. */
export function KurozoPreview({ hostCount }: { hostCount: 2 | 3 }) {
  const hosts = hostCount === 3 ? PREVIEW_HOSTS_THREE : PREVIEW_HOSTS_TWO;
  const summaryText = hosts.map((h) => `${h.name} (${h.role})`).join(" · ");

  return (
    <section
      aria-label="Host preview"
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 px-3.5 pt-3 pb-2.5 text-slate-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">Meet your Kurozos</h2>
          <p className="text-xs text-slate-300">
            Different perspectives around one shared study desk.
          </p>
        </div>
        <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-slate-100">
          {hostCount} hosts
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mt-2.5 flex flex-col items-center rounded-xl border border-slate-700/80 bg-slate-950/60 px-3 pt-2"
      >
        <div className="mb-1.5 inline-flex items-center gap-1.5 rounded border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] font-bold tracking-wider text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          <span>KURO STAGE</span>
        </div>

        <div className="flex w-full items-end justify-center gap-5 sm:gap-8">
          {hosts.map((host, idx) => {
            const elevated = hostCount === 3 && idx === 1;
            return (
              <div
                key={host.id}
                className={`flex flex-col items-center ${elevated ? "-translate-y-1" : ""}`}
              >
                <div
                  className="flex h-7 w-9 flex-col items-center justify-center rounded-t-full rounded-b-lg border-2 border-white"
                  style={{ backgroundColor: host.accent }}
                >
                  <div className="flex gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-slate-950" />
                    <span className="h-1 w-1 rounded-full bg-slate-950" />
                  </div>
                </div>
                <div
                  className="-mt-0.5 h-3 w-7 rounded-t-md border-x-2 border-t-2 border-white/90"
                  style={{ backgroundColor: host.accent }}
                />
              </div>
            );
          })}
        </div>

        <div className="-mx-3 h-2.5 w-[106%] rounded-t-[50%] border-t-2 border-slate-400 bg-slate-700" />
      </div>

      <p className="mt-2 text-center text-xs font-medium text-slate-200">{summaryText}</p>
    </section>
  );
}
