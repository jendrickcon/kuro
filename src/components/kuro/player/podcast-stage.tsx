import type { CSSProperties } from "react";
import type { DialogueSegment, Episode } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";
import { ContextualMonitor } from "@/components/kuro/player/contextual-monitor";
import {
  KuromateHost,
  type KuromateHostState,
  type KuromateSizeVariant,
} from "@/components/kuro/player/kuromate-host";
import { DEFAULT_STAGE_THEME, type StageTheme } from "@/components/kuro/player/stage-theme";
import type { EditorialShotDecision } from "@/lib/experience/editorial-shot-selector";

export interface PodcastStageProps {
  episode: Episode;
  currentSegment: DialogueSegment;
  status: PlaybackStatus;
  shotDecision: EditorialShotDecision;
  isSilentFallback?: boolean;
  isInPadding?: boolean;
  isPreparingAudio?: boolean;
  theme?: StageTheme;
}

/**
 * Multi-plane 2.5D/3D CSS Broadcast Studio Stage rendering Depth Plane 1 (perspective
 * architecture & volumetric lighting), Depth Plane 2 (contextual visuals), and Depth Plane 3
 * (camera-tracked Kuromates with stable studio seats & curved desk rim).
 */
export function PodcastStage({
  episode,
  currentSegment,
  status,
  shotDecision,
  isSilentFallback = false,
  isInPadding = false,
  isPreparingAudio = false,
  theme = DEFAULT_STAGE_THEME,
}: PodcastStageProps) {
  const hostCount: 2 | 3 = episode.hosts.length === 3 ? 3 : 2;
  const hostById = new Map(episode.hosts.map((host) => [host.id, host]));
  const activeSeatIndex = Math.max(
    0,
    episode.hosts.findIndex((host) => host.id === shotDecision.audioOwnerHostId),
  );
  const activeSpeakerHost = hostById.get(shotDecision.audioOwnerHostId) ?? episode.hosts[0];
  const stageStyle = {
    "--active-host-accent": activeSpeakerHost?.accentColor ?? "#c2552b",
  } as CSSProperties;

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
    if (shotDecision.shotType === "reaction-shot" && shotDecision.hostFraming.length === 1) {
      return "closeup";
    }
    if (shotDecision.hostFraming.length === 3) return "compact";
    return "standard";
  }

  const sizeVariant = resolveSizeVariant();

  function resolveLookDirection(
    hostState: KuromateHostState,
    globalSeatIdx: number,
  ): "left" | "right" | "center" {
    if (shotDecision.hostFraming.length === 1) return "center";
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
      data-speaker-seat={shotDecision.speakerStudioSeat}
      data-speaker-anchor={shotDecision.speakerCameraAnchor}
      style={stageStyle}
      className="kuro-studio-stage relative flex min-h-0 flex-1 flex-col justify-between overflow-hidden text-[var(--kuro-studio-ink)]"
    >
      {/* Depth Plane 1: Perspective Studio Architecture & Volumetric Keylight */}
      <div aria-hidden="true" className="kuro-stage-architecture">
        <div className="kuro-stage-keylight" />
        <div className="kuro-studio-slats kuro-studio-slats--left" />
        <div className="kuro-studio-slats kuro-studio-slats--right" />
        <div className="kuro-stage-light-rail" />
        <div className="kuro-stage-horizon" />
      </div>

      {/* Depth Plane 2 (~35%): Contextual Visual Display / Clean Atmospheric Backdrop */}
      <div className="kuro-stage-visual-zone relative z-10 shrink-0 px-3 pt-[calc(max(0.45rem,env(safe-area-inset-top))+3.15rem)]">
        <ContextualMonitor
          visualCue={currentSegment.visualCue}
          isPlaying={status === "playing" && !isPreparingAudio}
          priority={shotDecision.visualPriority}
          speakerAnchor={shotDecision.speakerCameraAnchor}
        />
      </div>

      {/* Depth Plane 3 (~35%): Camera-Tracked Kuromates & Curved Studio Desk */}
      <div className="kuro-stage-hosts-zone relative z-20 flex min-h-0 flex-1 flex-col justify-end px-2 pt-2">
        <div className="kuro-stage-hosts-stage">
          {shotDecision.hostFraming.map((framing) => {
            const host = hostById.get(framing.hostId);
            if (!host) return null;
            const globalSeatIdx = Math.max(
              0,
              episode.hosts.findIndex((candidate) => candidate.id === host.id),
            );
            const hostState = resolveHostState(host.id);
            return (
              <KuromateHost
                key={host.id}
                host={host}
                state={hostState}
                lookDirection={resolveLookDirection(hostState, globalSeatIdx)}
                studioSeat={framing.studioSeat}
                cameraAnchor={framing.cameraAnchor}
                hostCount={hostCount}
                sizeVariant={sizeVariant}
                isAudioOwner={framing.isAudioOwner}
              />
            );
          })}
        </div>
        <div aria-hidden="true" className="kuro-shared-desk-rim" />
      </div>
    </section>
  );
}
