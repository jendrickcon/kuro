import type { Episode } from "@contracts/episode.schema";

/** Builds a clean plain-text transcript ordered by dialogue turn. */
export function buildTranscriptText(episode: Episode): string {
  const hostMap = new Map(episode.hosts.map((host) => [host.id, host]));
  const lines: string[] = [
    "Kuro — More voices. Clearer ideas.",
    `Title: ${episode.title}`,
    `Topic: ${episode.topic}`,
    `Tone: ${episode.tone} | Length: ${episode.length} | Hosts: ${episode.hosts.length} | Turns: ${episode.segments.length}`,
    "",
    "Hosts:",
    ...episode.hosts.map((host) => `- ${host.name} (${host.role})`),
    "",
    "Conversation:",
    ...episode.segments.map((segment, index) => {
      const host = hostMap.get(segment.speakerId);
      const speakerLabel = host ? `${host.name} (${host.role})` : "Host";
      return `${index + 1}. ${speakerLabel}: ${segment.text}`;
    }),
    "",
  ];
  return lines.join("\n");
}

/** Creates a filesystem-safe transcript filename derived from episode title or ID. */
export function buildTranscriptFilename(episode: Episode): string {
  const slugify = (raw: string) =>
    raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48)
      .replace(/-+$/g, "");

  const base = slugify(episode.title) || slugify(episode.id) || "kuro-episode";
  return `${base}-transcript.txt`;
}
