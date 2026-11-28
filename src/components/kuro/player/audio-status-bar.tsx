import type { EpisodeBatchCompilerSnapshot } from "@/lib/tts/episode-batch-compiler";

export interface AudioStatusBarProps {
  snapshot: EpisodeBatchCompilerSnapshot;
  onResumeAutoplay: () => void;
  onRetryFailedTurns: () => void;
  onBackToForm: () => void;
}

/**
 * Conditional compact boundary & error recovery overlay (`data-kuro-recovery-slot="player-boundary"`).
 * Renders ONLY when user action or batch-boundary waiting occurs; returns `null` during smooth playback.
 */
export function AudioStatusBar({
  snapshot,
  onResumeAutoplay,
  onRetryFailedTurns,
  onBackToForm,
}: AudioStatusBarProps) {
  const showFailureActions =
    !snapshot.isSamplePreview &&
    (snapshot.hasRetryableFailure || snapshot.hasBlockingFailure || snapshot.isConfigBlocked);
  const needsOverlay =
    snapshot.isAutoplayBlocked || snapshot.isBufferingAtBoundary || showFailureActions;

  if (!needsOverlay) {
    return null;
  }

  let badgeLabel = `Preparing turns ${snapshot.bufferingTurnRange ?? "next"}…`;
  let badgeTone = "border-blue-300/60 bg-blue-950/90 text-blue-100";

  if (snapshot.isAutoplayBlocked) {
    badgeLabel = "Audio paused by browser";
    badgeTone = "border-amber-300/60 bg-amber-950/90 text-amber-100";
  } else if (snapshot.hasBlockingFailure || snapshot.isConfigBlocked) {
    badgeLabel = "Compilation stopped";
    badgeTone = "border-red-300/60 bg-red-950/90 text-red-100";
  } else if (snapshot.hasRetryableFailure) {
    badgeLabel = "Turn preparation paused";
    badgeTone = "border-amber-300/60 bg-amber-950/90 text-amber-100";
  }

  return (
    <section
      aria-label="Playback recovery"
      data-kuro-recovery-slot="player-boundary"
      className="mx-2.5 mb-1.5 rounded-xl border border-white/18 bg-black/82 px-3 py-2 text-white shadow-md backdrop-blur-xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${badgeTone}`}
        >
          {badgeLabel}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          {snapshot.isAutoplayBlocked ? (
            <button
              type="button"
              onClick={onResumeAutoplay}
              className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--kuro-accent-hover)]"
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
                  className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-3 py-1.5 text-xs font-bold text-white hover:bg-[var(--kuro-accent-hover)]"
                >
                  {snapshot.isConfigBlocked ? "Retry" : "Retry failed turn"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onBackToForm}
                className="kuro-interactive min-h-11 rounded-xl border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Cancel and edit
              </button>
            </>
          ) : null}
        </div>
      </div>

      {snapshot.isBufferingAtBoundary ? (
        <p role="status" aria-live="polite" className="mt-1 text-[11px] font-medium text-blue-100">
          Paused cleanly at the batch boundary while preparing turns {snapshot.bufferingTurnRange}…
        </p>
      ) : snapshot.failureMessage ? (
        <p role="status" aria-live="polite" className="mt-1 text-[11px] font-medium text-white/85">
          {snapshot.failureMessage}
        </p>
      ) : null}
    </section>
  );
}
