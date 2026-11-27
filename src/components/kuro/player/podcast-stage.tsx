import type { CSSProperties } from "react";
import type { DialogueSegment, Episode } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { ContextualMonitor } from "@/components/kuro/player/contextual-monitor";
import {
  KuromateHost,
  type KuromateHostState,
  type KuromateSizeVariant,
} from "@/components/kuro/player/kuromate-host";
import {
  DEFAULT_STAGE_THEME,
  STAGE_THEME_META,
  type StageTheme,
} from "@/components/kuro/player/stage-theme";
import type { EditorialShotDecision } from "@/lib/experience/editorial-shot-selector";

const HOST_STATE_LABELS: Record<KuromateHostState, string> = {
  speaking: "● Speaking",
  captioning: "Captioning",
  listening: "Listening",
  reacting: "Reacting (no audio)",
  paused: "Paused",
  complete: "Idle",
  idle: "Idle",
};

const AIR_BADGES: Record<PlaybackStatus, { text: string; toneClass: string }> = {
  idle: {
    text: "STANDBY",
    toneClass: "border-white/25 bg-[var(--kuro-studio-surface)] text-[var(--kuro-studio-ink)]",
  },
  playing: {
    text: "● ON AIR",
    toneClass: "border-red-300 bg-[var(--kuro-on-air)] text-white",
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
  shotDecision: EditorialShotDecision;
  isSilentFallback?: boolean;
  isInPadding?: boolean;
  isSamplePreview?: boolean;
  isPreparingAudio?: boolean;
  theme?: StageTheme;
}

/**
 * Editorial 9:16-ready portrait broadcast stage rendering Top contextual display zone (~38%)
 * and Middle editorial Kuromate stage (~38%) driven by `shotDecision` and dynamic `hosts[]`.
 */
export function PodcastStage({
  episode,
  currentSegment,
  currentSegmentIndex,
  status,
  shotDecision,
  isSilentFallback = false,
  isInPadding = false,
  isSamplePreview = false,
  isPreparingAudio = false,
  theme = DEFAULT_STAGE_THEME,
}: PodcastStageProps) {
  const hostCount: 2 | 3 = episode.hosts.length === 3 ? 3 : 2;
  const activeSeatIndex = Math.max(
    0,
    episode.hosts.findIndex((host) => host.id === shotDecision.audioOwnerHostId),
  );
  const themeMeta = STAGE_THEME_META[theme];
  const airBadge = isPreparingAudio
    ? {
        text: "PREPARING",
        toneClass: "border-blue-300 bg-blue-700 text-white",
      }
    : isSamplePreview && status === "playing"
      ? {
          text: "SAMPLE PREVIEW",
          toneClass: "border-amber-300 bg-amber-600 text-white",
        }
      : status === "playing" && isSilentFallback
        ? {
            text: "PAUSED",
            toneClass: "border-amber-300 bg-amber-600 text-white",
          }
        : AIR_BADGES[status];

  const paddedTurn = String(currentSegmentIndex + 1).padStart(2, "0");
  const paddedTotal = String(episode.segments.length).padStart(2, "0");

  function resolveHostState(hostId: string): KuromateHostState {
    if (isPreparingAudio) return "idle";
    if (status === "complete") return "complete";
    const isOwner = hostId === shotDecision.audioOwnerHostId;
    const isReactor = hostId === shotDecision.reactionIndicatorHostId;

    if (status === "playing") {
      if (isInPadding) {
        return isReactor ? "reacting" : "listening";
      }
      if (isOwner) {
        return isSilentFallback ? "captioning" : "speaking";
      }
      if (isReactor) return "reacting";
      return "listening";
    }
    if (status === "paused" && isOwner) return "paused";
    if (isReactor && !isOwner) return "reacting";
    return "idle";
  }

  function resolveSizeVariant(): KuromateSizeVariant {
    if (shotDecision.shotType === "visual-explanation") return "docked";
    if (shotDecision.shotType === "speaker-closeup") return "closeup";
    if (shotDecision.shotType === "reaction-shot" && visibleHosts.length === 1) return "closeup";
    if (visibleHosts.length === 3) return "compact";
    return "standard";
  }

  const visibleHostSet = new Set(shotDecision.visibleHostIds);
  const visibleHosts = episode.hosts.filter((host) => visibleHostSet.has(host.id));
  const stageHosts = visibleHosts.length > 0 ? visibleHosts : episode.hosts.slice(0, 1);
  const sizeVariant = resolveSizeVariant();

  function resolveSeatPosition(hostIdx: number): "left" | "center" | "right" {
    if (stageHosts.length === 1) return "center";
    if (stageHosts.length === 2) return hostIdx === 0 ? "left" : "right";
    if (hostIdx === 0) return "left";
    if (hostIdx === 1) return "center";
    return "right";
  }

  function resolveLookDirection(
    hostState: KuromateHostState,
    globalSeatIdx: number,
  ): "left" | "right" | "center" {
    if (stageHosts.length === 1) return "center";
    if (hostState === "listening" || hostState === "reacting") {
      if (activeSeatIndex < globalSeatIdx) return "left";
      if (activeSeatIndex > globalSeatIdx) return "right";
      return "center";
    }
    if (hostCount === 2) {
      return globalSeatIdx === 0 ? "right" : "left";
    }
    if (globalSeatIdx === 0) return "right";
    if (globalSeatIdx === 2) return "left";
    return "center";
  }

  return (
    <section
      aria-label="Kuro portrait podcast studio"
      data-stage-theme={theme}
      data-hosts={hostCount}
      data-playback={status}
      data-editorial-shot={shotDecision.shotType}
      data-audio-owner={shotDecision.audioOwnerHostId}
      className="kuro-studio-stage relative flex flex-col justify-between overflow-hidden text-[var(--kuro-studio-ink)]"
    >
      <div aria-hidden="true" className="kuro-studio-slats kuro-studio-slats--left" />
      <div aria-hidden="true" className="kuro-studio-slats kuro-studio-slats--right" />

      {/* Studio Top Bar */}
      <div className="relative z-10 flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide ${airBadge.toneClass}`}
        >
          {airBadge.text}
        </span>

        <span className="truncate rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold text-[var(--kuro-studio-ink-muted)]">
          {shotDecision.shotLabel}
        </span>

        <span className="font-mono-kuro text-xs font-bold text-[var(--kuro-studio-ink)]">
          {paddedTurn} / {paddedTotal}
        </span>
      </div>

      {/* Top Safe Zone (~38%): Contextual Visualization */}
      <div className="kuro-stage-visual-zone relative z-10 min-h-[124px] px-2.5 pt-2.5">
        <ContextualMonitor
          visualCue={currentSegment.visualCue}
          episodeTitle={episode.title}
          isPlaying={status === "playing" && !isSilentFallback && !isPreparingAudio}
          monitorLabel={themeMeta.monitorLabel}
          priority={shotDecision.visualPriority}
        />
      </div>

      {/* Middle Safe Zone (~38%): Editorial Kuromate Framing */}
      <div
        className={`kuro-stage-hosts-zone relative z-10 flex min-h-[138px] items-end justify-center px-2.5 pt-3 ${
          stageHosts.length === 3 ? "gap-1.5" : "gap-5"
        }`}
      >
        {stageHosts.map((host, idx) => {
          const globalSeatIdx = Math.max(
            0,
            episode.hosts.findIndex((h) => h.id === host.id),
          );
          const hostState = resolveHostState(host.id);
          const isAudioOwner = host.id === shotDecision.audioOwnerHostId;
          return (
            <KuromateHost
              key={host.id}
              host={host}
              state={hostState}
              lookDirection={resolveLookDirection(hostState, globalSeatIdx)}
              seatPosition={resolveSeatPosition(idx)}
              hostCount={hostCount}
              sizeVariant={sizeVariant}
              isAudioOwner={isAudioOwner}
            />
          );
        })}
      </div>

      {/* Desk Rim & Dynamic Cast Ownership Plates */}
      <div className="relative z-20">
        <div aria-hidden="true" className="kuro-shared-desk-rim" />

        <div
          className={`kuro-nameplate-row grid gap-1.5 px-2.5 py-2 ${
            hostCount === 3 ? "grid-cols-3" : "grid-cols-2"
          }`}
        >
          {episode.hosts.map((host) => {
            const hostState = resolveHostState(host.id);
            const isSpeaking = hostState === "speaking";
            const isReactingNonOwner =
              hostState === "reacting" && host.id !== shotDecision.audioOwnerHostId;
            const isCaptioning = hostState === "captioning";
            const isPausedSpeaker = hostState === "paused";
            const statusText = isReactingNonOwner
              ? "Reacting"
              : HOST_STATE_LABELS[hostState];
            const accentStyle = { "--kuromate-accent": host.accentColor } as CSSProperties;

            return (
              <div
                key={host.id}
                style={accentStyle}
                aria-label={`${host.name}, ${host.role}, ${statusText.replace("● ", "")}`}
                className={`kuro-nameplate min-w-0 rounded-lg border px-1.5 py-1 text-center transition-colors ${
                  isSpeaking
                    ? "border-white/90 bg-white/15"
                    : isReactingNonOwner
                      ? "border-amber-300/60 bg-white/10"
                      : isCaptioning
                        ? "border-amber-300/80 bg-white/10"
                        : isPausedSpeaker
                          ? "border-white/60 bg-white/10"
                          : "border-white/15 bg-white/5"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="mx-auto mb-1 block h-1 w-8 rounded-full transition-opacity"
                  style={{
                    backgroundColor: host.accentColor,
                    opacity: isSpeaking || isCaptioning || isPausedSpeaker ? 1 : 0.45,
                  }}
                />
                <p title={host.name} className="truncate text-xs font-extrabold text-white">
                  {host.name}
                </p>
                <p className="truncate text-[10px] font-medium capitalize text-[var(--kuro-studio-ink-muted)]">
                  {host.role}
                </p>
                <span
                  aria-hidden="true"
                  className="mt-1 inline-flex max-w-full items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-tight"
                  style={
                    isSpeaking
                      ? { backgroundColor: host.accentColor, color: "#ffffff" }
                      : isReactingNonOwner
                        ? { backgroundColor: "#334155", color: "#f8fafc" }
                        : isCaptioning
                          ? { backgroundColor: "#fef3c7", color: "#78350f" }
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
