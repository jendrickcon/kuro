"use client";

import { useEffect, useRef, useState } from "react";
import type { Episode } from "@contracts/episode.schema";
import { downloadEpisodeTranscriptFile } from "@/lib/experience/downloads";

export function TranscriptDownload({ episode }: { episode: Episode }) {
  const [downloadedMessage, setDownloadedMessage] = useState<string | null>(null);
  const cleanupRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      cleanupRef.current.forEach((cleanup) => cleanup());
      cleanupRef.current = [];
    };
  }, []);

  function handleDownload() {
    const res = downloadEpisodeTranscriptFile(episode);
    cleanupRef.current.push(res.dispose);
    setDownloadedMessage(`Transcript downloaded (${res.filename})`);
  }

  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={handleDownload}
        className="kuro-interactive min-h-11 w-full rounded-xl border border-[var(--kuro-border-strong)] bg-[var(--kuro-surface)] px-3 py-2 text-xs font-bold text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
      >
        Download transcript (.txt)
      </button>
      {downloadedMessage ? (
        <p
          role="status"
          aria-live="polite"
          className="mt-1 text-[11px] font-medium text-[var(--kuro-ready-ink)]"
        >
          {downloadedMessage}
        </p>
      ) : null}
    </div>
  );
}
