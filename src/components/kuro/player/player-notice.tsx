import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { EpisodeBatchCompilerSnapshot } from "@/lib/tts/episode-batch-compiler";

export interface PlayerNoticeProps {
  source: "generated" | "mock" | "sample";
  usedFallback?: boolean;
  episode: Episode;
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  snapshot: EpisodeBatchCompilerSnapshot;
}

/**
 * Renders one cohesive status notice summarizing Sample Preview vs compiled live audio
 * without exposing backend provider or voice names.
 */
export function PlayerNotice({
  source,
  usedFallback,
  episode,
  requestedOptions,
  snapshot,
}: PlayerNoticeProps) {
  const isSample = source === "sample" || snapshot.isSamplePreview;
  const hasIssue =
    snapshot.hasRetryableFailure ||
    snapshot.hasBlockingFailure ||
    snapshot.isBufferingAtBoundary ||
    isSample;

  let summaryLabel: string;
  let contextLine: string | null = null;

  if (isSample) {
    summaryLabel = "Sample Preview";
    contextLine =
      "Built-in walkthrough using timed sample pacing. Live TTS providers are not called and WAV download is disabled.";
  } else if (snapshot.hasBlockingFailure || snapshot.isConfigBlocked) {
    summaryLabel = "Compilation stopped";
    contextLine = snapshot.failureMessage;
  } else if (snapshot.hasRetryableFailure) {
    summaryLabel = "Retry needed for next batch";
    contextLine = snapshot.failureMessage;
  } else if (snapshot.isBufferingAtBoundary) {
    summaryLabel = `Preparing turns ${snapshot.bufferingTurnRange ?? "next"}…`;
  } else if (snapshot.compilationState === "complete") {
    summaryLabel = snapshot.providerFallbackActivated
      ? "Compiled audio ready (alternate voice route)"
      : "Compiled audio ready";
  } else {
    summaryLabel = `Compiled ${snapshot.completedTurns} of ${snapshot.totalTurns} voices`;
    if (episode.length === "detailed") {
      contextLine = "Opening turns ready — remaining turns compile in the background.";
    }
  }

  const lengthDiffers =
    source === "mock" && requestedOptions && requestedOptions.length !== episode.length;

  return (
    <div
      role="status"
      className={`rounded-xl border px-3 py-2 text-xs leading-snug ${
        hasIssue
          ? "border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] text-[var(--kuro-warn-ink)]"
          : "border-[var(--kuro-border)] bg-[var(--kuro-surface)] text-[var(--kuro-ink)]"
      }`}
    >
      {isSample ? (
        <p className="font-semibold">
          Sample Preview ({episode.hosts.length} Kuromates, {episode.segments.length} turns) —{" "}
          {summaryLabel}.
        </p>
      ) : source === "generated" ? (
        <p className="font-semibold">
          {usedFallback
            ? `Generated script (${episode.length}, ${episode.segments.length} turns) — ${summaryLabel}.`
            : `Generated script by Gemini (${episode.length}, ${episode.segments.length} turns) — ${summaryLabel}.`}
        </p>
      ) : lengthDiffers ? (
        <p className="font-semibold">
          Representative mock episode ({episode.length}, {episode.segments.length} turns) returned
          for {requestedOptions?.length} preview — {summaryLabel}.
        </p>
      ) : (
        <p className="font-semibold">
          Mock episode preview ({episode.length}, {episode.segments.length} turns) — {summaryLabel}.
        </p>
      )}
      {contextLine ? <p className="mt-0.5 text-[11px] font-medium">{contextLine}</p> : null}
    </div>
  );
}
