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

const { deriveUnifiedLoadingView } = await import("../src/lib/episode/unified-loading-state.ts");
const {
  buildSegmentCacheKey,
  createEpisodeAudioQueueEngine,
  createTtsSessionCircuit,
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
  classifyRetryAfter,
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
    sessionCircuit: opts.sessionCircuit,
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
// SECTION 20 TESTS (1–50): Unified Loading, Opening Buffer, Pacing, 429 Recovery & Cleanup
// =========================================================================

// 1-16, 38. Unified continuous loading panel stages, studio hidden, valid EpisodeSchema gating, sequential Turn 1 -> Turn 2, concurrency 1, 1500ms pacing, decode check, double-click safety
{
  const ep = makeTestEpisode(8, { reverseOrder: true });
  const stage1 = deriveUnifiedLoadingView({ scriptPhase: "generating", episode: null, queueSnapshot: null, hostCount: 2 });
  const stage2 = deriveUnifiedLoadingView({ scriptPhase: "validating", episode: null, queueSnapshot: null, hostCount: 2 });

  check(
    stage1.stage === "generating_script" &&
      stage1.showLoadingPanel === true &&
      stage1.showFullStudio === false &&
      stage1.panelTitle === "Preparing your conversation" &&
      stage2.stage === "validating_script" &&
      stage2.showLoadingPanel === true &&
      stage2.showFullStudio === false &&
      stage2.stepHeading === "Checking the conversation",
    "1-3. Script generation and validation share one continuous panel with studio hidden before EpisodeSchema passes",
  );

  const h = createHarness(ep, { withVerifyPlayable: true });
  const idleSnap = h.controller.getSnapshot();
  const idleLoadingView = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: idleSnap, hostCount: 3 });
  check(
    idleSnap.segments.map((s) => s.order).join(",") === "0,1,2,3,4,5,6,7" &&
      idleLoadingView.showLoadingPanel === true &&
      idleLoadingView.showFullStudio === false &&
      idleLoadingView.canStartPodcast === false &&
      INITIAL_AUDIO_BUFFER_SIZE === 2,
    "9. Ordered init, Start podcast disabled at 0 ready, studio hidden",
  );

  h.controller.startPreparation();
  await flushMicrotasks();
  const sPrep1 = h.controller.getSnapshot();
  const vPrep1 = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: sPrep1, hostCount: 3 });
  check(
    MAX_TTS_CONCURRENCY === 1 &&
      MIN_TTS_REQUEST_INTERVAL_MS === 1500 &&
      h.requests.length === 1 &&
      h.requests[0].payload.segmentId === "seg_01" &&
      h.getInFlight() === 1 &&
      h.getMaxConcurrency() === 1 &&
      vPrep1.stage === "preparing_audio" &&
      vPrep1.showFullStudio === false &&
      vPrep1.voiceCountText === "Opening voices: 0 of 2 ready",
    "4,6,7. Turn 1 requested first sequentially with max concurrency 1 while studio stays hidden",
  );

  await h.advance(300);
  h.resolveSegment("seg_01");
  await flushMicrotasks();
  const vOneReady = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: h.controller.getSnapshot(), hostCount: 3 });
  check(
    h.requests.length === 1 &&
      vOneReady.voicesReadyCount === 1 &&
      vOneReady.canStartPodcast === false &&
      vOneReady.showFullStudio === false,
    "8a,10. Minimum 1500ms interval blocks immediate Turn 2 and Start podcast remains disabled with 1 ready clip",
  );

  await h.advance(1199);
  check(h.requests.length === 1, "8b. Pacing waits full 1500ms");

  await h.advance(1);
  check(
    h.requests.length === 2 &&
      h.requests[1].payload.segmentId === "seg_02" &&
      h.requests[1].startedAt - h.requests[0].startedAt >= 1500 &&
      h.getMaxConcurrency() === 1,
    "5,8. Turn 2 requested second strictly >= 1500ms after Turn 1 start",
  );

  // Corrupt audio fails browser decode check BEFORE marking ready!
  h.setVerifyPlayableResult(false);
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  const vDecodeFail = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: h.controller.getSnapshot(), hostCount: 3 });
  check(
    vDecodeFail.canStartPodcast === false &&
      vDecodeFail.stage === "audio_partial" &&
      h.controller.getSnapshot().segments[1].failureClass === "audio",
    "13. Corrupt Turn 2 clip fails browser decode check before enabling Start podcast",
  );

  // Retry Turn 2 with decodable WAV -> Start podcast enables at 2 ready!
  h.setVerifyPlayableResult(true);
  await h.advance(1600);
  h.controller.retryPreparation();
  await flushMicrotasks();
  await h.advance(400);
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  const sReady = h.controller.getSnapshot();
  const vReady = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: sReady, hostCount: 3 });
  check(
    vReady.stage === "audio_ready" &&
      vReady.canStartPodcast === true &&
      vReady.showFullStudio === false &&
      vReady.voiceCountText === "Opening voices: 2 of 2 ready" &&
      h.requests.length === 3,
    "11. Start podcast enables at 2 verified ready clips and preparation stops before Turn 3",
  );

  // Double-click Start podcast safety: 2 synchronous clicks produce 1 playback start and 0 extra fetches
  h.controller.startPodcast();
  h.controller.startPodcast();
  await flushMicrotasks();
  const sActive = h.controller.getSnapshot();
  const vActive = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: sActive, hostCount: 3 });
  check(
    vActive.showFullStudio === true &&
      vActive.showLoadingPanel === false &&
      sActive.metrics.cacheHitCount === 1 &&
      h.driverStats.loads.length === 1 &&
      h.requests.length === 3,
    "14,38. Start podcast double-click is idempotent, opens full studio, and plays cached Turn 1 immediately",
  );

  await h.advance(1200);
  check(
    h.requests.length === 4 &&
      h.requests[3].payload.segmentId === "seg_03" &&
      h.requests[3].startedAt - h.requests[2].startedAt >= 1500 &&
      h.getMaxConcurrency() === 1,
    "15,16. Turn 3 generates during Turn 1 playback in near priority order respecting pacing and concurrency 1",
  );
  h.controller.dispose();
}

