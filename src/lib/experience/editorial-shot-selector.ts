import type { DialogueSegment, Episode, Host } from "@contracts/episode.schema";
import type { PlaybackStatus } from "@/hooks/use-episode-playback";

export type EditorialShotType =
  | "speaker-closeup"
  | "reaction-shot"
  | "two-shot"
  | "wide-shot"
  | "visual-explanation";

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
  shotLabel: string;
  ruleReason: string;
  audioOwnerHostId: string;
  cameraFocusHostId: string;
  reactionIndicatorHostId: string | null;
  visibleHostIds: string[];
  visualPriority: "visual" | "speaker" | "cast";
  speakerDock: "center" | "lower-right" | "split" | "stage";
}

function orderByEpisodeCast(episode: Episode, candidateIds: string[]): string[] {
  const wanted = new Set(candidateIds);
  const ordered = episode.hosts.map((host) => host.id).filter((id) => wanted.has(id));
  if (ordered.length > 0) return ordered;
  return episode.hosts.slice(0, 1).map((host) => host.id);
}

/**
 * Deterministic 5-shot editorial camera selector derived strictly from verified EpisodeSchema
 * fields and EpisodeBatchCompilerSnapshot runtime fields. Never invents schema metadata and
 * never transfers active audio ownership away from `activeSegment.speakerId`.
 */
export function selectEditorialShot(input: EditorialShotInput): EditorialShotDecision {
  const {
    episode,
    activeSegmentIndex,
    activeSegment,
    activeHost,
    previousHost,
    isSpeaking,
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
    return {
      shotType: "wide-shot",
      shotLabel: isBufferingAtBoundary ? "Standby wide shot" : "Closing wide shot",
      ruleReason: isBufferingAtBoundary ? "boundary-buffering-standby" : "playback-complete",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: null,
      visibleHostIds: episode.hosts.map((host) => host.id),
      visualPriority: "cast",
      speakerDock: "stage",
    };
  }

  if (activeSegment && activeSegment.visualCue.type !== "none") {
    return {
      shotType: "visual-explanation",
      shotLabel: "Visual explanation",
      ruleReason: `visual-cue-${activeSegment.visualCue.type}`,
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: distinctReactionId,
      visibleHostIds: [audioOwnerHostId],
      visualPriority: "visual",
      speakerDock: "lower-right",
    };
  }

  const isFirstTurn = activeSegmentIndex === 0;
  const isFinalTurn = totalSegments > 0 && activeSegmentIndex === totalSegments - 1;
  if (isFirstTurn || isFinalTurn) {
    return {
      shotType: "wide-shot",
      shotLabel: isFirstTurn ? "Opening cast wide shot" : "Closing cast wide shot",
      ruleReason: isFirstTurn ? "first-segment" : "final-segment",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: distinctReactionId,
      visibleHostIds: episode.hosts.map((host) => host.id),
      visualPriority: "cast",
      speakerDock: "stage",
    };
  }

  if ((activeSegment && activeSegment.emotion === "reacting") || distinctReactionId !== null) {
    const visibleHostIds = distinctReactionId
      ? orderByEpisodeCast(episode, [audioOwnerHostId, distinctReactionId])
      : [audioOwnerHostId];
    return {
      shotType: "reaction-shot",
      shotLabel: distinctReactionId ? "Listener reaction" : "Reaction shot",
      ruleReason:
        distinctReactionId !== null
          ? isInPadding
            ? "padding-reaction-handoff"
            : "distinct-listener-reaction"
          : "reacting-segment-emotion",
      audioOwnerHostId,
      cameraFocusHostId: distinctReactionId ?? audioOwnerHostId,
      reactionIndicatorHostId: distinctReactionId ?? (activeSegment?.emotion === "reacting" ? audioOwnerHostId : null),
      visibleHostIds,
      visualPriority: "speaker",
      speakerDock: visibleHostIds.length > 1 ? "split" : "center",
    };
  }

  if (
    activeSegment?.emotion === "curious" &&
    previousHost &&
    previousHost.id !== audioOwnerHostId
  ) {
    return {
      shotType: "two-shot",
      shotLabel: "Two-host exchange",
      ruleReason: "curious-speaker-after-previous-host",
      audioOwnerHostId,
      cameraFocusHostId: audioOwnerHostId,
      reactionIndicatorHostId: null,
      visibleHostIds: orderByEpisodeCast(episode, [previousHost.id, audioOwnerHostId]),
      visualPriority: "speaker",
      speakerDock: "split",
    };
  }

  const resolvedSpeakerName = activeHost?.name ?? "Speaker";
  return {
    shotType: "speaker-closeup",
    shotLabel: isSpeaking ? `${resolvedSpeakerName} close-up` : "Speaker framing",
    ruleReason: "default-active-speaker",
    audioOwnerHostId,
    cameraFocusHostId: audioOwnerHostId,
    reactionIndicatorHostId: null,
    visibleHostIds: [audioOwnerHostId],
    visualPriority: "speaker",
    speakerDock: "center",
  };
}
