import fs from "node:fs";
import module from "node:module";
import path from "node:path";
import { execSync } from "node:child_process";
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

const {
  createEpisodeAudioQueueEngine,
  INITIAL_AUDIO_BUFFER_SIZE,
  MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT,
  MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT,
  MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT,
  MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE,
  MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE,
  MAX_TTS_CONCURRENCY,
  MIN_TTS_REQUEST_INTERVAL_MS,
  PREFETCH_LOOKAHEAD,
  resolveTtsRequestIntervalMs,
} = await import("../src/lib/tts/episode-audio-queue-engine.ts");
const {
  clampCooldownMs,
  DEFAULT_RATE_LIMIT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  MIN_COOLDOWN_MS,
  parseRetryAfterMs,
} = await import("../src/lib/tts/retry-after.ts");

let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

function makeTestEpisode(turnCount = 8, { reverseOrder = false } = {}) {
  const hosts = [
    { id: "h_exp", name: "Maya", role: "explainer", voiceId: "v1", accentColor: "#2563EB", avatarId: "a1" },
    { id: "h_lrn", name: "Leo", role: "learner", voiceId: "v2", accentColor: "#D97706", avatarId: "a2" },
    { id: "h_skp", name: "Nadia", role: "skeptic", voiceId: "v3", accentColor: "#059669", avatarId: "a3" },
  ];
  const segments = Array.from({ length: turnCount }, (_, idx) => ({
    id: `seg_0${idx + 1}`,
    order: idx,
    speakerId: hosts[idx % hosts.length].id,
    text: `Turn ${idx + 1} explains opportunity cost and real trade-offs clearly.`,
    emotion: idx % 3 === 2 ? "reacting" : idx % 3 === 1 ? "curious" : "explaining",
    visualCue:
      idx === 1
        ? { type: "fact-card", title: "Key Metric", value: "1x paced", explanation: "Sequential TTS concurrency is 1." }
        : idx === 3
          ? {
              type: "comparison",
              title: "Choice Comparison",
              left: { label: "Study", value: "Higher quiz retention" },
              right: { label: "Shift", value: "Immediate hourly wage" },
            }
          : { type: "none" },
  }));
  return {
    id: "ep_queue_test",
    title: "Opportunity Cost Queue Test",
    topic: "Opportunity cost for college commuters",
    tone: "casual",
    length: turnCount <= 10 ? "quick" : "detailed",
    status: "ready",
    hosts,
    segments: reverseOrder ? [...segments].reverse() : segments,
    createdAt: "2026-11-26T00:00:00Z",
  };
}

