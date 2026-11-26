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
  MAX_AUTOMATIC_CLIENT_ATTEMPTS_PER_SEGMENT,
  MAX_AUTOMATIC_PROVIDER_CALLS_PER_SEGMENT,
  MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE,
  MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE,
  MAX_TTS_CONCURRENCY,
  PREFETCH_LOOKAHEAD,
} = await import("../src/lib/tts/episode-audio-queue-engine.ts");
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
    message: "Malformed audio payload",
    retryable: true,
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

// =========================================================================
// PR #6 PATCH TESTS (25 checks: Transient Recovery on Replay & Targeted Retry)
// =========================================================================

// P1, P2, P8-P11, P20, P21, P23. Replay preserves cached clips, resets 429 failures, obeys lookahead & concurrency<=2, completes all 8 turns
{
  const ep = makeTestEpisode(8);
  const h = createHarness(ep);
  h.controller.play();
  await flushMicrotasks();

  // Pass 1: seg_01 OK, seg_02 fails 429 (exhausted after 1 retry), seg_03 OK, seg_04 OK,
  // seg_05 fails 429 (exhausted after 1 retry), seg_06..seg_08 OK -> 6/8 ready
  h.resolveSegment("seg_01");
  h.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await flushMicrotasks();
  h.resolveSegment("seg_03");
  await flushMicrotasks();
  await h.advance(2100); // cooldown expires -> retry seg_02 -> fail 429 again
  h.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
  await flushMicrotasks();

  let safetyLoops = 0;
  while (h.controller.getSnapshot().status !== "complete" && safetyLoops++ < 40) {
    const snap = h.controller.getSnapshot();
    if (snap.cooldownActive) {
      await h.advance(2100);
      continue;
    }
    let resolvedAny = false;
    for (const seg of snap.segments) {
      if (seg.status === "generating") {
        if (seg.segmentId === "seg_05") {
          h.resolveSegment("seg_05", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "2" });
        } else {
          h.resolveSegment(seg.segmentId);
        }
        resolvedAny = true;
      }
    }
    if (resolvedAny) {
      await flushMicrotasks();
      continue;
    }
    if (snap.currentSegmentFailed) {
      await h.advance(9000);
    } else if (snap.status === "playing") {
      h.getActiveCallbacks().onEnded();
      await flushMicrotasks();
    } else {
      await h.advance(2100);
    }
  }
  const endPass1 = h.controller.getSnapshot();
  check(
    endPass1.status === "complete" &&
      endPass1.readyCount === 6 &&
      endPass1.failedCount === 2 &&
      endPass1.segments[1].failureClass === "capacity" &&
      endPass1.segments[4].failureClass === "capacity",
    "P-setup: first pass finishes at 6/8 ready with seg_02 & seg_05 classified as capacity failures",
  );

  // Start Replay -> Turn 0 plays immediately from cache; ONLY seg_02 is initially requested inside lookahead [0..2]!
  const callsBeforeReplay = h.requests.length;
  h.controller.replay();
  await flushMicrotasks();
  const replayStartCalls = h.requests.slice(callsBeforeReplay);
  const sReplayStart = h.controller.getSnapshot();
  check(
    sReplayStart.status === "playing" &&
      sReplayStart.currentIndex === 0 &&
      sReplayStart.replayCycle === 1 &&
      sReplayStart.readyCount === 6 &&
      replayStartCalls.length === 1 &&
      replayStartCalls[0].payload.segmentId === "seg_02" &&
      h.getMaxConcurrency() <= 2,
    "P1,P2,P8,P9,P11. Replay preserves 6 cached clips, requeues only seg_02 inside lookahead [0..2], and respects concurrency <= 2",
  );

  // Recover seg_02 -> Play turns 0 -> 1 -> 2 -> 3 -> 4 (recover seg_05) -> 5 -> 6 -> 7 -> COMPLETE (8/8)!
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 0 -> 1 (recovered seg_02 plays!)
  await flushMicrotasks();
  const recoveredTurn1 = h.controller.getSnapshot();
  check(
    recoveredTurn1.currentIndex === 1 &&
      recoveredTurn1.currentSegmentHasAudio === true &&
      recoveredTurn1.currentSegmentFailed === false &&
      recoveredTurn1.activeSpeakerId === "h_lrn" &&
      recoveredTurn1.activeHost?.role === "learner" &&
      recoveredTurn1.currentSegment?.visualCue.type === "fact-card",
    "P20. Recovered clip on Replay plays with correct Kuromate, caption, and visual synchronization",
  );

  h.getActiveCallbacks().onEnded(); // 1 -> 2
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 2 -> 3 (inside [3..5] lookahead seg_05 gets fetched!)
  await flushMicrotasks();
  h.resolveSegment("seg_05");
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 3 -> 4 (recovered seg_05)
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 4 -> 5
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 5 -> 6
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 6 -> 7
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 7 -> complete
  await flushMicrotasks();

  const endPass2 = h.controller.getSnapshot();
  const postReplaySegments = h.requests.slice(callsBeforeReplay).map((r) => r.payload.segmentId);
  check(
    endPass2.status === "complete" &&
      endPass2.readyCount === 8 &&
      endPass2.failedCount === 0 &&
      postReplaySegments.length === 2 &&
      postReplaySegments.includes("seg_02") &&
      postReplaySegments.includes("seg_05"),
    "P21. Replay completes all 8/8 turns making zero fetches for cached clips and regenerating only seg_02 & seg_05",
  );

  h.controller.dispose();
  const allRevokedOnce = Array.from(h.urlStats.createdCounts.keys()).every(
    (u) => h.urlStats.revokedCounts.get(u) === 1,
  );
  check(h.urlStats.activeUrls.size === 0 && allRevokedOnce, "P23. Object URLs revoked exactly once across Replay recovery");
}

