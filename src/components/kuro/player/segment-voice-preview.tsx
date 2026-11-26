import type { DialogueSegment, Host } from "@contracts/episode.schema";
import type { SegmentTtsPreviewState } from "@/hooks/use-segment-tts-preview";

export interface SegmentVoicePreviewProps {
  activeHost: Host | undefined;
  segment: DialogueSegment;
  preview: SegmentTtsPreviewState;
}

function formatDurationSeconds(durationMs: number | null): string | null {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function SegmentVoicePreview({
  activeHost,
  segment,
  preview,
}: SegmentVoicePreviewProps) {
  const hostName = activeHost?.name ?? segment.speakerId;
  const hostRole = activeHost?.role ?? "explainer";
  const formattedDuration = formatDurationSeconds(preview.durationMs);

  return (
    <section
      aria-label="Kuromate voice preview"
      className="rounded-2xl border border-slate-300 bg-white p-3.5 shadow-xs sm:p-4"
    >
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold text-slate-950 sm:text-sm">
              {hostName}
            </span>
            <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-slate-800">
              {hostRole}
            </span>
            {preview.status === "playing" ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-950">
                Hosted Kuromate voice preview{formattedDuration ? ` · ${formattedDuration}` : ""}
              </span>
            ) : preview.status === "loading" ? (
              <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-950">
                Generating Kuromate voice…
              </span>
            ) : preview.status === "ready" ? (
              <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                Clip ready{formattedDuration ? ` · ${formattedDuration}` : ""}
              </span>
            ) : preview.status === "error" ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                Kuromate voice unavailable
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-700">
                Single-turn hosted voice preview
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {preview.status === "loading" ? (
            <>
              <button
                key="generating"
                type="button"
                disabled
                className="min-h-11 rounded-xl bg-slate-800 px-3.5 py-2 text-xs font-bold text-white opacity-75 sm:text-sm"
              >
                Generating voice…
              </button>
              <button
                key="stop"
                type="button"
                onClick={preview.stop}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Stop
              </button>
            </>
          ) : preview.status === "playing" ? (
            <>
              <button
                key="replay"
                type="button"
                onClick={() => {
                  void preview.replayClip();
                }}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Replay clip
              </button>
              <button
                key="stop"
                type="button"
                onClick={preview.stop}
                className="min-h-11 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 sm:text-sm"
              >
                Stop
              </button>
            </>
          ) : preview.status === "ready" ? (
            <>
              <button
                key="replay"
                type="button"
                onClick={() => {
                  void preview.replayClip();
                }}
                className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
              >
                Replay clip
              </button>
              <button
                key="stop"
                type="button"
                onClick={preview.stop}
                className="min-h-11 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-900 hover:bg-slate-50 sm:text-sm"
              >
                Stop
              </button>
            </>
          ) : preview.status === "error" ? (
            <button
              key="retry"
              type="button"
              onClick={() => {
                void preview.previewVoice();
              }}
              className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
            >
              Retry voice preview
            </button>
          ) : (
            <button
              key="preview"
              type="button"
              onClick={() => {
                void preview.previewVoice();
              }}
              className="min-h-11 rounded-xl bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 sm:text-sm"
            >
              Preview Kuromate voice
            </button>
          )}
        </div>
      </div>

      {preview.errorMessage ? (
        <p
          role="alert"
          className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold leading-snug text-amber-950"
        >
          {preview.errorMessage}
        </p>
      ) : null}
    </section>
  );
}