function createHarness(episode = makeTestEpisode(8), opts = {}) {
  let nowMs = 1_000_000;
  let nextTimerId = 1;
  const timersMap = new Map();

  const timers = {
    setTimeout(fn, ms) {
      const id = nextTimerId++;
      timersMap.set(id, { id, runAt: nowMs + Math.max(0, ms), fn });
      return id;
    },
    clearTimeout(handle) {
      timersMap.delete(handle);
    },
  };

  async function advance(ms) {
    await flushMicrotasks();
    const target = nowMs + ms;
    while (true) {
      let earliest = null;
      for (const t of timersMap.values()) {
        if (t.runAt <= target && (!earliest || t.runAt < earliest.runAt)) {
          earliest = t;
        }
      }
      if (!earliest) break;
      timersMap.delete(earliest.id);
      nowMs = earliest.runAt;
      earliest.fn();
      await flushMicrotasks();
    }
    nowMs = target;
    await flushMicrotasks();
  }

  let seqUrl = 0;
  const createdCounts = new Map();
  const revokedCounts = new Map();
  const activeUrls = new Set();

  const urlApi = {
    createObjectURL() {
      seqUrl += 1;
      const url = `blob:kuro-test/${seqUrl}`;
      createdCounts.set(url, (createdCounts.get(url) ?? 0) + 1);
      activeUrls.add(url);
      return url;
    },
    revokeObjectURL(url) {
      revokedCounts.set(url, (revokedCounts.get(url) ?? 0) + 1);
      activeUrls.delete(url);
    },
  };

  let inFlight = 0;
  let maxConcurrency = 0;
  const requests = [];
  const pendingBySegmentId = new Map();

  const fetchSegmentAudio = (payload, signal) => {
    inFlight += 1;
    if (inFlight > maxConcurrency) maxConcurrency = inFlight;

    return new Promise((resolve, reject) => {
      const rec = {
        payload,
        signal,
        startedAt: nowMs,
        aborted: false,
        settled: false,
        resolve(res) {
          if (rec.settled) return;
          rec.settled = true;
          inFlight = Math.max(0, inFlight - 1);
          resolve(res);
        },
        reject(err) {
          if (rec.settled) return;
          rec.settled = true;
          inFlight = Math.max(0, inFlight - 1);
          reject(err);
        },
      };
      signal.addEventListener(
        "abort",
        () => {
          rec.aborted = true;
          if (!rec.settled) {
            rec.settled = true;
            inFlight = Math.max(0, inFlight - 1);
            resolve({
              ok: false,
              httpStatus: 499,
              errorCode: "TTS_GENERATION_FAILED",
              message: "Cancelled",
              retryable: false,
            });
          }
        },
        { once: true },
      );
      requests.push(rec);
      const list = pendingBySegmentId.get(payload.segmentId) ?? [];
      list.push(rec);
      pendingBySegmentId.set(payload.segmentId, list);
    });
  };

  function resolveSegment(
    segmentId,
    result = { ok: true, blob: new Blob(["wav-bytes"]), contentType: "audio/wav", durationMs: 3200 },
  ) {
    const list = pendingBySegmentId.get(segmentId) ?? [];
    const req = list.find((r) => !r.settled);
    if (req) req.resolve(result);
    return req;
  }

  let currentTimeSec = 0;
  let loadedUrl = null;
  let activeCallbacks = null;
  let nextPlayOutcome = { ok: true };
  let verifyResult = opts.verifyPlayableResult ?? true;
  const driverStats = { loads: [], resumes: 0, pauses: 0, stops: 0, disposes: 0, verifies: 0 };

  const audioDriver = {
    ...(opts.withVerifyPlayable
      ? {
          async verifyPlayable() {
            driverStats.verifies += 1;
            return verifyResult;
          },
        }
      : {}),
    async loadAndPlay(url, startTimeSec, callbacks) {
      loadedUrl = url;
      currentTimeSec = startTimeSec;
      activeCallbacks = callbacks;
      driverStats.loads.push({ url, startTimeSec, callbacks });
      const outcome = nextPlayOutcome;
      nextPlayOutcome = { ok: true };
      if (outcome.ok) {
        callbacks.onLoadedMetadata(3200);
        callbacks.onCanPlay();
        callbacks.onPlay();
      }
      return outcome;
    },
    async resume(callbacks) {
      driverStats.resumes += 1;
      if (callbacks) {
        activeCallbacks = callbacks;
      }
      const outcome = nextPlayOutcome;
      nextPlayOutcome = { ok: true };
      if (outcome.ok && activeCallbacks) {
        activeCallbacks.onPlay();
      }
      return outcome;
    },
    pause() {
      driverStats.pauses += 1;
      activeCallbacks?.onPause();
      return currentTimeSec;
    },
    stop() {
      driverStats.stops += 1;
      loadedUrl = null;
      activeCallbacks = null;
      currentTimeSec = 0;
    },
    getCurrentTimeSec() {
      return currentTimeSec;
    },
    dispose() {
      driverStats.disposes += 1;
      loadedUrl = null;
      activeCallbacks = null;
    },
  };

  const controller = createEpisodeAudioQueueEngine(episode, {
    fetchSegmentAudio,
    audioDriver,
    urlApi,
    timers,
    now: () => nowMs,
    minRequestIntervalMs: opts.minRequestIntervalMs,
  });

  return {
    controller,
    advance,
    requests,
    resolveSegment,
    audioDriver,
    driverStats,
    getNow: () => nowMs,
    getPendingTimerCount: () => timersMap.size,
    setVerifyPlayableResult(v) {
      verifyResult = v;
    },
    setCurrentTimeSec(t) {
      currentTimeSec = t;
    },
    setNextPlayOutcome(o) {
      nextPlayOutcome = o;
    },
    getActiveCallbacks() {
      return activeCallbacks;
    },
    getLoadedUrl() {
      return loadedUrl;
    },
    getMaxConcurrency() {
      return maxConcurrency;
    },
    getInFlight() {
      return inFlight;
    },
    urlStats: { createdCounts, revokedCounts, activeUrls },
  };
}

// =========================================================================
// SECTION 14 TESTS (1–45): Pre-podcast preparation, concurrency=1, >=1500ms pacing, 429 recovery, safety
// =========================================================================

