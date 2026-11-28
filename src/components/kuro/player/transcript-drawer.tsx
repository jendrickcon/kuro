"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Episode, Host } from "@contracts/episode.schema";
import { TranscriptDownload } from "@/components/kuro/player/transcript-download";
import type { CompiledTimelineSegment } from "@/lib/tts/wav-stitcher";

export interface TranscriptDrawerProps {
  isOpen: boolean;
  episode: Episode;
  hostMap: ReadonlyMap<string, Host>;
  activeSegmentIndex: number;
  isSamplePreview: boolean;
  canScrub: boolean;
  playableRangeMs: number;
  timeline: readonly CompiledTimelineSegment[];
  canDownloadAudio: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  onJumpToMs: (ms: number) => void;
  onDownloadAudio: () => { filename: string } | null;
  onClose: () => void;
}

/**
 * Accessible mobile/tablet slide-up transcript drawer with names-only attribution,
 * compiled turn-jump, focus move/trap, Escape dismiss, and focus restoration to trigger.
 */
export function TranscriptDrawer({
  isOpen,
  episode,
  hostMap,
  activeSegmentIndex,
  isSamplePreview,
  canScrub,
  playableRangeMs,
  timeline,
  canDownloadAudio,
  triggerRef,
  onJumpToMs,
  onDownloadAudio,
  onClose,
}: TranscriptDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const [downloadedWavMessage, setDownloadedWavMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      const rafId = window.requestAnimationFrame(() => {
        closeButtonRef.current?.focus();
      });
      return () => {
        window.cancelAnimationFrame(rafId);
      };
    }

    if (wasOpenRef.current) {
      wasOpenRef.current = false;
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  function handleWavClick() {
    const res = onDownloadAudio();
    if (res) {
      setDownloadedWavMessage(`Audio downloaded (${res.filename})`);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:hidden">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-xs"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kuro-transcript-drawer-title"
        className="kuro-drawer-sheet relative z-10 flex max-h-[82dvh] w-full max-w-[430px] flex-col rounded-t-[var(--kuro-radius-xl)] border border-b-0 border-[var(--kuro-border)] bg-[var(--kuro-surface)] text-[var(--kuro-ink)] shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--kuro-border)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="kuro-transcript-drawer-title"
              className="font-display truncate text-base font-extrabold text-[var(--kuro-ink)]"
            >
              {episode.title}
            </h2>
            <p className="text-xs font-medium text-[var(--kuro-ink-muted)]">
              Transcript · {episode.segments.length} turns
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close transcript"
            className="kuro-interactive min-h-11 min-w-11 rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
          >
            Close
          </button>
        </div>

        <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {episode.segments.map((segment, index) => {
            const host = hostMap.get(segment.speakerId);
            const isActive = index === activeSegmentIndex;
            const compiledSeg = timeline[index];
            const canJumpToTurn =
              !isSamplePreview &&
              canScrub &&
              compiledSeg !== undefined &&
              compiledSeg.speechStartMs <= playableRangeMs;

            const innerContent = (
              <>
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="font-mono-kuro text-[11px] font-bold text-[var(--kuro-accent-ink)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: host?.accentColor ?? "#C2552B" }}
                  />
                  <span className="font-bold text-[var(--kuro-ink)]">
                    {host?.name ?? segment.speakerId}
                  </span>
                </div>
                <p className="text-pretty-kuro leading-snug text-[var(--kuro-ink-muted)] break-words">
                  {segment.text}
                </p>
              </>
            );

            return (
              <li key={segment.id}>
                {canJumpToTurn ? (
                  <button
                    type="button"
                    onClick={() => {
                      onJumpToMs(compiledSeg.speechStartMs);
                      onClose();
                    }}
                    className={`kuro-interactive min-h-11 w-full rounded-xl border px-3 py-2 text-left text-xs ${
                      isActive
                        ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)]"
                        : "border-[var(--kuro-border)] bg-[var(--kuro-surface)] hover:bg-[var(--kuro-surface-muted)]"
                    }`}
                  >
                    {innerContent}
                  </button>
                ) : (
                  <div
                    className={`rounded-xl border px-3 py-2 text-xs ${
                      isActive
                        ? "border-[var(--kuro-accent)] bg-[var(--kuro-accent-soft)]"
                        : "border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)]/60"
                    }`}
                  >
                    {innerContent}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="space-y-2 border-t border-[var(--kuro-border)] px-4 pt-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col">
              <button
                type="button"
                disabled={!canDownloadAudio}
                onClick={handleWavClick}
                aria-label={
                  canDownloadAudio
                    ? "Download Audio (.wav)"
                    : isSamplePreview
                      ? "Download Audio disabled in Sample Preview"
                      : "Download Audio available after full episode compilation"
                }
                className="kuro-interactive min-h-11 w-full rounded-xl border border-[var(--kuro-accent)]/40 bg-[var(--kuro-accent-soft)] px-3 py-2 text-xs font-extrabold text-[var(--kuro-accent-ink)] hover:opacity-90 disabled:cursor-not-allowed disabled:border-[var(--kuro-border)] disabled:bg-[var(--kuro-surface-muted)] disabled:text-[var(--kuro-ink-muted)]"
              >
                Download Audio (.wav)
              </button>
              {downloadedWavMessage ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="mt-1 text-[11px] font-medium text-[var(--kuro-ready-ink)]"
                >
                  {downloadedWavMessage}
                </p>
              ) : null}
            </div>

            <TranscriptDownload episode={episode} />
          </div>
        </div>
      </div>
    </div>
  );
}
