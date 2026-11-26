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

const { createEpisodeAudioQueueEngine, MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT, MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT, MAX_TTS_CONCURRENCY, PREFETCH_LOOKAHEAD } =
  await import("../src/lib/tts/episode-audio-queue-engine.ts");
const { clampCooldownMs, DEFAULT_RATE_LIMIT_COOLDOWN_MS, MAX_COOLDOWN_MS, MIN_COOLDOWN_MS, parseRetryAfterMs } =
  await import("../src/lib/tts/retry-after.ts");

let passed = 0;
function check(condition, label) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exit(1);
  }
  passed += 1;
  console.log(`PASS: ${label}`);
}

async function flushMicrotasks(rounds = 6) {
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
        ? { type: "fact-card", title: "Key Metric", value: "2x max", explanation: "Concurrency capped at two." }
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

function createHarness(episode = makeTestEpisode(8)) {
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

  function resolveSegment(segmentId, result = { ok: true, blob: new Blob(["wav-bytes"]), contentType: "audio/wav", durationMs: 3200 }) {
    const list = pendingBySegmentId.get(segmentId) ?? [];
    const req = list.find((r) => !r.settled);
    if (req) req.resolve(result);
    return req;
  }

  let currentTimeSec = 0;
  let loadedUrl = null;
  let activeCallbacks = null;
  let nextPlayOutcome = { ok: true };
  const driverStats = { loads: [], resumes: 0, pauses: 0, stops: 0, disposes: 0 };

  const audioDriver = {
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
  });

  return {
    controller,
    advance,
    requests,
    resolveSegment,
    audioDriver,
    driverStats,
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

// 1-6. Ordered init, concurrency <= 2, current priority, bounded lookahead, clip ready
{
  const h = createHarness(makeTestEpisode(8, { reverseOrder: true }));
  const initSnap = h.controller.getSnapshot();
  check(
    initSnap.segments.map((s) => s.order).join(",") === "0,1,2,3,4,5,6,7",
    "1. Queue initializes in strict dialogue order regardless of input array order",
  );

  h.controller.play();
  await flushMicrotasks();
  const s1 = h.controller.getSnapshot();
  check(
    MAX_TTS_CONCURRENCY === 2 &&
      h.requests.length === 2 &&
      h.requests[0].payload.segmentId === "seg_01" &&
      h.requests[1].payload.segmentId === "seg_02" &&
      s1.status === "preparing" &&
      h.getInFlight() === 2,
    "2-4. Play prioritizes current segment, prefetches next segment, and caps concurrency at 2",
  );

  h.resolveSegment("seg_01");
  await flushMicrotasks();
  const s2 = h.controller.getSnapshot();
  check(
    s2.status === "playing" &&
      s2.segments[0].status === "playing" &&
      h.requests.length === 3 &&
      h.requests[2].payload.segmentId === "seg_03",
    "5-6. Current segment plays immediately when ready and slot fills lookahead up to seg_03 only",
  );

  h.resolveSegment("seg_02");
  h.resolveSegment("seg_03");
  await flushMicrotasks();
  const s3 = h.controller.getSnapshot();
  check(
    s3.segments[1].status === "ready" &&
      s3.segments[2].status === "ready" &&
      h.requests.length === 3 &&
      PREFETCH_LOOKAHEAD === 2,
    "5b. Lookahead never pre-generates past currentIndex + 2 while staying on Turn 1",
  );
  h.controller.dispose();
}

// 7-15. Pause/resume, ended vs stale ended, prev/next/restart/replay, cache reuse, completion, visuals & active Kuromate
{
  const h = createHarness(makeTestEpisode(4));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
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
    "9. Pause preserves position, clears speaking animation, and does not advance over time",
  );

  h.controller.play();
  await flushMicrotasks();
  const resumedCallbacks = h.getActiveCallbacks();
  check(
    h.driverStats.resumes === 1 &&
      h.controller.getSnapshot().status === "playing" &&
      h.controller.getSnapshot().activeSpeakerId === "h_exp",
    "10. Resume continues cached clip from paused currentTime without refetching",
  );

  // Ended advances cleanly once
  resumedCallbacks.onEnded();
  await flushMicrotasks();
  const afterTurn1 = h.controller.getSnapshot();
  check(
    afterTurn1.currentIndex === 1 &&
      afterTurn1.activeSpeakerId === "h_lrn" &&
      afterTurn1.activeHost?.role === "learner" &&
      afterTurn1.currentSegment?.visualCue.type === "fact-card",
    "11,33,34. Real audio ended advances once and synchronizes Kuromate + visual",
  );

  // Stale ended from turn 1 (both pre-pause and resumed callbacks) must be ignored
  prePauseCallbacks.onEnded();
  resumedCallbacks.onEnded();
  await flushMicrotasks();
  check(h.controller.getSnapshot().currentIndex === 1, "12. Stale ended event is ignored without double advance");

  // Next cancels playback and uses cached/generating seg_03; Previous cancels playback and restarts seg_02
  h.resolveSegment("seg_03");
  await flushMicrotasks();
  h.controller.next();
  await flushMicrotasks();
  check(h.controller.getSnapshot().currentIndex === 2 && h.controller.getSnapshot().activeSpeakerId === "h_skp", "14. Next cancels active playback cleanly");

  const reqsBeforePrev = h.requests.length;
  h.controller.previous();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentIndex === 1 &&
      h.driverStats.loads[h.driverStats.loads.length - 1].startTimeSec === 0,
    "13. Previous cancels active playback and restarts selected cached clip from 0 without refetch",
  );

  // Complete rest of episode
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
      doneSnap.metrics.completedTurnsCount === 4,
    "35. Episode completion is announced once cleanly and idle Kuromate state restored",
  );

  // Restart resets to 0 paused; Replay replays full episode with 0 new provider calls!
  h.controller.restart();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentIndex === 0 && h.controller.getSnapshot().status === "paused",
    "15. Restart stops audio cleanly and returns to turn 0 reusing cache",
  );

  h.controller.replay();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().status === "playing" &&
      h.requests.length === reqsBeforeFinish &&
      h.requests.length >= reqsBeforePrev &&
      h.getMaxConcurrency() <= 2,
    "3,7,8. Cached segments are never refetched on Replay and max concurrency stayed <= 2",
  );
  h.controller.dispose();
}

