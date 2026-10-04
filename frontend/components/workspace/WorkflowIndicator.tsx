"use client";

import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface WorkflowIndicatorProps {
  hasAnswer: boolean;
  hasSources: boolean;
  verifying: boolean;
}

type StepState = "todo" | "done" | "active";

/**
 * Subtle three-step guide: Add Answer → Add Sources → Verify.
 * States are derived from real workspace state — never fabricated.
 */
export function WorkflowIndicator({
  hasAnswer,
  hasSources,
  verifying,
}: WorkflowIndicatorProps) {
  const answerState: StepState = hasAnswer ? "done" : "active";
  const sourcesState: StepState = hasSources ? "done" : hasAnswer ? "active" : "todo";
  const verifyState: StepState = verifying
    ? "active"
    : hasAnswer && hasSources
      ? "active"
      : "todo";

  const steps: { label: string; state: StepState }[] = [
    { label: "Add Answer", state: answerState },
    { label: "Add Sources", state: sourcesState },
    { label: verifying ? "Verifying" : "Verify", state: verifyState },
  ];

  return (
    <ol
      aria-label="Verification workflow"
      className="flex items-center gap-2 text-[11px] text-ink-muted"
    >
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-ink-faint">→</span>}
          <span
            className={cn(
              "flex items-center gap-1.5",
              step.state === "done" && "text-emerald-400",
              step.state === "active" && "text-ink",
              step.state === "todo" && "text-ink-faint",
            )}
          >
            {step.state === "done" ? (
              <Check aria-hidden className="h-3 w-3" strokeWidth={3} />
            ) : step.state === "active" && verifying ? (
              <Loader2 aria-hidden className="h-3 w-3 animate-spin" />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "h-3 w-3 rounded-full border",
                  step.state === "active"
                    ? "border-accent"
                    : "border-line-strong",
                )}
              />
            )}
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}