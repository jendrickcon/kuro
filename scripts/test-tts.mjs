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

const { HostRoleSchema } = await import("../contracts/episode.schema.ts");
const { decodeAndInspectTtsAudio } = await import("../src/lib/tts/audio-inspect.ts");
const {
  buildSegmentCacheKey,
  createEpisodeAudioQueueEngine,
  createTtsSessionCircuit,
} = await import("../src/lib/tts/episode-audio-queue-engine.ts");
const { assembleEpisodeCandidate } = await import("../src/lib/episode/gemini-service.ts");
const {
  resolveCanonicalIdentityId,
  resolveDeterministicUnknownIdentityId,
  resolveEpisodeVoiceIdentities,
} = await import("../src/lib/tts/kuromate-identity-ids.ts");
const {
  KUROMATE_IDENTITY_PROFILES,
  resolveKuromateIdentityProfile,
} = await import("../src/lib/tts/kuromate-voice-identities.ts");
const {
  ALLOWED_GEMINI_TTS_FALLBACK_MODELS,
  ALLOWED_GEMINI_TTS_MODELS,
  classifyGeminiTtsError,
  LITE_GEMINI_TTS_MODEL,
  PRIMARY_GEMINI_TTS_MODEL,
} = await import("../src/lib/tts/gemini-tts-client.ts");
const {
  generateSegmentTts,
  isAllowedGeminiTtsFallbackModel,
  MAX_TTS_MODEL_CHOICES,
  MAX_TTS_MODEL_SWITCHES,
  MAX_TTS_PROVIDER_ATTEMPTS,
  MAX_TTS_REGENERATION_ATTEMPTS,
  resolveGeminiTtsFallbackModel,
} = await import("../src/lib/tts/gemini-tts-service.ts");
const { createObjectUrlManager } = await import("../src/lib/tts/object-url-manager.ts");
const {
  classifyRetryAfter,
  parseQuotaClassHeader,
  parseRetryAfterMs,
} = await import("../src/lib/tts/retry-after.ts");
const {
  GenerateTtsFailureSchema,
  GenerateTtsRequestSchema,
  TTS_MAX_AUDIO_BYTES,
  TTS_MAX_TEXT_CHARS,
} = await import("../src/lib/tts/tts-contract.ts");
const { handleTtsPost } = await import("../src/lib/tts/tts-route-handler.ts");
const {
  KUROMATE_VOICE_PROFILES,
  resolveKuromateSynthesisProfile,
  resolveKuromateVoiceProfile,
} = await import("../src/lib/tts/voice-profiles.ts");

let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

/** Builds a valid 24kHz mono 16-bit PCM WAV buffer, optionally inserting a JUNK metadata chunk before data. */
function makeSyntheticWavBase64({ durationMs = 1500, includeExtraJunkChunk = false } = {}) {
  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.round((sampleRate * durationMs) / 1000);
  const dataSize = sampleCount * blockAlign;

  const junkChunk = includeExtraJunkChunk
    ? (() => {
        const buf = Buffer.alloc(16);
        buf.write("JUNK", 0, "ascii");
        buf.writeUInt32LE(8, 4);
        buf.write("KUROTEST", 8, "ascii");
        return buf;
      })()
    : Buffer.alloc(0);

  const fmtChunk = Buffer.alloc(24);
  fmtChunk.write("fmt ", 0, "ascii");
  fmtChunk.writeUInt32LE(16, 4);
  fmtChunk.writeUInt16LE(1, 8); // PCM
  fmtChunk.writeUInt16LE(channels, 10);
  fmtChunk.writeUInt32LE(sampleRate, 12);
  fmtChunk.writeUInt32LE(byteRate, 16);
  fmtChunk.writeUInt16LE(blockAlign, 20);
  fmtChunk.writeUInt16LE(bitsPerSample, 22);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(dataSize, 4);

  const pcm = Buffer.alloc(dataSize);
  for (let i = 0; i < sampleCount; i += 1) {
    const sample = Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 4000);
    pcm.writeInt16LE(sample, i * 2);
  }

  const body = Buffer.concat([junkChunk, fmtChunk, dataHeader, pcm]);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, body]).toString("base64");
}

function makeJsonRequest(payload, headers = {}) {
  return new Request("http://localhost:3000/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

const VALID_WAV_B64 = makeSyntheticWavBase64({ durationMs: 1250, includeExtraJunkChunk: true });

// 1-3. Valid role requests (explainer, learner, third role) and unique role mapping
{
  const roles = HostRoleSchema.options;
  const distinctVoices = new Set(roles.map((r) => resolveKuromateVoiceProfile(r).voice));
  const distinctProfiles = new Set(roles.map((r) => resolveKuromateVoiceProfile(r).profileId));
  check(
    roles.length === 6 && distinctVoices.size === 6 && distinctProfiles.size === 6,
    "all 6 Kuromate roles map to unique voice profiles and prebuilt voices",
  );

  for (const [idx, roleCase] of [
    { role: "explainer", voice: "Sulafat", profileId: "kuromate_explainer_v1", label: "1. valid explainer request" },
    { role: "learner", voice: "Puck", profileId: "kuromate_learner_v1", label: "2. valid learner request" },
    { role: "skeptic", voice: "Kore", profileId: "kuromate_skeptic_v1", label: "3. valid third-role (skeptic) request" },
  ].entries()) {
    let seenReq = null;
    const req = GenerateTtsRequestSchema.parse({
      segmentId: `seg_0${idx + 1}`,
      speakerId: `host_0${idx + 1}`,
      role: roleCase.role,
      text: "Opportunity cost is the value of the next-best option you give up.",
    });
    const res = await generateSegmentTts(req, {
      apiKey: "test-key",
      env: {},
      transport: async (callReq) => {
        seenReq = callReq;
        return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
      },
    });
    check(
      res.ok === true &&
        res.httpStatus === 200 &&
        seenReq?.voice === roleCase.voice &&
        res.profile.profileId === roleCase.profileId &&
        seenReq?.styleInstruction === KUROMATE_VOICE_PROFILES[roleCase.role].styleInstruction,
      roleCase.label,
    );
  }
}

// 4. Empty / whitespace text rejected with 0 provider calls
{
  let calls = 0;
  for (const badText of ["", "   \n\t  "]) {
    const response = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: badText }),
      { apiKey: "test-key", env: {}, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
    );
    const body = await response.json();
    check(
      response.status === 400 &&
        GenerateTtsFailureSchema.safeParse(body).success &&
        body.error.code === "INVALID_TTS_INPUT" &&
        calls === 0,
      `4. empty/whitespace text rejected (${JSON.stringify(badText)}) with 0 provider calls`,
    );
  }
}

