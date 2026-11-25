import type { Episode } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { TranscriptDownload } from "@/components/kuro/player/transcript-download";

export interface PlaybackControlsProps {
  episode: Episode;
  status: PlaybackStatus;
  currentSegmentIndex: number;
  totalSegments: number;
  playbackProgress: number;
  canPrev: boolean;
  canNext: boolean;
  onTogglePlayPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onRestart: () => void;
}

export function PlaybackControls({
  episode,
  status,
  currentSegmentIndex,
  totalSegments,
  playbackProgress,
  canPrev,
  canNext,
  onTogglePlayPause,
  onPrevious,
  onNext,
  onRestart,
}: PlaybackControlsProps) {
  const isPlaying = status === "playing";
  const isComplete = status === "complete";
  const primaryLabel = isPlaying ? "Pause" : isComplete ? "Replay" : "Play";
  const primaryAriaLabel = isPlaying
    ? "Pause playback"
    : isComplete
      ? "Replay episode from turn 1"
      : "Play timed preview";

  return (
    <section
      aria-label="Playback controls"
      className="space-y-3 rounded-2xl border border-slate-300 bg-white p-3.5 shadow-xs sm:p-4"
    >
      <div className="flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="Episode turn progress"
          aria-valuemin={1}
          aria-valuemax={totalSegments}
          aria-valuenow={currentSegmentIndex + 1}
          aria-valuetext={`Turn ${currentSegmentIndex + 1} of ${totalSegments}`}
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200"
        >
          <div
            className="h-full rounded-full bg-blue-700 transition-[width] duration-200"
            style={{ width: `${playbackProgress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-bold tabular-nums text-slate-800">
          {currentSegmentIndex + 1} / {totalSegments}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-2">
          <button
            type="button"
            disabled={!canPrev}
            onClick={onPrevious}
            aria-label="Previous turn"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[76px] sm:px-3.5 sm:text-sm"
          >
            Prev
          </button>

          <button
            type="button"
            onClick={onTogglePlayPause}
            aria-label={primaryAriaLabel}
            className="min-h-12 rounded-xl bg-blue-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-800 sm:min-w-[96px] sm:px-5 sm:text-sm"
          >
            {primaryLabel}
          </button>

          <button
            type="button"
            disabled={!canNext}
            onClick={onNext}
            aria-label="Next turn"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[76px] sm:px-3.5 sm:text-sm"
          >
            Next
          </button>

          <button
            type="button"
            onClick={onRestart}
            aria-label="Restart episode from turn 1"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:min-w-[82px] sm:px-3.5 sm:text-sm"
          >
            Restart
          </button>
        </div>

        <TranscriptDownload episode={episode} />
      </div>
    </section>
  );
}
