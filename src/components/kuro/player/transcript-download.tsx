"use client";

import { useEffect, useRef, useState } from "react";
import type { Episode } from "@contracts/episode.schema";
import { buildTranscriptFilename, buildTranscriptText } from "@/lib/episode/transcript";

export function TranscriptDownload({ episode }: { episode: Episode }) {
  const [downloadedMessage, setDownloadedMessage] = useState<string | null>(null);
  const cleanupTimersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    return () => {
      cleanupTimersRef.current.forEach((cleanup) => cleanup());
      cleanupTimersRef.current = [];
    };
  }, []);

  function handleDownload() {
    const text = buildTranscriptText(episode);
    const filename = buildTranscriptFilename(episode);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    let revoked = false;
    const revokeNow = () => {
      if (!revoked) {
        revoked = true;
        URL.revokeObjectURL(objectUrl);
      }
    };

    const timerId = window.setTimeout(revokeNow, 1000);
    cleanupTimersRef.current.push(() => {
      window.clearTimeout(timerId);
      revokeNow();
    });

    setDownloadedMessage(`Transcript downloaded (${filename})`);
  }

  return (
    <div className="flex flex-col items-stretch sm:items-end">
      <button
        type="button"
        onClick={handleDownload}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-slate-100 sm:w-auto sm:text-sm"
      >
        Download transcript (.txt)
      </button>
      {downloadedMessage ? (
        <p role="status" aria-live="polite" className="mt-1 text-[11px] font-medium text-emerald-800">
          {downloadedMessage}
        </p>
      ) : null}
    </div>
  );
}
