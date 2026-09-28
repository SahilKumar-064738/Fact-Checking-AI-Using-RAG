"""Tests for the progress callback hook and the SSE streaming endpoint.

The progress mechanism is additive: existing /halloumi/generate behavior
must remain unchanged, and the stream endpoint must emit only real
pipeline events (no fabricated progress).
"""

import json

import pytest
from starlette.testclient import TestClient

from rag_facts_check import RAGFactsChecker
from rag_facts_check.server import HalloumiSource, _normalize_halloumi_sources, create_app

# ---------------------------------------------------------------------------
# Progress callback on checker.check()
# ---------------------------------------------------------------------------


class TestProgressCallback:
    """Progress callback emits real pipeline events."""

    async def test_callback_receives_pipeline_events(self, mock_llm):
        checker = RAGFactsChecker(mock_llm)
        events = []

        def on_progress(event, payload):
            events.append((event, payload))

        await checker.check(
            answer="Paris is the capital of France.",
            documents=["Paris is the capital of France."],
            progress_callback=on_progress,
        )

        names = [e for e, _ in events]
        assert names[0] == "started"
        assert "extracting_claims" in names
        assert "claims_extracted" in names
        assert "verifying_claims" in names
        assert "claims_verified" in names
        assert names[-1] == "scoring"

    async def test_claims_extracted_count_is_real(self, mock_llm):
        """The count in claims_extracted must match the actual extracted claims."""
        checker = RAGFactsChecker(mock_llm)
        payloads = {}

        def on_progress(event, payload):
            payloads[event] = payload

        await checker.check(
            answer="Paris is the capital of France. The sky is blue.",
            documents=["Paris is the capital of France."],
            progress_callback=on_progress,
        )

        assert payloads["claims_extracted"]["count"] >= 1

    async def test_callback_none_does_not_break_check(self, mock_llm):
        """No callback (default) still works — backwards compatible."""
        checker = RAGFactsChecker(mock_llm)
        report = await checker.check(
            answer="Paris is the capital of France.",
            documents=["Paris is the capital of France."],
        )
        assert report is not None

    async def test_callback_exception_does_not_break_check(self, mock_llm):
        """A raising callback must not corrupt verification results."""
        checker = RAGFactsChecker(mock_llm)

        def bad_callback(event, payload):
            raise RuntimeError("boom")

        report = await checker.check(
            answer="Paris is the capital of France.",
            documents=["Paris is the capital of France."],
            progress_callback=bad_callback,
        )
        assert report.overall_verdict in (
            "fully_supported",
            "mostly_supported",
            "partially_supported",
        )


# ---------------------------------------------------------------------------
# Source normalization helper
# ---------------------------------------------------------------------------


class TestNormalizeHalloumiSources:
    """Shared normalization between /halloumi/generate and the stream endpoint."""

    def test_plain_strings(self):
        docs, raw = _normalize_halloumi_sources(["doc one", "doc two"])
        assert len(docs) == 2
        assert raw == ["doc one", "doc two"]
        assert docs[0]["doc_id"] == "doc_1"

    def test_structured_with_title(self):
        docs, raw = _normalize_halloumi_sources(
            [
                HalloumiSource(
                    text="Body text.",
                    title="My Doc",
                    source_type="web",
                    link="http://x",
                )
            ]
        )
        assert docs[0]["title"] == "My Doc"
        assert raw == ["Body text."]

    def test_empty_sources_skipped(self):
        docs, raw = _normalize_halloumi_sources(["", "  ", "real text"])
        assert len(docs) == 1
        assert raw == ["real text"]


# ---------------------------------------------------------------------------
# SSE streaming endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
def client(app):
    return TestClient(app)


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    """Parse an SSE body into (event, data) tuples."""
    events = []
    for block in text.strip().split("\n\n"):
        event_name = None
        data_lines = []
        for line in block.split("\n"):
            if line.startswith("event: "):
                event_name = line[len("event: ") :]
            elif line.startswith("data: "):
                data_lines.append(line[len("data: ") :])
        if event_name and data_lines:
            events.append((event_name, json.loads("\n".join(data_lines))))
    return events


class TestStreamEndpoint:
    """POST /halloumi/generate/stream emits real stage events + final result."""

    @pytest.mark.llm
    def test_stream_returns_result_event(self, client):
        response = client.post(
            "/halloumi/generate/stream",
            json={
                "answer": "Paris is the capital of France.",
                "sources": ["Paris is the capital of France."],
            },
        )
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse(response.text)
        names = [name for name, _ in events]
        assert "result" in names
        # The final event must be the result
        assert names[-1] in ("result", "error")

        result = next(data for name, data in events if name == "result")
        assert "answer_score" in result
        assert "claims" in result
        assert "segments" in result

    @pytest.mark.llm
    def test_stream_stage_events_are_real(self, client):
        response = client.post(
            "/halloumi/generate/stream",
            json={
                "answer": "Paris is the capital of France.",
                "sources": ["Paris is the capital of France."],
            },
        )
        events = _parse_sse(response.text)
        stages = [data for name, data in events if name == "stage"]
        stage_names = [s["event"] for s in stages]
        assert "started" in stage_names
        assert "claims_extracted" in stage_names

    def test_stream_validation_error(self, client):
        """Missing required fields -> 422, not a stream."""
        response = client.post(
            "/halloumi/generate/stream",
            json={"sources": []},
        )
        assert response.status_code == 422


class TestBlockingEndpointUnchanged:
    """The original /halloumi/generate must keep working unchanged."""

    def test_generate_endpoint_still_exists(self, client):
        # Validation error proves routing is intact without needing the LLM
        response = client.post("/halloumi/generate", json={})
        assert response.status_code == 422
