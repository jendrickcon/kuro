"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createBatchAudioDriver,
  createQueueAdapter,
  fetchCompiledBrowserSegmentAudio,
  type EpisodeAudioQueueHookResult,
} from "@/hooks/use-episode-audio-queue";
import {
  createSessionEpisodeStore,
  type SessionEpisodeRecord,
  type SessionEpisodeStore,
  type SessionStoreState,
} from "@/lib/experience/session-episode-store";
import { getBrowserTtsSessionCircuit } from "@/lib/tts/episode-audio-queue-engine";
import { createEpisodeBatchCompiler } from "@/lib/tts/episode-batch-compiler";

export interface UseSessionEpisodesResult {
  store: SessionEpisodeStore;
  state: SessionStoreState;
  activeEntry: SessionEpisodeRecord | null;
  activeQueue: EpisodeAudioQueueHookResult | null;
  continueEntry: SessionEpisodeRecord | null;
}

/**
 * React hook owning the in-memory WP-012.5 SessionEpisodeStore at the app shell root so
 * navigating across Home, Create, Preparation, Player, and Episodes retains compiled WAVs
 * for zero-call replay and revokes object URLs on explicit delete/eviction/unmount.
 */
export function useSessionEpisodes(minRequestIntervalMs?: number): UseSessionEpisodesResult {
  const [store] = useState<SessionEpisodeStore>(() =>
    createSessionEpisodeStore({
      createCompiler: (episode, source) =>
        createEpisodeBatchCompiler(episode, {
          source,
          fetchSegmentAudio: fetchCompiledBrowserSegmentAudio,
          audioDriver: createBatchAudioDriver(),
          sessionCircuit: getBrowserTtsSessionCircuit(),
          minFallbackIntervalMs: minRequestIntervalMs,
        }),
    }),
  );

  const [state, setState] = useState<SessionStoreState>(() => store.getState());

  useEffect(() => {
    const unsubscribe = store.subscribe((next) => {
      setState(next);
    });
    return () => {
      unsubscribe();
      store.disposeAll();
    };
  }, [store]);

  const activeEntry = useMemo(() => {
    if (!state.activeEntryId) return null;
    if (state.sampleEntry?.entryId === state.activeEntryId) return state.sampleEntry;
    return state.entries.find((item) => item.entryId === state.activeEntryId) ?? null;
  }, [state.activeEntryId, state.entries, state.sampleEntry]);

  const activeQueue = useMemo(() => {
    if (!activeEntry) return null;
    return createQueueAdapter(activeEntry.controller, activeEntry.snapshot);
  }, [activeEntry]);

  const isActiveAudioPlaying = Boolean(
    activeEntry &&
      activeEntry.snapshot.playbackStatus === "playing" &&
      !activeEntry.snapshot.isSamplePreview,
  );

  useEffect(() => {
    if (!isActiveAudioPlaying || !activeEntry) return;
    const controller = activeEntry.controller;
    let rafId = 0;
    const tick = () => {
      controller.syncClock();
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isActiveAudioPlaying, activeEntry]);

  const continueEntry = useMemo(
    () =>
      state.entries.find(
        (item) => item.snapshot.canPlay || item.snapshot.hasStartedPodcast,
      ) ?? null,
    [state.entries],
  );

  return {
    store,
    state,
    activeEntry,
    activeQueue,
    continueEntry,
  };
}
