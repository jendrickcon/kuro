import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CreateEpisodeRequestSchema,
  CreateEpisodeResponseSchema,
  EpisodeSchema,
} from "../contracts/episode.schema.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const quick = EpisodeSchema.safeParse(loadJson("fixtures/episode.quick.two-host.json"));
check(quick.success, "valid quick two-host fixture passes");

const detailed = EpisodeSchema.safeParse(loadJson("fixtures/episode.detailed.three-host.json"));
check(detailed.success, "valid detailed three-host fixture passes");

const invalidHost = EpisodeSchema.safeParse(loadJson("fixtures/invalid/invalid-host-count.json"));
check(!invalidHost.success, "invalid host count fails");

const invalidSpeaker = EpisodeSchema.safeParse(loadJson("fixtures/invalid/invalid-speaker-reference.json"));
check(!invalidSpeaker.success, "invalid speaker reference fails");

const invalidVisual = EpisodeSchema.safeParse(loadJson("fixtures/invalid/invalid-visual-cue.json"));
check(!invalidVisual.success, "invalid visual cue fails");

check(!CreateEpisodeRequestSchema.safeParse({ input: "123456789" }).success, "9-character input fails");
check(CreateEpisodeRequestSchema.safeParse({ input: "1234567890" }).success, "10-character input passes");
check(CreateEpisodeRequestSchema.safeParse({ input: "a".repeat(2500) }).success, "2,500-character input passes");
check(!CreateEpisodeRequestSchema.safeParse({ input: "a".repeat(2501) }).success, "2,501-character input fails");
check(!CreateEpisodeRequestSchema.safeParse({ input: "Valid topic text", hostCount: 4 }).success, "hostCount 4 fails");

if (quick.success) {
  check(
    CreateEpisodeResponseSchema.safeParse({ ok: true, episode: quick.data }).success,
    "success response envelope passes",
  );
}

console.log(`Schema checks passed: ${passed}`);
