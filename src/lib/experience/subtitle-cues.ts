import type { DialogueSegment } from "@contracts/episode.schema";
import { getSegmentDurationMs } from "@/hooks/use-episode-playback";
import type { CompiledTimelineSegment } from "@/lib/tts/wav-stitcher";

export interface SubtitleCue {
  index: number;
  text: string;
  lines: [string] | [string, string];
  wordCount: number;
  startMs: number;
  endMs: number;
}

export interface SegmentTimingInput {
  segment: DialogueSegment;
  activeSegmentIndex: number;
  isSamplePreview: boolean;
  elapsedMs: number;
  timeline: readonly CompiledTimelineSegment[];
  sampleIntraElapsedMs: number;
}

export interface SegmentTimingWindow {
  intraElapsedMs: number;
  durationMs: number;
}

const STRONG_END_RE = /[.?!]["”’)\]]*$/;
const CLAUSE_END_RE = /[,;:\u2014\u2013]["”’)\]]*$/;
const CONJUNCTION_START_RE =
  /^(?:and|but|so|or|because|which|while|when|unless|instead|that|where)$/i;
const HANGING_PREV_RE =
  /^(?:a|an|the|to|of|in|on|for|with|at|by|my|your|his|her|its|our|their)$/i;

const SINGLE_CUE_MAX_WORDS = 11;
const SINGLE_CUE_MAX_CHARS = 74;
const TARGET_LINE_CHARS = 38;
const HARD_LINE_CHARS = 42;
const MIN_CUE_MS = 1200;

function normalizeWord(word: string): string {
  return word.replace(/^["“‘(\[]+|["”’)\],.;:!?]+$/g, "");
}

function endsWithDashJoin(token: string): boolean {
  return /[\u2014\u2013-]$/.test(token) && token.length > 1;
}

/**
 * Splits a cue's words into 1 or 2 readable subtitle lines without splitting or dropping words.
 */
export function wrapCueLines(
  words: readonly string[],
  maxLineChars = TARGET_LINE_CHARS,
): [string] | [string, string] {
  if (words.length <= 1) {
    return [words[0] ?? ""];
  }
  const single = words.join(" ");
  if (single.length <= maxLineChars) {
    return [single];
  }

  let bestScore = Number.POSITIVE_INFINITY;
  let bestSplit = Math.ceil(words.length / 2);

  for (let k = 1; k < words.length; k += 1) {
    const line1 = words.slice(0, k).join(" ");
    const line2 = words.slice(k).join(" ");
    let score = Math.abs(line1.length - line2.length);

    if (line1.length > HARD_LINE_CHARS) {
      score += 1000 * (line1.length - HARD_LINE_CHARS);
    }
    if (line2.length > HARD_LINE_CHARS) {
      score += 1000 * (line2.length - HARD_LINE_CHARS);
    }
    if (words.length >= 4 && (k === 1 || words.length - k === 1)) {
      score += 140;
    }

    const leftWord = words[k - 1];
    if (STRONG_END_RE.test(leftWord) || CLAUSE_END_RE.test(leftWord) || endsWithDashJoin(leftWord)) {
      score -= 28;
    }
    if (HANGING_PREV_RE.test(normalizeWord(leftWord))) {
      score += 18;
    }

    if (score < bestScore) {
      bestScore = score;
      bestSplit = k;
    }
  }

  return [words.slice(0, bestSplit).join(" "), words.slice(bestSplit).join(" ")];
}

function scoreWordRangeCost(
  tokens: readonly string[],
  start: number,
  end: number,
  isFinalCue: boolean,
): number {
  const count = end - start;
  const slice = tokens.slice(start, end);
  const text = slice.join(" ");
  const chars = text.length;

  let cost = 20;

  if (count >= 5 && count <= 10) {
    cost += 0;
  } else if (count === 11) {
    cost += 12;
  } else if (count === 4) {
    cost += 22;
  } else if (count === 3) {
    cost += 65;
  } else if (count === 2) {
    cost += 140;
  } else if (count === 1) {
    cost += 400;
  } else {
    cost += 70 + (count - 12) * 35;
  }

  if (chars > 76) {
    cost += (chars - 76) * 8;
  }

  const wrapped = wrapCueLines(slice);
  for (const line of wrapped) {
    if (line.length > HARD_LINE_CHARS) {
      cost += (line.length - HARD_LINE_CHARS) * 10;
    }
  }
  if (wrapped.length === 2 && count >= 4) {
    const w1 = wrapped[0].split(" ").length;
    const w2 = wrapped[1].split(" ").length;
    if (w1 === 1 || w2 === 1) {
      cost += 40;
    }
  }

  if (!isFinalCue) {
    const prevToken = tokens[end - 1];
    const nextToken = tokens[end] ?? "";
    if (STRONG_END_RE.test(prevToken)) {
      cost -= 55;
    } else if (CLAUSE_END_RE.test(prevToken) || endsWithDashJoin(prevToken)) {
      cost -= 35;
    }
    if (CONJUNCTION_START_RE.test(normalizeWord(nextToken))) {
      cost -= 14;
    }
    if (HANGING_PREV_RE.test(normalizeWord(prevToken))) {
      cost += 28;
    }
  }

  return cost;
}