// 5. Overlength text rejected (> 320 chars) with 0 provider calls; 320 chars allowed
{
  check(
    GenerateTtsRequestSchema.safeParse({
      segmentId: "seg_01",
      speakerId: "host_1",
      role: "explainer",
      text: "x".repeat(TTS_MAX_TEXT_CHARS),
    }).success,
    "exact 320-char text boundary accepted",
  );

  let calls = 0;
  const response = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "x".repeat(TTS_MAX_TEXT_CHARS + 1) }),
    { apiKey: "test-key", env: {}, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
  );
  const body = await response.json();
  check(
    response.status === 400 && body.error.code === "INVALID_TTS_INPUT" && calls === 0,
    "5. overlength text (>320 chars) rejected with 0 provider calls",
  );
}

// 6. Invalid role rejected with 0 provider calls
{
  let calls = 0;
  const response = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "announcer", text: "Hello world." }),
    { apiKey: "test-key", env: {}, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
  );
  const body = await response.json();
  check(
    response.status === 400 && body.error.code === "INVALID_TTS_INPUT" && calls === 0,
    "6. invalid role rejected with 0 provider calls",
  );
}

// 7. Arbitrary voice / profile / style / key / URL / path fields rejected with 0 provider calls
{
  let calls = 0;
  const hostilePayloads = [
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", voice: "Charon" },
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", profileId: "kuromate_learner_v1" },
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", style: "shout loudly" },
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", apiKey: "AIzaFakeSecret" },
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", audioUrl: "https://evil.example/a.wav" },
    { segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", outputPath: "/tmp/out.wav" },
  ];
  let allRejected = true;
  for (const payload of hostilePayloads) {
    const res = await handleTtsPost(makeJsonRequest(payload), {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        calls += 1;
        return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
      },
    });
    const json = await res.json();
    if (res.status !== 400 || json?.error?.code !== "INVALID_TTS_INPUT") {
      allRejected = false;
    }
  }
  check(allRejected && calls === 0, "7. arbitrary voice, profile mismatch, style, key, URL, and path rejected with 0 provider calls");
}

// 8. Arbitrary model rejected (both client payload field and server env override)
{
  let calls = 0;
  const bodyRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello", model: "gemini-2.5-pro-preview-tts" }),
    { apiKey: "test-key", env: {}, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
  );
  const envRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello" }),
    { apiKey: "test-key", env: { GEMINI_TTS_MODEL: "unapproved-third-party-tts" }, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
  );
  const envJson = await envRes.json();
  check(
    bodyRes.status === 400 &&
      envRes.status === 503 &&
      envJson.error.code === "TTS_NOT_CONFIGURED" &&
      !ALLOWED_GEMINI_TTS_MODELS.includes("unapproved-third-party-tts") &&
      calls === 0,
    "8. arbitrary body and env TTS models rejected before any provider call",
  );
}

// 9. Missing API key returns 503 TTS_NOT_CONFIGURED with 0 provider calls
{
  let calls = 0;
  const response = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello world." }),
    { apiKey: "", env: {}, transport: async () => { calls += 1; return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" }; } },
  );
  const body = await response.json();
  check(
    response.status === 503 &&
      body.error.code === "TTS_NOT_CONFIGURED" &&
      body.error.retryable === false &&
      response.headers.get("cache-control") === "no-store" &&
      calls === 0,
    "9. missing GEMINI_API_KEY fails explicitly with 503 TTS_NOT_CONFIGURED and 0 provider calls",
  );
}

// 10-12. Successful provider response, audio Content-Type, base64 decoding & WAV RIFF inspection
{
  const inspected = decodeAndInspectTtsAudio(VALID_WAV_B64, "audio/wav; charset=binary");
  check(
    inspected.metadata.container === "wav" &&
      inspected.metadata.sampleRateHz === 24000 &&
      inspected.metadata.channels === 1 &&
      inspected.metadata.bitDepth === 16 &&
      inspected.metadata.durationMs === 1250 &&
      inspected.bytes.subarray(0, 4).toString("ascii") === "RIFF",
    "12. decodes base64 PCM WAV accurately including non-data RIFF chunks",
  );

  const response = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Opportunity cost in plain terms." }),
    {
      apiKey: "secret-should-never-leak",
      env: {},
      transport: async () => ({ base64Data: VALID_WAV_B64, mimeType: "audio/wav" }),
    },
  );
  const returnedBytes = Buffer.from(await response.arrayBuffer());
  const headersSerialized = JSON.stringify(Object.fromEntries(response.headers.entries()));
  check(
    response.status === 200 &&
      response.headers.get("content-type") === "audio/wav" &&
      response.headers.get("cache-control") === "no-store" &&
      response.headers.get("x-kuro-profile-id") === "kuromate_explainer_v1" &&
      response.headers.get("x-kuro-audio-container") === "wav" &&
      response.headers.get("x-kuro-audio-duration-ms") === "1250" &&
      returnedBytes.length === inspected.bytes.length &&
      !headersSerialized.includes("secret-should-never-leak") &&
      !headersSerialized.includes(PRIMARY_GEMINI_TTS_MODEL),
    "10-11. route returns 200 audio/wav with Cache-Control: no-store and safe metadata headers",
  );

  let badMimeCalls = 0;
  const badMimeRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hello" }),
    {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        badMimeCalls += 1;
        return { base64Data: VALID_WAV_B64, mimeType: "text/plain" };
      },
    },
  );
  const badMimeJson = await badMimeRes.json();
  check(
    badMimeRes.status === 502 && badMimeJson.error.code === "TTS_AUDIO_INVALID" && badMimeCalls === 1,
    "11b. unexpected MIME type rejected with 502 TTS_AUDIO_INVALID and no wasted regeneration",
  );
}

// 13. Empty audio response -> at most one bounded regeneration
{
  let calls = 0;
  const recoverRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Test empty recovery" }),
    {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        calls += 1;
        if (calls === 1) return { base64Data: "   ", mimeType: "audio/wav" };
        return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
      },
    },
  );
  check(
    recoverRes.status === 200 && calls === 2,
    "13a. single empty audio response performs at most one bounded regeneration and succeeds",
  );

  let failCalls = 0;
  const failRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Test repeated empty" }),
    {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        failCalls += 1;
        return { base64Data: "", mimeType: "audio/wav" };
      },
    },
  );
  const failJson = await failRes.json();
  check(
    failRes.status === 502 && failJson.error.code === "TTS_AUDIO_INVALID" && failCalls === 2,
    "13b. repeated empty audio fails cleanly with 502 TTS_AUDIO_INVALID capped at 2 calls",
  );
}

