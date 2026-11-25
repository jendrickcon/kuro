import { z } from "zod";

const nonEmptyTrimmed = (max: number) => z.string().trim().min(1).max(max);

export const INPUT_MIN_CHARS = 10;
export const INPUT_MAX_CHARS = 2500;

export const HostRoleSchema = z.enum(["explainer", "learner", "skeptic", "storyteller", "specialist", "moderator"]);
export type HostRole = z.infer<typeof HostRoleSchema>;

export const EmotionSchema = z.enum(["neutral", "curious", "explaining", "reacting"]);
export type Emotion = z.infer<typeof EmotionSchema>;

export const ToneSchema = z.enum(["casual", "serious"]);
export type Tone = z.infer<typeof ToneSchema>;

export const EpisodeLengthSchema = z.enum(["quick", "detailed"]);
export type EpisodeLength = z.infer<typeof EpisodeLengthSchema>;

export const EpisodeStatusSchema = z.enum(["mock", "generating", "ready", "failed"]);
export type EpisodeStatus = z.infer<typeof EpisodeStatusSchema>;

export const HostSchema = z.object({
  id: nonEmptyTrimmed(32).regex(/^[a-zA-Z0-9_-]+$/),
  name: nonEmptyTrimmed(20),
  role: HostRoleSchema,
  voiceId: nonEmptyTrimmed(64),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  avatarId: nonEmptyTrimmed(32).regex(/^[a-zA-Z0-9_-]+$/),
}).strict();
export type Host = z.infer<typeof HostSchema>;

export const ComparisonSideSchema = z.object({ label: nonEmptyTrimmed(24), value: nonEmptyTrimmed(60) }).strict();

export const ComparisonVisualCueSchema = z.object({
  type: z.literal("comparison"),
  title: nonEmptyTrimmed(48),
  left: ComparisonSideSchema,
  right: ComparisonSideSchema,
}).strict();

export const TimelinePointSchema = z.object({ label: nonEmptyTrimmed(20), description: nonEmptyTrimmed(70) }).strict();

export const TimelineVisualCueSchema = z.object({
  type: z.literal("timeline"),
  title: nonEmptyTrimmed(48),
  points: z.array(TimelinePointSchema).min(2).max(4),
}).strict();

export const ProcessStepSchema = z.object({ label: nonEmptyTrimmed(24), description: nonEmptyTrimmed(70) }).strict();

export const ProcessVisualCueSchema = z.object({
  type: z.literal("process"),
  title: nonEmptyTrimmed(48),
  steps: z.array(ProcessStepSchema).min(3).max(5),
}).strict();

export const FactCardVisualCueSchema = z.object({
  type: z.literal("fact-card"),
  title: nonEmptyTrimmed(40),
  value: nonEmptyTrimmed(24),
  explanation: nonEmptyTrimmed(110),
}).strict();

export const NoVisualCueSchema = z.object({ type: z.literal("none") }).strict();

export const VisualCueSchema = z.discriminatedUnion("type", [
  ComparisonVisualCueSchema,
  TimelineVisualCueSchema,
  ProcessVisualCueSchema,
  FactCardVisualCueSchema,
  NoVisualCueSchema,
]);
export type VisualCue = z.infer<typeof VisualCueSchema>;

export const AudioSegmentMetadataSchema = z.object({
  mimeType: nonEmptyTrimmed(64),
  container: nonEmptyTrimmed(32),
  codec: nonEmptyTrimmed(32).optional(),
  sampleRateHz: z.number().int().positive().optional(),
  bitDepth: z.number().int().positive().optional(),
  channels: z.number().int().min(1).max(2).optional(),
  byteLength: z.number().int().positive().optional(),
}).strict();
export type AudioSegmentMetadata = z.infer<typeof AudioSegmentMetadataSchema>;

export const CombinedAudioMetadataSchema = z.object({
  url: nonEmptyTrimmed(512),
  mimeType: nonEmptyTrimmed(64),
  durationMs: z.number().int().positive(),
  byteLength: z.number().int().positive(),
  stitchMethod: nonEmptyTrimmed(64),
}).strict();
export type CombinedAudioMetadata = z.infer<typeof CombinedAudioMetadataSchema>;

export const DialogueSegmentSchema = z.object({
  id: nonEmptyTrimmed(32).regex(/^[a-zA-Z0-9_-]+$/),
  order: z.number().int().nonnegative(),
  speakerId: nonEmptyTrimmed(32),
  text: nonEmptyTrimmed(320),
  emotion: EmotionSchema,
  visualCue: VisualCueSchema,
  audioUrl: nonEmptyTrimmed(512).optional(),
  durationMs: z.number().int().positive().max(120000).optional(),
  audioFormat: AudioSegmentMetadataSchema.optional(),
}).strict();
export type DialogueSegment = z.infer<typeof DialogueSegmentSchema>;

const isoDateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

