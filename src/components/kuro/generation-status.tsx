"use client";

import type { Episode } from "@contracts/episode.schema";
import type { BatchLoadingView } from "@/lib/episode/unified-loading-state";

const LOADING_STEPS = [
  { step: 1, title: "Preparing your conversation" },
  { step: 2, title: "Checking the conversation" },
  { step: 3, title: "Compiling Kuromate voices" },
  { step: 4, title: "Ready to begin" },
] as const;

export interface GenerationStatusProps {
  view: BatchLoadingView;
  episode: Episode | null;
  onStartPodcast: () => void;
  onRetryFailedTurns: () => void;
  onCancelAndEdit: () => void;
}

/**
 * Single continuous loading panel covering script creation, EpisodeSchema validation,
 * Quick full / Detailed Batch-1 compilation progress, and honest Retry / Cancel actions.
 */
export function GenerationStatus({
  view,
  episode,
  onStartPodcast,
  onRetryFailedTurns,
  onCancelAndEdit,
}: GenerationStatusProps) {
  const isBusy =
    view.stage === "generating_script" ||
    view.stage === "validating_script" ||
    view.stage === "compiling_quick" ||
    view.stage === "compiling_opening";

  let badgeText = "Compiling";
  let badgeClass = "border-blue-300 bg-white text-blue-950";
  if (view.stage === "ready_to_play") {
    badgeText = "Ready to begin";
    badgeClass = "border-emerald-300 bg-emerald-50 text-emerald-950";
  } else if (view.stage === "failed_retryable") {
    badgeText = "Retry required";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
  } else if (view.stage === "failed_blocking") {
    badgeText = view.isConfigBlocked ? "Setup required" : "Unavailable";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
  } else if (view.stage === "cancelled") {
    badgeText = "Cancelled";
    badgeClass = "border-slate-300 bg-slate-100 text-slate-900";
  }

  const hostsPreview = episode?.hosts ?? [];
  const placeholderColors = ["#2563EB", "#D97706", "#059669"].slice(0, view.hostCount);

  return (
    <section
      aria-label="Preparing your conversation"
      className="rounded-2xl border border-slate-300 bg-white p-4 text-slate-900 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`inline-block h-3 w-3 shrink-0 rounded-full ${
              isBusy
                ? "bg-blue-700 animate-pulse motion-reduce:animate-none"
                : view.stage === "ready_to_play"
                  ? "bg-emerald-600"
                  : view.stage === "failed_retryable" || view.stage === "failed_blocking"
                    ? "bg-amber-600"
                    : "bg-slate-500"
            }`}
          />
          <h2 className="text-base font-extrabold text-slate-950 sm:text-lg">
            {view.panelTitle}
          </h2>
        </div>

        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
          {badgeText}
        </span>
      </div>

      <ol
        aria-label="Preparation stages"
        className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
      >
        {LOADING_STEPS.map((item) => {
          const isComplete =
            view.stage === "ready_to_play" ? true : view.stepNumber > item.step;
          const isCurrent =
            view.stage === "ready_to_play" ? item.step === 4 : view.stepNumber === item.step;

          return (
            <li
              key={item.step}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${
                isComplete
                  ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                  : isCurrent
                    ? "border-blue-300 bg-blue-50 text-blue-950"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                  isComplete
                    ? "bg-emerald-700 text-white"
                    : isCurrent
                      ? "bg-blue-700 text-white"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                {isComplete ? "✓" : item.step}
              </span>
              <span className="min-w-0 truncate">{item.title}</span>
            </li>
          );
        })}
      </ol>

      <div
        role="status"
        aria-live="polite"
        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
      >
        <p className="text-sm font-extrabold text-slate-950 break-words">{view.stepHeading}</p>
        <p className="mt-0.5 text-sm font-medium text-slate-800 break-words">{view.statusText}</p>
        {view.fallbackNotice ? (
          <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs text-blue-950">
            <p className="font-semibold">{view.fallbackNotice}</p>
          </div>
        ) : null}
        <p className="mt-1 text-xs font-semibold tabular-nums text-slate-700">
          {view.voiceCountText}
        </p>
      </div>

      {/* Visually secondary compact idle Kuromates preview */}
      <div
        aria-label="Kuromates preview"
        className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-xs text-slate-700"
      >
        <span className="font-semibold text-slate-800">{view.hostCount} Kuromates · Cast</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {hostsPreview.length > 0
            ? hostsPreview.map((host) => (
                <span
                  key={host.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-800"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: host.accentColor }}
                  />
                  <span>{host.name}</span>
                  <span className="capitalize text-slate-500">({host.role})</span>
                </span>
              ))
            : placeholderColors.map((color, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span>Kuromate {idx + 1}</span>
                </span>
              ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {view.stage !== "failed_retryable" && view.stage !== "failed_blocking" ? (
          <button
            type="button"
            disabled={!view.canStartPodcast}
            onClick={onStartPodcast}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            Start podcast
          </button>
        ) : null}

        {view.canRetry ? (
          <button
            type="button"
            onClick={onRetryFailedTurns}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800"
          >
            {view.isConfigBlocked ? "Retry" : "Retry failed turn"}
          </button>
        ) : null}

        <button
          type="button"
          onClick={onCancelAndEdit}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          Cancel and edit
        </button>
      </div>
    </section>
  );
}
