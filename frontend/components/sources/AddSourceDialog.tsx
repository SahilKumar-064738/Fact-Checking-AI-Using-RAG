"use client";

import { CheckCircle2, Loader2, Upload, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

import { ApiError, extractSourceDocument } from "@/lib/api";
import type { SourceDoc, SourceType } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { uid } from "@/lib/utils";

import { Button } from "@/components/ui/button";

const inputClasses =
  "w-full rounded-md bg-surface-sunken/50 px-3 py-2 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-ink-faint focus:ring-2 focus:ring-accent";

type Tab = "text" | "web" | "file";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "text", label: "Paste text", hint: "Paste the source text directly" },
  { id: "web", label: "Web link", hint: "Reference a page by URL" },
  { id: "file", label: "Upload document", hint: "PDF, DOCX, TXT or MD" },
];

/** Client-side guard mirroring the backend allow-list. */
const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
/** Must stay in sync with MAX_FILE_SIZE_BYTES on the backend (10 MB). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

interface AddSourceDialogProps {
  open: boolean;
  /** File dropped onto the workspace's empty-sources card, if any —
   *  the dialog opens straight into the upload tab and processes it. */
  initialFile?: File | null;
  onClose: () => void;
  onAdd: (source: SourceDoc) => void;
}

export function AddSourceDialog({
  open,
  initialFile,
  onClose,
  onAdd,
}: AddSourceDialogProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileStatus, setFileStatus] = useState<"idle" | "extracting" | "done" | "error">("idle");
  const [extractedText, setExtractedText] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const firstFieldRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTitleRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const reset = useCallback(() => {
    setTab("text");
    setTitle("");
    setText("");
    setUrl("");
    setError(null);
    setFile(null);
    setFileStatus("idle");
    setExtractedText("");
    setShowPreview(false);
    setDragOver(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setError(null);
    if (next === "text") requestAnimationFrame(() => textareaRef.current?.focus());
    if (next === "web") requestAnimationFrame(() => firstFieldRef.current?.focus());
  };

  // --- Web tab: the backend does NOT fetch URLs. The URL is metadata;
  // the user must supply the page's actual text. Never fake a fetch.
  const urlValid = useMemo(() => {
    if (!url.trim()) return false;
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, [url]);

  // --- Upload handling -------------------------------------------------------

  const handleFile = useCallback(async (candidate: File) => {
    setError(null);
    setShowPreview(false);

    const name = candidate.name || "";
    const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      setFile(null);
      setFileStatus("error");
      setError("Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.");
      return;
    }
    if (candidate.size === 0) {
      setFile(null);
      setFileStatus("error");
      setError("The file is empty.");
      return;
    }
    if (candidate.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setFileStatus("error");
      setError("The file is too large (max 10 MB).");
      return;
    }

    setFile(candidate);
    setFileStatus("extracting");
    setExtractedText("");
    try {
      const result = await extractSourceDocument(candidate);
      setExtractedText(result.text);
      setFileStatus("done");
      // Default the title to the file name without clobbering user input.
      setTitle((prev) => (prev.trim() ? prev : name));
    } catch (e) {
      setFileStatus("error");
      setExtractedText("");
      setError(e instanceof ApiError ? e.message : "The document could not be processed.");
    }
  }, []);

  // Open/reset lifecycle: runs after handleFile is defined so a dropped
  // document can be processed immediately on open.
  useEffect(() => {
    if (!open) return;
    reset();
    if (initialFile) {
      // A document was dropped onto the workspace: open straight into the
      // upload tab and run the existing extraction path on it.
      setTab("file");
      void handleFile(initialFile);
      requestAnimationFrame(() => fileTitleRef.current?.focus());
    } else {
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    }
  }, [open, reset, initialFile, handleFile]);

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    // Allow re-selecting the same file
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  };

  // --- Validity per tab ------------------------------------------------------

  const canSubmit =
    tab === "text"
      ? text.trim().length > 0
      : tab === "web"
        ? urlValid && text.trim().length > 0
        : fileStatus === "done" && extractedText.length > 0;

  const submit = () => {
    if (!canSubmit) return;

    if (tab === "text") {
      onAdd({
        id: uid(),
        title: title.trim() || "Pasted text",
        text: text.trim(),
        sourceType: "text",
        url: "",
      });
    } else if (tab === "web") {
      onAdd({
        id: uid(),
        title: title.trim() || url.replace(/^https?:\/\//, "").slice(0, 80),
        text: text.trim(),
        sourceType: "web",
        url: url.trim(),
      });
    } else {
      const name = file?.name ?? "Document";
      const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
      onAdd({
        id: uid(),
        title: title.trim() || name,
        text: extractedText,
        sourceType: "file",
        url: "",
        fileName: name,
        fileKind: ext.toUpperCase(),
      });
    }
    onClose();
  };

  const onKeyDownSubmit = (e: KeyboardEvent) => {
    // Ctrl/Cmd+Enter submits from any field
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Add source"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-surface-raised shadow-panel ring-1 ring-line">
        <div className="flex items-start justify-between px-5 pt-5">
          <div>
            <h2 className="text-base font-semibold">Add source</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Add the evidence used to generate the answer.
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>

        {/* Source type selector */}
        <div className="px-5 pt-4">
          <p
            id="source-type-label"
            className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted"
          >
            Source type
          </p>
          <div
            role="tablist"
            aria-labelledby="source-type-label"
            className="grid grid-cols-3 gap-1 rounded-lg bg-surface-sunken/60 p-1 ring-1 ring-inset ring-line"
          >
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                aria-controls={`tabpanel-${t.id}`}
                id={`tab-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                title={t.hint}
                onClick={() => switchTab(t.id)}
                onKeyDown={(e) => {
                  // Roving arrow-key navigation between tabs
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const dir = e.key === "ArrowRight" ? 1 : -1;
                  const next = TABS[(i + dir + TABS.length) % TABS.length];
                  switchTab(next.id);
                  tabRefs.current[(i + dir + TABS.length) % TABS.length]?.focus();
                }}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-surface-raised text-ink shadow-sm ring-1 ring-inset ring-line"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          onKeyDown={onKeyDownSubmit}
        >
          <div className="thin-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {tab === "text" && (
              <div
                role="tabpanel"
                id="tabpanel-text"
                aria-labelledby="tab-text"
                className="space-y-3"
              >
                <div>
                  <label
                    htmlFor="source-title"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source title <span className="text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="source-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. European Climate Law"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label
                    htmlFor="source-text"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source text <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <textarea
                    id="source-text"
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={7}
                    placeholder="Paste the source/document text here…"
                    className={cn(inputClasses, "resize-y font-mono text-[13px] leading-5")}
                  />
                  <p aria-live="polite" className="mt-1 text-right font-mono text-[11px] tabular-nums text-ink-faint">
                    {formatNumber(text.length)} characters
                  </p>
                </div>
              </div>
            )}

            {tab === "web" && (
              <div
                role="tabpanel"
                id="tabpanel-web"
                aria-labelledby="tab-web"
                className="space-y-3"
              >
                <div>
                  <label
                    htmlFor="source-url"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source URL <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <input
                    id="source-url"
                    ref={firstFieldRef}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/european-climate-law"
                    inputMode="url"
                    autoComplete="off"
                    className={cn(inputClasses, "font-mono text-[13px]")}
                  />
                </div>
                <div>
                  <label
                    htmlFor="source-title-web"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source title <span className="text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="source-title-web"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. European Climate Law"
                    className={inputClasses}
                  />
                </div>
                <div>
                  <label
                    htmlFor="source-text-web"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source text <span className="text-red-500" aria-hidden>*</span>
                  </label>
                  <textarea
                    id="source-text-web"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={6}
                    placeholder="Paste the page's text content here…"
                    className={cn(inputClasses, "resize-y font-mono text-[13px] leading-5")}
                  />
                  <p aria-live="polite" className="mt-1 text-right font-mono text-[11px] tabular-nums text-ink-faint">
                    {formatNumber(text.length)} characters
                  </p>
                </div>
                <p className="rounded-md bg-surface-sunken/60 p-2.5 text-[11px] leading-relaxed text-ink-muted ring-1 ring-inset ring-line">
                  URL is stored as source metadata — the page content is not
                  fetched by the backend. Paste the actual source text above so
                  it can be verified.
                </p>
              </div>
            )}

            {tab === "file" && (
              <div
                role="tabpanel"
                id="tabpanel-file"
                aria-labelledby="tab-file"
                className="space-y-3"
              >
                {!file || fileStatus === "error" ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Upload document — drop a file here or choose a file"
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={onDrop}
                    className={cn(
                      "flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                      dragOver
                        ? "border-accent bg-accent-soft/50"
                        : "border-line-strong hover:border-accent/60 hover:bg-surface-sunken/40",
                    )}
                  >
                    <Upload aria-hidden className="h-5 w-5 text-ink-faint" />
                    <p className="mt-2 text-sm font-medium">Drop a document here</p>
                    <p className="mt-0.5 text-xs text-ink-muted">or</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1.5"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Choose file
                    </Button>
                    <p className="mt-2.5 font-mono text-[11px] text-ink-faint">
                      PDF · DOCX · TXT · MD
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                      className="sr-only"
                      aria-hidden
                      tabIndex={-1}
                      onChange={onFileInputChange}
                    />
                  </div>
                ) : (
                  <div className="rounded-lg bg-surface-sunken/50 p-3 ring-1 ring-inset ring-line">
                    <div className="flex items-start gap-2.5">
                      {fileStatus === "extracting" ? (
                        <Loader2
                          aria-hidden
                          className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-accent"
                        />
                      ) : (
                        <CheckCircle2
                          aria-hidden
                          className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {file.name.slice(file.name.lastIndexOf(".") + 1).toUpperCase()} ·{" "}
                          {formatFileSize(file.size)}
                        </p>
                        <p
                          aria-live="polite"
                          className="mt-1 text-[11px] text-ink-muted"
                        >
                          {fileStatus === "extracting" ? (
                            "Extracting text…"
                          ) : (
                            <>
                              <span className="text-emerald-600 dark:text-emerald-400">
                                ✓ Text extracted
                              </span>{" "}
                              · {formatNumber(extractedText.length)} characters
                            </>
                          )}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto shrink-0"
                        onClick={() => {
                          setFile(null);
                          setFileStatus("idle");
                          setExtractedText("");
                          setShowPreview(false);
                        }}
                      >
                        Choose another
                      </Button>
                    </div>
                    {fileStatus === "done" && extractedText && (
                      <div className="mt-2.5">
                        <button
                          type="button"
                          onClick={() => setShowPreview((v) => !v)}
                          aria-expanded={showPreview}
                          className="text-[11px] font-medium text-accent hover:underline"
                        >
                          {showPreview ? "Hide extracted text" : "Preview extracted text"}
                        </button>
                        {showPreview && (
                          <pre className="thin-scroll mt-1.5 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-md bg-surface-sunken/70 p-2.5 font-mono text-[11px] leading-4 text-ink-muted">
                            {extractedText}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label
                    htmlFor="source-title-file"
                    className="mb-1 block text-xs font-medium text-ink-muted"
                  >
                    Source title <span className="text-ink-faint">(optional)</span>
                  </label>
                  <input
                    id="source-title-file"
                    ref={fileTitleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Defaults to the file name"
                    className={inputClasses}
                  />
                </div>
              </div>
            )}

            {error && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Add source
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}