// 14. Malformed base64 & invalid non-WAV bytes claiming audio/wav -> capped at 2 calls
{
  let badB64Calls = 0;
  const badB64Res = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "learner", text: "Bad base64" }),
    {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        badB64Calls += 1;
        return { base64Data: "!!!not-valid-base64!!!", mimeType: "audio/wav" };
      },
    },
  );
  const badB64Json = await badB64Res.json();

  let fakeWavCalls = 0;
  const fakeWavRes = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "learner", text: "Fake wav header" }),
    {
      apiKey: "test-key",
      env: {},
      transport: async () => {
        fakeWavCalls += 1;
        return {
          base64Data: Buffer.from("NOT_A_REAL_RIFF_WAV_PAYLOAD_0123456789_PADDING_DATA").toString("base64"),
          mimeType: "audio/wav",
        };
      },
    },
  );
  const fakeWavJson = await fakeWavRes.json();

  check(
    badB64Res.status === 502 &&
      badB64Json.error.code === "TTS_AUDIO_INVALID" &&
      badB64Calls === 2 &&
      fakeWavRes.status === 502 &&
      fakeWavJson.error.code === "TTS_AUDIO_INVALID" &&
      fakeWavCalls === 2,
    "14. malformed base64 and invalid WAV container rejected cleanly within max 2 attempts",
  );
}

// 15-19. Single-model error classification (with explicit rollback `fallbackModel: null` on transient cases) and permanent auth/safety rejection
{
  for (const tc of [
    {
      label: "15. single-model provider 429 maps to 429 TTS_RATE_LIMITED with Retry-After and 1 call",
      err: { status: 429, message: "rate limited", headers: { "retry-after": "7" } },
      expectedStatus: 429,
      expectedCode: "TTS_RATE_LIMITED",
      expectedRetryable: true,
      expectedRetryAfter: "7",
      disableFallback: true,
    },
    {
      label: "16. single-model provider 503 maps to 503 TTS_PROVIDER_UNAVAILABLE with 1 call",
      err: { status: 503, message: "503 service unavailable" },
      expectedStatus: 503,
      expectedCode: "TTS_PROVIDER_UNAVAILABLE",
      expectedRetryable: true,
      disableFallback: true,
    },
    {
      label: "17. single-model provider timeout maps to 504 TTS_TIMEOUT with 1 call",
      err: { name: "AbortError", message: "aborted after 30000ms" },
      expectedStatus: 504,
      expectedCode: "TTS_TIMEOUT",
      expectedRetryable: true,
      disableFallback: true,
    },
    {
      label: "18. authentication failure maps to non-retryable 502 TTS_GENERATION_FAILED without key leak or fallback",
      err: { status: 401, message: "API key AIzaSuperSecret123 rejected" },
      expectedStatus: 502,
      expectedCode: "TTS_GENERATION_FAILED",
      expectedRetryable: false,
      disableFallback: false,
    },
    {
      label: "19. safety rejection maps to non-retryable 502 TTS_GENERATION_FAILED with 1 call and no fallback",
      err: { status: 400, message: "Request blocked due to PROHIBITED_CONTENT SAFETY policy" },
      expectedStatus: 502,
      expectedCode: "TTS_GENERATION_FAILED",
      expectedRetryable: false,
      disableFallback: false,
    },
  ]) {
    let calls = 0;
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Error check line." }),
      {
        apiKey: "AIzaSuperSecret123",
        env: {},
        ...(tc.disableFallback ? { fallbackModel: null } : {}),
        transport: async () => {
          calls += 1;
          throw classifyGeminiTtsError(tc.err);
        },
      },
    );
    const raw = await res.text();
    const json = JSON.parse(raw);
    check(
      res.status === tc.expectedStatus &&
        json?.error?.code === tc.expectedCode &&
        json?.error?.retryable === tc.expectedRetryable &&
        (tc.expectedRetryAfter ? res.headers.get("retry-after") === tc.expectedRetryAfter : true) &&
        !raw.includes("AIzaSuperSecret123") &&
        calls === 1,
      tc.label,
    );
  }
}

// 20. Response-size bound enforced cleanly without regeneration
{
  let calls = 0;
  const res = await handleTtsPost(
    makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Size bound check" }),
    {
      apiKey: "test-key",
      env: {},
      maxAudioBytes: 256,
      transport: async () => {
        calls += 1;
        return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
      },
    },
  );
  const json = await res.json();
  check(
    TTS_MAX_AUDIO_BYTES === 5 * 1024 * 1024 &&
      res.status === 502 &&
      json.error.code === "TTS_AUDIO_INVALID" &&
      json.error.retryable === false &&
      calls === 1,
    "20. oversized audio response rejected cleanly with 1 attempt",
  );
}

// 21-22. Static source scan for client secrets, model/SDK exposure, speechSynthesis, and stale naming
{
  const clientFiles = [
    path.join(root, "src/app/page.tsx"),
    path.join(root, "src/lib/tts/object-url-manager.ts"),
  ];
  for (const dir of [
    path.join(root, "src/components"),
    path.join(root, "src/hooks"),
  ]) {
    const stack = [dir];
    while (stack.length > 0) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) clientFiles.push(full);
      }
    }
  }

  const forbiddenClientTokens = [
    "GEMINI_API_KEY",
    "NEXT_PUBLIC_GEMINI",
    "@google/genai",
    "gemini-3.8-flash-tts",
    "gemini-3.8-flash-lite-tts",
    "generativelanguage.googleapis.com",
    "speechSynthesis",
    "SpeechSynthesisUtterance",
    "AIza",
    "kurozo",
  ];
  const offenders = [];
  for (const filePath of clientFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    const lower = content.toLowerCase();
    for (const token of forbiddenClientTokens) {
      if (lower.includes(token.toLowerCase())) {
        offenders.push(`${path.relative(root, filePath)}:${token}`);
      }
    }
  }
  const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  const envSafe = !envExample.includes("NEXT_PUBLIC_GEMINI") && !/GEMINI_API_KEY=.+/i.test(envExample);
  check(
    offenders.length === 0 && envSafe,
    "21-22. client code and .env.example contain zero secrets, server SDK/model IDs, speechSynthesis, or stale naming",
  );
}

