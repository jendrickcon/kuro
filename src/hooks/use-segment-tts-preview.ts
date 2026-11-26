"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DialogueSegment, Host } from "@contracts/episode.schema";
import { createObjectUrlManager, type ObjectUrlManager } from "@/lib/tts/object-url-manager";

export type SegmentTtsPreviewStatus = "idle" | "loading" | "playing" | "ready" | "error";

export interface UseSegmentTtsPreviewOptions {
  episodeId: string;
  segment: DialogueSegment | undefined;
  activeHost: Host | undefined;
  onBeforePlay?: () => void;
}

export interface SegmentTtsPreviewState {
  status: SegmentTtsPreviewStatus;
  errorMessage: string | null;
  durationMs: number | null;
  hasClip: boolean;
  previewVoice: () => Promise<void>;
  replayClip: () => Promise<void>;
  stop: () => void;
}

interface InternalPreviewState {
  segmentKey: string;
  status: SegmentTtsPreviewStatus;
  errorMessage: string | null;
  durationMs: number | null;
  hasClip: boolean;
}

interface TtsErrorEnvelope {
  ok?: unknown;
  error?: {
    message?: unknown;
  };
}

function readDurationHeaderMs(response: Response): number | null {
  const raw = response.headers.get("X-Kuro-Audio-Duration-Ms");
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Manages single-segment hosted Kuromate TTS preview with strict request deduplication,
 * object URL revocation, and automatic cleanup across turn/episode/unmount transitions.
 */
export function useSegmentTtsPreview({
  episodeId,
  segment,
  activeHost,
  onBeforePlay,
}: UseSegmentTtsPreviewOptions): SegmentTtsPreviewState {
  const [internal, setInternal] = useState<InternalPreviewState>({
    segmentKey: "",
    status: "idle",
    errorMessage: null,
    durationMs: null,
    hasClip: false,
  });

  const urlManagerRef = useRef<ObjectUrlManager | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTokenRef = useRef(0);
  const loadedSegmentKeyRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const segmentKey = segment ? `${episodeId}:${segment.id}` : "";
  const matchesSegment = internal.segmentKey === segmentKey;
  const status: SegmentTtsPreviewStatus = matchesSegment ? internal.status : "idle";
  const errorMessage = matchesSegment ? internal.errorMessage : null;
  const durationMs = matchesSegment ? internal.durationMs : null;
  const hasClip = matchesSegment ? internal.hasClip : false;

  const getUrlManager = useCallback((): ObjectUrlManager => {
    if (!urlManagerRef.current) {
      urlManagerRef.current = createObjectUrlManager();
    }
    return urlManagerRef.current;
  }, []);

  const teardownMediaAndRequest = useCallback(() => {
    requestTokenRef.current += 1;
    isFetchingRef.current = false;

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    const audio = audioRef.current;
    if (audio) {
      audio.onloadedmetadata = null;
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
      } catch {
        // Ignore media pause edge cases during teardown.
      }
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // Ignore media reset edge cases in synthetic environments.
      }
      audioRef.current = null;
    }

    loadedSegmentKeyRef.current = null;
    urlManagerRef.current?.revoke();
  }, []);

  const stop = useCallback(() => {
    teardownMediaAndRequest();
    setInternal({
      segmentKey,
      status: "idle",
      errorMessage: null,
      durationMs: null,
      hasClip: false,
    });
  }, [segmentKey, teardownMediaAndRequest]);

  // Clean up in-flight requests, active audio playback, and blob URLs on turn/episode change or unmount.
  useEffect(() => {
    return () => {
      teardownMediaAndRequest();
    };
  }, [segmentKey, teardownMediaAndRequest]);

  const startElementPlayback = useCallback(
    async (
      audio: HTMLAudioElement,
      token: number,
      expectedKey: string,
      clipDurationMs: number | null,
    ): Promise<void> => {
      try {
        audio.currentTime = 0;
      } catch {
        // Ignore if metadata has not initialized currentTime seeking yet.
      }

      try {
        await audio.play();
        if (requestTokenRef.current !== token || loadedSegmentKeyRef.current !== expectedKey) {
          return;
        }
        setInternal((prev) => ({
          segmentKey: expectedKey,
          status: "playing",
          errorMessage: null,
          durationMs: prev.segmentKey === expectedKey ? (prev.durationMs ?? clipDurationMs) : clipDurationMs,
          hasClip: true,
        }));
      } catch (err) {
        if (requestTokenRef.current !== token) return;
        const name = err instanceof Error ? err.name : "";
        teardownMediaAndRequest();
        setInternal({
          segmentKey: expectedKey,
          status: "error",
          errorMessage:
            name === "NotAllowedError"
              ? "Browser blocked audio playback. Click Retry voice preview to play sound—captions remain active."
              : "Could not play hosted Kuromate audio. Captions remain active—please try again.",
          durationMs: null,
          hasClip: false,
        });
      }
    },
    [teardownMediaAndRequest],
  );

  const replayClip = useCallback(async () => {
    if (!segment || !activeHost || isFetchingRef.current) {
      return;
    }

    const existingAudio = audioRef.current;
    const existingUrl = getUrlManager().getCurrent();
    if (existingAudio && existingUrl && loadedSegmentKeyRef.current === segmentKey) {
      onBeforePlay?.();
      try {
        existingAudio.pause();
      } catch {
        // Ignore pause errors before replay seek.
      }
      await startElementPlayback(existingAudio, requestTokenRef.current, segmentKey, durationMs);
      return;
    }

    teardownMediaAndRequest();
    const token = requestTokenRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    isFetchingRef.current = true;
    onBeforePlay?.();

    setInternal({
      segmentKey,
      status: "loading",
      errorMessage: null,
      durationMs: null,
      hasClip: false,
    });

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          segmentId: segment.id,
          speakerId: segment.speakerId,
          role: activeHost.role,
          text: segment.text,
        }),
      });

      if (requestTokenRef.current !== token) return;

      if (!response.ok) {
        let message = "Kuromate voice preview is unavailable right now. Captions remain active.";
        try {
          const payload = (await response.json()) as TtsErrorEnvelope;
          if (typeof payload?.error?.message === "string" && payload.error.message.trim()) {
            message = payload.error.message.trim();
          }
        } catch {
          // Keep safe fallback message if error body is unreadable.
        }
        teardownMediaAndRequest();
        setInternal({
          segmentKey,
          status: "error",
          errorMessage: message,
          durationMs: null,
          hasClip: false,
        });
        return;
      }

      const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
      if (!contentType.startsWith("audio/")) {
        teardownMediaAndRequest();
        setInternal({
          segmentKey,
          status: "error",
          errorMessage: "Received an invalid audio response. Captions remain active.",
          durationMs: null,
          hasClip: false,
        });
        return;
      }

      const headerDurationMs = readDurationHeaderMs(response);
      const blob = await response.blob();
      if (requestTokenRef.current !== token) return;

      if (blob.size === 0) {
        teardownMediaAndRequest();
        setInternal({
          segmentKey,
          status: "error",
          errorMessage: "Voice preview audio was empty. Captions remain active.",
          durationMs: null,
          hasClip: false,
        });
        return;
      }

      const objectUrl = getUrlManager().replace(blob);
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audioRef.current = audio;
      loadedSegmentKeyRef.current = segmentKey;
      abortRef.current = null;
      isFetchingRef.current = false;

      audio.onloadedmetadata = () => {
        if (requestTokenRef.current !== token) return;
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          const decodedMs = Math.round(audio.duration * 1000);
          setInternal((prev) =>
            prev.segmentKey === segmentKey
              ? { ...prev, durationMs: prev.durationMs ?? decodedMs }
              : prev,
          );
        }
      };

      audio.onended = () => {
        if (requestTokenRef.current !== token) return;
        setInternal((prev) =>
          prev.segmentKey === segmentKey ? { ...prev, status: "ready", errorMessage: null } : prev,
        );
      };

      audio.onerror = () => {
        if (requestTokenRef.current !== token) return;
        teardownMediaAndRequest();
        setInternal({
          segmentKey,
          status: "error",
          errorMessage:
            "Could not decode hosted Kuromate audio in this browser. Captions remain active.",
          durationMs: null,
          hasClip: false,
        });
      };

      setInternal({
        segmentKey,
        status: "loading",
        errorMessage: null,
        durationMs: headerDurationMs,
        hasClip: true,
      });

      await startElementPlayback(audio, token, segmentKey, headerDurationMs);
    } catch (err) {
      if (requestTokenRef.current !== token) return;
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      teardownMediaAndRequest();
      setInternal({
        segmentKey,
        status: "error",
        errorMessage:
          "Unable to reach hosted Kuromate voice preview. Captions remain active—please try again.",
        durationMs: null,
        hasClip: false,
      });
    } finally {
      if (requestTokenRef.current === token) {
        isFetchingRef.current = false;
        abortRef.current = null;
      }
    }
  }, [
    activeHost,
    durationMs,
    getUrlManager,
    onBeforePlay,
    segment,
    segmentKey,
    startElementPlayback,
    teardownMediaAndRequest,
  ]);

  const previewVoice = useCallback(async () => {
    await replayClip();
  }, [replayClip]);

  return {
    status,
    errorMessage,
    durationMs,
    hasClip,
    previewVoice,
    replayClip,
    stop,
  };
}
