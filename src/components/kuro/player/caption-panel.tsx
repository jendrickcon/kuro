import type { DialogueSegment, Host } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import type { SubtitleCue } from "@/lib/experience/subtitle-cues";

export interface CaptionPanelProps {
  activeHost: Host | undefined;
  currentSegment: DialogueSegment;
  activeCue: SubtitleCue | null;
  status: PlaybackStatus;
  onReplay: () => void;
}

/**
 * Movie / YouTube-style 1–2 line synchronized subtitle overlay rendered in the lower
 * safe zone of Depth Plane 4 with names-only screen-reader attribution and 180ms cue motion.
 */
export function CaptionPanel({
  activeHost,
  currentSegment,
  activeCue,
  status,
  onReplay,
}: CaptionPanelProps) {
  const speakerName = activeHost?.name ?? currentSegment.speakerId;
  const lines = activeCue?.lines ?? [currentSegment.text];
  const cueKey = `${currentSegment.id}:${activeCue?.index ?? 0}`;

  return (
    <section
      aria-label="Synchronized subtitles"
      data-kuro-subtitle-overlay="true"
      className="flex min-h-[3.35rem] flex-col items-center justify-end gap-1.5 px-3 pb-1"
    >
      {status === "complete" ? (
        <div
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/78 px-3 py-1.5 text-white backdrop-blur-xs"
        >
          <span className="text-xs font-semibold text-white/90">Episode complete</span>
          <button
            type="button"
            onClick={onReplay}
            className="kuro-interactive min-h-11 rounded-lg bg-[var(--kuro-accent)] px-3 py-1.5 text-xs font-extrabold text-white hover:bg-[var(--kuro-accent-hover)]"
          >
            Replay
          </button>
        </div>
      ) : (
        <div
          key={cueKey}
          aria-live="polite"
          aria-atomic="true"
          data-cue-index={activeCue?.index ?? 0}
          className="kuro-subtitle-cue max-w-[36ch] rounded-lg border border-white/12 bg-black/78 px-3 py-1.5 text-center text-[#f9fafb] shadow-sm backdrop-blur-xs"
        >
          <span className="sr-only">{speakerName}: </span>
          <p className="text-[13.5px] leading-[1.35] font-semibold tracking-[0.005em] text-balance break-words sm:text-[14.5px]">
            {lines.map((line, lineIdx) => (
              <span key={`${cueKey}-line-${lineIdx}`} className="block">
                {line}
              </span>
            ))}
          </p>
        </div>
      )}
    </section>
  );
}
