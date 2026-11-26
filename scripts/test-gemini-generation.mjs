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
const {
  classifyGeminiError,
  FALLBACK_GEMINI_TEXT_MODEL,
  GeminiProviderError,
  PRIMARY_GEMINI_TEXT_MODEL,
} = await import("../src/lib/episode/gemini-client.ts");
const { buildGeminiEpisodeJsonSchema } = await import("../src/lib/episode/gemini-prompt.ts");
const {
  assembleEpisodeCandidate,
  generateGeminiEpisode,
  MAX_MODEL_CHOICES,
  MAX_MODEL_SWITCHES,
  MAX_PROVIDER_ATTEMPTS,
  MAX_REPAIR_ATTEMPTS,
  resolveGeminiFallbackModel,
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
  const res = await generateGeminiEpisode(req, { apiKey: "", env: {} });
  check(
    res.httpStatus === 503 &&
      res.response.ok === false &&
      res.response.error.code === "SCRIPT_GENERATION_FAILED" &&
      res.meta.providerAttempts === 0 &&
      res.meta.fallbackUsed === false,
    "missing key returns 503 SCRIPT_GENERATION_FAILED without mock fallback",
  );
}

// 3. Primary model success -> no fallback (2-host quick & 3-host detailed)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall on a bus", tone: "casual", length: "quick", hostCount: 2 });
  const modelsCalled = [];
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      modelsCalled.push(callReq.model);
      return JSON.stringify(twoHostDraft());
    },
  });
  check(
    res.httpStatus === 200 &&
      res.response.ok &&
      res.response.episode.status === "ready" &&
      res.response.episode.hosts.length === 2 &&
      res.response.episode.segments.length === 8 &&
      res.meta.requestedModel === PRIMARY_GEMINI_TEXT_MODEL &&
      res.meta.resolvedModel === PRIMARY_GEMINI_TEXT_MODEL &&
      res.meta.fallbackUsed === false &&
      res.meta.providerAttempts === 1 &&
      res.meta.repairAttempts === 0 &&
      modelsCalled.length === 1 &&
      EpisodeSchema.safeParse(res.response.episode).success,
    "primary model success uses no fallback",
  );

  const req3 = CreateEpisodeRequestSchema.parse({ input: "Explain spaced repetition intervals", tone: "serious", length: "detailed", hostCount: 3 });
  const res3 = await generateGeminiEpisode(req3, {
    apiKey: "test-key",
    env: {},
    transport: async () => JSON.stringify(threeHostDraft()),
  });
  check(
    res3.httpStatus === 200 &&
      res3.response.ok &&
      res3.response.episode.hosts.length === 3 &&
      res3.response.episode.segments.length === 12 &&
      res3.response.episode.hosts[2].name === "Nadia" &&
      EpisodeSchema.safeParse(res3.response.episode).success,
    "valid detailed three-host generation supports custom Kuromate names and 12 turns",
  );
}

// 4. Primary 503 -> automatic fallback to gemini-3.5-flash-lite with identical contract
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain opportunity cost cleanly", tone: "casual", length: "quick", hostCount: 2 });
  const seenRequests = [];
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      seenRequests.push(callReq);
      if (callReq.model === PRIMARY_GEMINI_TEXT_MODEL) {
        throw classifyGeminiError({ status: 503, message: "503 service unavailable" });
      }
      return JSON.stringify(twoHostDraft("Fallback Opportunity Cost"));
    },
  });
  const sameContract =
    seenRequests.length === 2 &&
    seenRequests[0].systemInstruction === seenRequests[1].systemInstruction &&
    seenRequests[0].userPrompt === seenRequests[1].userPrompt &&
    JSON.stringify(seenRequests[0].jsonSchema) === JSON.stringify(seenRequests[1].jsonSchema) &&
    seenRequests[0].timeoutMs === seenRequests[1].timeoutMs;
  check(
    res.httpStatus === 200 &&
      res.response.ok &&
      res.response.episode.status === "ready" &&
      EpisodeSchema.safeParse(res.response.episode).success &&
      sameContract &&
      seenRequests[0].model === PRIMARY_GEMINI_TEXT_MODEL &&
      seenRequests[1].model === FALLBACK_GEMINI_TEXT_MODEL &&
      res.meta.requestedModel === PRIMARY_GEMINI_TEXT_MODEL &&
      res.meta.resolvedModel === FALLBACK_GEMINI_TEXT_MODEL &&
      res.meta.fallbackUsed === true &&
      res.meta.providerAttempts === 2 &&
      res.meta.repairAttempts === 0,
    "primary 503 switches once to gemini-3.5-flash-lite with identical contract and passes EpisodeSchema",
  );
}

