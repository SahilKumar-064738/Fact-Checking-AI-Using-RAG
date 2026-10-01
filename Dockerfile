FROM python:3.14-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# ---------------------------------------------------------------------------
# test — lint + full test suite. Not the default build target (the runtime
# stage below is last), so `docker build .` is unaffected. CI builds this
# with `--target test`.
# ---------------------------------------------------------------------------
FROM base AS test

# Source + tests first, then a single editable install. (setuptools'
# package discovery needs rag_facts_check/ present at install time.)
COPY pyproject.toml ./
COPY rag_facts_check/ ./rag_facts_check/
COPY prompts/ ./prompts/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
COPY mock_datasets/ ./mock_datasets/
RUN pip install -e ".[test,dev,server]"

# llm-marked tests are excluded via pyproject addopts.
CMD ["sh", "-c", "ruff check rag_facts_check/ tests/ scripts/; ruff format --check rag_facts_check/ tests/ scripts/; pytest --junitxml=/app/junit.xml"]

# ---------------------------------------------------------------------------
# runtime — minimal production image (default build target).
# ---------------------------------------------------------------------------
FROM base AS runtime

# Install the package with all runtime dependencies (non-editable, so the
# image is self-contained). setuptools package discovery requires
# rag_facts_check/ to be present at install time.
COPY pyproject.toml ./
COPY rag_facts_check/ ./rag_facts_check/
# prompts.py loads these at import time (Path(__file__).parent.parent / "prompts").
COPY prompts/ ./prompts/
RUN pip install ".[server]"

# Run as non-root user
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

# Render injects $PORT (typically 10000); the runtime command below uses it
# with a 10000 fallback, so EXPOSE documents that default only.
EXPOSE 10000

# Shell-form CMD: $PORT is expanded when the container starts, so the same
# image works on Render (PORT injected) and locally (falls back to 10000).
# One worker by default — Render's small instances (~0.1 CPU / 512 MB) cannot
# sustain multiple forked uvicorn workers; override with WEB_CONCURRENCY if needed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '10000') + '/health')" || exit 1

CMD ["/bin/sh", "-c", "uvicorn rag_facts_check.server:app --host 0.0.0.0 --port ${PORT:-10000} --workers ${WEB_CONCURRENCY:-1}"]