// P3, P4, P10, P19. Replay resets 503 & timeout, honors active Retry-After cooldown, ignores late pre-replay resolves
{
  const h = createHarness(makeTestEpisode(5));
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  await flushMicrotasks(); // seg_01 ready & playing; seg_03 starts in lookahead
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Unavailable", retryable: true });
  await flushMicrotasks();
  await h.advance(2100);
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Unavailable", retryable: true });
  await flushMicrotasks();
  h.resolveSegment("seg_03"); // succeeds after seg_02 fails, resetting consecutiveCapacityFailures to 0
  await flushMicrotasks();

  h.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 timed; lookahead=2 starts seg_04)
  await flushMicrotasks();
  await h.advance(9000); // 1 -> 2 (seg_03 plays cached; lookahead=2 starts seg_05 alongside seg_04)
  h.resolveSegment("seg_04", { ok: false, httpStatus: 504, errorCode: "TTS_TIMEOUT", message: "Timeout", retryable: true });
  await flushMicrotasks();
  await h.advance(2100);
  h.resolveSegment("seg_04", { ok: false, httpStatus: 504, errorCode: "TTS_TIMEOUT", message: "Timeout", retryable: true });
  await flushMicrotasks();
  // Leave seg_05 with an active 429 cooldown just before replay
  h.resolveSegment("seg_05", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "6" });
  await flushMicrotasks();

  const callsBeforeReplay = h.requests.length;
  h.controller.replay();
  await flushMicrotasks();

  const replaySnap = h.controller.getSnapshot();
  check(
    replaySnap.cooldownActive === true &&
      h.requests.length === callsBeforeReplay &&
      replaySnap.segments[1].status === "idle" &&
      replaySnap.segments[3].status === "idle",
    "P3,P4,P10. Replay resets 503/timeout failures while respecting active Retry-After cooldown",
  );

  await h.advance(6100);
  const postCooldownReqs = h.requests.slice(callsBeforeReplay).map((r) => r.payload.segmentId);
  check(
    postCooldownReqs.includes("seg_02"),
    "P10b. Replay resumes transient resets cleanly once Retry-After cooldown expires",
  );
  h.controller.dispose();

  // Isolated P19: late resolve from pre-replay request (even if abort listener bypassed) is discarded
  const hLate = createHarness(makeTestEpisode(3));
  hLate.controller.play();
  await flushMicrotasks();
  hLate.resolveSegment("seg_01");
  await flushMicrotasks();
  const preReplayReq = hLate.requests.find((r) => r.payload.segmentId === "seg_02");
  const urlCountBefore = hLate.urlStats.createdCounts.size;
  hLate.controller.replay();
  preReplayReq.resolve({ ok: true, blob: new Blob(["stale-pre-replay"]), contentType: "audio/wav", durationMs: 2500 });
  await flushMicrotasks();
  check(
    hLate.urlStats.createdCounts.size >= urlCountBefore &&
      hLate.requests.filter((r) => r.payload.segmentId === "seg_02").length >= 2 &&
      preReplayReq.aborted,
    "P19. Pre-replay in-flight request is aborted on Replay and late payload does not hijack new cycle",
  );
  hLate.controller.dispose();
}

