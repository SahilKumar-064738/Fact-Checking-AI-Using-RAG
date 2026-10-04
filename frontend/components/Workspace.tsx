"use client";

import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ReactorBackground } from "@/components/ambient/ReactorBackground";
import { AnswerEditor } from "@/components/answer/AnswerEditor";
import { ResultsView } from "@/components/claims/ResultsView";
import { Header } from "@/components/layout/Header";
import { ModelSelectorDialog } from "@/components/models/ModelSelectorDialog";
import { AddSourceDialog } from "@/components/sources/AddSourceDialog";
import { SourceDetailModal } from "@/components/sources/SourceDetailModal";
import { SourcesPanel } from "@/components/sources/SourcesPanel";
import { Button } from "@/components/ui/button";
import { VerificationPanel } from "@/components/verification/VerificationPanel";
import { WorkflowIndicator } from "@/components/workspace/WorkflowIndicator";
import { useApiStatus } from "@/hooks/useApiStatus";
import { useModelCatalog } from "@/hooks/useModelCatalog";
import { useModelSelection } from "@/hooks/useModelSelection";
import { useVerification } from "@/hooks/useVerification";
import type { HalloumiRequest, SourceDoc } from "@/lib/types";

export function Workspace() {
  const {
    status,
    version,
    model: backendModel,
    check,
    checking,
    lastCheckedAt,
  } = useApiStatus();
  const verification = useVerification();

  // Model selection — catalog from GET /models, preferences in localStorage.
  const catalog = useModelCatalog();
  const selection = useModelSelection();
  const [modelDialogOpen, setModelDialogOpen] = useState(false);

  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceDoc[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  /** File dropped onto the empty-sources card → opened straight into the dialog. */
  const [pendingDropFile, setPendingDropFile] = useState<File | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const phase = verification.state.phase;
  const isRunning = phase === "connecting" || phase === "running";

  const selectedModel = useMemo(
    () => catalog.models.find((m) => m.id === selection.selectedId) ?? null,
    [catalog.models, selection.selectedId],
  );

  // The model is locked for a running verification: capture it when the
  // request is built so a UI selection change never swaps mid-flight models.
  const lockedModelIdRef = useRef<string>(selection.selectedId);

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
      model: selection.selectedId,
    }),
    [answer, sources, selection.selectedId],
  );

  const handleVerify = useCallback(() => {
    if (!canVerify) return;
    lockedModelIdRef.current = selection.selectedId;
    verification.run(request);
  }, [canVerify, request, selection.selectedId, verification]);

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

  // Name of the model actually used by the running/completed verification —
  // prefers the backend's echoed model id, falls back to the locked local id.
  const runningModelName = useMemo(() => {
    const resultModel = verification.state.result?.model;
    const id = resultModel ?? lockedModelIdRef.current;
    return catalog.models.find((m) => m.id === id)?.name ?? id;
  }, [catalog.models, verification.state.result]);

  const openAddSource = useCallback((file?: File | null) => {
    setPendingDropFile(file ?? null);
    setAddOpen(true);
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Ambient reactor backdrop — decorative, behind all panels */}
      <ReactorBackground />
      <Header
        status={status}
        version={version}
        checking={checking}
        lastCheckedAt={lastCheckedAt}
        backendModel={backendModel}
        selectedModel={selectedModel}
        onOpenModelSelector={() => setModelDialogOpen(true)}
        onNewCheck={handleNewCheck}
        onCheckConnection={() => void check()}
      />

      <main className="relative z-10 mx-auto max-w-7xl px-4 py-4 sm:px-6">
        {phase === "idle" && !hasResult && (
          <div className="mb-4 border-b border-line pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-base font-semibold tracking-tight">
                  Verify an AI-generated answer
                </h1>
                <p className="mt-0.5 max-w-2xl text-xs leading-5 text-ink-muted sm:text-sm">
                  Paste the answer and provide the sources it was generated from.
                  RAG Facts Check will break the answer into claims and verify each
                  one against the evidence.
                </p>
              </div>
              <div className="pt-1">
                <WorkflowIndicator
                  hasAnswer={answer.trim().length > 0}
                  hasSources={sources.length > 0}
                  verifying={isRunning}
                />
              </div>
            </div>
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
              modelLabel={runningModelName}
              durationMs={
                verification.state.finishedAt !== null &&
                verification.state.startedAt !== null
                  ? verification.state.finishedAt - verification.state.startedAt
                  : null
              }
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
                onAdd={() => openAddSource()}
                onDropFile={(file) => openAddSource(file)}
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
        initialFile={pendingDropFile}
        onClose={() => {
          setAddOpen(false);
          setPendingDropFile(null);
        }}
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

      <ModelSelectorDialog
        open={modelDialogOpen}
        onClose={() => setModelDialogOpen(false)}
        models={catalog.models}
        loading={catalog.loading}
        error={catalog.error}
        onReload={() => void catalog.reload()}
        selectedId={selection.selectedId}
        favorites={selection.favorites}
        recents={selection.recents}
        onSelect={(model) => selection.selectModel(model.id)}
        onToggleFavorite={selection.toggleFavorite}
        verificationRunning={isRunning}
        runningModelName={isRunning ? runningModelName : null}
      />
    </div>
  );
}