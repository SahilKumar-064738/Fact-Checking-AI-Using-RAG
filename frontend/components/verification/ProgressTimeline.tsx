"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { useMemo } from "react";

import type { StageEvent, VerificationPhase } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Renders ONLY real backend stages received over SSE. When the blocking
 * endpoint is used (no SSE), an honest fallback message is shown instead
 * of fabricated stage events.
 */

interface TimelineStep {
  key: string;
  label: string;
  status: "done" | "active" | "pending";
  detail?: string;
}

const STAGE_LABELS: Record<string, string> = {
  started: "Verification started",
  extracting_claims: "Extracting claims",
  claims_extracted: "Claims extracted",
  verifying_claims: "Verifying claims",
  claims_verified: "Claims verified",
  scoring: "Calculating score",
};

/** Canonical stage order for rendering the timeline. */
const STAGE_ORDER = [
  "started",
  "extracting_claims",
  "claims_extracted",
  "verifying_claims",
  "claims_verified",
  "scoring",
];

export function ProgressTimeline({
  phase,
  stages,
  hasRealProgress,
}: {
  phase: VerificationPhase;
  stages: StageEvent[];
  hasRealProgress: boolean;
}) {
  // Reduce the raw event list to the latest payload per stage name
  const latestByStage = useMemo(() => {
    const map = new Map<string, StageEvent>();
    for (const stage of stages) {
      map.set(stage.event, stage);
    }
    return map;
  }, [stages]);

  const received = useMemo(() => {
    const names = new Set(latestByStage.keys());
    return STAGE_ORDER.filter((name) => names.has(name));
  }, [latestByStage]);

  if (!hasRealProgress) {
    // Blocking path: show an honest state without inventing stages
    return (
      <div className="flex items-center gap-3 rounded-lg bg-surface-sunken/60 p-4 text-sm text-ink-muted">
        <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent" />
        <p aria-live="polite">
          {phase === "connecting"
            ? "Connecting to the verification service…"
            : "Verification in progress — this can take a while for long answers. The backend will respond when it finishes."}
        </p>
      </div>
    );
  }

  const steps: TimelineStep[] = received.map((name) => {
    const isLast = name === received[received.length - 1];
    const payload = latestByStage.get(name);
    const status: TimelineStep["status"] =
      phase === "complete" || !isLast ? "done" : "active";

    let detail: string | undefined;
    if (payload) {
      if (name === "claims_extracted" && payload.count !== undefined) {
        detail = `${payload.count} claim${payload.count === 1 ? "" : "s"} found`;
      }
      if (name === "claims_verified" && payload.verified !== undefined && payload.total !== undefined) {
        detail = `${payload.verified} / ${payload.total} verified`;
      }
      if (name === "verifying_claims" && payload.total !== undefined) {
        detail = `${payload.total} claim${payload.total === 1 ? "" : "s"} to verify`;
      }
    }
    return { key: name, label: STAGE_LABELS[name] ?? name, status, detail };
  });

  return (
    <ol aria-live="polite" className="space-y-0.5">
      {steps.map((step, i) => (
        <li key={step.key} className="relative flex items-start gap-3 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="absolute left-[9px] top-6 h-full w-px bg-line"
            />
          )}
          <span className="relative mt-0.5 shrink-0">
            {step.status === "done" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check aria-hidden className="h-3 w-3" />
              </span>
            ) : step.status === "active" ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
              </span>
            ) : (
              <Circle aria-hidden className="h-5 w-5 p-1 text-ink-faint" />
            )}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm",
                step.status === "done" && "text-ink",
                step.status === "active" && "font-medium text-ink",
                step.status === "pending" && "text-ink-faint",
              )}
            >
              {step.label}
            </p>
            {step.detail && (
              <p className="text-xs text-ink-muted">{step.detail}</p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}