/**
 * Deterministically partitions a dialogue turn into readable 1–2 line subtitle cues
 * covering `0..durationMs` proportionally while preserving every word in exact order.
 */
export function buildSubtitleCues(text: string, durationMs: number): SubtitleCue[] {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return [];
  }

  const safeDurationMs = Math.max(1, Math.round(Number.isFinite(durationMs) ? durationMs : 1));
  const fullText = tokens.join(" ");

  if (tokens.length <= SINGLE_CUE_MAX_WORDS && fullText.length <= SINGLE_CUE_MAX_CHARS) {
    return [
      {
        index: 0,
        text: fullText,
        lines: wrapCueLines(tokens),
        wordCount: tokens.length,
        startMs: 0,
        endMs: safeDurationMs,
      },
    ];
  }

  const n = tokens.length;
  const dp = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY);
  const nextIndex = new Array<number>(n + 1).fill(n);
  dp[n] = 0;

  for (let i = n - 1; i >= 0; i -= 1) {
    let charAccum = 0;
    const maxEnd = Math.min(n, i + 12);
    for (let j = i + 1; j <= maxEnd; j += 1) {
      charAccum += (j > i + 1 ? 1 : 0) + tokens[j - 1].length;
      if (charAccum > 84 && j - i > 1) {
        break;
      }
      const stepCost = scoreWordRangeCost(tokens, i, j, j === n);
      const total = stepCost + dp[j];
      if (total < dp[i]) {
        dp[i] = total;
        nextIndex[i] = j;
      }
    }

    if (!Number.isFinite(dp[i])) {
      dp[i] = dp[i + 1] + 500;
      nextIndex[i] = i + 1;
    }
  }

  const rawGroups: string[][] = [];
  let cursor = 0;
  while (cursor < n) {
    const end = Math.max(cursor + 1, nextIndex[cursor]);
    rawGroups.push(tokens.slice(cursor, end));
    cursor = end;
  }

  const cueCount = rawGroups.length;
  const weights = rawGroups.map((words) => Math.max(1, words.join(" ").length + words.length * 2));
  const totalWeight = weights.reduce((acc, value) => acc + value, 0);
  const minCueMs = cueCount === 1 ? safeDurationMs : Math.min(MIN_CUE_MS, Math.floor(safeDurationMs / cueCount));
  const distributableMs = Math.max(0, safeDurationMs - minCueMs * cueCount);

  let msCursor = 0;
  return rawGroups.map((words, idx) => {
    const cueText = words.join(" ");
    const startMs = msCursor;
    const isLast = idx === cueCount - 1;
    const allocatedMs = isLast
      ? Math.max(1, safeDurationMs - startMs)
      : Math.max(1, minCueMs + Math.round((weights[idx] / totalWeight) * distributableMs));
    const maxAllowedEnd = isLast ? safeDurationMs : safeDurationMs - (cueCount - 1 - idx);
    const endMs = Math.max(startMs + 1, Math.min(maxAllowedEnd, startMs + allocatedMs));
    msCursor = endMs;

    return {
      index: idx,
      text: cueText,
      lines: wrapCueLines(words),
      wordCount: words.length,
      startMs,
      endMs,
    };
  });
}

/** Selects the active cue matching intra-segment elapsed milliseconds. */
export function resolveActiveSubtitleCue(
  cues: readonly SubtitleCue[],
  intraElapsedMs: number,
): SubtitleCue | null {
  if (cues.length === 0) {
    return null;
  }
  const t = Math.max(0, intraElapsedMs);
  for (let i = 0; i < cues.length; i += 1) {
    if (t < cues[i].endMs) {
      return cues[i];
    }
  }
  return cues[cues.length - 1];
}

/** Resolves intra-segment elapsed time & duration for both hosted WAV playback and Sample Preview. */
export function resolveSegmentTimingWindow(input: SegmentTimingInput): SegmentTimingWindow {
  const {
    segment,
    activeSegmentIndex,
    isSamplePreview,
    elapsedMs,
    timeline,
    sampleIntraElapsedMs,
  } = input;

  if (isSamplePreview) {
    const durationMs = getSegmentDurationMs(segment);
    const intraElapsedMs = Math.max(0, Math.min(durationMs, Math.round(sampleIntraElapsedMs)));
    return { intraElapsedMs, durationMs };
  }

  const compiledSegment = timeline[activeSegmentIndex];
  if (compiledSegment) {
    const rawDuration =
      compiledSegment.speechDurationMs > 0
        ? compiledSegment.speechDurationMs
        : compiledSegment.endMs - compiledSegment.startMs;
    const durationMs = Math.max(1, Math.round(rawDuration));
    const intraElapsedMs = Math.max(
      0,
      Math.min(durationMs, Math.round(elapsedMs - compiledSegment.speechStartMs)),
    );
    return { intraElapsedMs, durationMs };
  }

  return {
    intraElapsedMs: 0,
    durationMs: getSegmentDurationMs(segment),
  };
}