// 12. One-turn episode enables at 1 ready
{
  const ep1 = makeTestEpisode(1);
  const h1 = createHarness(ep1);
  h1.controller.startPreparation();
  await flushMicrotasks();
  h1.resolveSegment("seg_01");
  await flushMicrotasks();
  const v1 = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep1, queueSnapshot: h1.controller.getSnapshot(), hostCount: 2 });
  check(
    v1.stage === "audio_ready" && v1.canStartPodcast === true && v1.voiceCountText === "Opening voices: 1 of 1 ready",
    "12. One-turn episode enables Start podcast with 1 verified clip ready",
  );
  h1.controller.dispose();
}

// 17-22, 50. 429 shared cooldown overrides pacing, Turn 2 recovery, partial start retains Turn 1 + all player controls work cleanly
{
  const hRec = createHarness(makeTestEpisode(4));
  hRec.controller.startPreparation();
  await flushMicrotasks();
  hRec.resolveSegment("seg_01");
  await hRec.advance(1600);
  hRec.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "5" });
  await flushMicrotasks();
  await hRec.advance(3000);
  const cdView = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: makeTestEpisode(4), queueSnapshot: hRec.controller.getSnapshot(), hostCount: 2 });
  check(
    cdView.stage === "audio_cooldown" &&
      hRec.controller.getSnapshot().cooldownActive === true &&
      hRec.requests.length === 2,
    "17,18. 429 activates shared cooldown overriding 1500ms interval",
  );
  await hRec.advance(2100);
  hRec.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    hRec.controller.getSnapshot().audioPreparationStatus === "ready" &&
      hRec.controller.getSnapshot().canStartPodcast === true,
    "20. Turn 2 retry after Retry-After recovers preparation cleanly",
  );
  hRec.controller.dispose();

  const epPart = makeTestEpisode(4);
  const hPart = createHarness(epPart);
  hPart.controller.startPreparation();
  await flushMicrotasks();
  hPart.resolveSegment("seg_01");
  await hPart.advance(1600);
  hPart.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "3" });
  await hPart.advance(3100);
  hPart.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "3" });
  await flushMicrotasks();
  const sPart = hPart.controller.getSnapshot();
  const vPart = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: epPart, queueSnapshot: sPart, hostCount: 2 });
  check(
    vPart.stage === "audio_partial" &&
      vPart.canStartPartial === true &&
      vPart.canRetryAudio === true &&
      sPart.segments[0].hasCachedAudio === true &&
      sPart.segments[1].failureCategory === "transient",
    "21,22. Second Turn 2 failure enables explicit partial start and retains cached Turn 1",
  );

  // Verify partial start & player controls (Next, Prev, Pause, Play, Restart) work cleanly!
  hPart.controller.startWithCaptionsAndAvailableAudio();
  await flushMicrotasks();
  hPart.controller.pause();
  await flushMicrotasks();
  hPart.controller.play();
  await flushMicrotasks();
  hPart.controller.next(); // 0 -> 1 (Turn 2 timed caption fallback)
  await flushMicrotasks();
  const onTurn2 = hPart.controller.getSnapshot();
  hPart.controller.previous(); // 1 -> 0 (cached Turn 1)
  await flushMicrotasks();
  hPart.controller.restart();
  await flushMicrotasks();
  const afterRestart = hPart.controller.getSnapshot();
  check(
    onTurn2.currentIndex === 1 &&
      onTurn2.isTimedFallbackActive === true &&
      onTurn2.isHostedAudioPlaying === false &&
      afterRestart.currentIndex === 0 &&
      afterRestart.status === "paused",
    "50. Player controls (Pause, Play, Next, Prev, Restart) work cleanly after partial start",
  );
  hPart.controller.dispose();
}

