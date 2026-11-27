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
      toneClass:
        "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]",
    };
  }
  if (snapshot.isAutoplayBlocked) {
    return {
      label: "Tap to continue audio",
      toneClass:
        "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]",
    };
  }
  if (snapshot.hasBlockingFailure || snapshot.isConfigBlocked) {
    return {
      label: "Compilation stopped",
      toneClass:
        "border-[var(--kuro-danger-border)] bg-[var(--kuro-danger-bg)] text-[var(--kuro-danger-ink)]",
    };
  }
  if (snapshot.hasRetryableFailure) {
    return {
      label: "Retry failed turn",
      toneClass:
        "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]",
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
      toneClass:
        "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]",
    };
  }
  if (snapshot.playbackStatus === "playing") {
    return {
      label: snapshot.isInPadding ? "Listening" : `${hostName} speaking`,
      toneClass:
        "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]",
    };
  }
  if (snapshot.playbackStatus === "paused") {
    return {
      label: "Paused",
      toneClass: "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)]",
    };
  }
  return {
    label: snapshot.canDownloadAudio ? "Full WAV ready" : "Batch ready",
    toneClass: "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)]",
  };
}

/** Concise audio compilation and boundary-recovery status strip inside the player frame. */
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
      data-kuro-recovery-slot="player-boundary"
      className="border-t border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-3 py-2 text-[var(--kuro-ink)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-extrabold text-[var(--kuro-ink)]">{hostName}</span>
          <span className="rounded-full border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-2 py-0.5 text-[10px] font-semibold capitalize text-[var(--kuro-ink-muted)]">
            {hostRole}
          </span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${pill.toneClass}`}>
            {pill.label}
          </span>
          {!snapshot.isSamplePreview ? (
            <span className="font-mono-kuro text-[11px] font-semibold text-[var(--kuro-ink-muted)]">
              {snapshot.completedTurns} / {snapshot.totalTurns}
            </span>
          ) : null}
        </div>

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
                className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-1.5 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
              >
                Cancel and edit
              </button>
            </>
          ) : null}
        </div>
      </div>

      {snapshot.isBufferingAtBoundary ? (
        <p role="status" aria-live="polite" className="mt-1 text-xs font-medium text-blue-950">
          Paused cleanly at the batch boundary while preparing turns {snapshot.bufferingTurnRange}…
        </p>
      ) : null}
    </section>
  );
}
