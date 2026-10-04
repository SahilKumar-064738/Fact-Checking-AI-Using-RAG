"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getHealth } from "@/lib/api";

export type ApiStatus = "unknown" | "online" | "offline";

/**
 * Polls GET /health at a relaxed interval for the header status indicator.
 * No fabricated status — "unknown" until the first check completes.
 */
export function useApiStatus(intervalMs = 30000) {
  const [status, setStatus] = useState<ApiStatus>("unknown");
  const [version, setVersion] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  /** True while a health check request is in flight (no duplicates). */
  const [checking, setChecking] = useState(false);
  /** Epoch ms of the last completed check, for "Last checked" display. */
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflightRef = useRef(false);

  const check = useCallback(async () => {
    // Never run two health checks concurrently (interval + manual click
    // can otherwise produce duplicate requests).
    if (inflightRef.current) return;
    inflightRef.current = true;
    setChecking(true);
    try {
      const health = await getHealth();
      setStatus("online");
      setVersion(health.version ?? null);
      setModel(health.model ?? null);
    } catch {
      setStatus("offline");
      setVersion(null);
      setModel(null);
    } finally {
      inflightRef.current = false;
      setChecking(false);
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    void check();
    timerRef.current = setInterval(() => void check(), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [check, intervalMs]);

  return { status, version, model, check, checking, lastCheckedAt };
}