// 19, 37, 40, 49. Cancellation clears cooldown/timers/requests, discards stale old-session payloads, and Return to form cleans everything
{
  const ep = makeTestEpisode(4);
  const hCan = createHarness(ep);
  hCan.controller.startPreparation();
  await flushMicrotasks();
  const req0 = hCan.requests[0];
  req0.resolve({ ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "6" });
  await flushMicrotasks();
  hCan.controller.cancelPreparation();
  await flushMicrotasks();
  const timersAfterCancel = hCan.getPendingTimerCount();
  await hCan.advance(7000);
  check(
    timersAfterCancel === 0 &&
      !hCan.controller.getSnapshot().cooldownActive &&
      hCan.requests.length === 1,
    "19,40. Cancellation during cooldown clears timers and aborts scheduled requests cleanly",
  );
  hCan.controller.dispose();
  check(hCan.urlStats.activeUrls.size === 0 && hCan.getPendingTimerCount() === 0, "49. Return to form / dispose clears entire session");

  const hStale = createHarness(ep);
  hStale.controller.startPreparation();
  await flushMicrotasks();
  const oldReq = hStale.requests[0];
  hStale.controller.cancelPreparation(); // bumps session & replay token
  oldReq.resolve({ ok: true, blob: new Blob(["stale-old-session"]), contentType: "audio/wav", durationMs: 2500 });
  await flushMicrotasks();
  check(
    oldReq.aborted &&
      hStale.controller.getSnapshot().readyCount === 0 &&
      hStale.controller.getSnapshot().canStartPodcast === false,
    "37. Stale response from cancelled/old session is discarded cleanly",
  );
  hStale.controller.dispose();
}

