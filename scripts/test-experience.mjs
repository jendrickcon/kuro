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
const { selectEditorialShot } = await import("../src/lib/experience/editorial-shot-selector.ts");
const {
  hashToScreen,
  resolveScreenNavigation,
  screenToHash,
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
      blockedPlayer.nextScreen === "create" &&
      leavingPrep.cancelActivePreparation === true &&
      leavingPlayer.pauseActivePlayer === true &&
      leavingPlayer.nextScreen === "episodes",
    "1. Five-screen navigation, Back/Forward hashes, mobile thumb-zone nav hiding, and nav guards work cleanly",
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

  // Meaningful visualCue -> visual-explanation
  const cueIdx = ep2.segments.findIndex((s) => s.visualCue.type !== "none");
  const cueSeg = ep2.segments[cueIdx];
  const shotVisual = selectEditorialShot({
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
  check(
    shotVisual.shotType === "visual-explanation" &&
      shotVisual.visualPriority === "visual" &&
      shotVisual.speakerDock === "lower-right" &&
      shotVisual.audioOwnerHostId === cueSeg.speakerId,
    "16. Meaningful visualCue selects visual-explanation shot with docked speaker",
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
  check(
    shotReact.shotType === "reaction-shot" &&
      shotReact.audioOwnerHostId === speakerHost.id &&
      shotReact.reactionIndicatorHostId === reactorHost.id &&
      shotReact.visibleHostIds.includes(speakerHost.id) &&
      shotReact.visibleHostIds.includes(reactorHost.id),
    "18. Reaction shot frames reacting listener while strictly keeping audioOwnerHostId on active speaker",
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
      playerSrc.includes("lg:grid-cols-[minmax(0,430px)_minmax(0,1fr)]") &&
      appShellSrc.includes("Cancel and edit") === false &&
      !schemaText.includes("reactionHostId") &&
      !fs.existsSync(path.join(root, "src/components/kuro/player/audio-preparation-panel.tsx")),
    "23-27. Zero persistence/Canvas/Three/transition-all/provider-leaks, reduced-motion & portrait containment present, schema unmodified",
  );
}

console.log(`ALL ${passed} EXPERIENCE ARCHITECTURE TESTS PASSED.`);
