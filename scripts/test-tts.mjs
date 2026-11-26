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
  ALLOWED_GEMINI_TTS_MODELS,
  classifyGeminiTtsError,
  PRIMARY_GEMINI_TTS_MODEL,
} = await import("../src/lib/tts/gemini-tts-client.ts");
const {
  generateSegmentTts,
  MAX_TTS_MODEL_CHOICES,
  MAX_TTS_PROVIDER_ATTEMPTS,
  MAX_TTS_REGENERATION_ATTEMPTS,
} = await import("../src/lib/tts/gemini-tts-service.ts");
const { createObjectUrlManager } = await import("../src/lib/tts/object-url-manager.ts");
const {
  GenerateTtsFailureSchema,
  GenerateTtsRequestSchema,
  TTS_MAX_AUDIO_BYTES,
  TTS_MAX_TEXT_CHARS,
} = await import("../src/lib/tts/tts-contract.ts");
const { handleTtsPost } = await import("../src/lib/tts/tts-route-handler.ts");
const {
  KUROMATE_VOICE_PROFILES,
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

// 15-19. Provider 429, 503, timeout, auth error, and safety rejection
{
  for (const tc of [
    {
      label: "15. provider 429 maps to 429 TTS_RATE_LIMITED with Retry-After and 1 call",
      err: { status: 429, message: "rate limited", headers: { "retry-after": "7" } },
      expectedStatus: 429,
      expectedCode: "TTS_RATE_LIMITED",
      expectedRetryable: true,
      expectedRetryAfter: "7",
    },
    {
      label: "16. provider 503 maps to 503 TTS_PROVIDER_UNAVAILABLE with 1 call",
      err: { status: 503, message: "503 service unavailable" },
      expectedStatus: 503,
      expectedCode: "TTS_PROVIDER_UNAVAILABLE",
      expectedRetryable: true,
    },
    {
      label: "17. provider timeout maps to 504 TTS_TIMEOUT with 1 call",
      err: { name: "AbortError", message: "aborted after 30000ms" },
      expectedStatus: 504,
      expectedCode: "TTS_TIMEOUT",
      expectedRetryable: true,
    },
    {
      label: "18. authentication failure maps to non-retryable 502 TTS_GENERATION_FAILED without key leak",
      err: { status: 401, message: "API key AIzaSuperSecret123 rejected" },
      expectedStatus: 502,
      expectedCode: "TTS_GENERATION_FAILED",
      expectedRetryable: false,
    },
    {
      label: "19. safety rejection maps to non-retryable 502 TTS_GENERATION_FAILED with 1 call",
      err: { status: 400, message: "Request blocked due to PROHIBITED_CONTENT SAFETY policy" },
      expectedStatus: 502,
      expectedCode: "TTS_GENERATION_FAILED",
      expectedRetryable: false,
    },
  ]) {
    let calls = 0;
    const res = await handleTtsPost(
      makeJsonRequest({ segmentId: "seg_01", speakerId: "host_1", role: "explainer", text: "Error check line." }),
      {
        apiKey: "AIzaSuperSecret123",
        env: {},
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

// 25. Explicit maximum provider-call bound verified
{
  check(
    MAX_TTS_MODEL_CHOICES === 1 &&
      MAX_TTS_REGENERATION_ATTEMPTS === 1 &&
      MAX_TTS_PROVIDER_ATTEMPTS === 2,
    "25. explicit TTS provider-call constants enforce <= 2 total upstream calls per segment",
  );
}

console.log(`ALL ${passed} TTS TESTS PASSED.`);
