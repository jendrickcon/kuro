export function GenerationStatus() {
  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-slate-900"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-full bg-blue-700 animate-pulse motion-reduce:animate-none"
        />
        <p className="text-sm font-semibold">Preparing mock conversation...</p>
      </div>
      <p className="mt-1.5 text-xs text-slate-700">
        Returning a validated WP-004 mock fixture. Live Gemini script generation and TTS audio are
        not connected in this milestone.
      </p>
    </section>
  );
}
