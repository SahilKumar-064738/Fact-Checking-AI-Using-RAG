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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const check = useCallback(async () => {
    try {
      const health = await getHealth();
      setStatus("online");
      setVersion(health.version ?? null);
    } catch {
      setStatus("offline");
      setVersion(null);
    }
  }, []);

  useEffect(() => {
    void check();
    timerRef.current = setInterval(() => void check(), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [check, intervalMs]);

  return { status, version, check };
}