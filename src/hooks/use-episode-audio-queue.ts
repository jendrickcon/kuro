import { useCallback, useEffect, useRef, useState } from "react";
import type { Episode } from "@contracts/episode.schema";
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
import { getBrowserTtsSessionCircuit } from "@/lib/tts/episode-audio-queue-engine";
import {
  createEpisodeBatchCompiler,
  type BatchAudioDriver,
  type BatchAudioDriverCallbacks,
  type BatchAudioPlayOutcome,
  type CompilerSegmentRequestPayload,
  type EpisodeBatchCompilerController,
  type EpisodeBatchCompilerSnapshot,
  type EpisodeSourceKind,
  type FetchCompiledSegmentResult,
} from "@/lib/tts/episode-batch-compiler";

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

async function fetchCompiledBrowserSegmentAudio(
  payload: CompilerSegmentRequestPayload,
  signal: AbortSignal,
): Promise<FetchCompiledSegmentResult> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify(payload),
    });

    const headerQuotaClass = parseQuotaClassHeader(response.headers.get("X-Kuro-TTS-Quota-Class"));
    const fallbackUsed = response.headers.get("X-Kuro-TTS-Fallback-Used") === "true";
    const retryUsed = response.headers.get("X-Kuro-TTS-Retry-Used") === "true";
    const rawAttempts = Number.parseInt(
      response.headers.get("X-Kuro-Provider-Attempts") ?? "",
      10,
    );
    const retryAfterHeader =
      response.headers.get("X-Kuro-TTS-Retry-After") ?? response.headers.get("Retry-After");
    const profileId =
      response.headers.get("X-Kuro-TTS-Profile") ?? response.headers.get("X-Kuro-Profile-Id");
    const voiceIdentityId = response.headers.get("X-Kuro-TTS-Identity");
    const requestId = response.headers.get("X-Kuro-Request-Id");
    let hostedState = parseHostedStateHeader(response.headers.get("X-Kuro-TTS-Hosted-State"));

    if (!response.ok) {
      let errorCode: TtsErrorCode =
        response.status === 429
          ? "TTS_RATE_LIMITED"
          : response.status === 504
            ? "TTS_TIMEOUT"
            : "TTS_PROVIDER_UNAVAILABLE";
      let message = "Hosted Kuromate voice is unavailable right now.";
      let retryable = response.status >= 500 || response.status === 429;
      let quotaClass = headerQuotaClass;

      try {
        const json = (await response.json()) as TtsErrorEnvelope;
        const parsedCode = TtsErrorCodeSchema.safeParse(json?.error?.code);
        if (parsedCode.success) errorCode = parsedCode.data;
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
        message: "Received an invalid audio response.",
        retryable: false,
        voiceIdentityId,
      };
    }

    const durationMs = readDurationHeaderMs(response);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      return {
        ok: false,
        httpStatus: 502,
        errorCode: "TTS_AUDIO_INVALID",
        message: "Hosted audio response was empty.",
        retryable: true,
        voiceIdentityId,
      };
    }

    return {
      ok: true,
      bytes,
      contentType,
      durationMs,
      fallbackUsed,
      retryUsed,
      providerAttempts: Number.isFinite(rawAttempts) ? rawAttempts : undefined,
      quotaClass: headerQuotaClass,
      hostedState,
      retryAfterHeader,
      profileId,
      voiceIdentityId,
      requestId,
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
      message: "Unable to reach hosted Kuromate voice service.",
      retryable: true,
    };
  }
}

