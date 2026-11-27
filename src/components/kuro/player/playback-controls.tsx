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
      className="space-y-2.5 border-t border-[var(--kuro-border)] bg-[var(--kuro-surface)] p-3 text-[var(--kuro-ink)] sm:p-3.5"
    >
      <div className="space-y-1">
        <div className="font-mono-kuro flex items-center justify-between gap-2 text-xs font-bold text-[var(--kuro-ink)]">
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
          className="h-11 w-full cursor-pointer accent-[var(--kuro-accent)] disabled:cursor-not-allowed disabled:opacity-45"
        />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={onPrevious}
          aria-label="Previous turn"
          className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-2 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Prev
        </button>

        <button
          type="button"
          disabled={!canPlay}
          onClick={onTogglePlayPause}
          aria-label={primaryAriaLabel}
          className="kuro-interactive inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-[var(--kuro-accent)] px-2.5 py-2 text-xs font-extrabold text-white hover:bg-[var(--kuro-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--kuro-border)] disabled:text-[var(--kuro-ink-muted)]"
        >
          {!isPlaying && !isBufferingAtBoundary ? (
            <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true" className="translate-x-[0.5px]">
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
          className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-2 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Next
        </button>

        <button
          type="button"
          disabled={!canPlay && !isSamplePreview}
          onClick={onRestart}
          aria-label="Restart episode from turn 1"
          className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-2 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Restart
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="flex flex-col items-stretch">
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
            className="kuro-interactive min-h-11 w-full rounded-xl border border-[var(--kuro-accent)]/40 bg-[var(--kuro-accent-soft)] px-3 py-2 text-xs font-extrabold text-[var(--kuro-accent-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:border-[var(--kuro-border)] disabled:bg-[var(--kuro-surface-muted)] disabled:text-[var(--kuro-ink-muted)]"
          >
            Download Audio (.wav)
          </button>
          {downloadedWavMessage ? (
            <p
              role="status"
              aria-live="polite"
              className="mt-1 text-[11px] font-medium text-[var(--kuro-ready-ink)]"
            >
              {downloadedWavMessage}
            </p>
          ) : null}
        </div>

        <TranscriptDownload episode={episode} />
      </div>
    </section>
  );
}
