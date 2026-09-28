"use client";

import { Moon, Plus, Settings, ShieldCheck, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ApiStatus } from "@/hooks/useApiStatus";
import type { Theme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

interface HeaderProps {
  status: ApiStatus;
  version: string | null;
  theme: Theme;
  onToggleTheme: () => void;
  onNewCheck: () => void;
  onCheckConnection: () => void;
}

const STATUS_META: Record<ApiStatus, { label: string; dot: string }> = {
  unknown: { label: "Checking API…", dot: "bg-zinc-400" },
  online: { label: "API connected", dot: "bg-emerald-500" },
  offline: { label: "API offline", dot: "bg-red-500" },
};

export function Header({
  status,
  version,
  theme,
  onToggleTheme,
  onNewCheck,
  onCheckConnection,
}: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [settingsOpen]);

  const meta = STATUS_META[status];
  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <ShieldCheck aria-hidden className="h-5 w-5 text-accent" />
          <div className="leading-tight">
            <p className="text-sm font-semibold">RAG Facts Check</p>
            <p className="hidden text-xs text-ink-muted sm:block">
              Verify every claim against its sources.
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            role="status"
            aria-live="polite"
            className="hidden items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-xs text-ink-muted ring-1 ring-line sm:flex"
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                meta.dot,
                status === "unknown" && "animate-pulse",
              )}
            />
            {meta.label}
            {version ? <span className="text-ink-faint">v{version}</span> : null}
          </div>

          <div className="relative" ref={panelRef}>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <Settings aria-hidden className="h-4 w-4" />
            </Button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg bg-surface-raised p-4 shadow-panel ring-1 ring-line">
                <h2 className="text-sm font-semibold">Settings</h2>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">Backend URL</dt>
                    <dd className="font-mono text-ink">{apiBaseUrl}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">Backend status</dt>
                    <dd>{meta.label}</dd>
                  </div>
                  {version ? (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-ink-muted">Version</dt>
                      <dd>{version}</dd>
                    </div>
                  ) : null}
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={onCheckConnection}
                >
                  Check connection
                </Button>
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                  LLM credentials stay on the backend — the browser only talks
                  to the RAG Facts Check service.
                </p>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={onToggleTheme}
          >
            {theme === "dark" ? (
              <Sun aria-hidden className="h-4 w-4" />
            ) : (
              <Moon aria-hidden className="h-4 w-4" />
            )}
          </Button>

          <Button size="sm" onClick={onNewCheck}>
            <Plus aria-hidden className="h-4 w-4" />
            New Check
          </Button>
        </div>
      </div>
    </header>
  );
}