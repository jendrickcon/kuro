import { classifyGeminiTtsError, GeminiTtsError } from "@/lib/tts/gemini-tts-client";

/** Server-only hosted TTS client (native fetch, zero SDK, zero retries). Never imported by client code. */
const DEEPGRAM_SPEAK_URL = "https://api.deepgram.com/v1/speak";

export const DEEPGRAM_TTS_TIMEOUT_MS = 15_000;
export const DEEPGRAM_TTS_SAMPLE_RATE_HZ = 24_000;

/** Server-side allowlist of hosted voices; the browser can never select one. */
export const ALLOWED_DEEPGRAM_VOICES = [
  "aura-2-thalia-en",
  "aura-2-aries-en",
  "aura-2-orion-en",
  "aura-2-athena-en",
  "aura-2-arcas-en",
  "aura-2-luna-en",
] as const;

export type AllowedDeepgramVoice = (typeof ALLOWED_DEEPGRAM_VOICES)[number];

export function isAllowedDeepgramVoice(value: string): value is AllowedDeepgramVoice {
  return (ALLOWED_DEEPGRAM_VOICES as readonly string[]).includes(value);
}

export interface DeepgramTtsRequest {
  voice: string;
  text: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface DeepgramTtsRawAudio {
  /** Complete RIFF/WAVE bytes (24 kHz mono 16-bit PCM). */
  bytes: Buffer;
  mimeType: string;
}

export type DeepgramTtsTransport = (request: DeepgramTtsRequest) => Promise<DeepgramTtsRawAudio>;

/**
 * Prepends a deterministic 44-byte RIFF/WAVE header with exact sizes to raw 24 kHz mono 16-bit LE PCM,
 * so streamed placeholder sizes (0xFFFFFFFF) can never reach the WAV inspector.
 */
export function buildPcm16MonoWav(
  pcm: Buffer,
  sampleRateHz: number = DEEPGRAM_TTS_SAMPLE_RATE_HZ,
): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(sampleRateHz * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Maps an HTTP failure onto the shared typed error model without ever echoing the response body or URL. */
function classifyDeepgramHttpFailure(status: number, headers: Headers): GeminiTtsError {
  // Billing/credit problems are account failures, never capacity: they must not trigger a fallback switch.
  // Payload-shape rejections are plain invalid input.
  const mappedStatus = status === 402 ? 403 : [413, 415, 422].includes(status) ? 400 : status;
  return classifyGeminiTtsError({ status: mappedStatus, headers, message: `HTTP ${mappedStatus}` });
}

/** Creates the server-only transport: one attempt, `15_000` ms default timeout, no hidden retries. */
export function createDeepgramTtsTransport(apiKey: string): DeepgramTtsTransport {
  const trimmedKey = apiKey.trim();
  if (!trimmedKey) {
    throw new GeminiTtsError(
      "missing_key",
      "Hosted Kuromate voice preview is not configured on this server. Captions remain active.",
      false,
    );
  }

  return async (request: DeepgramTtsRequest): Promise<DeepgramTtsRawAudio> => {
    if (!isAllowedDeepgramVoice(request.voice)) {
      throw new GeminiTtsError(
        "unsupported_model",
        "Configured Kuromate voice is not supported on this server. Captions remain active.",
        false,
      );
    }
    if (request.signal?.aborted) {
      throw new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false);
    }

    const controller = new AbortController();
    let timedOut = false;
    let callerAborted = false;

    const onCallerAbort = () => {
      callerAborted = true;
      controller.abort();
    };
    request.signal?.addEventListener("abort", onCallerAbort, { once: true });

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeoutMs);

    const url =
      `${DEEPGRAM_SPEAK_URL}?model=${encodeURIComponent(request.voice)}` +
      `&encoding=linear16&container=none&sample_rate=${DEEPGRAM_TTS_SAMPLE_RATE_HZ}&mip_opt_out=true`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Token ${trimmedKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: request.text }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw classifyDeepgramHttpFailure(response.status, response.headers);
      }

      const raw = Buffer.from(await response.arrayBuffer());
      // 16-bit samples: drop a trailing odd byte so the declared data size stays sample-aligned.
      const pcm = raw.subarray(0, raw.length - (raw.length % 2));
      if (pcm.length === 0) {
        throw new GeminiTtsError(
          "empty_audio",
          "Hosted voice provider returned no audio for this segment. Captions remain active.",
          true,
        );
      }

      return { bytes: buildPcm16MonoWav(pcm), mimeType: "audio/wav" };
    } catch (error) {
      if (callerAborted) {
        throw new GeminiTtsError("client_aborted", "Voice preview request was cancelled.", false);
      }
      if (timedOut || controller.signal.aborted) {
        throw new GeminiTtsError(
          "timeout",
          "Kuromate voice generation took too long. Captions remain active—please try again.",
          true,
        );
      }
      if (error instanceof GeminiTtsError) {
        throw error;
      }
      // Network-level failure: keep the cause out of the message so no URL or header can leak.
      throw new GeminiTtsError(
        "unavailable",
        "Hosted Kuromate voice service is temporarily unavailable. Captions remain active—please try again.",
        true,
      );
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onCallerAbort);
    }
  };
}
