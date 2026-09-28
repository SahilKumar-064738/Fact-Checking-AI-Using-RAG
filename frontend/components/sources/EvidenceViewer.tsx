"use client";

import { useMemo } from "react";

import { claimSegments, locateSegmentInSources } from "@/lib/highlight";
import type { HalloumiClaim, HalloumiResponse, SourceDoc } from "@/lib/types";
import { cn } from "@/lib/utils";

interface EvidenceViewerProps {
  claim: HalloumiClaim;
  response: HalloumiResponse;
  sources: SourceDoc[];
}

/**
 * Shows the source text with the matched evidence highlighted using the
 * backend's offsets. When offsets cannot be mapped, the evidence quote is
 * shown without pretending an exact location is known.
 */
export function EvidenceViewer({ claim, response, sources }: EvidenceViewerProps) {
  const locations = useMemo(
    () =>
      claimSegments(claim, response)
        .map((range) => ({ range, loc: locateSegmentInSources(sources, range) }))
        .filter((x) => x.loc !== null) as {
        range: { start: number; end: number };
        loc: { sourceIndex: number; start: number; end: number };
      }[],
    [claim, response, sources],
  );

  if (locations.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-ink-muted">
        {claim.evidence && claim.evidence !== "N/A" ? (
          <>
            <p className="font-medium text-ink">Evidence quote (exact source location not available)</p>
            <blockquote className="mt-2 border-l-2 border-accent/60 pl-3 italic leading-6">
              “{claim.evidence}”
            </blockquote>
          </>
        ) : (
          <p>No evidence was returned for this claim.</p>
        )}
      </div>
    );
  }

  // Render each source that contains evidence for this claim
  return (
    <div className="space-y-4">
      {locations.map(({ loc }, i) => {
        const source = sources[loc.sourceIndex];
        if (!source) return null;
        const before = source.text.slice(0, loc.start);
        const highlight = source.text.slice(loc.start, loc.end);
        const after = source.text.slice(loc.end);
        const CONTEXT = 220;

        return (
          <div key={i} className="rounded-lg bg-surface-sunken/60 p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">
              {source.title}
              <span className="text-ink-faint"> · Document {loc.sourceIndex + 1}</span>
            </p>
            <p className="thin-scroll max-h-64 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-5 text-ink-muted">
              {before.length > CONTEXT && (
                <span className="select-none text-ink-faint">…{before.slice(-CONTEXT)}</span>
              )}
              {before.length <= CONTEXT && <span className="select-none text-ink-faint">{before}</span>}
              <mark className="rounded-sm bg-emerald-100 px-0.5 font-semibold text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100">
                {highlight}
              </mark>
              {after.length > CONTEXT && (
                <span className="select-none text-ink-faint">{after.slice(0, CONTEXT)}…</span>
              )}
              {after.length <= CONTEXT && <span className="select-none text-ink-faint">{after}</span>}
            </p>
          </div>
        );
      })}
    </div>
  );
}