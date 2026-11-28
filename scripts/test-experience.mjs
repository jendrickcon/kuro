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

const { getFixtureByHostCount, getSampleEpisode } = await import("../src/lib/episode/fixtures.ts");
const { buildTranscriptText } = await import("../src/lib/episode/transcript.ts");
const {
  deriveBatchUnifiedLoadingView,
  resolvePreparationDisplayState,
} = await import("../src/lib/episode/unified-loading-state.ts");
const {
  canDownloadEpisodeTranscript,
  canDownloadEpisodeWav,
} = await import("../src/lib/experience/downloads.ts");
const { selectEditorialShot, resolveStudioSeat } = await import(
  "../src/lib/experience/editorial-shot-selector.ts"
);
const {
  buildSubtitleCues,
  resolveActiveSubtitleCue,
  resolveSegmentTimingWindow,
} = await import("../src/lib/experience/subtitle-cues.ts");
const { getSegmentDurationMs } = await import("../src/hooks/use-episode-playback.ts");
const {
  hashToScreen,
  resolveScreenNavigation,
  screenToHash,
  shouldHideMobileAppHeader,
  shouldShowMobileBottomNav,
} = await import("../src/lib/experience/navigation.ts");
const {
  createSessionEpisodeStore,
  MAX_SESSION_EPISODES,
  SESSION_NON_PERSISTENCE_DISCLOSURE,
} = await import("../src/lib/experience/session-episode-store.ts");
const { createEpisodeBatchCompiler } = await import("../src/lib/tts/episode-batch-compiler.ts");
const { wrapPcm16MonoToWav } = await import("../src/lib/tts/wav-stitcher.ts");

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

function makeMockWav(durationMs = 400) {
  return wrapPcm16MonoToWav(new Uint8Array(durationMs * 24 * 2));
}

function makeCompilerHarness({ allowNoKeyError = false } = {}) {
  let urlSeq = 0;
  const createdUrls = new Map();
  const revokedUrls = new Map();
  const requests = [];
  let timerSeq = 1;

  const urlApi = {
    createObjectURL() {
      urlSeq += 1;
      const url = `blob:kuro-exp/${urlSeq}`;
      createdUrls.set(url, (createdUrls.get(url) ?? 0) + 1);
      return url;
    },
    revokeObjectURL(url) {
      revokedUrls.set(url, (revokedUrls.get(url) ?? 0) + 1);
    },
  };

  function makeAudioDriver() {
    let curCallbacks = null;
    return {
      async loadAndPlay(_url, _startSec, callbacks) {
        curCallbacks = callbacks;
        callbacks.onPlay();
        return { ok: true };
      },
      async resume(callbacks) {
        if (callbacks) curCallbacks = callbacks;
        curCallbacks?.onPlay();
        return { ok: true };
      },
      seekTo() {},
      pause() {
        curCallbacks?.onPause();
        return 0;
      },
      stop() {},
      getCurrentTimeSec() {
        return 0;
      },
      dispose() {
        curCallbacks = null;
      },
    };
  }

  function createCompiler(episode, source) {
    return createEpisodeBatchCompiler(episode, {
      source,
      audioDriver: makeAudioDriver(),
      urlApi,
      setTimeoutFn: () => timerSeq++,
      clearTimeoutFn: () => {},
      async fetchSegmentAudio(payload) {
        requests.push(payload);
        if (allowNoKeyError) {
          return {
            ok: false,
            httpStatus: 503,
            errorCode: "TTS_NOT_CONFIGURED",
            message: "Live voice generation is not configured.",
            retryable: false,
          };
        }
        return {
          ok: true,
          bytes: makeMockWav(400),
          contentType: "audio/wav",
          durationMs: 400,
          fallbackUsed: false,
          quotaClass: "none",
          voiceIdentityId: payload.voiceIdentityId,
        };
      },
    });
  }

  return { createCompiler, createdUrls, revokedUrls, requests };
}

