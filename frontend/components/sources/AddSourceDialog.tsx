"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { SourceDoc, SourceType } from "@/lib/types";
import { uid } from "@/lib/utils";

import { Button } from "@/components/ui/button";

const inputClasses =
  "w-full rounded-md bg-surface-sunken/50 px-3 py-2 text-sm text-ink ring-1 ring-inset ring-line placeholder:text-ink-faint focus:ring-2 focus:ring-accent";

interface AddSourceDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (source: SourceDoc) => void;
}

export function AddSourceDialog({ open, onClose, onAdd }: AddSourceDialogProps) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle("");
      setText("");
      setSourceType("text");
      setUrl("");
      setError(null);
      // Focus after mount
      requestAnimationFrame(() => firstFieldRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    if (!text.trim()) {
      setError("Source text is required — the backend verifies against text it receives.");
      return;
    }
    onAdd({
      id: uid(),
      title: title.trim() || `Source ${Date.now() % 100000}`,
      text: text.trim(),
      sourceType,
      url: url.trim(),
    });
    onClose();
  };

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
      <div className="relative w-full max-w-lg rounded-xl bg-surface-raised p-5 shadow-panel ring-1 ring-line">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Add source</h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Paste the document text the answer was generated from.
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}>
            <X aria-hidden className="h-4 w-4" />
          </Button>
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div>
            <label htmlFor="source-title" className="mb-1 block text-xs font-medium text-ink-muted">
              Title <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              id="source-title"
              ref={firstFieldRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. European Climate Law"
              className={inputClasses}
            />
          </div>

          <div>
            <label htmlFor="source-text" className="mb-1 block text-xs font-medium text-ink-muted">
              Source text <span className="text-red-500">*</span>
            </label>
            <textarea
              id="source-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Paste the document text…"
              className={inputClasses}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="source-type" className="mb-1 block text-xs font-medium text-ink-muted">
                Source type
              </label>
              <select
                id="source-type"
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as SourceType)}
                className={inputClasses}
              >
                <option value="text">Pasted text</option>
                <option value="web">Web</option>
                <option value="file">File</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="source-url" className="mb-1 block text-xs font-medium text-ink-muted">
                URL <span className="text-ink-faint">(optional, stored as metadata)</span>
              </label>
              <input
                id="source-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className={inputClasses}
              />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-faint">
            URL ingestion is not performed by the backend — paste the document
            text itself. A URL entered here is kept only as reference metadata.
          </p>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">Add source</Button>
          </div>
        </form>
      </div>
    </div>
  );
}