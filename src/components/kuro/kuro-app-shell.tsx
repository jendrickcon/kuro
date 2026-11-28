"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreateEpisodeRequestSchema,
  CreateEpisodeResponseSchema,
  EpisodeSchema,
  INPUT_MAX_CHARS,
  INPUT_MIN_CHARS,
  type EpisodeLength,
  type Tone,
} from "@contracts/episode.schema";
import { AppNavigation } from "@/components/kuro/app-navigation";
import { CreationForm } from "@/components/kuro/creation-form";
import { RecoverableErrorCard } from "@/components/kuro/form-error";
import { GenerationStatus } from "@/components/kuro/generation-status";
import { HomeScreen } from "@/components/kuro/home-screen";
import { EpisodePlayer } from "@/components/kuro/player/episode-player";
import { SessionEpisodesScreen } from "@/components/kuro/session-episodes-screen";
import { SplashScreen } from "@/components/kuro/splash-screen";
import { useSessionEpisodes } from "@/hooks/use-session-episodes";
import { getSampleEpisode } from "@/lib/episode/fixtures";
import {
  deriveBatchUnifiedLoadingView,
  type ScriptLoadingPhase,
} from "@/lib/episode/unified-loading-state";
import {
  hashToScreen,
  resolveScreenNavigation,
  screenToHash,
  shouldShowMobileBottomNav,
  type KuroNavDestination,
  type KuroScreen,
} from "@/lib/experience/navigation";

export interface KuroAppShellProps {
  ttsRequestIntervalMs?: number;
}

/**
 * Five-screen WP-012.5 client application orchestrator mounted on `/` so switching between
 * Home, Podcast Generator, Broadcast Preparation, Portrait Player, and Session Episodes keeps
 * in-memory compiled WAVs and form drafts intact across navigation.
 */