// S1-S8, S17-S21. Initial preparation sequential order, concurrency 1, pacing >= 1500ms, buffer gating, Turn 3 background generation
{
  const h = createHarness(makeTestEpisode(8, { reverseOrder: true }), { withVerifyPlayable: true });
  const initSnap = h.controller.getSnapshot();
  check(
    initSnap.segments.map((s) => s.order).join(",") === "0,1,2,3,4,5,6,7" &&
      initSnap.audioPreparationStatus === "idle" &&
      initSnap.canStartPodcast === false &&
      initSnap.initialBufferTarget === 2 &&
      INITIAL_AUDIO_BUFFER_SIZE === 2,
    "1,7. Ordered initialization, Start podcast disabled at 0 ready clips, initial target=2",
  );

  h.controller.startPreparation();
  await flushMicrotasks();
  const prep1 = h.controller.getSnapshot();
  check(
    MAX_TTS_CONCURRENCY === 1 &&
      MIN_TTS_REQUEST_INTERVAL_MS === 1500 &&
      prep1.audioPreparationStatus === "preparing" &&
      prep1.activePreparingTurnNumber === 1 &&
      h.requests.length === 1 &&
      h.requests[0].payload.segmentId === "seg_01" &&
      h.getInFlight() === 1 &&
      h.getMaxConcurrency() === 1 &&
      prep1.canStartPodcast === false,
    "1,3,4. Preparation requests Turn 1 first sequentially with max concurrency 1",
  );

  // Turn 1 returns quickly (300ms) -> Turn 2 must NOT start until >= 1500ms from Turn 1 start!
  await h.advance(300);
  h.resolveSegment("seg_01");
  await flushMicrotasks();
  check(
    h.requests.length === 1 &&
      h.controller.getSnapshot().initialBufferReadyCount === 1 &&
      h.controller.getSnapshot().canStartPodcast === false,
    "5,7b. Minimum 1500ms interval enforced after fast Turn 1 completion and Start podcast disabled with 1 clip",
  );

  await h.advance(1199); // total elapsed = 1499ms -> still blocked!
  check(h.requests.length === 1, "5b. Interval does not fire before full 1500ms");

  await h.advance(1); // total elapsed = 1500ms -> Turn 2 starts!
  const prep2 = h.controller.getSnapshot();
  check(
    h.requests.length === 2 &&
      h.requests[1].payload.segmentId === "seg_02" &&
      h.requests[1].startedAt - h.requests[0].startedAt >= 1500 &&
      prep2.activePreparingTurnNumber === 2 &&
      h.getMaxConcurrency() === 1,
    "2,5c. Initial preparation requests Turn 2 second strictly >= 1500ms after Turn 1 start",
  );

  // Unplayable corrupt audio must reject readiness during decode check!
  h.setVerifyPlayableResult(false);
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().canStartPodcast === false &&
      h.controller.getSnapshot().audioPreparationStatus === "partial" &&
      h.controller.getSnapshot().segments[1].failureClass === "audio",
    "Prep-decode. Corrupt unplayable clip is rejected before enabling Start podcast",
  );

  // Retry Turn 2 with playable WAV -> verify Start podcast enables only with both clips ready, and no Turn 3 starts yet!
  h.setVerifyPlayableResult(true);
  await h.advance(1600);
  h.controller.retryPreparation();
  await flushMicrotasks();
  const prepRetryCount = h.requests.length;
  check(
    prepRetryCount === 3 &&
      h.requests[2].payload.segmentId === "seg_02" &&
      h.requests[0].payload.segmentId === "seg_01",
    "6. Retry preparation preserves cached Turn 1 clip without refetching it",
  );

  await h.advance(400);
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  const readySnap = h.controller.getSnapshot();
  check(
    readySnap.audioPreparationStatus === "ready" &&
      readySnap.initialBufferReadyCount === 2 &&
      readySnap.canStartPodcast === true &&
      readySnap.hasStartedPodcast === false &&
      readySnap.isHostedAudioPlaying === false &&
      h.requests.length === 3,
    "8. Start podcast enables at 2 verified ready clips and preparation stops before Turn 3",
  );

  // Pausing during preparation must NOT start playback!
  h.controller.pause();
  await flushMicrotasks();
  check(!h.controller.getSnapshot().hasStartedPodcast && h.driverStats.loads.length === 0, "Safe pause during prep does not play audio");

  // User clicks Start podcast -> plays cached Turn 1 immediately (0 fetch for Turn 1) and paces Turn 3 after interval!
  const callsAtStart = h.requests.length;
  h.controller.startPodcast();
  await flushMicrotasks();
  const afterStartSnap = h.controller.getSnapshot();
  check(
    afterStartSnap.hasStartedPodcast === true &&
      afterStartSnap.status === "playing" &&
      afterStartSnap.isHostedAudioPlaying === true &&
      afterStartSnap.metrics.cacheHitCount === 1 &&
      h.requests.length === callsAtStart,
    "17. Starting playback uses cached Turn 1 immediately with zero refetch",
  );

  await h.advance(1200); // > 1500ms since seg_02 started (400 + 1200 = 1600)
  check(
    h.requests.length === callsAtStart + 1 &&
      h.requests[callsAtStart].payload.segmentId === "seg_03" &&
      h.requests[callsAtStart].startedAt - h.requests[callsAtStart - 1].startedAt >= 1500 &&
      h.getMaxConcurrency() === 1,
    "18,19,20,21. Turn 3 generates during Turn 1 playback, strictly concurrency 1, >=1500ms apart, in near priority order",
  );
  h.controller.dispose();
}

