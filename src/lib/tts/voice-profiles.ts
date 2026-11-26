import type { HostRole } from "@contracts/episode.schema";

/** Server-controlled Kuromate voice profile identifiers. */
export const KUROMATE_PROFILE_IDS = [
  "kuromate_explainer_v1",
  "kuromate_learner_v1",
  "kuromate_skeptic_v1",
  "kuromate_storyteller_v1",
  "kuromate_specialist_v1",
  "kuromate_moderator_v1",
] as const;

export type KuromateProfileId = (typeof KUROMATE_PROFILE_IDS)[number];

/** Allowlisted prebuilt Gemini TTS voices verified against v1beta voice catalog. */
export const ALLOWED_PREBUILT_VOICES = [
  "Sulafat",
  "Puck",
  "Kore",
  "Achird",
  "Sadaltager",
  "Erinome",
] as const;

export type AllowedPrebuiltVoice = (typeof ALLOWED_PREBUILT_VOICES)[number];

export interface KuromateVoiceProfile {
  readonly profileId: KuromateProfileId;
  readonly role: HostRole;
  readonly voice: AllowedPrebuiltVoice;
  readonly styleInstruction: string;
  readonly pace: string;
  readonly tone: string;
  readonly emphasisGuidance: string;
  readonly languageHint: string;
  readonly maxChars: number;
}

export const ROLE_TO_PROFILE_ID: Readonly<Record<HostRole, KuromateProfileId>> = Object.freeze({
  explainer: "kuromate_explainer_v1",
  learner: "kuromate_learner_v1",
  skeptic: "kuromate_skeptic_v1",
  storyteller: "kuromate_storyteller_v1",
  specialist: "kuromate_specialist_v1",
  moderator: "kuromate_moderator_v1",
});

/** Server-owned role-to-voice mappings keeping Kuromate roles distinct and grounded. */
export const KUROMATE_VOICE_PROFILES: Readonly<Record<HostRole, KuromateVoiceProfile>> = Object.freeze({
  explainer: Object.freeze({
    profileId: "kuromate_explainer_v1",
    role: "explainer",
    voice: "Sulafat",
    pace: "Measured and steady",
    tone: "Warm, clear, grounded, conversational",
    emphasisGuidance: "Light emphasis on core concepts with brief explanatory pauses; never announcer-like.",
    styleInstruction:
      "Warm, clear, measured, confident, conversational podcast co-host explaining concepts simply; never announcer-like; use brief natural pauses before key definitions.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  learner: Object.freeze({
    profileId: "kuromate_learner_v1",
    role: "learner",
    voice: "Puck",
    pace: "Slightly quicker, responsive",
    tone: "Curious, natural, approachable",
    emphasisGuidance: "Natural upward curiosity on genuine questions without exaggerated cheerfulness.",
    styleInstruction:
      "Curious, responsive, natural college-student co-host asking genuine questions at a slightly quicker conversational pace; avoid exaggerated cheerfulness or cartoonish energy.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  skeptic: Object.freeze({
    profileId: "kuromate_skeptic_v1",
    role: "skeptic",
    voice: "Kore",
    pace: "Deliberate with short thoughtful pauses",
    tone: "Direct, questioning, composed",
    emphasisGuidance: "Controlled emphasis on tradeoffs and caveats; distinct and probing without hostility.",
    styleInstruction:
      "Direct, questioning, thoughtful podcast co-host testing assumptions with controlled emphasis and short thoughtful pauses; sharp and distinct without sounding hostile.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  storyteller: Object.freeze({
    profileId: "kuromate_storyteller_v1",
    role: "storyteller",
    voice: "Achird",
    pace: "Varied, natural storytelling cadence",
    tone: "Warm, relatable, expressive",
    emphasisGuidance: "Gentle dramatic lift on everyday examples and turning points; never theatrical.",
    styleInstruction:
      "Warm, relatable podcast co-host sharing vivid everyday examples with gently varied pacing and light dramatic emphasis; never theatrical or cartoonish.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  specialist: Object.freeze({
    profileId: "kuromate_specialist_v1",
    role: "specialist",
    voice: "Sadaltager",
    pace: "Even and articulate",
    tone: "Precise, focused, calm technical confidence",
    emphasisGuidance: "Clear articulation on mechanisms and real-world nuances without jargon-heavy stiffness.",
    styleInstruction:
      "Precise, focused, approachable domain co-host speaking with calm confidence and clean articulation; keep explanations grounded rather than stiff or jargon-heavy.",
    languageHint: "en-US",
    maxChars: 320,
  }),
  moderator: Object.freeze({
    profileId: "kuromate_moderator_v1",
    role: "moderator",
    voice: "Erinome",
    pace: "Balanced and organized",
    tone: "Calm, neutral, structured",
    emphasisGuidance: "Clean transitional framing and light recap emphasis.",
    styleInstruction:
      "Neutral, organized, calm podcast host guiding smooth transitions between speakers with balanced pacing and crisp clarity.",
    languageHint: "en-US",
    maxChars: 320,
  }),
});

export function isApprovedProfileId(value: string): value is KuromateProfileId {
  return (KUROMATE_PROFILE_IDS as readonly string[]).includes(value);
}

/** Resolves an allowlisted server voice profile from a validated Kuromate role. */
export function resolveKuromateVoiceProfile(role: HostRole): KuromateVoiceProfile {
  return KUROMATE_VOICE_PROFILES[role];
}
