"use client";

import { Check, Copy, Star } from "lucide-react";
import { useState } from "react";

import {
  CAPABILITY_META,
  type ModelInfo,
} from "@/lib/modelCatalog";
import { cn } from "@/lib/utils";

interface ModelCardProps {
  model: ModelInfo;
  selected: boolean;
  favorite: boolean;
  onSelect: (model: ModelInfo) => void;
  onToggleFavorite: (id: string) => void;
}

/**
 * One model in the browser grid. The card is a button (keyboard
 * selectable); the favorite star is a nested button handled via
 * stopPropagation so card selection and pinning never collide.
 *
 * The display name is the primary title — the technical id lives in a
 * secondary "Technical details" disclosure with a copy action.
 */
export function ModelCard({
  model,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: ModelCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [idCopied, setIdCopied] = useState(false);

  const supported = model.supported_for_fact_checking !== false;

  const copyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(model.id);
      setIdCopied(true);
      setTimeout(() => setIdCopied(false), 1500);
    } catch {
      // clipboard unavailable — id stays visible/selectable
    }
  };

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={supported ? 0 : -1}
      aria-disabled={!supported}
      onClick={() => supported && onSelect(model)}
      onKeyDown={(e) => {
        if (!supported) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(model);
        }
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-lg p-4 text-left ring-1 transition-colors",
        selected
          ? "bg-accent-soft/40 ring-2 ring-accent"
          : "bg-surface-raised ring-line hover:bg-surface-sunken/60 hover:ring-line-strong",
        !supported && "cursor-not-allowed opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {model.provider}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={
              favorite
                ? `Remove ${model.name} from favorites`
                : `Add ${model.name} to favorites`
            }
            aria-pressed={favorite}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(model.id);
            }}
            className="rounded p-1 text-ink-faint transition-colors hover:text-accent"
          >
            <Star
              aria-hidden
              className={cn(
                "h-3.5 w-3.5",
                favorite && "fill-accent text-accent",
              )}
            />
          </button>
          {selected && (
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-black"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>

      <p className="mt-0.5 text-sm font-semibold text-ink">{model.name}</p>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {model.default && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent ring-1 ring-inset ring-accent/30">
            ⭐ DEFAULT
          </span>
        )}
        {model.recommended && !model.default && (
          <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 ring-1 ring-inset ring-emerald-500/30">
            RECOMMENDED
          </span>
        )}
        {model.experimental && (
          <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-orange-400 ring-1 ring-inset ring-orange-500/30">
            EXPERIMENTAL
          </span>
        )}
        {selected && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">
            Selected
          </span>
        )}
      </div>

      {/* Full description — never truncated */}
      <p className="mt-2 text-xs leading-5 text-ink-muted">{model.description}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        {model.capabilities.map((cap) => {
          const capMeta = CAPABILITY_META[cap];
          return (
            <span
              key={cap}
              title={capMeta.label}
              className="inline-flex items-center gap-1 rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted ring-1 ring-inset ring-line"
            >
              <span aria-hidden>{capMeta.icon}</span>
              {capMeta.label}
            </span>
          );
        })}
      </div>

      {!supported && (
        <p className="mt-2 rounded bg-red-500/10 px-2 py-1 text-[10px] leading-4 text-red-400 ring-1 ring-inset ring-red-500/20">
          Not usable for text fact-checking.
        </p>
      )}
      {model.specialization && (
        <p className="mt-2 text-[10px] leading-4 text-ink-faint">
          Specialization: {model.specialization}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold",
            model.free
              ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/30"
              : "bg-amber-500/10 text-amber-400 ring-1 ring-inset ring-amber-500/30",
          )}
        >
          {model.free ? "FREE" : "PAID"}
        </span>
        <span className="font-mono text-[10px] text-ink-faint">
          {model.context} context
        </span>
      </div>

      {/* Technical details — collapsed by default */}
      <div className="mt-2 border-t border-line pt-2">
        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={(e) => {
            e.stopPropagation();
            setDetailsOpen((o) => !o);
          }}
          className="text-[10px] font-medium text-ink-faint hover:text-ink-muted"
        >
          {detailsOpen ? "▾ Hide technical details" : "▸ Technical details"}
        </button>
        {detailsOpen && (
          <div className="mt-1 flex items-center gap-1.5">
            <code className="min-w-0 flex-1 break-all font-mono text-[10px] text-ink-muted">
              {model.id}
            </code>
            <button
              type="button"
              aria-label={`Copy model id ${model.id}`}
              onClick={copyId}
              className="shrink-0 rounded p-1 text-ink-faint hover:text-ink"
            >
              {idCopied ? (
                <Check aria-hidden className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy aria-hidden className="h-3 w-3" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}