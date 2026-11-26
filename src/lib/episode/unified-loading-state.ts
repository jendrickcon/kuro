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
  fallbackNoticeTitle: string | null;
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
      fallbackNoticeTitle: null,
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
      fallbackNoticeTitle: null,
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
      fallbackNoticeTitle: null,
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
    cooldownSecs > 0 ? `Resuming after cooldown in ${cooldownSecs}s.` : null;

  const isAllHostedExhausted =
    queueSnapshot.allHostedDailyExhausted || queueSnapshot.longQuotaExhausted;
  const isPrimaryDailyExhausted = queueSnapshot.primaryModelState === "daily_exhausted";

  const fallbackNoticeTitle = queueSnapshot.usedFallbackAudio
    ? "Alternate hosted voice active"
    : null;
  const fallbackNotice = queueSnapshot.usedFallbackAudio
    ? isPrimaryDailyExhausted
      ? "Kuro’s primary hosted voice reached today’s limit, so an available Kuromate voice is being used."
      : "Primary hosted voices were busy, so Kuro prepared an available Kuromate voice."
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
      fallbackNoticeTitle,
      fallbackNotice,
      isLongQuotaWait: isAllHostedExhausted,
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
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: isAllHostedExhausted,
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
        stepHeading: "Voice generation is briefly paused",
        statusText:
          ready >= 1
            ? "One opening voice is ready. Kuro will resume after the provider’s short cooldown."
            : "Kuro will resume after the provider’s short cooldown.",
        countdownText,
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: false,
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
        stepHeading: isAllHostedExhausted
          ? "Hosted voice limit reached for today"
          : "Opening voice partially ready",
        statusText: isAllHostedExhausted
          ? "One opening voice is ready, and Kuro’s hosted voice options reached today’s project limit. Start with available audio and captions."
          : "One opening voice is ready, while the second voice is temporarily unavailable. Start with available audio and captions or continue preparing voices.",
        countdownText: isAllHostedExhausted ? null : countdownText,
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: isAllHostedExhausted,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: queueSnapshot.canStartPartialPodcast,
        canRetryAudio: !isAllHostedExhausted && queueSnapshot.canRetryPreparation,
        canContinueTimedCaptions: true,
        isPermanentUnavailable: isAllHostedExhausted,
        hostCount: effectiveHostCount,
      };

    case "unavailable": {
      const permanentOutage =
        isAllHostedExhausted ||
        queueSnapshot.outageState === "config_error" ||
        queueSnapshot.outageState === "auth_error" ||
        !queueSnapshot.canRetryPreparation;
      const isGenericOutage =
        !isAllHostedExhausted &&
        queueSnapshot.outageState === "provider_outage";

      return {
        stage: "audio_unavailable",
        showLoadingPanel: true,
        showFullStudio: false,
        panelTitle: "Preparing your conversation",
        stepNumber: 3,
        stepHeading: isAllHostedExhausted
          ? "Hosted voice limit reached for today"
          : permanentOutage
            ? "Hosted voices unavailable"
            : isGenericOutage
              ? "Hosted voices are temporarily unavailable"
              : "Hosted voices are temporarily unavailable",
        statusText: isAllHostedExhausted
          ? "Kuro’s available hosted voice options have reached today’s project limit. The conversation can continue with captions."
          : isGenericOutage
            ? "Your conversation is safe. Continue with captions or try again later."
            : queueSnapshot.preparationMessage ??
              "Your conversation is safe. Continue with captions or try again later.",
        countdownText: isAllHostedExhausted ? null : countdownText,
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: isAllHostedExhausted,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio: !isAllHostedExhausted && queueSnapshot.canRetryPreparation,
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
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: isAllHostedExhausted,
        voicesReadyCount: ready,
        voicesTargetCount: target,
        voiceCountText,
        canStartPodcast: false,
        canStartPartial: false,
        canRetryAudio:
          !isAllHostedExhausted &&
          queueSnapshot.outageState !== "config_error" &&
          queueSnapshot.outageState !== "auth_error",
        canContinueTimedCaptions: true,
        isPermanentUnavailable: isAllHostedExhausted,
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
        fallbackNoticeTitle,
        fallbackNotice,
        isLongQuotaWait: isAllHostedExhausted,
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