// 1-2. Navigation across all 5 screens + mobile bottom nav hiding + in-memory demo greeting
{
  const screens = ["home", "create", "prepare", "player", "episodes"];
  const roundTripped = screens.map((s) => hashToScreen(screenToHash(s)));
  const blockedPlayer = resolveScreenNavigation({
    currentScreen: "home",
    targetScreen: "player",
    hasActivePreparation: false,
    hasActivePlayableSession: false,
    hasAnyViewableEpisode: false,
  });
  const leavingPrep = resolveScreenNavigation({
    currentScreen: "prepare",
    targetScreen: "create",
    hasActivePreparation: true,
    hasActivePlayableSession: false,
    hasAnyViewableEpisode: false,
  });
  const leavingPlayer = resolveScreenNavigation({
    currentScreen: "player",
    targetScreen: "episodes",
    hasActivePreparation: false,
    hasActivePlayableSession: true,
    hasAnyViewableEpisode: true,
  });

  check(
    roundTripped.join(",") === screens.join(",") &&
      shouldShowMobileBottomNav("home") === true &&
      shouldShowMobileBottomNav("create") === true &&
      shouldShowMobileBottomNav("episodes") === true &&
      shouldShowMobileBottomNav("player") === false &&
      shouldShowMobileBottomNav("prepare") === false &&
      shouldHideMobileAppHeader("player") === true &&
      shouldHideMobileAppHeader("home") === false &&
      shouldHideMobileAppHeader("create") === false &&
      shouldHideMobileAppHeader("prepare") === false &&
      shouldHideMobileAppHeader("episodes") === false &&
      blockedPlayer.nextScreen === "create" &&
      leavingPrep.cancelActivePreparation === true &&
      leavingPlayer.pauseActivePlayer === true &&
      leavingPlayer.nextScreen === "episodes",
    "1. Five-screen navigation, Back/Forward hashes, mobile immersive header & thumb-zone nav hiding, and nav guards work cleanly",
  );

  const harness = makeCompilerHarness();
  const store1 = createSessionEpisodeStore({ createCompiler: harness.createCompiler });
  check(store1.getState().demoGreetingEnabled === false, "2a. Demo greeting defaults off");
  store1.toggleDemoGreeting();
  const afterToggle = store1.getState().demoGreetingEnabled;
  const storeReloaded = createSessionEpisodeStore({ createCompiler: harness.createCompiler });
  check(
    afterToggle === true && storeReloaded.getState().demoGreetingEnabled === false,
    "2b. Demo greeting stays strictly in-memory and resets on new store / reload",
  );
  store1.disposeAll();
  storeReloaded.disposeAll();
}

// 3-8. In-memory session store, max 5 cap, exact-once Blob URL revocation, Continue listening, 0-call replay, Sample separation
{
  const harness = makeCompilerHarness();
  let clock = 1_700_000_000_000;
  const store = createSessionEpisodeStore({
    createCompiler: harness.createCompiler,
    now: () => {
      clock += 60_000;
      return clock;
    },
  });

  check(
    SESSION_NON_PERSISTENCE_DISCLOSURE === "Episodes generated in this session are not saved permanently." &&
      MAX_SESSION_EPISODES === 5,
    "3-4a. Honest non-persistence disclosure and MAX_SESSION_EPISODES=5 constants match spec",
  );

  // Sample Preview stays completely separate from session entries & requires 0 TTS calls & WAV disabled
  const sampleEp = getSampleEpisode();
  const openedSample = store.openSamplePreview(sampleEp);
  await flushMicrotasks();
  check(
    store.getState().entries.length === 0 &&
      store.getState().sampleEntry?.entryId === openedSample.entryId &&
      harness.requests.length === 0 &&
      store.getContinueListeningEntry() === null &&
      canDownloadEpisodeWav(openedSample.snapshot) === false &&
      canDownloadEpisodeTranscript(sampleEp) === true,
    "8 & 22. Sample Preview stays separate from session episodes, makes 0 TTS calls, and disables WAV download",
  );

  // Add 6 Quick episodes -> newest 5 retained, oldest evicted with exact-once URL revocation
  const createdIds = [];
  for (let i = 1; i <= 6; i += 1) {
    const ep = structuredClone(getFixtureByHostCount(i % 2 === 0 ? 3 : 2));
    ep.id = `ep_sess_${i}`;
    ep.title = `Session Episode ${i}`;
    const rec = store.createSessionEpisode({
      episode: ep,
      source: "generated",
      requestedOptions: { tone: "casual", length: ep.length, hostCount: ep.hosts.length === 3 ? 3 : 2 },
    });
    createdIds.push(rec.entryId);
    await flushMicrotasks();
  }

  const reqCountAfterSix = harness.requests.length;
  const cont = store.getContinueListeningEntry();
  check(
    store.getState().entries.length === 5 &&
      store.getState().evictedCount === 1 &&
      store.getEntryById(createdIds[0]) === null &&
      cont !== null &&
      cont.entryId === createdIds[5],
    "4b & 6a. Session store enforces max 5 episodes and Continue listening targets latest compiled session episode",
  );

  // Open Continue listening and Replay -> 0 duplicate /api/tts calls
  const replayed = store.openEpisode(createdIds[3], { mode: "replay" });
  await flushMicrotasks();
  check(
    replayed !== null &&
      harness.requests.length === reqCountAfterSix &&
      replayed.snapshot.replayCount === 1 &&
      replayed.snapshot.playbackStatus === "playing",
    "6b. Replay from session store makes 0 duplicate TTS calls",
  );

  // Pause & remove one entry explicitly, then disposeAll -> every created URL revoked exact-once
  store.pauseActivePlayback();
  const removedOk = store.removeSessionEpisode(createdIds[3]);
  store.disposeAll();

  const everyCreatedRevokedOnce = Array.from(harness.createdUrls.entries()).every(
    ([url, createdCount]) =>
      createdCount === 1 && harness.revokedUrls.get(url) === 1,
  );
  check(
    removedOk &&
      harness.createdUrls.size > 0 &&
      everyCreatedRevokedOnce &&
      store.getState().entries.length === 0,
    "5 & 7. Remove and session eviction/dispose revoke every owned Blob URL cleanly and exact-once",
  );
}

