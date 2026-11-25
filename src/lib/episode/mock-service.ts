import {
  EpisodeSchema,
  type CreateEpisodeRequest,
  type Episode,
} from "@contracts/episode.schema";
import { getFixtureByHostCount } from "@/lib/episode/fixtures";

/**
 * Builds a schema-valid mock episode for WP-004 without calling external AI or TTS.
 * Keeps each fixture's segment length ("quick" vs "detailed") to honor EpisodeSchema bounds.
 */
export function createMockEpisode(request: CreateEpisodeRequest): Episode {
  const base = getFixtureByHostCount(request.hostCount);
  return EpisodeSchema.parse({
    ...base,
    topic: request.input,
    tone: request.tone,
    status: "mock",
    createdAt: new Date().toISOString(),
  });
}
