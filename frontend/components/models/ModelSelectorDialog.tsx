"use client";

import { Loader2, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ModelCard } from "@/components/models/ModelCard";
import { Button } from "@/components/ui/button";
import {
  isLongContext,
  isSupportedForFactChecking,
  type ModelCapability,
  type ModelInfo,
} from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";

type Filter =
  | "all"
  | "free"
  | "reasoning"
  | "vision"
  | "long-context";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "free", label: "Free" },
  { id: "reasoning", label: "Reasoning" },
  { id: "vision", label: "Vision" },
  { id: "long-context", label: "Long Context" },
];

interface ModelSelectorDialogProps {
  open: boolean;
  onClose: () => void;
  models: ModelInfo[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  selectedId: string;
  favorites: string[];
  recents: string[];
  onSelect: (model: ModelInfo) => void;
  onToggleFavorite: (id: string) => void;
  /** True while a verification is in flight — selection is locked for it. */
  verificationRunning: boolean;
  /** Name of the model used by the running verification (when locked). */
  runningModelName: string | null;
}

function matchesFilter(model: ModelInfo, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "free":
      return model.free;
    case "reasoning":
      return model.capabilities.includes("reasoning" as ModelCapability);
    case "vision":
      return model.capabilities.includes("vision" as ModelCapability);
    case "long-context":
      return isLongContext(model);
  }
}

/**
 * The model browser: search, filters, curated sections (favorites,
 * recently used, recommended) and the full catalog grouped by provider.
 *
 * Fact-checking-incompatible models stay visible under their provider but
 * are disabled and clearly marked — never presented as selectable options.
 */
export function ModelSelectorDialog({
  open,
  onClose,
  models,
  loading,
  error,
  onReload,
  selectedId,
  favorites,
  recents,
  onSelect,
  onToggleFavorite,
  verificationRunning,
  runningModelName,
}: ModelSelectorDialogProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setFilter("all");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const byId = useMemo(() => {
    const map = new Map<string, ModelInfo>();
    for (const m of models) map.set(m.id, m);
    return map;
  }, [models]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    return models.filter((m) => {
      if (!matchesFilter(m, filter)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
      );
    });
  }, [models, filter, q]);

  // Curated sections only appear when not searching/filtering — the
  // default experience leads with recommendations, not all 54 models.
  const curated = q === "" && filter === "all";

  const favoriteModels = curated
    ? favorites.map((id) => byId.get(id)).filter((m): m is ModelInfo => !!m)
    : [];
  const recentModels = curated
    ? recents
        .filter((id) => id !== selectedId)
        .map((id) => byId.get(id))
        .filter((m): m is ModelInfo => !!m)
    : [];
  const recommendedModels = useMemo(
    () => visible.filter((m) => m.recommended),
    [visible],
  );

  // Provider grouping preserves the backend's provider order.
  const providerGroups = useMemo(() => {
    const seen = new Map<string, ModelInfo[]>();
    for (const m of visible) {
      if (curated && m.recommended) continue; // shown above
      const list = seen.get(m.provider) ?? [];
      list.push(m);
      seen.set(m.provider, list);
    }
    return Array.from(seen.entries());
  }, [visible, curated]);

  if (!open) return null;

  const renderGrid = (list: ModelInfo[]) => (
    <div
      role="listbox"
      aria-label="Models"
      className="grid gap-3 sm:grid-cols-2"
    >
      {list.map((m) => (
        <ModelCard
          key={m.id}
          model={m}
          selected={m.id === selectedId}
          favorite={favorites.includes(m.id)}
          onSelect={(model) => {
            onSelect(model);
            onClose();
          }}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Select AI model"
    >
      <button
        type="button"
        aria-label="Close model selector"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div
        ref={dialogRef}
        className="relative flex h-[92vh] w-full max-w-4xl flex-col rounded-t-xl bg-surface shadow-panel ring-1 ring-line sm:h-[85vh] sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold">Select model</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              The model used to extract and verify claims. Your choice applies
              to the next verification.
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>

        {verificationRunning && (
          <p
            role="status"
            className="mx-5 mt-3 rounded-md bg-accent-soft/60 px-3 py-2 text-xs leading-5 text-ink ring-1 ring-inset ring-accent/30"
          >
            Verification in progress — using{" "}
            <strong>{runningModelName ?? "the current model"}</strong>. New
            model will be used for your next verification.
          </p>
        )}

        <div className="space-y-3 border-b border-line px-5 py-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              className={cn(
                "w-full rounded-md bg-surface-sunken/50 py-2 pl-8 pr-3 text-sm text-ink",
                "ring-1 ring-inset ring-line placeholder:text-ink-faint",
                "focus:ring-2 focus:ring-accent",
              )}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Model filters">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors",
                  filter === f.id
                    ? "bg-accent text-black ring-accent"
                    : "bg-surface-raised text-ink-muted ring-line hover:text-ink",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="thin-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex flex-col items-center gap-2 py-16 text-ink-muted">
              <Loader2 aria-hidden className="h-5 w-5 animate-spin text-accent" />
              <p className="text-sm">Loading model catalog…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button variant="secondary" size="sm" onClick={onReload}>
                <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && (
            <>
              {curated && favoriteModels.length > 0 && (
                <section aria-labelledby="favorites-heading">
                  <h3
                    id="favorites-heading"
                    className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted"
                  >
                    ⭐ Favorites
                  </h3>
                  {renderGrid(favoriteModels)}
                </section>
              )}

              {curated && recentModels.length > 0 && (
                <section aria-labelledby="recents-heading">
                  <h3
                    id="recents-heading"
                    className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted"
                  >
                    Recently used
                  </h3>
                  {renderGrid(recentModels)}
                </section>
              )}

              {recommendedModels.length > 0 && (
                <section aria-labelledby="recommended-heading">
                  <h3
                    id="recommended-heading"
                    className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted"
                  >
                    ⭐ Recommended for Fact Checking
                  </h3>
                  {renderGrid(recommendedModels)}
                </section>
              )}

              {providerGroups.length > 0 && (
                <section aria-label="All models by provider">
                  <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                    {curated ? "All models" : "Results"}
                  </h3>
                  <div className="space-y-5">
                    {providerGroups.map(([provider, list]) => (
                      <div key={provider}>
                        <h4 className="mb-2 text-xs font-semibold text-ink">
                          {provider}{" "}
                          <span className="font-normal text-ink-faint">
                            ({list.length})
                          </span>
                        </h4>
                        {renderGrid(list)}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {visible.length === 0 && (
                <p className="py-16 text-center text-sm text-ink-muted">
                  No models match “{query}”.
                </p>
              )}
            </>
          )}
        </div>

        <div className="border-t border-line px-5 py-2.5">
          <p className="text-[11px] text-ink-faint">
            The backend validates every model id against its allowlist —
            arbitrary ids are never sent to the LLM provider.
          </p>
        </div>
      </div>
    </div>
  );
}