// 23-30, 35-36. Missing key, auth failure, safety rejection, non-fatal 429 continuation, cache survival, Replay cache reuse vs permanent retention
{
  const hKey = createHarness(makeTestEpisode(4));
  hKey.controller.startPreparation();
  await flushMicrotasks();
  hKey.resolveSegment("seg_01", { ok: false, httpStatus: 503, errorCode: "TTS_NOT_CONFIGURED", message: "Missing server key.", retryable: false });
  await flushMicrotasks();
  const sKey = hKey.controller.getSnapshot();
  check(
    sKey.outageState === "config_error" &&
      sKey.segments[0].failureCategory === "permanent" &&
      sKey.segments[0].manualRetryAvailable === false &&
      hKey.requests.length === 1 &&
      hKey.getPendingTimerCount() === 0,
    "23. Missing key stops provider scheduler immediately with permanent status and 0 retries",
  );
  hKey.controller.continueWithTimedCaptions();
  await flushMicrotasks();
  check(
    hKey.controller.getSnapshot().isTimedFallbackActive === true &&
      hKey.controller.getSnapshot().isHostedAudioPlaying === false,
    "35,36. Timed fallback never displays Speaking or overlaps hosted audio",
  );
  hKey.controller.dispose();

  const hAuth = createHarness(makeTestEpisode(4));
  hAuth.controller.startPreparation();
  await flushMicrotasks();
  hAuth.resolveSegment("seg_01", { ok: false, httpStatus: 401, errorCode: "TTS_GENERATION_FAILED", message: "Credentials invalid.", retryable: false });
  await flushMicrotasks();
  check(
    hAuth.controller.getSnapshot().outageState === "auth_error" &&
      hAuth.controller.getSnapshot().segments[0].failureCategory === "permanent" &&
      hAuth.requests.length === 1,
    "24. Auth failure stops provider scheduler immediately with 0 retries",
  );
  hAuth.controller.dispose();

  // Safety + Non-fatal 429 + Cache survival + Replay reuse/recovery vs permanent retention
  const hPlay = createHarness(makeTestEpisode(6));
  hPlay.controller.play();
  await flushMicrotasks();
  hPlay.resolveSegment("seg_01"); // Turn 0 ready & playing
  await hPlay.advance(1600);
  // seg_02 hits safety rejection (permanent, 0 retries)
  hPlay.resolveSegment("seg_02", { ok: false, httpStatus: 502, errorCode: "TTS_GENERATION_FAILED", message: "Blocked by safety policy", retryable: false });
  await hPlay.advance(1600);
  check(
    hPlay.requests.filter((r) => r.payload.segmentId === "seg_02").length === 1 &&
      hPlay.controller.getSnapshot().segments[1].failureCategory === "permanent" &&
      hPlay.controller.getSnapshot().segments[1].manualRetryAvailable === false,
    "25. Safety rejection is permanent and never retried",
  );

  // seg_03 & seg_04 hit 429 twice -> outageState remains none, seg_01 remains cached, seg_05 still generates!
  hPlay.resolveSegment("seg_03", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await hPlay.advance(2100);
  hPlay.resolveSegment("seg_03", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await flushMicrotasks();
  hPlay.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 timed fallback ~4.6s)
  await hPlay.advance(2500); // seg_03 cooldown expires -> seg_04 starts in lookahead [1..3]
  hPlay.resolveSegment("seg_04", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await hPlay.advance(2100);
  hPlay.resolveSegment("seg_04", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await hPlay.advance(6000); // enters Turn 2 & cooldown expires -> seg_05 starts in [2..4]
  check(
    hPlay.controller.getSnapshot().outageState === "none" &&
      hPlay.controller.getSnapshot().segments[0].hasCachedAudio === true &&
      hPlay.requests.some((r) => r.payload.segmentId === "seg_05"),
    "26,27. Mid-episode 429s preserve ready cache and do not permanently halt future generation",
  );

  // Resolve seg_05 & seg_06 cleanly to reach completion
  let loops = 0;
  while (hPlay.controller.getSnapshot().status !== "complete" && loops++ < 30) {
    const snap = hPlay.controller.getSnapshot();
    const gen = snap.segments.find((s) => s.status === "generating");
    if (gen) {
      hPlay.resolveSegment(gen.segmentId);
      await flushMicrotasks();
      continue;
    }
    if (snap.cooldownActive) {
      await hPlay.advance(2100);
    } else if (snap.currentSegmentFailed) {
      await hPlay.advance(9000);
    } else if (snap.status === "playing") {
      hPlay.getActiveCallbacks().onEnded();
      await flushMicrotasks();
    } else {
      await hPlay.advance(1600);
    }
  }
  check(
    hPlay.controller.getSnapshot().status === "complete" &&
      hPlay.controller.getSnapshot().liveAnnouncement === "Episode complete.",
    "48. Episode completion is announced cleanly",
  );

  // Replay reuses seg_01, seg_05, seg_06; retries transient seg_03 & seg_04; skips permanent seg_02!
  const callsBeforeReplay = hPlay.requests.length;
  hPlay.controller.replay();
  await hPlay.advance(1600);
  const firstReplayCalls = hPlay.requests.slice(callsBeforeReplay).map((r) => r.payload.segmentId);
  check(
    firstReplayCalls.length === 1 &&
      firstReplayCalls[0] === "seg_03" &&
      !firstReplayCalls.includes("seg_01") &&
      !firstReplayCalls.includes("seg_02"),
    "28,29,30. Replay reuses cached seg_01, skips permanent seg_02, and progressively retries transient seg_03",
  );
  hPlay.controller.dispose();
  const allUrlsOnce = Array.from(hPlay.urlStats.createdCounts.keys()).every(
    (u) => hPlay.urlStats.revokedCounts.get(u) === 1,
  );
  check(hPlay.urlStats.activeUrls.size === 0 && allUrlsOnce, "39. Object URLs are revoked exactly once");
}

// 31-34. Manual Retry targets one segment, respects pacing, deduplicates rapid clicks, enforces bound 1 per cycle
{
  const epRetry = makeTestEpisode(3);
  epRetry.segments[1].text =
    "This longer explanation covers opportunity cost choices between studying for exams, commuting across town, and working part-time shifts in clear detail.";
  const h = createHarness(epRetry);
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await h.advance(1600);
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Busy", retryable: true });
  await h.advance(2100);
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Busy", retryable: true });
  await flushMicrotasks();

  h.getActiveCallbacks().onEnded(); // 0 -> 1 (Turn 1 seg_02 failed)
  await h.advance(1600); // seg_03 starts
  h.resolveSegment("seg_03");
  await h.advance(100); // only 100ms after seg_03 start!
  const seg3Start = h.requests[h.requests.length - 1].startedAt;
  const countBefore = h.requests.length;

  h.controller.retryCurrentSegment();
  h.controller.retryCurrentSegment(); // rapid click dedupe!
  await flushMicrotasks();
  const firedTooEarly = h.requests.length > countBefore;
  await h.advance(1450);
  const added = h.requests.slice(countBefore);
  check(
    !firedTooEarly &&
      added.length === 1 &&
      added[0].payload.segmentId === "seg_02" &&
      added[0].startedAt - seg3Start >= 1500,
    "31,32,33. Manual Retry targets one segment, respects 1500ms pacing, and deduplicates rapid clicks",
  );

  // Manual retry fails again -> limit_reached enforces 1 manual retry per cycle
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Busy again", retryable: true });
  await flushMicrotasks();
  const afterFail = h.controller.getSnapshot();
  h.controller.retryCurrentSegment();
  await flushMicrotasks();
  check(
    afterFail.currentSegmentRetryDisabledReason === "limit_reached" &&
      afterFail.segments[1].manualRetryAvailable === false &&
      h.requests.length === countBefore + 1,
    "34. Manual retry bound (1 per cycle) is strictly enforced",
  );
  h.controller.dispose();
}

// 41-47. Config clamping, fallback, bounds, zero speechSynthesis/local-TTS/storage/audio-files
{
  check(
    resolveTtsRequestIntervalMs(undefined) === 1500 &&
      resolveTtsRequestIntervalMs("abc") === 1500 &&
      resolveTtsRequestIntervalMs("0") === 1500,
    "41. Invalid interval config falls back to 1500",
  );
  check(
    resolveTtsRequestIntervalMs("500") === 1000 &&
      resolveTtsRequestIntervalMs("2200") === 2200 &&
      resolveTtsRequestIntervalMs("9000") === 5000,
    "42. Interval clamps strictly to 1000-5000",
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
    "47. Provider-call bounds remain explicit",
  );

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
  const pkgJsonText = fs.readFileSync(path.join(root, "package.json"), "utf8").toLowerCase();
  const localTtsTokens = ["kokoro", "onnxruntime", "@huggingface/transformers", "transformers.js", "piper"];
  const badLocalTtsPkg = localTtsTokens.filter((tok) => pkgJsonText.includes(tok));
  const badLocalTtsSrc = srcFiles.filter((f) => {
    const txt = fs.readFileSync(f, "utf8").toLowerCase();
    return localTtsTokens.some((tok) => txt.includes(tok));
  });
  const trackedAudio = execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => /\.(wav|mp3|pcm|ogg|py)$/i.test(f));

  check(badSpeech.length === 0, "43. No browser speech fallback in src/");
  check(
    badLocalTtsPkg.length === 0 &&
      badLocalTtsSrc.length === 0 &&
      !fs.existsSync(path.join(root, "src/components/kuro/player/audio-preparation-panel.tsx")),
    "44. No local TTS package and no separate audio-preparation-panel.tsx",
  );
  check(badStorage.length === 0, "45. No permanent browser audio storage in src/");
  check(trackedAudio.length === 0, "46. No generated audio or Python files tracked");
}

// =========================================================================
// WP-011.5 SECTION 17 TESTS (Queue 1-15): Fallback Opening Buffer, Long Quota Circuit Breaker, Mixed Sync & Scope Guard
// =========================================================================

// Queue 1, 3, 4, 5, 6, 11: Opening buffer via fallback, circuit-open routing, shared cache, zero-call Replay, episode notice
{
  const sharedCircuit = createTtsSessionCircuit();
  const ep = makeTestEpisode(4);
  const h = createHarness(ep, { sessionCircuit: sharedCircuit });
  h.controller.startPreparation();
  await flushMicrotasks();

  // Turn 1 hits primary daily quota on server -> server falls back & returns audio + long_quota_wait headers
  h.resolveSegment("seg_01", {
    ok: true,
    blob: new Blob(["fallback-wav-1"]),
    contentType: "audio/wav",
    durationMs: 2800,
    fallbackUsed: true,
    quotaClass: "long_quota_wait",
    retryAfterHeader: "68036",
  });
  await flushMicrotasks();
  const vDuringPrep = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: h.controller.getSnapshot(), hostCount: 3 });
  check(
    sharedCircuit.isPrimaryOpen(h.getNow()) === true &&
      h.controller.getSnapshot().primaryCircuitOpen === true &&
      h.controller.getSnapshot().usedFallbackAudio === true &&
      vDuringPrep.fallbackNotice ===
        "Kuro’s primary hosted voice reached today’s limit, so an available Kuromate voice is being used.",
    "[WP-011.5 Queue 01a] Turn 1 fallback opens session circuit and sets loading panel disclosure",
  );

  await h.advance(1550);
  h.resolveSegment("seg_02", {
    ok: true,
    blob: new Blob(["fallback-wav-2"]),
    contentType: "audio/wav",
    durationMs: 2900,
    fallbackUsed: true,
    quotaClass: "none",
  });
  await flushMicrotasks();

  const readySnap = h.controller.getSnapshot();
  const readyView = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: readySnap, hostCount: 3 });
  check(
    readyView.stage === "audio_ready" &&
      readyView.canStartPodcast === true &&
      h.requests[1].payload.routePreference === "fallback" &&
      readySnap.audioSourceSummary === "fallback",
    "[WP-011.5 Queue 01b,03,04,06] Turn 2 routes directly to fallback, caches in same cache, enables Start podcast, tracks episode-level fallback",
  );

  // Start podcast & resolve remaining turns cleanly
  h.controller.startPodcast();
  await h.advance(1600);
  h.resolveSegment("seg_03", { ok: true, blob: new Blob(["fb-3"]), contentType: "audio/wav", durationMs: 2100, fallbackUsed: true });
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 0 -> 1
  await h.advance(1600);
  h.resolveSegment("seg_04", { ok: true, blob: new Blob(["fb-4"]), contentType: "audio/wav", durationMs: 2100, fallbackUsed: true });
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 1 -> 2
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 2 -> 3
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // complete!
  await flushMicrotasks();

  const beforeReplayCount = h.requests.length;
  h.controller.replay();
  await h.advance(2000);
  const sDone = h.controller.getSnapshot();
  check(
    sDone.status === "playing" &&
      h.requests.length === beforeReplayCount &&
      h.requests.slice(1).every((r) => r.payload.routePreference === "fallback") &&
      h.getMaxConcurrency() === 1 &&
      sDone.metrics.minObservedRequestIntervalMs >= 1500,
    "[WP-011.5 Queue 05,11] Replay makes 0 calls for cached fallback clips while preserving concurrency 1 and >=1500ms pacing",
  );

  // Queue 10: Shared session circuit carries over to a new episode and resets on expiry/reset
  const ep2 = makeTestEpisode(2);
  const h2 = createHarness(ep2, { sessionCircuit: sharedCircuit });
  h2.controller.startPreparation();
  await flushMicrotasks();
  check(
    h2.requests.length === 1 && h2.requests[0].payload.routePreference === "fallback",
    "[WP-011.5 Queue 10a] Same-session new episode reuses open circuit and routes straight to fallback",
  );
  h.controller.dispose();
  h2.controller.dispose();

  sharedCircuit.reset();
  const h3 = createHarness(ep2, { sessionCircuit: sharedCircuit });
  h3.controller.startPreparation();
  await flushMicrotasks();
  check(
    h3.requests.length === 1 && h3.requests[0].payload.routePreference === undefined,
    "[WP-011.5 Queue 10b] Session circuit reset returns new episode to primary routing",
  );
  h3.controller.dispose();
}