// S9. Hypothetical one-segment episode enables Start podcast with 1 ready clip
{
  const hOne = createHarness(makeTestEpisode(1));
  check(hOne.controller.getSnapshot().initialBufferTarget === 1, "9a. One-segment episode targets 1 opening voice");
  hOne.controller.startPreparation();
  await flushMicrotasks();
  hOne.resolveSegment("seg_01");
  await flushMicrotasks();
  const sOne = hOne.controller.getSnapshot();
  check(
    sOne.audioPreparationStatus === "ready" &&
      sOne.canStartPodcast === true &&
      sOne.initialBufferReadyCount === 1,
    "9. One-segment episode enables Start podcast with 1 clip ready",
  );
  hOne.controller.startPodcast();
  await flushMicrotasks();
  check(hOne.controller.getSnapshot().status === "playing", "9b. One-segment episode plays cached clip immediately");
  hOne.controller.dispose();
}

// S10-S12. First ready / second 429 waits for Retry-After, retry succeeds OR allows partial start on second 429
{
  // Retry succeeds
  const hWait = createHarness(makeTestEpisode(4));
  hWait.controller.startPreparation();
  await flushMicrotasks();
  hWait.resolveSegment("seg_01");
  await hWait.advance(1600);
  hWait.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "5",
  });
  await flushMicrotasks();
  const waitSnap = hWait.controller.getSnapshot();
  check(
    waitSnap.audioPreparationStatus === "cooldown" &&
      waitSnap.cooldownActive === true &&
      waitSnap.preparationMessage?.includes("One voice is ready") &&
      waitSnap.canStartPodcast === false,
    "10. First ready / second rate-limited stays in preparation waiting for Retry-After",
  );

  await hWait.advance(5100);
  check(
    hWait.requests.length === 3 && hWait.requests[2].payload.segmentId === "seg_02",
    "10b. Second clip retries after Retry-After expires",
  );
  hWait.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    hWait.controller.getSnapshot().audioPreparationStatus === "ready" &&
      hWait.controller.getSnapshot().canStartPodcast === true,
    "11. Second clip retry succeeds and enables Start podcast",
  );
  hWait.controller.dispose();

  // Retry fails -> explicit partial start!
  const hPart = createHarness(makeTestEpisode(4));
  hPart.controller.startPreparation();
  await flushMicrotasks();
  hPart.resolveSegment("seg_01");
  await hPart.advance(1600);
  hPart.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "3",
  });
  await hPart.advance(3100);
  hPart.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "3",
  });
  await flushMicrotasks();
  const partSnap = hPart.controller.getSnapshot();
  check(
    partSnap.audioPreparationStatus === "partial" &&
      partSnap.canStartPartialPodcast === true &&
      partSnap.canStartPodcast === false,
    "12. Second clip retry failure permits explicit partial start",
  );
  await hPart.advance(3100);
  hPart.controller.startWithCaptionsAndAvailableAudio();
  await flushMicrotasks();
  check(
    hPart.controller.getSnapshot().hasStartedPodcast === true &&
      hPart.controller.getSnapshot().status === "playing",
    "12b. Explicit partial start begins playing Turn 1 from cache",
  );
  hPart.controller.dispose();
}

// S13-S14. First-clip transient failure retries after cooldown; permanent first-clip failure offers timed fallback
{
  const hFirstTrans = createHarness(makeTestEpisode(4));
  hFirstTrans.controller.startPreparation();
  await flushMicrotasks();
  hFirstTrans.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "4",
  });
  await hFirstTrans.advance(3000);
  check(
    hFirstTrans.controller.getSnapshot().audioPreparationStatus === "cooldown" &&
      hFirstTrans.requests.length === 1,
    "13a. First clip transient 429 respects Retry-After before retry",
  );
  await hFirstTrans.advance(1100);
  hFirstTrans.resolveSegment("seg_01");
  await hFirstTrans.advance(1600);
  hFirstTrans.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    hFirstTrans.controller.getSnapshot().audioPreparationStatus === "ready" &&
      hFirstTrans.controller.getSnapshot().canStartPodcast === true,
    "13. First clip transient failure recovers cleanly after Retry-After cooldown",
  );
  hFirstTrans.controller.dispose();

  const hFirstPerm = createHarness(makeTestEpisode(4));
  hFirstPerm.controller.startPreparation();
  await flushMicrotasks();
  hFirstPerm.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_NOT_CONFIGURED",
    message: "Missing server key.",
    retryable: false,
  });
  await flushMicrotasks();
  const permSnap = hFirstPerm.controller.getSnapshot();
  check(
    permSnap.audioPreparationStatus === "unavailable" &&
      permSnap.outageState === "config_error" &&
      permSnap.canRetryPreparation === false &&
      permSnap.canStartPodcast === false &&
      hFirstPerm.requests.length === 1,
    "14. Permanent first-clip failure stops immediately without retry and offers timed fallback",
  );
  hFirstPerm.controller.continueWithTimedCaptions();
  await flushMicrotasks();
  check(
    hFirstPerm.controller.getSnapshot().audioMode === "timed-fallback" &&
      hFirstPerm.controller.getSnapshot().status === "playing" &&
      hFirstPerm.controller.getSnapshot().isTimedFallbackActive === true &&
      hFirstPerm.controller.getSnapshot().isHostedAudioPlaying === false,
    "14b,28. Explicit timed fallback marks stage timed without hosted Speaking state",
  );
  hFirstPerm.controller.dispose();
}

