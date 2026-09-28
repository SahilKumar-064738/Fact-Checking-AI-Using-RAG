import type { SourceDoc } from "./types";

/** Human label for a source's type; uploaded documents show their file kind (PDF, DOCX…). */
export function sourceTypeLabel(
  source: Pick<SourceDoc, "sourceType" | "fileKind">,
): string {
  if (source.sourceType === "file") {
    return source.fileKind || "Document";
  }
  switch (source.sourceType) {
    case "text":
      return "Pasted text";
    case "web":
      return "Web";
    default:
      return "Other";
  }
}

/** Hostname of a source URL, or null when absent/invalid. Never throws. */
export function sourceDomain(url: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