// Queue 2 & 8 & 9: Long Retry-After both-model exhaustion skips 8s loops, enters timed captions cleanly, and manual retry respects circuit
{
  const sharedCircuit = createTtsSessionCircuit();
  const ep = makeTestEpisode(3);
  const h = createHarness(ep, { sessionCircuit: sharedCircuit });
  h.controller.startPreparation();
  await flushMicrotasks();

  h.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Daily quota reached.",
    retryable: true,
    retryAfterHeader: "68036",
    quotaClass: "long_quota_wait",
  });
  await flushMicrotasks();

  const snapExhausted = h.controller.getSnapshot();
  const viewExhausted = deriveUnifiedLoadingView({ scriptPhase: "idle", episode: ep, queueSnapshot: snapExhausted, hostCount: 2 });
  await h.advance(35_000);
  check(
    snapExhausted.outageState === "quota_exhausted" &&
      snapExhausted.longQuotaExhausted === true &&
      snapExhausted.cooldownActive === false &&
      h.getPendingTimerCount() === 0 &&
      h.requests.length === 1 &&
      viewExhausted.stage === "audio_unavailable" &&
      viewExhausted.isLongQuotaWait === true &&
      viewExhausted.countdownText === null &&
      viewExhausted.canContinueTimedCaptions === true &&
      sharedCircuit.isPrimaryOpen(h.getNow()) === true,
    "[WP-011.5 Queue 02,08] Long daily quota 429 skips 8s loop & multi-hour wait and offers timed captions immediately",
  );

  // Explicit timed captions start cleanly
  h.controller.continueWithTimedCaptions();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().audioMode === "timed-fallback" &&
      h.controller.getSnapshot().isTimedFallbackActive === true &&
      h.controller.getSnapshot().audioSourceSummary === "caption-only",
    "[WP-011.5 Queue 08b] Explicit timed captions playback starts cleanly when both models hit daily quota",
  );

  // Both models exhausted opens allHostedDailyExhausted circuit and blocks manual & new-episode retry calls
  const countBeforeManualBlocked = h.requests.length;
  h.controller.retryHostedAudio();
  h.controller.retryCurrentSegment();
  await flushMicrotasks();
  await h.advance(2000);
  const epBlockedNext = makeTestEpisode(2);
  const hBlockedNext = createHarness(epBlockedNext, { sessionCircuit: sharedCircuit });
  hBlockedNext.controller.startPreparation();
  await flushMicrotasks();
  const snapBlockedNext = hBlockedNext.controller.getSnapshot();
  check(
    h.requests.length === countBeforeManualBlocked &&
      snapExhausted.allHostedDailyExhausted === true &&
      snapExhausted.hostedTtsState === "all_hosted_daily_exhausted" &&
      viewExhausted.stepHeading === "Hosted voice limit reached for today" &&
      viewExhausted.canRetryAudio === false &&
      hBlockedNext.requests.length === 0 &&
      snapBlockedNext.allHostedDailyExhausted === true &&
      snapBlockedNext.episodeAudioSummaryLabel === "Hosted voice limit reached" &&
      !String(snapBlockedNext.notice ?? "").includes("synchronized Kuromate audio active"),
    "[WP-011.5 Queue 09a] All-hosted daily exhaustion blocks redundant retries & second-episode provider calls with cohesive notices",
  );
  h.controller.dispose();
  hBlockedNext.controller.dispose();

  // Primary-only circuit open (fallback still available) lets manual retry route to fallback
  const primaryOnlyCircuit = createTtsSessionCircuit();
  primaryOnlyCircuit.openPrimary(1_700_000_000_000, 68036);
  const hPrimaryOnly = createHarness(makeTestEpisode(2), { sessionCircuit: primaryOnlyCircuit });
  hPrimaryOnly.controller.startPreparation();
  await flushMicrotasks();
  const reqPrimaryOnly = hPrimaryOnly.requests[0];
  primaryOnlyCircuit.reset();
  hPrimaryOnly.controller.dispose();

  // Circuit clears after daily reset window elapses
  sharedCircuit.openAllHostedDailyExhausted(1_700_000_000_000, 600);
  check(
    reqPrimaryOnly.payload.routePreference === "fallback" &&
      sharedCircuit.isAllHostedDailyExhausted(1_700_000_000_000) === true &&
      sharedCircuit.isAllHostedDailyExhausted(1_700_000_000_000 + 601_000) === false,
    "[WP-011.5 Queue 09b] Primary-only circuit routes manual/new attempts to fallback and daily circuit resets cleanly after expiry",
  );
}