// 23. Object URL cleanup manager prevents leaks
{
  let seq = 0;
  const created = [];
  const revoked = [];
  const mgr = createObjectUrlManager({
    createObjectURL: () => {
      seq += 1;
      const url = `blob:kuro/${seq}`;
      created.push(url);
      return url;
    },
    revokeObjectURL: (url) => {
      revoked.push(url);
    },
  });
  const u1 = mgr.replace(new Blob(["a"]));
  const u2 = mgr.replace(new Blob(["b"]));
  mgr.revoke();
  mgr.revoke();
  check(
    u1 === "blob:kuro/1" &&
      u2 === "blob:kuro/2" &&
      created.length === 2 &&
      revoked.length === 2 &&
      revoked[0] === u1 &&
      revoked[1] === u2 &&
      mgr.getCurrent() === null,
    "23. ObjectUrlManager revokes prior blob URL on replace and cleans up without leaks",
  );
}

// 24. Invalid HTTP route inputs invoke 0 provider calls
{
  let calls = 0;
  const opts = {
    apiKey: "test-key",
    env: {},
    transport: async () => {
      calls += 1;
      return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
    },
  };
  const badContentType = await handleTtsPost(
    new Request("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Hi" }),
    }),
    opts,
  );
  const badJson = await handleTtsPost(makeJsonRequest("{broken json"), opts);
  const oversizedBody = await handleTtsPost(
    makeJsonRequest(JSON.stringify({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "a".repeat(5000) })),
    opts,
  );
  check(
    badContentType.status === 400 &&
      badJson.status === 400 &&
      oversizedBody.status === 400 &&
      calls === 0,
    "24. bad Content-Type, invalid JSON, and oversized body all fail 400 with 0 provider calls",
  );
}

// 25. Explicit maximum provider-call bound verified & WP-011.5 Section 17 TTS Matrix (1-30)
{
  check(
    MAX_TTS_MODEL_CHOICES === 2 &&
      MAX_TTS_MODEL_SWITCHES === 1 &&
      MAX_TTS_REGENERATION_ATTEMPTS === 1 &&
      MAX_TTS_PROVIDER_ATTEMPTS === 3 &&
      ALLOWED_GEMINI_TTS_FALLBACK_MODELS.length === 1 &&
      ALLOWED_GEMINI_TTS_FALLBACK_MODELS[0] === LITE_GEMINI_TTS_MODEL,
    "25. explicit TTS bounds enforce <= 2 models, <= 1 switch, <= 1 repair, and <= 3 max upstream attempts",
  );
}

function makeSyntheticC2paWavBase64({ durationMs = 1400 } = {}) {
  const sampleRate = 24000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.round((sampleRate * durationMs) / 1000);
  const dataSize = sampleCount * blockAlign;

  const fmtChunk = Buffer.alloc(24);
  fmtChunk.write("fmt ", 0, "ascii");
  fmtChunk.writeUInt32LE(16, 4);
  fmtChunk.writeUInt16LE(1, 8);
  fmtChunk.writeUInt16LE(channels, 10);
  fmtChunk.writeUInt32LE(sampleRate, 12);
  fmtChunk.writeUInt32LE(byteRate, 16);
  fmtChunk.writeUInt16LE(blockAlign, 20);
  fmtChunk.writeUInt16LE(bitsPerSample, 22);

  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(dataSize, 4);

  const pcm = Buffer.alloc(dataSize);
  for (let i = 0; i < sampleCount; i += 1) {
    pcm.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 260 * i) / sampleRate) * 4200), i * 2);
  }

  const c2paPayload = Buffer.from("KURO_C2PA_MANIFEST_VERIFY");
  const c2paPadding = c2paPayload.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  const c2paHeader = Buffer.alloc(8);
  c2paHeader.write("c2pa", 0, "ascii");
  c2paHeader.writeUInt32LE(c2paPayload.length, 4);

  const body = Buffer.concat([fmtChunk, dataHeader, pcm, c2paHeader, c2paPayload, c2paPadding]);
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + body.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, body]).toString("base64");
}

const FLASH_LITE_C2PA_WAV_B64 = makeSyntheticC2paWavBase64({ durationMs: 1400 });

