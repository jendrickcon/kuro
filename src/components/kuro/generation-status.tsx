"use client";

import { useEffect, useState } from "react";

const WAITING_MESSAGES = [
  "Preparing the conversation...",
  "Arranging host perspectives...",
  "Preparing the preview...",
] as const;

export function GenerationStatus() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStepIndex((prev) => (prev + 1) % WAITING_MESSAGES.length);
    }, 600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <section
      role="status"
      aria-live="polite"
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-slate-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-block h-3 w-3 shrink-0 rounded-full bg-blue-700 animate-pulse motion-reduce:animate-none"
          />
          <p className="text-sm font-semibold text-slate-950">{WAITING_MESSAGES[stepIndex]}</p>
        </div>
        <span className="rounded-full border border-blue-300 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-blue-900">
          Mock mode
        </span>
      </div>
      <p className="mt-1.5 text-xs text-slate-700">
        Loading a validated mock episode from the WP-004 API. Live Gemini generation and TTS are not
        connected yet.
      </p>
    </section>
  );
}
