"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AudioSegmentMetadata,
  DialogueSegment,
  Episode,
  Host,
} from "@contracts/episode.schema";

export type PlaybackStatus = "idle" | "playing" | "paused" | "complete";
export type AudioAvailability = "none" | "partial" | "full";

const MIN_TURN_DURATION_MS = 2500;
const MAX_SILENT_DURATION_MS = 8000;
const MAX_METADATA_DURATION_MS = 12000;
const REACTION_START_DELAY_MS = 80;
const REACTION_END_DELAY_MS = 760;

/** Computes bounded playback duration for timed silent captions or audio metadata. */
export function getSegmentDurationMs(segment: DialogueSegment): number {
  if (typeof segment.durationMs === "number" && Number.isFinite(segment.durationMs) && segment.durationMs > 0) {
    return Math.min(MAX_METADATA_DURATION_MS, Math.max(MIN_TURN_DURATION_MS, Math.round(segment.durationMs)));
  }
  return Math.min(MAX_SILENT_DURATION_MS, Math.max(MIN_TURN_DURATION_MS, 2500 + segment.text.length * 35));
}

function summarizeAudioAvailability(segments: DialogueSegment[]): {
  availability: AudioAvailability;
  readyCount: number;
} {
  const readyCount = segments.filter(
    (segment) => typeof segment.audioUrl === "string" && segment.audioUrl.trim().length > 0,
  ).length;
  if (readyCount === 0) {
    return { availability: "none", readyCount };
  }
  if (readyCount === segments.length) {
    return { availability: "full", readyCount };
  }
  return { availability: "partial", readyCount };
}

interface InternalPlaybackState {
  episode: Episode;
  index: number;
  status: PlaybackStatus;
  reactionHostId: string | null;
}

export interface EpisodePlaybackState {
  currentSegmentIndex: number;
  totalSegments: number;
  status: PlaybackStatus;
  isPlaying: boolean;
  isComplete: boolean;
  activeSpeakerId: string;
  activeHost: Host | undefined;
  currentSegment: DialogueSegment | undefined;
  previousSegment: DialogueSegment | null;
  previousHost: Host | undefined;
  reactionHostId: string | null;
  playbackProgress: number;
  canPrev: boolean;
  canNext: boolean;
  audioAvailability: AudioAvailability;
  readyAudioCount: number;
  activeAudioFormat: AudioSegmentMetadata | undefined;
  notice: string | null;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  previous: () => void;
  next: () => void;
  restart: () => void;
  replay: () => void;
}