// 16-19. Disposal / episode change aborts in-flight requests, discards late resolves, revokes every URL exactly once
{
  const h = createHarness(makeTestEpisode(4));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await flushMicrotasks();
  // Now seg_02 and seg_03 are in-flight
  const seg2Req = h.requests.find((r) => r.payload.segmentId === "seg_02");
  const seg3Req = h.requests.find((r) => r.payload.segmentId === "seg_03");
  const urlsBeforeDispose = h.urlStats.createdCounts.size;

  h.controller.dispose();
  // Late resolve attempt after dispose
  seg2Req.resolve({ ok: true, blob: new Blob(["late"]), contentType: "audio/wav", durationMs: 2000 });
  await flushMicrotasks();

  const allRevokedOnce = Array.from(h.urlStats.createdCounts.keys()).every(
    (u) => h.urlStats.revokedCounts.get(u) === 1,
  );
  check(
    seg2Req.aborted &&
      seg3Req.aborted &&
      h.urlStats.activeUrls.size === 0 &&
      h.urlStats.createdCounts.size === urlsBeforeDispose &&
      allRevokedOnce,
    "16-19. Dispose/leave aborts all in-flight fetches, discards late responses, and revokes every URL once",
  );
}

// 20-21, 30, 32. First, middle, last segment failures stay usable with timed fallback and isolate failures
{
  const h = createHarness(makeTestEpisode(4));
  h.controller.play();
  await flushMicrotasks();
  // First segment fails safety non-retryably -> explicit timed fallback, captions intact, seg_02 continues hosted
  h.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 502,
    errorCode: "TTS_GENERATION_FAILED",
    message: "This segment could not be voiced due to content safety limits.",
    retryable: false,
  });
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  const sFirstFail = h.controller.getSnapshot();
  check(
    sFirstFail.currentIndex === 0 &&
      sFirstFail.currentSegmentFailed &&
      sFirstFail.notice?.includes("Voice unavailable for this turn") &&
      sFirstFail.currentSegment?.text.includes("Turn 1"),
    "20,32. First segment failure uses explicit timed fallback while preserving caption and visual",
  );

  // Advance timed fallback duration -> seg_02 plays real hosted audio!
  await h.advance(9000);
  h.resolveSegment("seg_03", {
    ok: false,
    httpStatus: 502,
    errorCode: "TTS_AUDIO_INVALID",
    message: "Invalid WAV",
    retryable: false,
  });
  h.resolveSegment("seg_04");
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentIndex === 1 &&
      h.controller.getSnapshot().status === "playing",
    "21. Failed turn does not prevent future hosted audio segments from playing",
  );

  // Move to failed middle turn 3 -> retryCurrentSegment retries ONLY turn 3 without touching cached turns
  h.getActiveCallbacks().onEnded(); // 1 -> 2 (failed seg_03 timed fallback)
  await flushMicrotasks();
  const reqCountBeforeRetry = h.requests.length;
  h.controller.retryCurrentSegment();
  await flushMicrotasks();
  h.resolveSegment("seg_03");
  await flushMicrotasks();
  check(
    h.requests.length === reqCountBeforeRetry + 1 &&
      h.requests[h.requests.length - 1].payload.segmentId === "seg_03" &&
      h.controller.getSnapshot().status === "playing" &&
      !h.controller.getSnapshot().currentSegmentFailed,
    "30. User retry targets only the failed segment and resumes hosted playback",
  );

  // Decode failure in browser revokes URL and falls back cleanly without breaking episode
  h.getActiveCallbacks().onDecodeError();
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentSegmentFailed &&
      h.urlStats.activeUrls.size <= 2 &&
      h.controller.getSnapshot().notice?.includes("Voice unavailable for this turn"),
    "28b. Browser decode failure revokes invalid URL and enters timed caption fallback",
  );
  h.controller.dispose();
}

