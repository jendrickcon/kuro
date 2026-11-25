(() => {
  "use strict";

  const STUDY_EXAMPLE =
    "Explain opportunity cost using a college student choosing among studying, commuting, and part-time work.";
  const MIN_CHARS = 10;
  const MAX_CHARS = 2500;

  const ENV_META = {
    studio: {
      label: "Studio",
      stageTitle: "KURO STUDIO",
      monitorLabel: "Studio Monitor",
    },
    study: {
      label: "Study Room",
      stageTitle: "KURO STUDY ROOM",
      monitorLabel: "Study Board",
    },
    commute: {
      label: "Commute Lounge",
      stageTitle: "KURO COMMUTE LOUNGE",
      monitorLabel: "Transit Display",
    },
  };

  const SAMPLE_EPISODES = {
    twoHostQuick: {
      id: "proto_quick_2h",
      title: "Opportunity Cost on a Commute",
      topic: STUDY_EXAMPLE,
      tone: "casual",
      length: "quick",
      hosts: [
        {
          id: "host_maya",
          name: "Maya",
          role: "explainer",
          variant: "explainer",
          accentColor: "#2563EB",
          voiceHint: 0,
        },
        {
          id: "host_leo",
          name: "Leo",
          role: "learner",
          variant: "curious",
          accentColor: "#D97706",
          voiceHint: 1,
        },
      ],
      segments: [
        {
          speakerId: "host_leo",
          text: "I keep seeing opportunity cost in my econ notes, and it always sounds way more abstract than it probably is.",
          durationMs: 4200,
          emotion: "curious",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "Picture tonight after your last lecture. You have two free hours before you get too tired, and you have to pick one plan.",
          durationMs: 4600,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "If you take a two-hour part-time shift instead of reviewing for tomorrow's exam, your opportunity cost is the study boost you gave up.",
          durationMs: 5200,
          emotion: "explaining",
          visualCue: {
            type: "comparison",
            title: "Two Hours After Class",
            left: { label: "2 hrs Study", value: "Stronger exam score, no extra pay tonight" },
            right: { label: "2 hrs Shift", value: "Extra commute cash, less exam prep" },
          },
        },
        {
          speakerId: "host_leo",
          text: "Wait, so even if studying at the library is free, choosing it still has a real cost?",
          durationMs: 3600,
          emotion: "reacting",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "Exactly. Economists look beyond cash on a receipt. Time and energy are scarce, so every choice crowds out another option.",
          durationMs: 4800,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "One detail trips students up on exams: opportunity cost is only your single next-best option, not every possible thing you could do.",
          durationMs: 5200,
          emotion: "explaining",
          visualCue: {
            type: "fact-card",
            title: "Exam Rule to Remember",
            value: "Next-Best Only",
            explanation: "Counts the single best alternative you gave up, not every unused option combined.",
          },
        },
        {
          speakerId: "host_leo",
          text: "That helps a lot. So my commute isn't just fare money—it's also the hour I could have used to rest or finish slides.",
          durationMs: 4600,
          emotion: "curious",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "Right, unless you pair the commute with short audio review, which shrinks what you sacrifice during transit.",
          durationMs: 4200,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_leo",
          text: "Nice—spot the choice, identify the next-best trade-off, and that's opportunity cost in plain English.",
          durationMs: 4000,
          emotion: "neutral",
          visualCue: { type: "none" },
        },
      ],
    },
    threeHostDetailed: {
      id: "proto_detailed_3h",
      title: "Opportunity Cost: Studying, Transit, and Work",
      topic: STUDY_EXAMPLE,
      tone: "serious",
      length: "detailed",
      hosts: [
        {
          id: "host_maya",
          name: "Maya",
          role: "explainer",
          variant: "explainer",
          accentColor: "#2563EB",
          voiceHint: 0,
        },
        {
          id: "host_sam",
          name: "Sam",
          role: "skeptic",
          variant: "challenger",
          accentColor: "#7C3AED",
          voiceHint: 2,
        },
        {
          id: "host_leo",
          name: "Leo",
          role: "learner",
          variant: "curious",
          accentColor: "#D97706",
          voiceHint: 1,
        },
      ],
      segments: [
        {
          speakerId: "host_maya",
          text: "Opportunity cost measures the value of the best alternative you give up whenever scarce time or money forces a choice.",
          durationMs: 4600,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_leo",
          text: "In college, my scarcest resource is weekday evenings. Between commuting, a part-time shift, and studying, something always gets cut.",
          durationMs: 4900,
          emotion: "curious",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "Trace one typical evening block. Once transit takes an hour, the remaining window forces a direct trade-off between wages and exam prep.",
          durationMs: 5200,
          emotion: "explaining",
          visualCue: {
            type: "timeline",
            title: "One Commuter Evening",
            points: [
              { label: "5:00 PM", description: "One-hour bus ride home from campus" },
              { label: "6:00 PM", description: "Choose shift wages or exam review" },
              { label: "8:00 PM", description: "Limited energy left before sleep" },
            ],
          },
        },
        {
          speakerId: "host_sam",
          text: "Hold on—what if a student genuinely needs the shift wages to pay next week's fare? Isn't calling that a cost misleading?",
          durationMs: 4800,
          emotion: "reacting",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "That is a sharp distinction. Taking the shift can still be the rational decision; opportunity cost does not mean the choice was wrong.",
          durationMs: 4900,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_leo",
          text: "So economists separate explicit costs like bus fare from implicit costs like the study hours you gave up?",
          durationMs: 4300,
          emotion: "curious",
          visualCue: {
            type: "fact-card",
            title: "Two Cost Layers",
            value: "Explicit + Implicit",
            explanation: "Bus fare is an explicit cash cost; missed study time is an implicit opportunity cost.",
          },
        },
        {
          speakerId: "host_maya",
          text: "Correct. When you evaluate a decision carefully, follow three quick steps so you only count the single next-best option.",
          durationMs: 4800,
          emotion: "explaining",
          visualCue: {
            type: "process",
            title: "Evaluating a Trade-Off",
            steps: [
              { label: "List feasible choices", description: "Identify what actually fits your open hours" },
              { label: "Rank the next-best", description: "Pick the single strongest alternative you skip" },
              { label: "Compare full payoff", description: "Weigh both cash and time outcomes together" },
            ],
          },
        },
        {
          speakerId: "host_sam",
          text: "Okay, then what about the commute itself? You cannot skip getting home, so does commuting even have an opportunity cost?",
          durationMs: 4600,
          emotion: "curious",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "Yes—both in route choice and in how you spend those minutes. A cheaper slower route trades extra minutes for lower fare.",
          durationMs: 4800,
          emotion: "explaining",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_leo",
          text: "And during the ride, scrolling social media versus reviewing a short study recap is another trade-off inside the same hour.",
          durationMs: 4900,
          emotion: "explaining",
          visualCue: {
            type: "comparison",
            title: "45-Minute Bus Ride",
            left: { label: "Passive Scroll", value: "Instant rest, zero exam progress" },
            right: { label: "Study Recap", value: "Review core terms before class" },
          },
        },
        {
          speakerId: "host_sam",
          text: "Fair point. Even when you cannot eliminate the constraint, seeing the implicit trade-off helps you spend scarce hours intentionally.",
          durationMs: 4900,
          emotion: "reacting",
          visualCue: { type: "none" },
        },
        {
          speakerId: "host_maya",
          text: "That is the core takeaway: every study, transit, and work choice carries an explicit price and an implicit next-best alternative.",
          durationMs: 4700,
          emotion: "neutral",
          visualCue: { type: "none" },
        },
      ],
    },
  };

  const state = {
    view: "create",
    input: "",
    tone: "casual",
    length: "quick",
    hostCount: 2,
    environment: "studio",
    episode: null,
    submittedNote: "",
    turnIndex: 0,
    playbackState: "idle", // idle | playing | paused | completed
    reactingHostId: null,
    voiceEnabled: true,
    speechSupported: typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
    voices: [],
    runToken: 0,
    silentTimerId: null,
    reactTimerId: null,
    prepTimerIds: [],
  };

  const el = {
    viewCreate: document.getElementById("view-create"),
    viewPreparing: document.getElementById("view-preparing"),
    viewPlayer: document.getElementById("view-player"),
    headerActions: document.getElementById("header-actions"),
    btnBackCreate: document.getElementById("btn-back-create"),
    createStudioPreview: document.getElementById("create-studio-preview"),
    createEnvBadge: document.getElementById("create-env-badge"),
    createKurozoStage: document.getElementById("create-kurozo-stage"),
    createForm: document.getElementById("create-form"),
    topicInput: document.getElementById("topic-input"),
    charCounter: document.getElementById("char-counter"),
    formError: document.getElementById("form-error"),
    btnUseExample: document.getElementById("btn-use-example"),
    btnTrySample: document.getElementById("btn-try-sample"),
    prepKurozoRow: document.getElementById("prep-kurozo-row"),
    prepHeading: document.getElementById("prep-heading"),
    prepSteps: [
      document.getElementById("prep-step-0"),
      document.getElementById("prep-step-1"),
      document.getElementById("prep-step-2"),
    ],
    btnCancelPrep: document.getElementById("btn-cancel-prep"),
    episodeTitle: document.getElementById("episode-title"),
    episodeMeta: document.getElementById("episode-meta"),
    episodeTopicNote: document.getElementById("episode-topic-note"),
    btnSwitch2: document.getElementById("btn-switch-2"),
    btnSwitch3: document.getElementById("btn-switch-3"),
    speechNotice: document.getElementById("speech-notice"),
    studioStage: document.getElementById("studio-stage"),
    onAirBadge: document.getElementById("on-air-badge"),
    studioEnvTitle: document.getElementById("studio-env-title"),
    studioTurnHud: document.getElementById("studio-turn-hud"),
    hostStage: document.getElementById("host-stage"),
    deskNameplates: document.getElementById("desk-nameplates"),
    monitorLabel: document.getElementById("monitor-label"),
    visualTypeBadge: document.getElementById("visual-type-badge"),
    visualBody: document.getElementById("visual-body"),
    captionPanel: document.getElementById("caption-panel"),
    captionSpeaker: document.getElementById("caption-speaker"),
    captionTurnLabel: document.getElementById("caption-turn-label"),
    captionText: document.getElementById("caption-text"),
    captionPrev: document.getElementById("caption-prev"),
    completionBanner: document.getElementById("completion-banner"),
    btnReplayBanner: document.getElementById("btn-replay-banner"),
    progressTrack: document.getElementById("progress-track"),
    progressFill: document.getElementById("progress-fill"),
    progressLabel: document.getElementById("progress-label"),
    btnPrev: document.getElementById("btn-prev"),
    btnPlayPause: document.getElementById("btn-play-pause"),
    btnNext: document.getElementById("btn-next"),
    btnRestart: document.getElementById("btn-restart"),
    btnVoiceToggle: document.getElementById("btn-voice-toggle"),
    voiceToggleState: document.getElementById("voice-toggle-state"),
    btnDownloadTranscript: document.getElementById("btn-download-transcript"),
  };

  function getHostsForCount(count) {
    return count === 3 ? SAMPLE_EPISODES.threeHostDetailed.hosts : SAMPLE_EPISODES.twoHostQuick.hosts;
  }

  function buildKurozoBody(host) {
    const rig = document.createElement("div");
    rig.className = `kurozo-rig kurozo--${host.variant || "explainer"}`;
    rig.setAttribute("aria-hidden", "true");

    const upper = document.createElement("div");
    upper.className = "kurozo-upper";

    const crest = document.createElement("div");
    crest.className = "kurozo-crest";

    const head = document.createElement("div");
    head.className = "kurozo-head";

    const eyes = document.createElement("div");
    eyes.className = "kurozo-eyes";
    const eyeL = document.createElement("span");
    eyeL.className = "kurozo-eye";
    const eyeR = document.createElement("span");
    eyeR.className = "kurozo-eye";
    eyes.append(eyeL, eyeR);

    const mouth = document.createElement("div");
    mouth.className = "kurozo-mouth";
    for (let i = 0; i < 3; i += 1) {
      const bar = document.createElement("span");
      bar.className = "kurozo-wave-bar";
      mouth.appendChild(bar);
    }

    head.append(eyes, mouth);

    const torsoWrap = document.createElement("div");
    torsoWrap.className = "kurozo-torso-wrap";

    const armL = document.createElement("span");
    armL.className = "kurozo-arm kurozo-arm--left";
    const handL = document.createElement("span");
    handL.className = "kurozo-hand";
    armL.appendChild(handL);

    const torso = document.createElement("div");
    torso.className = "kurozo-torso";
    const core = document.createElement("span");
    core.className = "kurozo-core-badge";
    torso.appendChild(core);

    const armR = document.createElement("span");
    armR.className = "kurozo-arm kurozo-arm--right";
    const handR = document.createElement("span");
    handR.className = "kurozo-hand";
    armR.appendChild(handR);

    torsoWrap.append(armL, torso, armR);
    upper.append(crest, head, torsoWrap);

    const lower = document.createElement("div");
    lower.className = "kurozo-lower";

    rig.append(upper, lower);
    return rig;
  }

  function renderCreateStudioPreview() {
    const meta = ENV_META[state.environment] || ENV_META.studio;
    el.createStudioPreview.dataset.env = state.environment;
    el.createEnvBadge.textContent = meta.label;
    el.createKurozoStage.replaceChildren();

    getHostsForCount(state.hostCount).forEach((host) => {
      const unit = document.createElement("div");
      unit.className = "mini-host-unit";
      unit.style.setProperty("--host-accent", host.accentColor);
      const rig = buildKurozoBody(host);
      const tag = document.createElement("span");
      tag.className = "mini-host-tag";
      tag.textContent = host.name;
      unit.append(rig, tag);
      el.createKurozoStage.appendChild(unit);
    });
  }

  function renderEmbodiedKurozo(host, hostState, lookDir) {
    const seat = document.createElement("div");
    seat.className = "host-seat";
    seat.dataset.state = hostState;
    seat.dataset.look = lookDir;
    seat.style.setProperty("--host-accent", host.accentColor);

    const rig = buildKurozoBody(host);

    const mic = document.createElement("div");
    mic.className = "studio-mic";
    mic.setAttribute("aria-hidden", "true");
    const micHead = document.createElement("div");
    micHead.className = "mic-head";
    const led = document.createElement("span");
    led.className = "mic-led";
    micHead.appendChild(led);
    const stand = document.createElement("div");
    stand.className = "mic-stand";
    mic.append(micHead, stand);

    seat.append(rig, mic);
    return seat;
  }

  function renderDeskNameplate(host, hostState) {
    const plate = document.createElement("div");
    plate.className = "nameplate";
    plate.dataset.state = hostState;
    plate.style.setProperty("--host-accent", host.accentColor);

    const labels = {
      speaking: "● Speaking",
      listening: "Listening",
      reacting: "Reacting",
      paused: "Paused",
      idle: "Idle",
    };
    const labelText = labels[hostState] || "Idle";
    plate.setAttribute("aria-label", `${host.name}, ${host.role}, ${labelText.replace("● ", "")}`);

    const name = document.createElement("p");
    name.className = "nameplate-name";
    name.textContent = host.name;

    const role = document.createElement("p");
    role.className = "nameplate-role";
    role.textContent = host.role;

    const pill = document.createElement("span");
    pill.className = "nameplate-pill";
    pill.textContent = labelText;

    plate.append(name, role, pill);
    return plate;
  }

  function normalizeVisualCue(cue) {
    if (!cue || typeof cue !== "object") return { type: "none" };
    if (cue.type === "comparison" && cue.title && cue.left && cue.right) return cue;
    if (cue.type === "timeline" && cue.title && Array.isArray(cue.points) && cue.points.length >= 2 && cue.points.length <= 4) {
      return cue;
    }
    if (cue.type === "process" && cue.title && Array.isArray(cue.steps) && cue.steps.length >= 3 && cue.steps.length <= 5) {
      return cue;
    }
    if (cue.type === "fact-card" && cue.title && cue.value && cue.explanation) return cue;
    return { type: "none" };
  }

  function renderStudioMonitor(rawCue, episodeTitle) {
    const cue = normalizeVisualCue(rawCue);
    el.visualTypeBadge.textContent = cue.type === "none" ? "Waveform" : cue.type;
    el.visualBody.replaceChildren();

    if (cue.type === "none") {
      const wrap = document.createElement("div");
      wrap.className = "monitor-idle-screen";
      const title = document.createElement("p");
      title.className = "monitor-idle-title";
      title.textContent = episodeTitle || "Kuro Studio Live";
      const wave = document.createElement("div");
      wave.className = "monitor-waveform";
      wave.setAttribute("aria-hidden", "true");
      for (let i = 0; i < 4; i += 1) {
        const bar = document.createElement("span");
        bar.className = "monitor-wave-bar";
        wave.appendChild(bar);
      }
      wrap.append(title, wave);
      el.visualBody.appendChild(wrap);
      return cue.type;
    }

    const title = document.createElement("h3");
    title.className = "visual-title";
    title.textContent = cue.title;
    el.visualBody.appendChild(title);

    if (cue.type === "comparison") {
      const grid = document.createElement("div");
      grid.className = "visual-comparison";
      [cue.left, cue.right].forEach((side) => {
        const box = document.createElement("div");
        box.className = "visual-side";
        const l = document.createElement("p");
        l.className = "visual-side-label";
        l.textContent = side.label;
        const v = document.createElement("p");
        v.className = "visual-side-value";
        v.textContent = side.value;
        box.append(l, v);
        grid.appendChild(box);
      });
      el.visualBody.appendChild(grid);
      return cue.type;
    }

    if (cue.type === "timeline") {
      const list = document.createElement("ul");
      list.className = "visual-list";
      cue.points.forEach((pt) => {
        const li = document.createElement("li");
        li.className = "visual-list-item";
        const tag = document.createElement("span");
        tag.className = "visual-time-tag";
        tag.textContent = pt.label;
        const desc = document.createElement("p");
        desc.className = "visual-item-desc";
        desc.textContent = pt.description;
        li.append(tag, desc);
        list.appendChild(li);
      });
      el.visualBody.appendChild(list);
      return cue.type;
    }

    if (cue.type === "process") {
      const list = document.createElement("ol");
      list.className = "visual-list";
      cue.steps.forEach((step, idx) => {
        const li = document.createElement("li");
        li.className = "visual-list-item";
        const num = document.createElement("span");
        num.className = "visual-step-num";
        num.textContent = String(idx + 1);
        const textWrap = document.createElement("div");
        const lbl = document.createElement("p");
        lbl.className = "visual-item-label";
        lbl.textContent = step.label;
        const desc = document.createElement("p");
        desc.className = "visual-item-desc";
        desc.textContent = step.description;
        textWrap.append(lbl, desc);
        li.append(num, textWrap);
        list.appendChild(li);
      });
      el.visualBody.appendChild(list);
      return cue.type;
    }

    if (cue.type === "fact-card") {
      const box = document.createElement("div");
      box.className = "visual-fact-card";
      const val = document.createElement("p");
      val.className = "visual-fact-value";
      val.textContent = cue.value;
      const exp = document.createElement("p");
      exp.className = "visual-fact-explanation";
      exp.textContent = cue.explanation;
      box.append(val, exp);
      el.visualBody.appendChild(box);
    }

    return cue.type;
  }

  function applyEnvironmentUI() {
    const envMeta = ENV_META[state.environment] || ENV_META.studio;
    document.querySelectorAll("[data-env-choice]").forEach((btn) => {
      const active = btn.dataset.envChoice === state.environment;
      btn.setAttribute("aria-pressed", String(active));
      const clean = btn.textContent.replace(/^✓\s*/, "");
      btn.textContent = active ? `✓ ${clean}` : clean;
    });
    el.studioStage.dataset.env = state.environment;
    el.studioEnvTitle.textContent = envMeta.stageTitle;
    el.monitorLabel.textContent = envMeta.monitorLabel;
    renderCreateStudioPreview();
  }

  function setEnvironment(env) {
    if (!ENV_META[env]) return;
    state.environment = env;
    applyEnvironmentUI();
  }

  function loadVoices() {
    if (!state.speechSupported) return;
    try {
      state.voices = window.speechSynthesis.getVoices() || [];
    } catch {
      state.voices = [];
    }
  }

  function pickVoiceForHost(host) {
    if (!state.voices.length) return null;
    const english = state.voices.filter((v) => /^en/i.test(v.lang));
    const pool = english.length ? english : state.voices;
    return pool[(host.voiceHint || 0) % pool.length] || null;
  }

  function clearPrepTimers() {
    state.prepTimerIds.forEach((id) => clearTimeout(id));
    state.prepTimerIds = [];
  }

  function cancelAllPlaybackActivity() {
    state.runToken += 1;
    if (state.silentTimerId !== null) {
      clearTimeout(state.silentTimerId);
      state.silentTimerId = null;
    }
    if (state.reactTimerId !== null) {
      clearTimeout(state.reactTimerId);
      state.reactTimerId = null;
    }
    state.reactingHostId = null;
    if (state.speechSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancellation errors in restricted environments.
      }
    }
  }

  function showSpeechNotice(message) {
    if (!message) {
      el.speechNotice.hidden = true;
      el.speechNotice.textContent = "";
      return;
    }
    el.speechNotice.hidden = false;
    el.speechNotice.textContent = message;
  }

  function setView(viewName) {
    state.view = viewName;
    el.viewCreate.hidden = viewName !== "create";
    el.viewPreparing.hidden = viewName !== "preparing";
    el.viewPlayer.hidden = viewName !== "player";
    el.headerActions.hidden = viewName !== "player";
  }

  function updateVoiceToggleUI() {
    if (!state.speechSupported) {
      el.btnVoiceToggle.setAttribute("aria-pressed", "false");
      el.btnVoiceToggle.disabled = true;
      el.voiceToggleState.textContent = "Unavailable (silent captions)";
      return;
    }
    el.btnVoiceToggle.disabled = false;
    el.btnVoiceToggle.setAttribute("aria-pressed", String(state.voiceEnabled));
    el.voiceToggleState.textContent = state.voiceEnabled ? "On" : "Off";
  }

  function renderPlayer() {
    const ep = state.episode;
    if (!ep) return;

    const total = ep.segments.length;
    const idx = Math.max(0, Math.min(state.turnIndex, total - 1));
    state.turnIndex = idx;
    const turn = ep.segments[idx];
    const activeSeatIdx = Math.max(0, ep.hosts.findIndex((h) => h.id === turn.speakerId));
    const activeHost = ep.hosts[activeSeatIdx] || ep.hosts[0];

    el.episodeTitle.textContent = ep.title;
    el.episodeMeta.textContent = `${ep.tone} · ${ep.length} · ${ep.hosts.length} Kurozos · ${total} turns`;
    el.episodeTopicNote.textContent = state.submittedNote
      ? `Sample conversation loaded for your input: "${state.submittedNote}" (no AI generated from your text).`
      : `Prewritten sample conversation (${ep.topic}).`;

    el.btnSwitch2.setAttribute("aria-pressed", String(ep.hosts.length === 2));
    el.btnSwitch3.setAttribute("aria-pressed", String(ep.hosts.length === 3));

    // Render monitor first to determine camera focus cleanly
    const cueType = renderStudioMonitor(turn.visualCue, ep.title);

    // Studio HUD & Camera attributes
    const envMeta = ENV_META[state.environment] || ENV_META.studio;
    el.studioStage.dataset.env = state.environment;
    el.studioStage.dataset.hosts = String(ep.hosts.length);
    el.studioStage.dataset.playback = state.playbackState;
    el.studioEnvTitle.textContent = envMeta.stageTitle;
    el.monitorLabel.textContent = envMeta.monitorLabel;

    let camera = "wide";
    if (state.playbackState === "playing") {
      camera = cueType !== "none" ? "visual-focus" : "speaker-focus";
    } else if (cueType !== "none" && state.playbackState !== "completed") {
      camera = "visual-focus";
    }
    el.studioStage.dataset.camera = camera;

    const airMap = {
      playing: { text: "● ON AIR", attr: "live" },
      paused: { text: "PAUSED", attr: "paused" },
      completed: { text: "Episode complete", attr: "complete" },
      idle: { text: "STANDBY", attr: "standby" },
    };
    const airState = airMap[state.playbackState] || airMap.idle;
    el.onAirBadge.textContent = airState.text;
    el.onAirBadge.dataset.air = airState.attr;

    const pad = (n) => String(n).padStart(2, "0");
    el.studioTurnHud.textContent = `${pad(idx + 1)} / ${pad(total)}`;

    // Embodied Kurozos + aligned desk nameplates
    el.hostStage.className = `studio-hosts ${ep.hosts.length === 3 ? "studio-hosts--3" : "studio-hosts--2"}`;
    el.hostStage.replaceChildren();
    el.deskNameplates.replaceChildren();

    ep.hosts.forEach((host, seatIdx) => {
      let hostState = "idle";
      if (state.playbackState === "playing") {
        if (host.id === turn.speakerId) {
          hostState = "speaking";
        } else if (state.reactingHostId === host.id) {
          hostState = "reacting";
        } else {
          hostState = "listening";
        }
      } else if (state.playbackState === "paused" && host.id === turn.speakerId) {
        hostState = "paused";
      } else if (state.reactingHostId === host.id) {
        hostState = "reacting";
      }

      let lookDir = "center";
      if (hostState === "listening") {
        lookDir = activeSeatIdx < seatIdx ? "left" : activeSeatIdx > seatIdx ? "right" : "center";
      }

      el.hostStage.appendChild(renderEmbodiedKurozo(host, hostState, lookDir));
      el.deskNameplates.appendChild(renderDeskNameplate(host, hostState));
    });

    // Studio-connected caption panel
    el.captionPanel.style.setProperty("--host-accent", activeHost.accentColor);
    el.captionSpeaker.textContent = `${activeHost.name} (${activeHost.role})`;
    el.captionTurnLabel.textContent = `Turn ${idx + 1} of ${total}`;
    el.captionText.textContent = turn.text;

    if (idx > 0) {
      const prevTurn = ep.segments[idx - 1];
      const prevHost = ep.hosts.find((h) => h.id === prevTurn.speakerId);
      el.captionPrev.hidden = false;
      el.captionPrev.textContent = `Previous — ${prevHost ? prevHost.name : "Host"}: "${prevTurn.text}"`;
    } else {
      el.captionPrev.hidden = true;
      el.captionPrev.textContent = "";
    }

    el.completionBanner.hidden = state.playbackState !== "completed";

    // Progress & transport
    const pct = Math.round(((idx + 1) / total) * 100);
    el.progressTrack.setAttribute("aria-valuemax", String(total));
    el.progressTrack.setAttribute("aria-valuenow", String(idx + 1));
    el.progressFill.style.width = `${pct}%`;
    el.progressLabel.textContent = `${idx + 1} / ${total}`;

    el.btnPrev.disabled = idx === 0;
    el.btnNext.disabled = idx >= total - 1;
    el.btnPlayPause.textContent =
      state.playbackState === "playing"
        ? "Pause"
        : state.playbackState === "completed"
          ? "Replay"
          : "Play";

    updateVoiceToggleUI();
  }

  function scheduleTurnAdvance(token) {
    const ep = state.episode;
    if (!ep || token !== state.runToken || state.playbackState !== "playing") return;

    const turn = ep.segments[state.turnIndex];
    const host = ep.hosts.find((h) => h.id === turn.speakerId) || ep.hosts[0];

    if (turn.emotion === "reacting") {
      const listener = ep.hosts.find((h) => h.id !== turn.speakerId);
      if (listener) {
        state.reactingHostId = listener.id;
        state.reactTimerId = setTimeout(() => {
          if (token === state.runToken) {
            state.reactingHostId = null;
            renderPlayer();
          }
        }, 550);
      }
    }

    renderPlayer();

    const useSpeech = state.speechSupported && state.voiceEnabled;
    if (useSpeech) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(turn.text);
        const voice = pickVoiceForHost(host);
        if (voice) utter.voice = voice;
        const startedAt = Date.now();
        utter.onend = () => {
          if (token !== state.runToken || state.playbackState !== "playing") return;
          if (Date.now() - startedAt < 250 && turn.text.length > 20) {
            showSpeechNotice("Browser preview voice did not produce audio; using timed silent captions.");
            startSilentTimer(turn, token);
            return;
          }
          advanceOrComplete();
        };
        utter.onerror = () => {
          if (token !== state.runToken || state.playbackState !== "playing") return;
          showSpeechNotice("Browser preview voice failed on this turn; continuing with silent timed captions.");
          startSilentTimer(turn, token);
        };
        window.speechSynthesis.speak(utter);
        return;
      } catch {
        showSpeechNotice("Browser preview voice is unavailable; using timed silent captions.");
      }
    }

    startSilentTimer(turn, token);
  }

  function startSilentTimer(turn, token) {
    const bounded = Math.min(8000, Math.max(2500, turn.durationMs || turn.text.length * 42));
    state.silentTimerId = setTimeout(() => {
      if (token !== state.runToken || state.playbackState !== "playing") return;
      advanceOrComplete();
    }, bounded);
  }

  function advanceOrComplete() {
    const ep = state.episode;
    if (!ep) return;
    if (state.turnIndex < ep.segments.length - 1) {
      cancelAllPlaybackActivity();
      state.turnIndex += 1;
      state.playbackState = "playing";
      scheduleTurnAdvance(state.runToken);
    } else {
      cancelAllPlaybackActivity();
      state.playbackState = "completed";
      renderPlayer();
    }
  }

  function playCurrent() {
    if (!state.episode) return;
    if (state.playbackState === "completed") {
      state.turnIndex = 0;
    }
    cancelAllPlaybackActivity();
    state.playbackState = "playing";
    scheduleTurnAdvance(state.runToken);
  }

  function pausePlayback() {
    cancelAllPlaybackActivity();
    if (state.playbackState === "playing") {
      state.playbackState = "paused";
    }
    renderPlayer();
  }

  function stepTurn(delta) {
    if (!state.episode) return;
    const nextIdx = Math.max(0, Math.min(state.episode.segments.length - 1, state.turnIndex + delta));
    const wasPlaying = state.playbackState === "playing";
    cancelAllPlaybackActivity();
    state.turnIndex = nextIdx;
    if (wasPlaying) {
      state.playbackState = "playing";
      scheduleTurnAdvance(state.runToken);
    } else {
      state.playbackState = "paused";
      renderPlayer();
    }
  }

  function restartEpisode(autoPlay) {
    if (!state.episode) return;
    cancelAllPlaybackActivity();
    state.turnIndex = 0;
    if (autoPlay) {
      state.playbackState = "playing";
      scheduleTurnAdvance(state.runToken);
    } else {
      state.playbackState = "idle";
      renderPlayer();
    }
  }

  function buildEpisodeFromOptions(hostCount, tone, length, submittedNote) {
    const base = hostCount === 3 ? SAMPLE_EPISODES.threeHostDetailed : SAMPLE_EPISODES.twoHostQuick;
    const copy = JSON.parse(JSON.stringify(base));
    copy.tone = tone;
    copy.length = length;
    if (length === "quick" && copy.segments.length > 9) {
      copy.segments = copy.segments.slice(0, 9);
    }
    state.submittedNote = submittedNote || "";
    return copy;
  }

  function openPlayerWithEpisode(ep) {
    cancelAllPlaybackActivity();
    state.episode = ep;
    state.turnIndex = 0;
    state.playbackState = "idle";
    if (!state.speechSupported) {
      showSpeechNotice("Browser speech synthesis is unavailable in this browser. Timed silent captions remain active.");
    } else {
      showSpeechNotice("");
    }
    setView("player");
    renderPlayer();
  }

  function startSimulatedPreparation(ep) {
    clearPrepTimers();
    cancelAllPlaybackActivity();
    setView("preparing");

    el.prepKurozoRow.replaceChildren();
    ep.hosts.forEach((h) => {
      const wrap = document.createElement("div");
      wrap.style.setProperty("--host-accent", h.accentColor);
      wrap.appendChild(buildKurozoBody(h));
      el.prepKurozoRow.appendChild(wrap);
    });

    const messages = [
      "Gathering your Kurozos",
      "Assigning each Kurozo a perspective",
      "Preparing the sample conversation",
    ];
    el.prepHeading.textContent = messages[0];
    el.prepSteps.forEach((li, i) => {
      li.dataset.stepState = i === 0 ? "active" : "pending";
    });

    state.prepTimerIds.push(
      setTimeout(() => {
        el.prepSteps[0].dataset.stepState = "done";
        el.prepSteps[1].dataset.stepState = "active";
        el.prepHeading.textContent = messages[1];
      }, 500),
      setTimeout(() => {
        el.prepSteps[1].dataset.stepState = "done";
        el.prepSteps[2].dataset.stepState = "active";
        el.prepHeading.textContent = messages[2];
      }, 1000),
      setTimeout(() => {
        el.prepSteps[2].dataset.stepState = "done";
        openPlayerWithEpisode(ep);
      }, 1500),
    );
  }

  function downloadTranscript() {
    const ep = state.episode;
    if (!ep) return;
    const hostMap = new Map(ep.hosts.map((h) => [h.id, h]));
    const lines = [
      "Kuro — Interactive Prototype Transcript",
      `Title: ${ep.title}`,
      `Topic: ${state.submittedNote || ep.topic}`,
      `Options: ${ep.tone} | ${ep.length} | ${ep.hosts.length} Kurozos`,
      "",
      "Hosts:",
      ...ep.hosts.map((h) => `- ${h.name} (${h.role})`),
      "",
      "Dialogue:",
      ...ep.segments.map((seg, i) => {
        const h = hostMap.get(seg.speakerId);
        return `${i + 1}. [${h ? `${h.name} - ${h.role}` : seg.speakerId}] ${seg.text}`;
      }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${ep.id}-transcript.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function updateOptionButtons() {
    document.querySelectorAll(".pill-btn").forEach((btn) => {
      const opt = btn.dataset.option;
      const val = btn.dataset.value;
      const active = String(state[opt]) === val;
      btn.setAttribute("aria-pressed", String(active));
      const cleanText = btn.textContent.replace(/^✓\s*/, "");
      btn.textContent = active ? `✓ ${cleanText}` : cleanText;
    });
    renderCreateStudioPreview();
  }

  function updateInputMeta(showErrorIfInvalid) {
    const len = el.topicInput.value.trim().length;
    el.charCounter.hidden = len < 2000 && !showErrorIfInvalid;
    el.charCounter.textContent = `${len.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
    el.charCounter.classList.toggle("over-limit", len > MAX_CHARS);
  }

  function showFormError(msg) {
    if (!msg) {
      el.formError.hidden = true;
      el.formError.textContent = "";
      el.topicInput.setAttribute("aria-invalid", "false");
      el.topicInput.setAttribute("aria-describedby", "topic-help");
      return;
    }
    el.formError.hidden = false;
    el.formError.textContent = msg;
    el.topicInput.setAttribute("aria-invalid", "true");
    el.topicInput.setAttribute("aria-describedby", "topic-help form-error");
  }

  // Event bindings
  document.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const opt = btn.dataset.option;
      const val = btn.dataset.value;
      state[opt] = opt === "hostCount" ? Number(val) : val;
      updateOptionButtons();
    });
  });

  document.querySelectorAll("[data-env-choice]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setEnvironment(btn.dataset.envChoice);
    });
  });

  el.topicInput.addEventListener("input", () => {
    state.input = el.topicInput.value;
    showFormError("");
    updateInputMeta(false);
  });

  el.btnUseExample.addEventListener("click", () => {
    el.topicInput.value = STUDY_EXAMPLE;
    state.input = STUDY_EXAMPLE;
    showFormError("");
    updateInputMeta(false);
    el.topicInput.focus();
  });

  el.createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const trimmed = el.topicInput.value.trim();
    if (trimmed.length < MIN_CHARS) {
      showFormError(`Enter at least ${MIN_CHARS} characters or paste a short study passage.`);
      updateInputMeta(true);
      el.topicInput.focus();
      return;
    }
    if (trimmed.length > MAX_CHARS) {
      showFormError(`Keep your topic or pasted notes under ${MAX_CHARS.toLocaleString()} characters.`);
      updateInputMeta(true);
      el.topicInput.focus();
      return;
    }
    showFormError("");
    const previewNote = trimmed.length > 90 ? `${trimmed.slice(0, 90)}…` : trimmed;
    const ep = buildEpisodeFromOptions(state.hostCount, state.tone, state.length, previewNote);
    startSimulatedPreparation(ep);
  });

  el.btnTrySample.addEventListener("click", () => {
    showFormError("");
    const ep = buildEpisodeFromOptions(state.hostCount, state.tone, state.length, "");
    openPlayerWithEpisode(ep);
  });

  el.btnCancelPrep.addEventListener("click", () => {
    clearPrepTimers();
    cancelAllPlaybackActivity();
    setView("create");
  });

  el.btnBackCreate.addEventListener("click", () => {
    clearPrepTimers();
    cancelAllPlaybackActivity();
    setView("create");
  });

  el.btnSwitch2.addEventListener("click", () => {
    const ep = buildEpisodeFromOptions(2, "casual", "quick", "");
    openPlayerWithEpisode(ep);
  });

  el.btnSwitch3.addEventListener("click", () => {
    const ep = buildEpisodeFromOptions(3, "serious", "detailed", "");
    openPlayerWithEpisode(ep);
  });

  el.btnPlayPause.addEventListener("click", () => {
    if (state.playbackState === "playing") {
      pausePlayback();
    } else {
      playCurrent();
    }
  });

  el.btnPrev.addEventListener("click", () => stepTurn(-1));
  el.btnNext.addEventListener("click", () => stepTurn(1));
  el.btnRestart.addEventListener("click", () => restartEpisode(false));
  el.btnReplayBanner.addEventListener("click", () => restartEpisode(true));

  el.btnVoiceToggle.addEventListener("click", () => {
    if (!state.speechSupported) return;
    const wasPlaying = state.playbackState === "playing";
    cancelAllPlaybackActivity();
    state.voiceEnabled = !state.voiceEnabled;
    if (!state.voiceEnabled) {
      showSpeechNotice("Browser preview voice is off. Using timed silent captions.");
    } else {
      showSpeechNotice("");
    }
    if (wasPlaying) {
      state.playbackState = "playing";
      scheduleTurnAdvance(state.runToken);
    } else {
      renderPlayer();
    }
  });

  el.btnDownloadTranscript.addEventListener("click", downloadTranscript);

  if (state.speechSupported) {
    loadVoices();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  updateOptionButtons();
  applyEnvironmentUI();
  updateVoiceToggleUI();
  setView("create");
})();
