export const MIN_COOLDOWN_MS = 1_000;
export const MAX_COOLDOWN_MS = 30_000;
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 8_000;

export function clampCooldownMs(rawMs: number): number {
  if (!Number.isFinite(rawMs)) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }
  return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(rawMs)));
}

/**
 * Parses HTTP Retry-After header (numeric seconds or HTTP-date) into bounded cooldown milliseconds.
 * Clamps between 1s and 30s to prevent tight loops or stalled sessions.
 */
export function parseRetryAfterMs(
  rawHeader: string | null | undefined,
  nowMs: number = Date.now(),
): number {
  if (!rawHeader) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }

  const trimmed = rawHeader.trim();
  if (!trimmed) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number.parseFloat(trimmed);
    return clampCooldownMs(seconds * 1000);
  }

  const parsedTimestamp = Date.parse(trimmed);
  if (Number.isFinite(parsedTimestamp)) {
    return clampCooldownMs(parsedTimestamp - nowMs);
  }

  return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
}
