"use client";

import { ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { ApiError } from "@/lib/api";
import { getApiBaseUrl } from "@/lib/api";

import { Button } from "@/components/ui/button";

interface VerificationErrorProps {
  error: ApiError;
  onRetry: () => void;
}

export function VerificationError({ error, onRetry }: VerificationErrorProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50/60 p-4 dark:border-red-500/30 dark:bg-red-500/10"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-red-500"
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-red-700 dark:text-red-300">
            Verification failed
          </h3>
          <p className="mt-1 text-sm text-red-600 dark:text-red-300/90">
            {error.message}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onRetry}>
              <RefreshCw aria-hidden className="h-3.5 w-3.5" />
              Retry
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open(`${getApiBaseUrl()}/health`, "_blank")}
            >
              Check connection
            </Button>
          </div>
          <button
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((s) => !s)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-300"
          >
            <ChevronDown
              aria-hidden
              className={
                showDetails ? "h-3 w-3 rotate-180" : "h-3 w-3"
              }
            />
            Developer details
          </button>
          {showDetails && (
            <pre className="thin-scroll mt-2 max-h-40 overflow-auto rounded-md bg-surface-sunken p-2 font-mono text-[11px] leading-4 text-ink-muted">
              {[
                `status: ${error.status ?? "n/a"}`,
                `message: ${error.message}`,
                error.detail ? `detail: ${error.detail}` : "",
                `backend: ${getApiBaseUrl()}`,
              ]
                .filter(Boolean)
                .join("\n")}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}