import type { EpisodeAudioQueueSnapshot } from "@/lib/tts/episode-audio-queue-engine";

export interface AudioStatusBarProps {
  snapshot: EpisodeAudioQueueSnapshot;
  onResumeAutoplay: () => void;
  onRetryCurrentSegment: () => void;
  onSkipCurrentSegment: () => void;
  onContinueWithTimedCaptions: () => void;
  onRetryHostedAudio: () => void;
  onBackToForm: () => void;
}

function resolveStatusPill(snapshot: EpisodeAudioQueueSnapshot): {
  label: string;
  toneClass: string;
} {
  if (snapshot.audioMode === "timed-fallback") {
    return {
      label: "Timed captions mode",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.outageState !== "none") {
    return {
      label: "Hosted audio unavailable",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.status === "autoplay-blocked") {
    return {
      label: "Tap to continue audio",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.cooldownActive) {
    return {
      label: "Voice generation paused",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.currentSegmentFailed) {
    return {
      label: "Voice unavailable for this turn",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.status === "preparing") {
    return {
      label: "Preparing Kuromate audio",
      toneClass: "border-blue-300 bg-blue-50 text-blue-950",
    };
  }
  if (snapshot.status === "playing") {
    return {
      label: "Hosted audio",
      toneClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    };
  }
  if (snapshot.status === "paused") {
    return {
      label: "Paused",
      toneClass: "border-slate-300 bg-slate-100 text-slate-900",
    };
  }
  if (snapshot.status === "complete") {
    return {
      label: "Episode complete",
      toneClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    };
  }
  return {
    label: "Hosted audio ready",
    toneClass: "border-slate-300 bg-slate-50 text-slate-800",
  };
}

/** Concise, accessible audio-sync status strip keeping captions primary at every width. */
export function AudioStatusBar({
  snapshot,
  onResumeAutoplay,
  onRetryCurrentSegment,
  onSkipCurrentSegment,
  onContinueWithTimedCaptions,
  onRetryHostedAudio,
  onBackToForm,
}: AudioStatusBarProps) {
  const pill = resolveStatusPill(snapshot);
  const hostName = snapshot.activeHost?.name ?? snapshot.activeSpeakerId;
  const hostRole = snapshot.activeHost?.role ?? "explainer";
  const hasOutage = snapshot.outageState !== "none";
  const showSingleFailureActions =
    !hasOutage && snapshot.audioMode === "hosted" && snapshot.currentSegmentFailed;

  return (
    <section
      aria-label="Episode audio status"
      className="rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 shadow-xs sm:px-4 sm:py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold text-slate-950 sm:text-sm">
            {hostName}
          </span>
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-800">
            {hostRole}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.toneClass}`}
          >
            {pill.label}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-slate-700">
            {snapshot.readyCount} of {snapshot.totalSegments} turns ready
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.status === "autoplay-blocked" ? (
            <button
              type="button"
              onClick={onResumeAutoplay}
              className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
            >
              Tap to continue audio
            </button>
          ) : null}

          {showSingleFailureActions ? (
            <>
              <button
                type="button"
                onClick={onRetryCurrentSegment}
                className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
              >
                Retry voice
              </button>
              <button
                type="button"
                onClick={onSkipCurrentSegment}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Skip audio and continue
              </button>
            </>
          ) : null}

          {hasOutage && snapshot.audioMode === "hosted" ? (
            <>
              <button
                type="button"
                onClick={onContinueWithTimedCaptions}
                className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
              >
                Continue with timed captions
              </button>
              <button
                type="button"
                onClick={onRetryHostedAudio}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Retry hosted audio
              </button>
              <button
                type="button"
                onClick={onBackToForm}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Return to form
              </button>
            </>
          ) : null}

          {snapshot.audioMode === "timed-fallback" ? (
            <button
              type="button"
              onClick={onRetryHostedAudio}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
            >
              Retry hosted audio
            </button>
          ) : null}
        </div>
      </div>

      {snapshot.liveAnnouncement ? (
        <p role="status" aria-live="polite" className="sr-only">
          {snapshot.liveAnnouncement}
        </p>
      ) : null}
    </section>
  );
}
