import type { CSSProperties } from "react";
import type { DialogueSegment, Episode } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { ContextualMonitor } from "@/components/kuro/player/contextual-monitor";
import { KurozoHost, type KurozoHostState } from "@/components/kuro/player/kurozo-host";
import {
  DEFAULT_STAGE_THEME,
  STAGE_THEME_META,
  type StageTheme,
} from "@/components/kuro/player/stage-theme";

const HOST_STATE_LABELS: Record<KurozoHostState, string> = {
  speaking: "● Speaking",
  listening: "Listening",
  reacting: "Reacting",
  paused: "Paused",
  complete: "Idle",
  idle: "Idle",
};

const AIR_BADGES: Record<PlaybackStatus, { text: string; toneClass: string }> = {
  idle: {
    text: "STANDBY",
    toneClass: "border-slate-500 bg-slate-800 text-slate-100",
  },
  playing: {
    text: "● ON AIR",
    toneClass: "border-red-300 bg-red-600 text-white",
  },
  paused: {
    text: "PAUSED",
    toneClass: "border-amber-300 bg-amber-600 text-white",
  },
  complete: {
    text: "COMPLETE",
    toneClass: "border-emerald-300 bg-emerald-700 text-white",
  },
};

export interface PodcastStageProps {
  episode: Episode;
  currentSegment: DialogueSegment;
  currentSegmentIndex: number;
  status: PlaybackStatus;
  reactionHostId: string | null;
  theme?: StageTheme;
}

/**
 * Shared studio stage presenting dynamic hosts[], studio monitor, microphones,
 * shared conversational desk, and accessible desk nameplates.
 */
export function PodcastStage({
  episode,
  currentSegment,
  currentSegmentIndex,
  status,
  reactionHostId,
  theme = DEFAULT_STAGE_THEME,
}: PodcastStageProps) {
  const hostCount: 2 | 3 = episode.hosts.length === 3 ? 3 : 2;
  const activeSeatIndex = Math.max(
    0,
    episode.hosts.findIndex((host) => host.id === currentSegment.speakerId),
  );
  const themeMeta = STAGE_THEME_META[theme];
  const airBadge = AIR_BADGES[status];
  const paddedTurn = String(currentSegmentIndex + 1).padStart(2, "0");
  const paddedTotal = String(episode.segments.length).padStart(2, "0");

  function resolveHostState(hostId: string): KurozoHostState {
    if (status === "complete") return "complete";
    if (status === "playing") {
      if (hostId === currentSegment.speakerId) return "speaking";
      if (reactionHostId === hostId) return "reacting";
      return "listening";
    }
    if (status === "paused" && hostId === currentSegment.speakerId) return "paused";
    if (reactionHostId === hostId) return "reacting";
    return "idle";
  }

  function resolveSeatPosition(seatIdx: number): "left" | "center" | "right" {
    if (hostCount === 2) return seatIdx === 0 ? "left" : "right";
    if (seatIdx === 0) return "left";
    if (seatIdx === 1) return "center";
    return "right";
  }

  function resolveLookDirection(hostState: KurozoHostState, seatIdx: number): "left" | "right" | "center" {
    if (hostState === "listening") {
      if (activeSeatIndex < seatIdx) return "left";
      if (activeSeatIndex > seatIdx) return "right";
      return "center";
    }
    if (hostCount === 2) {
      return seatIdx === 0 ? "right" : "left";
    }
    if (seatIdx === 0) return "right";
    if (seatIdx === 2) return "left";
    return "center";
  }

  return (
    <section
      aria-label="Kuro shared podcast studio"
      data-stage-theme={theme}
      data-hosts={hostCount}
      data-playback={status}
      className="kuro-studio-stage relative overflow-hidden rounded-2xl border-2 border-slate-800 text-slate-50 shadow-sm"
    >
      <div aria-hidden="true" className="kuro-studio-slats kuro-studio-slats--left" />
      <div aria-hidden="true" className="kuro-studio-slats kuro-studio-slats--right" />

      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide ${airBadge.toneClass}`}>
          {airBadge.text}
        </span>
        <span className="text-[11px] font-extrabold tracking-[0.14em] text-slate-300">
          {themeMeta.stageLabel}
        </span>
        <span className="text-xs font-extrabold tabular-nums text-slate-100">
          {paddedTurn} / {paddedTotal}
        </span>
      </div>

      <div className="relative z-10 px-2.5 pt-2 sm:px-5 sm:pt-3">
        <ContextualMonitor
          visualCue={currentSegment.visualCue}
          episodeTitle={episode.title}
          isPlaying={status === "playing"}
          monitorLabel={themeMeta.monitorLabel}
        />
      </div>

      <div
        className={`kuro-hosts-row relative z-10 flex items-end justify-center px-2 pt-2 sm:px-5 sm:pt-3 ${
          hostCount === 3 ? "kuro-hosts-row--3 gap-1 sm:gap-5" : "kuro-hosts-row--2 gap-3 sm:gap-10"
        }`}
      >
        {episode.hosts.map((host, seatIdx) => {
          const hostState = resolveHostState(host.id);
          return (
            <KurozoHost
              key={host.id}
              host={host}
              state={hostState}
              lookDirection={resolveLookDirection(hostState, seatIdx)}
              seatPosition={resolveSeatPosition(seatIdx)}
              hostCount={hostCount}
            />
          );
        })}
      </div>

      <div className="relative z-20">
        <div aria-hidden="true" className="kuro-shared-desk-rim" />

        <div
          className={`kuro-nameplate-row grid gap-1.5 px-2.5 py-2 sm:gap-3 sm:px-5 sm:py-2.5 ${
            hostCount === 3 ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {episode.hosts.map((host) => {
            const hostState = resolveHostState(host.id);
            const isSpeaking = hostState === "speaking";
            const isPausedSpeaker = hostState === "paused";
            const statusText = HOST_STATE_LABELS[hostState];
            const accentStyle = { "--kurozo-accent": host.accentColor } as CSSProperties;

            return (
              <div
                key={host.id}
                style={accentStyle}
                aria-label={`${host.name}, ${host.role}, ${statusText.replace("● ", "")}`}
                className={`kuro-nameplate min-w-0 rounded-lg border px-1.5 py-1.5 text-center transition-colors sm:px-3 sm:py-2 ${
                  isSpeaking
                    ? "border-white/90 bg-white/15"
                    : isPausedSpeaker
                      ? "border-slate-300/70 bg-white/10"
                      : "border-white/15 bg-white/5"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="mx-auto mb-1 block h-1 w-8 rounded-full transition-opacity sm:w-12"
                  style={{
                    backgroundColor: host.accentColor,
                    opacity: isSpeaking || isPausedSpeaker ? 1 : 0.45,
                  }}
                />
                <p
                  title={host.name}
                  className="truncate text-xs font-extrabold text-white sm:text-sm"
                >
                  {host.name}
                </p>
                <p className="truncate text-[11px] font-medium capitalize text-slate-300 sm:text-xs">
                  {host.role}
                </p>
                <span
                  aria-hidden="true"
                  className="mt-1 inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-tight sm:text-[11px]"
                  style={
                    isSpeaking
                      ? { backgroundColor: host.accentColor, color: "#ffffff" }
                      : isPausedSpeaker
                        ? { backgroundColor: "#ffffff", color: "#0f172a" }
                        : { backgroundColor: "rgba(255,255,255,0.12)", color: "#e2e8f0" }
                  }
                >
                  {statusText}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