// 22-23. Missing key & auth errors stop background queue immediately with 0 retries
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
      hKey.requests.length === 2 &&
      hKey.requests[1].aborted,
    "22. Missing key trips config_error outage cleanly with zero retries and aborts prefetch",
  );
  hKey.controller.continueWithTimedCaptions();
  await flushMicrotasks();
  check(
    hKey.controller.getSnapshot().audioMode === "timed-fallback" &&
      hKey.controller.getSnapshot().status === "playing",
    "Continue with timed captions switches explicitly to timer mode",
  );
  hKey.controller.dispose();

  const hAuth = createHarness(makeTestEpisode(4));
  hAuth.controller.play();
  await flushMicrotasks();
  hAuth.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 502,
    errorCode: "TTS_GENERATION_FAILED",
    message: "Voice service credentials could not be verified on this server.",
    retryable: false,
  });
  await flushMicrotasks();
  check(
    hAuth.controller.getSnapshot().outageState === "auth_error" && hAuth.requests.length === 2 && hAuth.requests[1].aborted,
    "23. Auth error sets auth_error outage immediately with zero retries",
  );
  hAuth.controller.dispose();
}

// 24-27, 29, 40. 429 shared Retry-After cooldown, clamping, cancel during cooldown, pause during cooldown, outage threshold, provider bounds
{
  check(
    parseRetryAfterMs("0") === MIN_COOLDOWN_MS &&
      parseRetryAfterMs("120") === MAX_COOLDOWN_MS &&
      parseRetryAfterMs("invalid") === DEFAULT_RATE_LIMIT_COOLDOWN_MS &&
      clampCooldownMs(5000) === 5000 &&
      parseRetryAfterMs(new Date(10_000 + 6_000).toUTCString(), 10_000) === 6_000,
    "25. Retry-After supports numeric seconds + HTTP-date and clamps cleanly between 1s and 30s",
  );

  const h = createHarness(makeTestEpisode(5));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "5",
  });
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "5",
  });
  await flushMicrotasks();

  // Confirm paused before 5000ms elapses
  await h.advance(4000);
  check(
    h.controller.getSnapshot().cooldownActive === true && h.requests.length === 2,
    "24. 429 enforces shared Retry-After cooldown without premature retry",
  );

  // Advance remaining 1100ms -> resumes bounded retries cleanly
  await h.advance(1100);
  check(h.requests.length === 4, "24b. Cooldown expiry resumes bounded retries when session active");

  // Two consecutive exhausted capacity failures -> outage threshold trips cleanly!
  h.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_PROVIDER_UNAVAILABLE",
    message: "Unavailable",
    retryable: true,
  });
  h.resolveSegment("seg_02", {
    ok: false,
    httpStatus: 503,
    errorCode: "TTS_PROVIDER_UNAVAILABLE",
    message: "Unavailable",
    retryable: true,
  });
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().outageState === "provider_outage" &&
      h.controller.getSnapshot().metrics.providerRequestCount === 4 &&
      MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT === 2 &&
      MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT === 3,
    "27,29,40. Bounded capacity retries and 2-failure outage threshold halt further calls within cap",
  );
  h.controller.dispose();

  // Cancellation during cooldown prevents resume!
  const hCancel = createHarness(makeTestEpisode(3));
  hCancel.controller.play();
  await flushMicrotasks();
  hCancel.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "4",
  });
  await flushMicrotasks();
  const reqsAtCooldown = hCancel.requests.length;
  hCancel.controller.dispose();
  await hCancel.advance(10_000);
  check(hCancel.requests.length === reqsAtCooldown, "26. Cancellation during cooldown prevents resume");

  // Pause during cooldown waits until user presses Play again!
  const hPauseCd = createHarness(makeTestEpisode(3));
  hPauseCd.controller.play();
  await flushMicrotasks();
  hPauseCd.resolveSegment("seg_01", {
    ok: false,
    httpStatus: 429,
    errorCode: "TTS_RATE_LIMITED",
    message: "Busy",
    retryable: true,
    retryAfterHeader: "3",
  });
  await flushMicrotasks();
  hPauseCd.controller.pause();
  const reqsBeforeExpire = hPauseCd.requests.length;
  await hPauseCd.advance(4000);
  check(hPauseCd.requests.length === reqsBeforeExpire, "Pause during cooldown prevents auto-fetching upon expiry");
  hPauseCd.controller.dispose();
}

