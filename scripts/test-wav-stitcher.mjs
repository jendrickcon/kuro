import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function resolveAliasTarget(specifier) {
  let rel = null;
  if (specifier.startsWith("@/")) rel = path.join("src", specifier.slice(2));
  else if (specifier.startsWith("@contracts/")) rel = path.join("contracts", specifier.slice("@contracts/".length));
  else if (specifier.startsWith("@fixtures/")) rel = path.join("fixtures", specifier.slice("@fixtures/".length));
  if (!rel) return null;
  for (const candidate of [rel, `${rel}.ts`, `${rel}.tsx`, path.join(rel, "index.ts")]) {
    const abs = path.join(root, candidate);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return pathToFileURL(abs).href;
  }
  return null;
}

module.registerHooks({
  resolve(specifier, context, nextResolve) {
    const mapped = resolveAliasTarget(specifier);
    if (mapped) return { url: mapped, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const {
  buildEpisodeAudioFilename,
  createSilencePcm,
  parseWavBuffer,
  resolveInterTurnPauseMs,
  resolveTimelineStateAtMs,
  stitchSegmentsToWav,
  wrapPcm16MonoToWav,
  WavParseError,
} = await import("../src/lib/tts/wav-stitcher.ts");

let passed = 0;
function check(cond, label) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

function expectParseError(buf, expectedCode, label) {
  let caught = null;
  try {
    parseWavBuffer(buf);
  } catch (err) {
    caught = err;
  }
  check(
    caught instanceof WavParseError && caught.code === expectedCode,
    `${label} (got=${caught?.code ?? "none"})`,
  );
}

function makeRawWav({
  sampleRate = 24000,
  channels = 1,
  bitDepth = 16,
  audioFormat = 1,
  durationMs = 500,
  preChunkTag = null,
  postChunkTag = null,
  omitFmt = false,
  omitData = false,
  emptyData = false,
  corruptRiffTag = null,
  corruptWaveTag = null,
  overrideRiffSize = null,
  oddDataByte = false,
} = {}) {
  const sampleCount = emptyData ? 0 : Math.round((sampleRate * durationMs) / 1000);
  const blockAlign = (channels * bitDepth) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLen = sampleCount * blockAlign + (oddDataByte ? 1 : 0);

  const chunks = [];
  if (preChunkTag) {
    const b = Buffer.alloc(16);
    b.write(preChunkTag, 0, "ascii");
    b.writeUInt32LE(8, 4);
    b.write("PRECHUNKS", 0, 0);
    chunks.push(b);
  }
  if (!omitFmt) {
    const fmt = Buffer.alloc(24);
    fmt.write("fmt ", 0, "ascii");
    fmt.writeUInt32LE(16, 4);
    fmt.writeUInt16LE(audioFormat, 8);
    fmt.writeUInt16LE(channels, 10);
    fmt.writeUInt32LE(sampleRate, 12);
    fmt.writeUInt32LE(byteRate, 16);
    fmt.writeUInt16LE(blockAlign, 20);
    fmt.writeUInt16LE(bitDepth, 22);
    chunks.push(fmt);
  }
  if (!omitData) {
    const data = Buffer.alloc(8 + dataLen);
    data.write("data", 0, "ascii");
    data.writeUInt32LE(dataLen, 4);
    for (let i = 0; i < Math.floor(dataLen / 2); i += 1) {
      data.writeInt16LE((i % 200) - 100, 8 + i * 2);
    }
    chunks.push(data);
    if (dataLen % 2 === 1) {
      chunks.push(Buffer.alloc(1)); // RIFF pad byte
    }
  }
  if (postChunkTag) {
    const post = Buffer.alloc(20);
    post.write(postChunkTag, 0, "ascii");
    post.writeUInt32LE(12, 4);
    post.write("METADATA1234", 8, "ascii");
    chunks.push(post);
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write(corruptRiffTag ?? "RIFF", 0, "ascii");
  header.writeUInt32LE(overrideRiffSize ?? 4 + body.length, 4);
  header.write(corruptWaveTag ?? "WAVE", 8, "ascii");
  return new Uint8Array(Buffer.concat([header, body]));
}

// 1-4: Valid WAV shapes
{
  const standard = wrapPcm16MonoToWav(new Uint8Array(24_000 * 2));
  const p1 = parseWavBuffer(standard);
  check(p1.sampleRateHz === 24000 && p1.channels === 1 && p1.bitDepth === 16 && p1.durationMs === 1000 && p1.sampleCount === 24000, "1. Valid 44-byte PCM WAV parses cleanly");

  const p2 = parseWavBuffer(makeRawWav({ durationMs: 400, postChunkTag: "LIST" }));
  check(p2.durationMs === 400 && p2.dataBytes === 400 * 24 * 2, "2. Valid WAV with extra trailing LIST chunk parses cleanly");

  const p3 = parseWavBuffer(makeRawWav({ durationMs: 600, postChunkTag: "C2PA" }));
  check(p3.durationMs === 600 && p3.sampleCount === 14400, "3. Valid WAV with Gemini-style trailing C2PA chunk parses cleanly");

  const p4 = parseWavBuffer(makeRawWav({ durationMs: 300, preChunkTag: "JUNK" }));
  check(p4.durationMs === 300 && p4.pcmBytes.byteLength === 300 * 24 * 2, "4. Valid WAV with unknown chunk before fmt/data parses dynamically");
}

// 5-16: Invalid WAV rejections
expectParseError(makeRawWav({ corruptRiffTag: "BAD!" }), "INVALID_RIFF", "5. Rejects corrupt RIFF");
expectParseError(makeRawWav({ corruptWaveTag: "AIFF" }), "INVALID_WAVE", "6. Rejects wrong WAVE");
expectParseError(new Uint8Array(30), "TRUNCATED_HEADER", "7. Rejects truncated <44B header");
{
  const base = Buffer.from(makeRawWav({ durationMs: 100 }));
  expectParseError(new Uint8Array(base.subarray(0, base.length - 50)), "INCONSISTENT_LENGTH", "8. Rejects truncated length mismatch");
}
expectParseError(makeRawWav({ omitFmt: true }), "MISSING_FMT", "9. Rejects missing fmt chunk");
expectParseError(makeRawWav({ omitData: true, postChunkTag: "LIST" }), "MISSING_DATA", "10. Rejects missing data chunk");
expectParseError(makeRawWav({ emptyData: true }), "EMPTY_DATA", "11. Rejects empty data chunk");
expectParseError(makeRawWav({ channels: 2 }), "UNSUPPORTED_CHANNELS", "12. Rejects stereo WAV");
expectParseError(makeRawWav({ sampleRate: 16000 }), "UNSUPPORTED_SAMPLE_RATE", "13. Rejects non-24 kHz WAV");
expectParseError(makeRawWav({ bitDepth: 24 }), "UNSUPPORTED_BIT_DEPTH", "14. Rejects non-16-bit WAV");
expectParseError(makeRawWav({ audioFormat: 3 }), "UNSUPPORTED_FORMAT", "15. Rejects non-PCM format");
expectParseError(makeRawWav({ overrideRiffSize: 12345 }), "INCONSISTENT_LENGTH", "16. Rejects inconsistent RIFF length");
expectParseError(makeRawWav({ oddDataByte: true }), "INVALID_SAMPLE_COUNT", "16b. Rejects odd-byte unaligned PCM data");
{
  const truncChunkBuf = Buffer.alloc(50);
  truncChunkBuf.write("RIFF", 0, "ascii");
  truncChunkBuf.writeUInt32LE(42, 4);
  truncChunkBuf.write("WAVE", 8, "ascii");
  truncChunkBuf.write("fmt ", 12, "ascii");
  truncChunkBuf.writeUInt32LE(999, 16);
  expectParseError(new Uint8Array(truncChunkBuf), "TRUNCATED_CHUNK", "16c. Rejects truncated chunk length past buffer");
}

// 17-29: Silence generation, stitching, monotonic timeline, active-speaker exclusion in pause, round-trip re-parse
{
  const silence250 = createSilencePcm(250);
  check(silence250.byteLength === 250 * 24 * 2 && silence250.every((b) => b === 0), "17-19. Deterministic zero silence PCM matches sample math");

  const pauseStd = resolveInterTurnPauseMs({ emotion: "explaining" }, { emotion: "curious", visualCue: { type: "none" } }, false);
  const pauseReact = resolveInterTurnPauseMs({ emotion: "curious" }, { emotion: "reacting", visualCue: { type: "none" } }, false);
  const pauseTopic = resolveInterTurnPauseMs({ emotion: "explaining" }, { emotion: "curious", visualCue: { type: "fact-card", title: "X", value: "Y", explanation: "Z" } }, false);
  const pauseEnd = resolveInterTurnPauseMs({ emotion: "explaining" }, null, true);
  check(
    pauseStd === 250 && pauseReact === 180 && pauseTopic === 340 && pauseEnd === 0,
    "20. Deterministic pause policy distinguishes handoff, reaction, visual transition, and final 0ms",
  );

  const w1 = parseWavBuffer(makeRawWav({ durationMs: 500, postChunkTag: "C2PA" }));
  const w2 = parseWavBuffer(makeRawWav({ durationMs: 700, preChunkTag: "JUNK" }));
  const w3 = parseWavBuffer(makeRawWav({ durationMs: 400 }));

  const stitched = stitchSegmentsToWav([
    { segmentId: "seg_01", order: 0, speakerId: "h_maya", identityProfileId: "kuromate_maya_v1", role: "explainer", turnKind: "explaining", pcmBytes: w1.pcmBytes },
    { segmentId: "seg_02", order: 1, speakerId: "h_leo", identityProfileId: "kuromate_leo_v1", role: "learner", turnKind: "curious", pcmBytes: w2.pcmBytes, paddingAfterMs: 340 },
    { segmentId: "seg_03", order: 2, speakerId: "h_maya", identityProfileId: "kuromate_maya_v1", role: "explainer", turnKind: "explaining", pcmBytes: w3.pcmBytes },
  ]);

  const expectedPcmBytes = (500 + 250 + 700 + 340 + 400 + 0) * 24 * 2;
  const reparsed = parseWavBuffer(stitched.wavBytes);
  const view = new DataView(stitched.wavBytes.buffer, stitched.wavBytes.byteOffset, stitched.wavBytes.byteLength);

  const t = stitched.timeline;
  const monotonic = t.every((item, idx) =>
    item.order === idx &&
    item.startMs >= 0 &&
    item.speechEndMs > item.speechStartMs &&
    item.endMs >= item.speechEndMs &&
    (idx === 0 || item.startMs === t[idx - 1].endMs),
  );

  // Active speaker excludes padding
  const duringSpeech1 = resolveTimelineStateAtMs(t, 120);
  const duringPause1 = resolveTimelineStateAtMs(t, 550); // inside 500..750 pause!
  const duringSpeech2 = resolveTimelineStateAtMs(t, 800);
  const atEnd = resolveTimelineStateAtMs(t, reparsed.durationMs);

  check(
    stitched.byteLength === 44 + expectedPcmBytes &&
      view.getUint32(4, true) === 36 + expectedPcmBytes &&
      view.getUint32(40, true) === expectedPcmBytes &&
      reparsed.durationMs === 500 + 250 + 700 + 340 + 400 &&
      stitched.totalDurationMs === reparsed.durationMs &&
      t.length === 3 &&
      t[2].paddingAfterMs === 0 &&
      monotonic &&
      duringSpeech1?.segment.segmentId === "seg_01" &&
      duringSpeech1?.isSpeaking === true &&
      duringPause1?.segment.segmentId === "seg_01" &&
      duringPause1?.isSpeaking === false &&
      duringPause1?.isInPadding === true &&
      duringSpeech2?.segment.segmentId === "seg_02" &&
      duringSpeech2?.isSpeaking === true &&
      atEnd?.isSpeaking === false &&
      buildEpisodeAudioFilename({ id: "ep_1", title: "Opportunity Cost: 101 / Guide!" }) === "kuro-episode-opportunity-cost-101-guide.wav",
    "21-29. Complete stitched WAV, RIFF sizes, monotonic timeline, non-overlap, pause non-speaking lookup, filename & re-parse pass",
  );
}

console.log(`ALL ${passed} WAV STITCHER TESTS PASSED.`);
