"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import type { VerificationState } from "@/hooks/useVerification";
import type { StageEvent } from "@/lib/types";

import { ProgressTimeline } from "@/components/verification/ProgressTimeline";
import { VerificationError } from "@/components/verification/VerificationError";

interface VerificationPanelProps {
  state: VerificationState;
  onRetry: () => void;
}

/** Human-readable line for a real backend stage event. Never fabricated. */
function stageLine(stage: StageEvent): string {
  switch (stage.event) {
    case "started":
      return "Verification run started";
    case "extracting_claims":
      return "Extracting atomic claims from the answer…";
    case "claims_extracted":
      return stage.count !== undefined
        ? `${stage.count} claim${stage.count === 1 ? "" : "s"} extracted`
        : "Claims extracted";
    case "verifying_claims":
      return stage.total !== undefined
        ? `Verifying ${stage.total} claim${stage.total === 1 ? "" : "s"} against the sources…`
        : "Verifying claims against the sources…";
    case "claims_verified":
      return stage.verified !== undefined && stage.total !== undefined
        ? `${stage.verified} of ${stage.total} claims verified`
        : "Claims verified";
    case "scoring":
      return "Aggregating verdicts into the 0–10 score…";
    default:
      return stage.event;
  }
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Dedicated "Verification Run" experience. Replaces the input workspace
 * while a run is active. Shows only real backend stage events; when the
 * blocking endpoint is used (no SSE) it says so honestly.
 */
export function VerificationPanel({ state, onRetry }: VerificationPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.phase !== "connecting" && state.phase !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [state.phase]);

  if (state.phase === "error" && state.error) {
    return <VerificationError error={state.error} onRetry={onRetry} />;
  }

  const elapsed = state.startedAt !== null ? now - state.startedAt : 0;

  return (
    <section
      aria-labelledby="verification-heading"
      aria-live="polite"
      className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <h2 id="verification-heading" className="text-sm font-semibold">
            Verification Run
          </h2>
        </div>
        <p className="font-mono text-xs tabular-nums text-ink-muted">
          elapsed {formatElapsed(elapsed)}
        </p>
      </div>

      <div className="grid gap-6 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Pipeline stages
          </h3>
          <ProgressTimeline
            phase={state.phase}
            stages={state.stages}
            hasRealProgress={state.hasRealProgress}
          />
        </div>

        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            Activity
          </h3>

          {!state.hasRealProgress ? (
            <p className="rounded-md border border-dashed border-line-strong p-3 text-sm text-ink-muted">
              {state.phase === "connecting"
                ? "Connecting to the verification service…"
                : "Waiting for the backend to respond. Long answers can take a while; results appear the moment they arrive."}
            </p>
          ) : (
            <ol className="space-y-1.5" aria-live="polite">
              {state.stages.map((stage, i) => (
                <motion.li
                  key={`${stage.event}-${i}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-2 rounded-md bg-surface-sunken/60 px-2.5 py-2 text-sm leading-5"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  />
                  <span>{stageLine(stage)}</span>
                </motion.li>
              ))}
            </ol>
          )}

          <p className="mt-3 text-[11px] leading-relaxed text-ink-faint">
            Claims and verdicts appear once the backend reports them. This
            interface never simulates progress.
          </p>
        </div>
      </div>
    </section>
  );
}