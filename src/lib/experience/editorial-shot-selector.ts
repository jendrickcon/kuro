import type { DialogueSegment, Episode, Host } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";

export type EditorialShotType =
  | "speaker-closeup"
  | "reaction-shot"
  | "two-shot"
  | "wide-shot"
  | "visual-explanation";

export type StudioSeat = "left" | "center" | "right";

export type CameraAnchor =
  | "closeup-center"
  | "reaction-center"
  | "two-shot-left"
  | "two-shot-right"
  | "wide-left"
  | "wide-center"
  | "wide-right"
  | "visual-left"
  | "visual-right";

export interface HostShotFraming {
  hostId: string;
  studioSeat: StudioSeat;
  cameraAnchor: CameraAnchor;
  isAudioOwner: boolean;
  isReacting: boolean;
}

export interface EditorialShotInput {
  episode: Episode;
  activeSegmentIndex: number;
  activeSegment: DialogueSegment | undefined;
  previousSegment: DialogueSegment | null;
  activeHost: Host | undefined;
  previousHost: Host | undefined;
  isSpeaking: boolean;
  isInPadding: boolean;
  reactionHostId: string | null;
  playbackStatus: PlaybackStatus;
  isBufferingAtBoundary: boolean;
}

export interface EditorialShotDecision {
  shotType: EditorialShotType;
  ruleReason: string;
  audioOwnerHostId: string;
  cameraFocusHostId: string;
  reactionIndicatorHostId: string | null;
  visibleHostIds: string[];
  visualPriority: "visual" | "speaker" | "cast";
  studioSeats: Readonly<Record<string, StudioSeat>>;
  speakerStudioSeat: StudioSeat;
  speakerCameraAnchor: CameraAnchor;
  hostFraming: HostShotFraming[];
}

/**
 * Resolves a host's permanent physical side in the studio strictly from `episode.hosts[]` index,
 * never from filtered shot visibility, so Maya never inherits Leo's right seat.
 */
export function resolveStudioSeat(episode: Episode, hostId: string): StudioSeat {
  const index = episode.hosts.findIndex((host) => host.id === hostId);
  if (index < 0) return "left";
  if (episode.hosts.length <= 2) {
    return index === 0 ? "left" : "right";
  }
  if (index === 0) return "left";
  if (index === 1) return "center";
  return "right";
}

export function resolveEpisodeStudioSeats(episode: Episode): Record<string, StudioSeat> {
  const map: Record<string, StudioSeat> = {};
  for (const host of episode.hosts) {
    map[host.id] = resolveStudioSeat(episode, host.id);
  }
  return map;
}

function orderByEpisodeCast(episode: Episode, candidateIds: string[]): string[] {
  const wanted = new Set(candidateIds);
  const ordered = episode.hosts.map((host) => host.id).filter((id) => wanted.has(id));
  if (ordered.length > 0) return ordered;
  return episode.hosts.slice(0, 1).map((host) => host.id);
}

function wideAnchorForSeat(seat: StudioSeat): CameraAnchor {
  if (seat === "center") return "wide-center";
  if (seat === "right") return "wide-right";
  return "wide-left";
}

function visualAnchorForSeat(seat: StudioSeat): CameraAnchor {
  return seat === "right" ? "visual-right" : "visual-left";
}

function buildDecision(params: {
  episode: Episode;
  shotType: EditorialShotType;
  ruleReason: string;
  audioOwnerHostId: string;
  cameraFocusHostId: string;
  reactionIndicatorHostId: string | null;
  visibleHostIds: string[];
  visualPriority: "visual" | "speaker" | "cast";
}): EditorialShotDecision {
  const {
    episode,
    shotType,
    ruleReason,
    audioOwnerHostId,
    cameraFocusHostId,
    reactionIndicatorHostId,
    visibleHostIds,
    visualPriority,
  } = params;

  const studioSeats = resolveEpisodeStudioSeats(episode);
  const orderedVisibleIds = orderByEpisodeCast(episode, visibleHostIds);

  const hostFraming: HostShotFraming[] = orderedVisibleIds.map((hostId, visibleIndex) => {
    const studioSeat = studioSeats[hostId] ?? "left";
    let cameraAnchor: CameraAnchor;

    if (shotType === "wide-shot") {
      cameraAnchor = wideAnchorForSeat(studioSeat);
    } else if (shotType === "visual-explanation") {
      cameraAnchor = visualAnchorForSeat(studioSeat);
    } else if (shotType === "two-shot") {
      cameraAnchor = visibleIndex === 0 ? "two-shot-left" : "two-shot-right";
    } else if (shotType === "reaction-shot") {
      if (orderedVisibleIds.length > 1) {
        cameraAnchor = visibleIndex === 0 ? "two-shot-left" : "two-shot-right";
      } else {
        cameraAnchor = "reaction-center";
      }
    } else {
      cameraAnchor = "closeup-center";
    }

    return {
      hostId,
      studioSeat,
      cameraAnchor,
      isAudioOwner: hostId === audioOwnerHostId,
      isReacting: hostId === reactionIndicatorHostId,
    };
  });

  const speakerFraming = hostFraming.find((item) => item.hostId === audioOwnerHostId);
  const speakerStudioSeat = studioSeats[audioOwnerHostId] ?? "left";
  const speakerCameraAnchor =
    speakerFraming?.cameraAnchor ??
    (shotType === "visual-explanation" ? visualAnchorForSeat(speakerStudioSeat) : "closeup-center");

  return {
    shotType,
    ruleReason,
    audioOwnerHostId,
    cameraFocusHostId,
    reactionIndicatorHostId,
    visibleHostIds: orderedVisibleIds,
    visualPriority,
    studioSeats,
    speakerStudioSeat,
    speakerCameraAnchor,
    hostFraming,
  };
}

