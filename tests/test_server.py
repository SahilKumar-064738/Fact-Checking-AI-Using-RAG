"""Tests for the FastAPI web service."""

import io

import pytest
from starlette.testclient import TestClient

from rag_facts_check.documents import MAX_FILE_SIZE_BYTES
from rag_facts_check.server import create_app


@pytest.fixture
def app():
    """Create a fresh FastAPI app for each test."""
    return create_app()


@pytest.fixture
def client(app):
    """Sync test client (uses threadpool for async endpoints)."""
    return TestClient(app)


class TestHealth:
    """Tests for the /health endpoint."""

    def test_health_ok(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    def test_health_includes_model(self, client):
        """The UI displays the configured model from /health."""
        response = client.get("/health")
        data = response.json()
        assert "model" in data
        assert isinstance(data["model"], str)
        assert data["model"]  # non-empty

    def test_health_never_leaks_secrets(self, client):
        """/health must never expose the API key or other secrets."""
        from rag_facts_check.server import _load_env

        env = _load_env()
        response = client.get("/health")
        data = response.json()
        body = response.text
        api_key = env.get("LLM_API_KEY", "")
        if api_key:
            assert api_key not in body
        assert "LLM_API_KEY" not in body
        assert "api_key" not in body.lower()
        # Only the whitelisted keys are present
        assert set(data.keys()) <= {"status", "version", "model"}

    def test_health_model_reflects_environment(self, client, monkeypatch):
        """The model field comes from LLM_MODEL, never hardcoded."""
        monkeypatch.setenv("LLM_MODEL", "test-model-from-env")
        monkeypatch.setattr("os.path.exists", lambda p: False)  # skip .env load
        app = create_app()
        client2 = TestClient(app)
        data = client2.get("/health").json()
        assert data["model"] == "test-model-from-env"

    def test_health_head_returns_200(self, client):
        """UptimeRobot Free sends HEAD — it must get 200, not 405."""
        response = client.head("/health")
        assert response.status_code == 200


def _docx_bytes(paragraphs: list[str]) -> bytes:
    import docx

    document = docx.Document()
    for p in paragraphs:
        document.add_paragraph(p)
    buf = io.BytesIO()
    document.save(buf)
    return buf.getvalue()


class TestSourcesExtractEndpoint:
    """Tests for POST /sources/extract (document upload)."""

    def _upload(self, client, filename: str, data: bytes):
        return client.post(
            "/sources/extract",
            files={"file": (filename, data)},
        )

    def test_txt_upload(self, client):
        response = self._upload(client, "notes.txt", b"Hello source text.")
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "notes.txt"
        assert "Hello source text." in data["text"]
        assert data["chars"] == len(data["text"]) > 0

    def test_md_upload(self, client):
        response = self._upload(client, "readme.md", b"# Title\n\nBody text.\n")
        assert response.status_code == 200
        data = response.json()
        assert "# Title" in data["text"]

    def test_docx_upload(self, client):
        data = _docx_bytes(["DOCX body paragraph."])
        response = self._upload(client, "report.docx", data)
        assert response.status_code == 200
        payload = response.json()
        assert "DOCX body paragraph." in payload["text"]

    def test_pdf_upload(self, client):
        from test_documents import _raw_pdf

        data = _raw_pdf(["PDF extracted sentence."])
        response = self._upload(client, "report.pdf", data)
        assert response.status_code == 200
        payload = response.json()
        assert "PDF extracted sentence." in payload["text"]

    def test_unsupported_extension_rejected(self, client):
        response = self._upload(client, "evil.exe", b"MZ binary")
        assert response.status_code == 422
        assert "Unsupported file type" in response.json()["detail"]

    def test_oversized_file_rejected_413(self, client):
        response = self._upload(client, "big.txt", b"x" * (MAX_FILE_SIZE_BYTES + 1))
        assert response.status_code == 413
        assert "too large" in response.json()["detail"]

    def test_empty_file_rejected(self, client):
        response = self._upload(client, "empty.txt", b"")
        assert response.status_code == 422

    def test_no_text_document_rejected(self, client):
        response = self._upload(client, "blank.txt", b"   \n\n  ")
        assert response.status_code == 422
        assert "extractable text" in response.json()["detail"]

    def test_malformed_pdf_rejected(self, client):
        response = self._upload(client, "broken.pdf", b"%PDF-1.4 garbage")
        assert response.status_code == 422
        assert "corrupted" in response.json()["detail"].lower()

    def test_malformed_docx_rejected(self, client):
        response = self._upload(client, "broken.docx", b"PK fake zip")
        assert response.status_code == 422

    def test_no_filesystem_path_leak(self, client):
        """Errors and success responses never expose server paths."""
        response = self._upload(client, "evil.exe", b"MZ")
        body = response.text
        assert "/tmp" not in body
        assert "C:\\" not in body
        assert "rag_facts_check" not in body

    def test_no_missing_file_422(self, client):
        response = client.post("/sources/extract")
        assert response.status_code == 422


class TestCheckRequestValidation:
    """Tests for request validation on /check."""

    def test_missing_answer(self, client):
        response = client.post(
            "/check",
            json={"documents": [{"doc_id": "d1", "text": "Some doc"}]},
        )
        assert response.status_code == 422

    def test_missing_documents(self, client):
        response = client.post(
            "/check",
            json={"answer": "Paris is the capital of France."},
        )
        assert response.status_code == 422

    def test_document_missing_doc_id(self, client):
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [{"text": "Some doc"}],
            },
        )
        assert response.status_code == 422

    def test_document_missing_text(self, client):
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [{"doc_id": "d1"}],
            },
        )
        assert response.status_code == 422


