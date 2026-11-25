import { EpisodeSchema, type Episode } from "@contracts/episode.schema";
import detailedThreeHostRaw from "@fixtures/episode.detailed.three-host.json";
import quickTwoHostRaw from "@fixtures/episode.quick.two-host.json";

export const QUICK_TWO_HOST_FIXTURE: Episode = EpisodeSchema.parse(quickTwoHostRaw);
export const DETAILED_THREE_HOST_FIXTURE: Episode = EpisodeSchema.parse(detailedThreeHostRaw);

/** Returns a validated mock fixture clone matching the requested host count. */
export function getFixtureByHostCount(hostCount: 2 | 3): Episode {
  const source = hostCount === 3 ? DETAILED_THREE_HOST_FIXTURE : QUICK_TWO_HOST_FIXTURE;
  return structuredClone(source);
}

/** Returns the default pre-generated sample episode for instant mock preview. */
export function getSampleEpisode(): Episode {
  return structuredClone(QUICK_TWO_HOST_FIXTURE);
}
