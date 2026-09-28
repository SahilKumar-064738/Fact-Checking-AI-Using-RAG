"use client";

import { X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { claimSegments, locateSegmentInSources } from "@/lib/highlight";
import type { HalloumiResponse, SourceDoc } from "@/lib/types";
import { claimVerdict, VERDICT_STYLES } from "@/lib/verdicts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SourceDetailModalProps {
  /** All sources — needed to map joined segment offsets correctly. */
  sources: SourceDoc[];
  sourceIndex: number;
  response: HalloumiResponse | null;
  onClose: () => void;
}

/** Full-text source viewer with claim reference stats. */
export function SourceDetailModal({
  sources,
  sourceIndex,
  response,
  onClose,
}: SourceDetailModalProps) {
  const source = sources[sourceIndex];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Claims that reference this source (via segments or document_index)
  const referencingClaims = useMemo(() => {
    if (!response || !source) return [];
    return response.claims.filter((claim) => {
      if (claim.document_index === sourceIndex) return true;
      return claimSegments(claim, response).some(
        (range) => locateSegmentInSources(sources, range)?.sourceIndex === sourceIndex,
      );
    });
  }, [response, sources, source, sourceIndex]);

  if (!source) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Source: ${source.title}`}
    >
      <button
        type="button"
        aria-label="Close source details"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-surface-raised shadow-panel ring-1 ring-line">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{source.title}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {source.sourceType} · {source.text.length.toLocaleString()} characters
              {source.url && ` · ${source.url}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>

        <div className="thin-scroll flex-1 overflow-y-auto p-5">
          {response && (
            <div className="mb-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                Claims referencing this source
              </h3>
              {referencingClaims.length === 0 ? (
                <p className="mt-1.5 text-sm text-ink-faint">
                  No verified claims reference this source.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {referencingClaims.map((claim, i) => {
                    const verdict = claimVerdict(claim);
                    const style = VERDICT_STYLES[verdict];
                    return (
                      <li
                        key={i}
                        className="flex items-start justify-between gap-2 rounded-lg bg-surface-sunken/60 p-2.5"
                      >
                        <p className="line-clamp-2 text-xs leading-5 text-ink">
                          {claim.claimString}
                        </p>
                        <Badge className={style.badge}>{style.shortLabel}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <h3 className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            Full text
          </h3>
          <pre className="thin-scroll mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-sunken/60 p-3 font-mono text-xs leading-5 text-ink-muted">
            {source.text}
          </pre>
        </div>
      </div>
    </div>
  );
}