// S15-S16. Preparation cancellation aborts requests and discards stale responses
{
  const hCan = createHarness(makeTestEpisode(4));
  hCan.controller.startPreparation();
  await flushMicrotasks();
  const prepReq = hCan.requests[0];
  hCan.controller.cancelPreparation();
  prepReq.resolve({ ok: true, blob: new Blob(["stale-prep"]), contentType: "audio/wav", durationMs: 2500 });
  await flushMicrotasks();
  const canSnap = hCan.controller.getSnapshot();
  check(
    prepReq.aborted &&
      canSnap.audioPreparationStatus === "cancelled" &&
      canSnap.canStartPodcast === false &&
      canSnap.readyCount === 0 &&
      hCan.getPendingTimerCount() === 0,
    "15,16,36. Preparation cancellation aborts requests, clears timers, and discards stale payloads",
  );
  hCan.controller.dispose();
}

// S22-S28. 429 pauses entire scheduler, Retry-After overrides 1500ms interval, resumes after cooldown, TWO 429s do NOT permanently disable later segments!
{
  const h = createHarness(makeTestEpisode(6));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await h.advance(1600);
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "6",
  });
  await flushMicrotasks();

  // Retry-After 6s MUST override normal 1500ms interval!
  await h.advance(4000);
  const pausedCdSnap = h.controller.getSnapshot();
  check(
    pausedCdSnap.cooldownActive === true &&
      pausedCdSnap.segments[0].hasCachedAudio === true &&
      pausedCdSnap.isHostedAudioPlaying === true &&
      h.requests.length === 2,
    "22,23,26. 429 pauses scheduler, Retry-After (6s) overrides 1500ms interval, and cached audio survives",
  );

  // Advance past 6s cooldown -> seg_02 retries once, fails 429 AGAIN -> enters timed fallback on Turn 2
  await h.advance(2100);
  check(h.requests.length === 3 && h.requests[2].payload.segmentId === "seg_02", "24. Generation resumes after cooldown");
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy again",
    retryable: true,
    retryAfterHeader: "3",
  });
  await flushMicrotasks();

  // Move to Turn 1 (seg_02 timed fallback), wait 3.1s cooldown -> seg_03 gets 429 twice too -> BOTH failed 429!
  h.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 timed fallback!)
  await flushMicrotasks();
  const silentSnap = h.controller.getSnapshot();
  check(
    silentSnap.currentIndex === 1 &&
      silentSnap.currentSegmentFailed === true &&
      silentSnap.isTimedFallbackActive === true &&
      silentSnap.isHostedAudioPlaying === false &&
      silentSnap.notice?.includes("Voice unavailable for this turn"),
    "27,28b. Failed segment enters explicit timed fallback without Speaking state",
  );

  await h.advance(3100); // seg_02's post-fail cooldown expires -> seg_03 starts in lookahead!
  h.resolveSegment("seg_03", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "2",
  });
  await h.advance(2100);
  h.resolveSegment("seg_03", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy again",
    retryable: true,
    retryAfterHeader: "2",
  });
  await flushMicrotasks();

  // CRITICAL: Two consecutive 429 segments (seg_02 and seg_03) must NOT set outageState = provider_outage!
  // Wait for 2s cooldown -> advance fallback turns -> seg_04 still generates hosted audio cleanly!
  check(
    h.controller.getSnapshot().outageState === "none" &&
      h.controller.getSnapshot().audioMode === "hosted",
    "25. Two 429 segments do NOT permanently disable hosted-audio session",
  );

  await h.advance(18_000); // expire cooldowns and fallback timers -> reaches seg_04
  check(
    h.requests.some((r) => r.payload.segmentId === "seg_04"),
    "25b. Later segment (seg_04) continues sequential generation after two 429 segments",
  );
  h.controller.dispose();
}

