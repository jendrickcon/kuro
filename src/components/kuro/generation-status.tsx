"use client";

import { useState } from "react";
import type { Episode } from "@contracts/episode.schema";
import {
  resolvePreparationDisplayState,
  type BatchLoadingView,
} from "@/lib/episode/unified-loading-state";

const LOADING_STEPS = [
  { step: 1, title: "Preparing your conversation" },
  { step: 2, title: "Checking the conversation" },
  { step: 3, title: "Compiling Kuromate voices" },
  { step: 4, title: "Ready to begin" },
] as const;

export interface GenerationStatusProps {
  view: BatchLoadingView;
  episode: Episode | null;
  topicPreview?: string;
  onStartPodcast: () => void;
  onRetryFailedTurns: () => void;
  onCancelAndEdit: () => void;
  onTrySample?: () => void;
}

/**
 * Single continuous broadcast-style preparation panel covering script generation, schema checks,
 * Quick full / Detailed Batch-1 compilation, safe decorative Skip-intro, and NO AUDIO, NO ADVANCE recovery.
 */
export function GenerationStatus({
  view,
  episode,
  topicPreview,
  onStartPodcast,
  onRetryFailedTurns,
  onCancelAndEdit,
  onTrySample,
}: GenerationStatusProps) {
  const [skipIntroMotion, setSkipIntroMotion] = useState(false);

  const display = resolvePreparationDisplayState(view, { skipIntroMotion });
  const isBusy =
    view.stage === "generating_script" ||
    view.stage === "validating_script" ||
    view.stage === "compiling_quick" ||
    view.stage === "compiling_opening";

  let badgeText = "Broadcast prep";
  let badgeClass =
    "border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)] text-[var(--kuro-studio-ink)]";
  if (view.stage === "ready_to_play") {
    badgeText = "ON AIR STANDBY";
    badgeClass =
      "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]";
  } else if (view.stage === "failed_retryable" || view.stage === "failed_blocking") {
    badgeText = view.isConfigBlocked ? "Setup required" : "Action needed";
    badgeClass =
      "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]";
  } else if (view.stage === "cancelled") {
    badgeText = "Cancelled";
    badgeClass = "border-slate-300 bg-slate-100 text-slate-900";
  }

  const hostsPreview = episode?.hosts ?? [];
  const placeholderColors = ["#C2552B", "#D97706", "#059669"].slice(0, view.hostCount);
  const resolvedTopicSnippet = (episode?.topic ?? topicPreview ?? "").trim();
  const micTotalSlots = Math.max(1, Math.min(view.voicesTargetCount, 8));
  const micLitSlots =
    view.voicesTargetCount > 0
      ? Math.round((view.voicesReadyCount / view.voicesTargetCount) * micTotalSlots)
      : 0;

  return (
    <section
      aria-label="Preparing your conversation"
      className="mx-auto w-full max-w-[920px] space-y-4"
    >
      <div className="kuro-card p-4 sm:p-6">
        <div
          className="kuro-broadcast-opening p-4 sm:p-5"
          data-beat-id={view.broadcastBeatId}
          data-beat-phase={
            view.stage === "ready_to_play" ? "ready" : isBusy ? "active" : "recovery"
          }
          data-intro-skipped={display.skipIntroMotion ? "true" : "false"}
        >
          <div aria-hidden="true" className="kuro-broadcast-keylight" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
            <div className="kuro-broadcast-ident flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  view.stage === "ready_to_play"
                    ? "bg-emerald-400"
                    : view.stage === "failed_retryable" || view.stage === "failed_blocking"
                      ? "bg-amber-400"
                      : "bg-[var(--kuro-accent)]"
                }`}
              />
              <span className="font-mono-kuro text-xs font-bold tracking-wider text-[var(--kuro-studio-ink-muted)]">
                BEAT {view.broadcastBeatNumber} · {view.broadcastBeatLabel.toUpperCase()}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {view.canSkipIntroMotion && isBusy ? (
                <button
                  type="button"
                  onClick={() => setSkipIntroMotion((prev) => !prev)}
                  className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--kuro-studio-ink)] hover:bg-[var(--kuro-studio-surface-hi)]"
                >
                  {display.skipIntroMotion ? "Motion settled" : "Skip intro"}
                </button>
              ) : null}

              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
                {badgeText}
              </span>
            </div>
          </div>

          <div className="relative z-10 mt-4 grid gap-4 sm:grid-cols-[1.2fr_0.8fr] sm:items-end">
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-extrabold text-[var(--kuro-studio-ink)] sm:text-2xl">
                {episode?.title ?? view.panelTitle}
              </h1>
              {resolvedTopicSnippet ? (
                <p className="line-clamp-2 text-xs text-[var(--kuro-studio-ink-muted)] sm:text-sm">
                  {resolvedTopicSnippet}
                </p>
              ) : null}
            </div>

            <div
              aria-label="Studio cast and microphone check"
              className="flex items-end justify-start gap-3 sm:justify-end"
            >
              {(hostsPreview.length > 0
                ? hostsPreview.map((host, idx) => ({
                    key: host.id,
                    name: host.name,
                    role: host.role,
                    color: host.accentColor,
                    micReady: view.voicesReadyCount > idx,
                  }))
                : placeholderColors.map((color, idx) => ({
                    key: `seat_${idx}`,
                    name: `Kuromate ${idx + 1}`,
                    role: "standby",
                    color,
                    micReady: false,
                  }))
              ).map((seat) => (
                <div
                  key={seat.key}
                  className="kuro-silhouette-chip flex flex-col items-center rounded-xl border border-[var(--kuro-studio-border)] bg-[var(--kuro-studio-surface)] px-2.5 py-2"
                >
                  <div
                    aria-hidden="true"
                    className="h-6 w-7 rounded-t-full rounded-b-md border border-white/80"
                    style={{
                      backgroundColor: seat.color,
                      opacity: view.stepNumber >= 2 ? 1 : 0.45,
                    }}
                  />
                  <span className="mt-1 max-w-[74px] truncate text-[11px] font-bold text-[var(--kuro-studio-ink)]">
                    {seat.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-1.5 w-6 rounded-full ${
                      seat.micReady || view.stage === "ready_to_play"
                        ? "bg-emerald-400"
                        : "bg-white/25"
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div aria-hidden="true" className="relative z-10 mt-4 flex items-center gap-1.5">
            {Array.from({ length: micTotalSlots }, (_, idx) => {
              const isLit = view.stage === "ready_to_play" || idx < micLitSlots;
              return (
                <span
                  key={idx}
                  className={`h-1.5 flex-1 rounded-full ${
                    isLit
                      ? "bg-emerald-400"
                      : isBusy && idx === micLitSlots
                        ? "kuro-broadcast-holding-bar bg-[var(--kuro-accent)]"
                        : "bg-white/15"
                  }`}
                />
              );
            })}
          </div>
        </div>

        <ol aria-label="Preparation stages" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LOADING_STEPS.map((item) => {
            const isComplete =
              view.stage === "ready_to_play" ? true : view.stepNumber > item.step;
            const isCurrent =
              view.stage === "ready_to_play" ? item.step === 4 : view.stepNumber === item.step;

            return (
              <li
                key={item.step}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs font-semibold ${
                  isComplete
                    ? "border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] text-[var(--kuro-ready-ink)]"
                    : isCurrent
                      ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)] text-[var(--kuro-accent-ink)]"
                      : "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink-muted)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`font-mono-kuro inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    isComplete
                      ? "bg-[var(--kuro-ready-ink)] text-white"
                      : isCurrent
                        ? "bg-[var(--kuro-accent)] text-white"
                        : "bg-[var(--kuro-border)] text-[var(--kuro-ink)]"
                  }`}
                >
                  {isComplete ? "✓" : item.step}
                </span>
                <span className="min-w-0 truncate">{item.title}</span>
              </li>
            );
          })}
        </ol>

        <div
          role="status"
          aria-live="polite"
          data-kuro-recovery-slot="preparation"
          className="mt-4 rounded-xl border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-3.5 py-3"
        >
          <p className="font-display text-sm font-extrabold text-[var(--kuro-ink)] break-words">
            {view.stepHeading}
          </p>
          <p className="mt-0.5 text-sm font-medium text-[var(--kuro-ink)] break-words">
            {view.statusText}
          </p>
          {view.fallbackNotice ? (
            <p className="mt-2 rounded-lg border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-2.5 py-1.5 text-xs font-semibold text-[var(--kuro-warn-ink)]">
              {view.fallbackNotice}
            </p>
          ) : null}
          <p className="font-mono-kuro mt-1.5 text-xs font-semibold text-[var(--kuro-ink-muted)]">
            {view.voiceCountText}
          </p>
          {view.isConfigBlocked && onTrySample ? (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[var(--kuro-border)] pt-2">
              <span className="text-xs text-[var(--kuro-ink-muted)]">
                Want to explore the studio without live keys?
              </span>
              <button
                type="button"
                onClick={onTrySample}
                className="kuro-interactive min-h-11 rounded-lg border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-1.5 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
              >
                Try a sample episode (preview only)
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {view.stage !== "failed_retryable" && view.stage !== "failed_blocking" ? (
            <button
              type="button"
              disabled={!display.canStartPodcast}
              onClick={onStartPodcast}
              className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-5 py-2.5 text-sm font-extrabold text-white hover:bg-[var(--kuro-accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--kuro-border)] disabled:text-[var(--kuro-ink-muted)]"
            >
              Start podcast
            </button>
          ) : null}

          {view.canRetry ? (
            <button
              type="button"
              onClick={onRetryFailedTurns}
              className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-accent)] px-4 py-2.5 text-sm font-extrabold text-white hover:bg-[var(--kuro-accent-hover)]"
            >
              {view.isConfigBlocked ? "Retry" : "Retry failed turn"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onCancelAndEdit}
            className="kuro-interactive min-h-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-4 py-2.5 text-sm font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
          >
            Cancel and edit
          </button>
        </div>
      </div>
    </section>
  );
}
