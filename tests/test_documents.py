"""Tests for document text extraction (rag_facts_check/documents.py)."""

import io

import pytest

from rag_facts_check.documents import (
    MAX_FILE_SIZE_BYTES,
    DocumentExtractionError,
    extract_text,
    normalize_text,
)

# ─── Test document builders (in-memory, no fixture files) ────────────────────


def _make_pdf(pages: list[str]) -> bytes:
    """Build a minimal valid PDF with selectable text (raw Helvetica PDF)."""
    return _raw_pdf(pages)


def _raw_pdf(pages: list[str]) -> bytes:
    """Build a tiny valid PDF by hand (Helvetica text, one content stream)."""

    def esc(s: str) -> str:
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    content_parts = ["BT /F1 12 Tf 50 700 Td"]
    for i, line in enumerate(pages):
        if i > 0:
            content_parts.append("0 -20 Td")
        content_parts.append(f"({esc(line)}) Tj")
    content_parts.append("ET")
    content = "\n".join(content_parts).encode("latin-1")

    objects: list[bytes] = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
    )
    objects.append(
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref_pos = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_pos}\n%%EOF".encode()
    )
    return out.getvalue()


def _make_docx(paragraphs: list[str]) -> bytes:
    """Build a minimal valid DOCX using python-docx."""
    import docx

    document = docx.Document()
    for p in paragraphs:
        document.add_paragraph(p)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


# ─── PDF ─────────────────────────────────────────────────────────────────────


class TestPdfExtraction:
    def test_extracts_selectable_text(self):
        data = _raw_pdf(["Paris is the capital of France."])
        text = extract_text("report.pdf", data, content_type="application/pdf")
        assert "Paris is the capital of France." in text

    def test_multipage_joined(self):
        data = _raw_pdf(["Page one text.", "Page two text."])
        text = extract_text("multi.pdf", data)
        assert "Page one text." in text
        assert "Page two text." in text

    def test_scanned_pdf_rejected_without_ocr_claim(self):
        """A PDF whose pages have no text is rejected with the OCR message."""
        from pypdf import PdfWriter

        writer = PdfWriter()
        writer.add_blank_page(width=612, height=792)
        buf = io.BytesIO()
        writer.write(buf)
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("scan.pdf", buf.getvalue(), content_type="application/pdf")
        assert "does not contain extractable text" in str(exc_info.value)
        assert "OCR is not currently supported" in str(exc_info.value)

    def test_malformed_pdf_rejected(self):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("broken.pdf", b"%PDF-1.4 this is not a real pdf")
        assert "corrupted" in str(exc_info.value).lower()

    def test_not_a_pdf_at_all(self):
        with pytest.raises(DocumentExtractionError):
            extract_text("fake.pdf", b"<html>not a pdf</html>")


# ─── DOCX ────────────────────────────────────────────────────────────────────


class TestDocxExtraction:
    def test_extracts_paragraphs(self):
        data = _make_docx(["First paragraph.", "Second paragraph."])
        text = extract_text("report.docx", data)
        assert "First paragraph." in text
        assert "Second paragraph." in text

    def test_extracts_table_cells(self):
        import docx

        document = docx.Document()
        document.add_paragraph("Intro.")
        table = document.add_table(rows=1, cols=2)
        table.rows[0].cells[0].text = "Cell A"
        table.rows[0].cells[1].text = "Cell B"
        buf = io.BytesIO()
        document.save(buf)
        text = extract_text("table.docx", buf.getvalue())
        assert "Intro." in text
        assert "Cell A" in text
        assert "Cell B" in text

    def test_malformed_docx_rejected(self):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("broken.docx", b"PK\x03\x04 definitely not a zip")
        assert "corrupted" in str(exc_info.value).lower()

    def test_not_a_docx_at_all(self):
        with pytest.raises(DocumentExtractionError):
            extract_text("fake.docx", b"plain text file renamed")


# ─── TXT / MD ────────────────────────────────────────────────────────────────


class TestPlainTextExtraction:
    def test_txt_utf8(self):
        text = extract_text("notes.txt", "Bonjour — ça va.".encode())
        assert "Bonjour — ça va." in text

    def test_txt_latin1_fallback(self):
        text = extract_text("notes.txt", "caf\xe9".encode("latin-1"))
        assert "caf\xe9" in text

    def test_md_treated_as_text(self):
        md = "# Heading\n\nSome **markdown** body.\n"
        text = extract_text("readme.md", md.encode("utf-8"))
        assert "# Heading" in text
        assert "Some **markdown** body." in text


# ─── Guards: extensions, sizes, empties ─────────────────────────────────────


class TestGuards:
    def test_unsupported_extension_rejected(self):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("script.exe", b"MZ fake binary")
        assert "Unsupported file type" in str(exc_info.value)

    def test_no_extension_rejected(self):
        with pytest.raises(DocumentExtractionError):
            extract_text("noext", b"data")

    def test_empty_file_rejected(self):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("empty.txt", b"")
        assert "empty" in str(exc_info.value).lower()

    def test_oversized_file_rejected(self):
        big = b"x" * (MAX_FILE_SIZE_BYTES + 1)
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("big.txt", big)
        assert "too large" in str(exc_info.value)

    def test_document_with_no_text_rejected(self):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text("blank.txt", b"   \n\n   \n")
        assert "No extractable text" in str(exc_info.value)

    def test_extension_is_case_insensitive(self):
        data = _make_docx(["Upper case extension."])
        text = extract_text("REPORT.DOCX", data)
        assert "Upper case extension." in text

    def test_wrong_mime_rejected(self):
        with pytest.raises(DocumentExtractionError):
            extract_text("doc.pdf", b"data", content_type="image/png")

    def test_octet_stream_accepted_for_txt(self):
        text = extract_text("doc.txt", b"hello", content_type="application/octet-stream")
        assert text == "hello"


# ─── Normalization ───────────────────────────────────────────────────────────


class TestNormalization:
    def test_strips_bom(self):
        assert normalize_text("\ufeffHello") == "Hello"

    def test_collapses_blank_line_runs(self):
        # 4 blank lines collapse to 2
        assert normalize_text("a\n\n\n\n\nb") == "a\n\n\nb"
        # Single blank lines are preserved as-is
        assert normalize_text("a\n\nb") == "a\n\nb"

    def test_strips_trailing_whitespace_per_line(self):
        assert normalize_text("a   \nb\t\n") == "a\nb"

    def test_extract_output_is_normalized(self):
        data = _make_docx(["Line with trailing spaces.   "])
        text = extract_text("t.docx", data)
        assert text == "Line with trailing spaces."


# ─── Security invariants ────────────────────────────────────────────────────


class TestErrorMessagesAreSafe:
    """Error messages must never leak paths or document contents."""

    @pytest.mark.parametrize(
        ("filename", "data"),
        [
            ("C:/Users/secret/evil.exe", b"MZ binary payload SECRETDATA"),
            ("/etc/passwd", b"root:x:0:0"),
            ("broken.pdf", b"%PDF-1.4 garbage SECRET-DOC-CONTENT"),
        ],
    )
    def test_no_path_or_content_leak(self, filename, data):
        with pytest.raises(DocumentExtractionError) as exc_info:
            extract_text(filename, data)
        message = str(exc_info.value)
        assert "SECRET" not in message
        assert "/etc/passwd" not in message
        assert "Users" not in message
