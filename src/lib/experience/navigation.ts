export type KuroScreen = "home" | "create" | "prepare" | "player" | "episodes";

export type KuroNavDestination = "home" | "create" | "episodes";

export function screenToHash(screen: KuroScreen): string {
  if (screen === "home") return "#home";
  if (screen === "create") return "#create";
  if (screen === "prepare") return "#prepare";
  if (screen === "player") return "#player";
  return "#episodes";
}

export function hashToScreen(hash: string): KuroScreen | null {
  const normalized = hash.trim().toLowerCase();
  if (normalized === "#home") return "home";
  if (normalized === "#create") return "create";
  if (normalized === "#prepare") return "prepare";
  if (normalized === "#player") return "player";
  if (normalized === "#episodes") return "episodes";
  return null;
}

/** Hide mobile bottom navigation during active preparation or portrait player thumb-zone mode. */
export function shouldShowMobileBottomNav(screen: KuroScreen): boolean {
  return screen === "home" || screen === "create" || screen === "episodes";
}

export interface ScreenNavigationInput {
  currentScreen: KuroScreen;
  targetScreen: KuroScreen;
  hasActivePreparation: boolean;
  hasActivePlayableSession: boolean;
  hasAnyViewableEpisode: boolean;
}

export interface ScreenNavigationPlan {
  nextScreen: KuroScreen;
  pauseActivePlayer: boolean;
  cancelActivePreparation: boolean;
}

/**
 * Resolves deterministic transitions across the five screens while preserving
 * form text and in-memory compiled session audio whenever possible.
 */
export function resolveScreenNavigation(input: ScreenNavigationInput): ScreenNavigationPlan {
  const {
    currentScreen,
    targetScreen,
    hasActivePreparation,
    hasActivePlayableSession,
    hasAnyViewableEpisode,
  } = input;

  if (targetScreen === "player" && !hasActivePlayableSession && !hasAnyViewableEpisode) {
    return {
      nextScreen: "create",
      pauseActivePlayer: false,
      cancelActivePreparation: false,
    };
  }

  if (targetScreen === "prepare" && !hasActivePreparation) {
    return {
      nextScreen: hasActivePlayableSession ? "player" : "create",
      pauseActivePlayer: false,
      cancelActivePreparation: false,
    };
  }

  const leavingPreparedSession =
    currentScreen === "prepare" && targetScreen !== "prepare" && hasActivePreparation;
  const leavingPlayer = currentScreen === "player" && targetScreen !== "player";

  return {
    nextScreen: targetScreen,
    pauseActivePlayer: leavingPlayer,
    cancelActivePreparation: leavingPreparedSession,
  };
}
