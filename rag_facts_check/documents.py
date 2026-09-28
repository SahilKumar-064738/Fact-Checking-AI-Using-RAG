"""Document text extraction for uploaded source files.

Extracts readable text from uploaded documents entirely in memory —
files are never written to disk, executed, or stored. The extracted
text is normalized and fed into the existing verification pipeline
exactly like pasted text, so the verifier never knows (or cares) how
a source was provided.

Supported formats:
- PDF  (.pdf)  — selectable text via pypdf; scanned/image-only PDFs
  are rejected with a clear "no extractable text" error (no OCR).
- DOCX (.docx) — paragraph + table text via python-docx.
- TXT  (.txt)  — UTF-8 decoding (latin-1 fallback).
- MD   (.md)   — UTF-8 decoding (treated as plain text).

Security constraints enforced here:
- Allow-listed extensions only.
- Hard maximum file size.
- Empty files and documents without extractable text are rejected.
- Nothing is executed; parsers only read declarative structures.
- Error messages never include filesystem paths or document contents.
"""

import io
import logging
import os

log = logging.getLogger("rag_facts_check.documents")

# Maximum upload size: 10 MB
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

# Extension -> normalized kind. Case-insensitive.
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".txt": "txt",
    ".md": "md",
}

# Content-type sanity checks (best-effort; extension is authoritative).
EXPECTED_CONTENT_TYPES: dict[str, set[str]] = {
    "pdf": {"application/pdf", "application/x-pdf"},
    "docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
    "txt": {"text/plain", "application/octet-stream"},
    "md": {"text/markdown", "text/plain", "text/x-markdown", "application/octet-stream"},
}


class DocumentExtractionError(Exception):
    """Raised when a document cannot be turned into source text.

    The message is safe to show to the user: it never contains
    filesystem paths, document contents, or stack details.
    """


def _kind_for_filename(filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    kind = ALLOWED_EXTENSIONS.get(ext)
    if kind is None:
        raise DocumentExtractionError("Unsupported file type. Allowed formats: PDF, DOCX, TXT, MD.")
    return kind


def extract_text(filename: str, data: bytes, content_type: str | None = None) -> str:
    """Extract normalized source text from an in-memory upload.

    Args:
        filename: Original file name (used for extension detection only).
        data: Raw file bytes (already size-capped by the caller).
        content_type: Reported MIME type, used as a soft sanity check.

    Returns:
        Extracted text, stripped and normalized.

    Raises:
        DocumentExtractionError with a user-safe message on any failure.
    """
    kind = _kind_for_filename(filename)

    if not data:
        raise DocumentExtractionError("The file is empty.")
    if len(data) > MAX_FILE_SIZE_BYTES:
        raise DocumentExtractionError(
            f"The file is too large (max {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB)."
        )

    # Soft MIME check: only reject on a clearly wrong, specific type.
    if (
        content_type
        and content_type not in EXPECTED_CONTENT_TYPES[kind]
        and not content_type.startswith("application/octet-stream")
    ):
        raise DocumentExtractionError("The file's content type does not match its extension.")

    if kind == "pdf":
        text = _extract_pdf(data)
    elif kind == "docx":
        text = _extract_docx(data)
    else:  # txt, md
        text = _extract_plain_text(data)

    text = normalize_text(text)
    if not text:
        if kind == "pdf":
            raise DocumentExtractionError(
                "This PDF does not contain extractable text. OCR is not currently supported."
            )
        raise DocumentExtractionError("No extractable text was found in the document.")
    return text


def normalize_text(text: str) -> str:
    """Normalize extracted text: strip BOM, collapse blank-line runs."""
    text = text.lstrip("﻿")
    lines = [line.rstrip() for line in text.splitlines()]
    # Collapse 3+ consecutive blank lines into 2
    out: list[str] = []
    blank_run = 0
    for line in lines:
        if line.strip():
            blank_run = 0
            out.append(line)
        else:
            blank_run += 1
            if blank_run <= 2:
                out.append(line)
    return "\n".join(out).strip()


def _extract_pdf(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as e:
        raise DocumentExtractionError(
            "PDF support is not installed on the server (pypdf missing)."
        ) from e

    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception as e:
        raise DocumentExtractionError("The PDF could not be read — it may be corrupted.") from e

    try:
        pages = [page.extract_text() or "" for page in reader.pages]
    except Exception as e:
        raise DocumentExtractionError("The PDF could not be parsed.") from e
    return "\n\n".join(pages)


def _extract_docx(data: bytes) -> str:
    try:
        import docx
    except ImportError as e:
        raise DocumentExtractionError(
            "DOCX support is not installed on the server (python-docx missing)."
        ) from e

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as e:
        raise DocumentExtractionError(
            "The DOCX file could not be read — it may be corrupted."
        ) from e

    parts: list[str] = [p.text for p in document.paragraphs]
    # Include table cell text so tables aren't silently dropped.
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            parts.append(" | ".join(c for c in cells if c))
    return "\n".join(parts)


def _extract_plain_text(data: bytes) -> str:
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return data.decode("latin-1")
        except UnicodeDecodeError as e:
            raise DocumentExtractionError("The text file could not be decoded as UTF-8.") from e
