import type { Episode } from "@contracts/episode.schema";
import type { EpisodeAudioQueueSnapshot } from "@/lib/tts/episode-audio-queue-engine";
import { INITIAL_AUDIO_BUFFER_SIZE } from "@/lib/tts/tts-pacing-config";

export type ScriptLoadingPhase = "idle" | "generating" | "validating";

export type UnifiedLoadingStage =
  | "idle"
  | "generating_script"
  | "validating_script"
  | "preparing_audio"
  | "audio_cooldown"
  | "audio_ready"
  | "audio_partial"
  | "audio_unavailable"
  | "audio_cancelled"
  | "studio_active";

export interface UnifiedLoadingView {
  stage: UnifiedLoadingStage;
  showLoadingPanel: boolean;
  showFullStudio: boolean;
  panelTitle: "Preparing your conversation";
  stepNumber: 1 | 2 | 3 | 4;
  stepHeading: string;
  statusText: string;
  countdownText: string | null;
  fallbackNotice: string | null;
  isLongQuotaWait: boolean;
  voicesReadyCount: number;
  voicesTargetCount: number;
  voiceCountText: string;
  canStartPodcast: boolean;
  canStartPartial: boolean;
  canRetryAudio: boolean;
  canContinueTimedCaptions: boolean;
  isPermanentUnavailable: boolean;
  hostCount: 2 | 3;
}

