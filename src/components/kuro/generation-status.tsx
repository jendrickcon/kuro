"use client";

import type { Episode } from "@contracts/episode.schema";
import type { UnifiedLoadingView } from "@/lib/episode/unified-loading-state";
import type { EpisodeAudioQueueSnapshot } from "@/lib/tts/episode-audio-queue-engine";

const LOADING_STEPS = [
  { step: 1, title: "Preparing your conversation" },
  { step: 2, title: "Checking the conversation" },
  { step: 3, title: "Preparing the opening voices" },
  { step: 4, title: "Ready to begin" },
] as const;

export interface GenerationStatusProps {
  view: UnifiedLoadingView;
  episode: Episode | null;
  queueSnapshot: EpisodeAudioQueueSnapshot | null;
  onStartPodcast: () => void;
  onStartWithAvailableAudioAndCaptions: () => void;
  onContinuePreparingVoices: () => void;
  onContinueWithTimedCaptions: () => void;
  onCancelAndEdit: () => void;
}

/**
 * Single continuous loading panel covering script creation, EpisodeSchema validation,
 * sequential opening-voice preparation, compact idle Kuromates preview, and Start podcast trigger.
 */
export function GenerationStatus({
  view,
  episode,
  queueSnapshot,
  onStartPodcast,
  onStartWithAvailableAudioAndCaptions,
  onContinuePreparingVoices,
  onContinueWithTimedCaptions,
  onCancelAndEdit,
}: GenerationStatusProps) {
  const isBusy =
    view.stage === "generating_script" ||
    view.stage === "validating_script" ||
    view.stage === "preparing_audio" ||
    view.stage === "audio_cooldown";
  const cooldownActive = queueSnapshot?.cooldownActive ?? false;
  const cooldownSecs = cooldownActive
    ? Math.max(1, Math.ceil((queueSnapshot?.cooldownRemainingMs ?? 0) / 1000))
    : 0;

  let badgeText = "Working";
  let badgeClass = "border-blue-300 bg-white text-blue-950";
  if (view.stage === "audio_ready") {
    badgeText = "Ready to begin";
    badgeClass = "border-emerald-300 bg-emerald-50 text-emerald-950";
  } else if (view.stage === "audio_partial") {
    badgeText = "Partial voices";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
  } else if (view.stage === "audio_cooldown") {
    badgeText = "Rate limit wait";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
  } else if (view.stage === "audio_unavailable") {
    badgeText = "Voice unavailable";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
  } else if (view.stage === "audio_cancelled") {
    badgeText = "Paused";
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
                : view.stage === "audio_ready"
                  ? "bg-emerald-600"
                  : view.stage === "audio_partial" || view.stage === "audio_unavailable"
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
            view.stage === "audio_ready"
              ? true
              : view.stage === "audio_partial"
                ? item.step <= 3
                : view.stepNumber > item.step;
          const isCurrent =
            view.stage === "audio_ready" ? item.step === 4 : view.stepNumber === item.step;

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
        <p className="text-sm font-bold text-slate-950 break-words">{view.statusText}</p>
        {view.countdownText ? (
          <p className="mt-1 text-xs font-semibold tabular-nums text-amber-900">
            {view.countdownText}
          </p>
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
        <span className="font-semibold text-slate-800">{view.hostCount} Kuromates · Idle preview</span>
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
        {view.stage !== "audio_partial" &&
        view.stage !== "audio_unavailable" &&
        view.stage !== "audio_cancelled" ? (
          <button
            type="button"
            disabled={!view.canStartPodcast}
            onClick={onStartPodcast}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            Start podcast
          </button>
        ) : null}

        {view.stage === "audio_partial" ? (
          <>
            <button
              type="button"
              disabled={!view.canStartPartial}
              onClick={onStartWithAvailableAudioAndCaptions}
              className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
            >
              Start with available audio and captions
            </button>
            {view.canRetryAudio ? (
              <button
                type="button"
                disabled={cooldownActive}
                onClick={onContinuePreparingVoices}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cooldownActive
                  ? `Preparing more voices in ${cooldownSecs}s`
                  : "Continue preparing voices"}
              </button>
            ) : null}
          </>
        ) : null}

        {view.stage === "audio_unavailable" ? (
          <>
            <button
              type="button"
              onClick={onContinueWithTimedCaptions}
              className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800"
            >
              Continue with timed captions
            </button>
            {!view.isPermanentUnavailable && view.canRetryAudio ? (
              <button
                type="button"
                disabled={cooldownActive}
                onClick={onContinuePreparingVoices}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {cooldownActive
                  ? `Retry available in ${cooldownSecs}s`
                  : "Retry hosted voices later"}
              </button>
            ) : null}
          </>
        ) : null}

        {view.stage === "audio_cooldown" ? (
          <button
            type="button"
            onClick={onContinueWithTimedCaptions}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Continue with timed captions
          </button>
        ) : null}

        {view.stage === "audio_cancelled" && view.canRetryAudio ? (
          <button
            type="button"
            onClick={onContinuePreparingVoices}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800"
          >
            Continue preparing voices
          </button>
        ) : null}

        <button
          type="button"
          onClick={onCancelAndEdit}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          {view.stage === "audio_unavailable" && view.isPermanentUnavailable
            ? "Return to form"
            : "Cancel and edit"}
        </button>
      </div>
    </section>
  );
}
