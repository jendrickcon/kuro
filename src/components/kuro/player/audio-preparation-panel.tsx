import type { Episode } from "@contracts/episode.schema";
import type { EpisodeAudioQueueSnapshot } from "@/lib/tts/episode-audio-queue-engine";

export interface AudioPreparationPanelProps {
  episode: Episode;
  snapshot: EpisodeAudioQueueSnapshot;
  onStartPodcast: () => void;
  onStartWithCaptionsAndAvailableAudio: () => void;
  onContinueWithTimedCaptions: () => void;
  onRetryPreparation: () => void;
  onCancelAndEdit: () => void;
}

/**
 * Compact pre-podcast buffering card shown after script generation until the initial
 * playable Kuromate audio buffer is verified ready or user chooses explicit fallback.
 */
export function AudioPreparationPanel({
  episode,
  snapshot,
  onStartPodcast,
  onStartWithCaptionsAndAvailableAudio,
  onContinueWithTimedCaptions,
  onRetryPreparation,
  onCancelAndEdit,
}: AudioPreparationPanelProps) {
  const prepStatus = snapshot.audioPreparationStatus;
  const readyCount = snapshot.initialBufferReadyCount;
  const targetCount = snapshot.initialBufferTarget;
  const cooldownSecs = snapshot.cooldownActive
    ? Math.max(1, Math.ceil(snapshot.cooldownRemainingMs / 1000))
    : 0;

  const isPermanentOutage =
    snapshot.outageState === "config_error" || snapshot.outageState === "auth_error";
  const firstEntry = snapshot.segments[0];
  const firstIsRecoverable =
    !isPermanentOutage &&
    firstEntry !== undefined &&
    (firstEntry.failureClass === "capacity" ||
      firstEntry.failureClass === "timeout" ||
      firstEntry.failureClass === "network" ||
      firstEntry.failureClass === "audio");

  let badgeLabel = "Preparing";
  let badgeClass = "border-blue-300 bg-blue-50 text-blue-950";
  let title = "Preparing your Kuromates";
  let body = "Creating the first voices so the conversation can begin smoothly.";

  if (prepStatus === "ready") {
    badgeLabel = "Ready to begin";
    badgeClass = "border-emerald-300 bg-emerald-50 text-emerald-950";
    title = "Your Kuromates are ready";
    body =
      targetCount === 1
        ? "1 opening voice ready."
        : `${targetCount} opening voices ready. Later voices will prepare during playback.`;
  } else if (prepStatus === "partial") {
    badgeLabel = "Partial audio ready";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
    title = "One opening voice is ready";
    body =
      "Voice 2 is temporarily unavailable right now. Start with captions and available audio, or switch cleanly to timed captions.";
  } else if (prepStatus === "cooldown") {
    badgeLabel = "Rate limit wait";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
    title =
      readyCount === 1
        ? "One voice is ready. Waiting briefly for the next turn."
        : "Voice generation is briefly paused.";
    body =
      cooldownSecs > 0
        ? `Preparing more voices in ${cooldownSecs}s.`
        : "Waiting briefly before retrying the opening voice.";
  } else if (prepStatus === "unavailable") {
    badgeLabel = "Voice unavailable";
    badgeClass = "border-amber-300 bg-amber-50 text-amber-950";
    title = "Hosted voices could not start right now";
    body =
      firstEntry?.errorMessage ??
      "Opening Kuromate audio is unavailable. Continue with timed captions or return to the form.";
  } else if (prepStatus === "cancelled") {
    badgeLabel = "Cancelled";
    badgeClass = "border-slate-300 bg-slate-100 text-slate-800";
    title = "Voice preparation paused";
    body = "Preparation stopped safely. Retry voices or return to the form.";
  }

  const progressLine =
    prepStatus === "ready"
      ? targetCount === 1
        ? "1 of 1 opening voice ready"
        : `${targetCount} of ${targetCount} opening voices ready`
      : prepStatus === "preparing" && snapshot.activePreparingTurnNumber !== null
        ? `Preparing voice ${snapshot.activePreparingTurnNumber} of ${targetCount} · ${readyCount} of ${targetCount} opening voices ready`
        : `${readyCount} of ${targetCount} opening voices ready`;

  return (
    <section
      aria-label="Audio preparation"
      className="rounded-2xl border border-slate-300 bg-white p-4 shadow-xs sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {prepStatus === "preparing" || prepStatus === "cooldown" ? (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 shrink-0 rounded-full bg-blue-700 animate-pulse motion-reduce:animate-none"
            />
          ) : (
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 shrink-0 rounded-full ${
                prepStatus === "ready"
                  ? "bg-emerald-600"
                  : prepStatus === "partial" || prepStatus === "unavailable"
                    ? "bg-amber-600"
                    : "bg-slate-500"
              }`}
            />
          )}
          <h3 className="text-base font-extrabold text-slate-950 sm:text-lg">{title}</h3>
        </div>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
          {badgeLabel}
        </span>
      </div>

      <p className="mt-1.5 text-sm text-slate-700 break-words">{body}</p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Kuromates in episode">
        {episode.hosts.map((host) => (
          <span
            key={host.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-800"
          >
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: host.accentColor }}
            />
            <span>{host.name}</span>
            <span className="capitalize text-slate-600">({host.role})</span>
          </span>
        ))}
      </div>

      <p
        role="status"
        aria-live="polite"
        className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold tabular-nums text-slate-900 sm:text-sm"
      >
        {progressLine}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        {prepStatus !== "partial" && prepStatus !== "unavailable" ? (
          <button
            type="button"
            disabled={!snapshot.canStartPodcast}
            onClick={onStartPodcast}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            Start podcast
          </button>
        ) : null}

        {prepStatus === "partial" ? (
          <button
            type="button"
            disabled={!snapshot.canStartPartialPodcast}
            onClick={onStartWithCaptionsAndAvailableAudio}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-700"
          >
            Start with captions and available audio
          </button>
        ) : null}

        {prepStatus === "unavailable" && firstIsRecoverable ? (
          <button
            type="button"
            disabled={snapshot.cooldownActive}
            onClick={onRetryPreparation}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:text-white"
          >
            {snapshot.cooldownActive
              ? `Retry available in ${cooldownSecs}s`
              : "Retry voice preparation"}
          </button>
        ) : null}

        {prepStatus === "cancelled" ? (
          <button
            type="button"
            onClick={onRetryPreparation}
            className="min-h-11 rounded-xl bg-blue-700 px-4 py-2 text-sm font-extrabold text-white hover:bg-blue-800"
          >
            Resume voice preparation
          </button>
        ) : null}

        {prepStatus === "cooldown" || prepStatus === "partial" || prepStatus === "unavailable" ? (
          <button
            type="button"
            onClick={onContinueWithTimedCaptions}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
          >
            Continue with timed captions
          </button>
        ) : null}

        <button
          type="button"
          onClick={onCancelAndEdit}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          {prepStatus === "unavailable" ? "Return to form" : "Cancel and edit"}
        </button>
      </div>
    </section>
  );
}