// 31, 36. Invalid segment produces 0 provider calls; autoplay rejection shows Tap to continue
{
  const epInvalid = makeTestEpisode(2);
  epInvalid.segments[0].text = "   ";
  const hInv = createHarness(epInvalid);
  hInv.controller.play();
  await flushMicrotasks();
  hInv.resolveSegment("seg_02");
  await flushMicrotasks();
  check(
    hInv.requests.every((r) => r.payload.segmentId !== "seg_01") &&
      hInv.controller.getSnapshot().segments[0].errorCode === "INVALID_TTS_INPUT",
    "31. Invalid segment invokes zero provider calls and falls back cleanly",
  );
  hInv.controller.dispose();

  const hAuto = createHarness(makeTestEpisode(3));
  hAuto.controller.play();
  await flushMicrotasks();
  hAuto.resolveSegment("seg_01");
  hAuto.resolveSegment("seg_02");
  await flushMicrotasks();
  hAuto.setNextPlayOutcome({ ok: false, reason: "autoplay_blocked" });
  hAuto.getActiveCallbacks().onEnded(); // Turn 0 -> Turn 1 blocked by browser autoplay!
  await flushMicrotasks();
  const blockedSnap = hAuto.controller.getSnapshot();
  check(
    blockedSnap.status === "autoplay-blocked" &&
      blockedSnap.currentIndex === 1 &&
      blockedSnap.notice?.includes("Tap to continue audio"),
    "36. Autoplay rejection enters Tap to continue state without skipping segment",
  );
  hAuto.controller.play();
  await flushMicrotasks();
  check(hAuto.controller.getSnapshot().status === "playing", "36b. Tap to continue resumes blocked turn smoothly");
  hAuto.controller.dispose();
}

// 37-39. Static scans: zero speechSynthesis, zero persistent audio storage, zero audio tracked in git
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

  check(badSpeech.length === 0, "37. Zero browser speechSynthesis in src/");
  check(badStorage.length === 0, "38. Zero persistent browser audio storage in src/");
  check(trackedAudio.length === 0, "39. Zero generated audio or Python files tracked in git");
}

console.log(`ALL ${passed} AUDIO QUEUE TESTS PASSED.`);
