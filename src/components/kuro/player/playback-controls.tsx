"use client";

import { useState } from "react";
import type { Episode } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { TranscriptDownload } from "@/components/kuro/player/transcript-download";

export interface PlaybackControlsProps {
  episode: Episode;
  status: PlaybackStatus;
  isSamplePreview: boolean;
  isBufferingAtBoundary: boolean;
  canPlay: boolean;
  canScrub: boolean;
  canDownloadAudio: boolean;
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
  onDownloadAudio: () => { filename: string } | null;
}

function formatClockMs(rawMs: number): string {
  const totalSecs = Math.max(0, Math.floor(rawMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function PlaybackControls({
  episode,
  status,
  isSamplePreview,
  isBufferingAtBoundary,
  canPlay,
  canScrub,
  canDownloadAudio,
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
  onDownloadAudio,
}: PlaybackControlsProps) {
  const [downloadedWavMessage, setDownloadedWavMessage] = useState<string | null>(null);

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

  function handleDownloadAudioClick() {
    const res = onDownloadAudio();
    if (res) {
      setDownloadedWavMessage(`Audio downloaded (${res.filename})`);
    }
  }

  return (
    <section
      aria-label="Playback controls"
      className="space-y-3 rounded-2xl border border-slate-300 bg-white p-3.5 shadow-xs sm:p-4"
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs font-bold tabular-nums text-slate-800">
          <span>
            {formatClockMs(clampedElapsedMs)} / {totalClockLabel}
          </span>
          <span>
            Turn {currentSegmentIndex + 1} / {totalSegments}
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
          className="h-11 w-full cursor-pointer accent-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
        />
      </div>

      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
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
            disabled={!canPlay}
            onClick={onTogglePlayPause}
            aria-label={primaryAriaLabel}
            className="min-h-12 rounded-xl bg-blue-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700 sm:min-w-[96px] sm:px-5 sm:text-sm"
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
            disabled={!canPlay && !isSamplePreview}
            onClick={onRestart}
            aria-label="Restart episode from turn 1"
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 sm:min-w-[82px] sm:px-3.5 sm:text-sm"
          >
            Restart
          </button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-end">
          <div className="flex flex-col items-stretch sm:items-end">
            <button
              type="button"
              disabled={!canDownloadAudio}
              onClick={handleDownloadAudioClick}
              aria-label={
                canDownloadAudio
                  ? "Download Audio (.wav)"
                  : isSamplePreview
                    ? "Download Audio disabled in Sample Preview"
                    : "Download Audio available after full episode compilation"
              }
              className="min-h-11 w-full rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-xs font-extrabold text-blue-950 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500 sm:w-auto sm:text-sm"
            >
              Download Audio (.wav)
            </button>
            {downloadedWavMessage ? (
              <p
                role="status"
                aria-live="polite"
                className="mt-1 text-[11px] font-medium text-emerald-800"
              >
                {downloadedWavMessage}
              </p>
            ) : null}
          </div>

          <TranscriptDownload episode={episode} />
        </div>
      </div>
    </section>
  );
}