// 5. Primary 429 -> automatic fallback succeeds
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain elasticity on campus", tone: "casual", length: "quick", hostCount: 2 });
  const modelsCalled = [];
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      modelsCalled.push(callReq.model);
      if (callReq.model === PRIMARY_GEMINI_TEXT_MODEL) {
        throw classifyGeminiError({ status: 429, message: "rate limit" });
      }
      return JSON.stringify(twoHostDraft("Price Elasticity"));
    },
  });
  check(
    res.httpStatus === 200 &&
      res.response.ok &&
      modelsCalled.join(",") === `${PRIMARY_GEMINI_TEXT_MODEL},${FALLBACK_GEMINI_TEXT_MODEL}` &&
      res.meta.fallbackUsed === true &&
      res.meta.providerAttempts === 2,
    "primary 429 switches cleanly to fallback and succeeds",
  );
}

// 6. Primary timeout (RequestTimeoutError & RequestAbortedError) -> automatic fallback succeeds
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain compound interest cleanly", tone: "casual", length: "quick", hostCount: 2 });
  for (const errName of ["RequestTimeoutError", "RequestAbortedError"]) {
    const modelsCalled = [];
    const res = await generateGeminiEpisode(req, {
      apiKey: "test-key",
      env: {},
      transport: async (callReq) => {
        modelsCalled.push(callReq.model);
        if (callReq.model === PRIMARY_GEMINI_TEXT_MODEL) {
          const err = new Error("aborted");
          err.name = errName;
          throw classifyGeminiError(err);
        }
        return JSON.stringify(twoHostDraft("Compound Interest"));
      },
    });
    check(
      res.httpStatus === 200 &&
        res.response.ok &&
        modelsCalled.join(",") === `${PRIMARY_GEMINI_TEXT_MODEL},${FALLBACK_GEMINI_TEXT_MODEL}` &&
        res.meta.fallbackUsed === true &&
        res.meta.providerAttempts === 2,
      `primary ${errName} switches cleanly to fallback and succeeds`,
    );
  }
}

// 7. Primary auth failure (401 & 403) & safety rejection -> NO fallback
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  for (const status of [401, 403]) {
    let calls = 0;
    const res = await generateGeminiEpisode(req, {
      apiKey: "bad-key",
      env: {},
      transport: async () => {
        calls += 1;
        throw classifyGeminiError({ status, message: "secret_key_details_must_not_leak" });
      },
    });
    check(
      calls === 1 &&
        res.httpStatus === 502 &&
        res.response.ok === false &&
        res.response.error.code === "SCRIPT_GENERATION_FAILED" &&
        res.response.error.retryable === false &&
        res.meta.fallbackUsed === false &&
        res.meta.providerAttempts === 1 &&
        !res.response.error.message.includes("secret_key_details"),
      `primary auth ${status} fails immediately without capacity fallback or raw text leak`,
    );
  }

  let safetyCalls = 0;
  const safetyRes = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async () => {
      safetyCalls += 1;
      throw classifyGeminiError({ status: 400, message: "Request blocked due to SAFETY content_policy" });
    },
  });
  check(
    safetyCalls === 1 &&
      safetyRes.httpStatus === 502 &&
      safetyRes.response.ok === false &&
      safetyRes.response.error.retryable === false &&
      safetyRes.meta.fallbackUsed === false,
    "primary safety rejection fails immediately without capacity fallback",
  );
}

