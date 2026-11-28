import { KuroAppShell } from "@/components/kuro/kuro-app-shell";
import { resolveTtsRequestIntervalMs } from "@/lib/tts/tts-pacing-config";

export default function HomePage() {
  const ttsRequestIntervalMs = resolveTtsRequestIntervalMs(
    process.env.KURO_TTS_REQUEST_INTERVAL_MS,
  );

  return <KuroAppShell ttsRequestIntervalMs={ttsRequestIntervalMs} />;
}
