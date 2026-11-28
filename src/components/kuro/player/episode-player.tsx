"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { EpisodeAudioQueueHookResult } from "@/hooks/use-episode-audio-queue";
import { getSegmentDurationMs } from "@/hooks/use-episode-playback";
import { useSampleSegmentClock } from "@/hooks/use-sample-segment-clock";
import { AudioStatusBar } from "@/components/kuro/player/audio-status-bar";
import { CaptionPanel } from "@/components/kuro/player/caption-panel";
import { PlaybackControls } from "@/components/kuro/player/playback-controls";
import { PlayerNotice } from "@/components/kuro/player/player-notice";
import { PodcastStage } from "@/components/kuro/player/podcast-stage";
import { TranscriptDownload } from "@/components/kuro/player/transcript-download";
import { TranscriptDrawer } from "@/components/kuro/player/transcript-drawer";
import { downloadEpisodeTranscriptFile } from "@/lib/experience/downloads";
import { selectEditorialShot } from "@/lib/experience/editorial-shot-selector";
import {
  buildSubtitleCues,
  resolveActiveSubtitleCue,
  resolveSegmentTimingWindow,
} from "@/lib/experience/subtitle-cues";

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
 * Screen 4 — Immersive 9:16 3D-layered Portrait Podcast Player with mobile full-viewport
 * layout, synchronized 1–2 line subtitle cues, accessible mobile Transcript drawer,
 * names-only cast labels, and desktop theater companion rail.
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

  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [sampleResetNonce, setSampleResetNonce] = useState(0);
  const [actionStatusMessage, setActionStatusMessage] = useState<string | null>(null);

  const transcriptTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const exportCleanupsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      exportCleanupsRef.current.forEach((cleanup) => cleanup());
      exportCleanupsRef.current = [];
    };
  }, []);

  const handleTogglePlayPause = useCallback(() => {
    if (snapshot?.playbackStatus === "complete") {
      setSampleResetNonce((n) => n + 1);
    }
    queue.togglePlayPause();
  }, [queue, snapshot?.playbackStatus]);

  const handlePrevious = useCallback(() => {
    setSampleResetNonce((n) => n + 1);
    queue.previous();
  }, [queue]);

  const handleNext = useCallback(() => {
    setSampleResetNonce((n) => n + 1);
    queue.next();
  }, [queue]);

  const handleRestart = useCallback(() => {
    setSampleResetNonce((n) => n + 1);
    queue.restart();
  }, [queue]);

  const handleReplay = useCallback(() => {
    setSampleResetNonce((n) => n + 1);
    queue.replay();
  }, [queue]);

  useEffect(() => {
    if (!isActionsMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        !actionsMenuRef.current?.contains(target) &&
        !actionsTriggerRef.current?.contains(target)
      ) {
        setIsActionsMenuOpen(false);
      }
    }

    function handleMenuKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsActionsMenuOpen(false);
        actionsTriggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleMenuKeyDown);
    };
  }, [isActionsMenuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!snapshot || !snapshot.hasStartedPodcast || isTranscriptOpen || isActionsMenuOpen) {
        return;
      }
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
        handleTogglePlayPause();
      } else if (event.code === "ArrowLeft") {
        event.preventDefault();
        handlePrevious();
      } else if (event.code === "ArrowRight") {
        event.preventDefault();
        handleNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    handleNext,
    handlePrevious,
    handleTogglePlayPause,
    isActionsMenuOpen,
    isTranscriptOpen,
    snapshot,
  ]);

  const currentSegment = snapshot?.activeSegment ?? episode.segments[0];
  const sampleSegmentDurationMs = currentSegment ? getSegmentDurationMs(currentSegment) : 3000;
  const sampleSegmentKey = `${episode.id}:${snapshot?.activeSegmentIndex ?? 0}:${sampleResetNonce}`;

  const sampleIntraElapsedMs = useSampleSegmentClock({
    enabled: Boolean(snapshot?.hasStartedPodcast && snapshot?.isSamplePreview),
    playbackStatus: snapshot?.playbackStatus ?? "idle",
    segmentKey: sampleSegmentKey,
    segmentDurationMs: sampleSegmentDurationMs,
  });

  const timingWindow = useMemo(() => {
    if (!currentSegment || !snapshot) {
      return { intraElapsedMs: 0, durationMs: 3000 };
    }
    return resolveSegmentTimingWindow({
      segment: currentSegment,
      activeSegmentIndex: snapshot.activeSegmentIndex,
      isSamplePreview: snapshot.isSamplePreview,
      elapsedMs: snapshot.elapsedMs,
      timeline: snapshot.timeline,
      sampleIntraElapsedMs,
    });
  }, [currentSegment, sampleIntraElapsedMs, snapshot]);

  const cues = useMemo(() => {
    if (!currentSegment) return [];
    return buildSubtitleCues(currentSegment.text, timingWindow.durationMs);
  }, [currentSegment, timingWindow.durationMs]);

  const activeCue = useMemo(
    () => resolveActiveSubtitleCue(cues, timingWindow.intraElapsedMs),
    [cues, timingWindow.intraElapsedMs],
  );

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

  const canPrev = snapshot.isSamplePreview
    ? snapshot.activeSegmentIndex > 0
    : snapshot.canScrub && snapshot.activeSegmentIndex > 0;
  const maxSeekableIndex = snapshot.isSamplePreview
    ? snapshot.totalTurns - 1
    : snapshot.timeline.length - 1;
  const canNext = snapshot.isSamplePreview
    ? snapshot.activeSegmentIndex < snapshot.totalTurns - 1
    : snapshot.canScrub && snapshot.activeSegmentIndex < maxSeekableIndex;

  const displayElapsedMs = snapshot.isSamplePreview
    ? Math.min(
        snapshot.compiledDurationMs,
        (snapshot.timeline[snapshot.activeSegmentIndex]?.startMs ?? snapshot.elapsedMs) +
          timingWindow.intraElapsedMs,
      )
    : snapshot.elapsedMs;

  const paddedTurn = String(snapshot.activeSegmentIndex + 1).padStart(2, "0");
  const paddedTotal = String(snapshot.totalTurns).padStart(2, "0");

  function handleDownloadWavFromMenu() {
    const res = queue.downloadAudio();
    if (res) {
      setActionStatusMessage(`Audio downloaded (${res.filename})`);
    }
    setIsActionsMenuOpen(false);
  }

  function handleDownloadTranscriptFromMenu() {
    const res = downloadEpisodeTranscriptFile(episode);
    exportCleanupsRef.current.push(res.dispose);
    setActionStatusMessage(`Transcript downloaded (${res.filename})`);
    setIsActionsMenuOpen(false);
  }

  return (
    <article aria-label={episode.title} className="mx-auto w-full md:max-w-[1120px]">
      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)] lg:gap-5">
        {/* 9:16 Immersive Portrait Broadcast Frame */}
        <div className="kuro-portrait-frame relative flex flex-col">
          {/* Depth Plane 4 Top Overlay HUD */}
          <div className="kuro-player-top-scrim absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-1.5 px-2 pt-[max(0.45rem,env(safe-area-inset-top))] pb-3 text-white">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="kuro-interactive inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-sm font-bold text-white backdrop-blur-xs hover:bg-black/65"
            >
              <span aria-hidden="true">←</span>
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-1.5 px-0.5">
              <span className="block min-w-0 flex-1 truncate whitespace-nowrap text-xs font-extrabold text-white drop-shadow-xs">
                {episode.title}
              </span>
              {snapshot.isSamplePreview || source === "sample" ? (
                <span className="hidden shrink-0 rounded-full border border-amber-300/45 bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-100 min-[315px]:inline-flex">
                  Sample
                </span>
              ) : null}
            </div>

            <span className="font-mono-kuro hidden shrink-0 rounded-lg bg-black/40 px-1.5 py-1 text-[11px] font-bold text-white/90 min-[355px]:inline-flex">
              {paddedTurn}/{paddedTotal}
            </span>

            <button
              ref={transcriptTriggerRef}
              type="button"
              onClick={() => {
                setIsActionsMenuOpen(false);
                setIsTranscriptOpen(true);
              }}
              aria-expanded={isTranscriptOpen}
              className="kuro-interactive inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-white/18 bg-black/45 px-2.5 text-[11px] font-bold text-white backdrop-blur-xs hover:bg-black/65 lg:hidden"
            >
              Transcript
            </button>

            <div className="relative shrink-0">
              <button
                ref={actionsTriggerRef}
                type="button"
                onClick={() => setIsActionsMenuOpen((open) => !open)}
                aria-label="Episode actions"
                aria-haspopup="menu"
                aria-expanded={isActionsMenuOpen}
                className="kuro-interactive inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/15 bg-black/45 text-base font-extrabold text-white backdrop-blur-xs hover:bg-black/65"
              >
                <span aria-hidden="true">⋯</span>
              </button>

              {isActionsMenuOpen ? (
                <div
                  ref={actionsMenuRef}
                  role="menu"
                  aria-label="Episode actions"
                  className="absolute top-12 right-0 z-40 w-56 space-y-1 rounded-2xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] p-1.5 text-[var(--kuro-ink)] shadow-xl"
                >
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!snapshot.canDownloadAudio}
                    onClick={handleDownloadWavFromMenu}
                    className="kuro-interactive flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-xs font-extrabold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Download Audio (.wav)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleDownloadTranscriptFromMenu}
                    className="kuro-interactive flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                  >
                    Download transcript (.txt)
                  </button>
                  {onOpenEpisodes ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        onOpenEpisodes();
                      }}
                      className="kuro-interactive flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                    >
                      Session episodes
                    </button>
                  ) : null}
                  {onCreateAnother ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        onCreateAnother();
                      }}
                      className="kuro-interactive flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                    >
                      Create another episode
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {actionStatusMessage ? (
            <p role="status" aria-live="polite" className="sr-only">
              {actionStatusMessage}
            </p>
          ) : null}

          {/* Depth Planes 1–3: 3D Broadcast Studio Stage */}
          <PodcastStage
            episode={episode}
            currentSegment={currentSegment}
            status={snapshot.playbackStatus}
            shotDecision={shotDecision}
            isSilentFallback={snapshot.isSamplePreview}
            isInPadding={snapshot.isInPadding}
            isPreparingAudio={snapshot.isBufferingAtBoundary}
          />

          {/* Depth Plane 4: Conditional Recovery + 1–2 Line Subtitles + Compact Scrubber/Controls */}
          <div className="kuro-player-bottom-dock relative z-25 shrink-0 pt-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
            <AudioStatusBar
              snapshot={snapshot}
              onResumeAutoplay={queue.play}
              onRetryFailedTurns={queue.retryFailedTurns}
              onBackToForm={onBack}
            />

            <CaptionPanel
              activeHost={snapshot.activeHost}
              currentSegment={currentSegment}
              activeCue={activeCue}
              status={snapshot.playbackStatus}
              onReplay={handleReplay}
            />

            <PlaybackControls
              status={snapshot.playbackStatus}
              isSamplePreview={snapshot.isSamplePreview}
              isBufferingAtBoundary={snapshot.isBufferingAtBoundary}
              canPlay={snapshot.canPlay}
              canScrub={snapshot.canScrub}
              elapsedMs={displayElapsedMs}
              compiledDurationMs={snapshot.compiledDurationMs}
              fullDurationMs={snapshot.fullDurationMs}
              currentSegmentIndex={snapshot.activeSegmentIndex}
              totalSegments={snapshot.totalTurns}
              canPrev={canPrev}
              canNext={canNext}
              onTogglePlayPause={handleTogglePlayPause}
              onPrevious={handlePrevious}
              onNext={handleNext}
              onRestart={handleRestart}
              onSeekToMs={queue.seekToMs}
            />
          </div>
        </div>

        {/* Desktop Theater Companion Rail (Transcript & Exports stay here on lg+, never duplicated below video) */}
        <aside
          aria-label="Episode overview and turns"
          className="hidden min-w-0 space-y-3 lg:flex lg:flex-col"
        >
          <div className="kuro-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-mono-kuro text-xs font-semibold capitalize text-[var(--kuro-ink-muted)]">
                {episode.tone} · {episode.length} · {episode.hosts.length} Kuromates ·{" "}
                {episode.segments.length} turns
              </p>
              {onOpenEpisodes ? (
                <button
                  type="button"
                  onClick={onOpenEpisodes}
                  className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-3 py-1.5 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                >
                  Session episodes
                </button>
              ) : null}
            </div>

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
                Turn transcript
              </h2>
              <span className="font-mono-kuro text-xs font-semibold text-[var(--kuro-ink-muted)]">
                Turn {paddedTurn} / {paddedTotal}
              </span>
            </div>

            <ol className="mt-2.5 max-h-[300px] space-y-1.5 overflow-y-auto pr-1">
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

            <div className="mt-3 space-y-2 border-t border-[var(--kuro-border)] pt-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={!snapshot.canDownloadAudio}
                  onClick={() => {
                    const res = queue.downloadAudio();
                    if (res) {
                      setActionStatusMessage(`Audio downloaded (${res.filename})`);
                    }
                  }}
                  aria-label={
                    snapshot.canDownloadAudio
                      ? "Download Audio (.wav)"
                      : snapshot.isSamplePreview
                        ? "Download Audio disabled in Sample Preview"
                        : "Download Audio available after full episode compilation"
                  }
                  className="kuro-interactive min-h-11 w-full rounded-xl border border-[var(--kuro-accent)]/40 bg-[var(--kuro-accent-soft)] px-3 py-2 text-xs font-extrabold text-[var(--kuro-accent-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:border-[var(--kuro-border)] disabled:bg-[var(--kuro-surface-muted)] disabled:text-[var(--kuro-ink-muted)]"
                >
                  Download Audio (.wav)
                </button>
                <TranscriptDownload episode={episode} />
              </div>

              {onCreateAnother ? (
                <button
                  type="button"
                  onClick={onCreateAnother}
                  className="kuro-interactive min-h-11 w-full rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                >
                  Create another episode
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <TranscriptDrawer
        isOpen={isTranscriptOpen}
        episode={episode}
        hostMap={hostMap}
        activeSegmentIndex={snapshot.activeSegmentIndex}
        isSamplePreview={snapshot.isSamplePreview}
        canScrub={snapshot.canScrub}
        playableRangeMs={snapshot.playableRangeMs}
        timeline={snapshot.timeline}
        canDownloadAudio={snapshot.canDownloadAudio}
        triggerRef={transcriptTriggerRef}
        onJumpToMs={queue.seekToMs}
        onDownloadAudio={queue.downloadAudio}
        onClose={() => setIsTranscriptOpen(false)}
      />
    </article>
  );
}
