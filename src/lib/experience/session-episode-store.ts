import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type {
  EpisodeBatchCompilerController,
  EpisodeBatchCompilerSnapshot,
  EpisodeSourceKind,
} from "@/lib/tts/episode-batch-compiler";

export const MAX_SESSION_EPISODES = 5;
export const SESSION_NON_PERSISTENCE_DISCLOSURE =
  "Episodes generated in this session are not saved permanently.";

export interface SessionRequestedOptions {
  tone: Tone;
  length: EpisodeLength;
  hostCount: 2 | 3;
}

export interface SessionEpisodeRecord {
  entryId: string;
  episode: Episode;
  source: EpisodeSourceKind;
  usedFallback: boolean;
  requestedOptions?: SessionRequestedOptions;
  createdAtMs: number;
  snapshot: EpisodeBatchCompilerSnapshot;
  controller: EpisodeBatchCompilerController;
}

export interface SessionStoreState {
  entries: SessionEpisodeRecord[];
  sampleEntry: SessionEpisodeRecord | null;
  activeEntryId: string | null;
  demoGreetingEnabled: boolean;
  evictedCount: number;
}

export type SessionCompilerFactory = (
  episode: Episode,
  source: EpisodeSourceKind,
) => EpisodeBatchCompilerController;

interface InternalEntry extends SessionEpisodeRecord {
  unsubscribe: () => void;
  disposed: boolean;
}

export interface SessionEpisodeStore {
  subscribe: (listener: (state: SessionStoreState) => void) => () => void;
  getState: () => SessionStoreState;
  getActiveEntry: () => SessionEpisodeRecord | null;
  getContinueListeningEntry: () => SessionEpisodeRecord | null;
  getEntryById: (entryId: string) => SessionEpisodeRecord | null;
  setDemoGreetingEnabled: (enabled: boolean) => void;
  toggleDemoGreeting: () => void;
  createSessionEpisode: (input: {
    episode: Episode;
    source: Exclude<EpisodeSourceKind, "sample">;
    usedFallback?: boolean;
    requestedOptions?: SessionRequestedOptions;
  }) => SessionEpisodeRecord;
  openSamplePreview: (sampleEpisode: Episode) => SessionEpisodeRecord;
  openEpisode: (entryId: string, opts?: { mode?: "continue" | "replay" }) => SessionEpisodeRecord | null;
  pauseActivePlayback: () => void;
  cancelActiveUnstartedEpisode: (entryId: string) => void;
  removeSessionEpisode: (entryId: string) => boolean;
  disposeAll: () => void;
}

/**
 * Strictly in-memory session episode store keeping compiled batch controllers alive across
 * screen navigation for zero-call Replay, Continue listening, and exact-once Blob URL disposal.
 */