export const EpisodeSchema = z.object({
  id: nonEmptyTrimmed(64),
  title: nonEmptyTrimmed(80),
  topic: nonEmptyTrimmed(INPUT_MAX_CHARS),
  tone: ToneSchema,
  length: EpisodeLengthSchema,
  status: EpisodeStatusSchema,
  hosts: z.array(HostSchema).min(2).max(3),
  segments: z.array(DialogueSegmentSchema).min(8).max(15),
  combinedAudioUrl: nonEmptyTrimmed(512).optional(),
  combinedAudio: CombinedAudioMetadataSchema.optional(),
  transcriptUrl: nonEmptyTrimmed(512).optional(),
  createdAt: z.string().regex(isoDateTimeRegex, "Must be ISO-8601 datetime"),
}).strict().superRefine((ep, ctx) => {
  const hostIds = new Set<string>();
  ep.hosts.forEach((h, i) => {
    if (hostIds.has(h.id)) ctx.addIssue({ code: "custom", path: ["hosts", i, "id"], message: `Duplicate host id: ${h.id}` });
    hostIds.add(h.id);
  });

  const minSegs = ep.length === "quick" ? 8 : 12;
  const maxSegs = ep.length === "quick" ? 10 : 15;
  if (ep.segments.length < minSegs || ep.segments.length > maxSegs) {
    ctx.addIssue({ code: "custom", path: ["segments"], message: `${ep.length} episodes require ${minSegs}-${maxSegs} segments (got ${ep.segments.length})` });
  }

  const segIds = new Set<string>();
  const spokenHostIds = new Set<string>();
  let meaningfulVisuals = 0;

  ep.segments.forEach((seg, i) => {
    if (segIds.has(seg.id)) ctx.addIssue({ code: "custom", path: ["segments", i, "id"], message: `Duplicate segment id: ${seg.id}` });
    segIds.add(seg.id);

    if (seg.order !== i) ctx.addIssue({ code: "custom", path: ["segments", i, "order"], message: `Expected contiguous order ${i}, got ${seg.order}` });

    if (!hostIds.has(seg.speakerId)) {
      ctx.addIssue({ code: "custom", path: ["segments", i, "speakerId"], message: `Unknown speakerId: ${seg.speakerId}` });
    } else {
      spokenHostIds.add(seg.speakerId);
    }

    if (seg.visualCue.type !== "none") {
      meaningfulVisuals += 1;
      if (i > 0 && ep.segments[i - 1].visualCue.type !== "none") {
        ctx.addIssue({ code: "custom", path: ["segments", i, "visualCue"], message: "Consecutive meaningful visual cues are not allowed" });
      }
    }
  });

  if (meaningfulVisuals > 3) {
    ctx.addIssue({ code: "custom", path: ["segments"], message: `At most 3 meaningful visual cues allowed (got ${meaningfulVisuals})` });
  }

  ep.hosts.forEach((h, i) => {
    if (!spokenHostIds.has(h.id)) ctx.addIssue({ code: "custom", path: ["hosts", i, "id"], message: `Host ${h.id} never speaks in segments` });
  });
});
export type Episode = z.infer<typeof EpisodeSchema>;

export const CreateEpisodeRequestSchema = z.object({
  input: z.string().trim().min(INPUT_MIN_CHARS).max(INPUT_MAX_CHARS),
  tone: ToneSchema.default("casual"),
  length: EpisodeLengthSchema.default("quick"),
  hostCount: z.union([z.literal(2), z.literal(3)]).default(2),
}).strict();
export type CreateEpisodeRequest = z.infer<typeof CreateEpisodeRequestSchema>;

export const ErrorCodeSchema = z.enum([
  "INVALID_INPUT",
  "SCRIPT_GENERATION_FAILED",
  "SCRIPT_VALIDATION_FAILED",
  "TTS_PARTIAL_FAILURE",
  "TTS_FAILED",
  "RATE_LIMITED",
  "AUDIO_STITCH_FAILED",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const CreateEpisodeErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: nonEmptyTrimmed(240),
  retryable: z.boolean(),
}).strict();
export type CreateEpisodeError = z.infer<typeof CreateEpisodeErrorSchema>;

export const CreateEpisodeSuccessSchema = z.object({ ok: z.literal(true), episode: EpisodeSchema }).strict();
export type CreateEpisodeSuccess = z.infer<typeof CreateEpisodeSuccessSchema>;

export const CreateEpisodeFailureSchema = z.object({
  ok: z.literal(false),
  error: CreateEpisodeErrorSchema,
  partialEpisode: EpisodeSchema.optional(),
}).strict();
export type CreateEpisodeFailure = z.infer<typeof CreateEpisodeFailureSchema>;

export const CreateEpisodeResponseSchema = z.discriminatedUnion("ok", [CreateEpisodeSuccessSchema, CreateEpisodeFailureSchema]);
export type CreateEpisodeResponse = z.infer<typeof CreateEpisodeResponseSchema>;
