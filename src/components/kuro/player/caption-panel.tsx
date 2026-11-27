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
  const accentColor = activeHost?.accentColor ?? "#C2552B";
  const panelStyle = { borderLeftColor: accentColor } as CSSProperties;

  return (
    <section
      aria-label="Synchronized captions"
      style={panelStyle}
      className="border-t border-l-[6px] border-[var(--kuro-border)] bg-[var(--kuro-surface)] p-3 text-[var(--kuro-ink)] sm:p-3.5"
    >
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor }}
          />
          <span className="text-sm font-extrabold text-[var(--kuro-ink)]">{speakerName}</span>
          {speakerRole ? (
            <span className="rounded-full border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-2 py-0.5 text-[11px] font-semibold capitalize text-[var(--kuro-ink)]">
              {speakerRole}
            </span>
          ) : null}
          {isBufferingAtBoundary ? (
            <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-950">
              Preparing turns {bufferingTurnRange ?? "next"}…
            </span>
          ) : status === "paused" ? (
            <span className="rounded-full border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-2 py-0.5 text-[11px] font-bold text-[var(--kuro-warn-ink)]">
              Paused
            </span>
          ) : null}
        </div>

        <span className="font-mono-kuro text-xs font-bold text-[var(--kuro-ink-muted)]">
          Turn {currentSegmentIndex + 1} of {totalSegments}
        </span>
      </div>

      {isSamplePreview ? (
        <p className="mb-1.5 inline-block rounded-md border border-[var(--kuro-warn-border)] bg-[var(--kuro-warn-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--kuro-warn-ink)]">
          Sample Preview — timed captions walkthrough (no live keys used)
        </p>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        <p className="sr-only">
          {`Turn ${currentSegmentIndex + 1} of ${totalSegments}. ${speakerName}${
            speakerRole ? `, ${speakerRole}` : ""
          }: `}
        </p>
        <p className="text-pretty-kuro max-w-[65ch] text-sm leading-relaxed font-semibold text-[var(--kuro-ink)] break-words sm:text-base">
          {currentSegment.text}
        </p>
      </div>

      {previousSegment ? (
        <p className="mt-2 border-t border-[var(--kuro-border)] pt-1.5 text-xs leading-snug text-[var(--kuro-ink-muted)] break-words">
          <span className="font-bold text-[var(--kuro-ink)]">
            Previous — {previousHost?.name ?? previousSegment.speakerId}:
          </span>{" "}
          “{previousSegment.text}”
        </p>
      ) : null}

      {status === "complete" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--kuro-ready-border)] bg-[var(--kuro-ready-bg)] px-3 py-2"
        >
          <p className="text-xs font-bold text-[var(--kuro-ready-ink)]">
            Episode complete — replay anytime or save your downloads.
          </p>
          <button
            type="button"
            onClick={onReplay}
            className="kuro-interactive min-h-11 rounded-xl bg-[var(--kuro-ready-ink)] px-3.5 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            Replay episode
          </button>
        </div>
      ) : null}
    </section>
  );
}
