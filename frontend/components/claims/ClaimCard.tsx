"use client";

import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

import type { HalloumiClaim } from "@/lib/types";
import { cn } from "@/lib/utils";
import { claimVerdict, VERDICT_STYLES } from "@/lib/verdicts";

const VERDICT_ICONS = {
  supported: CheckCircle2,
  not_enough_info: HelpCircle,
  contradicted: AlertTriangle,
} as const;

interface ClaimCardProps {
  claim: HalloumiClaim;
  index: number;
  selected: boolean;
  onSelect: (claim: HalloumiClaim) => void;
}

/**
 * One compact row in the claim list. Rows, not cards: this is a repeated-use
 * tool and the list can hold many claims.
 */
export function ClaimCard({ claim, index, selected, onSelect }: ClaimCardProps) {
  const verdict = claimVerdict(claim);
  const style = VERDICT_STYLES[verdict];
  const Icon = VERDICT_ICONS[verdict];

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.04, 0.3) }}
    >
      <button
        type="button"
        onClick={() => onSelect(claim)}
        aria-pressed={selected}
        aria-label={`Claim ${index + 1}: ${claim.claimString}. Verdict: ${style.label}.`}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left",
          "ring-1 ring-inset ring-line transition-colors duration-150",
          "hover:bg-surface-sunken/70",
          selected && "bg-accent-soft/60 ring-2 ring-accent",
        )}
      >
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-ink-faint">
          <Icon aria-hidden className={cn("h-3.5 w-3.5", style.textColor)} />
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block text-sm leading-5 text-ink">
            {claim.claimString}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
            <span className={cn("font-medium", style.textColor)}>
              {style.label}
            </span>
            <span>Score {claim.score.toFixed(1)}</span>
            {claim.segmentIds.length === 0 && <span>No evidence span</span>}
            {claim.skipped && <span>Not located in answer</span>}
          </span>
        </span>
      </button>
    </motion.li>
  );
}