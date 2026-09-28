"use client";

import { ClipboardPaste } from "lucide-react";
import { forwardRef, type ClipboardEvent } from "react";

import { cn } from "@/lib/utils";

interface AnswerEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export const AnswerEditor = forwardRef<HTMLTextAreaElement, AnswerEditorProps>(
  function AnswerEditor({ value, onChange, disabled }, ref) {
    const chars = value.length;
    const words = value.trim() ? value.trim().split(/\s+/).length : 0;

    const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      // "Paste answer" convenience: only hijack when the editor is empty
      if (value) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      onChange(text);
    };

    return (
      <section
        aria-labelledby="answer-heading"
        className="rounded-lg bg-surface-raised shadow-card ring-1 ring-line"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div>
            <h2 id="answer-heading" className="text-sm font-semibold">
              RAG Answer
            </h2>
            <p className="text-xs text-ink-muted">
              The AI-generated answer to verify. Plain text and markdown are
              supported.
            </p>
          </div>
          {chars === 0 && (
            <button
              type="button"
              disabled={disabled}
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) onChange(text);
                } catch {
                  // Clipboard permission denied — user can paste manually
                }
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium",
                "bg-surface-sunken text-ink-muted ring-1 ring-inset ring-line",
                "hover:text-ink disabled:opacity-50",
              )}
            >
              <ClipboardPaste aria-hidden className="h-3.5 w-3.5" />
              Paste answer
            </button>
          )}
        </div>

        <div className="p-3">
          <textarea
            ref={ref}
            aria-label="RAG-generated answer"
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            placeholder={
              "Paste the RAG-generated answer here…\n\nExample:\nThe European Climate Law sets a binding target to achieve climate neutrality by 2050."
            }
            className={cn(
              "thin-scroll min-h-[200px] w-full resize-y rounded-md border-0 bg-surface-sunken/50 p-3",
              "font-mono text-sm leading-6 text-ink placeholder:text-ink-faint",
              "ring-1 ring-inset ring-line focus:ring-2 focus:ring-accent",
              "disabled:opacity-60",
            )}
          />
          <div className="mt-1.5 flex items-center justify-between text-xs text-ink-muted">
            <span>
              {chars.toLocaleString()} characters · {words.toLocaleString()}{" "}
              words
            </span>
            <span className="text-ink-faint">
              Claim count is reported by the backend during verification
            </span>
          </div>
        </div>
      </section>
    );
  },
);