// P5, P6, P7, P22. Permanent failures (missing key, auth, invalid input, safety) stay permanent on Replay and continue captions
{
  const hCfg = createHarness(makeTestEpisode(3));
  hCfg.controller.play();
  await flushMicrotasks();
  hCfg.resolveSegment("seg_01", { ok: false, httpStatus: 503, errorCode: "TTS_NOT_CONFIGURED", message: "Not configured", retryable: false });
  await flushMicrotasks();
  const cCfg = hCfg.requests.length;
  hCfg.controller.replay();
  await flushMicrotasks();
  check(
    hCfg.requests.length === cCfg &&
      hCfg.controller.getSnapshot().segments[0].failureClass === "configuration" &&
      hCfg.controller.getSnapshot().currentSegmentManualRetryAllowed === false,
    "P5. Replay does not reset missing-key failure",
  );
  hCfg.controller.dispose();

  const hAuth = createHarness(makeTestEpisode(3));
  hAuth.controller.play();
  await flushMicrotasks();
  hAuth.resolveSegment("seg_01", { ok: false, httpStatus: 401, errorCode: "TTS_GENERATION_FAILED", message: "Credentials rejected", retryable: false });
  await flushMicrotasks();
  const cAuth = hAuth.requests.length;
  hAuth.controller.replay();
  await flushMicrotasks();
  check(
    hAuth.requests.length === cAuth && hAuth.controller.getSnapshot().segments[0].failureClass === "auth",
    "P6. Replay does not reset authentication failure",
  );
  hAuth.controller.dispose();

  const epPerm = makeTestEpisode(3);
  epPerm.segments[0].text = "   "; // invalid input
  const hPerm = createHarness(epPerm);
  hPerm.controller.play();
  await flushMicrotasks();
  hPerm.resolveSegment("seg_02", { ok: false, httpStatus: 502, errorCode: "TTS_GENERATION_FAILED", message: "Blocked by safety policy", retryable: false });
  hPerm.resolveSegment("seg_03");
  await flushMicrotasks();
  await hPerm.advance(9000); // finish turn 0 fallback -> turn 1 safety fallback
  await hPerm.advance(9000); // finish turn 1 safety fallback -> turn 2 plays hosted audio
  hPerm.getActiveCallbacks().onEnded(); // finish episode
  await flushMicrotasks();

  const reqsBeforePermReplay = hPerm.requests.length;
  hPerm.controller.replay();
  await flushMicrotasks();
  const permSnap = hPerm.controller.getSnapshot();
  check(
    hPerm.requests.length === reqsBeforePermReplay &&
      permSnap.segments[0].failureClass === "invalid" &&
      permSnap.segments[1].failureClass === "safety" &&
      permSnap.status === "playing" &&
      permSnap.currentSegment?.text === "   ",
    "P7,P22. Replay does not reset invalid-input or safety failures and continues cleanly with captions",
  );
  hPerm.controller.dispose();
}

