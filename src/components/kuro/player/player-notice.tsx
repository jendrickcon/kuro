import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";
import type { AudioAvailability } from "@/hooks/use-episode-playback";

export interface PlayerNoticeProps {
  source: "mock" | "sample";
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
          Sample episode loaded directly (2 hosts) — not generated from form text.
        </p>
      ) : lengthDiffers ? (
        <p className="font-semibold">
          Representative mock episode ({episode.length}, {episode.segments.length} turns) returned
          for {requestedOptions?.length} preview while live Gemini script generation is pending.
        </p>
      ) : (
        <p className="font-semibold">
          Mock episode preview — validated local fixture data while live Gemini script generation
          is pending.
        </p>
      )}
      {notice ? <p>{notice}</p> : null}
    </div>
  );
}
