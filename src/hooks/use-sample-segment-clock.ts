"use client";

import { useEffect, useRef, useState } from "react";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";

export interface SampleSegmentClockOptions {
  enabled: boolean;
  playbackStatus: PlaybackStatus;
  segmentKey: string;
  segmentDurationMs: number;
}

interface ClockState {
  key: string;
  elapsedMs: number;
}

const EMIT_STEP_MS = 48;

/**
 * Lightweight intra-segment requestAnimationFrame clock active ONLY during Sample Preview
 * playback so 1–2 line subtitle cues advance mid-turn without modifying the frozen compiler.
 */
export function useSampleSegmentClock({
  enabled,
  playbackStatus,
  segmentKey,
  segmentDurationMs,
}: SampleSegmentClockOptions): number {
  const isPlaying = enabled && playbackStatus === "playing";
  const [clockState, setClockState] = useState<ClockState>({
    key: segmentKey,
    elapsedMs: 0,
  });
  const latestRef = useRef<ClockState>({ key: segmentKey, elapsedMs: 0 });

  useEffect(() => {
    if (!enabled) {
      latestRef.current = { key: segmentKey, elapsedMs: 0 };
      return;
    }

    if (playbackStatus === "idle") {
      latestRef.current = { key: segmentKey, elapsedMs: 0 };
      return;
    }

    if (playbackStatus === "complete") {
      latestRef.current = { key: segmentKey, elapsedMs: segmentDurationMs };
      return;
    }

    if (!isPlaying) {
      if (latestRef.current.key !== segmentKey) {
        latestRef.current = { key: segmentKey, elapsedMs: 0 };
      }
      return;
    }

    const initialOffset =
      latestRef.current.key === segmentKey
        ? Math.max(0, Math.min(segmentDurationMs, latestRef.current.elapsedMs))
        : 0;
    const startPerf = performance.now() - initialOffset;
    let lastEmitted = initialOffset;
    let rafId = 0;

    const tick = () => {
      const nextElapsed = Math.min(
        segmentDurationMs,
        Math.max(0, Math.round(performance.now() - startPerf)),
      );
      if (Math.abs(nextElapsed - lastEmitted) >= EMIT_STEP_MS || nextElapsed >= segmentDurationMs) {
        lastEmitted = nextElapsed;
        const nextState: ClockState = { key: segmentKey, elapsedMs: nextElapsed };
        latestRef.current = nextState;
        setClockState(nextState);
      }
      if (nextElapsed < segmentDurationMs) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [enabled, isPlaying, playbackStatus, segmentDurationMs, segmentKey]);

  if (!enabled || playbackStatus === "idle") {
    return 0;
  }
  if (playbackStatus === "complete") {
    return segmentDurationMs;
  }
  if (clockState.key !== segmentKey) {
    return 0;
  }
  return Math.min(segmentDurationMs, Math.max(0, clockState.elapsedMs));
}
