import { z } from "zod";
import { HostRoleSchema } from "@contracts/episode.schema";
import { KUROMATE_PROFILE_IDS, ROLE_TO_PROFILE_ID } from "@/lib/tts/voice-profiles";

/** Matches DialogueSegmentSchema max length so TTS never loosens script bounds. */
export const TTS_MAX_TEXT_CHARS = 320;
export const TTS_MAX_REQUEST_BODY_BYTES = 4096;
export const TTS_MAX_AUDIO_BYTES = 5 * 1024 * 1024;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^[a-zA-Z0-9_-]+$/);

export const KuromateProfileIdSchema = z.enum(KUROMATE_PROFILE_IDS);

/** Strictly allowlisted single-segment TTS request; rejects arbitrary voices, models, styles, URLs, and keys. */
export const GenerateTtsRequestSchema = z
  .object({
    segmentId: identifierSchema,
    speakerId: identifierSchema,
    role: HostRoleSchema,
    profileId: KuromateProfileIdSchema.optional(),
    text: z.string().trim().min(1).max(TTS_MAX_TEXT_CHARS),
  })
  .strict()
  .superRefine((req, ctx) => {
    if (req.profileId && ROLE_TO_PROFILE_ID[req.role] !== req.profileId) {
      ctx.addIssue({
        code: "custom",
        path: ["profileId"],
        message: "Profile ID does not match requested Kuromate role.",
      });
    }
  });

export type GenerateTtsRequest = z.infer<typeof GenerateTtsRequestSchema>;

export const TtsErrorCodeSchema = z.enum([
  "INVALID_TTS_INPUT",
  "TTS_NOT_CONFIGURED",
  "TTS_RATE_LIMITED",
  "TTS_TIMEOUT",
  "TTS_PROVIDER_UNAVAILABLE",
  "TTS_AUDIO_INVALID",
  "TTS_GENERATION_FAILED",
  "INTERNAL_ERROR",
]);

export type TtsErrorCode = z.infer<typeof TtsErrorCodeSchema>;

export const GenerateTtsFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: TtsErrorCodeSchema,
        message: z.string().trim().min(1).max(240),
        retryable: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type GenerateTtsFailure = z.infer<typeof GenerateTtsFailureSchema>;

export interface TtsSuccessMetadata {
  segmentId: string;
  speakerId: string;
  profileId: string;
  contentType: string;
  container: string;
  byteLength: number;
  durationMs?: number;
}
