import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAliasTarget(specifier) {
  let rel = null;
  if (specifier.startsWith("@/")) {
    rel = path.join("src", specifier.slice(2));
  } else if (specifier.startsWith("@contracts/")) {
    rel = path.join("contracts", specifier.slice("@contracts/".length));
  } else if (specifier.startsWith("@fixtures/")) {
    rel = path.join("fixtures", specifier.slice("@fixtures/".length));
  }
  if (!rel) return null;
  for (const candidate of [rel, `${rel}.ts`, `${rel}.tsx`, path.join(rel, "index.ts")]) {
    const abs = path.join(root, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return pathToFileURL(abs).href;
    }
  }
  return null;
}

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = resolveAliasTarget(specifier);
    if (mapped) {
      return { url: mapped, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      return {
        format: "json",
        shortCircuit: true,
        source: fs.readFileSync(new URL(url), "utf8"),
      };
    }
    return nextLoad(url, context);
  },
});

const { CreateEpisodeRequestSchema, EpisodeSchema } = await import("../contracts/episode.schema.ts");
const { classifyGeminiError, GeminiProviderError } = await import("../src/lib/episode/gemini-client.ts");
const {
  generateGeminiEpisode,
  resolveGeminiModel,
  resolveGenerationMode,
} = await import("../src/lib/episode/gemini-service.ts");
const { createMockEpisode } = await import("../src/lib/episode/mock-service.ts");

let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

const twoHostDraft = (title = "Active Recall on the Bus") => ({
  title,
  hosts: [
    { id: "host_maya", name: "Maya", role: "explainer" },
    { id: "host_leo", name: "Leo", role: "learner" },
  ],
  segments: Array.from({ length: 8 }, (_, idx) => ({
    id: `seg_0${idx + 1}`,
    order: idx,
    speakerId: idx % 2 === 0 ? "host_maya" : "host_leo",
    text: `Turn ${idx + 1} explains active recall and retrieval practice for busy commuters.`,
    emotion: idx % 2 === 0 ? "explaining" : "curious",
    visualCue:
      idx === 2
        ? {
            type: "comparison",
            title: "Rereading vs Recall",
            left: { label: "Rereading", value: "Feels familiar without testing memory" },
            right: { label: "Active Recall", value: "Forces brain to retrieve concepts" },
          }
        : { type: "none" },
  })),
});

const threeHostDraft = () => ({
  title: "Spaced Repetition: Study Timing",
  hosts: [
    { id: "host_1", name: "Aria", role: "explainer" },
    { id: "host_2", name: "Devon", role: "learner" },
    { id: "host_3", name: "Nadia", role: "skeptic" },
  ],
  segments: Array.from({ length: 12 }, (_, idx) => ({
    id: `seg_${String(idx + 1).padStart(2, "0")}`,
    order: idx,
    speakerId: idx % 3 === 0 ? "host_1" : idx % 3 === 1 ? "host_2" : "host_3",
    text: `Turn ${idx + 1} breaks down spacing gaps, forgetting curves, and exam retention.`,
    emotion: idx % 3 === 2 ? "reacting" : idx % 3 === 0 ? "explaining" : "curious",
    visualCue:
      idx === 3
        ? {
            type: "fact-card",
            title: "Spacing Advantage",
            value: "3x Longer",
            explanation: "Spaced intervals beat single-night cramming for delayed recall.",
          }
        : { type: "none" },
  })),
});

// 1. Request validation checks
check(!CreateEpisodeRequestSchema.safeParse({ input: "short" }).success, "request <10 chars rejected");
check(!CreateEpisodeRequestSchema.safeParse({ input: "a".repeat(2501) }).success, "request >2500 chars rejected");
check(
  CreateEpisodeRequestSchema.safeParse({ input: "Explain spaced repetition", tone: "serious", length: "detailed", hostCount: 3 }).success,
  "valid 3-host detailed request passes",
);

// 2. Missing key fails explicitly with 503 and no silent mock fallback
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall for exams", tone: "casual", length: "quick", hostCount: 2 });
  const res = await generateGeminiEpisode(req, { apiKey: "" });
  check(res.httpStatus === 503 && res.response.ok === false && res.response.error.code === "SCRIPT_GENERATION_FAILED", "missing key returns 503 SCRIPT_GENERATION_FAILED without mock fallback");
}

// 3. Valid quick 2-host generation succeeds on attempt 1
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall on a bus", tone: "casual", length: "quick", hostCount: 2 });
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => JSON.stringify(twoHostDraft()),
  });
  check(
    res.httpStatus === 200 &&
      res.response.ok &&
      res.response.episode.status === "ready" &&
      res.response.episode.hosts.length === 2 &&
      res.response.episode.segments.length === 8 &&
      res.meta.attempts === 1 &&
      EpisodeSchema.safeParse(res.response.episode).success,
    "valid quick two-host generation succeeds on first attempt",
  );
}