// S9-S15, S35, S38, S39. Pause/Resume, stale ended, Prev/Next/Restart, Replay preserves cache, completion stops background timers, single announcement
{
  const h = createHarness(makeTestEpisode(4));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await h.advance(1600);
  h.resolveSegment("seg_02");
  await flushMicrotasks();

  const prePauseCallbacks = h.getActiveCallbacks();
  h.setCurrentTimeSec(1.75);
  h.controller.pause();
  await h.advance(10_000);
  check(
    h.controller.getSnapshot().status === "paused" &&
      h.controller.getSnapshot().currentIndex === 0 &&
      h.controller.getSnapshot().stageStatus === "paused",
    "Pause preserves position, clears speaking animation, and does not advance over time",
  );

  h.controller.play();
  await flushMicrotasks();
  const resumedCallbacks = h.getActiveCallbacks();
  check(
    h.driverStats.resumes === 1 &&
      h.controller.getSnapshot().status === "playing" &&
      h.controller.getSnapshot().isHostedAudioPlaying === true &&
      h.controller.getSnapshot().activeSpeakerId === "h_exp",
    "Resume continues cached clip from paused currentTime without refetching",
  );

  resumedCallbacks.onEnded(); // 0 -> 1
  await flushMicrotasks();
  const afterTurn1 = h.controller.getSnapshot();
  check(
    afterTurn1.currentIndex === 1 &&
      afterTurn1.activeSpeakerId === "h_lrn" &&
      afterTurn1.activeHost?.role === "learner" &&
      afterTurn1.currentSegment?.visualCue.type === "fact-card",
    "Real audio ended advances once and synchronizes Kuromate + visual",
  );

  prePauseCallbacks.onEnded();
  resumedCallbacks.onEnded();
  await flushMicrotasks();
  check(h.controller.getSnapshot().currentIndex === 1, "Stale ended event ignored without double advance");

  await h.advance(1600);
  h.resolveSegment("seg_03");
  await flushMicrotasks();
  h.controller.next();
  await flushMicrotasks();
  check(h.controller.getSnapshot().currentIndex === 2 && h.controller.getSnapshot().activeSpeakerId === "h_skp", "Next cancels active playback cleanly");

  h.controller.previous();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentIndex === 1 &&
      h.driverStats.loads[h.driverStats.loads.length - 1].startTimeSec === 0,
    "Previous cancels active playback and restarts selected cached clip from 0 without refetch",
  );

  await h.advance(1600);
  h.resolveSegment("seg_04");
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 1 -> 2
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 2 -> 3
  await flushMicrotasks();
  const reqsBeforeFinish = h.requests.length;
  h.getActiveCallbacks().onEnded(); // 3 -> complete
  await flushMicrotasks();
  const doneSnap = h.controller.getSnapshot();
  check(
    doneSnap.status === "complete" &&
      doneSnap.stageStatus === "complete" &&
      doneSnap.liveAnnouncement === "Episode complete." &&
      doneSnap.metrics.completedTurnsCount === 4 &&
      h.getPendingTimerCount() === 0,
    "39. Episode completion stops pending timers cleanly and announces completion once",
  );

  h.controller.restart();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentIndex === 0 && h.controller.getSnapshot().status === "paused",
    "Restart stops audio cleanly and returns to turn 0 reusing cache",
  );

  h.controller.replay();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().status === "playing" &&
      h.requests.length === reqsBeforeFinish &&
      h.getMaxConcurrency() === 1,
    "29. Replay reuses every cached clip cleanly with 0 refetches and max concurrency 1",
  );
  h.controller.dispose();
  check(h.getPendingTimerCount() === 0 && h.urlStats.activeUrls.size === 0, "35,37. Dispose clears timers and revokes URLs once");
}

// S33-S34. Missing key & auth errors stop background queue immediately with 0 retries
{
  const hKey = createHarness(makeTestEpisode(4));
  hKey.controller.play();
  await flushMicrotasks();
  hKey.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_NOT_CONFIGURED",
    message: "Hosted Kuromate voice preview is not configured on this server.",
    retryable: false,
  });
  await flushMicrotasks();
  const kSnap = hKey.controller.getSnapshot();
  check(
    kSnap.outageState === "config_error" &&
      kSnap.status === "paused" &&
      hKey.requests.length === 1 &&
      hKey.getPendingTimerCount() === 0,
    "33. Missing key trips config_error outage cleanly with zero retries",
  );
  hKey.controller.continueWithTimedCaptions();
  await flushMicrotasks();
  check(
    hKey.controller.getSnapshot().audioMode === "timed-fallback" &&
      hKey.controller.getSnapshot().status === "playing" &&
      hKey.controller.getSnapshot().isTimedFallbackActive === true &&
      hKey.controller.getSnapshot().isHostedAudioPlaying === false,
    "38. Continue with timed captions switches explicitly to timer mode with zero overlap",
  );
  hKey.controller.dispose();

  const hAuth = createHarness(makeTestEpisode(4));
  hAuth.controller.play();
  await flushMicrotasks();
  hAuth.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 401,
    errorCode: "TTS_GENERATION_FAILED",
    message: "Voice service credentials could not be verified on this server.",
    retryable: false,
  });
  await flushMicrotasks();
  check(
    hAuth.controller.getSnapshot().outageState === "auth_error" &&
      hAuth.requests.length === 1 &&
      hAuth.getPendingTimerCount() === 0,
    "34. Auth error sets auth_error outage immediately with zero retries",
  );
  hAuth.controller.dispose();
}