// WP-011.5 Section 17 checks
{
  // TTS-01: Primary success, no fallback
  {
    const seenModels = [];
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Primary succeeds first try." }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          seenModels.push(req.model);
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    check(
      res.status === 200 &&
        seenModels.length === 1 &&
        seenModels[0] === PRIMARY_GEMINI_TTS_MODEL &&
        res.headers.get("x-kuro-tts-fallback-used") === "false" &&
        res.headers.get("x-kuro-tts-quota-class") === "none" &&
        res.headers.get("x-kuro-tts-profile") === "kuromate_explainer_v1",
      "[WP-011.5 TTS 01] Primary success uses 1 attempt and sets fallback-used=false",
    );
  }

  // TTS-02 & 05 & 24: Primary 429 long Retry-After switches once to Flash-Lite & returns safe fallback + quota headers
  {
    const seenModels = [];
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Opportunity cost fallback clip." }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          seenModels.push(req.model);
          if (req.model === PRIMARY_GEMINI_TTS_MODEL) {
            throw {
              status: 429,
              message: "Rate limit exceeded for model gemini-3.8-flash-tts (limit: 10 requests per day on Free Tier).",
              headers: { "retry-after": "68036" },
            };
          }
          return { base64Data: FLASH_LITE_C2PA_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    const bodyBytes = Buffer.from(await res.arrayBuffer());
    const serializedHeaders = JSON.stringify(Object.fromEntries(res.headers.entries())).toLowerCase();
    const circuit = createTtsSessionCircuit();
    if (parseQuotaClassHeader(res.headers.get("x-kuro-tts-quota-class")) === "long_quota_wait") {
      circuit.openPrimary(1_000_000, Number(res.headers.get("x-kuro-tts-retry-after")));
    }
    check(
      res.status === 200 &&
        bodyBytes.length > 0 &&
        seenModels.length === 2 &&
        seenModels[0] === PRIMARY_GEMINI_TTS_MODEL &&
        seenModels[1] === LITE_GEMINI_TTS_MODEL &&
        res.headers.get("x-kuro-tts-fallback-used") === "true" &&
        res.headers.get("x-kuro-tts-quota-class") === "long_quota_wait" &&
        res.headers.get("x-kuro-tts-retry-after") === "68036" &&
        res.headers.get("x-kuro-tts-profile") === "kuromate_explainer_v1" &&
        res.headers.get("x-kuro-provider-attempts") === "2" &&
        !serializedHeaders.includes(PRIMARY_GEMINI_TTS_MODEL) &&
        !serializedHeaders.includes(LITE_GEMINI_TTS_MODEL) &&
        circuit.isPrimaryOpen(1_000_000) === true &&
        circuit.getState(1_000_000).lastRetryAfterSeconds === 68036,
      "[WP-011.5 TTS 02,05,24] Primary daily 429 switches once to Flash-Lite, emits sanitized quota headers, and opens session circuit",
    );
  }

  // TTS-03: Primary 503 switches once to Flash-Lite
  {
    const seenModels = [];
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_02", speakerId: "h_2", role: "learner", text: "Wait, why did primary pause?" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          seenModels.push(req.model);
          if (req.model === PRIMARY_GEMINI_TTS_MODEL) {
            throw { status: 503, message: "503 SERVICE_UNAVAILABLE" };
          }
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    check(
      res.status === 200 &&
        seenModels.join(",") === `${PRIMARY_GEMINI_TTS_MODEL},${LITE_GEMINI_TTS_MODEL}` &&
        res.headers.get("x-kuro-tts-fallback-used") === "true",
      "[WP-011.5 TTS 03] Primary 503 switches once to Flash-Lite and succeeds",
    );
  }

  // TTS-04: Primary timeout (RequestTimeoutError & RequestAbortedError) switches once to Flash-Lite
  {
    for (const errName of ["RequestTimeoutError", "RequestAbortedError"]) {
      const seenModels = [];
      const res = await handleTtsPost(
        makeJsonRequest({ segmentId: "seg_03", speakerId: "h_3", role: "skeptic", text: "What if the primary request stalls?" }),
        {
          apiKey: "test-key",
          env: {},
          transport: async (req) => {
            seenModels.push(req.model);
            if (req.model === PRIMARY_GEMINI_TTS_MODEL) {
              throw { name: errName, message: "timeout" };
            }
            return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
          },
        },
      );
      check(
        res.status === 200 &&
          seenModels.join(",") === `${PRIMARY_GEMINI_TTS_MODEL},${LITE_GEMINI_TTS_MODEL}` &&
          res.headers.get("x-kuro-tts-fallback-used") === "true",
        `[WP-011.5 TTS 04] Primary ${errName} switches once to Flash-Lite and succeeds`,
      );
    }
  }

  // TTS-06 & 08: Retry-After long_quota_wait vs short_cooldown classification
  {
    const longCls = classifyRetryAfter("68036");
    const dailyTextCls = classifyRetryAfter(null, { errorText: "limit: 10 requests per day" });
    const shortCls = classifyRetryAfter("15");
    check(
      longCls.quotaClass === "long_quota_wait" &&
        longCls.rawSeconds === 68036 &&
        longCls.cooldownMs === null &&
        dailyTextCls.quotaClass === "long_quota_wait" &&
        shortCls.quotaClass === "short_cooldown" &&
        shortCls.cooldownMs === 15_000 &&
        parseRetryAfterMs("15") === 15_000 &&
        parseRetryAfterMs("120") === 30_000,
      "[WP-011.5 TTS 06,08] Long Retry-After classifies as long_quota_wait without short loop while short Retry-After remains bounded",
    );
  }

  // TTS-07 & 28: routePreference: "fallback" routes directly with 0 primary calls; hostile fallback/model fields rejected
  {
    const seenModels = [];
    const directFallback = await handleTtsPost(
      makeJsonRequest({
        segmentId: "seg_04",
        speakerId: "h_1",
        role: "storyteller",
        routePreference: "fallback",
        text: "Storyteller uses direct fallback routing.",
      }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          seenModels.push(req.model);
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    const badRoute = await handleTtsPost(
      makeJsonRequest({
        segmentId: "seg_04",
        speakerId: "h_1",
        role: "storyteller",
        routePreference: "gemini-3.8-flash-lite-tts",
        text: "Bad route pref",
      }),
      {
        apiKey: "test-key",
        env: {},
        transport: async () => ({ base64Data: VALID_WAV_B64, mimeType: "audio/wav" }),
      },
    );
    const extraFallbackField = await handleTtsPost(
      makeJsonRequest({
        segmentId: "seg_04",
        speakerId: "h_1",
        role: "storyteller",
        fallbackModel: "deepgram-aura-2",
        text: "Hostile field",
      }),
      {
        apiKey: "test-key",
        env: {},
        transport: async () => ({ base64Data: VALID_WAV_B64, mimeType: "audio/wav" }),
      },
    );
    check(
      directFallback.status === 200 &&
        seenModels.length === 1 &&
        seenModels[0] === LITE_GEMINI_TTS_MODEL &&
        directFallback.headers.get("x-kuro-tts-fallback-used") === "true" &&
        badRoute.status === 400 &&
        extraFallbackField.status === 400,
      "[WP-011.5 TTS 07,28] Circuit-open routePreference skips primary (1 call) while rejecting arbitrary browser model fields",
    );
  }

  // TTS-09, 10, 11, 12, 13, 16: No fallback on auth/missing key/invalid input/bad models/safety
  {
    let noFallbackCalls = 0;
    const authRes = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Auth check" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async () => {
          noFallbackCalls += 1;
          throw { status: 403, message: "Permission denied" };
        },
      },
    );
    const safetyRes = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Safety check" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async () => {
          noFallbackCalls += 1;
          throw { status: 400, message: "Blocked due to PROHIBITED_CONTENT" };
        },
      },
    );
    let configCalls = 0;
    const badFallbackEnv = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Bad fallback env" }),
      {
        apiKey: "test-key",
        env: { GEMINI_TTS_FALLBACK_MODEL: "gemini-3.8-flash" },
        transport: async () => {
          configCalls += 1;
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    const badPrimaryEnv = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Bad primary env" }),
      {
        apiKey: "test-key",
        env: { GEMINI_TTS_MODEL: "azure-neural-tts" },
        transport: async () => {
          configCalls += 1;
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );
    const disabledFallback = resolveGeminiTtsFallbackModel({ GEMINI_TTS_FALLBACK_MODEL: "none" });
    check(
      authRes.status === 502 &&
        safetyRes.status === 502 &&
        noFallbackCalls === 2 &&
        badFallbackEnv.status === 503 &&
        badPrimaryEnv.status === 503 &&
        configCalls === 0 &&
        disabledFallback.configured === true &&
        disabledFallback.model === null &&
        !isAllowedGeminiTtsFallbackModel(PRIMARY_GEMINI_TTS_MODEL),
      "[WP-011.5 TTS 09-13,16] Auth/missing-key/invalid/bad-model/safety never trigger fallback",
    );
  }

  // TTS-14: Same primary & fallback avoids duplicate call
  {
    let sameCalls = 0;
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "h_1", role: "specialist", text: "Already Lite" }),
      {
        apiKey: "test-key",
        env: {
          GEMINI_TTS_MODEL: LITE_GEMINI_TTS_MODEL,
          GEMINI_TTS_FALLBACK_MODEL: LITE_GEMINI_TTS_MODEL,
        },
        transport: async () => {
          sameCalls += 1;
          throw { status: 429, message: "Busy", headers: { "retry-after": "5" } };
        },
      },
    );
    check(
      res.status === 429 &&
        sameCalls === 1 &&
        res.headers.get("x-kuro-tts-fallback-used") === "false",
      "[WP-011.5 TTS 14] Same primary and fallback model avoids duplicate call",
    );
  }

  // TTS-15 & 19 & 20: Both primary and fallback fail bounded at 2 attempts / 1 switch
  {
    const seenModels = [];
    const bothFail = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_05", speakerId: "h_2", role: "moderator", text: "Both daily limited" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          seenModels.push(req.model);
          throw {
            status: 429,
            message: "Daily quota exceeded",
            headers: { "retry-after": "68036" },
          };
        },
      },
    );
    const jsonText = await bothFail.text();
    const json = JSON.parse(jsonText);
    check(
      bothFail.status === 429 &&
        seenModels.length === 2 &&
        seenModels[0] === PRIMARY_GEMINI_TTS_MODEL &&
        seenModels[1] === LITE_GEMINI_TTS_MODEL &&
        bothFail.headers.get("x-kuro-tts-quota-class") === "long_quota_wait" &&
        bothFail.headers.get("retry-after") === "68036" &&
        json?.error?.quotaClass === "long_quota_wait" &&
        !jsonText.includes(PRIMARY_GEMINI_TTS_MODEL) &&
        !jsonText.includes(LITE_GEMINI_TTS_MODEL),
      "[WP-011.5 TTS 15,19,20,25] Both-model 429 fails cleanly in 2 calls without leaking model IDs",
    );
  }

  // TTS-17 & 18 & 21: Primary empty regen stays on primary; fallback corrupt regen hits ceiling <= 3; zero hidden SDK retries
  {
    const primarySeen = [];
    const primaryEmptyRes = await generateSegmentTts(
      GenerateTtsRequestSchema.parse({ segmentId: "seg_01", speakerId: "h_1", role: "explainer", text: "Repair primary" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          primarySeen.push(req.model);
          if (primarySeen.length === 1) return { base64Data: "", mimeType: "audio/wav" };
          return { base64Data: VALID_WAV_B64, mimeType: "audio/wav" };
        },
      },
    );

    const fallbackSeen = [];
    const fallbackBadRes = await generateSegmentTts(
      GenerateTtsRequestSchema.parse({ segmentId: "seg_02", speakerId: "h_2", role: "learner", text: "Repair fallback" }),
      {
        apiKey: "test-key",
        env: {},
        transport: async (req) => {
          fallbackSeen.push(req.model);
          if (req.model === PRIMARY_GEMINI_TTS_MODEL) {
            throw { status: 429, headers: { "retry-after": "10" }, message: "Short limit" };
          }
          return { base64Data: Buffer.from("NOT_WAV_BYTES").toString("base64"), mimeType: "audio/wav" };
        },
      },
    );

    const clientSrc = fs.readFileSync(path.join(root, "src/lib/tts/gemini-tts-client.ts"), "utf8");
    const envExample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
    check(
      primaryEmptyRes.ok &&
        primaryEmptyRes.meta.sdkRetryDisabled === true &&
        primarySeen.join(",") === `${PRIMARY_GEMINI_TTS_MODEL},${PRIMARY_GEMINI_TTS_MODEL}` &&
        !fallbackBadRes.ok &&
        fallbackBadRes.meta.providerAttempts === MAX_TTS_PROVIDER_ATTEMPTS &&
        fallbackSeen.join(",") === `${PRIMARY_GEMINI_TTS_MODEL},${LITE_GEMINI_TTS_MODEL},${LITE_GEMINI_TTS_MODEL}` &&
        clientSrc.includes("retryOptions: { attempts: 1 }") &&
        clientSrc.includes('strategy: "none"') &&
        envExample.includes("GEMINI_TTS_FALLBACK_MODEL=gemini-3.8-flash-lite-tts"),
      "[WP-011.5 TTS 17,18,21,26] Empty/invalid regen obeys <= 3 attempt ceiling and disables hidden SDK retries",
    );
  }

  // TTS-22, 23, 27, 29, 30: C2PA Flash-Lite WAV validates, 6 profiles resolve, queue accepts fallback & revokes URLs
  {
    const inspectedC2pa = decodeAndInspectTtsAudio(FLASH_LITE_C2PA_WAV_B64, "audio/wav");
    let invalidMetaRejected = false;
    try {
      decodeAndInspectTtsAudio(
        makeSyntheticC2paWavBase64({ durationMs: 0 }),
        "audio/wav",
      );
    } catch {
      invalidMetaRejected = true;
    }

    const revoked = [];
    const q = createEpisodeAudioQueueEngine(
      {
        id: "ep_tts_cache_check",
        title: "Cache Check",
        topic: "Opportunity cost",
        tone: "casual",
        length: "quick",
        status: "ready",
        createdAt: "2026-11-26T00:00:00Z",
        hosts: [
          { id: "h1", name: "Maya", role: "explainer", voiceId: "v1", accentColor: "#2563EB", avatarId: "a1" },
          { id: "h2", name: "Leo", role: "learner", voiceId: "v2", accentColor: "#D97706", avatarId: "a2" },
        ],
        segments: [
          { id: "s1", order: 0, speakerId: "h1", text: "Turn one", emotion: "explaining", visualCue: { type: "none" } },
          { id: "s2", order: 1, speakerId: "h2", text: "Turn two", emotion: "curious", visualCue: { type: "none" } },
        ],
      },
      {
        fetchSegmentAudio: async () => ({
          ok: true,
          blob: new Blob(["wav"]),
          contentType: "audio/wav",
          durationMs: 1400,
          fallbackUsed: true,
          quotaClass: "long_quota_wait",
          retryAfterHeader: "68036",
        }),
        audioDriver: {
          async loadAndPlay() { return { ok: true }; },
          async resume() { return { ok: true }; },
          pause() { return 0; },
          stop() {},
          getCurrentTimeSec() { return 0; },
          dispose() {},
        },
        urlApi: {
          createObjectURL: () => "blob:kuro-fallback/1",
          revokeObjectURL: (u) => revoked.push(u),
        },
        minRequestIntervalMs: 1000,
      },
    );
    q.startPreparation();
    await Promise.resolve();
    const s1Ready = q.getSnapshot().segments[0].hasCachedAudio && q.getSnapshot().usedFallbackAudio;
    q.dispose();

    const allSix = HostRoleSchema.options.every((r) => Boolean(resolveKuromateVoiceProfile(r).voice));
    check(
      inspectedC2pa.metadata.sampleRateHz === 24000 &&
        inspectedC2pa.metadata.channels === 1 &&
        inspectedC2pa.metadata.bitDepth === 16 &&
        inspectedC2pa.metadata.durationMs === 1400 &&
        invalidMetaRejected &&
        allSix &&
        s1Ready &&
        revoked.length === 1,
      "[WP-011.5 TTS 22,23,27,29,30] Flash-Lite C2PA WAV, 6 profiles, cache retention, and exact-once revocation pass",
    );
  }

  // Also scan additional client-imported helper & UI files for model/voice/secret leaks
  {
    const prebuiltVoices = ["sulafat", "puck", "kore", "achird", "sadaltager", "erinome"];
    const extraClientFiles = [
      path.join(root, "src/lib/tts/kuromate-identity-ids.ts"),
      path.join(root, "src/lib/tts/retry-after.ts"),
      path.join(root, "src/lib/tts/tts-contract.ts"),
      path.join(root, "src/lib/tts/episode-audio-queue-engine.ts"),
      path.join(root, "src/hooks/use-episode-audio-queue.ts"),
      path.join(root, "src/lib/episode/unified-loading-state.ts"),
      path.join(root, "src/components/kuro/generation-status.tsx"),
      path.join(root, "src/components/kuro/player/player-notice.tsx"),
      path.join(root, "src/components/kuro/player/audio-status-bar.tsx"),
    ];
    const leaked = extraClientFiles.filter((filePath) => {
      const lower = fs.readFileSync(filePath, "utf8").toLowerCase();
      return (
        lower.includes(PRIMARY_GEMINI_TTS_MODEL) ||
        lower.includes(LITE_GEMINI_TTS_MODEL) ||
        lower.includes("gemini_api_key") ||
        lower.includes("@google/genai") ||
        prebuiltVoices.some((voiceName) => new RegExp(`\\b${voiceName}\\b`, "i").test(lower))
      );
    });
    check(
      leaked.length === 0,
      `[WP-011.5 TTS 25b] Client TTS modules exclude Gemini model IDs, prebuilt voice names, SDK, and secrets (leaked=${leaked.length})`,
    );
  }

  // =========================================================================
  // IDENTITY-STABILIZATION & DUAL-QUOTA HARDENING TESTS
  // =========================================================================

  // ID-01..03: Canonical Kuromates retain fixed approved voices across arbitrary role swaps
  {
    const mayaRoles = ["explainer", "learner", "moderator"];
    const leoRoles = ["learner", "explainer", "skeptic"];
    const samRoles = ["skeptic", "learner", "explainer"];

    const mayaVoices = mayaRoles.map((role) =>
      resolveKuromateSynthesisProfile({ speakerId: "host_maya", hostName: "Maya", role }),
    );
    const leoVoices = leoRoles.map((role) =>
      resolveKuromateSynthesisProfile({ speakerId: "host_leo", hostName: "Leo", role }),
    );
    const samVoices = samRoles.map((role) =>
      resolveKuromateSynthesisProfile({ speakerId: "host_sam", hostName: "Sam", role }),
    );

    check(
      mayaVoices.every((p) => p.identityProfileId === "kuromate_maya_v1" && p.voice === "Sulafat" && p.fallbackVoice === "Sulafat") &&
        mayaVoices[0].profileId === "kuromate_explainer_v1" &&
        mayaVoices[1].profileId === "kuromate_learner_v1" &&
        mayaVoices[1].styleInstruction !== mayaVoices[0].styleInstruction,
      "[ID 01] Maya always retains Sulafat across explainer/learner/moderator roles while role changes delivery style",
    );
    check(
      leoVoices.every((p) => p.identityProfileId === "kuromate_leo_v1" && p.voice === "Puck" && p.fallbackVoice === "Puck") &&
        leoVoices[1].profileId === "kuromate_explainer_v1",
      "[ID 02] Leo always retains Puck even when assigned Explainer role",
    );
    check(
      samVoices.every((p) => p.identityProfileId === "kuromate_sam_v1" && p.voice === "Kore" && p.fallbackVoice === "Kore") &&
        samVoices[2].profileId === "kuromate_explainer_v1",
      "[ID 03] Sam always retains Kore across Skeptic/Learner/Explainer roles",
    );
  }

  // ID-04..05: assembleEpisodeCandidate locks Maya/Leo voices on swapped roles & gives unique deterministic guest IDs
  {
    const swappedCandidate = assembleEpisodeCandidate(
      {
        title: "Tradeoffs When Roles Swap",
        hosts: [
          { id: "host_01", name: "Leo", role: "explainer" },
          { id: "host_02", name: "Maya", role: "learner" },
        ],
        segments: [
          { id: "seg_01", order: 0, speakerId: "host_01", text: "Let me explain first.", emotion: "explaining", visualCue: { type: "none" } },
          { id: "seg_02", order: 1, speakerId: "host_02", text: "Wait, why does that happen?", emotion: "curious", visualCue: { type: "none" } },
        ],
      },
      { input: "Opportunity cost", tone: "casual", length: "quick", hostCount: 2 },
    );
    const swappedHosts = swappedCandidate?.hosts ?? [];
    check(
      swappedHosts.length === 2 &&
        swappedHosts[0].voiceId === "kuromate_leo_v1" &&
        swappedHosts[1].voiceId === "kuromate_maya_v1",
      "[ID 04] assembleEpisodeCandidate assigns kuromate_leo_v1 to Leo(explainer) and kuromate_maya_v1 to Maya(learner)",
    );

    const unknownHostsA = resolveEpisodeVoiceIdentities([
      { id: "h_1", name: "Priya" },
      { id: "h_2", name: "Mateo" },
      { id: "h_3", name: "Hana" },
    ]);
    const unknownHostsB = resolveEpisodeVoiceIdentities([
      { id: "h_1", name: "Priya" },
      { id: "h_2", name: "Mateo" },
      { id: "h_3", name: "Hana" },
    ]);
    const assignedA = [unknownHostsA.get("h_1"), unknownHostsA.get("h_2"), unknownHostsA.get("h_3")];
    const assignedB = [unknownHostsB.get("h_1"), unknownHostsB.get("h_2"), unknownHostsB.get("h_3")];
    check(
      new Set(assignedA).size === 3 &&
        assignedA.every((id, i) => id && id === assignedB[i]) &&
        resolveCanonicalIdentityId({ voiceId: "voice_provisional_explainer_01", hostName: "Leo" }) === "kuromate_leo_v1" &&
        Boolean(resolveDeterministicUnknownIdentityId("Priya")) &&
        Boolean(KUROMATE_IDENTITY_PROFILES.kuromate_guest_01_v1),
      "[ID 05] 3 unknown hosts receive deterministic collision-safe guest voices and provisional voiceId defers to hostName",
    );
  }

  // ID-06..07: GenerateTtsRequestSchema identity checks + buildSegmentCacheKey isolation
  {
    const validReq = GenerateTtsRequestSchema.safeParse({
      segmentId: "seg_01",
      speakerId: "host_01",
      role: "explainer",
      profileId: "kuromate_explainer_v1",
      voiceIdentityId: "kuromate_leo_v1",
      voiceId: "kuromate_leo_v1",
      avatarId: "avatar_explainer_01",
      hostName: "Leo",
      text: "Hello world.",
    });
    const mismatchedReq = GenerateTtsRequestSchema.safeParse({
      segmentId: "seg_01",
      speakerId: "host_01",
      role: "explainer",
      voiceIdentityId: "kuromate_maya_v1",
      voiceId: "kuromate_leo_v1",
      text: "Hello world.",
    });
    const invalidIdentityReq = GenerateTtsRequestSchema.safeParse({
      segmentId: "seg_01",
      speakerId: "host_01",
      role: "explainer",
      voiceIdentityId: "Sulafat",
      text: "Hello world.",
    });

    const sampleSeg = { id: "seg_01", order: 0, speakerId: "host_01", text: "Same words", emotion: "explaining", visualCue: { type: "none" } };
    const keyLeo = buildSegmentCacheKey("ep_1", sampleSeg, "explainer", "kuromate_leo_v1");
    const keyMaya = buildSegmentCacheKey("ep_1", sampleSeg, "explainer", "kuromate_maya_v1");
    const keyRole = buildSegmentCacheKey("ep_1", sampleSeg, "learner", "kuromate_leo_v1");

    check(
      validReq.success &&
        !mismatchedReq.success &&
        !invalidIdentityReq.success &&
        keyLeo !== keyMaya &&
        keyLeo !== keyRole,
      "[ID 06,07] Request schema enforces strict voiceIdentityId matching and cache keys isolate identity+role",
    );
  }

  // ID-08..10: Route handler emits identity & hosted-state headers, keeps voice on Flash-Lite fallback, and signals all_hosted_daily_exhausted
  {
    const capturedVoices = [];
    const resFallback = await handleTtsPost(
      makeJsonRequest({
        segmentId: "seg_01",
        speakerId: "host_01",
        role: "explainer",
        voiceIdentityId: "kuromate_leo_v1",
        hostName: "Leo",
        text: "Leo as explainer should still sound like Puck on fallback.",
      }),
      {
        apiKey: "test-key",
        env: {
          GEMINI_TTS_MODEL: PRIMARY_GEMINI_TTS_MODEL,
          GEMINI_TTS_FALLBACK_MODEL: LITE_GEMINI_TTS_MODEL,
        },
        transport: async (req) => {
          capturedVoices.push({ model: req.model, voice: req.voice });
          if (req.model === PRIMARY_GEMINI_TTS_MODEL) {
            throw {
              status: 429,
              message: "Daily RPD limit 10 reached with AIzaSyFakeKey11111",
              headers: { "retry-after": "68036" },
            };
          }
          return {
            base64Data: FLASH_LITE_C2PA_WAV_B64,
            mimeType: "audio/wav",
          };
        },
      },
    );

    const resBothExhausted = await handleTtsPost(
      makeJsonRequest({
        segmentId: "seg_02",
        speakerId: "host_02",
        role: "learner",
        voiceIdentityId: "kuromate_maya_v1",
        hostName: "Maya",
        text: "Maya as learner.",
      }),
      {
        apiKey: "test-key",
        env: {
          GEMINI_TTS_MODEL: PRIMARY_GEMINI_TTS_MODEL,
          GEMINI_TTS_FALLBACK_MODEL: LITE_GEMINI_TTS_MODEL,
        },
        transport: async () => {
          throw {
            status: 429,
            message: "FreeTier quota exhausted for AIzaSyFakeKey00000",
            headers: { "retry-after": "64000" },
          };
        },
      },
    );
    const exhaustedBody = await resBothExhausted.json();
    check(
      resFallback.status === 200 &&
        capturedVoices.length === 2 &&
        capturedVoices[0].voice === "Puck" &&
        capturedVoices[1].voice === "Puck" &&
        resFallback.headers.get("X-Kuro-TTS-Identity") === "kuromate_leo_v1" &&
        resFallback.headers.get("X-Kuro-TTS-Profile") === "kuromate_explainer_v1" &&
        resFallback.headers.get("X-Kuro-TTS-Hosted-State") === "fallback_active" &&
        resBothExhausted.status === 429 &&
        resBothExhausted.headers.get("X-Kuro-TTS-Identity") === "kuromate_maya_v1" &&
        resBothExhausted.headers.get("X-Kuro-TTS-Hosted-State") === "all_hosted_daily_exhausted" &&
        exhaustedBody.error?.hostedState === "all_hosted_daily_exhausted" &&
        exhaustedBody.error?.quotaClass === "long_quota_wait" &&
        !JSON.stringify(exhaustedBody).includes("AIzaSy"),
      "[ID 08-10] Route keeps Puck for Leo(explainer) across primary->fallback, emits X-Kuro-TTS-Identity/Hosted-State, and sanitizes all_hosted_daily_exhausted 429",
    );
    // Reference resolveKuromateIdentityProfile directly so server helper contract stays exercised
    check(
      resolveKuromateIdentityProfile({
        speakerId: "host_99",
        hostName: "Maya",
        role: "skeptic",
      }).approvedVoice === "Sulafat",
      "[ID 11] Direct resolveKuromateIdentityProfile respects Maya regardless of skeptic role",
    );
  }
}

console.log(`ALL ${passed} TTS TESTS PASSED.`);