class TestCheckEndpoint:
    """Tests for the /check endpoint with live LLM.

    These tests require a running LLM server.  Skip with: pytest -m "not llm"
    """

    @pytest.mark.llm
    def test_check_returns_report(self, client):
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [
                    {
                        "doc_id": "doc_1",
                        "text": "Paris is the capital of France.",
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "overall_verdict" in data
        assert "overall_confidence" in data
        assert "claims" in data
        assert "results" in data
        assert "dimensions" in data

    @pytest.mark.llm
    def test_check_with_multiple_documents(self, client):
        response = client.post(
            "/check",
            json={
                "answer": ("Paris is the capital of France. The Eiffel Tower was built in 1889."),
                "documents": [
                    {
                        "doc_id": "doc_1",
                        "text": "Paris is the capital of France.",
                    },
                    {
                        "doc_id": "doc_2",
                        "text": "The Eiffel Tower was built in 1889.",
                    },
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["claims"]) >= 1

    @pytest.mark.llm
    def test_check_doc_id_flows_through(self, client):
        """Verify that user-provided doc_id appears in results."""
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [
                    {
                        "doc_id": "my-custom-doc-id",
                        "text": "Paris is the capital of France.",
                    }
                ],
            },
        )
        assert response.status_code == 200
        data = response.json()
        # When evidence retrieval is used, doc_id should appear in results
        if data.get("results"):
            doc_ids = [r.get("document_id") for r in data["results"] if r.get("document_id")]
            assert "my-custom-doc-id" in doc_ids

    @pytest.mark.llm
    def test_check_with_options(self, client):
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [
                    {
                        "doc_id": "doc_1",
                        "text": "Paris is the capital of France.",
                    }
                ],
                "options": {
                    "num_consistency_runs": 1,
                    "evidence_first": True,
                    "use_evidence_retrieval": True,
                },
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "overall_verdict" in data


class TestModelsEndpoint:
    """Tests for GET /models (public catalog)."""

    def test_models_endpoint_returns_catalog(self, client):
        response = client.get("/models")
        assert response.status_code == 200
        data = response.json()
        assert "models" in data
        assert len(data["models"]) == 54

    def test_models_contain_required_metadata(self, client):
        data = client.get("/models").json()
        for m in data["models"]:
            assert m["id"]
            assert m["provider"]
            assert m["name"]
            assert m["description"]
            assert isinstance(m["capabilities"], list)
            assert "free" in m

    def test_default_model_is_marked(self, client):
        data = client.get("/models").json()
        defaults = [m for m in data["models"] if m.get("default")]
        assert len(defaults) == 1
        assert defaults[0]["id"] == "qwen/qwen3.8-omni-flash:free"

    def test_models_never_leak_secrets(self, client):
        body = client.get("/models").text
        assert "sk-" not in body
        assert "LLM_API_KEY" not in body


class TestModelSelectionValidation:
    """The backend must reject arbitrary client-supplied model ids."""

    def test_halloumi_rejects_unknown_model_with_422(self, client):
        response = client.post(
            "/halloumi/generate",
            json={
                "answer": "Paris is the capital of France.",
                "sources": ["Paris is the capital of France."],
                "model": "evil/unauthorized-model",
            },
        )
        assert response.status_code == 422
        assert "not available" in response.json()["detail"]

    def test_halloumi_rejects_image_gen_model(self, client):
        response = client.post(
            "/halloumi/generate",
            json={
                "answer": "Paris is the capital of France.",
                "sources": ["Paris is the capital of France."],
                "model": "sensenova/sensenova-u1.5-lite",
            },
        )
        assert response.status_code == 422

    def test_check_rejects_unknown_model_with_422(self, client):
        response = client.post(
            "/check",
            json={
                "answer": "Paris is the capital of France.",
                "documents": [{"doc_id": "d1", "text": "Paris is the capital of France."}],
                "model": "evil/unauthorized-model",
            },
        )
        assert response.status_code == 422

    def test_stream_rejects_unknown_model_with_422(self, client):
        response = client.post(
            "/halloumi/generate/stream",
            json={
                "answer": "Paris is the capital of France.",
                "sources": ["Paris is the capital of France."],
                "model": "evil/unauthorized-model",
            },
        )
        assert response.status_code == 422
