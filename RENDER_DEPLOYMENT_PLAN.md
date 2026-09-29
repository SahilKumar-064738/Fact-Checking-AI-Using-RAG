# RAG Facts Check — Render Deployment Plan

**Date:** 2026-09-29
**Repository:** `github.com/SahilKumar-064738/Fact-Checking-AI-Using-RAG.git` (local: `C:/Users/Sanjay/Desktop/Sk/rag-facts-check`)
**Status:** Deployment plan — no application code was modified.

This plan replaces the existing GCP Compute Engine + Vercel + Caddy deployment guide
(`DEPLOYMENT_GUIDE.md`) with a Render-native deployment. Every repository claim below was
verified against the actual code on 2026-09-29. Every Render platform fact that could not be
confirmed from official documentation in this session is explicitly marked.

Legend:

- **VERIFIED FROM CODE** — confirmed by reading the repository.
- **RENDER-SPECIFIC RECOMMENDATION** — a deployment choice for Render, not derived from the repo.
- **NEEDS VERIFICATION** — cannot be established from the repository (or, for platform facts,
  could not be confirmed from Render's docs during this session); check before relying on it.
- **OPTIONAL IMPROVEMENT** — non-blocking, not required to deploy.

---

## 1. What was inspected

| Area | Files |
|---|---|
| Backend | `rag_facts_check/server.py`, `llm.py`, `checker.py` (progress callbacks), `documents.py` (upload limits), `prompts.py` (prompt loading), `models.py`, `spans.py`, `retriever.py`, `agents.py` (present in package) |
| Packaging | `pyproject.toml`, `Dockerfile`, `.dockerignore`, `.gitignore`, `.env.example` |
| Frontend | `frontend/package.json`, `package-lock.json`, `next.config.mjs`, `frontend/app/*`, `frontend/components/*`, `frontend/hooks/*`, `frontend/lib/*`, `.env.local.example`, `frontend/.gitignore` |
| Docs | `README.md`, `DEPLOYMENT_GUIDE.md` (existing GCP/Vercel guide) |
| Platform | Render docs: web services, static sites, Docker, free plan, Next.js guide |

> Note: the session working directory initially pointed at a different repository (`trace`).
> The RAG Facts Check project lives in `rag-facts-check/` — all paths below are relative to
> that repository root.

---

## 2. Actual architecture (verified)

### 2.1 Request flow

**VERIFIED FROM CODE:** the browser talks to the FastAPI backend **directly**. Next.js does
not proxy API traffic — there are no Next.js API routes or rewrites
(`frontend/next.config.mjs` contains only `reactStrictMode: true`).

```
Browser (Next.js UI, client-side fetch)
   │  GET  /health                      (polled every 30 s by the UI)
   │  POST /halloumi/generate/stream    (SSE, fetch + ReadableStream)
   │  POST /halloumi/generate           (blocking fallback)
   │  POST /sources/extract             (multipart upload, in-memory)
   ▼
FastAPI backend (rag_facts_check.server:app)
   │  OpenAI-compatible chat completions
   ▼
LLM API (LLM_API_BASE + "/chat/completions")   ← XKiro gateway in the existing deployment
```

Key evidence:

- `frontend/lib/api.ts:29-32` — base URL is `process.env.NEXT_PUBLIC_API_BASE_URL`
  (default `http://localhost:8000`); all calls are plain cross-origin `fetch()` from the
  browser.
- `frontend/lib/api.ts:171-175` — SSE is consumed via `fetch()` + `ReadableStream`
  (not `EventSource`, because the request is a POST).
- `rag_facts_check/server.py:122-143` — CORS middleware reads `CORS_ORIGINS` (default `*`),
  `allow_credentials=True`.
- `rag_facts_check/server.py:168` — the LLM URL is built as
  `LLM_API_BASE.rstrip("/") + "/chat/completions"`.

### 2.2 Backend endpoints

**VERIFIED FROM CODE** (`server.py`):

| Endpoint | Method | Purpose |
|---|---|---|
| `/health` | GET | Returns `{status, version, model}`. No secrets. |
| `/sources/extract` | POST (multipart) | PDF/DOCX/TXT/MD text extraction, **entirely in memory**, 10 MB limit (`documents.py:31` `MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024`) |
| `/halloumi/generate` | POST | Blocking verification → halloumi-format JSON |
| `/halloumi/generate/stream` | POST | SSE streaming verification (see §4) |
| `/check` | POST | Native request/response format |

### 2.3 Dependencies and state

**VERIFIED FROM CODE:**

- No database, no Redis, no queues, no background workers, no WebSockets in this project
  (WebSockets exist in the *other* repo, not this one).
- No filesystem writes anywhere in `rag_facts_check/*.py` — grep for
  `open(/write_text/write_bytes/tempfile/os.makedirs` returned nothing outside reads.
- `prompts.py:20` loads prompt templates at import time from
  `Path(__file__).parent.parent / "prompts"` — the `prompts/` directory **must be present
  relative to the installed package** at runtime. This is why the Dockerfile uses an
  *editable* install and explicitly `COPY prompts/`.
- Python: `pyproject.toml` `requires-python = ">=3.10"`. Server extras: fastapi, uvicorn,
  httpx, python-multipart, python-dotenv, atomic-agents, instructor, openai, pypdf,
  python-docx.
- Frontend: Next.js `14.2.15` (App Router, all UI components are `"use client"`), React 18,
  TypeScript. No `output` setting in `next.config.mjs` → default (server) output.

### 2.4 Timeouts and retries (verified)

| Layer | Value | Source |
|---|---|---|
| Per-LLM-call HTTP timeout | `LLM_TIMEOUT` (default **120 s**) | `server.py:161`, `llm.py:294,308` |
| LLM retries | **3** retries with 2 s backoff on transport/null-content errors | `llm.py:296,343-357` |
| Backend request timeout | **none** — uvicorn does not impose one | uvicorn behavior |
| Frontend `/health` timeout | 5 s | `api.ts:34-41` |
| Frontend verification timeout | **none** (no `AbortSignal` on verification calls) | `api.ts:56-79,165-216` |

---

## 3. Render compatibility assessment

### 3.1 Backend — can it run as a Render Web Service?

**Yes.** It is a stateless HTTP service with no privileged requirements, no system packages
beyond what the `python:3.14-slim` Docker image provides, and no GPU requirement
(all inference happens on the remote LLM API).

| Concern | Finding |
|---|---|
| Port handling | **RENDER-SPECIFIC RECOMMENDATION.** Render injects `$PORT` (default **10000**, verified from Render docs) and routes public traffic to it. The Dockerfile CMD hardcodes `--port 8000`. Two safe resolutions are given in §7.3 — do **not** assume `--port 8000` works unmodified. |
| Health check | `GET /health` exists and is secret-free (**VERIFIED FROM CODE**). Set Render's health check path to `/health`. |
| Workers | Dockerfile CMD uses `--workers 4`. See §12 for the RAM implication and recommended worker count on Render instance sizes. |
| Docker necessary? | No, but **preferable** — see §8. The editable install + `prompts/` layout makes the Docker path the one already proven by the repo. |
| Code changes required? | **None.** Everything needed (env-driven config, `/health`, CORS env var) already exists. |

### 3.2 Frontend — Web Service vs Static Site

**VERIFIED FROM CODE:** `next.config.mjs` has no `output: "export"` and the app uses the
App Router with a server `layout.tsx` metadata export. All interactivity is client-side,
but the build as configured is a standard Next.js server build.

**RENDER-SPECIFIC RECOMMENDATION:** deploy the frontend as a **Render Web Service (Node)**:

- Render Static Sites require a static export (`out/` directory). Achieving that would
  require changing `next.config.mjs` to `output: "export"` — a code change, which this plan
  deliberately avoids.
- The frontend has no SSR data-fetching needs and no API routes, so a Web Service is
  slightly over-provisioned for what it does, but it is the zero-code-change path and is
  free-tier-eligible on Render.
- Because `NEXT_PUBLIC_API_BASE_URL` is inlined **at build time** by Next.js, it must be set
  as an environment variable *before the build runs* and its value must be the backend's
  **public** URL (the browser calls the backend directly).

---

## 4. SSE analysis (first-class concern)

### 4.1 Implementation (verified)

**VERIFIED FROM CODE** (`server.py:325-382`, `checker.py:1041-1168`, `frontend/lib/api.ts:158-290`):

- Backend returns `StreamingResponse(event_stream(), media_type="text/event-stream")` with
  headers `Cache-Control: no-cache` and `X-Accel-Buffering: no`.
- Event wire format: `event: <stage|result|error>\ndata: <json>\n\n`.
- Stage events are real pipeline transitions only (never fabricated):
  `started → extracting_claims → claims_extracted → verifying_claims → claim_verified (n/N)
  → claims_verified → scoring`, then terminal `result` or `error`.
- **No heartbeat/keep-alive events exist.** The async generator only yields when the
  internal queue receives a pipeline event.
- **Silence windows:** between `verifying_claims` and the per-claim events, a single batch
  LLM call can be silent for up to `LLM_TIMEOUT` (120 s) × retries (3) ≈ **worst case ~6 min**
  of no bytes. During normal operation on a responsive model the gaps are seconds, but the
  worst case is bounded by the retry logic, not by anything smaller.
- Client disconnect: the verification task is cancelled in the `finally` block (`server.py:371-373`).
- Frontend: `fetch` + `ReadableStream`, manual `event:`/`data:` frame parsing, Zod-validated
  stage events. **Fallback behavior:** on a thrown network error or HTTP 404/405 from the
  stream endpoint, it automatically retries against blocking `/halloumi/generate`
  (`api.ts:176-201`). Mid-stream interruption after a successful response surfaces as an error
  ("connection … interrupted") — it does **not** auto-retry in that case.

### 4.2 Render suitability for this SSE implementation

- **Proxy buffering:** Render's edge behavior for SSE could not be confirmed from docs in
  this session — **NEEDS VERIFICATION.** However the app is already defensively written:
  `Cache-Control: no-cache` + `X-Accel-Buffering: no` are set (**VERIFIED FROM CODE**),
  which is the standard mitigation against nginx-style buffering proxies.
- **Idle/quiet-period disconnection:** the real risk is the ~up-to-6-minute silence window
  during a slow batch LLM call. If Render (or any intermediary) enforces an idle timeout
  below that, the stream dies mid-run; the frontend will show an interruption error and the
  user can use "Verify Again" / the blocking fallback. Whether Render does this is
  **NEEDS VERIFICATION** — Render's docs confirm WebSocket (long-lived connection) support,
  but I could not locate a documented SSE/idle-timeout value this session.
  **Check before go-live:** Render docs on web-service request/connection timeouts, or test
  empirically per §15.
- **`Cache-Control` / `X-Accel-Buffering`:** already set by the app; `Cache-Control:
  no-cache` matters on any CDN/proxy path, `X-Accel-Buffering` only matters behind
  nginx-family proxies (Render's edge stack is not documented as nginx — **NEEDS
  VERIFICATION** — so treat this header as harmless insurance).
- **Frontend fallback lowers risk:** if the stream endpoint misbehaves structurally
  (404/405/non-SSE), the UI degrades to the blocking endpoint automatically
  (**VERIFIED FROM CODE**). The blocking endpoint is itself a long-running request, so it is
  exposed to the same total-request-timeout question — same **NEEDS VERIFICATION** item.
- **Free-tier spin-down interaction:** Render free instances spin down after **15 minutes
  without inbound traffic** (verified, Render docs). An active SSE request is traffic, but a
  verification that takes many minutes on a cold, slow model could in principle sit close to
  platform limits — test long verifications on the actual plan you deploy to.

### 4.3 Required post-deploy SSE test

```bash
curl -N -X POST https://<backend-domain>/halloumi/generate/stream \
  -H "Content-Type: application/json" \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'
```

Pass criteria:

1. `event: stage` frames arrive **progressively** (not one burst at the end) → no buffering.
2. Final `event: result` frame arrives with valid JSON.
3. Repeat with a deliberately long answer to observe a multi-minute run and confirm the
   connection survives the quiet periods on your chosen Render plan.

**OPTIONAL IMPROVEMENT (if idle-disconnection is observed):** emit a periodic SSE comment
keep-alive (e.g. `yield ": ping\n\n"` every ~15 s) from `event_stream()`. The frontend
parser already ignores non-`event:` lines, so no frontend change would be needed. This is a
small code change, so it is *not* part of the base deployment plan.

---

## 5. Environment variable mapping

### 5.1 Complete table (only variables the code actually reads)

| Variable | Service | Required | Secret? | Render location | Example | Notes |
|---|---|---|---|---|---|---|
| `LLM_API_BASE` | Backend | Yes | Borderline — see notes | Env var (can be Secret) | `https://<xkiro-gateway>/v1` | **VERIFIED FROM CODE** `server.py:48-60,156,168`. `/chat/completions` is appended automatically. Default `http://localhost:4002/v1` would point at nothing on Render — must be set. |
| `LLM_API_KEY` | Backend | Yes | **Yes** | Env var (secret) | `sk-…` / `not-needed` | **VERIFIED FROM CODE** `server.py:157`, sent only as `Authorization: Bearer` (`llm.py:322`). Never expose to frontend. |
| `LLM_MODEL` | Backend | No (default `gemma`) | No | Env var | model name | **VERIFIED FROM CODE.** Also surfaced publicly by `/health` — acceptable by design. |
| `LLM_TEMPERATURE` | Backend | No (default `0.1`) | No | Env var | `0.1` | **VERIFIED FROM CODE.** |
| `LLM_MAX_TOKENS` | Backend | No (default `512`) | No | Env var | `512` | **VERIFIED FROM CODE.** |
| `LLM_TIMEOUT` | Backend | No (default `120`) | No | Env var | `120` | **VERIFIED FROM CODE.** Bounds worst-case SSE silence together with retries. |
| `LLM_EXTRA_BODY` | Backend | No (default `{}`) | No | Env var | `{}` | **VERIFIED FROM CODE.** Must be valid JSON; invalid JSON is ignored with a warning. |
| `CORS_ORIGINS` | Backend | Recommended | No | Env var | `https://<frontend>.onrender.com,https://app.example.com` | **VERIFIED FROM CODE** `server.py:135-136`. Comma-separated. Default `*`. |
| `PORT` | Backend | Render-managed | No | Do not set manually (native runtime) | `10000` (Render default) | **RENDER-SPECIFIC.** Render injects it. The Dockerfile CMD hardcodes 8000 — see §7.3. |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend | Yes | No (public by design) | Env var, **set before build** | `https://<backend>.onrender.com` | **VERIFIED FROM CODE** `api.ts:30`, `Header.tsx:61`. Inlined into the JS bundle at build time. |

### 5.2 Exposure rules

- **Must NEVER reach the frontend/browser:** `LLM_API_KEY`, `LLM_API_BASE` (internal
  endpoint), and `CORS_ORIGINS`. The frontend only ever needs `NEXT_PUBLIC_API_BASE_URL`.
  The repo's own `.env.local.example` states this explicitly.
- **Safe to expose publicly:** `NEXT_PUBLIC_API_BASE_URL` (it ships in the browser bundle
  regardless), and `LLM_MODEL` (already exposed by `/health` by design).
- **`.env` must never be committed** — `.gitignore` already excludes `.env`, `.env.*`
  (**VERIFIED FROM CODE**). The local `.env` currently on disk is untracked and local-only.
- **Render Secret Files:** not needed. All config is ordinary environment variables; Render
  env vars marked "secret" in the dashboard are masked in the UI/logs, which is sufficient
  for `LLM_API_KEY`. Secret Files would only matter if the app read a credentials *file*,
  which it does not (**VERIFIED FROM CODE** — `_load_env()` reads `os.environ` and an
  optional `.env`; on Render the injected process environment is what matters).
- **Normal Render env vars are sufficient** for every variable in §5.1.

---

## 6. Architecture options

Only architectures that make sense for this repo are included. In all of them the browser
calls the backend directly (that is how the frontend is written — §2.1), so SSE never
transits the frontend host in any option.

### Option A — Render frontend (Web Service) + Render backend (Docker Web Service)

| Dimension | Assessment |
|---|---|
| Simplicity | One platform, one dashboard, one billing account; env vars managed in one place. |
| SSE path | Browser → Render backend direct; unaffected by frontend hosting. |
| Deployment isolation | Two independent Render services; backend deploys don't rebuild frontend and vice versa. |
| CORS | Cross-origin (`<fe>.onrender.com` → `<be>.onrender.com`) — `CORS_ORIGINS` required either way; same as today with Vercel. |
| Env vars | `NEXT_PUBLIC_API_BASE_URL` must be set on the frontend *before* each frontend build. |
| Custom domains | Supported on both services. |
| Cold starts | Backend free tier: ~1 min spin-up after 15 min idle (verified Render docs). Frontend free tier behaves the same. |
| Cost | Free-tier-eligible for both services (see §13). |
| Debugging | Single platform's logs for both halves. |

### Option B — Vercel frontend + Render backend

| Dimension | Assessment |
|---|---|
| Simplicity | Two platforms; keeps the frontend workflow the team already uses (existing guide's Vercel setup carries over unchanged). |
| SSE path | Identical to Option A (browser → backend direct); Vercel never proxies these calls. |
| Deployment isolation | Full isolation — changing one host cannot affect the other. |
| CORS | Same cross-origin requirement; `CORS_ORIGINS` must list the Vercel URL(s). |
| Env vars | `NEXT_PUBLIC_API_BASE_URL` managed in Vercel dashboard; backend env in Render. |
| Cold starts | Only the Render backend can cold-start; Vercel frontend does not spin down. |
| Cost | Vercel hobby/free + Render backend plan. |
| Debugging | Two dashboards, two log systems. |

### Option C — Vercel frontend + Render backend built from the repo Dockerfile

Technically identical to Option B at runtime (Render runs the same Docker image either
way). The only difference is *how* Render builds the backend: from the repo `Dockerfile`
rather than a native Python runtime. Since this plan recommends the Docker build regardless
(§8), "Option C" collapses into Option B and is not a distinct runtime architecture.

### Recommendation (criteria, not score)

The deciding technical criteria for this repo are: (1) zero code changes, (2) parity with
the already-proven Docker image, (3) fewest moving parts for a single-developer project.

- If the goal is **consolidation onto Render** (the stated goal): **Option A** — Render
  frontend Web Service + Render backend Docker Web Service. Nothing in the repo prevents it,
  and it minimizes platforms.
- If the Vercel frontend is already working in production and you only want to move the
  backend off GCP: **Option B** is equally valid — the frontend hosting choice makes no
  difference to the SSE path because the browser bypasses it.

**Recommended: Option A**, with Option B as a drop-in alternative that differs only in where
the (unchanged) frontend is hosted.

---

## 7. Exact Render deployment configuration

### 7.1 Backend (recommended: Docker Web Service)

```text
Service type:    Web Service
Language/Runtime: Docker
Root Directory:  .                        (Dockerfile is at repo root)
Dockerfile Path: Dockerfile               (default)
Build Command:   n/a (Render builds the Dockerfile with BuildKit)
Start Command:   see §7.3 (Docker Command override for $PORT safety)
Health Check Path: /health
Plan:            Starter (paid) for production; Free for evaluation only (see §13)
Environment Variables: see §5.1
```

### 7.2 Backend (alternative: native Python runtime)

```text
Service type:    Web Service
Language/Runtime: Python 3                (specify version — see note)
Root Directory:  .
Build Command:   pip install -e ".[server]"
Start Command:   uvicorn rag_facts_check.server:app --host 0.0.0.0 --port $PORT
Health Check Path: /health
```

Caveats for the native path (**NEEDS VERIFICATION** at deploy time):

- Render's Python runtime picks the version from `runtime.txt` (add one, e.g. `3.12` —
  do not assume 3.14 is available on Render's buildpacks).
- The **editable install is required**, not cosmetic: `prompts.py` resolves prompt files via
  `Path(__file__).parent.parent / "prompts"` (**VERIFIED FROM CODE**), and a non-editable
  install would place the package in `site-packages` where no `prompts/` directory exists.
  `pip install -e ".[server]"` from the repo root keeps `__file__` pointing at the source
  tree where `prompts/` lives. Verify with `/health` + one real verification call after
  first deploy.
- `python-dotenv`'s `.env` lookup (`server.py:39`) resolves to a path that won't exist in
  the container — harmless, since Render injects the variables into the process environment
  and `_load_env()` reads `os.environ` directly (**VERIFIED FROM CODE**).

### 7.3 The `$PORT` problem and its resolution

**VERIFIED FROM CODE:** Dockerfile ends with
`CMD ["uvicorn", "rag_facts_check.server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]`
and `EXPOSE 8000`.
**RENDER-SPECIFIC (verified from Render docs):** Render's default `PORT` is **10000**;
Render forwards public traffic to the service port and "is usually able to detect" the port
an app binds.

Two safe configurations — pick one and verify with `/health`:

1. **Set `PORT=8000` as an env var on the Render service** and keep the Dockerfile CMD as
   is. The app binds 8000, matches `EXPOSE 8000`, matches the injected `PORT`. Smallest
   change; consistent with the built-in `HEALTHCHECK`.
2. **Override the Docker Command** in the Render dashboard so the port is dynamic:

   ```text
   /bin/sh -c "uvicorn rag_facts_check.server:app --host 0.0.0.0 --port ${PORT:-8000} --workers 4"
   ```

   (Render supports overriding the start command for Docker services; env-var expansion
   requires the `sh -c` wrapper.)

Do **not** ship `--port 8000` while leaving Render's default `PORT=10000` in place without
checking which port Render actually routes to — that is exactly the silent misconfiguration
this section exists to prevent.

### 7.4 Frontend (Render Web Service)

```text
Service type:    Web Service
Language/Runtime: Node
Root Directory:  frontend
Build Command:   npm ci && npm run build
Start Command:   npm run start            (next start; reads $PORT from Render)
Health Check Path: /                      (or leave unset — see note)
Environment Variables:
  NEXT_PUBLIC_API_BASE_URL = https://<backend-service>.onrender.com
  NODE_VERSION = 20                       (Next 14 requires Node >= 18.17 — RECOMMENDATION)
```

Notes:

- `next start` honors the `PORT` environment variable, so no port flag is needed
  (**RENDER-SPECIFIC RECOMMENDATION**; Next's port-from-env behavior is standard and
  documented by Next.js).
- `npm ci` (not `npm install`) because `package-lock.json` exists (**VERIFIED FROM CODE**).
- `NEXT_PUBLIC_API_BASE_URL` must exist **before the first build** — Next inlines it at
  build time; changing it later requires a redeploy.
- Health check on `/` costs a full page render; `/` is fine, or skip the health check since
  the frontend has no liveness-critical logic.

### 7.5 render.yaml (OPTIONAL IMPROVEMENT)

A `render.yaml` blueprint can codify both services, their env vars, and health checks for
infrastructure-as-code. Not required for a first deploy; skip it until the manual deploy is
proven.

---

## 8. Docker analysis (existing `Dockerfile`)

| Aspect | Finding |
|---|---|
| Base image | `python:3.14-slim` (multi-stage: `test` + `runtime`). **VERIFIED FROM CODE.** Python 3.14 satisfies `requires-python >=3.10`. Whether Render's BuildKit handles this base without issue is expected but untested — **NEEDS VERIFICATION** on first build. |
| Stages | Default build target is the last stage (`runtime`) — `docker build .` / Render BuildKit both pick it correctly. The `test` stage is CI-only (`--target test`). |
| Dependencies | Runtime stage: `pip install --no-deps -e ".[server]"` then code copied. ⚠️ Note `--no-deps` on the *editable* install followed by no second dependency install means runtime deps come from… — **NEEDS VERIFICATION:** confirm the runtime stage actually installs dependencies. As written, `pip install --no-deps -e ".[server]"` installs the project *without* its dependencies. If this image runs today on GCP, dependencies must be entering via another mechanism or the image was built differently; **test `docker run` locally before trusting it on Render** (see checklist below). If it fails, the fix is a Dockerfile change (out of scope until the failure is observed). |
| Prompts | `COPY prompts/ ./prompts/` with a comment explaining why — included. **VERIFIED FROM CODE.** |
| Non-root user | Yes — `appuser` created, `USER appuser`. **VERIFIED FROM CODE.** Good for Render. |
| Port | `EXPOSE 8000`; see §7.3 for the Render `$PORT` reconciliation. |
| Healthcheck | Built-in `HEALTHCHECK` hitting `http://localhost:8000/health`. Render uses its own configured health check path instead of Docker HEALTHCHECK, so set `/health` in the dashboard; the built-in one is consistent with `PORT=8000` if you choose option 1 in §7.3. |
| Filesystem assumptions | None at runtime (stateless app; only reads `prompts/`). |
| `.dockerignore` | Excludes `.env`, `.venv`, caches, docs, `.agents` — correct; keeps `tests/`, `scripts/`, `mock_datasets/` in context but the runtime stage never COPYs them. **VERIFIED FROM CODE.** No required file is excluded. |

**Local pre-flight (before pushing to Render):**

```bash
cd C:/Users/Sanjay/Desktop/Sk/rag-facts-check
docker build -t rag-facts-check:render-test .
docker run --rm -p 8000:8000 --env-file .env rag-facts-check:render-test
# in another shell:
curl http://localhost:8000/health
curl -X POST http://localhost:8000/halloumi/generate \
  -H "Content-Type: application/json" \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'
```

This catches the `--no-deps` question empirically before it becomes a deploy-loop problem.

---

## 9. Domain and CORS configuration

Expected production flow (Option A):

```text
Frontend:  https://<frontend-service>.onrender.com      (or https://app.yourdomain.com)
Backend:   https://<backend-service>.onrender.com       (or https://api.yourdomain.com)
```

`CORS_ORIGINS` (comma-separated, **VERIFIED FROM CODE** parsing in `server.py:136`) should
contain **exactly** the origins that will call the backend from a browser:

```text
# Render preview + production frontend URL(s):
CORS_ORIGINS=https://<frontend-service>.onrender.com,https://app.yourdomain.com
```

- Include the Render-assigned frontend URL even when using a custom domain (preview
  deployments on `onrender.com` will use it). If you enable Render PR preview
  environments with per-PR URLs, those URLs must be added too — or accept that previews
  will fail CORS. **NEEDS VERIFICATION:** whether your workspace uses preview URLs.
- **Do not use `CORS_ORIGINS=*` in production.** It is the code default (`server.py:135`)
  and is fine for local dev, but a wildcard origin means any website a user visits can make
  cross-origin requests to your backend from their browser — and since this backend has no
  authentication (§10), that turns any malicious page into a client of your paid/free-tier
  LLM quota. There is no platform requirement for `*`; explicit origins work with the
  existing code unchanged.
- Credentials: the middleware sets `allow_credentials=True` (**VERIFIED FROM CODE**), but the
  frontend sends no cookies/auth headers, so this is inert. With explicit origins it is
  harmless; with `*` it additionally violates the CORS spec's credentials+wildcard
  combination.
- Trailing slashes/paths: origins must be scheme+host(+port) only — no trailing `/`
  (the parser strips whitespace but not slashes).

---

## 10. Secrets and security checklist

The backend is **unauthenticated** (**VERIFIED FROM CODE** — no auth middleware, no API-key
check on any route) and **public by necessity** (the browser must reach it directly). Every
verification request spends XKiro LLM quota. A discovered backend URL can therefore be
abused to burn LLM quota/tokens with crafted payloads.

Production checklist:

1. ☐ **`LLM_API_KEY` only in Render env vars** (marked secret in the dashboard). Never in
   `.env.local`, never in frontend env, never in the repo. The local `.env` on disk is
   untracked (**VERIFIED FROM CODE** via `.gitignore`) — keep it that way; audit
   `git log -p --all -- .env` before making the repo public if it ever was.
2. ☐ **`CORS_ORIGINS` set to explicit frontend origins** (§9). Remember: CORS is a
   browser-side control — it does not stop direct `curl` abuse, only in-browser abuse.
3. ☐ **Rate limiting:** none exists in the code (**VERIFIED FROM CODE**). Mitigations that
   need no code change: keep the backend URL unlisted, rely on whatever quota/rate limits
   the XKiro gateway itself enforces on your key, and watch usage. Render built-in rate
   limiting: **NEEDS VERIFICATION** (no WAF/rate-limit feature was confirmed this session).
   Adding middleware rate limiting is a code change and thus out of scope here — flag it as
   the top post-deploy hardening item.
4. ☐ **Request size:** `/sources/extract` enforces 10 MB (**VERIFIED FROM CODE**,
   `documents.py:31`). JSON endpoints have no app-level body limit — Starlette will parse
   arbitrarily large bodies; abuse potential is bounded by LLM cost, not by bandwidth.
   **OPTIONAL IMPROVEMENT** later: a body-size cap middleware.
5. ☐ **Exception detail leakage:** `/halloumi/generate` and `/check` return
   `HTTPException(500, detail=str(e))` (**VERIFIED FROM CODE** `server.py:321-323,405-406`).
   Exception strings could contain upstream error detail (URLs, model names). Low severity
   for an internal tool; note it, don't block on it.
6. ☐ **Logging:** `logging.basicConfig(level=logging.DEBUG)` is hardcoded
   (**VERIFIED FROM CODE** `server.py:29`). Verbose but secret-free (the key is used only
   in request headers, never logged). Acceptable; **OPTIONAL IMPROVEMENT**: INFO level.
7. ☐ **Public health endpoint:** `/health` exposes only status/version/model name
   (**VERIFIED FROM CODE**) — safe and required for Render's health check.
8. ☐ **Frontend env:** confirm the built bundle contains no secrets — it can't, because the
   frontend only reads `NEXT_PUBLIC_API_BASE_URL` (**VERIFIED FROM CODE**); keep it that way.
9. ☐ **Docker image contents:** `.env` is excluded by `.dockerignore` (**VERIFIED FROM
   CODE**); tests/scripts stay out of the runtime stage. No secrets baked into layers.
10. ☐ **HTTPS:** Render provides managed TLS on `onrender.com` and custom domains
    automatically — no Caddy/certbot equivalent needed (unlike the GCP guide).

---

## 11. Persistence and Render filesystem

**The application is stateless.** Evidence (**all VERIFIED FROM CODE**):

- No database, ORM, or migration files; no Redis/cache client in `pyproject.toml` server
  extras.
- No filesystem writes anywhere in the package (grep verified).
- Uploads (`/sources/extract`) are read into memory and discarded after the response
  (`server.py:240-274`).
- Prompts are read-only files shipped with the code (`prompts/`), not generated state.
- The LLM client and checker are lazily created per process and hold no durable state
  (`server.py:146-220`).

Therefore:

- No Render Disk, no Postgres, no Key Value store is needed.
- Render's ephemeral filesystem is a non-issue — nothing needs to survive a redeploy or a
  free-tier spin-down.
- The only per-process state is the lazy LLM client/checker (rebuilt on first request after
  each cold start) and the httpx client pool.

---

## 12. Performance and scaling

**VERIFIED FROM CODE** analysis:

- **CPU:** negligible locally. All inference is remote (XKiro). Local work is JSON
  parsing, regex span matching (`spans.py`), and PDF/DOCX extraction — bursty, small.
- **RAM:** dominated by Python + FastAPI + one httpx/openai client per process, plus
  in-memory upload text (≤10 MB per request). `--workers 4` (Dockerfile CMD) means ~4
  independent Python processes, each with its own lazily-created LLM client
  (`server.py:149-220` closure state is per-worker). This is correct and creates no
  correctness issues precisely because the app is stateless (§11) — but 4 workers on a
  small instance may be more than needed; 1–2 workers is adequate for low-traffic use and
  halves/quarters idle RAM. **RENDER-SPECIFIC RECOMMENDATION:** start with
  `--workers 2` (override the Docker Command, §7.3 option 2) and raise it only under
  observed concurrency.
- **Concurrency model:** async FastAPI + httpx async client — many concurrent
  verifications can be in flight per worker while waiting on the LLM (I/O-bound).
  Batch verification within one request is sequential by design (`checker.py`).
- **Long-running requests:** expected 30 s–5 min for long answers (existing guide's
  estimate, consistent with `LLM_TIMEOUT=120` × multiple pipeline calls). Uvicorn imposes
  no request timeout (**VERIFIED FROM CODE** — none configured); the binding constraint is
  whatever sits in front of uvicorn (§4.2).
- **Cold starts (Render free tier):** ~1 min spin-up after 15 min idle (verified Render
  docs). During a cold start the first `/health` poll flips the UI to "online" only after
  boot; the first verification pays the startup latency. Paid instances don't spin down.
- **Horizontal scaling:** safe — stateless, no shared state, CORS and env are per-instance
  config. Each instance builds independent LLM clients; there is nothing to coordinate.
  A load balancer in front can round-robin SSE connections without affinity requirements
  (each request is self-contained).

---

## 13. Cost analysis

### Render infrastructure

**Verified this session from Render docs (free plan page):**

- Free web services: 750 instance-hours/workspace/month, spin down after 15 min idle,
  ~1 min cold start, no scaling/persistent disks/SSH; Render's own docs say *do not use
  them for production*.
- Free static sites exist (not used here — §3.2).

**NEEDS VERIFICATION:** exact dollar pricing for Starter/Standard instances. Render's
pricing page rendered client-side during this session and could not be scraped; historical
figures (e.g. Starter ≈ $7/mo) must be confirmed at https://render.com/pricing before
budgeting. Do not plan around unverified numbers.

Practical shapes:

| Shape | Composition | Use when |
|---|---|---|
| Evaluation | Backend on Free + Frontend on Free | Demo/dev only — expect 1-min cold starts and accept spin-downs. |
| Production-minimal | Backend on smallest paid instance + Frontend on Free (or smallest paid) | Real users, no cold starts on the backend. |
| Production | Both paid, backend with 2 workers | Sustained use, concurrent verifications. |

### XKiro / LLM API cost

**Not estimated** — there is no evidence in the repository of token pricing or usage volume.
This cost is orthogonal to hosting: every `/halloumi/generate` call spends it regardless of
where the backend runs, and moving GCP → Render changes nothing about it. The security
items in §10 (unauthenticated access) are the real control surface for this cost.

---

## 14. Deployment sequence

### Step 1 — Repository preparation

```bash
cd C:/Users/Sanjay/Desktop/Sk/rag-facts-check
git status                          # confirm clean; .env must be untracked
git log --oneline -3                # confirm remote is current: main @ 1888b98
git push origin main                # Render deploys from the GitHub repo
```

Confirm `.env` is absent from git: `git ls-files | grep -E '^\.env' ` should output nothing.

### Step 2 — Pre-flight the Docker image locally (§8 checklist)

### Step 3 — Create the backend Web Service (Render dashboard)

New → Web Service → connect `Fact-Checking-AI-Using-RAG` repo:

- Runtime: **Docker**; Root Directory: `.`
- Name e.g. `rag-facts-check-api`
- Instance size: chosen per §13
- Docker Command override per §7.3 (or plan to set `PORT=8000`)
- Health check path: `/health`

### Step 4 — Backend environment variables

```text
LLM_API_BASE     = <from local .env — copy manually, never paste into chat/commits>
LLM_API_KEY      = <from local .env> (mark as secret in dashboard)
LLM_MODEL        = <from local .env>
LLM_TEMPERATURE  = 0.1
LLM_MAX_TOKENS   = 512
LLM_TIMEOUT      = 120
CORS_ORIGINS     = https://<frontend>.onrender.com   (placeholder until Step 7; update after)
PORT             = 8000        (only if using §7.3 option 1)
```

### Step 5 — Backend health check

```bash
curl https://<backend>.onrender.com/health
# expected: {"status":"ok","version":"0.2.0","model":"<model>"}
```

(Free tier: first call may take ~1 min of spin-up.)

### Step 6 — Backend API tests

```bash
# blocking
curl -X POST https://<backend>.onrender.com/halloumi/generate \
  -H "Content-Type: application/json" \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'

# SSE (progressive arrival is the pass criterion — see §4.3)
curl -N -X POST https://<backend>.onrender.com/halloumi/generate/stream \
  -H "Content-Type: application/json" \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'

# malformed request must return 422, not 500
curl -X POST https://<backend>.onrender.com/halloumi/generate \
  -H "Content-Type: application/json" -d '{}'
```

### Step 7 — Create the frontend Web Service

New → Web Service → same repo:

- Runtime: **Node**; Root Directory: `frontend`
- Build: `npm ci && npm run build`; Start: `npm run start`
- Env: `NEXT_PUBLIC_API_BASE_URL=https://<backend>.onrender.com`, `NODE_VERSION=20`

### Step 8 — CORS finalization

Update the backend's `CORS_ORIGINS` to the real frontend URL from Step 7
(`https://<frontend>.onrender.com` + any custom domain), then let the backend redeploy.

Verify the preflight:

```bash
curl -sI -X OPTIONS https://<backend>.onrender.com/halloumi/generate \
  -H "Origin: https://<frontend>.onrender.com" \
  -H "Access-Control-Request-Method: POST" | grep -i access-control-allow-origin
# expected: access-control-allow-origin: https://<frontend>.onrender.com
```

### Step 9 — SSE end-to-end test (browser)

Open the frontend, run a verification, confirm the progress timeline shows real stages
(the UI never fabricates stages — visible stages prove the stream works, **VERIFIED FROM
CODE** design).

### Step 10 — Browser smoke test (§15 frontend checklist)

### Step 11 — Custom domains (if applicable)

Add domains in each service's settings; Render auto-provisions TLS. Then update, in order:
frontend's `NEXT_PUBLIC_API_BASE_URL` (rebuild frontend) → backend's `CORS_ORIGINS`
(redeploy backend).

### Step 12 — Production security verification (§10 checklist walkthrough)

---

## 15. Testing plan

### Backend

| Test | Command | Expected |
|---|---|---|
| Health | `curl …/health` | `{"status":"ok","version":"0.2.0","model":…}` |
| Blocking verification | Step 6 command | JSON with `answer_score`, `claims`, `segments` |
| Malformed request | `-d '{}'` | HTTP 422 |
| XKiro auth | Temporarily set `LLM_API_KEY` wrong on a staging service, run a verification | 500 with error event; restore key. (Staging only — never on prod.) |
| Timeout behavior | Point `LLM_API_BASE` at a blackhole host on staging | 500 after ~`LLM_TIMEOUT`×retries; stream emits `error` event |

### SSE

- §4.3 `curl -N` test: progressive `stage` frames, terminal `result`.
- Long-answer test: a multi-paragraph answer; connection must survive quiet periods.
- Interrupt test: `Ctrl+C` mid-stream, then verify a fresh run succeeds (server cancels the
  orphaned task — **VERIFIED FROM CODE** `server.py:371-373`).

### Frontend (browser)

- [ ] Header shows **API connected** + model name (`useApiStatus` polls `/health` every 30 s)
- [ ] Settings gear shows the configured backend URL
- [ ] Answer entry works; sources addable via text, web-link metadata, and file upload
      (PDF/DOCX/TXT/MD; >10 MB rejected with the backend's message)
- [ ] **Verify Answer** (and Ctrl+Enter) starts; progress timeline shows real stages
- [ ] Claims render with highlights; verdicts/evidence/rationale visible
- [ ] Source modal highlights evidence spans
- [ ] Score (0–10) displays; **Verify Again** re-runs
- [ ] Blocking fallback: temporarily deploy the frontend against a backend without
      `/halloumi/generate/stream` (or block that path) → UI still completes via fallback

### Failure modes

| Scenario | How | Expected |
|---|---|---|
| Backend unavailable | Suspend backend service | Header → "API offline" within ~30 s; verify shows a reachable-error |
| XKiro unavailable | Wrong `LLM_API_BASE` on staging | `error` event / 500 surfaced as error panel |
| SSE interruption | Kill network mid-stream | "connection interrupted" error; retry works |
| Frontend refresh mid-run | F5 during verification | Clean idle state, no crash |
| Long verification | Large answer + slow model | Completes (plan-dependent — §4.2); observe platform timeout behavior |
| CORS failure | Wrong `CORS_ORIGINS` | Browser console CORS error; fix in Step 8 |
| Redeploy during request | Trigger backend redeploy mid-verification | In-flight request fails with interruption error; next request lands on new instance (zero-downtime deploys are a listed Render web-service feature — verified from docs) |

---

## 16. Rollback plan

Render-specific:

1. **Identify the previous deployment:** Render dashboard → backend service → **Deploys**
   tab lists every deploy with commit SHA and status. Note the last known-good deploy ID.
2. **Roll back code:** use **Rollback** on the known-good deploy (redeploys that exact
   build) — or `git revert <bad-commit> && git push` to roll forward to the previous state.
   Frontend and backend roll back independently; a bad frontend deploy never requires
   touching the backend.
3. **Environment-variable changes are NOT rolled back by deploy rollback.** If a bad env
   change (e.g. wrong `LLM_API_BASE`) caused the incident, fix the variable in the
   dashboard and redeploy — env changes take effect on the next deploy. Render also shows
   which deploys had env changes; treat "rollback" as code-only and re-verify env after.
4. **Redeploying a known-good commit:** Deploys → pick deploy → Rollback; equivalently push
   the good commit to the tip of the watched branch.
5. **Secrets safety during rollback:** env vars persist across rollbacks; a rollback never
   re-prompts for `LLM_API_KEY`.

---

## 17. Final assessment

### Render compatibility

**READY WITH CONDITIONS**

Conditions (none require code changes):

1. Resolve the `$PORT` binding question per §7.3 and verify with `/health`.
2. Run the local Docker pre-flight (§8) to confirm the image starts and serves a real
   verification — this empirically settles the `--no-deps` editable-install question.
3. Confirm Render's request/idle timeout behavior for multi-minute SSE streams on the plan
   you choose (§4.2, **NEEDS VERIFICATION**) — the blocking fallback reduces but does not
   eliminate this exposure.
4. Set explicit `CORS_ORIGINS` before exposing the service to real users.
5. Use a paid backend instance for production; the free tier's 15-minute spin-down and
   1-minute cold start make it evaluation-only (Render's own docs say the same).

### Verified (from code)

- Stateless FastAPI service; no DB/Redis/queues/WebSockets/filesystem writes.
- Endpoints: `/health`, `/sources/extract` (10 MB, in-memory), `/halloumi/generate`,
  `/halloumi/generate/stream` (SSE), `/check`.
- SSE: real stage events only, no heartbeat, worst-case silence ≈ `LLM_TIMEOUT`(120 s) ×
  retries(3); `Cache-Control: no-cache` + `X-Accel-Buffering: no` already set; client
  disconnect cancels the task.
- Frontend calls backend directly from the browser (`NEXT_PUBLIC_API_BASE_URL`); fetch +
  ReadableStream SSE parsing; automatic blocking fallback on 404/405; no timeout on
  verification calls.
- Env surface exactly: `LLM_API_BASE/KEY/MODEL/TEMPERATURE/MAX_TOKENS/TIMEOUT/EXTRA_BODY`,
  `CORS_ORIGINS` (default `*`), frontend `NEXT_PUBLIC_API_BASE_URL`.
- Dockerfile: python:3.14-slim, editable install, prompts copied, non-root user, EXPOSE
  8000, healthcheck, 4 workers. `.dockerignore` excludes `.env` and keeps nothing required
  out of the runtime stage.
- No authentication or rate limiting on any route.

### Render-specific items requiring verification

- Exact request/idle/connection timeout values for Render web services (could not be
  confirmed from Render docs this session) — critical for multi-minute SSE streams.
- Whether Render's edge buffers `text/event-stream` responses (app already sends
  anti-buffering headers).
- Availability of `python:3.14` base / BuildKit behavior on Render (first build will show).
- Current dollar pricing of Starter/Standard instances (pricing page not scrapable this
  session) — check render.com/pricing.
- Whether the runtime-stage `pip install --no-deps -e ".[server]"` actually carries
  dependencies (local `docker run` pre-flight settles this).

### Required before deployment

- The five conditions above. Nothing else blocks; no application code changes are required.

### Optional improvements (non-blocking)

- SSE heartbeat (`: ping` every ~15 s) if idle-disconnection is observed — frontend already
  tolerates it with zero changes.
- Rate-limit middleware on the backend (top security hardening item, requires code change).
- Reduce log level from DEBUG; add a body-size cap; a `render.yaml` blueprint.

### Recommended deployment architecture

**Render Docker Web Service for the backend + Render Node Web Service for the frontend**
(Option A), browser → backend direct exactly as the code already works, with explicit
`CORS_ORIGINS`, `/health` health checks, `PORT` reconciled per §7.3, and a paid backend
instance for production. This follows from: the repo already ships a working Dockerfile
(backend parity), the frontend cannot be a Render Static Site without a code change, and
the SSE path is unaffected by where the frontend is hosted because the browser bypasses it.
If keeping the existing Vercel frontend is preferred, Option B is byte-for-byte compatible
— only the frontend's hosting and the `CORS_ORIGINS` entry change.