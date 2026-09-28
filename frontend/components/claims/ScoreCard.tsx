"use client";

import { useMemo } from "react";

import { useCountUp } from "@/hooks/useCountUp";
import type { HalloumiResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { countVerdicts, groundingSummary, scoreLabel, VERDICT_STYLES } from "@/lib/verdicts";

interface ScoreCardProps {
  response: HalloumiResponse;
}

/**
 * Final score strip: prominent but analytical. Every number is derived from
 * the real response; the stacked bar is proportional to actual claim counts.
 */
export function ScoreCard({ response }: ScoreCardProps) {
  const counts = useMemo(() => countVerdicts(response.claims), [response.claims]);
  const animated = useCountUp(response.answer_score);
  const label = scoreLabel(response.answer_score);
  const summary = groundingSummary(
    response.answer_score,
    counts,
    response.claims.length,
  );

  const total = response.claims.length;
  const segments = [
    { label: "Supported", count: counts.supported, dot: VERDICT_STYLES.supported.dot },
    { label: "Not enough info", count: counts.notEnoughInfo, dot: VERDICT_STYLES.not_enough_info.dot },
    { label: "Contradicted", count: counts.contradicted, dot: VERDICT_STYLES.contradicted.dot },
  ];

  return (
    <section
      aria-labelledby="score-heading"
      className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
    >
      <div className="flex flex-col gap-4 px-4 py-3 sm:flex-row sm:items-center sm:gap-8">
        <div className="shrink-0">
          <h2
            id="score-heading"
            className="text-[11px] font-medium uppercase tracking-wide text-ink-muted"
          >
            Verification complete
          </h2>
          <p
            aria-label={`Answer score ${response.answer_score.toFixed(1)} out of 10`}
            className={cn(
              "mt-0.5 text-4xl font-bold tabular-nums tracking-tight",
              response.answer_score >= 7
                ? "text-emerald-600 dark:text-emerald-400"
                : response.answer_score >= 4
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400",
            )}
          >
            {animated.toFixed(1)}
            <span className="text-base font-medium text-ink-muted">/10</span>
          </p>
          <p className="text-sm font-semibold">{label}</p>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-muted">{summary}</p>

          {total > 0 && (
            <div
              aria-hidden
              className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
            >
              {segments.map(
                (seg) =>
                  seg.count > 0 && (
                    <div
                      key={seg.label}
                      className={cn("h-full", seg.dot)}
                      style={{ width: `${(seg.count / total) * 100}%` }}
                    />
                  ),
              )}
            </div>
          )}

          <dl className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            {segments.map((seg) => (
              <div key={seg.label} className="flex items-center gap-1.5">
                <dt className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", seg.dot)} />
                  {seg.label}
                </dt>
                <dd className="text-xs font-semibold tabular-nums">{seg.count}</dd>
              </div>
            ))}
            {counts.skipped > 0 && (
              <p className="text-xs text-ink-faint">
                {counts.skipped} claim{counts.skipped === 1 ? "" : "s"} could not
                be located in the answer text and{" "}
                {counts.skipped === 1 ? "is" : "are"} listed separately.
              </p>
            )}
          </dl>
        </div>
      </div>
    </section>
  );
}