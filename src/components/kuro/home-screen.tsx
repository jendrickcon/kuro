"use client";

import type { SessionEpisodeRecord } from "@/lib/experience/session-episode-store";

export interface HomeScreenProps {
  demoGreetingEnabled: boolean;
  sessionCount: number;
  continueEntry: SessionEpisodeRecord | null;
  onToggleDemoGreeting: () => void;
  onCreateNew: () => void;
  onOpenEpisodes: () => void;
  onContinueListening: (entryId: string) => void;
  onTrySample: () => void;
}

export function HomeScreen({
  demoGreetingEnabled,
  sessionCount,
  continueEntry,
  onToggleDemoGreeting,
  onCreateNew,
  onOpenEpisodes,
  onContinueListening,
  onTrySample,
}: HomeScreenProps) {
  const headline = demoGreetingEnabled ? "Hello, Jendrick!" : "Welcome to Kuro";

  return (
    <section aria-label="Home" className="mx-auto w-full max-w-[920px] space-y-5">
      <div className="kuro-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <p className="text-xs font-semibold text-[var(--kuro-accent-ink)]">
            Kuro Study Broadcast Studio · More voices. Clearer ideas.
          </p>

          <button
            type="button"
            aria-pressed={demoGreetingEnabled}
            onClick={onToggleDemoGreeting}
            className={`kuro-interactive min-h-11 rounded-xl border px-3 py-2 text-xs font-semibold ${
              demoGreetingEnabled
                ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)] text-[var(--kuro-accent-ink)]"
                : "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)] hover:border-[var(--kuro-border-strong)]"
            }`}
          >
            {demoGreetingEnabled ? "Demo mode: Hello, Jendrick! (resets on reload)" : "Preview demo greeting"}
          </button>
        </div>

        <div className="mt-4 max-w-2xl space-y-2.5">
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-[var(--kuro-ink)] sm:text-4xl">
            {headline}
          </h1>
          <p className="font-display text-xl font-bold text-[var(--kuro-ink)] sm:text-2xl">
            Ready to create a new episode?
          </p>
          <p className="text-pretty-kuro text-sm leading-relaxed text-[var(--kuro-ink-muted)] sm:text-base">
            Turn a tough class topic or pasted reading into a multi-host conversation with distinct
            Kuromate voices, synchronized visuals, captions, and downloadable audio.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={onCreateNew}
            className="kuro-interactive min-h-12 rounded-xl bg-[var(--kuro-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[var(--kuro-accent-hover)]"
          >
            Create a new episode
          </button>

          <button
            type="button"
            onClick={onOpenEpisodes}
            className="kuro-interactive inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-4 py-3 text-sm font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
          >
            <span>Episodes from this session</span>
            <span className="font-mono-kuro rounded-full bg-[var(--kuro-surface-muted)] px-2 py-0.5 text-xs font-bold text-[var(--kuro-ink)]">
              {sessionCount}
            </span>
          </button>
        </div>
      </div>

      {continueEntry ? (
        <section
          aria-label="Continue listening"
          className="kuro-card border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)]/40 p-4 sm:p-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--kuro-ready-ink)]">
                  In session memory
                </span>
                <span className="font-mono-kuro text-xs font-semibold text-[var(--kuro-ink-muted)]">
                  {continueEntry.episode.hosts.length} Kuromates ·{" "}
                  {continueEntry.snapshot.canDownloadAudio ? "Full WAV ready" : "Opening batch ready"}
                </span>
              </div>
              <h2 className="font-display text-lg font-extrabold text-[var(--kuro-ink)] break-words">
                {continueEntry.episode.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => onContinueListening(continueEntry.entryId)}
              className="kuro-interactive min-h-11 shrink-0 rounded-xl bg-[var(--kuro-studio-bg)] px-4 py-2.5 text-sm font-bold text-[var(--kuro-studio-ink)] hover:opacity-90"
            >
              Continue listening
            </button>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Sample episode preview"
        className="kuro-card bg-[var(--kuro-surface-muted)]/60 p-4 sm:p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-extrabold text-[var(--kuro-ink)]">
                Try a sample episode
              </h2>
              <span className="rounded-full border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--kuro-warn-ink)]">
                Sample preview · no live keys needed
              </span>
            </div>
            <p className="text-pretty-kuro text-xs text-[var(--kuro-ink-muted)] sm:text-sm">
              Walk through the portrait studio player, camera framing, contextual visuals, and
              transcript export immediately without calling live synthesis.
            </p>
          </div>

          <button
            type="button"
            onClick={onTrySample}
            className="kuro-interactive min-h-11 shrink-0 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-4 py-2.5 text-sm font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
          >
            Try a sample episode
          </button>
        </div>
      </section>
    </section>
  );
}
