import type { EpisodeBatchCompilerSnapshot } from "@/lib/tts/episode-batch-compiler";

export interface AudioStatusBarProps {
  snapshot: EpisodeBatchCompilerSnapshot;
  onResumeAutoplay: () => void;
  onRetryFailedTurns: () => void;
  onBackToForm: () => void;
}

function resolveStatusPill(snapshot: EpisodeBatchCompilerSnapshot): {
  label: string;
  toneClass: string;
} {
  const hostName = snapshot.activeHost?.name ?? "Kuromate";

  if (snapshot.isSamplePreview) {
    return {
      label: "Sample Preview",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.isAutoplayBlocked) {
    return {
      label: "Tap to continue audio",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.hasBlockingFailure || snapshot.isConfigBlocked) {
    return {
      label: "Compilation stopped",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.hasRetryableFailure) {
    return {
      label: "Retry failed turn",
      toneClass: "border-amber-300 bg-amber-50 text-amber-950",
    };
  }
  if (snapshot.isBufferingAtBoundary) {
    return {
      label: `Preparing turns ${snapshot.bufferingTurnRange ?? "next"}…`,
      toneClass: "border-blue-300 bg-blue-50 text-blue-950",
    };
  }
  if (snapshot.playbackStatus === "complete") {
    return {
      label: snapshot.canDownloadAudio ? "Episode complete · Full WAV ready" : "Episode complete",
      toneClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    };
  }
  if (snapshot.playbackStatus === "playing") {
    return {
      label: snapshot.isInPadding ? "Listening" : `${hostName} speaking`,
      toneClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    };
  }
  if (snapshot.playbackStatus === "paused") {
    return {
      label: "Paused",
      toneClass: "border-slate-300 bg-slate-100 text-slate-900",
    };
  }
  return {
    label: snapshot.canDownloadAudio ? "Full WAV ready" : "Batch ready",
    toneClass: "border-slate-300 bg-slate-50 text-slate-800",
  };
}

/** Concise, accessible compilation and timeline status bar keeping NO AUDIO, NO ADVANCE explicit. */
export function AudioStatusBar({
  snapshot,
  onResumeAutoplay,
  onRetryFailedTurns,
  onBackToForm,
}: AudioStatusBarProps) {
  const pill = resolveStatusPill(snapshot);
  const hostName = snapshot.activeHost?.name ?? snapshot.activeSpeakerId;
  const hostRole = snapshot.activeHost?.role ?? "explainer";
  const showFailureActions =
    !snapshot.isSamplePreview &&
    (snapshot.hasRetryableFailure || snapshot.hasBlockingFailure || snapshot.isConfigBlocked);

  return (
    <section
      aria-label="Episode audio status"
      className="rounded-2xl border border-slate-300 bg-white px-3.5 py-2.5 shadow-xs sm:px-4 sm:py-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold text-slate-950 sm:text-sm">{hostName}</span>
          <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-800">
            {hostRole}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.toneClass}`}>
            {pill.label}
          </span>
          {!snapshot.isSamplePreview ? (
            <span className="text-[11px] font-semibold tabular-nums text-slate-700">
              {snapshot.completedTurns} of {snapshot.totalTurns} turns compiled
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {snapshot.isAutoplayBlocked ? (
            <button
              type="button"
              onClick={onResumeAutoplay}
              className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
            >
              Tap to continue audio
            </button>
          ) : null}

          {showFailureActions ? (
            <>
              {snapshot.hasRetryableFailure || snapshot.isConfigBlocked ? (
                <button
                  type="button"
                  onClick={onRetryFailedTurns}
                  className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
                >
                  {snapshot.isConfigBlocked ? "Retry" : "Retry failed turn"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBackToForm}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Cancel and edit
              </button>
            </>
          ) : null}
        </div>
      </div>

      {snapshot.isBufferingAtBoundary ? (
        <p role="status" aria-live="polite" className="mt-1.5 text-xs font-medium text-blue-950">
          Paused cleanly at the batch boundary while preparing turns {snapshot.bufferingTurnRange}…
        </p>
      ) : null}
    </section>
  );
}