// 9-12. Unified loading beats, Skip-intro NO AUDIO NO ADVANCE guard, 503 No-Key block, Cancel & edit preservation
{
  const epQuick = getFixtureByHostCount(2);
  const harness = makeCompilerHarness();
  const compQuick = harness.createCompiler(epQuick, "generated");

  const viewGen = deriveBatchUnifiedLoadingView({
    scriptPhase: "generating",
    episode: null,
    compilerSnapshot: null,
    hostCount: 2,
  });
  const viewVal = deriveBatchUnifiedLoadingView({
    scriptPhase: "validating",
    episode: null,
    compilerSnapshot: null,
    hostCount: 2,
  });
  const viewCompiling = deriveBatchUnifiedLoadingView({
    scriptPhase: "idle",
    episode: epQuick,
    compilerSnapshot: compQuick.getSnapshot(),
    hostCount: 2,
  });
  const skippedWhileCompiling = resolvePreparationDisplayState(viewCompiling, {
    skipIntroMotion: true,
  });

  compQuick.startCompilation();
  await flushMicrotasks();
  const viewReady = deriveBatchUnifiedLoadingView({
    scriptPhase: "idle",
    episode: epQuick,
    compilerSnapshot: compQuick.getSnapshot(),
    hostCount: 2,
  });

  check(
    viewGen.broadcastBeatNumber === 1 &&
      viewGen.broadcastBeatId === "studio_power_up" &&
      viewVal.broadcastBeatNumber === 2 &&
      viewVal.broadcastBeatId === "cast_arrival" &&
      viewCompiling.broadcastBeatNumber === 3 &&
      viewCompiling.broadcastBeatId === "mics_live" &&
      skippedWhileCompiling.skipIntroMotion === true &&
      skippedWhileCompiling.canStartPodcast === false &&
      viewReady.broadcastBeatNumber === 5 &&
      viewReady.canStartPodcast === true,
    "9-10. Broadcast preparation beats map to real pipeline states and Skip intro never bypasses NO AUDIO, NO ADVANCE",
  );
  compQuick.dispose();

  const noKeyHarness = makeCompilerHarness({ allowNoKeyError: true });
  const compNoKey = noKeyHarness.createCompiler(epQuick, "generated");
  compNoKey.startCompilation();
  await flushMicrotasks();
  const viewNoKey = deriveBatchUnifiedLoadingView({
    scriptPhase: "idle",
    episode: epQuick,
    compilerSnapshot: compNoKey.getSnapshot(),
    hostCount: 2,
  });
  check(
    viewNoKey.stage === "failed_blocking" &&
      viewNoKey.isConfigBlocked === true &&
      viewNoKey.broadcastBeatId === "recovery_hold" &&
      viewNoKey.canStartPodcast === false &&
      viewNoKey.stepHeading === "Live voice generation is not configured",
    "11. No-key 503 blocks live podcast start without silent timed-caption bypass",
  );
  compNoKey.dispose();

  const storeCancel = createSessionEpisodeStore({ createCompiler: noKeyHarness.createCompiler });
  const pending = storeCancel.createSessionEpisode({ episode: epQuick, source: "generated" });
  storeCancel.cancelActiveUnstartedEpisode(pending.entryId);
  check(
    storeCancel.getState().entries.length === 0 && storeCancel.getState().activeEntryId === null,
    "12. Cancel and edit removes unstarted episode and cleans state safely",
  );
  storeCancel.disposeAll();
}

