/**
 * Locked sequential TTS pacing & buffering configuration for WP-011 production stability.
 * Prevents rolling quota bursts without allowing arbitrary browser overrides.
 */
export const MAX_TTS_CONCURRENCY = 1;
export const MIN_TTS_REQUEST_INTERVAL_MS = 1_500;
export const ALLOWED_TTS_REQUEST_INTERVAL_MIN_MS = 1_000;
export const ALLOWED_TTS_REQUEST_INTERVAL_MAX_MS = 5_000;
export const INITIAL_AUDIO_BUFFER_SIZE = 2;
export const PREFETCH_LOOKAHEAD = 2;
export const MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT = 1;
export const RATE_LIMIT_COOLDOWN_MIN_MS = 1_000;
export const RATE_LIMIT_COOLDOWN_MAX_MS = 30_000;

/**
 * Resolves and clamps server-side pacing interval (ms) from env or config input.
 * Invalid values fail closed to the locked 1,500 ms production default.
 */
export function resolveTtsRequestIntervalMs(rawValue: string | number | undefined | null): number {
  if (rawValue === undefined || rawValue === null) {
    return MIN_TTS_REQUEST_INTERVAL_MS;
  }

  let numericValue: number;
  if (typeof rawValue === "number") {
    numericValue = rawValue;
  } else {
    const trimmed = rawValue.trim();
    if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
      return MIN_TTS_REQUEST_INTERVAL_MS;
    }
    numericValue = Number.parseFloat(trimmed);
  }

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return MIN_TTS_REQUEST_INTERVAL_MS;
  }

  return Math.min(
    ALLOWED_TTS_REQUEST_INTERVAL_MAX_MS,
    Math.max(ALLOWED_TTS_REQUEST_INTERVAL_MIN_MS, Math.round(numericValue)),
  );
}
