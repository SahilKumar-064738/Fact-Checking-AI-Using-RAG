"use client";

import { AlertTriangle, ArrowDown, CheckCircle2, FileText, HelpCircle } from "lucide-react";

import { claimSegments, locateSegmentInSources } from "@/lib/highlight";
import type { HalloumiClaim, HalloumiResponse, SourceDoc } from "@/lib/types";
import { claimVerdict, VERDICT_STYLES } from "@/lib/verdicts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EvidenceViewer } from "@/components/sources/EvidenceViewer";

const VERDICT_ICONS = {
  supported: CheckCircle2,
  not_enough_info: HelpCircle,
  contradicted: AlertTriangle,
} as const;

interface ClaimInspectorProps {
  claim: HalloumiClaim | null;
  claimIndex: number;
  response: HalloumiResponse;
  sources: SourceDoc[];
  onInspectSource: (sourceId: string) => void;
}

function ChainArrow() {
  return (
    <div className="flex justify-center pl-3" aria-hidden>
      <ArrowDown className="h-3.5 w-3.5 text-ink-faint" />
    </div>
  );
}

/**
 * Persistent right-side inspector: the CLAIM -> EVIDENCE -> SOURCE -> VERDICT
 * chain for the selected claim. Only renders fields the backend returned;
 * confidence is omitted entirely when it was not calculated.
 */
export function ClaimInspector({
  claim,
  claimIndex,
  response,
  sources,
  onInspectSource,
}: ClaimInspectorProps) {
  if (!claim) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong p-4 text-center">
        <p className="text-sm text-ink-muted">No claim selected</p>
        <p className="mt-1 text-xs text-ink-faint">
          Click a highlighted claim in the answer, or a claim below, to trace
          its evidence and source.
        </p>
      </div>
    );
  }

  const verdict = claimVerdict(claim);
  const style = VERDICT_STYLES[verdict];
  const Icon = VERDICT_ICONS[verdict];

  // Resolve the source document from the backend's document_index or from
  // the segment offsets in the joined sources string.
  const evidenceLocations = claimSegments(claim, response)
    .map((range) => locateSegmentInSources(sources, range))
    .filter(
      (loc): loc is { sourceIndex: number; start: number; end: number } =>
        loc !== null,
    );
  const sourceIdx =
    claim.document_index !== undefined && claim.document_index !== null
      ? claim.document_index
      : evidenceLocations[0]?.sourceIndex;
  const source =
    sourceIdx !== undefined && sourceIdx >= 0 && sources[sourceIdx]
      ? sources[sourceIdx]
      : undefined;

  const hasEvidenceQuote = Boolean(claim.evidence && claim.evidence !== "N/A");

  return (
    <div
      aria-label={`Claim ${claimIndex + 1} details`}
      className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
    >
      <div className="border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">
          Claim {String(claimIndex + 1).padStart(2, "0")}
        </h2>
      </div>

      <div className="space-y-2 p-4">
        {/* CLAIM */}
        <section aria-label="Claim">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Claim
          </h3>
          <p className="mt-1 rounded-md bg-surface-sunken/60 p-2.5 text-sm leading-6">
            {claim.claimString}
          </p>
          {claim.skipped && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              Not located in the answer text (paraphrased by the extractor).
            </p>
          )}
        </section>

        <ChainArrow />

        {/* EVIDENCE */}
        <section aria-label="Evidence">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Evidence
          </h3>
          {hasEvidenceQuote ? (
            <blockquote className="mt-1 rounded-md bg-surface-sunken/60 p-2.5 text-sm italic leading-6">
              “{claim.evidence}”
            </blockquote>
          ) : (
            <p className="mt-1 text-sm text-ink-faint">
              No evidence quote was returned for this claim.
            </p>
          )}
        </section>

        <ChainArrow />

        {/* SOURCE */}
        <section aria-label="Source">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Source
          </h3>
          {source ? (
            <div className="mt-1 rounded-md bg-surface-sunken/60 p-2.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <FileText aria-hidden className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <span className="truncate">{source.title}</span>
              </p>
              <p className="mt-0.5 text-[11px] text-ink-muted">
                Document {sourceIdx! + 1} · {source.sourceType} ·{" "}
                {source.text.length.toLocaleString()} chars
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 mt-1 h-7 text-xs"
                onClick={() => onInspectSource(source.id)}
              >
                View full source
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-faint">
              Source location not available for this claim.
            </p>
          )}
        </section>

        <ChainArrow />

        {/* VERDICT */}
        <section aria-label="Verdict">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Verdict
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge className={style.badge}>
              <Icon aria-hidden className="h-3 w-3" />
              {style.label}
            </Badge>
            <span className="text-xs text-ink-muted">
              Score{" "}
              <strong className="tabular-nums text-ink">
                {claim.score.toFixed(1)}
              </strong>
            </span>
            {claim.confidence !== undefined && claim.confidence > 0 && (
              <span className="text-xs text-ink-muted">
                Confidence{" "}
                <strong className="tabular-nums text-ink">
                  {claim.confidence}%
                </strong>
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">{style.description}</p>
          {claim.rationale && (
            <p className="mt-2 rounded-md bg-surface-sunken/40 p-2.5 text-xs leading-5 text-ink-muted">
              {claim.rationale}
            </p>
          )}
        </section>

        {/* Matched source spans, when the backend provided exact offsets */}
        {evidenceLocations.length > 0 && (
          <>
            <ChainArrow />
            <section aria-label="Evidence in source text">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
                Evidence in source text
              </h3>
              <div className="mt-1">
                <EvidenceViewer
                  claim={claim}
                  response={response}
                  sources={sources}
                />
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}