// S40-S42. Provider bounds and server-side pacing interval config clamping & fallback
{
  check(
    resolveTtsRequestIntervalMs(undefined) === 1500 &&
      resolveTtsRequestIntervalMs(null) === 1500 &&
      resolveTtsRequestIntervalMs("") === 1500 &&
      resolveTtsRequestIntervalMs("abc") === 1500 &&
      resolveTtsRequestIntervalMs("-500") === 1500 &&
      resolveTtsRequestIntervalMs("0") === 1500 &&
      resolveTtsRequestIntervalMs("NaN") === 1500,
    "41. Invalid pacing interval config falls back safely to 1500ms",
  );
  check(
    resolveTtsRequestIntervalMs("500") === 1000 &&
      resolveTtsRequestIntervalMs("2200") === 2200 &&
      resolveTtsRequestIntervalMs("9000") === 5000 &&
      resolveTtsRequestIntervalMs(1800) === 1800,
    "42. Valid pacing interval config clamps cleanly inside [1000, 5000] ms",
  );
  check(
    MAX_AUTOMATIC_CAPACITY_RETRIES_PER_SEGMENT === 1 &&
      MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT === 2 &&
      MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE === 1 &&
      MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE === 3 &&
      MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT === 3 &&
      PREFETCH_LOOKAHEAD === 2 &&
      parseRetryAfterMs("0") === MIN_COOLDOWN_MS &&
      parseRetryAfterMs("120") === MAX_COOLDOWN_MS &&
      parseRetryAfterMs("bad") === DEFAULT_RATE_LIMIT_COOLDOWN_MS &&
      clampCooldownMs(5000) === 5000,
    "40. Provider-call bounds and cooldown clamps remain explicit",
  );
}

// =========================================================================
// PR #6 TRANSIENT RECOVERY REGRESSIONS UNDER SEQUENTIAL PACING
// =========================================================================

// S30, Replay resets 429 failures progressively at concurrency=1 & >=1500ms pacing, preserving cached clips
{
  const ep = makeTestEpisode(6);
  const h = createHarness(ep);
  h.controller.play();
  await flushMicrotasks();

  let safetyLoops = 0;
  while (h.controller.getSnapshot().status !== "complete" && safetyLoops++ < 60) {
    const snap = h.controller.getSnapshot();
    const generatingSeg = snap.segments.find((s) => s.status === "generating");
    if (generatingSeg) {
      if (generatingSeg.segmentId === "seg_02" || generatingSeg.segmentId === "seg_05") {
        h.resolveSegment(generatingSeg.segmentId, {
          ok: false,
          httpStatus: 429,
          errorCode: "TTS_RATE_LIMITED",
          message: "Busy",
          retryable: true,
          retryAfterHeader: "2",
        });
      } else {
        h.resolveSegment(generatingSeg.segmentId);
      }
      await flushMicrotasks();
      continue;
    }
    if (snap.cooldownActive) {
      await h.advance(2100);
      continue;
    }
    if (snap.currentSegmentFailed) {
      await h.advance(9000);
      continue;
    }
    if (snap.status === "playing") {
      h.getActiveCallbacks().onEnded();
      await flushMicrotasks();
      continue;
    }
    await h.advance(1600);
  }

  const endPass1 = h.controller.getSnapshot();
  check(
    endPass1.status === "complete" &&
      endPass1.readyCount === 4 &&
      endPass1.failedCount === 2 &&
      endPass1.outageState === "none" &&
      h.getMaxConcurrency() === 1,
    "30-setup. First pass finishes cleanly at 4/6 ready under concurrency 1 without outage on 429",
  );

  // Replay preserves 4 cached clips and progressively retries seg_02 then seg_05 respecting pacing
  const callsBeforeReplay = h.requests.length;
  h.controller.replay();
  await h.advance(1600);
  const replayFirstReq = h.requests.slice(callsBeforeReplay);
  check(
    replayFirstReq.length === 1 &&
      replayFirstReq[0].payload.segmentId === "seg_02" &&
      h.controller.getSnapshot().readyCount === 4 &&
      h.getMaxConcurrency() === 1,
    "30a. Replay preserves cached clips and retries seg_02 sequentially",
  );

  h.resolveSegment("seg_02");
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 ready)
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 1 -> 2 (seg_03 ready)
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 2 -> 3 (seg_04 ready -> triggers seg_05 in lookahead after 1500ms)
  await h.advance(1600);
  h.resolveSegment("seg_05");
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 3 -> 4
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 4 -> 5
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 5 -> complete

  const endPass2 = h.controller.getSnapshot();
  const postReplayIds = h.requests.slice(callsBeforeReplay).map((r) => r.payload.segmentId);
  check(
    endPass2.status === "complete" &&
      endPass2.readyCount === 6 &&
      endPass2.failedCount === 0 &&
      postReplayIds.length === 2 &&
      postReplayIds.includes("seg_02") &&
      postReplayIds.includes("seg_05") &&
      h.getMaxConcurrency() === 1,
    "30. Replay progressively completes 6/6 making 0 fetches for cached clips",
  );
  h.controller.dispose();
}