// P12-P18, P24. Targeted Retry voice: isolates current turn, leaves cache intact, succeeds/clears, fails to timed fallback, disabled during cooldown, deduplicates clicks, bounds 1 per cycle
{
  const epRetry = makeTestEpisode(5);
  epRetry.segments[1].text =
    "This longer explanation compares studying for tomorrow's exam against commuting across town and picking up a part-time shift so the trade-offs stay clear.";
  const h = createHarness(epRetry);
  h.controller.play();
  await flushMicrotasks();
  h.resolveSegment("seg_01");
  h.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "5" });
  await flushMicrotasks();
  h.resolveSegment("seg_03");
  await h.advance(5100);
  // Second 429 leaves seg_02 failed AND sets a fresh 3s Retry-After cooldown (shorter than seg_02's 8s timed fallback)
  h.resolveSegment("seg_02", { ok: false, httpStatus: 429, errorCode: "TTS_RATE_LIMITED", message: "Busy", retryable: true, retryAfterHeader: "3" });
  await flushMicrotasks();

  // Move to Turn 1 (seg_02): Retry button must be disabled while cooldown active with countdown text!
  h.getActiveCallbacks().onEnded();
  await flushMicrotasks();
  const blockedRetrySnap = h.controller.getSnapshot();
  const callsDuringCooldown = h.requests.length;
  h.controller.retryCurrentSegment(); // ignored cleanly!
  await flushMicrotasks();
  check(
    blockedRetrySnap.currentSegmentFailed === true &&
      blockedRetrySnap.currentSegmentManualRetryAllowed === true &&
      blockedRetrySnap.currentSegmentManualRetryDisabled === true &&
      blockedRetrySnap.currentSegmentRetryDisabledReason === "cooldown" &&
      blockedRetrySnap.currentSegmentRetryLabel.startsWith("Retry available in ") &&
      h.requests.length === callsDuringCooldown,
    "P16. Retry button is disabled with countdown label during Retry-After cooldown and ignores clicks",
  );

  // Wait for 3s cooldown to expire (still within seg_02's 8s fallback turn), then click Retry voice TWICE rapidly -> single targeted request only!
  await h.advance(3100);
  const callsBeforeManualRetry = h.requests.length;
  h.controller.retryCurrentSegment();
  h.controller.retryCurrentSegment(); // rapid duplicate click must NOT create second request!
  await flushMicrotasks();
  const duringRetryReqs = h.requests.slice(callsBeforeManualRetry);
  const duringRetrySnap = h.controller.getSnapshot();
  check(
    duringRetryReqs.length === 1 &&
      duringRetryReqs[0].payload.segmentId === "seg_02" &&
      duringRetrySnap.status === "preparing" &&
      duringRetrySnap.currentSegmentManualRetryDisabled === true &&
      duringRetrySnap.readyCount === 2,
    "P12,P13,P17. Targeted retry calls only seg_02, deduplicates rapid clicks, and preserves cached clips",
  );

  // Manual retry fails again -> returns cleanly to explicit fallback, bound exhausted (cannot retry again in same cycle!)
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Unavailable again", retryable: true });
  await flushMicrotasks();
  const afterManualFail = h.controller.getSnapshot();
  const callsAfterFail = h.requests.length;
  h.controller.retryCurrentSegment(); // blocked by 1-per-cycle manual bound!
  await flushMicrotasks();
  check(
    afterManualFail.currentSegmentFailed === true &&
      afterManualFail.notice?.includes("Voice unavailable again") &&
      afterManualFail.currentSegmentManualRetryDisabled === true &&
      afterManualFail.currentSegmentRetryDisabledReason === "limit_reached" &&
      h.requests.length === callsAfterFail,
    "P15,P18,P24. Failed targeted retry returns to explicit timed fallback and enforces 1 manual retry per cycle",
  );

  // Wait past cooldown after Replay begins a new cycle & resets manual retry allowance!
  h.controller.replay();
  await h.advance(2100);
  await flushMicrotasks();
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Still busy", retryable: true });
  await flushMicrotasks();
  await h.advance(2100);
  h.resolveSegment("seg_02", { ok: false, httpStatus: 503, errorCode: "TTS_PROVIDER_UNAVAILABLE", message: "Still busy", retryable: true });
  await flushMicrotasks();
  h.getActiveCallbacks().onEnded(); // 0 -> 1 (seg_02 failed in new replay cycle)
  await flushMicrotasks();
  check(
    h.controller.getSnapshot().currentSegmentManualRetryAllowed === true &&
      h.controller.getSnapshot().currentSegmentManualRetryDisabled === false,
    "P18b. Replay after cooldown resets manual retry allowance for new cycle",
  );

  // Manual retry now SUCCEEDS -> clears failure state and plays immediately!
  h.controller.retryCurrentSegment();
  await flushMicrotasks();
  h.resolveSegment("seg_02");
  await flushMicrotasks();
  const recoveredManualSnap = h.controller.getSnapshot();
  check(
    recoveredManualSnap.currentSegmentFailed === false &&
      recoveredManualSnap.currentSegmentHasAudio === true &&
      recoveredManualSnap.status === "playing" &&
      recoveredManualSnap.readyCount >= 3 &&
      MAX_MANUAL_RETRIES_PER_SEGMENT_PER_CYCLE === 1 &&
      MAX_TOTAL_CLIENT_ATTEMPTS_PER_SEGMENT_PER_CYCLE === 3,
    "P14,P24b. Successful targeted retry clears failure state cleanly and enforces explicit attempt constants",
  );
  h.controller.dispose();
}

// P25. Explicit check that no speechSynthesis exists anywhere in src/
{
  const hits = [];
  function checkDir(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) checkDir(p);
      else if (fs.readFileSync(p, "utf8").toLowerCase().includes("speechsynthesis")) hits.push(p);
    }
  }
  checkDir(path.join(root, "src"));
  check(hits.length === 0, "P25. Confirmed zero speechSynthesis in patched production src/");
}

console.log(`ALL ${passed} AUDIO QUEUE TESTS PASSED.`);
