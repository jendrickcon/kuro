"use client";

import type { PlaybackStatus } from "@/hooks/use-episode-playback";

export interface PlaybackControlsProps {
  status: PlaybackStatus;
  isSamplePreview: boolean;
  isBufferingAtBoundary: boolean;
  canPlay: boolean;
  canScrub: boolean;
  elapsedMs: number;
  compiledDurationMs: number;
  fullDurationMs: number | null;
  currentSegmentIndex: number;
  totalSegments: number;
  canPrev: boolean;
  canNext: boolean;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRestart: () => void;
  onSeekToMs: (targetMs: number) => void;
}

function formatClockMs(rawMs: number): string {
  const totalSecs = Math.max(0, Math.floor(rawMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Compact dark-glass bottom HUD timeline scrubber and one-hand four-button transport bar.
 */
export function PlaybackControls({
  status,
  isSamplePreview,
  isBufferingAtBoundary,
  canPlay,
  canScrub,
  elapsedMs,
  compiledDurationMs,
  fullDurationMs,
  currentSegmentIndex,
  totalSegments,
  canPrev,
  canNext,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onRestart,
  onSeekToMs,
}: PlaybackControlsProps) {
  const isPlaying = status === "playing";
  const isComplete = status === "complete";
  const primaryLabel = isBufferingAtBoundary
    ? "Preparing…"
    : isPlaying
      ? "Pause"
      : isComplete
        ? "Replay"
        : "Play";
  const primaryAriaLabel = isBufferingAtBoundary
    ? "Waiting for next compiled audio batch"
    : isPlaying
      ? "Pause playback"
      : isComplete
        ? "Replay episode from turn 1"
        : isSamplePreview
          ? "Play Sample Preview"
          : "Play compiled episode audio";

  const scrubberMaxMs = Math.max(1, compiledDurationMs);
  const clampedElapsedMs = Math.max(0, Math.min(scrubberMaxMs, elapsedMs));
  const totalClockLabel =
    fullDurationMs !== null ? formatClockMs(fullDurationMs) : `${formatClockMs(compiledDurationMs)}+`;
  const scrubberAriaText = `${formatClockMs(clampedElapsedMs)} of ${totalClockLabel}, Turn ${
    currentSegmentIndex + 1
  } of ${totalSegments}`;

  return (
    <section
      aria-label="Playback controls"
      className="space-y-1 px-2 pt-0.5 text-white min-[320px]:px-3"
    >
      <div>
        <div className="font-mono-kuro flex items-center justify-between gap-2 text-[11px] font-bold text-white/90">
          <span>
            {formatClockMs(clampedElapsedMs)} / {totalClockLabel}
          </span>
          <span>
            {String(currentSegmentIndex + 1).padStart(2, "0")} / {String(totalSegments).padStart(2, "0")}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={scrubberMaxMs}
          step={100}
          value={clampedElapsedMs}
          disabled={!canScrub}
          aria-label={
            canScrub
              ? `Episode timeline (${scrubberAriaText})`
              : "Episode timeline (available after compilation)"
          }
          aria-valuetext={scrubberAriaText}
          onChange={(event) => {
            onSeekToMs(Number(event.target.value));
          }}
          className="h-11 w-full cursor-pointer accent-[var(--kuro-accent)] disabled:cursor-not-allowed disabled:opacity-45"
        />
      </div>

      <div className="grid grid-cols-4 gap-1 min-[320px]:gap-1.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={onPrevious}
          aria-label="Previous turn"
          className="kuro-interactive min-h-11 rounded-xl border border-white/18 bg-white/10 px-1 py-2 text-[11px] font-bold text-white hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40 min-[340px]:px-2 min-[340px]:text-xs"
        >
          Prev
        </button>

        <button
          type="button"
          disabled={!canPlay}
          onClick={onTogglePlayPause}
          aria-label={primaryAriaLabel}
          className="kuro-interactive inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-[var(--kuro-accent)] px-1 py-2 text-[11px] font-extrabold text-white shadow-sm hover:bg-[var(--kuro-accent-hover)] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/55 min-[340px]:px-2.5 min-[340px]:text-xs"
        >
          {!isPlaying && !isBufferingAtBoundary ? (
            <svg
              width="11"
              height="12"
              viewBox="0 0 11 12"
              fill="currentColor"
              aria-hidden="true"
              className="translate-x-[0.5px]"
            >
              <path d="M1.5 1.2L9.8 6L1.5 10.8V1.2Z" />
            </svg>
          ) : null}
          <span>{primaryLabel}</span>
        </button>

        <button
          type="button"
          disabled={!canNext}
          onClick={onNext}
          aria-label="Next turn"
          className="kuro-interactive min-h-11 rounded-xl border border-white/18 bg-white/10 px-1 py-2 text-[11px] font-bold text-white hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40 min-[340px]:px-2 min-[340px]:text-xs"
        >
          Next
        </button>

        <button
          type="button"
          disabled={!canPlay && !isSamplePreview}
          onClick={onRestart}
          aria-label="Restart episode from turn 1"
          className="kuro-interactive min-h-11 rounded-xl border border-white/18 bg-white/10 px-1 py-2 text-[11px] font-bold text-white hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-40 min-[340px]:px-2 min-[340px]:text-xs"
        >
          Restart
        </button>
      </div>
    </section>
  );
}
