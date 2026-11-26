import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { AudioAvailability } from "@/hooks/use-episode-playback";
import type { HostedTtsHealthState } from "@/lib/tts/tts-contract";

export interface PlayerNoticeProps {
  source: "generated" | "mock" | "sample";
  usedFallback?: boolean;
  usedFallbackAudio?: boolean;
  primaryDailyExhausted?: boolean;
  allHostedDailyExhausted?: boolean;
  hostedTtsState?: HostedTtsHealthState;
  episodeAudioSummaryLabel?: string;
  currentSegmentHasAudio?: boolean;
  audioMode?: "hosted" | "timed-fallback";
  episode: Episode;
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  audioAvailability: AudioAvailability;
  notice: string | null;
}

/**
 * Renders one cohesive episode-level summary and status block without contradicting
 * silent timed-caption turns or stacking redundant warnings.
 */
export function PlayerNotice({
  source,
  usedFallback,
  usedFallbackAudio,
  primaryDailyExhausted = false,
  allHostedDailyExhausted = false,
  episodeAudioSummaryLabel,
  currentSegmentHasAudio,
  audioMode = "hosted",
  episode,
  requestedOptions,
  audioAvailability,
  notice,
}: PlayerNoticeProps) {
  const lengthDiffers =
    source === "mock" && requestedOptions && requestedOptions.length !== episode.length;
  const isWarning = audioAvailability === "partial" || allHostedDailyExhausted;

  const computedSummaryLabel =
    episodeAudioSummaryLabel ??
    (allHostedDailyExhausted
      ? "Hosted voice limit reached"
      : audioMode === "timed-fallback" || currentSegmentHasAudio === false
        ? "Timed captions active"
        : usedFallbackAudio
          ? "Alternate hosted voice active"
          : "Hosted audio active");

  const episodeContextLine = allHostedDailyExhausted
    ? "Hosted voice limit reached for today — Kuro’s available hosted voice options have reached today’s project limit. Cached turns stay playable; remaining turns use captions."
    : usedFallbackAudio && audioMode !== "timed-fallback"
      ? primaryDailyExhausted
        ? "Alternate hosted voice active — Kuro’s primary hosted voice reached today’s limit, so an available Kuromate voice is being used."
        : "Alternate hosted voice active — an available Kuromate voice is being used."
      : null;

  const trimmedNotice = notice?.trim() || null;
  const showDetailNotice =
    Boolean(trimmedNotice) &&
    (!episodeContextLine || !trimmedNotice!.includes("today’s project limit"));

  return (
    <div
      role="status"
      className={`rounded-xl border px-3 py-1.5 text-xs leading-snug ${
        isWarning
          ? "border-amber-300 bg-amber-50 text-amber-950"
          : "border-slate-200 bg-slate-50 text-slate-800"
      }`}
    >
      {source === "sample" ? (
        <p className="font-semibold">
          Sample episode loaded directly ({episode.hosts.length} Kuromates) — {computedSummaryLabel}.
        </p>
      ) : source === "generated" ? (
        <p className="font-semibold">
          {usedFallback
            ? `Generated using an available Gemini model (${episode.length}, ${episode.segments.length} turns) — ${computedSummaryLabel}.`
            : `Generated script by Gemini (${episode.length}, ${episode.segments.length} turns) — ${computedSummaryLabel}.`}
        </p>
      ) : lengthDiffers ? (
        <p className="font-semibold">
          Representative mock episode ({episode.length}, {episode.segments.length} turns) returned
          for {requestedOptions?.length} preview — {computedSummaryLabel}.
        </p>
      ) : (
        <p className="font-semibold">
          Mock episode preview ({episode.length}, {episode.segments.length} turns) —{" "}
          {computedSummaryLabel}.
        </p>
      )}
      {episodeContextLine ? (
        <p className="mt-0.5 font-semibold text-blue-950">{episodeContextLine}</p>
      ) : null}
      {showDetailNotice ? <p className="mt-0.5">{trimmedNotice}</p> : null}
    </div>
  );
}
