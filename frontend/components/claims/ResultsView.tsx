"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HalloumiClaim, HalloumiResponse, SourceDoc } from "@/lib/types";

import { AnswerHighlighter } from "@/components/claims/AnswerHighlighter";
import { ClaimCard } from "@/components/claims/ClaimCard";
import { ClaimInspector } from "@/components/claims/ClaimInspector";
import { ScoreCard } from "@/components/claims/ScoreCard";

interface ResultsViewProps {
  answer: string;
  response: HalloumiResponse;
  sources: SourceDoc[];
  /** Human-readable name of the model that ran this verification. */
  modelLabel?: string | null;
  /** Wall-clock duration of the verification, if measured. */
  durationMs?: number | null;
  onInspectSource?: (sourceId: string) => void;
}

/**
 * Results workspace: the answer is the document (left), the claim inspector
 * stays visible on the right (desktop). J/K or arrow keys move through
 * claims; Escape clears the selection.
 */
export function ResultsView({
  answer,
  response,
  sources,
  modelLabel,
  durationMs,
  onInspectSource,
}: ResultsViewProps) {
  const [selected, setSelected] = useState<HalloumiClaim | null>(null);
  const claimsRef = useRef<HTMLElement>(null);

  const selectedIndex = useMemo(() => {
    if (!selected) return -1;
    return response.claims.findIndex(
      (c) =>
        c.startOffset === selected.startOffset &&
        c.endOffset === selected.endOffset,
    );
  }, [selected, response.claims]);

  const selectByIndex = useCallback(
    (index: number) => {
      const claim = response.claims[index];
      if (claim) setSelected(claim);
    },
    [response.claims],
  );

  // Keyboard navigation: J/K and arrow keys walk the claim list.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        t.tagName === "TEXTAREA" ||
        t.tagName === "INPUT" ||
        t.tagName === "SELECT" ||
        t.isContentEditable
      ) {
        return;
      }
      if (e.key === "Escape") {
        setSelected(null);
        return;
      }
      if (response.claims.length === 0) return;
      let next = -1;
      if (e.key === "j" || e.key === "J" || e.key === "ArrowDown") next = selectedIndex + 1;
      else if (e.key === "k" || e.key === "K" || e.key === "ArrowUp") next = selectedIndex - 1;
      else return;
      e.preventDefault();
      selectByIndex(Math.max(0, Math.min(response.claims.length - 1, next)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [response.claims.length, selectedIndex, selectByIndex]);

  // Keep the selected claim row in view when navigating with the keyboard.
  useEffect(() => {
    if (selectedIndex < 0 || !claimsRef.current) return;
    const button = claimsRef.current.querySelectorAll("button")[selectedIndex];
    button?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedIndex]);

  return (
    <div className="space-y-3">
      <ScoreCard response={response} modelLabel={modelLabel} durationMs={durationMs} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <AnswerHighlighter
            answer={answer}
            response={response}
            selectedClaim={selected}
            onSelectClaim={setSelected}
          />

          <section ref={claimsRef} aria-labelledby="claims-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="claims-heading" className="text-sm font-semibold">
                Claims ({response.claims.length})
              </h2>
              <p className="hidden text-[11px] text-ink-faint sm:block">
                Select a claim to inspect it · J/K or arrow keys to navigate ·
                Esc to clear
              </p>
            </div>

            {response.claims.length === 0 ? (
              <p className="rounded-md border border-dashed border-line-strong p-4 text-sm text-ink-muted">
                No factual claims were detected in this answer.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {response.claims.map((claim, i) => (
                  <ClaimCard
                    key={`${claim.startOffset}-${claim.endOffset}-${i}`}
                    claim={claim}
                    index={i}
                    selected={i === selectedIndex}
                    onSelect={setSelected}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="min-w-0 lg:sticky lg:top-16 lg:self-start">
          <ClaimInspector
            claim={selected}
            claimIndex={selectedIndex}
            response={response}
            sources={sources}
            onInspectSource={(id) => onInspectSource?.(id)}
          />
        </div>
      </div>
    </div>
  );
}