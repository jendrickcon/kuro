"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode } from "@contracts/episode.schema";
import {
  buildIdleEpisodeSnapshot,
  createEpisodeAudioQueueEngine,
  type AudioDriver,
  type AudioDriverCallbacks,
  type AudioPlayOutcome,
  type EpisodeAudioQueueController,
  type EpisodeAudioQueueSnapshot,
  type FetchSegmentAudioPayload,
  type FetchSegmentAudioResult,
} from "@/lib/tts/episode-audio-queue-engine";
import { TtsErrorCodeSchema, type TtsErrorCode } from "@/lib/tts/tts-contract";

interface TtsErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
  };
}

function readDurationHeaderMs(response: Response): number | null {
  const raw = response.headers.get("X-Kuro-Audio-Duration-Ms");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function fetchBrowserSegmentAudio(
  payload: FetchSegmentAudioPayload,
  signal: AbortSignal,
): Promise<FetchSegmentAudioResult> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorCode: TtsErrorCode =
        response.status === 429
          ? "TTS_RATE_LIMITED"
          : response.status === 504
            ? "TTS_TIMEOUT"
            : "TTS_PROVIDER_UNAVAILABLE";
      let message = "Hosted Kuromate voice is unavailable right now. Captions remain active.";
      let retryable = response.status >= 500 || response.status === 429;

      try {
        const json = (await response.json()) as TtsErrorEnvelope;
        const parsedCode = TtsErrorCodeSchema.safeParse(json?.error?.code);
        if (parsedCode.success) {
          errorCode = parsedCode.data;
        }
        if (typeof json?.error?.message === "string" && json.error.message.trim()) {
          message = json.error.message.trim();
        }
        if (typeof json?.error?.retryable === "boolean") {
          retryable = json.error.retryable;
        }
      } catch {
        // Keep safe generic fallback message when response body is unreadable.
      }

      return {
        ok: false,
        httpStatus: response.status,
        errorCode,
        message,
        retryable,
        retryAfterHeader: response.headers.get("Retry-After"),
      };
    }

    const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("audio/")) {
      return {
        ok: false,
        httpStatus: 502,
        errorCode: "TTS_AUDIO_INVALID",
        message: "Received an invalid audio response. Captions remain active.",
        retryable: false,
      };
    }

    const durationMs = readDurationHeaderMs(response);
    const blob = await response.blob();
    if (blob.size === 0) {
      return {
        ok: false,
        httpStatus: 502,
        errorCode: "TTS_AUDIO_INVALID",
        message: "Hosted audio response was empty. Captions remain active.",
        retryable: true,
      };
    }

    return {
      ok: true,
      blob,
      contentType,
      durationMs,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return {
        ok: false,
        httpStatus: 499,
        errorCode: "TTS_GENERATION_FAILED",
        message: "Voice request cancelled.",
        retryable: false,
      };
    }
    return {
      ok: false,
      httpStatus: 503,
      errorCode: "TTS_PROVIDER_UNAVAILABLE",
      message: "Unable to reach hosted Kuromate voice service. Captions remain active.",
      retryable: true,
      isNetworkError: true,
    };
  }
}

