import type { HostRole } from "@contracts/episode.schema";

/** Client-safe server-approved role style profile identifiers (no Gemini voice names). */
export const KUROMATE_PROFILE_IDS = [
  "kuromate_explainer_v1",
  "kuromate_learner_v1",
  "kuromate_skeptic_v1",
  "kuromate_storyteller_v1",
  "kuromate_specialist_v1",
  "kuromate_moderator_v1",
] as const;

export type KuromateProfileId = (typeof KUROMATE_PROFILE_IDS)[number];

export const ROLE_TO_PROFILE_ID: Readonly<Record<HostRole, KuromateProfileId>> = Object.freeze({
  explainer: "kuromate_explainer_v1",
  learner: "kuromate_learner_v1",
  skeptic: "kuromate_skeptic_v1",
  storyteller: "kuromate_storyteller_v1",
  specialist: "kuromate_specialist_v1",
  moderator: "kuromate_moderator_v1",
});

/** Client-safe server-approved stable Kuromate character/host voice identity IDs. */
export const KUROMATE_IDENTITY_PROFILE_IDS = [
  "kuromate_maya_v1",
  "kuromate_leo_v1",
  "kuromate_sam_v1",
  "kuromate_guest_01_v1",
  "kuromate_guest_02_v1",
  "kuromate_guest_03_v1",
] as const;

export type KuromateIdentityProfileId = (typeof KUROMATE_IDENTITY_PROFILE_IDS)[number];

export const GUEST_IDENTITY_PROFILE_IDS = [
  "kuromate_guest_01_v1",
  "kuromate_guest_02_v1",
  "kuromate_guest_03_v1",
] as const;

export function isApprovedIdentityProfileId(
  value: string,
): value is KuromateIdentityProfileId {
  return (KUROMATE_IDENTITY_PROFILE_IDS as readonly string[]).includes(value);
}

const CANONICAL_TOKEN_TO_IDENTITY: Readonly<Record<string, KuromateIdentityProfileId>> =
  Object.freeze({
    maya: "kuromate_maya_v1",
    leo: "kuromate_leo_v1",
    sam: "kuromate_sam_v1",
  });

function matchCanonicalToken(rawValue: string | null | undefined): KuromateIdentityProfileId | null {
  if (!rawValue) return null;
  const trimmed = rawValue.trim().toLowerCase();
  if (!trimmed) return null;
  if (CANONICAL_TOKEN_TO_IDENTITY[trimmed]) {
    return CANONICAL_TOKEN_TO_IDENTITY[trimmed];
  }
  const tokenMatch = /(?:^|[_-\s])(maya|leo|sam)(?:$|[_-\s]|0\d)/.exec(trimmed);
  if (tokenMatch) {
    return CANONICAL_TOKEN_TO_IDENTITY[tokenMatch[1]] ?? null;
  }
  const firstWord = /^([a-z]+)/.exec(trimmed)?.[1];
  if (firstWord && CANONICAL_TOKEN_TO_IDENTITY[firstWord]) {
    return CANONICAL_TOKEN_TO_IDENTITY[firstWord];
  }
  return null;
}

/**
 * Resolves a canonical Kuromate voice identity strictly from non-role host metadata
 * (`voiceId` -> `avatarId` -> `speakerId` -> `hostName`), returning null for unknown hosts.
 */
export function resolveCanonicalIdentityId(input: {
  voiceId?: string | null;
  avatarId?: string | null;
  speakerId?: string | null;
  hostName?: string | null;
}): KuromateIdentityProfileId | null {
  const explicitVoiceId = input.voiceId?.trim();
  if (explicitVoiceId && isApprovedIdentityProfileId(explicitVoiceId)) {
    return explicitVoiceId;
  }

  return (
    matchCanonicalToken(input.avatarId) ??
    matchCanonicalToken(input.speakerId) ??
    matchCanonicalToken(input.hostName) ??
    null
  );
}

function hashSeedFnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministically assigns an approved, collision-safe identity profile for unknown or
 * generated Kuromates using stable non-role identity seeds (`name` / `host.id`).
 */
export function resolveDeterministicUnknownIdentityId(
  seed: string,
  usedIds?: ReadonlySet<KuromateIdentityProfileId>,
): KuromateIdentityProfileId {
  const normalized = seed.trim().toLowerCase() || "guest";
  const hash = hashSeedFnv1a(normalized);
  const start = hash % GUEST_IDENTITY_PROFILE_IDS.length;

  for (let offset = 0; offset < GUEST_IDENTITY_PROFILE_IDS.length; offset += 1) {
    const candidate = GUEST_IDENTITY_PROFILE_IDS[(start + offset) % GUEST_IDENTITY_PROFILE_IDS.length];
    if (!usedIds || !usedIds.has(candidate)) {
      return candidate;
    }
  }

  for (let offset = 0; offset < KUROMATE_IDENTITY_PROFILE_IDS.length; offset += 1) {
    const candidate =
      KUROMATE_IDENTITY_PROFILE_IDS[(hash + offset) % KUROMATE_IDENTITY_PROFILE_IDS.length];
    if (!usedIds || !usedIds.has(candidate)) {
      return candidate;
    }
  }

  return GUEST_IDENTITY_PROFILE_IDS[start];
}

/**
 * Assigns stable, non-colliding voice identity IDs for all hosts in an episode so
 * Maya/Leo/Sam keep fixed voices and unknown hosts receive distinct deterministic identities.
 */
export function resolveEpisodeVoiceIdentities(
  hosts: ReadonlyArray<{
    id: string;
    name: string;
    voiceId?: string;
    avatarId?: string;
  }>,
): Map<string, KuromateIdentityProfileId> {
  const resolved = new Map<string, KuromateIdentityProfileId>();
  const used = new Set<KuromateIdentityProfileId>();
  const unresolved: Array<{ id: string; name: string }> = [];

  for (const host of hosts) {
    const canonical = resolveCanonicalIdentityId({
      voiceId: host.voiceId,
      avatarId: host.avatarId,
      speakerId: host.id,
      hostName: host.name,
    });
    if (canonical && !used.has(canonical)) {
      resolved.set(host.id, canonical);
      used.add(canonical);
    } else {
      unresolved.push(host);
    }
  }

  for (const host of unresolved) {
    const seed = host.name?.trim().toLowerCase() || host.id.trim().toLowerCase();
    const assigned = resolveDeterministicUnknownIdentityId(seed, used);
    resolved.set(host.id, assigned);
    used.add(assigned);
  }

  return resolved;
}
