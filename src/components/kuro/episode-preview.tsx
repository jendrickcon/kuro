"use client";

import { useState } from "react";
import type { Episode, EpisodeLength, Tone } from "@contracts/episode.schema";

export interface EpisodePreviewProps {
  episode: Episode;
  source: "mock" | "sample";
  requestedOptions?: {
    tone: Tone;
    length: EpisodeLength;
    hostCount: 2 | 3;
  };
  onBack: () => void;
}

export function EpisodePreview({
  episode,
  source,
  requestedOptions,
  onBack,
}: EpisodePreviewProps) {
  const [segmentIndex, setSegmentIndex] = useState(0);
  const currentSegment = episode.segments[segmentIndex] ?? episode.segments[0];
  const activeHost = episode.hosts.find((h) => h.id === currentSegment?.speakerId);
  const hostGridClass = episode.hosts.length === 3 ? "grid-cols-3" : "grid-cols-2";

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="min-w-0">
          <span className="inline-block rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
            {source === "sample" ? "Sample episode" : "Mock episode"}
          </span>
          <h2 className="mt-1.5 text-lg font-bold text-slate-950 break-words">{episode.title}</h2>
          <p className="mt-0.5 text-xs text-slate-600">
            {episode.tone} · {requestedOptions?.length ?? episode.length} · {episode.hosts.length}{" "}
            hosts · {episode.segments.length} segments
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
        >
          Back to form
        </button>
      </div>

      {source === "sample" ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Prewritten 2-host sample episode loaded directly — not generated from your form input.
        </p>
      ) : null}

      <p className="text-xs text-slate-700 break-words">
        <span className="font-semibold text-slate-900">Topic:</span> {episode.topic}
      </p>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          Hosts ({episode.hosts.length})
        </h3>
        <div className={`grid ${hostGridClass} gap-2`}>
          {episode.hosts.map((host) => {
            const isSpeaking = host.id === currentSegment?.speakerId;
            return (
              <div
                key={host.id}
                className={`min-w-0 rounded-lg border-2 p-2.5 transition-colors ${
                  isSpeaking
                    ? "border-slate-900 bg-slate-50"
                    : "border-slate-200 bg-white opacity-80"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: host.accentColor }}
                  />
                  <p className="truncate text-sm font-bold text-slate-950">{host.name}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-600 capitalize">{host.role}</p>
                <p className="mt-1.5 text-[11px] font-semibold text-slate-900">
                  {isSpeaking ? "● Speaking" : "Idle"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {currentSegment ? (
        <div className="space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
            <span className="font-bold text-slate-950">
              {activeHost ? `${activeHost.name} (${activeHost.role})` : currentSegment.speakerId}
            </span>
            <span className="font-medium">
              Turn {segmentIndex + 1} of {episode.segments.length}
            </span>
          </div>
          <p className="text-base leading-relaxed text-slate-950 break-words">
            {currentSegment.text}
          </p>
          <p className="text-xs text-slate-700">
            <span className="font-semibold text-slate-900">Contextual visual:</span>{" "}
            {currentSegment.visualCue.type}
            {"title" in currentSegment.visualCue ? ` — ${currentSegment.visualCue.title}` : ""}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={segmentIndex === 0}
          onClick={() => setSegmentIndex((i) => Math.max(0, i - 1))}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous turn
        </button>
        <button
          type="button"
          disabled={segmentIndex >= episode.segments.length - 1}
          onClick={() => setSegmentIndex((i) => Math.min(episode.segments.length - 1, i + 1))}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next turn
        </button>
      </div>
    </section>
  );
}