export function createSessionEpisodeStore(options: {
  createCompiler: SessionCompilerFactory;
  now?: () => number;
}): SessionEpisodeStore {
  const now = options.now ?? (() => Date.now());
  const listeners = new Set<(state: SessionStoreState) => void>();

  let sequence = 0;
  let entries: InternalEntry[] = [];
  let sampleEntry: InternalEntry | null = null;
  let activeEntryId: string | null = null;
  let demoGreetingEnabled = false;
  let evictedCount = 0;

  function toPublicRecord(entry: InternalEntry): SessionEpisodeRecord {
    return {
      entryId: entry.entryId,
      episode: entry.episode,
      source: entry.source,
      usedFallback: entry.usedFallback,
      requestedOptions: entry.requestedOptions,
      createdAtMs: entry.createdAtMs,
      snapshot: entry.snapshot,
      controller: entry.controller,
    };
  }

  function buildStateSnapshot(): SessionStoreState {
    return {
      entries: entries.map(toPublicRecord),
      sampleEntry: sampleEntry ? toPublicRecord(sampleEntry) : null,
      activeEntryId,
      demoGreetingEnabled,
      evictedCount,
    };
  }

  function notify() {
    const snap = buildStateSnapshot();
    listeners.forEach((listener) => listener(snap));
  }

  function findInternalById(entryId: string | null): InternalEntry | null {
    if (!entryId) return null;
    if (sampleEntry && sampleEntry.entryId === entryId) return sampleEntry;
    return entries.find((item) => item.entryId === entryId) ?? null;
  }

  function pauseAllExcept(exceptEntryId: string | null) {
    if (sampleEntry && sampleEntry.entryId !== exceptEntryId) {
      if (sampleEntry.snapshot.playbackStatus === "playing") {
        sampleEntry.controller.pause();
      }
    }
    for (const item of entries) {
      if (item.entryId !== exceptEntryId && item.snapshot.playbackStatus === "playing") {
        item.controller.pause();
      }
    }
  }

  function disposeEntryOnce(entry: InternalEntry) {
    if (entry.disposed) return;
    entry.disposed = true;
    entry.unsubscribe();
    entry.controller.dispose();
  }

  function createManagedEntry(input: {
    episode: Episode;
    source: EpisodeSourceKind;
    usedFallback: boolean;
    requestedOptions?: SessionRequestedOptions;
  }): InternalEntry {
    sequence += 1;
    const entryId = `kuro_sess_${sequence}`;
    const controller = options.createCompiler(input.episode, input.source);
    let initialized = false;

    const record: InternalEntry = {
      entryId,
      episode: input.episode,
      source: input.source,
      usedFallback: input.usedFallback,
      requestedOptions: input.requestedOptions,
      createdAtMs: now(),
      snapshot: controller.getSnapshot(),
      controller,
      unsubscribe: () => {},
      disposed: false,
    };

    record.unsubscribe = controller.subscribe((nextSnap) => {
      record.snapshot = nextSnap;
      if (initialized) {
        notify();
      }
    });
    initialized = true;
    return record;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      listener(buildStateSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    getState: buildStateSnapshot,
    getActiveEntry() {
      const found = findInternalById(activeEntryId);
      return found ? toPublicRecord(found) : null;
    },
    getContinueListeningEntry() {
      const playable = entries.find(
        (item) => item.snapshot.canPlay || item.snapshot.hasStartedPodcast,
      );
      return playable ? toPublicRecord(playable) : null;
    },
    getEntryById(entryId) {
      const found = findInternalById(entryId);
      return found ? toPublicRecord(found) : null;
    },
    setDemoGreetingEnabled(enabled) {
      if (demoGreetingEnabled === enabled) return;
      demoGreetingEnabled = enabled;
      notify();
    },
    toggleDemoGreeting() {
      demoGreetingEnabled = !demoGreetingEnabled;
      notify();
    },
    createSessionEpisode(input) {
      pauseAllExcept(null);
      const record = createManagedEntry({
        episode: input.episode,
        source: input.source,
        usedFallback: Boolean(input.usedFallback),
        requestedOptions: input.requestedOptions,
      });

      while (entries.length >= MAX_SESSION_EPISODES) {
        const victim = entries.pop();
        if (victim) {
          evictedCount += 1;
          if (activeEntryId === victim.entryId) activeEntryId = null;
          disposeEntryOnce(victim);
        }
      }

      entries = [record, ...entries];
      activeEntryId = record.entryId;
      record.controller.startCompilation();
      notify();
      return toPublicRecord(record);
    },
    openSamplePreview(sampleEpisode) {
      pauseAllExcept(null);
      if (sampleEntry) {
        disposeEntryOnce(sampleEntry);
        sampleEntry = null;
      }
      const record = createManagedEntry({
        episode: sampleEpisode,
        source: "sample",
        usedFallback: false,
      });
      sampleEntry = record;
      activeEntryId = record.entryId;
      record.controller.startCompilation();
      notify();
      return toPublicRecord(record);
    },
    openEpisode(entryId, opts) {
      const target = findInternalById(entryId);
      if (!target || target.disposed) return null;
      pauseAllExcept(target.entryId);
      activeEntryId = target.entryId;
      const mode = opts?.mode ?? "continue";
      if (mode === "replay") {
        target.controller.replay();
      } else if (!target.snapshot.hasStartedPodcast && target.snapshot.canPlay) {
        target.controller.startPodcast();
      } else if (target.snapshot.playbackStatus === "complete") {
        target.controller.replay();
      }
      notify();
      return toPublicRecord(target);
    },
    pauseActivePlayback() {
      const current = findInternalById(activeEntryId);
      if (current && current.snapshot.playbackStatus === "playing") {
        current.controller.pause();
      }
    },
    cancelActiveUnstartedEpisode(entryId) {
      const idx = entries.findIndex((item) => item.entryId === entryId);
      if (idx >= 0) {
        const [removed] = entries.splice(idx, 1);
        removed.controller.cancel();
        disposeEntryOnce(removed);
      }
      if (activeEntryId === entryId) {
        activeEntryId = null;
      }
      notify();
    },
    removeSessionEpisode(entryId) {
      const idx = entries.findIndex((item) => item.entryId === entryId);
      if (idx < 0) return false;
      const [removed] = entries.splice(idx, 1);
      if (activeEntryId === entryId) {
        activeEntryId = null;
      }
      disposeEntryOnce(removed);
      notify();
      return true;
    },
    disposeAll() {
      const allEntries = [...entries];
      entries = [];
      if (sampleEntry) {
        allEntries.push(sampleEntry);
        sampleEntry = null;
      }
      activeEntryId = null;
      for (const entry of allEntries) {
        disposeEntryOnce(entry);
      }
      listeners.clear();
    },
  };
}