// 8. Primary schema failure follows repair behavior on primary, NEVER capacity fallback
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  const badDraft = twoHostDraft();
  badDraft.segments[1].speakerId = "unknown_host";

  const modelsCalledSuccess = [];
  const resFixed = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      modelsCalledSuccess.push(callReq.model);
      if (modelsCalledSuccess.length === 1) return JSON.stringify(badDraft);
      check(callReq.userPrompt.includes("unknown_host") || callReq.userPrompt.includes("Repair"), "repair prompt references prior draft issue");
      return `\`\`\`json\n${JSON.stringify(twoHostDraft())}\n\`\`\``;
    },
  });
  check(
    resFixed.httpStatus === 200 &&
      resFixed.response.ok &&
      modelsCalledSuccess.every((m) => m === PRIMARY_GEMINI_TEXT_MODEL) &&
      resFixed.meta.fallbackUsed === false &&
      resFixed.meta.providerAttempts === 2 &&
      resFixed.meta.repairAttempts === 1,
    "primary schema failure repairs cleanly on primary without switching to fallback",
  );

  const modelsCalledFail = [];
  const resStillInvalid = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      modelsCalledFail.push(callReq.model);
      return JSON.stringify(badDraft);
    },
  });
  check(
    modelsCalledFail.length === 2 &&
      modelsCalledFail.every((m) => m === PRIMARY_GEMINI_TEXT_MODEL) &&
      resStillInvalid.httpStatus === 502 &&
      resStillInvalid.response.ok === false &&
      resStillInvalid.response.error.code === "SCRIPT_VALIDATION_FAILED" &&
      resStillInvalid.meta.fallbackUsed === false &&
      resStillInvalid.meta.providerAttempts === 2 &&
      resStillInvalid.meta.repairAttempts === 1,
    "persistent primary schema failure stops after 1 repair without triggering capacity fallback",
  );
}

// 9. Primary & fallback both fail -> honest recoverable error (never silent mock)
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain marginal benefit", tone: "casual", length: "quick", hostCount: 2 });

  const calls503 = [];
  const both503 = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      calls503.push(callReq.model);
      throw classifyGeminiError({ status: 503, message: "capacity spike" });
    },
  });
  check(
    calls503.length === 2 &&
      both503.httpStatus === 502 &&
      both503.response.ok === false &&
      both503.response.error.code === "SCRIPT_GENERATION_FAILED" &&
      both503.response.error.retryable === true &&
      both503.meta.fallbackUsed === true &&
      both503.meta.resolvedModel === FALLBACK_GEMINI_TEXT_MODEL,
    "primary + fallback 503 returns honest recoverable 502 without mock content",
  );

  const calls429 = [];
  const both429 = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      calls429.push(callReq.model);
      throw classifyGeminiError({ status: 429, message: "secret_token_should_not_leak" });
    },
  });
  check(
    calls429.length === 2 &&
      both429.httpStatus === 429 &&
      both429.response.ok === false &&
      both429.response.error.code === "RATE_LIMITED" &&
      both429.response.error.retryable === true &&
      !both429.response.error.message.includes("secret_token") &&
      both429.meta.fallbackUsed === true,
    "primary + fallback 429 maps cleanly to 429 RATE_LIMITED without leaking raw error text",
  );
}

