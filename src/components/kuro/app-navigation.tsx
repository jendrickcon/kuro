"use client";

import {
  shouldHideMobileAppHeader,
  shouldShowMobileBottomNav,
  type KuroNavDestination,
  type KuroScreen,
} from "@/lib/experience/navigation";

export interface AppNavigationProps {
  currentScreen: KuroScreen;
  sessionCount: number;
  hasActivePreparation: boolean;
  onNavigate: (target: KuroNavDestination) => void;
}

const NAV_ITEMS: ReadonlyArray<{ id: KuroNavDestination; label: string }> = [
  { id: "home", label: "Home" },
  { id: "create", label: "Create" },
  { id: "episodes", label: "Episodes" },
];

export function AppNavigation({
  currentScreen,
  sessionCount,
  hasActivePreparation,
  onNavigate,
}: AppNavigationProps) {
  const showMobileNav = shouldShowMobileBottomNav(currentScreen);
  const hideMobileHeader = shouldHideMobileAppHeader(currentScreen);

  return (
    <>
      <header
        className={`${
          hideMobileHeader ? "hidden md:block" : "block"
        } sticky top-0 z-30 border-b border-[var(--kuro-border)] bg-[var(--kuro-surface)]/95 backdrop-blur-xs`}
      >
        <div className="mx-auto flex h-14 w-full max-w-[1160px] items-center justify-between gap-3 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate("home")}
              aria-label="Kuro — go to Home"
              className="kuro-interactive inline-flex min-h-11 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-[var(--kuro-surface-muted)]"
            >
              <svg
                width="26"
                height="26"
                viewBox="0 0 28 28"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <rect width="28" height="28" rx="8" fill="var(--kuro-studio-bg)" />
                <circle cx="11" cy="14" r="4.2" fill="var(--kuro-accent)" />
                <circle cx="18.5" cy="14" r="3.2" fill="var(--kuro-studio-ink)" />
              </svg>
              <span className="font-display text-lg font-extrabold tracking-tight text-[var(--kuro-ink)]">
                Kuro
              </span>
            </button>
            <span className="hidden text-xs font-medium text-[var(--kuro-ink-muted)] sm:inline">
              More voices. Clearer ideas.
            </span>
          </div>

          <nav aria-label="Primary navigation" className="hidden items-center gap-1.5 md:flex">
            {NAV_ITEMS.map((item) => {
              const isCurrent =
                currentScreen === item.id ||
                (item.id === "create" && currentScreen === "prepare");
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={`kuro-interactive inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold ${
                    isCurrent
                      ? "bg-[var(--kuro-studio-bg)] text-[var(--kuro-studio-ink)]"
                      : "text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === "episodes" ? (
                    <span
                      className={`font-mono-kuro inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                        isCurrent
                          ? "bg-[var(--kuro-accent)] text-white"
                          : "border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)]"
                      }`}
                    >
                      {sessionCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            {hasActivePreparation ? (
              <span className="rounded-full border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--kuro-ink)]">
                Preparing
              </span>
            ) : (
              <span className="font-mono-kuro rounded-full border border-[var(--kuro-border)] bg-[var(--kuro-surface-muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--kuro-ink-muted)]">
                {sessionCount} saved in tab
              </span>
            )}
          </div>
        </div>
      </header>

      {showMobileNav ? (
        <nav
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--kuro-border)] bg-[var(--kuro-surface)]/95 px-2 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] backdrop-blur-xs md:hidden"
        >
          <div className="mx-auto grid max-w-md grid-cols-3 gap-1">
            {NAV_ITEMS.map((item) => {
              const isCurrent = currentScreen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isCurrent ? "page" : undefined}
                  onClick={() => onNavigate(item.id)}
                  className={`kuro-interactive flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold ${
                    isCurrent
                      ? "bg-[var(--kuro-studio-bg)] text-[var(--kuro-studio-ink)]"
                      : "text-[var(--kuro-ink)] hover:bg-[var(--kuro-surface-muted)]"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === "episodes" && sessionCount > 0 ? (
                    <span
                      className={`font-mono-kuro rounded-full px-1.5 py-0.5 text-[10px] ${
                        isCurrent
                          ? "bg-[var(--kuro-accent)] text-white"
                          : "bg-[var(--kuro-surface-muted)] text-[var(--kuro-ink)]"
                      }`}
                    >
                      {sessionCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
    </>
  );
}
