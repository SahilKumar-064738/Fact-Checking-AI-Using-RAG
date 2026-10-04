"use client";

import { useCallback, useEffect, useState } from "react";

import { DEFAULT_MODEL_ID } from "@/lib/modelCatalog";

/**
 * Client-side model preferences, persisted in localStorage.
 *
 * - selected model (falls back to the backend default when absent)
 * - favorites (pinned models)
 * - recently used (most recent first, capped)
 *
 * No backend user-preference system exists; localStorage is the store.
 */

const SELECTED_KEY = "rfc.selected-model";
const FAVORITES_KEY = "rfc.favorite-models";
const RECENTS_KEY = "rfc.recent-models";
const MAX_RECENTS = 5;

function readString(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readIdList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode/quota) — selection still works in-memory
  }
}

export function useModelSelection() {
  const [selectedId, setSelectedIdState] = useState<string>(DEFAULT_MODEL_ID);
  const [favorites, setFavoritesState] = useState<string[]>([]);
  const [recents, setRecentsState] = useState<string[]>([]);
  /** True once localStorage has been read (avoids SSR/client drift). */
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSelectedIdState(readString(SELECTED_KEY) || DEFAULT_MODEL_ID);
    setFavoritesState(readIdList(FAVORITES_KEY));
    setRecentsState(readIdList(RECENTS_KEY));
    setHydrated(true);
  }, []);

  const selectModel = useCallback((id: string) => {
    setSelectedIdState(id);
    write(SELECTED_KEY, id);
    setRecentsState((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
      write(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavoritesState((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      write(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    selectedId,
    selectModel,
    favorites,
    toggleFavorite,
    recents,
    hydrated,
  };
}