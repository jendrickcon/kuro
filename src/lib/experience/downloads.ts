import type { Episode } from "@contracts/episode.schema";
import { buildTranscriptFilename, buildTranscriptText } from "@/lib/episode/transcript";
import type {
  EpisodeBatchCompilerController,
  EpisodeBatchCompilerSnapshot,
} from "@/lib/tts/episode-batch-compiler";

export function canDownloadEpisodeWav(
  snapshot: EpisodeBatchCompilerSnapshot | null | undefined,
): boolean {
  return Boolean(
    snapshot && !snapshot.isSamplePreview && snapshot.canDownloadAudio && snapshot.fullAudioUrl,
  );
}

export function canDownloadEpisodeTranscript(episode: Episode | null | undefined): boolean {
  return Boolean(episode && episode.segments.length > 0);
}

/** Triggers a client download for a verified, 100%-compiled WAV blob without refetching TTS. */
export function downloadCompiledEpisodeWav(
  controller: Pick<EpisodeBatchCompilerController, "getSnapshot" | "getFullWavBlob">,
): { filename: string } | null {
  const snap = controller.getSnapshot();
  const blob = controller.getFullWavBlob();
  if (!canDownloadEpisodeWav(snap) || !blob || !snap.fullAudioUrl) {
    return null;
  }
  const link = document.createElement("a");
  link.href = snap.fullAudioUrl;
  link.download = snap.downloadFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return { filename: snap.downloadFilename };
}

/** Downloads an episode transcript and schedules exact-once object URL cleanup. */
export function downloadEpisodeTranscriptFile(episode: Episode): {
  filename: string;
  dispose: () => void;
} {
  const text = buildTranscriptText(episode);
  const filename = buildTranscriptFilename(episode);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  let revoked = false;
  const dispose = () => {
    if (!revoked) {
      revoked = true;
      URL.revokeObjectURL(objectUrl);
    }
  };
  const timerId = window.setTimeout(dispose, 1000);

  return {
    filename,
    dispose: () => {
      window.clearTimeout(timerId);
      dispose();
    },
  };
}