/** Creates one controlled reusable HTMLAudioElement driver for sequential playback without autoplay hacks. */
function createBrowserAudioDriver(): AudioDriver {
  let element: HTMLAudioElement | null = typeof Audio !== "undefined" ? new Audio() : null;
  let activeGeneration = 0;
  let currentCallbacks: AudioDriverCallbacks | null = null;

  function clearHandlers(audio: HTMLAudioElement) {
    audio.onloadedmetadata = null;
    audio.oncanplay = null;
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;
  }

  function mapPlayError(err: unknown): AudioPlayOutcome {
    const name = err instanceof Error ? err.name : "";
    if (name === "NotAllowedError") {
      return { ok: false, reason: "autoplay_blocked" };
    }
    if (name === "AbortError") {
      return { ok: false, reason: "aborted" };
    }
    return { ok: false, reason: "decode_error" };
  }

  function attachHandlers(audio: HTMLAudioElement, gen: number) {
    audio.onloadedmetadata = () => {
      if (gen !== activeGeneration) return;
      const durationMs =
        Number.isFinite(audio.duration) && audio.duration > 0
          ? Math.round(audio.duration * 1000)
          : null;
      currentCallbacks?.onLoadedMetadata(durationMs);
    };
    audio.oncanplay = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onCanPlay();
    };
    audio.onplay = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onPlay();
    };
    audio.onpause = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onPause();
    };
    audio.onended = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onEnded();
    };
    audio.onerror = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onDecodeError();
    };
  }

  return {
    async loadAndPlay(
      url: string,
      startTimeSec: number,
      callbacks: AudioDriverCallbacks,
    ): Promise<AudioPlayOutcome> {
      if (!element) {
        return { ok: false, reason: "decode_error" };
      }

      const audio = element;
      const gen = ++activeGeneration;
      currentCallbacks = callbacks;
      clearHandlers(audio);
      try {
        audio.pause();
      } catch {
        // Ignore pause glitches prior to switching clip source.
      }

      audio.preload = "auto";
      audio.src = url;

      let pendingSeekApplied = startTimeSec <= 0;

      attachHandlers(audio, gen);
      audio.onloadedmetadata = () => {
        if (gen !== activeGeneration) return;
        if (!pendingSeekApplied && startTimeSec > 0) {
          pendingSeekApplied = true;
          try {
            audio.currentTime = startTimeSec;
          } catch {
            // Ignore seek failure when browser metadata limits seeking.
          }
        }
        const durationMs =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000)
            : null;
        currentCallbacks?.onLoadedMetadata(durationMs);
      };

      try {
        await audio.play();
        if (gen !== activeGeneration) {
          return { ok: false, reason: "aborted" };
        }
        return { ok: true };
      } catch (err) {
        if (gen !== activeGeneration) {
          return { ok: false, reason: "aborted" };
        }
        return mapPlayError(err);
      }
    },

    async resume(callbacks?: AudioDriverCallbacks): Promise<AudioPlayOutcome> {
      if (!element) {
        return { ok: false, reason: "decode_error" };
      }
      const gen = activeGeneration;
      if (callbacks) {
        currentCallbacks = callbacks;
      }
      try {
        await element.play();
        if (gen !== activeGeneration) {
          return { ok: false, reason: "aborted" };
        }
        return { ok: true };
      } catch (err) {
        if (gen !== activeGeneration) {
          return { ok: false, reason: "aborted" };
        }
        return mapPlayError(err);
      }
    },

    pause() {
      if (!element) return 0;
      const currentTime = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      try {
        element.pause();
      } catch {
        // Ignore browser pause quirks.
      }
      return currentTime;
    },

    stop() {
      activeGeneration += 1;
      if (!element) return;
      clearHandlers(element);
      try {
        element.pause();
      } catch {
        // Ignore pause quirks during stop.
      }
      element.removeAttribute("src");
      try {
        element.load();
      } catch {
        // Ignore load reset quirks.
      }
    },

    getCurrentTimeSec() {
      if (!element || !Number.isFinite(element.currentTime)) return 0;
      return element.currentTime;
    },

    dispose() {
      activeGeneration += 1;
      if (!element) return;
      clearHandlers(element);
      try {
        element.pause();
      } catch {
        // Ignore dispose quirks.
      }
      element.removeAttribute("src");
      try {
        element.load();
      } catch {
        // Ignore dispose quirks.
      }
      element = null;
    },
  };
}

export interface EpisodeAudioQueueHookResult {
  snapshot: EpisodeAudioQueueSnapshot;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  previous: () => void;
  next: () => void;
  restart: () => void;
  replay: () => void;
  retryCurrentSegment: () => void;
  skipCurrentSegment: () => void;
  continueWithTimedCaptions: () => void;
  retryHostedAudio: () => void;
  dispose: () => void;
}

/** Connects the authoritative episode audio-queue engine to React with deterministic cleanup on unmount or episode switch. */
export function useEpisodeAudioQueue(episode: Episode): EpisodeAudioQueueHookResult {
  const [state, setState] = useState<{
    episode: Episode;
    snapshot: EpisodeAudioQueueSnapshot;
  }>(() => ({
    episode,
    snapshot: buildIdleEpisodeSnapshot(episode),
  }));

  const engineRef = useRef<EpisodeAudioQueueController | null>(null);

  useEffect(() => {
    const engine = createEpisodeAudioQueueEngine(episode, {
      fetchSegmentAudio: fetchBrowserSegmentAudio,
      audioDriver: createBrowserAudioDriver(),
    });
    engineRef.current = engine;

    const unsubscribe = engine.subscribe((nextSnapshot) => {
      setState({ episode, snapshot: nextSnapshot });
    });

    return () => {
      unsubscribe();
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [episode]);

  const snapshot =
    state.episode === episode ? state.snapshot : buildIdleEpisodeSnapshot(episode);

  useEffect(() => {
    if (!snapshot.cooldownActive) {
      return;
    }
    const intervalId = window.setInterval(() => {
      engineRef.current?.refreshCooldownDisplay();
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [snapshot.cooldownActive]);

  const play = useCallback(() => {
    engineRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    engineRef.current?.pause();
  }, []);

  const togglePlayPause = useCallback(() => {
    engineRef.current?.togglePlayPause();
  }, []);

  const previous = useCallback(() => {
    engineRef.current?.previous();
  }, []);

  const next = useCallback(() => {
    engineRef.current?.next();
  }, []);

  const restart = useCallback(() => {
    engineRef.current?.restart();
  }, []);

  const replay = useCallback(() => {
    engineRef.current?.replay();
  }, []);

  const retryCurrentSegment = useCallback(() => {
    engineRef.current?.retryCurrentSegment();
  }, []);

  const skipCurrentSegment = useCallback(() => {
    engineRef.current?.skipCurrentSegment();
  }, []);

  const continueWithTimedCaptions = useCallback(() => {
    engineRef.current?.continueWithTimedCaptions();
  }, []);

  const retryHostedAudio = useCallback(() => {
    engineRef.current?.retryHostedAudio();
  }, []);

  const dispose = useCallback(() => {
    engineRef.current?.dispose();
  }, []);

  return {
    snapshot,
    play,
    pause,
    togglePlayPause,
    previous,
    next,
    restart,
    replay,
    retryCurrentSegment,
    skipCurrentSegment,
    continueWithTimedCaptions,
    retryHostedAudio,
    dispose,
  };
}
