"use client";

import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { useMemo } from "react";

import { buildAnswerPieces } from "@/lib/highlight";
import type { HalloumiClaim, HalloumiResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { claimVerdict, VERDICT_STYLES } from "@/lib/verdicts";

interface AnswerHighlighterProps {
  answer: string;
  response: HalloumiResponse;
  selectedClaim: HalloumiClaim | null;
  onSelectClaim: (claim: HalloumiClaim) => void;
}

const LEGEND = [
  { verdict: "supported" as const, Icon: CheckCircle2 },
  { verdict: "not_enough_info" as const, Icon: HelpCircle },
  { verdict: "contradicted" as const, Icon: AlertTriangle },
];

/**
 * The answer rendered as the document under verification. Claims are
 * highlighted by verdict with an icon legend so states never rely on
 * color alone. Highlights are keyboard-focusable buttons.
 */
export function AnswerHighlighter({
  answer,
  response,
  selectedClaim,
  onSelectClaim,
}: AnswerHighlighterProps) {
  const pieces = useMemo(
    () => buildAnswerPieces(answer, response.claims),
    [answer, response.claims],
  );

  return (
    <section
      aria-labelledby="highlight-answer-heading"
      className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-2.5 sm:px-8">
        <h2 id="highlight-answer-heading" className="text-sm font-semibold">
          Answer under verification
        </h2>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
          {LEGEND.map(({ verdict, Icon }) => (
            <li key={verdict} className="flex items-center gap-1">
              <Icon aria-hidden className="h-3 w-3" />
              {VERDICT_STYLES[verdict].label}
            </li>
          ))}
          <li className="hidden text-ink-faint sm:inline">
            · Click a highlight to inspect it
          </li>
        </ul>
      </div>
      <p className="whitespace-pre-wrap px-4 py-4 font-doc text-[15px] leading-7 text-ink sm:px-8 sm:py-6 sm:text-base sm:leading-8">
        {pieces.map((piece, i) => {
          if (piece.kind === "text") return <span key={i}>{piece.text}</span>;
          const claim = piece.claim;
          const verdict = claimVerdict(claim);
          const style = VERDICT_STYLES[verdict];
          const isSelected =
            selectedClaim !== null &&
            selectedClaim.startOffset === claim.startOffset &&
            selectedClaim.endOffset === claim.endOffset;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectClaim(claim)}
              title={`${style.label} — ${claim.claimString}`}
              aria-label={`${style.label}: ${claim.claimString}`}
              className={cn(
                "cursor-pointer rounded-sm px-0.5 text-left transition-[box-shadow] duration-150",
                style.highlight,
                isSelected && "ring-2 ring-accent ring-offset-1 ring-offset-surface-raised",
              )}
            >
              {piece.text}
            </button>
          );
        })}
      </p>
    </section>
  );
}