// Queue 16: Queue attaches stable voiceIdentityId on swapped-role hosts and isolates cache key
{
  const swappedEp = {
    id: "ep_swapped_roles_q16",
    title: "Swapped Roles",
    topic: "Margins",
    tone: "casual",
    length: "quick",
    status: "ready",
    createdAt: "2026-11-26T00:00:00Z",
    hosts: [
      { id: "h_leo", name: "Leo", role: "explainer", voiceId: "kuromate_leo_v1", accentColor: "#2563EB", avatarId: "avatar_explainer_01" },
      { id: "h_maya", name: "Maya", role: "learner", voiceId: "kuromate_maya_v1", accentColor: "#D97706", avatarId: "avatar_learner_02" },
    ],
    segments: [
      { id: "seg_01", order: 0, speakerId: "h_leo", text: "Leo turn one.", emotion: "explaining", visualCue: { type: "none" } },
      { id: "seg_02", order: 1, speakerId: "h_maya", text: "Maya turn two.", emotion: "curious", visualCue: { type: "none" } },
    ],
  };
  const hSwap = createHarness(swappedEp);
  hSwap.controller.startPreparation();
  await flushMicrotasks();
  hSwap.resolveSegment("seg_01", { ok: true, blob: new Blob(["leo"]), contentType: "audio/wav", durationMs: 1400, fallbackUsed: false });
  await hSwap.advance(1600);
  hSwap.resolveSegment("seg_02", { ok: true, blob: new Blob(["maya"]), contentType: "audio/wav", durationMs: 1400, fallbackUsed: false });
  await flushMicrotasks();
  const snapSwap = hSwap.controller.getSnapshot();
  check(
    hSwap.requests.length === 2 &&
      hSwap.requests[0].payload.voiceIdentityId === "kuromate_leo_v1" &&
      hSwap.requests[0].payload.role === "explainer" &&
      hSwap.requests[1].payload.voiceIdentityId === "kuromate_maya_v1" &&
      hSwap.requests[1].payload.role === "learner" &&
      snapSwap.hostIdentities.h_leo === "kuromate_leo_v1" &&
      snapSwap.hostIdentities.h_maya === "kuromate_maya_v1" &&
      buildSegmentCacheKey("ep", swappedEp.segments[0], "explainer", "kuromate_leo_v1") !==
        buildSegmentCacheKey("ep", swappedEp.segments[0], "explainer", "kuromate_maya_v1"),
    "[WP-011.5 Queue 16] Queue passes stable host voiceIdentityId independently of swapped role and isolates cache keys",
  );
  hSwap.controller.dispose();
}

