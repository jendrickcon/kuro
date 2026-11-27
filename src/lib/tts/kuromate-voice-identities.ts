import type { HostRole } from "@contracts/episode.schema";
import type { AllowedDeepgramVoice } from "@/lib/tts/deepgram-tts-client";
import {
  resolveCanonicalIdentityId,
  resolveDeterministicUnknownIdentityId,
  type KuromateIdentityProfileId,
} from "@/lib/tts/kuromate-identity-ids";

/** Server-only allowlisted prebuilt Gemini TTS voices verified against v1beta catalog. */
export const ALLOWED_PREBUILT_VOICES = [
  "Sulafat",
  "Puck",
  "Kore",
  "Achird",
  "Sadaltager",
  "Erinome",
] as const;

export type AllowedPrebuiltVoice = (typeof ALLOWED_PREBUILT_VOICES)[number];

export interface KuromateIdentityProfile {
  readonly identityProfileId: KuromateIdentityProfileId;
  readonly canonicalKuromate: "maya" | "leo" | "sam" | null;
  readonly deepgramVoice: AllowedDeepgramVoice;
  readonly approvedVoice: AllowedPrebuiltVoice;
  readonly fallbackVoice: AllowedPrebuiltVoice;
}

/** Layer 1: Stable server-side identity-to-base-voice mapping independent of conversational role. */
export const KUROMATE_IDENTITY_PROFILES: Readonly<
  Record<KuromateIdentityProfileId, KuromateIdentityProfile>
> = Object.freeze({
  kuromate_maya_v1: Object.freeze({
    identityProfileId: "kuromate_maya_v1",
    canonicalKuromate: "maya",
    deepgramVoice: "aura-2-thalia-en",
    approvedVoice: "Sulafat",
    fallbackVoice: "Sulafat",
  }),
  kuromate_leo_v1: Object.freeze({
    identityProfileId: "kuromate_leo_v1",
    canonicalKuromate: "leo",
    deepgramVoice: "aura-2-aries-en",
    approvedVoice: "Puck",
    fallbackVoice: "Puck",
  }),
  kuromate_sam_v1: Object.freeze({
    identityProfileId: "kuromate_sam_v1",
    canonicalKuromate: "sam",
    deepgramVoice: "aura-2-orion-en",
    approvedVoice: "Kore",
    fallbackVoice: "Kore",
  }),
  kuromate_guest_01_v1: Object.freeze({
    identityProfileId: "kuromate_guest_01_v1",
    canonicalKuromate: null,
    deepgramVoice: "aura-2-athena-en",
    approvedVoice: "Achird",
    fallbackVoice: "Achird",
  }),
  kuromate_guest_02_v1: Object.freeze({
    identityProfileId: "kuromate_guest_02_v1",
    canonicalKuromate: null,
    deepgramVoice: "aura-2-arcas-en",
    approvedVoice: "Sadaltager",
    fallbackVoice: "Sadaltager",
  }),
  kuromate_guest_03_v1: Object.freeze({
    identityProfileId: "kuromate_guest_03_v1",
    canonicalKuromate: null,
    deepgramVoice: "aura-2-luna-en",
    approvedVoice: "Erinome",
    fallbackVoice: "Erinome",
  }),
});

/** Backwards-compatible fallback ONLY when a legacy caller omits all non-role identity metadata. */
const LEGACY_ROLE_DEFAULT_IDENTITY: Readonly<Record<HostRole, KuromateIdentityProfileId>> =
  Object.freeze({
    explainer: "kuromate_maya_v1",
    learner: "kuromate_leo_v1",
    skeptic: "kuromate_sam_v1",
    storyteller: "kuromate_guest_01_v1",
    specialist: "kuromate_guest_02_v1",
    moderator: "kuromate_guest_03_v1",
  });

/**
 * Resolves stable Kuromate Layer-1 base voice identity strictly prioritizing host identity over role:
 * 1. Explicit `voiceIdentityId`
 * 2. Approved `voiceId` (`kuromate_*_v1`)
 * 3. Canonical `avatarId` / `speakerId` / `hostName` (`Maya`, `Leo`, `Sam`)
 * 4. Deterministic hash of `hostName` (for generated/unknown Kuromates)
 * 5. Legacy role default only when caller provides no identity fields at all
 */
export function resolveKuromateIdentityProfile(input: {
  voiceIdentityId?: KuromateIdentityProfileId;
  voiceId?: string;
  avatarId?: string;
  speakerId: string;
  hostName?: string;
  role: HostRole;
}): KuromateIdentityProfile {
  if (input.voiceIdentityId && KUROMATE_IDENTITY_PROFILES[input.voiceIdentityId]) {
    return KUROMATE_IDENTITY_PROFILES[input.voiceIdentityId];
  }

  const canonicalId = resolveCanonicalIdentityId({
    voiceId: input.voiceId,
    avatarId: input.avatarId,
    speakerId: input.speakerId,
    hostName: input.hostName,
  });
  if (canonicalId) {
    return KUROMATE_IDENTITY_PROFILES[canonicalId];
  }

  const trimmedName = input.hostName?.trim();
  if (trimmedName) {
    const unknownId = resolveDeterministicUnknownIdentityId(trimmedName.toLowerCase());
    return KUROMATE_IDENTITY_PROFILES[unknownId];
  }

  return KUROMATE_IDENTITY_PROFILES[LEGACY_ROLE_DEFAULT_IDENTITY[input.role]];
}
