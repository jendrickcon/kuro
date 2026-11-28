"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KuroMascotIdent } from "@/components/kuro/kuro-mascot-ident";

export interface SplashScreenProps {
  onFinish: () => void;
}

const SPLASH_FADE_START_MS = 1920;
const SPLASH_DONE_MS = 2220;
const SPLASH_REDUCED_DONE_MS = 380;

/**
 * In-memory broadcast ident splash overlay shown once per `/` load, featuring
 * Kuro's procedural SVG/CSS-3D studio mascot bust, instant Skip / Escape dismissal,
 * and automatic cross-fade into Home.
 */
export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [isExiting, setIsExiting] = useState(false);
  const dismissedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const clearScheduledTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const dismissImmediately = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    clearScheduledTimers();
    setIsExiting(true);
    const finishTimer = window.setTimeout(() => {
      onFinish();
    }, 160);
    timersRef.current.push(finishTimer);
  }, [clearScheduledTimers, onFinish]);

  useEffect(() => {
    const prefersReducedMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-reduced-motion") === "true";

    if (prefersReducedMotion) {
      const quickTimer = window.setTimeout(() => {
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onFinish();
        }
      }, SPLASH_REDUCED_DONE_MS);
      timersRef.current.push(quickTimer);
    } else {
      const exitTimer = window.setTimeout(() => {
        setIsExiting(true);
      }, SPLASH_FADE_START_MS);
      const doneTimer = window.setTimeout(() => {
        if (!dismissedRef.current) {
          dismissedRef.current = true;
          onFinish();
        }
      }, SPLASH_DONE_MS);
      timersRef.current.push(exitTimer, doneTimer);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissImmediately();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearScheduledTimers();
    };
  }, [clearScheduledTimers, dismissImmediately, onFinish]);

  return (
    <div
      role="region"
      aria-label="Kuro studio intro"
      data-kuro-splash="true"
      data-exiting={isExiting ? "true" : "false"}
      onClick={dismissImmediately}
      className="kuro-splash-overlay fixed inset-0 z-50 flex h-dvh w-full flex-col items-center justify-center overflow-hidden px-4 text-[var(--kuro-studio-ink)]"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          dismissImmediately();
        }}
        aria-label="Skip intro"
        className="kuro-interactive absolute top-[max(0.75rem,env(safe-area-inset-top))] right-[max(0.75rem,env(safe-area-inset-right))] inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white backdrop-blur-xs hover:bg-white/18"
      >
        Skip
      </button>

      <div className="flex w-full max-w-sm flex-col items-center justify-center gap-3 text-center">
        <KuroMascotIdent
          mode="splash"
          className="w-[min(62vw,236px)] max-h-[46dvh]"
        />

        <div className="kuro-splash-wordmark space-y-1">
          <p className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Kuro
          </p>
          <p className="text-sm font-medium text-[var(--kuro-studio-ink-muted)] sm:text-base">
            More voices. Clearer ideas.
          </p>
        </div>
      </div>
    </div>
  );
}
