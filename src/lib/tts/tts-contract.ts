import { z } from "zod";
import { HostRoleSchema } from "@contracts/episode.schema";
import {
  isApprovedIdentityProfileId,
  KUROMATE_IDENTITY_PROFILE_IDS,
  KUROMATE_PROFILE_IDS,
  ROLE_TO_PROFILE_ID,
} from "@/lib/tts/kuromate-identity-ids";
import type { TtsQuotaClass } from "@/lib/tts/retry-after";

export type { TtsQuotaClass };

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

const hostVoiceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^(?:kuromate_(?:maya|leo|sam|guest_0[1-3])_v1|voice_provisional_[a-z]+_0[1-9])$/,
  );

const hostAvatarIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(/^avatar_[a-zA-Z0-9_-]+$/);

const hostDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[a-zA-Z0-9 .'-]+$/);

export const KuromateProfileIdSchema = z.enum(KUROMATE_PROFILE_IDS);
export const KuromateIdentityProfileIdSchema = z.enum(KUROMATE_IDENTITY_PROFILE_IDS);

export const TtsRoutePreferenceSchema = z.enum(["primary", "fallback"]);
export type TtsRoutePreference = z.infer<typeof TtsRoutePreferenceSchema>;

export const TtsQuotaClassSchema = z.enum(["none", "short_cooldown", "long_quota_wait"]);

export const HostedTtsHealthStateSchema = z.enum([
  "primary_available",
  "fallback_active",
  "partial_hosted_available",
  "all_hosted_daily_exhausted",
  "hosted_unavailable",
  "captions_only",
]);
export type HostedTtsHealthState = z.infer<typeof HostedTtsHealthStateSchema>;

/**
 * Strictly allowlisted single-segment TTS request accepting validated Episode host identity fields
 * while rejecting arbitrary provider voices, models, styles, URLs, and keys.
 */
export const GenerateTtsRequestSchema = z
  .object({
    segmentId: identifierSchema,
    speakerId: identifierSchema,
    role: HostRoleSchema,
    profileId: KuromateProfileIdSchema.optional(),
    voiceIdentityId: KuromateIdentityProfileIdSchema.optional(),
    voiceId: hostVoiceIdSchema.optional(),
    avatarId: hostAvatarIdSchema.optional(),
    hostName: hostDisplayNameSchema.optional(),
    routePreference: TtsRoutePreferenceSchema.optional(),
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
    if (
      req.voiceIdentityId &&
      req.voiceId &&
      isApprovedIdentityProfileId(req.voiceId) &&
      req.voiceIdentityId !== req.voiceId
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["voiceIdentityId"],
        message: "Voice identity ID does not match host voice metadata.",
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
        quotaClass: TtsQuotaClassSchema.optional(),
        hostedState: HostedTtsHealthStateSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type GenerateTtsFailure = z.infer<typeof GenerateTtsFailureSchema>;

export interface TtsSuccessMetadata {
  segmentId: string;
  speakerId: string;
  profileId: string;
  voiceIdentityId: string;
  contentType: string;
  container: string;
  byteLength: number;
  durationMs?: number;
}
