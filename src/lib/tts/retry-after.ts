export const MIN_COOLDOWN_MS = 1_000;
export const MAX_COOLDOWN_MS = 30_000;
export const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 8_000;
export const SHORT_COOLDOWN_MAX_SECONDS = 120;
export const MAX_REPORTED_RETRY_AFTER_SECONDS = 86_400;

export type TtsQuotaClass = "none" | "short_cooldown" | "long_quota_wait";

export interface ParsedRetryAfterClassification {
  quotaClass: "short_cooldown" | "long_quota_wait";
  rawSeconds: number | null;
  cooldownMs: number | null;
}

const DAILY_QUOTA_PATTERN = /\b(per\s+day|daily|rpd|requests?\s+per\s+day)\b/i;

export function clampCooldownMs(rawMs: number): number {
  if (!Number.isFinite(rawMs)) {
    return DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }
  return Math.min(MAX_COOLDOWN_MS, Math.max(MIN_COOLDOWN_MS, Math.round(rawMs)));
}

export function sanitizeRetryAfterSeconds(
  rawSeconds: number | null | undefined,
): number | undefined {
  if (typeof rawSeconds !== "number" || !Number.isFinite(rawSeconds) || rawSeconds <= 0) {
    return undefined;
  }
  return Math.min(MAX_REPORTED_RETRY_AFTER_SECONDS, Math.ceil(rawSeconds));
}

export function isDailyQuotaText(text: string | null | undefined): boolean {
  return Boolean(text && DAILY_QUOTA_PATTERN.test(text));
}

export function parseQuotaClassHeader(value: string | null | undefined): TtsQuotaClass {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "short_cooldown" || normalized === "long_quota_wait") {
    return normalized;
  }
  return "none";
}

/**
 * Parses HTTP Retry-After (numeric seconds or HTTP-date) into raw bounded seconds (0..86400)
 * without discarding long daily-quota wait windows (> 120s).
 */
export function parseRetryAfterRawSeconds(
  rawHeader: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!rawHeader) {
    return null;
  }

  const trimmed = rawHeader.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number.parseFloat(trimmed);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return 0;
    }
    return Math.min(MAX_REPORTED_RETRY_AFTER_SECONDS, Math.ceil(seconds));
  }

  const parsedTimestamp = Date.parse(trimmed);
  if (Number.isFinite(parsedTimestamp)) {
    const deltaSeconds = Math.ceil((parsedTimestamp - nowMs) / 1000);
    if (deltaSeconds <= 0) {
      return 0;
    }
    return Math.min(MAX_REPORTED_RETRY_AFTER_SECONDS, deltaSeconds);
  }

  return null;
}

/**
 * Distinguishes short temporary cooldowns (<= 120s) from daily/long quota exhaustion (> 120s)
 * so an 18-hour Retry-After is never collapsed into an 8-second loop or browser timer.
 */
export function classifyRetryAfter(
  rawHeader: string | null | undefined,
  options?: {
    nowMs?: number;
    errorText?: string | null;
    quotaClassHint?: TtsQuotaClass | null;
  },
): ParsedRetryAfterClassification {
  const nowMs = options?.nowMs ?? Date.now();
  const rawSeconds = parseRetryAfterRawSeconds(rawHeader, nowMs);

  if (
    options?.quotaClassHint === "long_quota_wait" ||
    (rawSeconds !== null && rawSeconds > SHORT_COOLDOWN_MAX_SECONDS) ||
    isDailyQuotaText(options?.errorText)
  ) {
    return {
      quotaClass: "long_quota_wait",
      rawSeconds,
      cooldownMs: null,
    };
  }

  return {
    quotaClass: "short_cooldown",
    rawSeconds,
    cooldownMs: parseRetryAfterMs(rawHeader, nowMs),
  };
}

/**
 * Parses HTTP Retry-After header (numeric seconds or HTTP-date) into bounded short cooldown ms.
 * Clamps between 1s and 30s to prevent tight loops during transient short bursts.
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
