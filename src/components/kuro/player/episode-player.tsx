"use client";

import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { EpisodeAudioQueueHookResult } from "@/hooks/use-episode-audio-queue";
import { AudioStatusBar } from "@/components/kuro/player/audio-status-bar";
import { CaptionPanel } from "@/components/kuro/player/caption-panel";
import { PlaybackControls } from "@/components/kuro/player/playback-controls";
import { PlayerNotice } from "@/components/kuro/player/player-notice";
import { PodcastStage } from "@/components/kuro/player/podcast-stage";

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
}

/**
 * Active Kuro Studio multi-host player driven by the compiled WP-012 audio timeline
 * (or Sample Preview timed walkthrough when explicitly triggered via Try sample episode).
 */
export function EpisodePlayer({
  episode,
  source,
  usedFallback,
  queue,
  requestedOptions,
  onBack,
}: EpisodePlayerProps) {
  const { snapshot } = queue;
  if (!snapshot || !snapshot.hasStartedPodcast) {
    return null;
  }

  const currentSegment = snapshot.activeSegment ?? episode.segments[0];
  if (!currentSegment) {
    return null;
  }

  function handleBackToForm() {
    queue.cancel();
    queue.dispose();
    onBack();
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
    <article aria-label={episode.title} className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                source === "generated" && !snapshot.isSamplePreview
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {snapshot.isSamplePreview || source === "sample"
                ? "Sample Preview"
                : source === "generated"
                  ? "Generated episode"
                  : "Mock episode"}
            </span>
            <span className="text-xs font-semibold capitalize text-slate-700">
              {episode.tone} · {episode.length} · {episode.hosts.length} Kuromates ·{" "}
              {episode.segments.length} turns
            </span>
          </div>
          <h2 className="mt-1.5 text-lg font-extrabold leading-snug text-slate-950 break-words sm:text-xl">
            {episode.title}
          </h2>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-700 break-words">
            <span className="font-semibold text-slate-900">Topic:</span> {episode.topic}
          </p>
        </div>

        <button
          type="button"
          onClick={handleBackToForm}
          className="min-h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
        >
          Back to form
        </button>
      </div>

      <PlayerNotice
        source={source}
        usedFallback={usedFallback}
        episode={episode}
        requestedOptions={requestedOptions}
        snapshot={snapshot}
      />

      <PodcastStage
        episode={episode}
        currentSegment={currentSegment}
        currentSegmentIndex={snapshot.activeSegmentIndex}
        status={snapshot.playbackStatus}
        reactionHostId={snapshot.reactionHostId}
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
        onBackToForm={handleBackToForm}
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
    </article>
  );
}
