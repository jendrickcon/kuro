import {
  resolveEpisodeVoiceIdentities,
  type KuromateIdentityProfileId,
} from "@/lib/tts/kuromate-identity-ids";
import { parseQuotaClassHeader } from "@/lib/tts/retry-after";
import {
  HostedTtsHealthStateSchema,
  TtsErrorCodeSchema,
  TtsQuotaClassSchema,
  type HostedTtsHealthState,
  type TtsErrorCode,
} from "@/lib/tts/tts-contract";
import {
  buildIdleEpisodeSnapshot,
  createEpisodeAudioQueueEngine,
  getBrowserTtsSessionCircuit,
  type AudioDriver,
  type AudioDriverCallbacks,
  type AudioPlayOutcome,
  type EpisodeAudioQueueController,
  type EpisodeAudioQueueSnapshot,
  type FetchSegmentAudioPayload,
  type FetchSegmentAudioResult,
} from "@/lib/tts/episode-audio-queue-engine";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode } from "@contracts/episode.schema";

interface TtsErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    retryable?: unknown;
    quotaClass?: unknown;
    hostedState?: unknown;
  };
}

function readDurationHeaderMs(response: Response): number | null {
  const raw = response.headers.get("X-Kuro-Audio-Duration-Ms");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseHostedStateHeader(value: string | null | undefined): HostedTtsHealthState | undefined {
  const parsed = HostedTtsHealthStateSchema.safeParse(value?.trim());
  return parsed.success ? parsed.data : undefined;
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

    const headerQuotaClass = parseQuotaClassHeader(
      response.headers.get("X-Kuro-TTS-Quota-Class"),
    );
    const fallbackUsed = response.headers.get("X-Kuro-TTS-Fallback-Used") === "true";
    const retryAfterHeader =
      response.headers.get("X-Kuro-TTS-Retry-After") ?? response.headers.get("Retry-After");
    const profileId =
      response.headers.get("X-Kuro-TTS-Profile") ?? response.headers.get("X-Kuro-Profile-Id");
    const voiceIdentityId = response.headers.get("X-Kuro-TTS-Identity");
    let hostedState = parseHostedStateHeader(response.headers.get("X-Kuro-TTS-Hosted-State"));

    if (!response.ok) {
      let errorCode: TtsErrorCode =
        response.status === 429
          ? "TTS_RATE_LIMITED"
          : response.status === 504
            ? "TTS_TIMEOUT"
            : "TTS_PROVIDER_UNAVAILABLE";
      let message = "Hosted Kuromate voice is unavailable right now. Captions remain active.";
      let retryable = response.status >= 500 || response.status === 429;
      let quotaClass = headerQuotaClass;

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
        const parsedQuota = TtsQuotaClassSchema.safeParse(json?.error?.quotaClass);
        if (parsedQuota.success && parsedQuota.data !== "none") {
          quotaClass = parsedQuota.data;
        }
        const parsedState = HostedTtsHealthStateSchema.safeParse(json?.error?.hostedState);
        if (parsedState.success) {
          hostedState = parsedState.data;
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
        retryAfterHeader,
        quotaClass,
        hostedState,
        fallbackUsed,
        voiceIdentityId,
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
      fallbackUsed,
      quotaClass: headerQuotaClass,
      hostedState,
      retryAfterHeader,
      profileId,
      voiceIdentityId,
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

    verifyPlayable(url: string): Promise<boolean> {
      if (typeof Audio === "undefined") {
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        const probe = new Audio();
        let settled = false;
        let timeoutId: number | null = null;

        const cleanup = (result: boolean) => {
          if (settled) return;
          settled = true;
          if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
            timeoutId = null;
          }
          probe.onloadedmetadata = null;
          probe.oncanplay = null;
          probe.onerror = null;
          probe.removeAttribute("src");
          try {
            probe.load();
          } catch {
            // Ignore probe cleanup errors.
          }
          resolve(result);
        };

        probe.preload = "metadata";
        probe.onloadedmetadata = () => cleanup(true);
        probe.oncanplay = () => cleanup(true);
        probe.onerror = () => cleanup(false);
        timeoutId = window.setTimeout(() => cleanup(true), 2500);
        probe.src = url;
      });
    },
  };
}

export interface EpisodeAudioQueueHookResult {
  snapshot: EpisodeAudioQueueSnapshot | null;
  hostIdentities: Readonly<Record<string, KuromateIdentityProfileId>>;
  startPreparation: () => void;
  cancelPreparation: () => void;
  startPodcast: () => void;
  startWithCaptionsAndAvailableAudio: () => void;
  retryPreparation: () => void;
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

/** Connects the authoritative episode audio-queue engine across unified preparation and playback with clean lifecycle disposal. */
export function useEpisodeAudioQueue(
  episode: Episode | null,
  options?: { minRequestIntervalMs?: number },
): EpisodeAudioQueueHookResult {
  const minRequestIntervalMs = options?.minRequestIntervalMs;
  const [state, setState] = useState<{
    episode: Episode | null;
    snapshot: EpisodeAudioQueueSnapshot | null;
  }>(() => ({
    episode,
    snapshot: episode ? buildIdleEpisodeSnapshot(episode, { minRequestIntervalMs }) : null,
  }));

  const engineRef = useRef<EpisodeAudioQueueController | null>(null);

  useEffect(() => {
    if (!episode) {
      engineRef.current = null;
      return;
    }

    const engine = createEpisodeAudioQueueEngine(episode, {
      fetchSegmentAudio: fetchBrowserSegmentAudio,
      audioDriver: createBrowserAudioDriver(),
      minRequestIntervalMs,
      sessionCircuit: getBrowserTtsSessionCircuit(),
    });
    engineRef.current = engine;

    const unsubscribe = engine.subscribe((nextSnapshot) => {
      setState({ episode, snapshot: nextSnapshot });
    });

    engine.startPreparation();

    return () => {
      unsubscribe();
      engine.dispose();
      if (engineRef.current === engine) {
        engineRef.current = null;
      }
    };
  }, [episode, minRequestIntervalMs]);

  const snapshot =
    episode === null
      ? null
      : state.episode === episode
        ? state.snapshot
        : buildIdleEpisodeSnapshot(episode, { minRequestIntervalMs });

  const hostIdentities =
    snapshot?.hostIdentities ??
    (episode
      ? Object.fromEntries(resolveEpisodeVoiceIdentities(episode.hosts).entries())
      : {});

  const cooldownActive = snapshot?.cooldownActive ?? false;

  useEffect(() => {
    if (!cooldownActive) {
      return;
    }
    const intervalId = window.setInterval(() => {
      engineRef.current?.refreshCooldownDisplay();
    }, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [cooldownActive]);

  const startPreparation = useCallback(() => {
    engineRef.current?.startPreparation();
  }, []);

  const cancelPreparation = useCallback(() => {
    engineRef.current?.cancelPreparation();
  }, []);

  const startPodcast = useCallback(() => {
    engineRef.current?.startPodcast();
  }, []);

  const startWithCaptionsAndAvailableAudio = useCallback(() => {
    engineRef.current?.startWithCaptionsAndAvailableAudio();
  }, []);

  const retryPreparation = useCallback(() => {
    engineRef.current?.retryPreparation();
  }, []);

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
    hostIdentities,
    startPreparation,
    cancelPreparation,
    startPodcast,
    startWithCaptionsAndAvailableAudio,
    retryPreparation,
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