// 10. Arbitrary env model IDs rejected; explicit gemini-4-hydrogen allowed ONLY as primary override
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain comparative advantage", tone: "casual", length: "quick", hostCount: 2 });
  let transportCalls = 0;
  const countTransport = async () => {
    transportCalls += 1;
    return JSON.stringify(twoHostDraft());
  };

  const badPrimary = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: { GEMINI_TEXT_MODEL: "gemini-2.0-flash" },
    transport: countTransport,
  });
  const badFallback = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: { GEMINI_FALLBACK_MODEL: "gemini-4-hydrogen" },
    transport: countTransport,
  });
  const arbitraryFallback = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: { GEMINI_FALLBACK_MODEL: "arbitrary-unlisted-model" },
    transport: countTransport,
  });
  check(
    transportCalls === 0 &&
      badPrimary.httpStatus === 503 &&
      badPrimary.response.ok === false &&
      badPrimary.response.error.retryable === false &&
      badFallback.httpStatus === 503 &&
      badFallback.response.ok === false &&
      arbitraryFallback.httpStatus === 503 &&
      arbitraryFallback.response.ok === false,
    "arbitrary model IDs and gemini-4-hydrogen fallback override are rejected with 0 provider calls",
  );

  const explicitHydrogen = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: { GEMINI_TEXT_MODEL: "gemini-4-hydrogen" },
    transport: async (callReq) => {
      check(callReq.model === "gemini-4-hydrogen", "explicit GEMINI_TEXT_MODEL=gemini-4-hydrogen override is honored");
      return JSON.stringify(twoHostDraft());
    },
  });
  check(
    explicitHydrogen.httpStatus === 200 &&
      explicitHydrogen.response.ok &&
      explicitHydrogen.meta.resolvedModel === "gemini-4-hydrogen" &&
      explicitHydrogen.meta.fallbackUsed === false,
    "explicit gemini-4-hydrogen primary override succeeds without automatic fallback",
  );
}

// 11. Empty response triggers 1 repair retry then returns 502
{
  const req = CreateEpisodeRequestSchema.parse({ input: "Explain active recall", tone: "casual", length: "quick", hostCount: 2 });
  let calls = 0;
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async () => {
      calls += 1;
      throw new GeminiProviderError("empty_response", "Gemini returned an empty response.", true);
    },
  });
  check(
    calls === 2 &&
      res.httpStatus === 502 &&
      res.response.ok === false &&
      res.response.error.code === "SCRIPT_GENERATION_FAILED" &&
      res.meta.fallbackUsed === false &&
      res.meta.repairAttempts === 1,
    "empty response retries once on same model and returns 502 SCRIPT_GENERATION_FAILED",
  );
}

// 12. Maximum provider-call bound strictly capped (2 choices, 1 switch, 1 repair, max 3 calls)
{
  check(
    MAX_MODEL_CHOICES === 2 &&
      MAX_MODEL_SWITCHES === 1 &&
      MAX_REPAIR_ATTEMPTS === 1 &&
      MAX_PROVIDER_ATTEMPTS === 3,
    "exported execution cap constants equal 2 models, 1 switch, 1 repair, and 3 max provider calls",
  );

  const req = CreateEpisodeRequestSchema.parse({ input: "Explain opportunity cost in detail", tone: "casual", length: "quick", hostCount: 2 });
  const badDraft = twoHostDraft();
  badDraft.segments[0].speakerId = "ghost_speaker";

  const modelsCalled = [];
  const res = await generateGeminiEpisode(req, {
    apiKey: "test-key",
    env: {},
    transport: async (callReq) => {
      modelsCalled.push(callReq.model);
      if (callReq.model === PRIMARY_GEMINI_TEXT_MODEL) {
        throw classifyGeminiError({ status: 503, message: "overload" });
      }
      return JSON.stringify(badDraft);
    },
  });
  check(
    modelsCalled.length === 3 &&
      modelsCalled.length <= MAX_PROVIDER_ATTEMPTS &&
      modelsCalled[0] === PRIMARY_GEMINI_TEXT_MODEL &&
      modelsCalled[1] === FALLBACK_GEMINI_TEXT_MODEL &&
      modelsCalled[2] === FALLBACK_GEMINI_TEXT_MODEL &&
      res.httpStatus === 502 &&
      res.response.ok === false &&
      res.response.error.code === "SCRIPT_VALIDATION_FAILED" &&
      res.meta.providerAttempts === 3 &&
      res.meta.repairAttempts === 1 &&
      res.meta.fallbackUsed === true,
    "maximum provider-call bound caps primary 503 + fallback schema fail + fallback repair at 3 total calls",
  );
}