export function deriveUnifiedLoadingView(input: {
  scriptPhase: ScriptLoadingPhase;
  episode: Episode | null;
  queueSnapshot: EpisodeAudioQueueSnapshot | null;
  hostCount: 2 | 3;
}): UnifiedLoadingView {
  const { scriptPhase, episode, queueSnapshot, hostCount } = input;
  const defaultTarget = INITIAL_AUDIO_BUFFER_SIZE;

  if (scriptPhase === "generating") {
    return {
      stage: "generating_script",
      showLoadingPanel: true,
      showFullStudio: false,
      panelTitle: "Preparing your conversation",
      stepNumber: 1,
      stepHeading: "Preparing your conversation",
      statusText: "Building the Kuromate discussion...",
      countdownText: null,
      fallbackNotice: null,
      isLongQuotaWait: false,
      voicesReadyCount: 0,
      voicesTargetCount: defaultTarget,
      voiceCountText: `Opening voices: 0 of ${defaultTarget} ready`,
      canStartPodcast: false,
      canStartPartial: false,
      canRetryAudio: false,
      canContinueTimedCaptions: false,
      isPermanentUnavailable: false,
      hostCount,
    };
  }

  if (scriptPhase === "validating") {
    return {
      stage: "validating_script",
      showLoadingPanel: true,
      showFullStudio: false,
      panelTitle: "Preparing your conversation",
      stepNumber: 2,
      stepHeading: "Checking the conversation",
      statusText: "Validating the episode structure and host turns...",
      countdownText: null,
      fallbackNotice: null,
      isLongQuotaWait: false,
      voicesReadyCount: 0,
      voicesTargetCount: defaultTarget,
      voiceCountText: `Opening voices: 0 of ${defaultTarget} ready`,
      canStartPodcast: false,
      canStartPartial: false,
      canRetryAudio: false,
      canContinueTimedCaptions: false,
      isPermanentUnavailable: false,
      hostCount,
    };
  }

  if (!episode || !queueSnapshot) {
    return {
      stage: "idle",
      showLoadingPanel: false,
      showFullStudio: false,
      panelTitle: "Preparing your conversation",
      stepNumber: 1,
      stepHeading: "Preparing your conversation",
      statusText: "Ready to create an episode.",
      countdownText: null,
      fallbackNotice: null,
      isLongQuotaWait: false,
      voicesReadyCount: 0,
      voicesTargetCount: defaultTarget,
      voiceCountText: `Opening voices: 0 of ${defaultTarget} ready`,
      canStartPodcast: false,
      canStartPartial: false,
      canRetryAudio: false,
      canContinueTimedCaptions: false,
      isPermanentUnavailable: false,
      hostCount,
    };
  }

  const effectiveHostCount: 2 | 3 = episode.hosts.length === 3 ? 3 : 2;
  const target = queueSnapshot.initialBufferTarget;
  const ready = queueSnapshot.initialBufferReadyCount;
  const voiceCountText = `Opening voices: ${ready} of ${target} ready`;
  const cooldownSecs = queueSnapshot.cooldownActive
    ? Math.max(1, Math.ceil(queueSnapshot.cooldownRemainingMs / 1000))
    : 0;
  const countdownText =
    cooldownSecs > 0 ? `Preparing more voices in ${cooldownSecs}s.` : null;
  const isLongQuotaWait = queueSnapshot.longQuotaExhausted;
  const fallbackNotice = queueSnapshot.usedFallbackAudio
    ? "Primary hosted voices were busy, so Kuro prepared an available Kuromate voice."
    : null;

  if (queueSnapshot.hasStartedPodcast) {
    return {
      stage: "studio_active",
      showLoadingPanel: false,
      showFullStudio: true,
      panelTitle: "Preparing your conversation",
      stepNumber: 4,
      stepHeading: "Ready to begin",
      statusText: "Studio active",
      countdownText,
      fallbackNotice,
      isLongQuotaWait,
      voicesReadyCount: ready,
      voicesTargetCount: target,
      voiceCountText,
      canStartPodcast: false,
      canStartPartial: false,
      canRetryAudio: false,
      canContinueTimedCaptions: false,
      isPermanentUnavailable: false,
      hostCount: effectiveHostCount,
    };
  }

  switch (queueSnapshot.audioPreparationStatus) {
    case "ready":
      return {
        stage: "audio_ready",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 4,
        stepHeading: "Ready to begin",
        statusText:
          target === 1
            ? "Your opening Kuromate voice is ready"
            : "Your opening Kuromate voices are ready",
        countdownText: null,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: queueSnapshot.canStartPodcast,
        canStartPartial: false,
        canRetryAudio: false,
        canContinueTimedCaptions: false,
        isPermanentUnavailable: false,
        hostCount: effectiveHostCount,
      };

    case "cooldown":
      return {
        stage: "audio_cooldown",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 3,
        stepHeading: "Preparing the opening voices",
        statusText:
          ready >= 1
            ? "One opening voice is ready. Waiting briefly for the next turn."
            : "Voice generation is briefly paused.",
        countdownText,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio: false,
        canContinueTimedCaptions: true,
        isPermanentUnavailable: false,
        hostCount: effectiveHostCount,
      };

    case "partial":
      return {
        stage: "audio_partial",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 4,
        stepHeading: "Opening voice partially ready",
        statusText: isLongQuotaWait
          ? "One opening voice is ready, while the next voice reached today’s limit. Start with available audio and captions."
          : "One opening voice is ready, while the second voice hit a temporary limit. Start with available audio and captions or continue preparing voices.",
        countdownText: isLongQuotaWait ? null : countdownText,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: queueSnapshot.canStartPartialPodcast,
        canRetryAudio: queueSnapshot.canRetryPreparation,
        canContinueTimedCaptions: true,
        isPermanentUnavailable: false,
        hostCount: effectiveHostCount,
      };

    case "unavailable": {
      const permanentOutage =
        queueSnapshot.outageState === "config_error" ||
        queueSnapshot.outageState === "auth_error" ||
        !queueSnapshot.canRetryPreparation;
      return {
        stage: "audio_unavailable",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 3,
        stepHeading: isLongQuotaWait
          ? "Hosted voices reached today’s limit"
          : permanentOutage
            ? "Hosted voices unavailable"
            : "Opening voices temporarily paused",
        statusText:
          queueSnapshot.preparationMessage ??
          "Hosted Kuromate voices are unavailable right now. Continue with timed captions or return to the form.",
        countdownText: isLongQuotaWait ? null : countdownText,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio: queueSnapshot.canRetryPreparation,
        canContinueTimedCaptions: true,
        isPermanentUnavailable: permanentOutage,
        hostCount: effectiveHostCount,
      };
    }

    case "cancelled":
      return {
        stage: "audio_cancelled",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 3,
        stepHeading: "Voice preparation paused",
        statusText: "Opening-voice preparation was paused.",
        countdownText: null,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio:
          queueSnapshot.outageState !== "config_error" &&
          queueSnapshot.outageState !== "auth_error",
        canContinueTimedCaptions: true,
        isPermanentUnavailable: false,
        hostCount: effectiveHostCount,
      };

    case "idle":
    case "preparing":
    default: {
      const turnNum =
        queueSnapshot.activePreparingTurnNumber ?? Math.min(target, ready + 1);
      return {
        stage: "preparing_audio",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 3,
        stepHeading: "Preparing the opening voices",
        statusText: `Preparing voice ${turnNum} of ${target}`,
        countdownText: null,
        fallbackNotice,
        isLongQuotaWait,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio: false,
        canContinueTimedCaptions: false,
        isPermanentUnavailable: false,
        hostCount: effectiveHostCount,
      };
    }
  }
}