export function KuroAppShell({ ttsRequestIntervalMs }: KuroAppShellProps = {}) {
  const { store, state, activeEntry, activeQueue, continueEntry } =
    useSessionEpisodes(ttsRequestIntervalMs);

  const [screen, setScreen] = useState<KuroScreen>("home");
  const [showSplash, setShowSplash] = useState(true);
  const [preparingEntryId, setPreparingEntryId] = useState<string | null>(null);

  const [input, setInput] = useState("");
  const [tone, setTone] = useState<Tone>("casual");
  const [length, setLength] = useState<EpisodeLength>("quick");
  const [hostCount, setHostCount] = useState<2 | 3>(2);
  const [scriptPhase, setScriptPhase] = useState<ScriptLoadingPhase>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<{ message: string; retryable: boolean } | null>(
    null,
  );

  const isSubmittingRef = useRef(false);
  const didInitHashRef = useRef(false);
  const scriptAbortRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const errorCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (didInitHashRef.current) return;
    didInitHashRef.current = true;
    const initialScreen = hashToScreen(window.location.hash);
    if (initialScreen && initialScreen !== "home") {
      const plan = resolveScreenNavigation({
        currentScreen: "home",
        targetScreen: initialScreen,
        hasActivePreparation: false,
        hasActivePlayableSession: false,
        hasAnyViewableEpisode: false,
      });
      window.requestAnimationFrame(() => {
        setShowSplash(false);
        setScreen(plan.nextScreen);
      });
    }
  }, []);

  const preparingEntry = preparingEntryId ? store.getEntryById(preparingEntryId) : null;
  const loadingView = deriveBatchUnifiedLoadingView({
    scriptPhase,
    episode: preparingEntry?.episode ?? null,
    compilerSnapshot: preparingEntry?.snapshot ?? null,
    hostCount,
  });

  const navigateToScreen = useCallback(
    (target: KuroScreen, pushHistory = true) => {
      const liveState = store.getState();
      const liveContinue = store.getContinueListeningEntry();
      const livePreparing = preparingEntryId ? store.getEntryById(preparingEntryId) : null;
      const liveActive = liveState.activeEntryId
        ? liveState.sampleEntry?.entryId === liveState.activeEntryId
          ? liveState.sampleEntry
          : store.getEntryById(liveState.activeEntryId)
        : null;
      const hasActivePreparation =
        scriptPhase !== "idle" ||
        (livePreparing !== null && !livePreparing.snapshot.hasStartedPodcast);
      const plan = resolveScreenNavigation({
        currentScreen: screen,
        targetScreen: target,
        hasActivePreparation,
        hasActivePlayableSession: Boolean(
          liveActive && liveActive.snapshot.hasStartedPodcast,
        ),
        hasAnyViewableEpisode: Boolean(liveContinue || liveState.sampleEntry),
      });

      if (plan.cancelActivePreparation) {
        scriptAbortRef.current?.abort();
        scriptAbortRef.current = null;
        isSubmittingRef.current = false;
        setScriptPhase("idle");
        if (preparingEntryId) {
          store.cancelActiveUnstartedEpisode(preparingEntryId);
          setPreparingEntryId(null);
        }
      }

      if (plan.pauseActivePlayer) {
        store.pauseActivePlayback();
      }

      setScreen(plan.nextScreen);
      if (pushHistory && typeof window !== "undefined") {
        const nextHash = screenToHash(plan.nextScreen);
        if (window.location.hash !== nextHash) {
          window.history.pushState({ screen: plan.nextScreen }, "", nextHash);
        }
      }
    },
    [preparingEntryId, screen, scriptPhase, store],
  );

  useEffect(() => {
    const onPopState = () => {
      const fromHash = hashToScreen(window.location.hash) ?? "home";
      navigateToScreen(fromHash, false);
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [navigateToScreen]);

  function focusTextarea() {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }

  function focusErrorCard() {
    window.requestAnimationFrame(() => {
      errorCardRef.current?.focus();
    });
  }

  function handleInputChange(nextValue: string) {
    setInput(nextValue);
    if (fieldError) setFieldError(null);
    if (requestError) setRequestError(null);
  }

  async function handleSubmit() {
    if (isSubmittingRef.current) return;

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      setFieldError(
        `Enter a topic or paste study material (at least ${INPUT_MIN_CHARS} characters).`,
      );
      setRequestError(null);
      focusTextarea();
      return;
    }
    if (trimmed.length < INPUT_MIN_CHARS) {
      setFieldError(`Enter at least ${INPUT_MIN_CHARS} characters so Kuro has enough context.`);
      setRequestError(null);
      focusTextarea();
      return;
    }
    if (trimmed.length > INPUT_MAX_CHARS) {
      setFieldError(
        `Keep your topic or pasted notes under ${INPUT_MAX_CHARS.toLocaleString()} characters (~400 words).`,
      );
      setRequestError(null);
      focusTextarea();
      return;
    }

    const requestCheck = CreateEpisodeRequestSchema.safeParse({
      input: trimmed,
      tone,
      length,
      hostCount,
    });
    if (!requestCheck.success) {
      setFieldError("Check your topic and selected options before continuing.");
      setRequestError(null);
      focusTextarea();
      return;
    }

    const controller = new AbortController();
    scriptAbortRef.current = controller;
    isSubmittingRef.current = true;
    setFieldError(null);
    setRequestError(null);
    setPreparingEntryId(null);
    setScriptPhase("generating");
    setScreen("prepare");
    if (typeof window !== "undefined" && window.location.hash !== "#prepare") {
      window.history.pushState({ screen: "prepare" }, "", "#prepare");
    }

    try {
      const returnToCreateOnError = () => {
        setScriptPhase("idle");
        setScreen("create");
        if (typeof window !== "undefined" && window.location.hash !== "#create") {
          window.history.replaceState({ screen: "create" }, "", screenToHash("create"));
        }
      };

      const response = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestCheck.data),
      });

      if (controller.signal.aborted) return;

      setScriptPhase("validating");

      let json: unknown;
      try {
        json = await response.json();
      } catch {
        if (!controller.signal.aborted) {
          returnToCreateOnError();
          setRequestError({
            message:
              "The server returned an unreadable response. Your text is safe—please try again.",
            retryable: true,
          });
          focusErrorCard();
        }
        return;
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });

      if (controller.signal.aborted) return;

      const parsed = CreateEpisodeResponseSchema.safeParse(json);
      if (!parsed.success) {
        returnToCreateOnError();
        setRequestError({
          message: "Received an unexpected episode response format. Please try again.",
          retryable: true,
        });
        focusErrorCard();
        return;
      }

      if (!parsed.data.ok) {
        returnToCreateOnError();
        if (parsed.data.error.code === "INVALID_INPUT") {
          setFieldError(parsed.data.error.message);
          focusTextarea();
        } else {
          setRequestError({
            message: parsed.data.error.message,
            retryable: parsed.data.error.retryable,
          });
          focusErrorCard();
        }
        return;
      }

      const episodeCheck = EpisodeSchema.safeParse(parsed.data.episode);
      if (!episodeCheck.success) {
        returnToCreateOnError();
        setRequestError({
          message: "The returned episode could not be verified. Please try again.",
          retryable: true,
        });
        focusErrorCard();
        return;
      }

      const usedFallback = response.headers.get("x-kuro-fallback-used") === "true";
      const source = episodeCheck.data.status === "ready" ? "generated" : "mock";
      const created = store.createSessionEpisode({
        episode: episodeCheck.data,
        source,
        usedFallback: source === "generated" ? usedFallback : false,
        requestedOptions: { tone, length, hostCount },
      });
      setPreparingEntryId(created.entryId);
      setScriptPhase("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (!controller.signal.aborted) {
        setScriptPhase("idle");
        setScreen("create");
        if (typeof window !== "undefined" && window.location.hash !== "#create") {
          window.history.replaceState({ screen: "create" }, "", screenToHash("create"));
        }
        setRequestError({
          message: "Could not reach the episode service. Check your connection and try again.",
          retryable: true,
        });
        focusErrorCard();
      }
    } finally {
      if (scriptAbortRef.current === controller) {
        scriptAbortRef.current = null;
        isSubmittingRef.current = false;
      }
    }
  }

  function handleTrySample() {
    if (isSubmittingRef.current) return;
    setFieldError(null);
    setRequestError(null);
    setScriptPhase("idle");
    if (preparingEntryId) {
      store.cancelActiveUnstartedEpisode(preparingEntryId);
      setPreparingEntryId(null);
    }
    const sample = EpisodeSchema.parse(getSampleEpisode());
    store.openSamplePreview(sample);
    navigateToScreen("player");
  }

  function handleCancelPreparation() {
    scriptAbortRef.current?.abort();
    scriptAbortRef.current = null;
    isSubmittingRef.current = false;
    setScriptPhase("idle");
    if (preparingEntryId) {
      store.cancelActiveUnstartedEpisode(preparingEntryId);
      setPreparingEntryId(null);
    }
    navigateToScreen("create");
    focusTextarea();
  }

  function handleOpenSessionEpisode(entryId: string, mode: "continue" | "replay") {
    const opened = store.openEpisode(entryId, { mode });
    if (!opened) return;
    navigateToScreen(opened.snapshot.hasStartedPodcast ? "player" : "prepare");
  }

  function handleNavClick(dest: KuroNavDestination) {
    navigateToScreen(dest);
  }

  const showMobileNavPadding = shouldShowMobileBottomNav(screen);
  const isImmersivePlayer = screen === "player";

  return (
    <div
      className={`${
        isImmersivePlayer
          ? "min-h-dvh bg-[var(--kuro-studio-bg)] md:min-h-screen md:bg-[var(--kuro-bg)]"
          : "min-h-screen bg-[var(--kuro-bg)]"
      } text-[var(--kuro-ink)]`}
    >
      {showSplash ? <SplashScreen onFinish={() => setShowSplash(false)} /> : null}

      <AppNavigation
        currentScreen={screen}
        sessionCount={state.entries.length}
        hasActivePreparation={screen === "prepare"}
        onNavigate={handleNavClick}
      />

      <main
        className={
          isImmersivePlayer
            ? "mx-auto w-full p-0 md:max-w-[1160px] md:px-6 md:pt-5 md:pb-8"
            : `mx-auto w-full max-w-[1160px] px-3 pt-4 sm:px-6 sm:pt-6 ${
                showMobileNavPadding ? "pb-24 md:pb-10" : "pb-8"
              }`
        }
      >
        {screen === "home" ? (
          <HomeScreen
            demoGreetingEnabled={state.demoGreetingEnabled}
            sessionCount={state.entries.length}
            continueEntry={continueEntry}
            onToggleDemoGreeting={() => store.toggleDemoGreeting()}
            onCreateNew={() => navigateToScreen("create")}
            onOpenEpisodes={() => navigateToScreen("episodes")}
            onContinueListening={(entryId) => handleOpenSessionEpisode(entryId, "continue")}
            onTrySample={handleTrySample}
          />
        ) : null}

        {screen === "create" ? (
          <div className="space-y-4">
            {requestError ? (
              <RecoverableErrorCard
                message={requestError.message}
                retryable={requestError.retryable}
                containerRef={errorCardRef}
                onRetry={handleSubmit}
                onEdit={() => {
                  setRequestError(null);
                  focusTextarea();
                }}
                onTrySample={handleTrySample}
              />
            ) : null}
            <CreationForm
              input={input}
              tone={tone}
              length={length}
              hostCount={hostCount}
              isSubmitting={scriptPhase !== "idle"}
              fieldError={fieldError}
              textareaRef={textareaRef}
              onInputChange={handleInputChange}
              onToneChange={setTone}
              onLengthChange={setLength}
              onHostCountChange={setHostCount}
              onSubmit={handleSubmit}
              onTrySample={handleTrySample}
              onBackHome={() => navigateToScreen("home")}
            />
          </div>
        ) : null}

        {screen === "prepare" ? (
          <GenerationStatus
            view={loadingView}
            episode={preparingEntry?.episode ?? null}
            topicPreview={input}
            onStartPodcast={() => {
              if (!preparingEntry) return;
              preparingEntry.controller.startPodcast();
              if (preparingEntry.controller.getSnapshot().hasStartedPodcast) {
                setPreparingEntryId(null);
                setScreen("player");
                if (typeof window !== "undefined" && window.location.hash !== "#player") {
                  window.history.pushState({ screen: "player" }, "", "#player");
                }
              }
            }}
            onRetryFailedTurns={() => preparingEntry?.controller.retryFailedTurns()}
            onCancelAndEdit={handleCancelPreparation}
            onTrySample={handleTrySample}
          />
        ) : null}

        {screen === "player" && activeEntry && activeQueue ? (
          <EpisodePlayer
            episode={activeEntry.episode}
            source={activeEntry.source}
            usedFallback={activeEntry.usedFallback}
            queue={activeQueue}
            requestedOptions={activeEntry.requestedOptions}
            onBack={() => {
              store.pauseActivePlayback();
              navigateToScreen(activeEntry.source === "sample" ? "home" : "episodes");
            }}
            onOpenEpisodes={() => navigateToScreen("episodes")}
            onCreateAnother={() => navigateToScreen("create")}
          />
        ) : null}

        {screen === "episodes" ? (
          <SessionEpisodesScreen
            entries={state.entries}
            activeEntryId={state.activeEntryId}
            evictedCount={state.evictedCount}
            onPlayEpisode={handleOpenSessionEpisode}
            onRemoveEpisode={(entryId) => store.removeSessionEpisode(entryId)}
            onCreateAnother={() => navigateToScreen("create")}
            onTrySample={handleTrySample}
          />
        ) : null}
      </main>
    </div>
  );
}
