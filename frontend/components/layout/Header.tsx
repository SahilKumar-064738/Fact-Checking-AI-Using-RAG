"use client";

import {
  AlertTriangle,
  ChevronDown,
  Copy,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { ApiStatus } from "@/hooks/useApiStatus";
import type { ModelInfo } from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

interface HeaderProps {
  status: ApiStatus;
  version: string | null;
  /** True while a manual health check is in flight. */
  checking: boolean;
  /** Epoch ms of the last completed health check (null = never). */
  lastCheckedAt: number | null;
  /** Model configured on the backend (from GET /health) — never hardcoded. */
  backendModel: string | null;
  /** The model selected for the next verification (localStorage-backed). */
  selectedModel: ModelInfo | null;
  onOpenModelSelector: () => void;
  onNewCheck: () => void;
  onCheckConnection: () => void;
}

const STATUS_META: Record<ApiStatus, { label: string; dot: string }> = {
  unknown: { label: "Checking", dot: "bg-zinc-400" },
  online: { label: "Connected", dot: "bg-emerald-500" },
  offline: { label: "Offline", dot: "bg-red-500" },
};

function formatLastChecked(at: number | null): string {
  if (at === null) return "Never";
  const delta = Date.now() - at;
  if (delta < 15_000) return "Just now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return new Date(at).toLocaleTimeString();
}

export function Header({
  status,
  version,
  checking,
  lastCheckedAt,
  backendModel,
  selectedModel,
  onOpenModelSelector,
  onNewCheck,
  onCheckConnection,
}: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const healthUrl = `${apiBaseUrl.replace(/\/+$/, "")}/health`;

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(healthUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — the value stays visible/selectable
    }
  };

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
          {/* Model pill — clickable, opens the model selector */}
          <button
            type="button"
            onClick={onOpenModelSelector}
            aria-haspopup="dialog"
            aria-label={`Model selection. Currently ${
              selectedModel ? selectedModel.name : "unknown model"
            }. Status ${meta.label}. Open the model browser.`}
            className={cn(
              "hidden min-w-0 items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-1 text-xs text-ink-muted ring-1 ring-line sm:flex",
              "transition-colors hover:bg-surface-sunken hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                meta.dot,
                status === "unknown" && "animate-pulse",
              )}
            />
            <span className="shrink-0">{meta.label}</span>
            {selectedModel && (
              <>
                <span aria-hidden className="text-ink-faint">·</span>
                <span
                  title={selectedModel.id}
                  className="max-w-[22ch] truncate font-medium text-ink"
                >
                  {selectedModel.name}
                </span>
              </>
            )}
            <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-ink-faint" />
          </button>

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
              <div className="absolute right-0 top-full mt-2 w-[22rem] rounded-lg bg-surface-raised p-4 shadow-panel ring-1 ring-line">
                <h2 className="text-sm font-semibold">Settings</h2>

                {/* CONNECTION */}
                <p className="mt-3 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  Connection
                </p>
                <dl className="mt-1.5 space-y-2 text-xs">
                  <div>
                    <dt className="text-ink-muted">Backend URL</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5">
                      <code
                        title={healthUrl}
                        className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink"
                      >
                        {healthUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 shrink-0 px-1.5 text-[11px]"
                        aria-label="Copy backend health URL"
                        onClick={() => void copyUrl()}
                      >
                        {copied ? (
                          <Check aria-hidden className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <Copy aria-hidden className="h-3 w-3" />
                        )}
                      </Button>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">Status</dt>
                    <dd className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          meta.dot,
                          status === "unknown" && "animate-pulse",
                        )}
                      />
                      {meta.label}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">Last checked</dt>
                    <dd className="text-ink">{formatLastChecked(lastCheckedAt)}</dd>
                  </div>
                </dl>

                {/* AI MODEL */}
                <p className="mt-4 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  AI Model
                </p>
                <dl className="mt-1.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-ink-muted">Current model</dt>
                    <dd className="truncate text-ink">
                      {selectedModel?.name ?? "—"}
                    </dd>
                  </div>
                  {selectedModel && (
                    <>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-ink-muted">Provider</dt>
                        <dd className="text-ink">{selectedModel.provider}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-ink-muted">Context</dt>
                        <dd className="text-ink">{selectedModel.context} tokens</dd>
                      </div>
                    </>
                  )}
                </dl>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => {
                    setSettingsOpen(false);
                    onOpenModelSelector();
                  }}
                >
                  Change model
                </Button>

                {/* VERSION */}
                <p className="mt-4 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                  Version
                </p>
                <p className="mt-1.5 text-xs text-ink">
                  {version ? `v${version}` : "Unknown (backend unreachable)"}
                </p>

                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={checking}
                  onClick={onCheckConnection}
                >
                  {checking ? (
                    <>
                      <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
                      Checking…
                    </>
                  ) : status === "offline" ? (
                    <>
                      <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                      Retry connection
                    </>
                  ) : (
                    <>
                      <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                      Check connection
                    </>
                  )}
                </Button>
                {status === "offline" && (
                  <p
                    role="alert"
                    className="mt-2 flex items-start gap-1.5 text-[11px] text-red-400"
                  >
                    <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
                    Unable to reach the backend.
                  </p>
                )}
                <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
                  LLM credentials stay on the backend — the browser only talks
                  to the RAG Facts Check service.
                </p>
              </div>
            )}
          </div>

          <Button size="sm" onClick={onNewCheck}>
            <Plus aria-hidden className="h-4 w-4" />
            New Check
          </Button>
        </div>
      </div>

      {/* Small screens: the model pill is replaced by a full-width bar */}
      <div className="border-t border-line px-4 py-1.5 sm:hidden">
        <button
          type="button"
          onClick={onOpenModelSelector}
          aria-haspopup="dialog"
          aria-label={`Model selection. Currently ${
            selectedModel ? selectedModel.name : "unknown model"
          }. Open the model browser.`}
          className="flex w-full items-center gap-1.5 rounded-md bg-surface-raised px-2.5 py-1.5 text-xs text-ink-muted ring-1 ring-line"
        >
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)}
          />
          <span className="shrink-0">{meta.label}</span>
          {selectedModel && (
            <>
              <span aria-hidden className="text-ink-faint">·</span>
              <span className="min-w-0 flex-1 truncate text-left font-medium text-ink">
                {selectedModel.name}
              </span>
            </>
          )}
          <ChevronDown aria-hidden className="h-3 w-3 shrink-0 text-ink-faint" />
        </button>
      </div>
    </header>
  );
}