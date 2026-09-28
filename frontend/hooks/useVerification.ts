"use client";

import { useCallback, useRef, useState } from "react";

import { ApiError, verifyAnswer, verifyAnswerWithProgress } from "@/lib/api";
import type {
  HalloumiRequest,
  HalloumiResponse,
  StageEvent,
  VerificationPhase,
} from "@/lib/types";

export interface VerificationState {
  phase: VerificationPhase;
  /** Real backend stage events received so far. */
  stages: StageEvent[];
  /** True when at least one stage event came from the backend SSE stream. */
  hasRealProgress: boolean;
  result: HalloumiResponse | null;
  error: ApiError | null;
  startedAt: number | null;
  finishedAt: number | null;
}

const INITIAL_STATE: VerificationState = {
  phase: "idle",
  stages: [],
  hasRealProgress: false,
  result: null,
  error: null,
  startedAt: null,
  finishedAt: null,
};

/**
 * State machine for one verification run.
 *
 * Prefers the SSE stream endpoint (real backend progress). If streaming
 * is unavailable the blocking endpoint is used and the UI shows honest
 * request phases only (connecting / running) — no fabricated stages.
 */
export function useVerification() {
  const [state, setState] = useState<VerificationState>(INITIAL_STATE);
  const runIdRef = useRef(0);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  const run = useCallback(async (request: HalloumiRequest) => {
    runIdRef.current += 1;
    const runId = runIdRef.current;

    setState({
      ...INITIAL_STATE,
      phase: "connecting",
      startedAt: Date.now(),
    });

    const isCurrent = () => runIdRef.current === runId;

    await verifyAnswerWithProgress(request, {
      onStage: (stage) => {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          phase: "running",
          hasRealProgress: true,
          stages: [...prev.stages, stage],
        }));
      },
      onResult: (result) => {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          phase: "complete",
          result,
          error: null,
          finishedAt: Date.now(),
        }));
      },
      onError: (error) => {
        if (!isCurrent()) return;
        setState((prev) => ({
          ...prev,
          phase: "error",
          error,
          finishedAt: Date.now(),
        }));
      },
    });
  }, []);

  /**
   * Retry using the plain blocking endpoint only — useful when the stream
   * endpoint itself is misbehaving.
   */
  const retryBlocking = useCallback(async (request: HalloumiRequest) => {
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const isCurrent = () => runIdRef.current === runId;

    setState({
      ...INITIAL_STATE,
      phase: "running",
      hasRealProgress: false,
      startedAt: Date.now(),
    });

    try {
      const result = await verifyAnswer(request);
      if (!isCurrent()) return;
      setState((prev) => ({
        ...prev,
        phase: "complete",
        result,
        error: null,
        finishedAt: Date.now(),
      }));
    } catch (e) {
      if (!isCurrent()) return;
      setState((prev) => ({
        ...prev,
        phase: "error",
        error: e instanceof ApiError ? e : new ApiError("Verification failed."),
        finishedAt: Date.now(),
      }));
    }
  }, []);

  return { state, run, reset, retryBlocking };
}