/** React-safe local playback controller with token-guarded single-timer advancement. */
export function useEpisodePlayback(episode: Episode): EpisodePlaybackState {
  const [internal, setInternal] = useState<InternalPlaybackState>(() => ({
    episode,
    index: 0,
    status: "idle",
    reactionHostId: null,
  }));

  const runTokenRef = useRef(0);

  const sameEpisode = internal.episode === episode;
  const totalSegments = episode.segments.length;
  const maxIndex = Math.max(0, totalSegments - 1);
  const currentSegmentIndex = sameEpisode
    ? Math.max(0, Math.min(internal.index, maxIndex))
    : 0;
  const status: PlaybackStatus = sameEpisode ? internal.status : "idle";
  const reactionHostId = sameEpisode ? internal.reactionHostId : null;

  const currentSegment = episode.segments[currentSegmentIndex];
  const previousSegment = currentSegmentIndex > 0 ? episode.segments[currentSegmentIndex - 1] ?? null : null;
  const activeSpeakerId = currentSegment?.speakerId ?? "";
  const activeHost = useMemo(
    () => episode.hosts.find((host) => host.id === activeSpeakerId),
    [episode.hosts, activeSpeakerId],
  );
  const previousHost = useMemo(
    () => (previousSegment ? episode.hosts.find((host) => host.id === previousSegment.speakerId) : undefined),
    [episode.hosts, previousSegment],
  );

  const { availability: audioAvailability, readyCount: readyAudioCount } = useMemo(
    () => summarizeAudioAvailability(episode.segments),
    [episode.segments],
  );

  const notice = useMemo(() => {
    if (audioAvailability === "partial") {
      return `Audio clips are unavailable for ${totalSegments - readyAudioCount} of ${totalSegments} turns. Captions remain active for every turn.`;
    }
    if (audioAvailability === "none") {
      return "Timed preview mode — captions advance automatically. Use Preview Kuromate voice below for single-turn hosted speech; full-episode audio arrives next.";
    }
    return "Timed preview mode — single-turn Kuromate voice preview is available; full-episode audio sync connects later.";
  }, [audioAvailability, readyAudioCount, totalSegments]);

  useEffect(() => {
    const token = runTokenRef.current + 1;
    runTokenRef.current = token;

    const seg = episode.segments[currentSegmentIndex];
    if (status !== "playing" || !seg) {
      return () => {
        runTokenRef.current += 1;
      };
    }

    const durationMs = getSegmentDurationMs(seg);
    const prevSeg = currentSegmentIndex > 0 ? episode.segments[currentSegmentIndex - 1] : null;
    let reactStartTimer: number | undefined;
    let reactEndTimer: number | undefined;

    if (seg.emotion === "reacting") {
      const candidateHost =
        (prevSeg && prevSeg.speakerId !== seg.speakerId
          ? episode.hosts.find((host) => host.id === prevSeg.speakerId)
          : undefined) ?? episode.hosts.find((host) => host.id !== seg.speakerId);

      if (candidateHost) {
        const reactTargetId = candidateHost.id;
        reactStartTimer = window.setTimeout(() => {
          if (runTokenRef.current !== token) return;
          setInternal((prev) => ({
            episode,
            index: prev.episode === episode ? prev.index : currentSegmentIndex,
            status: prev.episode === episode ? prev.status : "playing",
            reactionHostId: reactTargetId,
          }));
        }, REACTION_START_DELAY_MS);

        reactEndTimer = window.setTimeout(() => {
          if (runTokenRef.current !== token) return;
          setInternal((prev) => ({
            episode,
            index: prev.episode === episode ? prev.index : currentSegmentIndex,
            status: prev.episode === episode ? prev.status : "playing",
            reactionHostId: null,
          }));
        }, REACTION_END_DELAY_MS);
      }
    }

    const advanceTimer = window.setTimeout(() => {
      if (runTokenRef.current !== token) return;
      if (currentSegmentIndex < totalSegments - 1) {
        setInternal({
          episode,
          index: currentSegmentIndex + 1,
          status: "playing",
          reactionHostId: null,
        });
      } else {
        setInternal({
          episode,
          index: currentSegmentIndex,
          status: "complete",
          reactionHostId: null,
        });
      }
    }, durationMs);

    return () => {
      runTokenRef.current += 1;
      window.clearTimeout(advanceTimer);
      if (reactStartTimer !== undefined) window.clearTimeout(reactStartTimer);
      if (reactEndTimer !== undefined) window.clearTimeout(reactEndTimer);
    };
  }, [status, currentSegmentIndex, episode, totalSegments]);

  const play = useCallback(() => {
    setInternal((prev) => {
      const activeSame = prev.episode === episode;
      const curIndex = activeSame ? Math.max(0, Math.min(prev.index, maxIndex)) : 0;
      const curStatus = activeSame ? prev.status : "idle";
      return {
        episode,
        index: curStatus === "complete" ? 0 : curIndex,
        status: "playing",
        reactionHostId: null,
      };
    });
  }, [episode, maxIndex]);

  const pause = useCallback(() => {
    setInternal((prev) => {
      const activeSame = prev.episode === episode;
      const curIndex = activeSame ? Math.max(0, Math.min(prev.index, maxIndex)) : 0;
      const curStatus = activeSame ? prev.status : "idle";
      return {
        episode,
        index: curIndex,
        status: curStatus === "playing" ? "paused" : curStatus,
        reactionHostId: null,
      };
    });
  }, [episode, maxIndex]);

  const togglePlayPause = useCallback(() => {
    if (status === "playing") {
      pause();
    } else {
      play();
    }
  }, [status, pause, play]);

  const previous = useCallback(() => {
    setInternal((prev) => {
      const activeSame = prev.episode === episode;
      const curIndex = activeSame ? Math.max(0, Math.min(prev.index, maxIndex)) : 0;
      const curStatus = activeSame ? prev.status : "idle";
      const nextIndex = Math.max(0, curIndex - 1);
      const nextStatus: PlaybackStatus =
        curStatus === "playing" ? "playing" : curStatus === "idle" && nextIndex === 0 ? "idle" : "paused";
      return {
        episode,
        index: nextIndex,
        status: nextStatus,
        reactionHostId: null,
      };
    });
  }, [episode, maxIndex]);

  const next = useCallback(() => {
    setInternal((prev) => {
      const activeSame = prev.episode === episode;
      const curIndex = activeSame ? Math.max(0, Math.min(prev.index, maxIndex)) : 0;
      const curStatus = activeSame ? prev.status : "idle";
      const nextIndex = Math.min(maxIndex, curIndex + 1);
      const nextStatus: PlaybackStatus = curStatus === "playing" ? "playing" : "paused";
      return {
        episode,
        index: nextIndex,
        status: nextStatus,
        reactionHostId: null,
      };
    });
  }, [episode, maxIndex]);

  const restart = useCallback(() => {
    setInternal({
      episode,
      index: 0,
      status: "paused",
      reactionHostId: null,
    });
  }, [episode]);

  const replay = useCallback(() => {
    setInternal({
      episode,
      index: 0,
      status: "playing",
      reactionHostId: null,
    });
  }, [episode]);

  const playbackProgress = totalSegments > 0 ? Math.round(((currentSegmentIndex + 1) / totalSegments) * 100) : 0;

  return {
    currentSegmentIndex,
    totalSegments,
    status,
    isPlaying: status === "playing",
    isComplete: status === "complete",
    activeSpeakerId,
    activeHost,
    currentSegment,
    previousSegment,
    previousHost,
    reactionHostId,
    playbackProgress,
    canPrev: currentSegmentIndex > 0,
    canNext: currentSegmentIndex < maxIndex,
    audioAvailability,
    readyAudioCount,
    activeAudioFormat: currentSegment?.audioFormat,
    notice,
    play,
    pause,
    togglePlayPause,
    previous,
    next,
    restart,
    replay,
  };
}