/**
 * Deterministic 5-shot editorial camera selector derived strictly from verified EpisodeSchema
 * fields and EpisodeBatchCompilerSnapshot runtime fields. Keeps physical studio seats fixed per
 * cast member while transitioning camera framing independently, and never transfers audio ownership.
 */
export function selectEditorialShot(input: EditorialShotInput): EditorialShotDecision {
  const {
    episode,
    activeSegmentIndex,
    activeSegment,
    previousHost,
    isInPadding,
    reactionHostId,
    playbackStatus,
    isBufferingAtBoundary,
  } = input;

  const fallbackSpeakerId = activeSegment?.speakerId ?? episode.hosts[0]?.id ?? "";
  const audioOwnerHostId = fallbackSpeakerId;
  const totalSegments = episode.segments.length;
  const distinctReactionId =
    reactionHostId && reactionHostId !== audioOwnerHostId ? reactionHostId : null;

  if (playbackStatus === "complete" || isBufferingAtBoundary) {
    return buildDecision({
      episode,
      shotType: "wide-shot",
      ruleReason: isBufferingAtBoundary ? "boundary-buffering-standby" : "playback-complete",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: null,
      visibleHostIds: episode.hosts.map((host) => host.id),
      visualPriority: "cast",
    });
  }

  if (activeSegment && activeSegment.visualCue.type !== "none") {
    return buildDecision({
      episode,
      shotType: "visual-explanation",
      ruleReason: `visual-cue-${activeSegment.visualCue.type}`,
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: distinctReactionId,
      visibleHostIds: [audioOwnerHostId],
      visualPriority: "visual",
    });
  }

  const isFirstTurn = activeSegmentIndex === 0;
  const isFinalTurn = totalSegments > 0 && activeSegmentIndex === totalSegments - 1;
  if (isFirstTurn || isFinalTurn) {
    return buildDecision({
      episode,
      shotType: "wide-shot",
      ruleReason: isFirstTurn ? "first-segment" : "final-segment",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: distinctReactionId,
      visibleHostIds: episode.hosts.map((host) => host.id),
      visualPriority: "cast",
    });
  }

  if ((activeSegment && activeSegment.emotion === "reacting") || distinctReactionId !== null) {
    const visibleHostIds = distinctReactionId
      ? [audioOwnerHostId, distinctReactionId]
      : [audioOwnerHostId];
    return buildDecision({
      episode,
      shotType: "reaction-shot",
      ruleReason:
        distinctReactionId !== null
          ? isInPadding
            ? "padding-reaction-handoff"
            : "distinct-listener-reaction"
          : "reacting-segment-emotion",
      audioOwnerHostId,
      cameraFocusHostId: distinctReactionId ?? audioOwnerHostId,
      reactionIndicatorHostId:
        distinctReactionId ??
        (activeSegment?.emotion === "reacting" ? audioOwnerHostId : null),
      visibleHostIds,
      visualPriority: "speaker",
    });
  }

  if (
    activeSegment?.emotion === "curious" &&
    previousHost &&
    previousHost.id !== audioOwnerHostId
  ) {
    return buildDecision({
      episode,
      shotType: "two-shot",
      ruleReason: "curious-speaker-after-previous-host",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: null,
      visibleHostIds: [previousHost.id, audioOwnerHostId],
      visualPriority: "speaker",
    });
  }

  return buildDecision({
    episode,
    shotType: "speaker-closeup",
    ruleReason: "default-active-speaker",
    audioOwnerHostId,
    cameraFocusHostId: audioOwnerHostId,
    reactionIndicatorHostId: null,
    visibleHostIds: [audioOwnerHostId],
    visualPriority: "speaker",
  });
}
