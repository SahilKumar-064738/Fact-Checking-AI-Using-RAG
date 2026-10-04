"use client";

import { Eye, FileText, Globe, Plus, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";

import type { SourceDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import { sourceDomain, sourceTypeLabel } from "@/lib/sourceDisplay";

import { Button } from "@/components/ui/button";

const TYPE_ICON: Record<SourceDoc["sourceType"], typeof FileText> = {
  text: FileText,
  web: Globe,
  file: FileText,
  other: FileText,
};

interface SourcesPanelProps {
  sources: SourceDoc[];
  disabled?: boolean;
  onAdd: () => void;
  /** Called with the dropped file — the panel never parses files itself. */
  onDropFile?: (file: File) => void;
  onRemove: (id: string) => void;
  onInspect: (id: string) => void;
}

/**
 * The source context the answer will be verified against. The header
 * button is the primary "Add source" CTA; when the list is empty the
 * ENTIRE empty card is one big keyboard-accessible action that opens the
 * same dialog (and accepts document drops).
 */
export function SourcesPanel({
  sources,
  disabled,
  onAdd,
  onDropFile,
  onRemove,
  onInspect,
}: SourcesPanelProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files?.[0];
    if (file && onDropFile) onDropFile(file);
    else onAdd();
  };

  return (
    <section
      aria-labelledby="sources-heading"
      className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0">
          <h2 id="sources-heading" className="flex items-center gap-2 text-sm font-semibold">
            Sources
            {sources.length > 0 && (
              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-ink-muted ring-1 ring-inset ring-line">
                {sources.length}
              </span>
            )}
          </h2>
          <p className="text-xs text-ink-muted">
            The documents the answer is verified against.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus aria-hidden className="h-3.5 w-3.5" />
          Add source
        </Button>
      </div>

      <div className="p-3">
        {sources.length === 0 ? (
          <div
            data-testid="sources-empty-state"
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="No sources yet — click to add a source, or drop a document here"
            onClick={() => !disabled && onAdd()}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onAdd();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={cn(
              "rounded-md border border-dashed px-5 py-7 text-center transition-colors",
              disabled
                ? "border-line cursor-not-allowed opacity-60"
                : "cursor-pointer border-line-strong hover:border-accent/60 hover:bg-surface-sunken/40",
              dragOver && "border-accent bg-accent-soft/50",
            )}
          >
            <FileText aria-hidden className="mx-auto h-5 w-5 text-ink-faint" />
            <p className="mt-2 text-sm font-medium">
              {dragOver ? "Drop to add source" : "No sources yet"}
            </p>
            <p className="mx-auto mt-1 max-w-[30ch] text-xs leading-5 text-ink-muted">
              {dragOver
                ? "Release to open the add-source dialog with this document."
                : "Drop a document here, or click anywhere in this box to add text, a web link, or a file."}
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {sources.map((source, i) => {
              const Icon = TYPE_ICON[source.sourceType];
              const domain = sourceDomain(source.url);
              return (
                <li
                  key={source.id}
                  className="rounded-md bg-surface-sunken/40 p-2.5 ring-1 ring-inset ring-line"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        <span
                          aria-hidden
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-accent/10 font-mono text-[10px] font-semibold text-accent"
                        >
                          {i + 1}
                        </span>
                        <span className="truncate" title={source.title}>
                          {source.title}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-muted">
                        <Icon aria-hidden className="h-3 w-3 shrink-0" />
                        {sourceTypeLabel(source)}
                        <span aria-hidden>·</span>
                        {source.text.length.toLocaleString()} chars
                      </p>
                      {domain && (
                        <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                          {domain}
                        </p>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`View ${source.title}`}
                        onClick={() => onInspect(source.id)}
                      >
                        <Eye aria-hidden className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`Remove ${source.title}`}
                        disabled={disabled}
                        onClick={() => onRemove(source.id)}
                      >
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <p
                    className={cn(
                      "mt-2 line-clamp-2 whitespace-pre-wrap rounded-md bg-surface-sunken/60 p-2",
                      "font-mono text-[11px] leading-4 text-ink-muted",
                    )}
                  >
                    {source.text}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}