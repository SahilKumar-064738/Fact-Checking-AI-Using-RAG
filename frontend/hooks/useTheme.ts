"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Theme hook: system preference initially, persisted choice afterwards.
 * Applies the "dark" class on <html> for Tailwind's class strategy.
 */

const STORAGE_KEY = "rag-facts-check-theme";

export type Theme = "light" | "dark";

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let initial: Theme;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      initial = stored === "dark" || stored === "light" ? stored : systemTheme();
    } catch {
      initial = systemTheme();
    }
    setThemeState(initial);
    applyTheme(initial);
    setMounted(true);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (!window.localStorage.getItem(STORAGE_KEY)) {
          const next = e.matches ? "dark" : "light";
          setThemeState(next);
          applyTheme(next);
        }
      } catch {
        // storage unavailable — just apply
        const next = e.matches ? "dark" : "light";
        setThemeState(next);
        applyTheme(next);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore storage errors
      }
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, toggleTheme, mounted };
}