"""Live smoke test for POST /sources/extract and GET /health.

Run against a local server (default http://localhost:8000)::

    python scripts/smoke_sources_extract.py [base_url]

Checks every supported format end-to-end, the security rejections,
and that /health reports the model without leaking secrets.
"""

import io
import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"


def post_files(path: str, filename: str, data: bytes):
    boundary = "----smoke"
    body = (
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )
    req = urllib.request.Request(
        BASE + path,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def get(path: str):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def make_pdf(text: str) -> bytes:
    """Tiny valid PDF with one Helvetica text line."""

    def esc(s: str) -> str:
        return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")

    content = f"BT /F1 12 Tf 50 700 Td ({esc(text)}) Tj ET".encode("latin-1")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = io.BytesIO()
    out.write(b"%PDF-1.4\n")
    offsets = []
    for i, obj in enumerate(objects, start=1):
        offsets.append(out.tell())
        out.write(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = out.tell()
    out.write(f"xref\n0 {len(objects) + 1}\n".encode())
    out.write(b"0000000000 65535 f \n")
    for off in offsets:
        out.write(f"{off:010d} 00000 n \n".encode())
    out.write(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return out.getvalue()


def make_docx(paragraph: str) -> bytes:
    import docx

    document = docx.Document()
    document.add_paragraph(paragraph)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


failures = 0


def check(name: str, cond: bool, extra: str = "") -> None:
    global failures
    status = "PASS" if cond else "FAIL"
    if not cond:
        failures += 1
    print(f"[{status}] {name}{(' — ' + extra) if extra else ''}")


# --- Health -----------------------------------------------------------------
status, health = get("/health")
check("health 200", status == 200)
check("health reports model", bool(health.get("model")), str(health.get("model")))
check("health has no api key", "api_key" not in json.dumps(health).lower())

# --- Extraction: supported formats -----------------------------------------
status, data = post_files("/sources/extract", "notes.txt", b"Paris is the capital of France.")
check("TXT extract", status == 200 and "Paris is the capital" in data.get("text", ""))

status, data = post_files("/sources/extract", "readme.md", b"# Title\n\nBody text.")
check("MD extract", status == 200 and "# Title" in data.get("text", ""), f"{status}")

status, data = post_files("/sources/extract", "report.docx", make_docx("DOCX smoke paragraph."))
check(
    "DOCX extract", status == 200 and "DOCX smoke paragraph." in data.get("text", ""), f"{status}"
)

status, data = post_files("/sources/extract", "report.pdf", make_pdf("PDF smoke sentence."))
check("PDF extract", status == 200 and "PDF smoke sentence." in data.get("text", ""), f"{status}")

# --- Extraction: rejections -------------------------------------------------
status, data = post_files("/sources/extract", "evil.exe", b"MZ fake binary")
check("EXE rejected (422)", status == 422, str(data.get("detail")))

status, data = post_files("/sources/extract", "empty.txt", b"")
check("empty rejected", status in (400, 422, 413))

status, data = post_files("/sources/extract", "scan.pdf", b"%PDF-1.4\n%%EOF")
check("malformed PDF rejected (422)", status == 422, str(data.get("detail")))

status, data = post_files("/sources/extract", "blank.txt", b"   \n\n  ")
check("no-text document rejected (422)", status == 422)
print()
if failures:
    print(f"{failures} smoke check(s) FAILED")
    sys.exit(1)
print("All smoke checks passed.")