// 13-19. Deterministic 5-shot Editorial Camera Selector (2 & 3 hosts, existing schema only, audio ownership protection)
{
  const ep2 = getFixtureByHostCount(2);
  const ep3 = getFixtureByHostCount(3);
  const hMap2 = new Map(ep2.hosts.map((h) => [h.id, h]));
  const hMap3 = new Map(ep3.hosts.map((h) => [h.id, h]));

  // Segment 0 -> wide-shot for both 2 and 3 hosts
  const shotOpen2 = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: 0,
    activeSegment: ep2.segments[0],
    previousSegment: null,
    activeHost: hMap2.get(ep2.segments[0].speakerId),
    previousHost: undefined,
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const shotOpen3 = selectEditorialShot({
    episode: ep3,
    activeSegmentIndex: 0,
    activeSegment: ep3.segments[0],
    previousSegment: null,
    activeHost: hMap3.get(ep3.segments[0].speakerId),
    previousHost: undefined,
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  check(
    shotOpen2.shotType === "wide-shot" &&
      shotOpen2.visibleHostIds.length === 2 &&
      shotOpen3.shotType === "wide-shot" &&
      shotOpen3.visibleHostIds.length === 3,
    "14 & 17a. Opening turn uses dynamic wide-shot for both 2-host and 3-host casts",
  );

  // Final turn -> wide-shot
  const lastIdx = ep2.segments.length - 1;
  const plainLastSeg = { ...ep2.segments[lastIdx], visualCue: { type: "none" } };
  const shotFinal = selectEditorialShot({
    episode: { ...ep2, segments: [...ep2.segments.slice(0, lastIdx), plainLastSeg] },
    activeSegmentIndex: lastIdx,
    activeSegment: plainLastSeg,
    previousSegment: ep2.segments[lastIdx - 1],
    activeHost: hMap2.get(plainLastSeg.speakerId),
    previousHost: hMap2.get(ep2.segments[lastIdx - 1].speakerId),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  check(
    shotFinal.shotType === "wide-shot" && shotFinal.ruleReason === "final-segment",
    "15. Final segment resolves to wide closing shot",
  );

  // Meaningful visualCue -> visual-explanation with stable speaker side anchor (Maya left, Leo right)
  const cueIdx = ep2.segments.findIndex((s) => s.visualCue.type !== "none");
  const cueSeg = ep2.segments[cueIdx];
  const shotVisualMaya = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: cueIdx,
    activeSegment: cueSeg,
    previousSegment: cueIdx > 0 ? ep2.segments[cueIdx - 1] : null,
    activeHost: hMap2.get(cueSeg.speakerId),
    previousHost: cueIdx > 0 ? hMap2.get(ep2.segments[cueIdx - 1].speakerId) : undefined,
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const leoCueSeg = { ...cueSeg, speakerId: ep2.hosts[1].id };
  const shotVisualLeo = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: cueIdx,
    activeSegment: leoCueSeg,
    previousSegment: cueSeg,
    activeHost: ep2.hosts[1],
    previousHost: hMap2.get(cueSeg.speakerId),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  check(
    shotVisualMaya.shotType === "visual-explanation" &&
      shotVisualMaya.visualPriority === "visual" &&
      shotVisualMaya.speakerStudioSeat === "left" &&
      shotVisualMaya.speakerCameraAnchor === "visual-left" &&
      shotVisualMaya.hostFraming[0]?.studioSeat === "left" &&
      shotVisualMaya.hostFraming[0]?.cameraAnchor === "visual-left" &&
      shotVisualMaya.audioOwnerHostId === cueSeg.speakerId &&
      shotVisualLeo.speakerStudioSeat === "right" &&
      shotVisualLeo.speakerCameraAnchor === "visual-right" &&
      shotVisualLeo.hostFraming[0]?.studioSeat === "right" &&
      shotVisualLeo.hostFraming[0]?.cameraAnchor === "visual-right",
    "16. Visual-explanation keeps Maya anchored visual-left and Leo anchored visual-right without swapping studio seats",
  );

  // Reaction shot preserves active audioOwnerHostId (never transfers audio ownership to listener)
  const speakerHost = ep3.hosts[0];
  const reactorHost = ep3.hosts[2];
  const midPlainSeg = {
    ...ep3.segments[1],
    speakerId: speakerHost.id,
    emotion: "explaining",
    visualCue: { type: "none" },
  };
  const shotReact = selectEditorialShot({
    episode: ep3,
    activeSegmentIndex: 1,
    activeSegment: midPlainSeg,
    previousSegment: ep3.segments[0],
    activeHost: speakerHost,
    previousHost: ep3.hosts[1],
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: reactorHost.id,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const reactorFraming = shotReact.hostFraming.find((f) => f.hostId === reactorHost.id);
  check(
    shotReact.shotType === "reaction-shot" &&
      shotReact.audioOwnerHostId === speakerHost.id &&
      shotReact.reactionIndicatorHostId === reactorHost.id &&
      shotReact.visibleHostIds.includes(speakerHost.id) &&
      shotReact.visibleHostIds.includes(reactorHost.id) &&
      reactorFraming?.isAudioOwner === false &&
      reactorFraming?.studioSeat === "right",
    "18. Reaction shot frames reacting listener while strictly keeping audioOwnerHostId and seat identity intact",
  );

  // Two-shot on curious following different previous host
  const curiousSeg = {
    ...ep3.segments[2],
    speakerId: ep3.hosts[2].id,
    emotion: "curious",
    visualCue: { type: "none" },
  };
  const shotTwo = selectEditorialShot({
    episode: ep3,
    activeSegmentIndex: 2,
    activeSegment: curiousSeg,
    previousSegment: midPlainSeg,
    activeHost: ep3.hosts[2],
    previousHost: speakerHost,
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const shotCloseup = selectEditorialShot({
    episode: ep3,
    activeSegmentIndex: 2,
    activeSegment: { ...curiousSeg, emotion: "explaining" },
    previousSegment: midPlainSeg,
    activeHost: ep3.hosts[2],
    previousHost: speakerHost,
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const shotBoundary = selectEditorialShot({
    episode: ep3,
    activeSegmentIndex: 3,
    activeSegment: ep3.segments[3],
    previousSegment: ep3.segments[2],
    activeHost: hMap3.get(ep3.segments[3].speakerId),
    previousHost: ep3.hosts[2],
    isSpeaking: false,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "paused",
    isBufferingAtBoundary: true,
  });
  check(
    shotTwo.shotType === "two-shot" &&
      shotTwo.visibleHostIds.length === 2 &&
      shotCloseup.shotType === "speaker-closeup" &&
      shotBoundary.shotType === "wide-shot" &&
      shotBoundary.ruleReason === "boundary-buffering-standby",
    "13, 17b & 19. Two-shot, close-up, and Detailed boundary standby shot work strictly from EpisodeSchema + snapshot",
  );
}

// 20-27. Download eligibility + static architecture / reduced-motion / Canvas / storage / client privacy checks
{
  const epQuick = getFixtureByHostCount(2);
  const harness = makeCompilerHarness();
  const comp = harness.createCompiler(epQuick, "generated");
  const initialWavEligible = canDownloadEpisodeWav(comp.getSnapshot());
  comp.startCompilation();
  await flushMicrotasks();
  const completeSnap = comp.getSnapshot();
  const readyWavEligible = canDownloadEpisodeWav(completeSnap);
  const transcriptText = buildTranscriptText(epQuick);
  comp.dispose();

  check(
    initialWavEligible === false &&
      readyWavEligible === true &&
      canDownloadEpisodeTranscript(epQuick) === true &&
      transcriptText.includes(epQuick.title),
    "20-21. WAV download stays gated until 100% compiled and transcript export works cleanly",
  );

  const srcFiles = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(ent.name)) srcFiles.push(full);
    }
  };
  walk(path.join(root, "src"));

  const clientFiles = srcFiles.filter((f) =>
    /[\\/](?:components|hooks)[\\/]|[\\/]lib[\\/]experience[\\/]/i.test(f),
  );
  const badPersistence = srcFiles.filter((f) =>
    /localstorage\.setitem|sessionstorage\.setitem|indexeddb|caches\.open/i.test(
      fs.readFileSync(f, "utf8"),
    ),
  );
  const badCanvasOrThree = srcFiles.filter((f) =>
    /<canvas\b|getcontext\(\s*['"]webgl|from\s+['"]three['"]/i.test(fs.readFileSync(f, "utf8")),
  );
  const badTransitions = srcFiles.filter((f) =>
    /transition\s*:\s*all\b|transition-all|\bease-in\b(?!-out)/i.test(fs.readFileSync(f, "utf8")),
  );
  const badClientProviderRefs = clientFiles.filter((f) =>
    /deepgram|deepgram-tts-client|aura-2-|x-kuro-tts-provider|x-kuro-tts-voice|sulafat|puck|kore|achird|sadaltager|erinome/i.test(
      fs.readFileSync(f, "utf8"),
    ),
  );

  const globalsCss = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  const playerSrc = fs.readFileSync(
    path.join(root, "src/components/kuro/player/episode-player.tsx"),
    "utf8",
  );
  const appShellSrc = fs.readFileSync(
    path.join(root, "src/components/kuro/kuro-app-shell.tsx"),
    "utf8",
  );
  const schemaText = fs.readFileSync(path.join(root, "contracts/episode.schema.ts"), "utf8");

  check(
    badPersistence.length === 0 &&
      badCanvasOrThree.length === 0 &&
      badTransitions.length === 0 &&
      badClientProviderRefs.length === 0 &&
      globalsCss.includes("@media (prefers-reduced-motion: reduce)") &&
      globalsCss.includes('[data-reduced-motion="true"]') &&
      globalsCss.includes("max-width: 430px") &&
      globalsCss.includes("perspective: 900px") &&
      globalsCss.includes("transform-style: preserve-3d") &&
      playerSrc.includes("lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]") &&
      appShellSrc.includes("Cancel and edit") === false &&
      !schemaText.includes("reactionHostId") &&
      !fs.existsSync(path.join(root, "src/components/kuro/player/audio-preparation-panel.tsx")),
    "23-27. Zero persistence/Canvas/Three/transition-all/provider-leaks, 3D depth CSS, reduced-motion & portrait containment present, schema unmodified",
  );
}

// 28-33. Synchronized subtitle cues, seat-vs-camera invariants across cast sizes, names-only & immersive player audit
{
  const ep2 = getFixtureByHostCount(2);
  const ep3 = getFixtureByHostCount(3);
  const allSegs = [...ep2.segments, ...ep3.segments];

  const allCuesExact = allSegs.every((seg) => {
    const dur = getSegmentDurationMs(seg);
    const cues = buildSubtitleCues(seg.text, dur);
    if (cues.length === 0) return false;
    const origWords = seg.text.trim().split(/\s+/).filter(Boolean).join(" ");
    const cueWords = cues
      .flatMap((c) => c.text.trim().split(/\s+/).filter(Boolean))
      .join(" ");
    const validLines = cues.every((c) => c.lines.length >= 1 && c.lines.length <= 2);
    const validRanges =
      cues[0].startMs === 0 &&
      cues[cues.length - 1].endMs === dur &&
      cues.every((c, idx) => c.endMs > c.startMs && (idx === 0 || c.startMs === cues[idx - 1].endMs));
    return origWords === cueWords && validLines && validRanges;
  });

  const shortCues = buildSubtitleCues("Short and clear.", 2800);
  const clauseText =
    "Wait, is this real? Yes, time and energy are scarce, so every choice crowds out another option.";
  const clauseCues = buildSubtitleCues(clauseText, 5200);
  const breaksAtBoundary =
    clauseCues.length >= 2 && /[?,.\u2014]$/.test(clauseCues[0].text.trim());

  const longSeg = ep2.segments[5];
  const sampleDur = getSegmentDurationMs(longSeg);
  const sampleWinStart = resolveSegmentTimingWindow({
    segment: longSeg,
    activeSegmentIndex: 5,
    isSamplePreview: true,
    elapsedMs: 12000,
    timeline: [],
    sampleIntraElapsedMs: 100,
  });
  const sampleWinLate = resolveSegmentTimingWindow({
    segment: longSeg,
    activeSegmentIndex: 5,
    isSamplePreview: true,
    elapsedMs: 12000,
    timeline: [],
    sampleIntraElapsedMs: Math.max(0, sampleDur - 200),
  });
  const sampleCues = buildSubtitleCues(longSeg.text, sampleDur);
  const sampleEarlyCue = resolveActiveSubtitleCue(sampleCues, sampleWinStart.intraElapsedMs);
  const sampleLateCue = resolveActiveSubtitleCue(sampleCues, sampleWinLate.intraElapsedMs);

  const hostedWin = resolveSegmentTimingWindow({
    segment: longSeg,
    activeSegmentIndex: 1,
    isSamplePreview: false,
    elapsedMs: 6900,
    timeline: [
      {
        segmentId: "seg_01",
        order: 0,
        speakerId: "host_leo",
        identityProfileId: "kuromate_leo_v1",
        startSample: 0,
        endSample: 48000,
        speechStartMs: 0,
        speechDurationMs: 2000,
        startMs: 0,
        endMs: 2250,
        paddingAfterMs: 250,
      },
      {
        segmentId: longSeg.id,
        order: 1,
        speakerId: "host_maya",
        identityProfileId: "kuromate_maya_v1",
        startSample: 54000,
        endSample: 174000,
        speechStartMs: 2250,
        speechDurationMs: 5000,
        startMs: 2250,
        endMs: 7500,
        paddingAfterMs: 250,
      },
    ],
    sampleIntraElapsedMs: 0,
  });
  const hostedCue = resolveActiveSubtitleCue(
    buildSubtitleCues(longSeg.text, hostedWin.durationMs),
    hostedWin.intraElapsedMs,
  );

  check(
    allCuesExact &&
      shortCues.length === 1 &&
      clauseCues.length >= 2 &&
      breaksAtBoundary &&
      sampleCues.length >= 2 &&
      sampleEarlyCue !== null &&
      sampleLateCue !== null &&
      sampleLateCue.index > sampleEarlyCue.index &&
      hostedWin.intraElapsedMs === 4650 &&
      hostedCue !== null &&
      hostedCue.index > 0,
    "28. Subtitle cue segmentation preserves exact wording/order, respects clauses, max 2 lines, and advances in both hosted & Sample Preview modes",
  );

  // Check Maya/Leo/Sam seats across ALL shots and BOTH 3-host orderings ([Maya, Leo, Sam] and [Maya, Sam, Leo])
  const ep3SamMiddle = structuredClone(ep3);
  ep3SamMiddle.hosts = [ep3.hosts[0], ep3.hosts[2], ep3.hosts[1]];
  const hMap2 = new Map(ep2.hosts.map((h) => [h.id, h]));

  const mayaCloseup = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: 1,
    activeSegment: ep2.segments[1],
    previousSegment: ep2.segments[0],
    activeHost: hMap2.get("host_maya"),
    previousHost: hMap2.get("host_leo"),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const mayaVisual = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: 2,
    activeSegment: ep2.segments[2],
    previousSegment: ep2.segments[1],
    activeHost: hMap2.get("host_maya"),
    previousHost: hMap2.get("host_maya"),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const leoVisual = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: 2,
    activeSegment: { ...ep2.segments[2], speakerId: "host_leo" },
    previousSegment: ep2.segments[1],
    activeHost: hMap2.get("host_leo"),
    previousHost: hMap2.get("host_maya"),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });
  const mayaTwoShot = selectEditorialShot({
    episode: ep2,
    activeSegmentIndex: 6,
    activeSegment: { ...ep2.segments[6], speakerId: "host_maya", emotion: "curious" },
    previousSegment: ep2.segments[5],
    activeHost: hMap2.get("host_maya"),
    previousHost: hMap2.get("host_leo"),
    isSpeaking: true,
    isInPadding: false,
    reactionHostId: null,
    playbackStatus: "playing",
    isBufferingAtBoundary: false,
  });

  check(
    resolveStudioSeat(ep2, "host_maya") === "left" &&
      resolveStudioSeat(ep2, "host_leo") === "right" &&
      mayaCloseup.speakerStudioSeat === "left" &&
      mayaCloseup.speakerCameraAnchor === "closeup-center" &&
      mayaVisual.speakerStudioSeat === "left" &&
      mayaVisual.speakerCameraAnchor === "visual-left" &&
      leoVisual.speakerStudioSeat === "right" &&
      leoVisual.speakerCameraAnchor === "visual-right" &&
      mayaTwoShot.hostFraming.map((f) => `${f.hostId}:${f.studioSeat}:${f.cameraAnchor}`).join(",") ===
        "host_maya:left:two-shot-left,host_leo:right:two-shot-right" &&
      resolveStudioSeat(ep3SamMiddle, "host_maya") === "left" &&
      resolveStudioSeat(ep3SamMiddle, "host_sam") === "center" &&
      resolveStudioSeat(ep3SamMiddle, "host_leo") === "right",
    "29. Stable studio seats stay pinned per cast member while camera anchors transition cleanly across all shots",
  );

  // Audit player JSX & CSS for removed nameplates, role labels, previous-turn wall, debug chrome, and accessible drawer
  const readRel = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const playerFiles = [
    "src/components/kuro/player/episode-player.tsx",
    "src/components/kuro/player/podcast-stage.tsx",
    "src/components/kuro/player/kuromate-host.tsx",
    "src/components/kuro/player/contextual-monitor.tsx",
    "src/components/kuro/player/caption-panel.tsx",
    "src/components/kuro/player/audio-status-bar.tsx",
    "src/components/kuro/player/playback-controls.tsx",
    "src/components/kuro/player/transcript-drawer.tsx",
  ];
  const combinedPlayerSrc = playerFiles.map(readRel).join("\n");
  const globalsCss = readRel("src/app/globals.css");
  const navSrc = readRel("src/components/kuro/app-navigation.tsx");
  const drawerSrc = readRel("src/components/kuro/player/transcript-drawer.tsx");
  const shotSelectorSrc = readRel("src/lib/experience/editorial-shot-selector.ts");

  const bannedDebugAndRoleRe =
    /kuro-nameplate-row|Previous —|Maya close-up|Closing wide shot|Opening cast wide shot|Visual explanation|STUDIO DISPLAY|speakerRole|hostRole|>\s*\{[^}]*\.role\}|"Explainer"|"Learner"|"Skeptic"|"Idle"|"Listening"|"Captioning"|"Standby"/;

  check(
    !bannedDebugAndRoleRe.test(combinedPlayerSrc) &&
      !bannedDebugAndRoleRe.test(shotSelectorSrc) &&
      !globalsCss.includes(".kuro-nameplate-row") &&
      navSrc.includes("shouldHideMobileAppHeader") &&
      navSrc.includes("hidden md:block") &&
      combinedPlayerSrc.includes('data-kuro-floating-name="true"') &&
      combinedPlayerSrc.includes("data-studio-seat") &&
      combinedPlayerSrc.includes("data-camera-anchor") &&
      drawerSrc.includes('role="dialog"') &&
      drawerSrc.includes('aria-modal="true"') &&
      drawerSrc.includes('"Escape"') &&
      drawerSrc.includes("triggerRef.current?.focus()"),
    "30. Immersive header hiding, names-only floating labels, Transcript drawer a11y, and debug/role label removal verified",
  );
}

// 31-33. Procedural Kuro mascot bust SVG, in-memory splash ident overlay & deep-link guard
{
  const readRel = (p) => fs.readFileSync(path.join(root, p), "utf8");
  const mascotSrc = readRel("src/components/kuro/kuro-mascot-ident.tsx");
  const splashSrc = readRel("src/components/kuro/splash-screen.tsx");
  const shellSrc = readRel("src/components/kuro/kuro-app-shell.tsx");

  const leftEyeBlock = /data-mascot-eye="left"[\s\S]*?<\/g>/.exec(mascotSrc)?.[0] ?? "";
  const rightEyeBlock = /data-mascot-eye="right"[\s\S]*?<\/g>/.exec(mascotSrc)?.[0] ?? "";
  const hasMatchingCyanEyes =
    mascotSrc.includes('KURO_MASCOT_EYE_COLOR = "#38E8FF"') &&
    leftEyeBlock.includes("KURO_MASCOT_EYE_COLOR") &&
    rightEyeBlock.includes("KURO_MASCOT_EYE_COLOR") &&
    !leftEyeBlock.includes("CORAL") &&
    !rightEyeBlock.includes("CORAL");

  check(
    mascotSrc.includes('data-kuro-slot="kuro-mascot"') &&
      mascotSrc.includes('data-mascot-part="halo"') &&
      mascotSrc.includes('data-mascot-part="mic-grille"') &&
      mascotSrc.includes('data-mascot-part="lower-collar"') &&
      mascotSrc.includes('data-mascot-part="headset"') &&
      mascotSrc.includes('data-mascot-part="cat-points"') &&
      mascotSrc.includes('data-mascot-part="waveform-smile"') &&
      hasMatchingCyanEyes &&
      !/<img\b|<image\b|<canvas\b|from\s+["']three["']|\.png\b|\.jpg\b|\.webp\b|\.glb\b|\.obj\b/i.test(
        mascotSrc,
      ),
    "31. Procedural mascot bust renders broad mic grille, cobalt cat-pointed headset, matching cyan eyes, and waveform smile without images/canvas/three",
  );

  check(
    splashSrc.includes('aria-label="Skip intro"') &&
      splashSrc.includes("min-h-11") &&
      splashSrc.includes('"Escape"') &&
      splashSrc.includes("prefers-reduced-motion: reduce") &&
      splashSrc.includes("clearTimeout") &&
      splashSrc.includes("Kuro") &&
      splashSrc.includes("More voices. Clearer ideas.") &&
      !/Kuro AI|KuroCast|Klaro|localStorage|sessionStorage/i.test(splashSrc),
    "32. Splash ident exposes accessible >=44px Skip, Escape dismiss, reduced-motion handling, timer cleanup, and approved brand copy",
  );

  check(
    shellSrc.includes("<SplashScreen") &&
      shellSrc.includes("showSplash") &&
      shellSrc.includes("hashToScreen(window.location.hash)") &&
      !/localStorage|sessionStorage/i.test(shellSrc),
    "33. KuroAppShell controls splash strictly in memory and skips automatically on non-home hash deep links",
  );
}

console.log(`ALL ${passed} EXPERIENCE ARCHITECTURE TESTS PASSED.`);
