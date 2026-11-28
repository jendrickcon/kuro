"use client";

import { useState } from "react";
import {
  canDownloadEpisodeTranscript,
  canDownloadEpisodeWav,
  downloadCompiledEpisodeWav,
  downloadEpisodeTranscriptFile,
} from "@/lib/experience/downloads";
import {
  MAX_SESSION_EPISODES,
  SESSION_NON_PERSISTENCE_DISCLOSURE,
  type SessionEpisodeRecord,
} from "@/lib/experience/session-episode-store";

export interface SessionEpisodesScreenProps {
  entries: SessionEpisodeRecord[];
  activeEntryId: string | null;
  evictedCount: number;
  onPlayEpisode: (entryId: string, mode: "continue" | "replay") => void;
  onRemoveEpisode: (entryId: string) => void;
  onCreateAnother: () => void;
  onTrySample: () => void;
}

function formatClock(ms: number | null): string {
  if (ms === null || ms <= 0) return "--:--";
  const secs = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatCreatedClock(timestampMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestampMs));
}

export function SessionEpisodesScreen({
  entries,
  activeEntryId,
  evictedCount,
  onPlayEpisode,
  onRemoveEpisode,
  onCreateAnother,
  onTrySample,
}: SessionEpisodesScreenProps) {
  const [downloadFeedback, setDownloadFeedback] = useState<string | null>(null);

  return (
    <section
      aria-label="Episodes from this session"
      className="mx-auto w-full max-w-[920px] space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[var(--kuro-ink)] sm:text-3xl">
            Episodes from this session
          </h1>
          <p className="text-xs text-[var(--kuro-ink-muted)] sm:text-sm">
            Up to {MAX_SESSION_EPISODES} compiled episodes live in memory during this browser session
            for instant zero-call replay.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateAnother}
          className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--kuro-accent-hover)]"
        >
          Create another episode
        </button>
      </div>

      <div
        role="note"
        className="rounded-2xl border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-4 py-3 text-sm text-[var(--kuro-warn-ink)]"
      >
        <p className="font-bold">{SESSION_NON_PERSISTENCE_DISCLOSURE}</p>
        <p className="mt-0.5 text-xs">
          Refreshing or closing this tab clears compiled audio from memory. Download `.wav` audio or
          `.txt` transcripts to keep an episode offline.
        </p>
        {evictedCount > 0 ? (
          <p className="mt-1 text-xs font-semibold">
            Oldest episode URLs were automatically released after reaching the {MAX_SESSION_EPISODES}
            -episode session limit.
          </p>
        ) : null}
      </div>

      {downloadFeedback ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl border border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--kuro-ready-ink)]"
        >
          {downloadFeedback}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <div className="kuro-card p-6 text-center">
          <h2 className="font-display text-lg font-extrabold text-[var(--kuro-ink)]">
            No episodes created in this session yet
          </h2>
          <p className="mx-auto mt-1 max-w-md text-pretty-kuro text-sm text-[var(--kuro-ink-muted)]">
            Create an episode from notes or a topic, or open the Sample Preview below to test the
            portrait studio player right away.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={onCreateAnother}
              className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--kuro-accent-hover)]"
            >
              Create a new episode
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Current session episodes">
          {entries.map((entry) => {
            const wavReady = canDownloadEpisodeWav(entry.snapshot);
            const transcriptReady = canDownloadEpisodeTranscript(entry.episode);
            const canContinue = entry.snapshot.canPlay || entry.snapshot.hasStartedPodcast;
            const isComplete = entry.snapshot.playbackStatus === "complete";
            const isActive = entry.entryId === activeEntryId;

            return (
              <li key={entry.entryId} className="kuro-card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${
                          wavReady
                            ? "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]"
                            : "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]"
                        }`}
                      >
                        {wavReady
                          ? "Audio WAV ready"
                          : entry.snapshot.canPlay
                            ? "Opening batch ready"
                            : `${entry.snapshot.completedTurns} of ${entry.snapshot.totalTurns} turns`}
                      </span>
                      <span className="rounded-full border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--kuro-ink)]">
                        {transcriptReady ? "Transcript ready" : "Transcript pending"}
                      </span>
                      {isActive ? (
                        <span className="rounded-full border border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--kuro-accent-ink)]">
                          Current session slot
                        </span>
                      ) : null}
                    </div>

                    <h2 className="font-display line-clamp-2 text-lg font-extrabold text-[var(--kuro-ink)] break-words">
                      {entry.episode.title}
                    </h2>
                    <p className="line-clamp-2 text-xs text-[var(--kuro-ink-muted)] break-words sm:text-sm">
                      {entry.episode.topic}
                    </p>
                    <p className="font-mono-kuro text-xs font-medium capitalize text-[var(--kuro-ink-muted)]">
                      {entry.episode.hosts.length} Kuromates · {entry.episode.tone} ·{" "}
                      {entry.episode.length} ·{" "}
                      {formatClock(entry.snapshot.fullDurationMs ?? entry.snapshot.compiledDurationMs)}{" "}
                      · Created this session ({formatCreatedClock(entry.createdAtMs)})
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canContinue}
                    onClick={() =>
                      onPlayEpisode(entry.entryId, isComplete ? "replay" : "continue")
                    }
                    className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-studio-bg)] px-4 py-2 text-xs font-bold text-[var(--kuro-studio-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
                  >
                    {isComplete ? "Play again" : "Continue"}
                  </button>

                  <button
                    type="button"
                    disabled={!wavReady}
                    onClick={() => {
                      const res = downloadCompiledEpisodeWav(entry.controller);
                      if (res) setDownloadFeedback(`Downloaded WAV (${res.filename})`);
                    }}
                    className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3.5 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm"
                  >
                    Download WAV
                  </button>

                  <button
                    type="button"
                    disabled={!transcriptReady}
                    onClick={() => {
                      const res = downloadEpisodeTranscriptFile(entry.episode);
                      setDownloadFeedback(`Downloaded transcript (${res.filename})`);
                    }}
                    className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface)] px-3.5 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)] sm:text-sm"
                  >
                    Download transcript
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveEpisode(entry.entryId)}
                    className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-danger-border)] bg-[var(--kuro-danger-bg)]/70 px-3.5 py-2 text-xs font-bold text-[var(--kuro-danger-ink)] hover:bg-[var(--kuro-danger-bg)] sm:ml-auto sm:text-sm"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-label="Sample and backup episodes" className="space-y-2.5 pt-2">
        <h2 className="font-display text-lg font-extrabold text-[var(--kuro-ink)]">
          Sample and backup episodes
        </h2>

        <div className="kuro-card bg-[var(--kuro-surface-muted)]/60 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--kuro-warn-ink)]">
                  Sample preview (captions only)
                </span>
                <span className="font-mono-kuro text-xs text-[var(--kuro-ink-muted)]">
                  2 Kuromates · Quick · WAV disabled
                </span>
              </div>
              <h3 className="font-display text-base font-extrabold text-[var(--kuro-ink)]">
                Opportunity Cost on a Commute
              </h3>
              <p className="text-xs text-[var(--kuro-ink-muted)]">
                Built-in walkthrough using timed captions with zero live TTS requests.
              </p>
            </div>

            <button
              type="button"
              onClick={onTrySample}
              className="kuro-interactive min-h-11 shrink-0 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-4 py-2 text-sm font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
            >
              Open Sample Preview
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)]/70 p-4 text-xs text-[var(--kuro-ink-muted)]">
          <p className="font-bold text-[var(--kuro-ink)]">
            Pre-generated backup slot reserved for WP-018
          </p>
          <p className="mt-0.5">
            Bundled offline fallback episodes will appear here once WP-018 is integrated.
          </p>
        </div>
      </section>
    </section>
  );
}
