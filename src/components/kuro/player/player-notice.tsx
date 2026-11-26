import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { AudioAvailability } from "@/hooks/use-episode-playback";

export interface PlayerNoticeProps {
  source: "generated" | "mock" | "sample";
  usedFallback?: boolean;
  episode: Episode;
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  audioAvailability: AudioAvailability;
  notice: string | null;
}

export function PlayerNotice({
  source,
  usedFallback,
  episode,
  requestedOptions,
  audioAvailability,
  notice,
}: PlayerNoticeProps) {
  const lengthDiffers =
    source === "mock" && requestedOptions && requestedOptions.length !== episode.length;
  const isWarning = audioAvailability === "partial";

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
          Sample episode loaded directly ({episode.hosts.length} Kuromates) — not generated from
          form text.
        </p>
      ) : source === "generated" ? (
        <p className="font-semibold">
          {usedFallback
            ? `Generated using an available Gemini model. (${episode.length}, ${episode.segments.length} turns — single-turn Kuromate voice preview ready; full episode sync follows.)`
            : `Generated script by Gemini (${episode.length}, ${episode.segments.length} turns) — single-turn Kuromate voice preview ready; full episode sync follows.`}
        </p>
      ) : lengthDiffers ? (
        <p className="font-semibold">
          Representative mock episode ({episode.length}, {episode.segments.length} turns) returned
          for {requestedOptions?.length} preview.
        </p>
      ) : (
        <p className="font-semibold">
          Mock episode preview — validated local fixture data (mock mode enabled).
        </p>
      )}
      {notice ? <p>{notice}</p> : null}
    </div>
  );
}
