"use client";

import { useEffect, useMemo } from "react";
import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { EpisodeAudioQueueHookResult } from "@/hooks/use-episode-audio-queue";
import { AudioStatusBar } from "@/components/kuro/player/audio-status-bar";
import { CaptionPanel } from "@/components/kuro/player/caption-panel";
import { PlaybackControls } from "@/components/kuro/player/playback-controls";
import { PlayerNotice } from "@/components/kuro/player/player-notice";
import { PodcastStage } from "@/components/kuro/player/podcast-stage";
import { selectEditorialShot } from "@/lib/experience/editorial-shot-selector";

export interface EpisodePlayerProps {
  episode: Episode;
  source: "generated" | "mock" | "sample";
  usedFallback?: boolean;
  queue: EpisodeAudioQueueHookResult;
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  onBack: () => void;
  onOpenEpisodes?: () => void;
  onCreateAnother?: () => void;
}

/**
 * Screen 4 — 9:16 mobile-first Portrait Podcast Player with desktop theater companion rail,
 * deterministic 5-shot camera selector, strict NO AUDIO NO ADVANCE, and keyboard transport shortcuts.
 */
export function EpisodePlayer({
  episode,
  source,
  usedFallback,
  queue,
  requestedOptions,
  onBack,
  onOpenEpisodes,
  onCreateAnother,
}: EpisodePlayerProps) {
  const { snapshot } = queue;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!snapshot || !snapshot.hasStartedPodcast) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          tag === "button" ||
          tag === "a" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (event.code === "Space" && snapshot.canPlay) {
        event.preventDefault();
        queue.togglePlayPause();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        queue.previous();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        queue.next();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [queue, snapshot]);

  const currentSegment = snapshot?.activeSegment ?? episode.segments[0];
  const hostMap = useMemo(
    () => new Map(episode.hosts.map((host) => [host.id, host])),
    [episode.hosts],
  );

  const shotDecision = useMemo(() => {
    return selectEditorialShot({
      episode,
      activeSegmentIndex: snapshot?.activeSegmentIndex ?? 0,
      activeSegment: currentSegment,
      previousSegment: snapshot?.previousSegment ?? null,
      activeHost: snapshot?.activeHost ?? hostMap.get(currentSegment?.speakerId ?? ""),
      previousHost: snapshot?.previousHost,
      isSpeaking: snapshot?.isSpeaking ?? false,
      isInPadding: snapshot?.isInPadding ?? false,
      reactionHostId: snapshot?.reactionHostId ?? null,
      playbackStatus: snapshot?.playbackStatus ?? "idle",
      isBufferingAtBoundary: snapshot?.isBufferingAtBoundary ?? false,
    });
  }, [currentSegment, episode, hostMap, snapshot]);

  if (!snapshot || !snapshot.hasStartedPodcast || !currentSegment) {
    return null;
  }

  const audioAvailability = snapshot.isSamplePreview
    ? "none"
    : snapshot.canDownloadAudio
      ? "full"
      : "partial";

  const canPrev = snapshot.isSamplePreview
    ? snapshot.activeSegmentIndex > 0
    : snapshot.canScrub && snapshot.activeSegmentIndex > 0;
  const maxSeekableIndex = snapshot.isSamplePreview
    ? snapshot.totalTurns - 1
    : snapshot.timeline.length - 1;
  const canNext = snapshot.isSamplePreview
    ? snapshot.activeSegmentIndex < snapshot.totalTurns - 1
    : snapshot.canScrub && snapshot.activeSegmentIndex < maxSeekableIndex;

  return (
    <article
      aria-label={episode.title}
      className="mx-auto w-full max-w-[1120px] space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3.5 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] sm:text-sm"
          >
            Back
          </button>
          {onOpenEpisodes ? (
            <button
              type="button"
              onClick={onOpenEpisodes}
              className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-3.5 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] sm:text-sm"
            >
              Session episodes
            </button>
          ) : null}
        </div>

        <span
          className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
            source === "generated" && !snapshot.isSamplePreview
              ? "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]"
              : "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]"
          }`}
        >
          {snapshot.isSamplePreview || source === "sample"
            ? "Sample Preview · Captions only"
            : source === "generated"
              ? "Session episode"
              : "Mock preview"}
        </span>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        {/* 9:16 Mobile-First Portrait Player Frame */}
        <div className="kuro-portrait-frame">
          <PodcastStage
            episode={episode}
            currentSegment={currentSegment}
            currentSegmentIndex={snapshot.activeSegmentIndex}
            status={snapshot.playbackStatus}
            shotDecision={shotDecision}
            isSilentFallback={snapshot.isSamplePreview}
            isInPadding={snapshot.isInPadding}
            isSamplePreview={snapshot.isSamplePreview}
            isPreparingAudio={snapshot.isBufferingAtBoundary}
          />

          <CaptionPanel
            activeHost={snapshot.activeHost}
            currentSegment={currentSegment}
            currentSegmentIndex={snapshot.activeSegmentIndex}
            totalSegments={snapshot.totalTurns}
            previousSegment={snapshot.previousSegment}
            previousHost={snapshot.previousHost}
            status={snapshot.playbackStatus}
            audioAvailability={audioAvailability}
            isSamplePreview={snapshot.isSamplePreview}
            isBufferingAtBoundary={snapshot.isBufferingAtBoundary}
            bufferingTurnRange={snapshot.bufferingTurnRange}
            onReplay={queue.replay}
          />

          <AudioStatusBar
            snapshot={snapshot}
            onResumeAutoplay={queue.play}
            onRetryFailedTurns={queue.retryFailedTurns}
            onBackToForm={onBack}
          />

          <PlaybackControls
            episode={episode}
            status={snapshot.playbackStatus}
            isSamplePreview={snapshot.isSamplePreview}
            isBufferingAtBoundary={snapshot.isBufferingAtBoundary}
            canPlay={snapshot.canPlay}
            canScrub={snapshot.canScrub}
            canDownloadAudio={snapshot.canDownloadAudio}
            elapsedMs={snapshot.elapsedMs}
            compiledDurationMs={snapshot.compiledDurationMs}
            fullDurationMs={snapshot.fullDurationMs}
            currentSegmentIndex={snapshot.activeSegmentIndex}
            totalSegments={snapshot.totalTurns}
            canPrev={canPrev}
            canNext={canNext}
            onTogglePlayPause={queue.togglePlayPause}
            onPrevious={queue.previous}
            onNext={queue.next}
            onRestart={queue.restart}
            onSeekToMs={queue.seekToMs}
            onDownloadAudio={queue.downloadAudio}
          />
        </div>

        {/* Companion Overview & Turn Jump Rail (stacks cleanly below on mobile, side rail on lg+ desktop theater) */}
        <aside aria-label="Episode overview and turns" className="min-w-0 space-y-3">
          <div className="kuro-card p-4">
            <p className="font-mono-kuro text-xs font-semibold capitalize text-[var(--kuro-ink-muted)]">
              {episode.tone} · {episode.length} · {episode.hosts.length} Kuromates ·{" "}
              {episode.segments.length} turns
            </p>
            <h1 className="font-display mt-1 text-xl font-extrabold leading-snug text-[var(--kuro-ink)] break-words">
              {episode.title}
            </h1>
            <p className="mt-1.5 text-pretty-kuro text-xs leading-relaxed text-[var(--kuro-ink-muted)] break-words sm:text-sm">
              <span className="font-bold text-[var(--kuro-ink)]">Topic:</span> {episode.topic}
            </p>
          </div>

          <PlayerNotice
            source={source}
            usedFallback={usedFallback}
            episode={episode}
            requestedOptions={requestedOptions}
            snapshot={snapshot}
          />

          <div className="kuro-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-extrabold text-[var(--kuro-ink)]">
                Turn transcript overview
              </h2>
              <span className="font-mono-kuro text-xs font-semibold text-[var(--kuro-ink-muted)]">
                Shot: {shotDecision.shotLabel}
              </span>
            </div>

            <ol className="mt-2.5 max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
              {episode.segments.map((segment, index) => {
                const host = hostMap.get(segment.speakerId);
                const isActive = index === snapshot.activeSegmentIndex;
                const compiledSeg = snapshot.timeline[index];
                const canJumpToTurn =
                  !snapshot.isSamplePreview &&
                  snapshot.canScrub &&
                  compiledSeg !== undefined &&
                  compiledSeg.speechStartMs <= snapshot.playableRangeMs;

                return (
                  <li key={segment.id}>
                    {canJumpToTurn ? (
                      <button
                        type="button"
                        onClick={() => queue.seekToMs(compiledSeg.speechStartMs)}
                        className={`kuro-interactive min-h-11 w-full rounded-xl border px-3 py-2 text-left text-xs ${
                          isActive
                            ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)] text-[var(--kuro-ink)]"
                            : "border-[var(--kuro-border)] bg-[var(--kuro-surface)] text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                        }`}
                      >
                        <span className="font-mono-kuro mr-1.5 font-bold text-[var(--kuro-accent-ink)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="font-bold">{host?.name ?? segment.speakerId}:</span>{" "}
                        <span className="text-[var(--kuro-ink-muted)]">{segment.text}</span>
                      </button>
                    ) : (
                      <div
                        className={`rounded-xl border px-3 py-2 text-xs ${
                          isActive
                            ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)] text-[var(--kuro-ink)]"
                            : "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)]/60 text-[var(--kuro-ink-muted)]"
                        }`}
                      >
                        <span className="font-mono-kuro mr-1.5 font-bold text-[var(--kuro-ink)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="font-bold text-[var(--kuro-ink)]">
                          {host?.name ?? segment.speakerId}:
                        </span>{" "}
                        <span>{segment.text}</span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {onCreateAnother ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--kuro-border)] pt-3">
                <button
                  type="button"
                  onClick={onCreateAnother}
                  className="kuro-interactive min-h-11 flex-1 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                >
                  Create another episode
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </article>
  );
}