// 13. Generation mode, defaults, mock marking, and client isolation
{
  check(resolveGenerationMode({}) === "live", "default generation mode is live");
  check(resolveGenerationMode({ KURO_GENERATION_MODE: "mock" }) === "mock", "explicit KURO_GENERATION_MODE=mock resolves mock");
  check(resolveGeminiModel({}) === PRIMARY_GEMINI_TEXT_MODEL, "default primary model resolves to gemini-3.8-flash");
  check(resolveGeminiFallbackModel({}) === FALLBACK_GEMINI_TEXT_MODEL, "default fallback model resolves to gemini-3.5-flash-lite");

  const mockEp = createMockEpisode(CreateEpisodeRequestSchema.parse({ input: "Opportunity cost review", tone: "casual", length: "quick", hostCount: 2 }));
  check(mockEp.status === "mock", "mock service explicitly marks episode status as mock");

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
      content.includes("@google/genai") ||
      content.includes("gemini-3.8-flash") ||
      content.includes("gemini-3.5-flash-lite") ||
      content.includes("gemini-4-hydrogen")
    );
  });
  check(forbidden.length === 0, "no client component/hook exposes secrets, SDK, or exact Gemini model IDs");
}

// 14. Compact Gemini JSON schema, flat cue normalization, and hostCount enforcement
{
  const reqThree = CreateEpisodeRequestSchema.parse({ input: "Explain inflation cleanly", tone: "serious", length: "quick", hostCount: 3 });
  const schemaText = JSON.stringify(buildGeminiEpisodeJsonSchema(reqThree));
  check(
    !schemaText.includes('"minItems"') &&
      !schemaText.includes('"maxItems"') &&
      !schemaText.includes('"anyOf"'),
    "Gemini structured schema omits minItems, maxItems, and anyOf to stay within state limit",
  );

  const reqTwo = CreateEpisodeRequestSchema.parse({ input: "Explain opportunity cost", tone: "casual", length: "quick", hostCount: 2 });
  const flatDraft = twoHostDraft();
  flatDraft.segments[0].visualCue = { type: "none", title: "", value: "" };
  const candidate = assembleEpisodeCandidate(flatDraft, reqTwo);
  check(EpisodeSchema.safeParse(candidate).success, "assembleEpisodeCandidate strips extraneous flat visualCue keys before EpisodeSchema validation");

  let calls = 0;
  let sawHostCountIssue = false;
  const repairedDraft = {
    title: "Three Host Inflation Breakdown",
    hosts: [
      { id: "host_maya", name: "Maya", role: "explainer" },
      { id: "host_leo", name: "Leo", role: "learner" },
      { id: "host_nina", name: "Nina", role: "skeptic" },
    ],
    segments: [
      ...twoHostDraft().segments.slice(0, 7),
      { id: "seg_08", order: 7, speakerId: "host_nina", text: "Wait, what about rent and bus passes?", emotion: "reacting", visualCue: { type: "none" } },
    ],
  };
  const res = await generateGeminiEpisode(reqThree, {
    apiKey: "test-key",
    env: {},
    transport: async ({ userPrompt }) => {
      calls += 1;
      if (calls === 1) return JSON.stringify(twoHostDraft());
      sawHostCountIssue = userPrompt.includes("Expected exactly 3 hosts, got 2");
      return JSON.stringify(repairedDraft);
    },
  });
  check(
    calls === 2 &&
      sawHostCountIssue &&
      res.httpStatus === 200 &&
      res.response.ok === true &&
      res.response.episode.hosts.length === 3,
    "hostCount mismatch triggers bounded repair retry and succeeds when corrected",
  );
}

console.log(`Generation checks passed: ${passed}`);