// Queue 7 & 12: Mixed primary/fallback synchronization + short-cooldown retry routes to fallback (no call multiplication)
{
  const hMix = createHarness(makeTestEpisode(3));
  hMix.controller.startPreparation();
  await flushMicrotasks();
  hMix.resolveSegment("seg_01", {
    ok: true,
    blob: new Blob(["primary-1"]),
    contentType: "audio/wav",
    durationMs: 2500,
    fallbackUsed: false,
    quotaClass: "none",
  });
  await hMix.advance(1600);
  // Turn 2 hits short 429 on first request -> cooldown -> retry sends routePreference: "fallback" (no multiplication!)
  hMix.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Temporary burst limit",
    retryable: true,
    retryAfterHeader: "3",
    quotaClass: "short_cooldown",
  });
  await hMix.advance(3200);
  const retryReq = hMix.requests[hMix.requests.length - 1];
  hMix.resolveSegment("seg_02", {
    ok: true,
    blob: new Blob(["fallback-2"]),
    contentType: "audio/wav",
    durationMs: 2500,
    fallbackUsed: true,
    quotaClass: "none",
  });
  await flushMicrotasks();
  const sMix = hMix.controller.getSnapshot();
  const clsCheck = classifyRetryAfter("3");
  check(
    clsCheck.quotaClass === "short_cooldown" &&
      retryReq.payload.routePreference === "fallback" &&
      sMix.audioSourceSummary === "mixed" &&
      sMix.primaryReadyCount === 1 &&
      sMix.fallbackReadyCount === 1 &&
      sMix.usedFallbackAudio === true &&
      sMix.canStartPodcast === true,
    "[WP-011.5 Queue 07,12] Mixed primary/fallback sync works cleanly and short-cooldown retry avoids call multiplication",
  );
  hMix.controller.dispose();
}

// Queue 13, 14, 15: No permanent storage, no speechSynthesis, no unrelated provider packages/code
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
  const forbiddenPattern =
    /\b(?:deepgram|azure|cognitiveservices|kokoro(?:-js)?|onnxruntime|phonemizer|espeak(?:-ng)?)\b|@huggingface\/transformers/i;
  const pkgBad = forbiddenPattern.test(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const srcBad = srcFiles.filter((f) => {
    const txt = fs.readFileSync(f, "utf8");
    return forbiddenPattern.test(txt) || /sessionstorage\.setitem/i.test(txt);
  });
  check(
    !pkgBad && srcBad.length === 0,
    "[WP-011.5 Queue 13,14,15] Zero Deepgram/Azure/Kokoro/persistent-storage code or dependencies exist",
  );
}

console.log(`ALL ${passed} AUDIO QUEUE TESTS PASSED.`);
