import type { HostRole } from "@contracts/episode.schema";
import type { AllowedDeepgramVoice } from "@/lib/tts/deepgram-tts-client";
import {
  KUROMATE_PROFILE_IDS,
  ROLE_TO_PROFILE_ID,
  type KuromateIdentityProfileId,
  type KuromateProfileId,
} from "@/lib/tts/kuromate-identity-ids";
import {
  ALLOWED_PREBUILT_VOICES,
  resolveKuromateIdentityProfile,
  type AllowedPrebuiltVoice,
  type KuromateIdentityProfile,
} from "@/lib/tts/kuromate-voice-identities";

export {
  ALLOWED_PREBUILT_VOICES,
  KUROMATE_PROFILE_IDS,
  ROLE_TO_PROFILE_ID,
  type AllowedPrebuiltVoice,
  type KuromateProfileId,
};

export interface KuromateRoleStyleProfile {
  readonly profileId: KuromateProfileId;
  readonly role: HostRole;
  readonly pace: string;
  readonly tone: string;
  readonly emphasisGuidance: string;
  readonly reactionBehavior: string;
  readonly styleInstruction: string;
  readonly languageHint: string;
  readonly maxChars: number;
}

export interface KuromateVoiceProfile extends KuromateRoleStyleProfile {
  readonly voice: AllowedPrebuiltVoice;
  /** Server-only allowlisted hosted voice for the primary provider; `voice` stays the fallback voice. */
  readonly deepgramVoice: AllowedDeepgramVoice;
}

export interface ResolvedKuromateTtsProfile extends KuromateVoiceProfile {
  readonly identityProfileId: KuromateIdentityProfileId;
  readonly canonicalKuromate: "maya" | "leo" | "sam" | null;
  readonly fallbackVoice: AllowedPrebuiltVoice;
  readonly identity: KuromateIdentityProfile;
}

/** Layer 2: Conversational role delivery style (tempo, tone, emphasis, reactions) decoupled from base voice. */
export const KUROMATE_VOICE_PROFILES: Readonly<Record<HostRole, KuromateVoiceProfile>> = Object.freeze({
  explainer: Object.freeze({
    profileId: "kuromate_explainer_v1",
    role: "explainer",
    voice: "Sulafat",
    deepgramVoice: "aura-2-thalia-en",
    pace: "Measured and steady",
    tone: "Warm, clear, grounded, conversational",
    emphasisGuidance: "Light emphasis on core concepts with brief explanatory pauses; never announcer-like.",
    reactionBehavior: "Acknowledge questions calmly before building the explanation step by step.",
    styleInstruction:
      "Warm, clear, measured, confident, conversational podcast co-host explaining concepts simply; never announcer-like; use brief natural pauses before key definitions.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  learner: Object.freeze({
    profileId: "kuromate_learner_v1",
    role: "learner",
    voice: "Puck",
    deepgramVoice: "aura-2-apollo-en",
    pace: "Slightly quicker, responsive",
    tone: "Curious, natural, approachable",
    emphasisGuidance: "Natural upward curiosity on genuine questions without exaggerated cheerfulness.",
    reactionBehavior: "Respond quickly with relatable student follow-ups and clarification checks.",
    styleInstruction:
      "Curious, responsive, natural college-student co-host asking genuine questions at a slightly quicker conversational pace; avoid exaggerated cheerfulness or cartoonish energy.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  skeptic: Object.freeze({
    profileId: "kuromate_skeptic_v1",
    role: "skeptic",
    voice: "Kore",
    deepgramVoice: "aura-2-orion-en",
    pace: "Deliberate with short thoughtful pauses",
    tone: "Direct, questioning, composed",
    emphasisGuidance: "Controlled emphasis on tradeoffs and caveats; distinct and probing without hostility.",
    reactionBehavior: "Test assumptions politely with grounded pushback and edge-case checks.",
    styleInstruction:
      "Direct, questioning, thoughtful podcast co-host testing assumptions with controlled emphasis and short thoughtful pauses; sharp and distinct without sounding hostile.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  storyteller: Object.freeze({
    profileId: "kuromate_storyteller_v1",
    role: "storyteller",
    voice: "Achird",
    deepgramVoice: "aura-2-athena-en",
    pace: "Varied, natural storytelling cadence",
    tone: "Warm, relatable, expressive",
    emphasisGuidance: "Gentle dramatic lift on everyday examples and turning points; never theatrical.",
    reactionBehavior: "Bridge abstract points into relatable real-world moments.",
    styleInstruction:
      "Warm, relatable podcast co-host sharing vivid everyday examples with gently varied pacing and light dramatic emphasis; never theatrical or cartoonish.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  specialist: Object.freeze({
    profileId: "kuromate_specialist_v1",
    role: "specialist",
    voice: "Sadaltager",
    deepgramVoice: "aura-2-arcas-en",
    pace: "Even and articulate",
    tone: "Precise, focused, calm technical confidence",
    emphasisGuidance: "Clear articulation on mechanisms and real-world nuances without jargon-heavy stiffness.",
    reactionBehavior: "Anchor discussion in exact mechanisms when nuance matters.",
    styleInstruction:
      "Precise, focused, approachable domain co-host speaking with calm confidence and clean articulation; keep explanations grounded rather than stiff or jargon-heavy.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  moderator: Object.freeze({
    profileId: "kuromate_moderator_v1",
    role: "moderator",
    voice: "Erinome",
    deepgramVoice: "aura-2-luna-en",
    pace: "Balanced and organized",
    tone: "Calm, neutral, structured",
    emphasisGuidance: "Clean transitional framing and light recap emphasis.",
    reactionBehavior: "Guide smooth transitions and recap competing perspectives concisely.",
    styleInstruction:
      "Neutral, organized, calm podcast host guiding smooth transitions between speakers with balanced pacing and crisp clarity.",
    languageHint: "en-US",
    maxChars: 320,
  }),
});

export function isApprovedProfileId(value: string): value is KuromateProfileId {
  return (KUROMATE_PROFILE_IDS as readonly string[]).includes(value);
}

/** Resolves Layer-2 role style guidance for the given conversational role. */
export function resolveKuromateVoiceProfile(role: HostRole): KuromateVoiceProfile {
  return KUROMATE_VOICE_PROFILES[role];
}

/**
 * Combines Layer 1 (stable Kuromate base voice identity) with Layer 2 (role delivery style),
 * ensuring role swaps never change Maya, Leo, Sam, or any host's base voice.
 */
export function resolveKuromateSynthesisProfile(input: {
  voiceIdentityId?: KuromateIdentityProfileId;
  voiceId?: string;
  avatarId?: string;
  speakerId: string;
  hostName?: string;
  role: HostRole;
}): ResolvedKuromateTtsProfile {
  const identity = resolveKuromateIdentityProfile(input);
  const roleStyle = resolveKuromateVoiceProfile(input.role);

  return {
    ...roleStyle,
    identityProfileId: identity.identityProfileId,
    canonicalKuromate: identity.canonicalKuromate,
    voice: identity.approvedVoice,
    fallbackVoice: identity.fallbackVoice,
    identity,
  };
}