/** Single controlled HTMLAudioElement driver synced to compiled WAV batches without autoplay hacks. */
function createBatchAudioDriver(): BatchAudioDriver {
  let element: HTMLAudioElement | null = typeof Audio !== "undefined" ? new Audio() : null;
  let activeGeneration = 0;
  let currentCallbacks: BatchAudioDriverCallbacks | null = null;

  function clearHandlers(audio: HTMLAudioElement) {
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onerror = null;
  }

  function mapPlayError(err: unknown): BatchAudioPlayOutcome {
    const name = err instanceof Error ? err.name : "";
    if (name === "NotAllowedError") return { ok: false, reason: "autoplay_blocked" };
    if (name === "AbortError") return { ok: false, reason: "aborted" };
    return { ok: false, reason: "decode_error" };
  }

  function attachHandlers(audio: HTMLAudioElement, gen: number) {
    audio.ontimeupdate = () => {
      if (gen !== activeGeneration) return;
      currentCallbacks?.onTimeUpdate(Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
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
    async loadAndPlay(url, startTimeSec, callbacks): Promise<BatchAudioPlayOutcome> {
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
        // Ignore pause glitches before switching batch audio source.
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
            // Ignore seek failure if browser delays seek readiness.
          }
        }
        const durMs =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? Math.round(audio.duration * 1000)
            : null;
        currentCallbacks?.onLoadedMetadata?.(durMs);
      };

      try {
        await audio.play();
        if (gen !== activeGeneration) return { ok: false, reason: "aborted" };
        if (!pendingSeekApplied && startTimeSec > 0) {
          pendingSeekApplied = true;
          try {
            audio.currentTime = startTimeSec;
          } catch {
            // Ignore seek failure.
          }
        }
        return { ok: true };
      } catch (err) {
        if (gen !== activeGeneration) return { ok: false, reason: "aborted" };
        return mapPlayError(err);
      }
    },
    async resume(callbacks): Promise<BatchAudioPlayOutcome> {
      if (!element) return { ok: false, reason: "decode_error" };
      const gen = activeGeneration;
      if (callbacks) currentCallbacks = callbacks;
      try {
        await element.play();
        if (gen !== activeGeneration) return { ok: false, reason: "aborted" };
        return { ok: true };
      } catch (err) {
        if (gen !== activeGeneration) return { ok: false, reason: "aborted" };
        return mapPlayError(err);
      }
    },
    seekTo(timeSec) {
      if (!element) return;
      try {
        element.currentTime = Math.max(0, timeSec);
      } catch {
        // Ignore seek failure when browser metadata is unavailable.
      }
    },
    pause() {
      if (!element) return 0;
      const cur = Number.isFinite(element.currentTime) ? element.currentTime : 0;
      try {
        element.pause();
      } catch {
        // Ignore pause quirks.
      }
      return cur;
    },
    stop() {
      activeGeneration += 1;
      if (!element) return;
      clearHandlers(element);
      try {
        element.pause();
      } catch {
        // Ignore stop quirks.
      }
      element.removeAttribute("src");
      try {
        element.load();
      } catch {
        // Ignore load quirks.
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
  snapshot: EpisodeBatchCompilerSnapshot | null;
  hostIdentities: Readonly<Record<string, KuromateIdentityProfileId>>;
  startCompilation: () => void;
  startPodcast: () => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  previous: () => void;
  next: () => void;
  seekToMs: (targetMs: number) => void;
  restart: () => void;
  replay: () => void;
  retryFailedTurns: () => void;
  cancel: () => void;
  dispose: () => void;
  downloadAudio: () => { filename: string } | null;
}

/** Connects the authoritative WP-012 Hybrid 4-Turn Batch Compiler across loading, playback, and WAV download. */
export function useEpisodeAudioQueue(
  episode: Episode | null,
  options?: { source?: EpisodeSourceKind; minRequestIntervalMs?: number },
): EpisodeAudioQueueHookResult {
  const minRequestIntervalMs = options?.minRequestIntervalMs;
  const source: EpisodeSourceKind = options?.source ?? "generated";
  const [state, setState] = useState<{
    episode: Episode | null;
    snapshot: EpisodeBatchCompilerSnapshot | null;
  }>({ episode: null, snapshot: null });

  const engineRef = useRef<EpisodeBatchCompilerController | null>(null);

  useEffect(() => {
    if (!episode) {
      engineRef.current = null;
      return;
    }

    const compiler = createEpisodeBatchCompiler(episode, {
      source,
      fetchSegmentAudio: fetchCompiledBrowserSegmentAudio,
      audioDriver: createBatchAudioDriver(),
      sessionCircuit: getBrowserTtsSessionCircuit(),
      minFallbackIntervalMs: minRequestIntervalMs,
    });
    engineRef.current = compiler;

    const unsubscribe = compiler.subscribe((nextSnapshot) => {
      setState({ episode, snapshot: nextSnapshot });
    });

    compiler.startCompilation();

    return () => {
      unsubscribe();
      compiler.dispose();
      if (engineRef.current === compiler) {
        engineRef.current = null;
      }
    };
  }, [episode, source, minRequestIntervalMs]);

  const snapshot =
    episode !== null && state.episode === episode ? state.snapshot : null;

  const hostIdentities =
    snapshot?.hostIdentities ??
    (episode
      ? Object.fromEntries(resolveEpisodeVoiceIdentities(episode.hosts).entries())
      : {});

  const isActiveAudioPlaying =
    Boolean(snapshot) &&
    snapshot?.playbackStatus === "playing" &&
    !snapshot.isSamplePreview;

  useEffect(() => {
    if (!isActiveAudioPlaying) return;
    let rafId = 0;
    const tick = () => {
      engineRef.current?.syncClock();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isActiveAudioPlaying]);

  const startCompilation = useCallback(() => {
    engineRef.current?.startCompilation();
  }, []);
  const startPodcast = useCallback(() => {
    engineRef.current?.startPodcast();
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
  const seekToMs = useCallback((targetMs: number) => {
    engineRef.current?.seekToMs(targetMs);
  }, []);
  const restart = useCallback(() => {
    engineRef.current?.restart();
  }, []);
  const replay = useCallback(() => {
    engineRef.current?.replay();
  }, []);
  const retryFailedTurns = useCallback(() => {
    engineRef.current?.retryFailedTurns();
  }, []);
  const cancel = useCallback(() => {
    engineRef.current?.cancel();
  }, []);
  const dispose = useCallback(() => {
    engineRef.current?.dispose();
  }, []);

  const downloadAudio = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return null;
    const snap = engine.getSnapshot();
    const blob = engine.getFullWavBlob();
    if (!snap.canDownloadAudio || !blob || !snap.fullAudioUrl) {
      return null;
    }
    const link = document.createElement("a");
    link.href = snap.fullAudioUrl;
    link.download = snap.downloadFilename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { filename: snap.downloadFilename };
  }, []);

  return {
    snapshot,
    hostIdentities,
    startCompilation,
    startPodcast,
    play,
    pause,
    togglePlayPause,
    previous,
    next,
    seekToMs,
    restart,
    replay,
    retryFailedTurns,
    cancel,
    dispose,
    downloadAudio,
  };
}
