"use client";

import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import { useEpisodePlayback } from "@/hooks/use-episode-playback";
import { CaptionPanel } from "@/components/kuro/player/caption-panel";
import { PlaybackControls } from "@/components/kuro/player/playback-controls";
import { PlayerNotice } from "@/components/kuro/player/player-notice";
import { PodcastStage } from "@/components/kuro/player/podcast-stage";

export interface EpisodePlayerProps {
  episode: Episode;
  source: "generated" | "mock" | "sample";
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  onBack: () => void;
}

/**
 * Production multi-host player using validated mock episodes and timed silent playback.
 * Partial-audio metadata hooks are wired; hosted segmented audio arrives in WP-010/WP-011.
 */
export function EpisodePlayer({
  episode,
  source,
  requestedOptions,
  onBack,
}: EpisodePlayerProps) {
  const playback = useEpisodePlayback(episode);
  const currentSegment = playback.currentSegment;

  if (!currentSegment) {
    return null;
  }

  return (
    <article aria-label={episode.title} className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 shadow-xs sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                source === "generated"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-950"
                  : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              {source === "sample"
                ? "Sample episode"
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
          onClick={onBack}
          className="min-h-11 shrink-0 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
        >
          Back to form
        </button>
      </div>

      <PlayerNotice
        source={source}
        episode={episode}
        requestedOptions={requestedOptions}
        audioAvailability={playback.audioAvailability}
        notice={playback.notice}
      />

      <PodcastStage
        episode={episode}
        currentSegment={currentSegment}
        currentSegmentIndex={playback.currentSegmentIndex}
        status={playback.status}
        reactionHostId={playback.reactionHostId}
      />

      <CaptionPanel
        activeHost={playback.activeHost}
        currentSegment={currentSegment}
        currentSegmentIndex={playback.currentSegmentIndex}
        totalSegments={playback.totalSegments}
        previousSegment={playback.previousSegment}
        previousHost={playback.previousHost}
        status={playback.status}
        audioAvailability={playback.audioAvailability}
        onReplay={playback.replay}
      />

      <PlaybackControls
        episode={episode}
        status={playback.status}
        currentSegmentIndex={playback.currentSegmentIndex}
        totalSegments={playback.totalSegments}
        playbackProgress={playback.playbackProgress}
        canPrev={playback.canPrev}
        canNext={playback.canNext}
        onTogglePlayPause={playback.togglePlayPause}
        onPrevious={playback.previous}
        onNext={playback.next}
        onRestart={playback.restart}
      />
    </article>
  );
}
