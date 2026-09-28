/**
 * Verdict presentation mapping — derived from ACTUAL backend values only.
 *
 * Backend verdicts: "supported" | "not_enough_info" | "contradicted".
 * There is no "partially supported" verdict in the backend; the UI must not
 * invent one. Score thresholds are informational only and never used to
 * reclassify verdicts.
 */

import type { HalloumiClaim, Verdict, VerdictCounts } from "./types";

export interface VerdictStyle {
  label: string;
  shortLabel: string;
  description: string;
  /** Tailwind classes for the highlight over the answer text. */
  highlight: string;
  /** Tailwind classes for the verdict badge. */
  badge: string;
  /** Solid color used in bars/dots. */
  dot: string;
  /** Text color for verdict labels and icons. */
  textColor: string;
}

export const VERDICT_STYLES: Record<Verdict, VerdictStyle> = {
  supported: {
    label: "Supported",
    shortLabel: "Supported",
    description: "Directly supported by the provided sources.",
    highlight:
      "bg-emerald-100/70 dark:bg-emerald-500/15 underline decoration-emerald-600/60 decoration-2 underline-offset-[3px] dark:decoration-emerald-400/60",
    badge:
      "bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/30",
    dot: "bg-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  not_enough_info: {
    label: "Not enough info",
    shortLabel: "Unverified",
    description: "The sources do not contain sufficient evidence for this claim.",
    highlight:
      "bg-amber-100/70 dark:bg-amber-500/15 underline decoration-amber-600/60 decoration-2 underline-offset-[3px] dark:decoration-amber-400/60",
    badge:
      "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/30",
    dot: "bg-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  contradicted: {
    label: "Contradicted",
    shortLabel: "Contradicted",
    description: "Contradicted by the provided sources.",
    highlight:
      "bg-red-100/70 dark:bg-red-500/15 underline decoration-red-600/60 decoration-2 underline-offset-[3px] dark:decoration-red-400/60",
    badge:
      "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/30",
    dot: "bg-red-500",
    textColor: "text-red-600 dark:text-red-400",
  },
};

/** Resolve the verdict for a claim, preferring the explicit field. */
export function claimVerdict(claim: HalloumiClaim): Verdict {
  if (claim.verdict) return claim.verdict;
  // Fallback for older backends without the additive verdict field:
  // derive strictly from the documented verdict-based score mapping.
  if (claim.score >= 0.99) return "supported";
  if (claim.score <= 0.01) return "contradicted";
  return "not_enough_info";
}

/** Count claims per verdict. Skipped claims are counted separately. */
export function countVerdicts(claims: HalloumiClaim[]): VerdictCounts {
  const counts: VerdictCounts = {
    supported: 0,
    notEnoughInfo: 0,
    contradicted: 0,
    skipped: 0,
  };
  for (const claim of claims) {
    if (claim.skipped) counts.skipped += 1;
    const v = claimVerdict(claim);
    if (v === "supported") counts.supported += 1;
    else if (v === "contradicted") counts.contradicted += 1;
    else counts.notEnoughInfo += 1;
  }
  return counts;
}

/** Human label for the 0-10 answer score, matching backend score_label(). */
export function scoreLabel(score: number): string {
  if (score >= 9) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5) return "Acceptable";
  if (score >= 3) return "Poor";
  if (score > 0) return "Failing";
  return "No claims";
}

/** Short grounding sentence derived only from real counts. */
export function groundingSummary(score: number, counts: VerdictCounts, total: number): string {
  if (total === 0) return "No factual claims were detected in the answer.";
  const parts: string[] = [];
  if (counts.supported === total) {
    parts.push("Every claim is directly supported by the provided sources.");
  } else if (counts.contradicted > 0) {
    parts.push(
      `${counts.contradicted} claim${counts.contradicted === 1 ? "" : "s"} are contradicted by the sources.`,
    );
  } else if (counts.notEnoughInfo > 0) {
    parts.push(
      `${counts.notEnoughInfo} claim${counts.notEnoughInfo === 1 ? "" : "s"} could not be verified from the sources.`,
    );
  } else {
    parts.push("Most claims are directly supported by the provided sources.");
  }
  return parts.join(" ");
}