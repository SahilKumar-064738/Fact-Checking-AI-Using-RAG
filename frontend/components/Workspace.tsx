"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnswerEditor } from "@/components/answer/AnswerEditor";
import { ResultsView } from "@/components/claims/ResultsView";
import { Header } from "@/components/layout/Header";
import { AddSourceDialog } from "@/components/sources/AddSourceDialog";
import { SourceDetailModal } from "@/components/sources/SourceDetailModal";
import { SourcesPanel } from "@/components/sources/SourcesPanel";
import { Button } from "@/components/ui/button";
import { VerificationPanel } from "@/components/verification/VerificationPanel";
import { useApiStatus } from "@/hooks/useApiStatus";
import { useTheme } from "@/hooks/useTheme";
import { useVerification } from "@/hooks/useVerification";
import type { HalloumiRequest, SourceDoc } from "@/lib/types";

export function Workspace() {
  const { theme, toggleTheme } = useTheme();
  const { status, version, model, check } = useApiStatus();
  const verification = useVerification();

  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const phase = verification.state.phase;
  const isRunning = phase === "connecting" || phase === "running";

  const canVerify = answer.trim().length > 0 && sources.length > 0 && !isRunning;

  const request: HalloumiRequest = useMemo(
    () => ({
      answer: answer.trim(),
      sources: sources.map((s) => ({
        text: s.text,
        title: s.title || null,
        source_type: s.sourceType || null,
        link: s.url || null,
      })),
    }),
    [answer, sources],
  );

  const handleVerify = useCallback(() => {
    if (!canVerify) return;
    verification.run(request);
  }, [canVerify, request, verification]);

  const handleNewCheck = useCallback(() => {
    verification.reset();
    setAnswer("");
    setSources([]);
    setAddOpen(false);
    setInspectId(null);
  }, [verification]);

  // Keyboard-first: Ctrl/Cmd+Enter verifies, "/" focuses the answer editor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleVerify();
        return;
      }
      if (e.key === "/" && phase === "idle") {
        const t = e.target as HTMLElement;
        if (
          t.tagName === "TEXTAREA" ||
          t.tagName === "INPUT" ||
          t.tagName === "SELECT" ||
          t.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        editorRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleVerify, phase]);

  const inspectedIndex = useMemo(
    () => sources.findIndex((s) => s.id === inspectId),
    [inspectId, sources],
  );

  const hasResult = phase === "complete" && verification.state.result !== null;

  return (
    <div className="min-h-screen">
      <Header
        status={status}
        version={version}
        model={model}
        theme={theme}
        onToggleTheme={toggleTheme}
        onNewCheck={handleNewCheck}
        onCheckConnection={() => void check()}
      />

      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        {phase === "idle" && !hasResult && (
          <div className="mb-4 border-b border-line pb-3">
            <h1 className="text-base font-semibold tracking-tight">
              Verify an AI-generated answer
            </h1>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-ink-muted sm:text-sm">
              Paste the answer and provide the sources it was generated from.
              RAG Facts Check will break the answer into claims and verify each
              one against the evidence.
            </p>
          </div>
        )}

        {isRunning || phase === "error" ? (
          <VerificationPanel
            state={verification.state}
            onRetry={() => verification.run(request)}
          />
        ) : hasResult && verification.state.result ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ResultsView
              answer={answer}
              response={verification.state.result}
              sources={sources}
              onInspectSource={setInspectId}
            />
          </motion.div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-3">
              <AnswerEditor
                ref={editorRef}
                value={answer}
                onChange={setAnswer}
                disabled={isRunning}
              />

              {/* Single, intentional CTA — duplicated nowhere else */}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  disabled={!canVerify}
                  onClick={handleVerify}
                  aria-live="polite"
                >
                  <ShieldCheck aria-hidden className="h-4 w-4" />
                  Verify Answer
                </Button>
                {!canVerify ? (
                  <p className="text-xs text-ink-muted">
                    {answer.trim().length === 0 && sources.length === 0
                      ? "Enter an answer and add at least one source to verify."
                      : answer.trim().length === 0
                        ? "Enter the RAG answer to verify."
                        : "Add at least one source document."}
                  </p>
                ) : (
                  <p className="hidden items-center gap-1 text-[11px] text-ink-faint sm:flex">
                    <kbd className="rounded border border-line bg-surface-sunken px-1 font-mono text-[10px]">
                      Ctrl
                    </kbd>
                    +
                    <kbd className="rounded border border-line bg-surface-sunken px-1 font-mono text-[10px]">
                      ↵
                    </kbd>
                    to verify ·
                    <kbd className="rounded border border-line bg-surface-sunken px-1 font-mono text-[10px]">
                      /
                    </kbd>
                    to focus the answer
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <SourcesPanel
                sources={sources}
                disabled={isRunning}
                onAdd={() => setAddOpen(true)}
                onRemove={(id) =>
                  setSources((prev) => prev.filter((s) => s.id !== id))
                }
                onInspect={setInspectId}
              />
            </div>
          </div>
        )}
      </main>

      <AddSourceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(source) => setSources((prev) => [...prev, source])}
      />

      {inspectedIndex >= 0 && (
        <SourceDetailModal
          sources={sources}
          sourceIndex={inspectedIndex}
          response={verification.state.result}
          onClose={() => setInspectId(null)}
        />
      )}
    </div>
  );
}