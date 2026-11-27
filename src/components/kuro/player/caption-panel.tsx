import type { CSSProperties } from "react";
import type { DialogueSegment, Host } from "@contracts/episode.schema";
import type { AudioAvailability, PlaybackStatus } from "@/hooks/use-episode-playback";

export interface CaptionPanelProps {
  activeHost: Host | undefined;
  currentSegment: DialogueSegment;
  currentSegmentIndex: number;
  totalSegments: number;
  previousSegment: DialogueSegment | null;
  previousHost: Host | undefined;
  status: PlaybackStatus;
  audioAvailability: AudioAvailability;
  isSamplePreview?: boolean;
  isBufferingAtBoundary?: boolean;
  bufferingTurnRange?: string | null;
  onReplay: () => void;
}

export function CaptionPanel({
  activeHost,
  currentSegment,
  currentSegmentIndex,
  totalSegments,
  previousSegment,
  previousHost,
  status,
  isSamplePreview = false,
  isBufferingAtBoundary = false,
  bufferingTurnRange = null,
  onReplay,
}: CaptionPanelProps) {
  const speakerName = activeHost?.name ?? currentSegment.speakerId;
  const speakerRole = activeHost?.role;
  const accentColor = activeHost?.accentColor ?? "#1d4ed8";
  const panelStyle = { borderLeftColor: accentColor } as CSSProperties;

  return (
    <section
      aria-label="Synchronized captions"
      style={panelStyle}
      className="rounded-2xl border border-slate-300 border-l-[6px] bg-white p-3.5 shadow-xs sm:p-4"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-extrabold text-slate-950">{speakerName}</span>
          {speakerRole ? (
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-800">
              {speakerRole}
            </span>
          ) : null}
          {isBufferingAtBoundary ? (
            <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-950">
              Preparing turns {bufferingTurnRange ?? "next"}…
            </span>
          ) : status === "paused" ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900">
              Paused
            </span>
          ) : null}
        </div>

        <span className="text-xs font-bold tabular-nums text-slate-700">
          Turn {currentSegmentIndex + 1} of {totalSegments}
        </span>
      </div>

      {isSamplePreview ? (
        <p className="mb-2 inline-block rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-950">
          Sample Preview — built-in timed walkthrough (no live audio keys used)
        </p>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        <p className="sr-only">
          {`Turn ${currentSegmentIndex + 1} of ${totalSegments}. ${speakerName}${speakerRole ? `, ${speakerRole}` : ""}: `}
        </p>
        <p className="max-w-[65ch] text-base leading-relaxed font-semibold text-slate-950 break-words sm:text-lg">
          {currentSegment.text}
        </p>
      </div>

      {previousSegment ? (
        <p className="mt-3 border-t border-slate-200 pt-2 text-xs leading-relaxed text-slate-700 break-words">
          <span className="font-bold text-slate-800">
            Previous — {previousHost?.name ?? previousSegment.speakerId}:
          </span>{" "}
          “{previousSegment.text}”
        </p>
      ) : null}

      {status === "complete" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5"
        >
          <p className="text-xs font-bold text-emerald-950 sm:text-sm">
            Episode complete — all hosts returned to idle. Replay anytime or download the transcript.
          </p>
          <button
            type="button"
            onClick={onReplay}
            className="min-h-11 rounded-lg bg-emerald-800 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
          >
            Replay episode
          </button>
        </div>
      ) : null}
    </section>
  );
}