// 4. Valid detailed 3-host generation succeeds
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain spaced repetition intervals", tone: "serious", length: "detailed", hostCount: 3 });
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => JSON.stringify(threeHostDraft()),
  });
  check(
    res.httpStatus === 200 &&
      res.response.ok &&
      res.response.episode.hosts.length === 3 &&
      res.response.episode.segments.length === 12 &&
      res.response.episode.hosts[2].name === "Nadia" &&
      EpisodeSchema.safeParse(res.response.episode).success,
    "valid detailed three-host generation supports custom Kuromate names and 12 turns",
  );
}

// 5. Invalid first response -> successful bounded repair (attempts === 2)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  let calls = 0;
  const badDraft = twoHostDraft();
  badDraft.segments[1].speakerId = "unknown_host";
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async (callReq) => {
      calls += 1;
      if (calls === 1) return JSON.stringify(badDraft);
      check(callReq.userPrompt.includes("unknown_host") || callReq.userPrompt.includes("Repair"), "repair prompt references prior draft issue");
      return `\`\`\`json\n${JSON.stringify(twoHostDraft())}\n\`\`\``;
    },
  });
  check(res.httpStatus === 200 && res.response.ok && res.meta.attempts === 2 && res.meta.retries === 1, "invalid first response repairs cleanly in 1 bounded retry");
}

// 6. Still invalid after repair -> 502 SCRIPT_VALIDATION_FAILED (capped at 2 calls)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  let calls = 0;
  const badDraft = twoHostDraft();
  badDraft.segments[0].speakerId = "nobody";
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => {
      calls += 1;
      return JSON.stringify(badDraft);
    },
  });
  check(
    calls === 2 &&
      res.httpStatus === 502 &&
      res.response.ok === false &&
      res.response.error.code === "SCRIPT_VALIDATION_FAILED",
    "persistent invalid script fails with 502 SCRIPT_VALIDATION_FAILED after max 2 attempts",
  );
}

// 7. Rate-limit error mapping (429 -> RATE_LIMITED)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => {
      throw classifyGeminiError({ status: 429, message: "secret_token_should_not_leak" });
    },
  });
  check(
    res.httpStatus === 429 &&
      res.response.ok === false &&
      res.response.error.code === "RATE_LIMITED" &&
      !res.response.error.message.includes("secret_token"),
    "rate limit maps cleanly to 429 RATE_LIMITED without leaking raw error text",
  );
}

// 8. Timeout error mapping (RequestTimeoutError -> 504 SCRIPT_GENERATION_FAILED)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => {
      const err = new Error("aborted");
      err.name = "RequestTimeoutError";
      throw classifyGeminiError(err);
    },
  });
  check(
    res.httpStatus === 504 &&
      res.response.ok === false &&
      res.response.error.code === "SCRIPT_GENERATION_FAILED",
    "timeout maps cleanly to 504 SCRIPT_GENERATION_FAILED",
  );
}

// 9. Empty response triggers retry and maps to 502 SCRIPT_GENERATION_FAILED if still empty
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  let calls = 0;
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    transport: async () => {
      calls += 1;
      throw new GeminiProviderError("empty_response", "Gemini returned an empty response.", true);
    },
  });
  check(calls === 2 && res.httpStatus === 502 && res.response.ok === false && res.response.error.code === "SCRIPT_GENERATION_FAILED", "empty response retries once and returns 502 SCRIPT_GENERATION_FAILED");
}

// 10. Generation mode, model resolution, and explicit mock marking
{
  check(resolveGenerationMode({}) === "live", "default generation mode is live");
  check(resolveGenerationMode({ KURO_GENERATION_MODE: "mock" }) === "mock", "explicit KURO_GENERATION_MODE=mock resolves mock");
  check(resolveGeminiModel({}) === "gemini-4-hydrogen", "default model resolves to verified gemini-4-hydrogen");
  const mockEp = createMockEpisode(CreateEpisodeRequestSchema.parse({ input: "Opportunity cost review", tone: "casual", length: "quick", hostCount: 2 }));
  check(mockEp.status === "mock", "mock service explicitly marks episode status as mock");
}

// 11. Client isolation scan
{
  const clientFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) clientFiles.push(full);
    }
  };
  walk(path.join(root, "src", "components"));
  walk(path.join(root, "src", "hooks"));
  clientFiles.push(path.join(root, "src", "app", "page.tsx"), path.join(root, "src", "app", "layout.tsx"));

  const forbidden = clientFiles.filter((file) => {
    const content = fs.readFileSync(file, "utf8");
    return (
      content.includes("GEMINI_API_KEY") ||
      content.includes("NEXT_PUBLIC_GEMINI") ||
      content.includes("@google/genai")
    );
  });
  check(forbidden.length === 0, "no client component/hook references GEMINI_API_KEY, NEXT_PUBLIC_GEMINI, or @google/genai");
}

console.log(`Generation checks passed: ${passed}`);