// S31-S32. Targeted Retry voice targets one segment, respects 1500ms pacing & cooldown, deduplicates rapid clicks, enforces 1-per-cycle bound
{
  const epRetry = makeTestEpisode(3);
  epRetry.segments[1].text =
    "This detailed explanation compares studying for tomorrow's exam against commuting across town and picking up a part-time shift so every single trade-off stays completely clear.";
  const h = createHarness(epRetry);
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await h.advance(1600);
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "3",
  });
  await h.advance(3100);
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "3",
  });
  await flushMicrotasks();

  h.getActiveCallbacks().onEnded(); // 0 -> 1 (Turn 1 seg_02 in timed fallback with active 3s cooldown)
  await flushMicrotasks();
  const cdSnap = h.controller.getSnapshot();
  const reqsDuringCd = h.requests.length;
  h.controller.retryCurrentSegment(); // blocked during cooldown
  check(
    cdSnap.currentSegmentManualRetryDisabled === true &&
      cdSnap.currentSegmentRetryDisabledReason === "cooldown" &&
      h.requests.length === reqsDuringCd,
    "31a. Retry voice is disabled and blocked during Retry-After cooldown",
  );

  // Expire 3s cooldown -> seg_03 finishes cleanly; wait 1.6s pacing while still inside seg_02's 8s turn
  await h.advance(3100);
  h.resolveSegment("seg_03");
  await h.advance(1600);
  const beforeRapid = h.requests.length;
  h.controller.retryCurrentSegment();
  h.controller.retryCurrentSegment(); // rapid second click creates ONLY one request!
  await flushMicrotasks();
  const rapidAdded = h.requests.slice(beforeRapid);
  check(
    rapidAdded.length === 1 &&
      rapidAdded[0].payload.segmentId === "seg_02" &&
      rapidAdded[0].startedAt - h.requests[beforeRapid - 1].startedAt >= 1500 &&
      h.controller.getSnapshot().currentSegmentManualRetryDisabled === true,
    "31,32. Retry voice targets strictly seg_02, deduplicates rapid clicks, and respects pacing",
  );

  h.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    !h.controller.getSnapshot().currentSegmentFailed &&
      h.controller.getSnapshot().currentSegmentHasAudio &&
      h.controller.getSnapshot().isHostedAudioPlaying,
    "31b. Successful Retry voice clears failure state and plays hosted audio",
  );
  h.controller.dispose();

  // Verify rapid Retry voice immediately after another segment request still obeys 1500ms pacing even with 0 cooldown!
  const hPaceRetry = createHarness(makeTestEpisode(4));
  hPaceRetry.controller.play();
  await flushMicrotasks();
  hPaceRetry.resolveSegment("seg_01");
  await hPaceRetry.advance(1600);
  hPaceRetry.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_PROVIDER_UNAVAILABLE",
    message: "Busy",
    retryable: true,
  });
  await hPaceRetry.advance(2100);
  hPaceRetry.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_PROVIDER_UNAVAILABLE",
    message: "Busy",
    retryable: true,
  });
  await flushMicrotasks();
  hPaceRetry.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 failed)
  await hPaceRetry.advance(1600); // seg_03 starts at t_seg3, resetting cooldown/non-capacity
  hPaceRetry.resolveSegment("seg_03"); // completes after 100ms
  await hPaceRetry.advance(100);
  const seg3Start = hPaceRetry.requests[hPaceRetry.requests.length - 1].startedAt;
  const countBeforeManual = hPaceRetry.requests.length;
  hPaceRetry.controller.retryCurrentSegment(); // clicked 100ms after seg_03 start!
  await flushMicrotasks();
  const firedImmediately = hPaceRetry.requests.length > countBeforeManual;
  await hPaceRetry.advance(1450);
  check(
    !firedImmediately &&
      hPaceRetry.requests.length === countBeforeManual + 1 &&
      hPaceRetry.requests[countBeforeManual].payload.segmentId === "seg_02" &&
      hPaceRetry.requests[countBeforeManual].startedAt - seg3Start >= 1500,
    "32b. Manual Retry voice cannot bypass 1500ms request pacing immediately after another request",
  );
  hPaceRetry.controller.dispose();
}

// S43-S45. Static safety scans: zero speechSynthesis, zero persistent storage, zero audio/Python files tracked
{
  const srcFiles = [];
  function walkSrc(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkSrc(full);
      else if (/\.(ts|tsx)$/.test(ent.name)) srcFiles.push(full);
    }
  }
  walkSrc(path.join(root, "src"));
  const badSpeech = srcFiles.filter((f) => fs.readFileSync(f, "utf8").toLowerCase().includes("speechsynthesis"));
  const badStorage = srcFiles.filter((f) => {
    const txt = fs.readFileSync(f, "utf8").toLowerCase();
    return txt.includes("indexeddb") || txt.includes("caches.open") || txt.includes("localstorage.setitem");
  });
  const trackedAudio = execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => /\.(wav|mp3|pcm|ogg|py)$/i.test(f));

  check(badSpeech.length === 0, "43. Zero browser speechSynthesis in src/");
  check(badStorage.length === 0, "44. Zero persistent browser audio storage in src/");
  check(trackedAudio.length === 0, "45. Zero generated audio or Python files tracked in git");
}

console.log(`ALL ${passed} AUDIO QUEUE TESTS PASSED.`);
