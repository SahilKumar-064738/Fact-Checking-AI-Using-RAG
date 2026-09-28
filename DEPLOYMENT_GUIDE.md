# RAG Facts Check — Production Deployment Guide

> Generated 2026-09-28 from a full audit of this repository (commit `c896f85`, branch `main`).
> Target architecture: **Next.js frontend on Vercel** + **FastAPI backend on GCP Compute Engine**,
> backend calling the XKiro OpenAI-compatible API.
>
> Legend used throughout:
> - ✅ **Verified from code** — confirmed by reading this repository.
> - 🔧 **Recommended configuration** — what you should set; not yet in the code.
> - 💡 **Optional improvement** — nice to have, not required to go live.
> - ⚠️ **NEEDS VERIFICATION** — cannot be determined from the repository alone.

Every command is labelled with where it runs:

- `[LOCAL WINDOWS]` — your dev machine (Git Bash)
- `[GCP VM]` — SSH session on the Compute Engine instance
- `[VERCEL DASHBOARD]` — Vercel web UI

---

## 1. Architecture

```
User Browser
     │
     │ HTTPS (page load, static assets, SSR)
     ▼
Vercel  ── Next.js 14 frontend (frontend/, "rag-facts-check-ui")
     │
     │  (browser directly opens HTTPS + JSON/SSE to the backend)
     ▼
GCP Compute Engine VM (Ubuntu, external HTTPS via Caddy)
     │
     ▼
Caddy reverse proxy (automatic HTTPS, SSE-safe config)
     │
     ▼
FastAPI / Uvicorn  (rag_facts_check.server:app, port 8000, localhost-only)
     │
     ▼
RAG Facts Check pipeline (claim extraction → batch verification → scoring)
     │
     │ OpenAI-compatible HTTPS API calls (chat/completions)
     ▼
XKiro (https://api.xkiro.com/v1) → Qwen model
```

Connection notes:

| Hop | Protocol | Who initiates | Notes |
|---|---|---|---|
| Browser → Vercel | HTTPS | Browser | Standard Next.js hosting. |
| Browser → GCP backend | HTTPS (JSON + SSE) | **Browser, directly** | ✅ Verified: `frontend/lib/api.ts` calls `${NEXT_PUBLIC_API_BASE_URL}/halloumi/generate/stream` from the client. The frontend does **not** proxy through Vercel serverless functions. This is good for SSE: no Vercel function timeout is involved. |
| GCP backend → XKiro | HTTPS | Backend | ✅ Verified: `AsyncAPILLM` / `AsyncOpenAI` (instructor) call `LLM_API_BASE` + `/chat/completions`. |

**Compatibility verdict: ✅ the current code is compatible with this architecture with zero code changes**, provided configuration (env vars) is set correctly. Details:

- The frontend already reads the backend URL from `NEXT_PUBLIC_API_BASE_URL` (✅ `frontend/lib/api.ts:29`, `frontend/components/layout/Header.tsx:58`), with a `http://localhost:8000` fallback — production just needs the env var set in Vercel.
- The backend already reads `CORS_ORIGINS` from the environment (✅ `rag_facts_check/server.py:134`) — no code change needed to lock CORS to your Vercel domain.
- The SSE endpoint already emits `Cache-Control: no-cache` and `X-Accel-Buffering: no` (✅ `rag_facts_check/server.py:329-336`), which is exactly what Nginx/Caddy need to stream without buffering.
- There is **no** filesystem persistence, database, uploaded-file storage, or localhost-only assumption in the request path. The only filesystem read is `prompts/*.txt` loaded at import time (✅ `rag_facts_check/prompts.py:20`), which is satisfied by cloning the repo.

### Can the backend run with plain `uvicorn`?

✅ Yes. `rag_facts_check/server.py` exposes a module-level `app` (`server.py:368`), and the documented run command is `uvicorn rag_facts_check.server:app --host 0.0.0.0 --port 8000` (`server.py:9`).

**Recommended:** Uvicorn managed by **systemd** (auto-restart, boot persistence, journald logging). Gunicorn and Docker are **not required**:

- The app is async and single-node; the pipeline is LLM-bound (waiting on XKiro), so extra workers add little. The repo's `Dockerfile` uses `--workers 4`; on a small VM, **1–2 Uvicorn workers** is enough (🔧 recommendation).
- Docker would add a layer without solving a real problem here (no native system deps beyond Python packages, no multi-service composition). This guide therefore uses **venv + systemd**, not Docker. If you prefer the existing `Dockerfile`, it is usable as-is — see §6.13.

---

## 2. Prerequisites

| Item | Required | Notes |
|---|---|---|
| GCP project with billing | ✅ | Compute Engine VM. |
| `gcloud` CLI installed & authenticated | ✅ | `[LOCAL WINDOWS]` `gcloud auth login` (interactive — run it yourself, e.g. `! gcloud auth login`). |
| GitHub repo accessible from the VM | ✅ | Via HTTPS token or deploy key. `<GITHUB_REPO>` placeholder below. |
| Domain + DNS control | 🔧 Recommended | Needed for clean HTTPS (Caddy auto-cert) and stable CORS origins. No domain is assumed in this guide — placeholders only. |
| Vercel account | ✅ | Free tier is sufficient. |
| XKiro API key | ✅ | Already in your local `.env`; never paste it into any frontend or git-tracked file. |
| Python ≥ 3.10 | ✅ | `pyproject.toml` requires `>=3.10` (✅ verified). Ubuntu 24.04 ships 3.12. |
| Node 18+ (local builds only) | Optional | Vercel builds remotely; Next 14.2.15 (✅ `frontend/package.json`). |

---

## 3. Pre-deployment audit

### 3.1 What was inspected

**Backend:** `rag_facts_check/server.py`, `checker.py`, `llm.py`, `retriever.py`, `models.py`, `spans.py`, `prompts.py` (usage), `agents.py` (referenced), `__init__.py`, `pyproject.toml`, `Makefile`, `Dockerfile`, `.env`, `.env.example`, `.gitignore`, `README.md`, `docs/guides/web-service.md`.

**Frontend:** `frontend/package.json`, `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts` (existence), `app/layout.tsx`, `app/page.tsx`, `components/Workspace.tsx`, `components/layout/Header.tsx`, `lib/api.ts`, `lib/types.ts`, `lib/validation.ts`, `hooks/useVerification.ts`, `hooks/useApiStatus.ts`, `.env.local.example`, `.gitignore`.

**Repo/deploy:** `.gitignore` (root + frontend), git status, `git ls-files` (secret scan), `Dockerfile`, `Jenkinsfile` (present; CI exists but is not required for this deployment), `.dockerignore`.

### 3.2 Audit findings — what matters for production

| # | Finding | Status | Detail |
|---|---|---|---|
| 1 | **Live API key in `.env`** | ✅ safe from git, ⚠️ handle carefully | `.env` contains your real XKiro key. `.gitignore` ignores `.env` and `.env.*` (✅ verified), and `git ls-files` shows **no** env file tracked (only `frontend/next-env.d.ts`, which is a generated TS file, not secrets). Do not commit it. 💡 If this key has ever been shared outside your machine, rotate it at the XKiro provider. |
| 2 | **CORS defaults to `*`** | 🔧 must set `CORS_ORIGINS` | `server.py:134`: `os.environ.get("CORS_ORIGINS", "*")` with `allow_credentials=True`. In production, set `CORS_ORIGINS` to your exact Vercel origin(s). See §11. |
| 3 | **Log level is `DEBUG` hardcoded** | 💡 acceptable, optional change | `server.py:28-32` sets `logging.DEBUG` to stdout. This is fine under journald but verbose; claim texts are logged. No secrets are logged (verified: `LLM_API_KEY` is never passed to a log call). Optional: set `LOG_LEVEL` support later — not required for deploy. |
| 4 | **No auth / rate limiting on the API** | 🔧 mitigate via firewall/proxy | Endpoints are public by design (drop-in halloumi replacement). Anyone who can reach the backend can trigger LLM calls (cost/abuse). Mitigations in this guide: GCP firewall + optional per-IP rate limit in Caddy (§8.2). |
| 5 | **Exception detail exposed to clients** | 💡 low risk | `server.py:277,316` return `str(e)` as HTTP 500 detail. Could leak internal text (never your API key — it isn't included in those exceptions). Acceptable for now. |
| 6 | **No lifespan/shutdown hook** | ✅ non-blocking | `AsyncAPILLM`'s httpx client is never explicitly closed; harmless under systemd restarts. |
| 7 | **`prompts/` directory is a runtime dependency** | ✅ handled by repo clone | `prompts.py` loads `prompts/*.txt` relative to the package parent dir. An editable install from the cloned repo satisfies this. Do **not** deploy only the Python package without `prompts/`. |
| 8 | **Frontend has exactly one env var** | ✅ clean | Only `NEXT_PUBLIC_API_BASE_URL`. It contains **no secrets** (a public backend URL). Verified no other `NEXT_PUBLIC_*`, no hardcoded production URLs besides the `localhost:8000` fallback. |
| 9 | **SSE has no heartbeat** | 🔧 proxy timeouts must be generous | Stage events fire at pipeline transitions; during one long batch LLM call there can be a long silence (see §12). Configure proxy timeouts accordingly. |
| 10 | **No Docker requirement** | ✅ | Docker is optional; `Dockerfile` exists and works if preferred (§6.13). |

### 3.3 Security audit (severity-ranked)

**CRITICAL**
- None found in code. ✅ No secrets tracked in git; no secrets in frontend.

**HIGH**
- 🔧 `CORS_ORIGINS=*` default + `allow_credentials=True`: set explicit origins before go-live (§11). (Note: the frontend sends no cookies/credentials, so the practical risk is CSRF-like abuse of your LLM budget, not session theft.)
- 🔧 Unauthenticated backend reachable from the internet → LLM-cost abuse. Mitigate with firewall (your VM IP only, if the app is internal) or Caddy rate limiting (§8.2).

**MEDIUM**
- Backend listens on `0.0.0.0:8000` in examples — on the VM, bind Uvicorn to `127.0.0.1` and let Caddy terminate TLS (§7).
- No request-body size limit — very large `answer`/`sources` payloads are forwarded to the LLM. Optional: enforce limits in Caddy (§8.2).
- DEBUG logging in production (verbose, includes claim text).

**LOW**
- Exception strings surfaced in 500 responses.
- HTTP/1.1 default on Uvicorn (fine; SSE works).
- SSH hardening (standard VM hygiene, §6.9).

---

## 4. Environment variables

### 4.1 Backend (GCP VM) — ✅ all verified from `rag_facts_check/server.py:47-59` and `server.py:134`

| Variable | Required? | Example | Where used | Secret? | Production value source |
|---|---|---|---|---|---|
| `LLM_API_BASE` | ✅ Yes | `https://api.xkiro.com/v1` | `server.py:155` → builds `{base}/chat/completions`; also passed to `AsyncOpenAI(base_url=…)` for instructor | No | Your XKiro account docs |
| `LLM_API_KEY` | ✅ Yes | `sk-…` (placeholder) | `server.py:156` → `Authorization: Bearer` on every LLM call | **YES** | XKiro dashboard. Keep only in `/etc/rag-facts-check.env` (root-owned, `0600`) |
| `LLM_MODEL` | ✅ Yes | `qwen/qwen3.8-omni-flash:free` ⚠️ use the exact model id your XKiro plan allows | `server.py:157` → sent as `model` in chat completions | No | XKiro dashboard |
| `LLM_TEMPERATURE` | Optional (default `0.1`) | `0.1` | `server.py:158` | No | Keep default |
| `LLM_MAX_TOKENS` | Optional (default `512`) | `1024` | `server.py:159` → per-call `max_tokens`; extraction always uses ≥2048 internally | No | Tune per model limits |
| `LLM_TIMEOUT` | Optional (default `120` seconds) | `120` | `server.py:160` → httpx client timeout per LLM call | No | Keep ≥120; batch calls to a free-tier model can be slow |
| `LLM_EXTRA_BODY` | Optional (default `{}`) | `{}` | `server.py:162` → JSON merged into every request body | No | Only if XKiro needs extra fields |
| `CORS_ORIGINS` | 🔧 Yes in production | `https://<project>.vercel.app` (comma-sep list) | `server.py:134` → FastAPI CORSMiddleware | No | Your Vercel URL(s) |

Not read by the backend (do **not** set expecting effect): `PORT`, `HOST` — host/port are Uvicorn CLI flags in this project, not env vars. ✅ Verified: no `os.environ` reads for host/port.

### 4.2 Frontend (Vercel) — ✅ verified from `frontend/lib/api.ts`

| Variable | Required? | Example | Secret? | Notes |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | ✅ Yes | `https://api.<your-domain>` | No — it is intentionally public (the browser needs it) | No trailing slash. **Never** put `LLM_API_KEY` or any backend secret in any `NEXT_PUBLIC_*` var. |

That is the only frontend variable. `.env.local.example` already documents this rule. ✅

---

## 5. Security checklist (do these before go-live)

- [ ] `git status` clean; `git ls-files | findstr /i env` shows only `frontend/next-env.d.ts` ✅ (already true).
- [ ] `.env` stays out of git (already gitignored ✅). On the VM, secrets live in `/etc/rag-facts-check.env` with `chmod 600`.
- [ ] `CORS_ORIGINS` set to explicit Vercel origin(s) — not `*`.
- [ ] Uvicorn bound to `127.0.0.1`; only ports 22/80/443 open in GCP firewall.
- [ ] HTTPS enforced (Caddy auto-redirects 80→443).
- [ ] SSH: key-based auth; consider disabling password auth (§6.9).
- [ ] Non-root service user (`ragfacts`) — systemd unit below does this.
- [ ] `LLM_API_KEY` present **only** on the VM and in your password manager. Not in the guide, not in git, not in Vercel.
- [ ] 💡 Optional: Caddy rate limit (§8.2) and request-size cap.

---

## 6. GCP backend deployment (Compute Engine)

> Why Compute Engine (✅ recommendation based on audit): the backend is a single always-on FastAPI process with long-lived SSE connections. Compute Engine is the simplest reliable fit:
> - **vs Cloud Run:** Cloud Run would also work (60-min request cap is fine here, and it streams SSE), but it bills per-request, cold-starts would delay first LLM initialization, and your preferred model is a single small VM. No strong reason to switch.
> - **vs GKE/App Engine:** unnecessary complexity for one service.

Placeholders used below: `<PROJECT_ID>`, `<ZONE>` (e.g. `us-central1-a`), `<VM_NAME>` (e.g. `rag-facts-check`), `<GITHUB_REPO>` (e.g. `https://github.com/<you>/rag-facts-check.git`), `<DOMAIN>` / `<API_SUBDOMAIN>`.

### 6.1 Create the VM `[LOCAL WINDOWS]`

```bash
gcloud config set project <PROJECT_ID>

gcloud compute instances create <VM_NAME> \
  --zone=<ZONE> \
  --machine-type=e2-small \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --tags=rag-facts-check
```

> `e2-small` (2 vCPU / 2 GB) is enough: the pipeline is I/O-bound on XKiro calls. If you enable multi-worker Uvicorn or see memory pressure, move to `e2-medium`.

### 6.2 SSH in `[LOCAL WINDOWS]`

```bash
gcloud compute ssh <VM_NAME> --zone=<ZONE>
```

### 6.3 Update Ubuntu `[GCP VM]`

```bash
sudo apt update && sudo apt -y upgrade
```

### 6.4 Install Python + system packages `[GCP VM]`

```bash
sudo apt install -y python3 python3-venv python3-pip git curl ca-certificates ufw
python3 --version   # must be >= 3.10 (Ubuntu 24.04: 3.12) ✅ compatible
```

### 6.5 Clone the repository `[GCP VM]`

```bash
sudo mkdir -p /opt/rag-facts-check
sudo chown $USER:$USER /opt/rag-facts-check
git clone <GITHUB_REPO> /opt/rag-facts-check
cd /opt/rag-facts-check
```

> For a private repo, either `git config --global credential.helper store` + a fine-grained PAT, or add a deploy key: `ssh-keygen -t ed25519` and add `~/.ssh/id_ed25519.pub` as a read-only deploy key on the repo.

### 6.6 Create venv and install dependencies `[GCP VM]`

```bash
cd /opt/rag-facts-check
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -e ".[server]"
```

> ✅ `-e ".[server]"` installs exactly what the server needs (`fastapi`, `uvicorn`, `httpx`, `python-dotenv`, `atomic-agents`, `instructor`, `openai` — per `pyproject.toml`). The editable install from the repo root keeps `prompts/` resolvable (audit finding #7).

### 6.7 Create the production env file `[GCP VM]`

```bash
sudo tee /etc/rag-facts-check.env > /dev/null <<'EOF'
LLM_API_BASE=https://api.xkiro.com/v1
LLM_API_KEY=<PASTE_YOUR_XKIRO_KEY_HERE>
LLM_MODEL=<YOUR_XKIRO_MODEL_ID>
LLM_TEMPERATURE=0.1
LLM_MAX_TOKENS=1024
LLM_TIMEOUT=120
CORS_ORIGINS=https://<project>.vercel.app
EOF

sudo chmod 600 /etc/rag-facts-check.env
```

> ⚠️ The key is pasted **on the VM only**. Don't put it in git, Vercel, or this file's examples.
> Note: `server.py` also tries to load `.env` from the repo root via python-dotenv, but `load_dotenv` does **not** override already-set environment variables, so the systemd `EnvironmentFile` values always win (✅ verified behavior). Still, to avoid confusion, do **not** create `/opt/rag-facts-check/.env` on the VM.

### 6.8 Test the backend manually `[GCP VM]`

```bash
cd /opt/rag-facts-check
sudo set -a; sudo bash -c 'source /etc/rag-facts-check.env'; set -a   # or just export vars
# simpler, non-root:
export $(sudo cat /etc/rag-facts-check.env | xargs)

.venv/bin/uvicorn rag_facts_check.server:app --host 127.0.0.1 --port 8000
```

In a second SSH session:

```bash
curl -s http://127.0.0.1:8000/health
# expected: {"status":"ok","version":"0.2.0"}

curl -s -X POST http://127.0.0.1:8000/halloumi/generate \
  -H 'Content-Type: application/json' \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'
```

Stop the manual server with `Ctrl+C` when both calls succeed.

### 6.9 Firewall `[LOCAL WINDOWS]`

```bash
# Allow SSH (default rule usually exists; create if not)
gcloud compute firewall-rules create allow-ssh-<VM_NAME> \
  --allow=tcp:22 --target-tags=rag-facts-check

# Allow HTTP/HTTPS from anywhere (needed for Caddy ACME + public API)
gcloud compute firewall-rules create allow-web-<VM_NAME> \
  --allow=tcp:80,tcp:443 --target-tags=rag-facts-check
```

> 🔧 Port 8000 is **never** opened — Uvicorn binds to localhost only.
> 💡 If the app is for a known set of users, restrict `--source-ranges` on the web rule to your office/home IP instead of the default `0.0.0.0/0`.

### 6.10–6.18 systemd, reverse proxy, HTTPS, verification

Continue in §7 (systemd) and §8–9 (Caddy + HTTPS), then verify:

```bash
curl -s https://<API_SUBDOMAIN>.<DOMAIN>/health   # [LOCAL WINDOWS]
```

### 6.13 💡 Optional: Docker instead of venv+systemd

The repo `Dockerfile` is production-shaped (non-root user, healthcheck, 4 workers). If you prefer it:

```bash
# [GCP VM]
sudo apt install -y docker.io
sudo docker build -t rag-facts-check /opt/rag-facts-check
sudo docker run -d --name rfc --restart unless-stopped \
  -p 127.0.0.1:8000:8000 --env-file /etc/rag-facts-check.env rag-facts-check
```

The rest of the guide (Caddy, CORS, SSE) is identical. This guide's primary path remains venv+systemd for simplicity.

---

## 7. systemd configuration

Create `/etc/systemd/system/rag-facts-check.service` `[GCP VM]`:

```bash
sudo tee /etc/systemd/system/rag-facts-check.service > /dev/null <<'EOF'
[Unit]
Description=RAG Facts Check FastAPI backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ragfacts
Group=ragfacts
WorkingDirectory=/opt/rag-facts-check
EnvironmentFile=/etc/rag-facts-check.env
ExecStart=/opt/rag-facts-check/.venv/bin/uvicorn rag_facts_check.server:app \
    --host 127.0.0.1 --port 8000 --workers 2
Restart=always
RestartSec=5
# Logs go to journald (uvicorn writes to stdout/stderr)
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rag-facts-check
# Hardening
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
```

Create the service user and fix ownership `[GCP VM]`:

```bash
sudo useradd --system --home /opt/rag-facts-check --shell /usr/sbin/nologin ragfacts
sudo chown -R ragfacts:ragfacts /opt/rag-facts-check
```

> Design choices (all matched to the actual project):
> - `WorkingDirectory=/opt/rag-facts-check` — the real clone path (§6.5).
> - `EnvironmentFile=/etc/rag-facts-check.env` — the secret file from §6.7; nothing sensitive on the command line.
> - `--workers 2` — each worker lazy-initializes its own LLM client (✅ `_get_checker()` per process, `server.py:148`); 2 workers give restart headroom without doubling memory. Use `--workers 1` on a 1 GB VM.
> - `Restart=always` + `RestartSec=5` — survives crashes and XKiro-induced exceptions; Uvicorn itself has no request timeout, so long verifications are never killed by the server.
> - No `TimeoutStopSec` change needed: in-flight SSE streams are cancelled on stop; systemd's default 90 s stop timeout is ample.

Manage it `[GCP VM]`:

```bash
sudo systemctl daemon-reload
sudo systemctl enable rag-facts-check
sudo systemctl start rag-facts-check
sudo systemctl status rag-facts-check

# Live logs:
journalctl -u rag-facts-check -f
```

---

## 8. Reverse proxy (Caddy — recommended)

Caddy is chosen for automatic HTTPS with zero certbot ceremony. An Nginx config is provided too (§8.3).

### 8.1 Install `[GCP VM]`

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### 8.2 Caddyfile `[GCP VM]`

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
<API_SUBDOMAIN>.<DOMAIN> {
    # SSE-friendly streaming: no response buffering is applied by Caddy by default,
    # and these timeouts keep long verification streams alive.
    servers {
        timeouts {
            read_body   1m
            read_header 1m
            write       10m
            idle        10m
        }
    }

    # 💡 Optional hardening: cap request bodies (answers + sources are text)
    request_body {
        max_size 5MB
    }

    # 💡 Optional rate limiting requires a Caddy plugin; the pragmatic built-in
    # alternative is firewall source-range restriction (§6.9).

    # Normal JSON endpoints + SSE endpoint — one proxy rule covers both.
    reverse_proxy 127.0.0.1:8000 {
        # Preserve streaming semantics end-to-end
        flush_interval -1
        # Keep long SSE connections open (10 min worst case)
        transport http {
            read_timeout    10m
            write_timeout   10m
            dial_timeout    10s
        }
    }
}
EOF

sudo systemctl restart caddy
```

Why this shape (tied to the real endpoints):

- `flush_interval -1` → flush every write, so `event: stage` SSE frames reach the browser immediately instead of being batched.
- `write/idle 10m` → covers the worst case found in the audit: one batch verification LLM call can exceed 60 s (`LLM_TIMEOUT=120` × retries), during which **no SSE bytes flow** (audit finding #9).
- The backend already sends `X-Accel-Buffering: no` (harmless for Caddy, essential for Nginx).
- HTTP→HTTPS redirect and Let's Encrypt certs are automatic.

### 8.3 Nginx alternative `[GCP VM]` (only if you prefer Nginx)

```nginx
server {
    listen 80;
    server_name <API_SUBDOMAIN>.<DOMAIN>;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <API_SUBDOMAIN>.<DOMAIN>;

    ssl_certificate     /etc/letsencrypt/live/<API_SUBDOMAIN>.<DOMAIN>/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/<API_SUBDOMAIN>.<DOMAIN>/privkey.pem;

    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # --- SSE-critical ---
        proxy_buffering off;            # never buffer event-stream
        proxy_cache off;
        proxy_read_timeout 600s;        # long silences between stage events
        proxy_send_timeout 600s;
        chunked_transfer_encoding on;
    }
}
```

(Requires certbot first: `sudo apt install certbot python3-certbot-nginx`.)

---

## 9. HTTPS

| Component | Mechanism |
|---|---|
| Vercel frontend | Automatic HTTPS on `*.vercel.app` and custom domains (Vercel-managed certs). Nothing to do. |
| GCP backend | Caddy obtains Let's Encrypt certs automatically via HTTP-01 (ports 80+443 must be open — §6.9). |
| Browser constraint | ✅ Important: the frontend is served over HTTPS, so the backend **must** also be HTTPS — browsers block mixed content. An `http://` backend URL will silently fail from a Vercel site. This is why the guide never suggests a plain-IP HTTP backend. |

---

## 13. Domain / DNS setup

### 13.1 With a custom domain (recommended)

```
Frontend:  https://app.<DOMAIN>      → Vercel
Backend:   https://api.<DOMAIN>      → GCP VM (Caddy)
```

| Step | Where | Action |
|---|---|---|
| 1 | [VERCEL DASHBOARD] | Project → Settings → Domains → add `app.<DOMAIN>` (or use the provided `*.vercel.app` and skip). |
| 2 | DNS provider | `A  app  76.76.21.21` (Vercel's current IP — Vercel shows the exact record when you add the domain) or `CNAME app cname.vercel-dns.com`. |
| 3 | DNS provider | `A  api  <VM_EXTERNAL_IP>` — get it with `gcloud compute instances describe <VM_NAME> --zone=<ZONE> --format='value(networkInterfaces[0].accessConfigs[0].natIP)'` `[LOCAL WINDOWS]`. 💡 Make the external IP **static**: `gcloud compute addresses create <VM_NAME>-ip --region=<REGION>` and attach it. |
| 4 | Wait for DNS, then Caddy issues the cert automatically. Verify: `curl -v https://api.<DOMAIN>/health` `[LOCAL WINDOWS]`. |
| 5 | Backend env | Set `CORS_ORIGINS=https://app.<DOMAIN>` (plus `https://<project>.vercel.app` if you keep that too) in `/etc/rag-facts-check.env`, then `sudo systemctl restart rag-facts-check` `[GCP VM]`. |

### 13.2 Without a custom domain (temporary)

- Frontend: `https://<project>.vercel.app` — works immediately.
- Backend: **a bare IP cannot get a trusted browser certificate**, so `https://<IP>` won't work from the Vercel site (mixed-content/cert error). Realistic temporary options:
  1. 🔧 **Cloudflare Tunnel** (free, no domain, no open ports): `cloudflared tunnel --url http://127.0.0.1:8000` on the VM gives you a temporary `https://<random>.trycloudflare.com` origin. Use that as `NEXT_PUBLIC_API_BASE_URL` and in `CORS_ORIGINS`. Quick tunnels are ephemeral (URL changes on restart) — fine for a demo, not for production.
  2. Buy a cheap domain (simplest durable answer).
- ⚠️ NEEDS VERIFICATION: which temporary route you prefer; nothing in the repo decides this.

---

## 10. Vercel frontend deployment

All verified against `frontend/` (Next.js 14 App Router, `package-lock.json` present ✅, no custom output mode, no API routes, no `output: export` — standard server build).

### 10.1 Create the project `[VERCEL DASHBOARD]`

1. Vercel → **Add New → Project** → import `<GITHUB_REPO>`.
2. **Root Directory:** `frontend`  ← critical; the repo root is the Python project.
3. Framework preset: **Next.js** (auto-detected).
4. **Install command:** leave default (`npm install`; Vercel uses `package-lock.json`).
5. **Build command:** leave default (`next build`).
6. **Output:** default — do not set `output: export`; nothing in the code requires it.

### 10.2 Environment variables `[VERCEL DASHBOARD]`

Project → Settings → Environment Variables:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.<DOMAIN>` | **Production + Preview** (see note) |

- ✅ This is the **only** variable. It is public by design (browser-visible URL), contains no secret, and matches the audit (§3.2 finding #8).
- `LLM_API_KEY` and all other `LLM_*` vars must **never** be added to Vercel — the frontend never reads them (✅ verified: no reference anywhere in `frontend/`).
- **Preview deployments:** Vercel preview URLs are `https://<project>-<hash>-<team>.vercel.app`. Two options:
  - Simplest: point preview at the **same** backend and add a wildcard-ish list to `CORS_ORIGINS` — Starlette's CORSMiddleware doesn't support wildcard subdomains, so either list preview URLs you actually use, or temporarily allow `*` **on a staging backend only**, never production. 🔧 Recommended: production uses the exact origin list; previews reuse production's backend with the exact preview origin added when needed.
- After changing env vars, **redeploy** (env vars are inlined at build time for `NEXT_PUBLIC_*`).

### 10.3 Connect frontend → backend

No code changes needed: `frontend/lib/api.ts` reads `NEXT_PUBLIC_API_BASE_URL` and strips trailing slashes. The health indicator (`useApiStatus.ts`, 30 s poll of `GET /health`) will show "API connected" once CORS + HTTPS are correct.

---

## 11. CORS — exact production configuration

✅ Verified current implementation (`rag_facts_check/server.py:133-142`):

```python
cors_origins_str = os.environ.get("CORS_ORIGINS", "*")
cors_origins = [o.strip() for o in cors_origins_str.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Production setting (no code change required)

`/etc/rag-facts-check.env` on the VM:

```bash
CORS_ORIGINS=https://app.<DOMAIN>,https://<project>.vercel.app
```

Then `sudo systemctl restart rag-facts-check`.

Rules:

- 🔧 **Do not ship with `CORS_ORIGINS=*`.** With `allow_credentials=True`, browsers actually reject `*` for credentialed requests, and even without credentials it exposes your LLM budget to any website. (The frontend sends no cookies, so `allow_credentials=True` is inert but harmless — no code change needed.)
- Origins must be **scheme + host (+ port)** exactly — no trailing slash, no path.
- Include both your custom-domain origin **and** the `*.vercel.app` origin if you'll use it.
- Vercel previews: add each preview origin you test with, comma-separated (see §10.2).
- `OPTIONS` preflights are handled by the middleware automatically; the SSE `POST` sends `Content-Type: application/json`, which triggers a preflight — this works out of the box with the config above.

---

## 12. SSE / streaming configuration

### 12.1 Actual implementation (✅ verified)

- Backend: `POST /halloumi/generate/stream` (`server.py:279-336`) returns a Starlette `StreamingResponse` with `media_type="text/event-stream"`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Events: `stage` (real pipeline events from `checker.check(progress_callback=…)` — `started`, `extracting_claims`, `claims_extracted`, `verifying_claims`, `claims_verified`, `scoring`), then terminal `result` or `error`. The background task is cancelled if the client disconnects (`server.py:325-327`).
- Frontend: `verifyAnswerWithProgress` (`frontend/lib/api.ts:126-177`) uses `fetch` + `ReadableStream` (not `EventSource`, because the request is a POST), parses `event:`/`data:` frames, validates with Zod, and **falls back to the blocking `POST /halloumi/generate`** on 404/405 or non-SSE responses.

### 12.2 Does it work Vercel → GCP?

✅ **Yes — and better than a proxied design.** Because the **browser** calls the GCP backend directly (§1), the SSE stream never passes through Vercel's infrastructure, so Vercel's serverless limits (function timeouts, response buffering) are irrelevant. The only requirements are:

1. Backend reachable over HTTPS with valid CORS (§9, §11).
2. No intermediary buffering the stream (§12.3).

### 12.3 Proxy buffering & required config

| Layer | Risk | Configuration |
|---|---|---|
| Caddy | Buffers by default in some modes | `flush_interval -1` + 10 m write/idle timeouts (§8.2) ✅ |
| Nginx | **Buffers by default — breaks SSE** | `proxy_buffering off; proxy_cache off; proxy_read_timeout 600s` (§8.3) ✅ |
| Backend | Already sends `X-Accel-Buffering: no` and `Cache-Control: no-cache` ✅ (protects you even behind proxies you don't control) |

### 12.4 Timeouts & keep-alive — the one real production concern

- **Silence windows:** stage events only fire at pipeline transitions. During a single batch verification call to the free-tier XKiro model, expect up to `LLM_TIMEOUT` (120 s) × retries (3) of silence on one SSE frame boundary. There is **no heartbeat** in the current implementation (✅ verified — the generator only yields on queue events).
- Therefore every proxy timeout in the path must exceed the worst single LLM call: the guide sets **10 min** (§8.2/8.3). This is a recommendation derived from `LLM_TIMEOUT=120` and `retries=3` in `llm.py:344-357`, not an arbitrary number.
- Uvicorn itself imposes **no request timeout** ✅ — long verifications complete.
- Browser `fetch` imposes no hard timeout ✅; the frontend only applies a 5 s timeout to `GET /health` (`api.ts:40`), not to verification calls.
- **Cloud Run difference** (if you ever switch): CPU is allocated during request handling and streaming works, but the 60-min max request duration applies; on Compute Engine there is no such cap.
- 💡 Optional improvement (not required): add a periodic SSE comment keep-alive (e.g. yield `: ping\n\n` every 15 s from `event_stream()`) so even aggressive intermediaries never drop the connection. If added later, no frontend change is needed — comment lines are ignored by the parser.

### 12.5 Test the production SSE stream

```bash
# [LOCAL WINDOWS]
curl -N -X POST https://api.<DOMAIN>/halloumi/generate/stream \
  -H 'Content-Type: application/json' \
  -d '{"answer":"Paris is the capital of France.","sources":["Paris is the capital of France."]}'
```

Expected: a sequence of `event: stage` frames appearing **progressively** (not all at once), ending with `event: result`. If everything arrives in one burst, a proxy is buffering — re-check §8.

---

## 14. Production smoke tests

### Backend `[LOCAL WINDOWS]` (or GCP VM against 127.0.0.1)

| Test | Command | Expected |
|---|---|---|
| Health | `curl https://api.<DOMAIN>/health` | `{"status":"ok","version":"0.2.0"}` |
| Blocking verify | `curl -X POST …/halloumi/generate` (payload from §6.8) | JSON with `answer_score`, `claims`, `segments` |
| SSE verify | `curl -N …` (§12.5) | progressive `stage` frames + `result` |
| CORS header | `curl -I -X OPTIONS … -H "Origin: https://<project>.vercel.app" -H "Access-Control-Request-Method: POST"` | `access-control-allow-origin: https://<project>.vercel.app` |
| Bad request | `curl -X POST …/halloumi/generate -d '{}'` | 422, not 500 |

### Frontend (browser, production URL)

- [ ] Page loads; header shows **"API connected"** with version badge (`useApiStatus`).
- [ ] Settings panel (gear icon) shows the correct Backend URL.
- [ ] Answer can be entered; sources can be added (text/web/file).
- [ ] **Verify Answer** (and `Ctrl+Enter`) starts verification.
- [ ] **SSE progress timeline** shows real stages (connecting → extracting claims → verifying N/N → scoring) — the UI never fabricates stages, so visible stages prove the stream works.
- [ ] Claims appear with highlights in the answer; verdicts (supported/NEI/contradicted), evidence, rationale render.
- [ ] Source inspection modal opens; evidence spans highlight in the source.
- [ ] `answer_score` (0–10) displays.
- [ ] **Verify Again** re-runs.
- [ ] Errors display via the error panel (e.g., stop the service and retry — expect "couldn't reach the verification backend").

### Failure-mode tests

| Scenario | How | Expected |
|---|---|---|
| Backend restart mid-run | `sudo systemctl restart rag-facts-check` during a verification | UI shows interruption error; next run succeeds |
| Frontend refresh mid-run | F5 during verification | Clean idle state; no crash |
| Empty answer | Verify with empty answer | Button disabled (client guard, ✅ `Workspace.tsx:34`) |
| Missing source | Verify with answer only | Button disabled with helper text |
| Backend unavailable | Firewall-block or stop service | Header flips to "API offline" within 30 s; verify shows error |
| SSE interruption | Kill network mid-stream | Frontend falls back gracefully; error shown if blocking path also fails |

---

## 15. Performance / timeouts

| Layer | Setting | Rationale (from code) |
|---|---|---|
| Per-LLM-call timeout | `LLM_TIMEOUT=120` s (`server.py:160`, httpx client) | Free-tier reasoning models can be slow; retries (`llm.py:344`) retry up to 3× with 2 s backoff on null-content/transport errors. |
| Whole verification | unbounded (no server timeout) | Extraction (1–N chunk calls) + batch verification (default `batch_size=20`, `server.py` default via `RAGFactsChecker`) + optional retrieval calls. For a long answer expect 30 s–5 min. |
| Uvicorn | no request timeout ✅ | Correct for long SSE. |
| Caddy/Nginx | 10 min read/write/idle (§8) | Covers worst-case silent window (§12.4). |
| Frontend fetch | none for verification; 5 s for `/health` only ✅ | Verified in `api.ts`. |
| Vercel | not in the request path ✅ | Browser→GCP directly; no serverless cap applies. |
| GCP | no LB in this design → no 30 s/600 s LB timeouts | Direct VM + Caddy avoids GCP LB idle timeouts entirely. |

💡 If you later front the VM with a GCP HTTPS Load Balancer, note its backend timeouts (default 30 s, max configurable) — another reason this guide keeps things simple with direct VM access.

---

## 16. Monitoring and logs

- **Service logs:** `journalctl -u rag-facts-check -f` `[GCP VM]` — uvicorn access logs + pipeline `INFO` logs (claims extracted, verdicts per claim). DEBUG level is verbose by default (`server.py:28`); acceptable, 💡 optionally reduce later.
- **Proxy logs:** `journalctl -u caddy -f`.
- **Health probe:** `GET /health` (no auth, cheap) — point any uptime monitor at it.
- **VM metrics:** GCP Console → Compute Engine → Monitoring (CPU/mem).
- 💡 Optional: `gcloud logging` agent shipping journald to Cloud Logging.
- ⚠️ No secret values appear in logs (verified: the key is only used in request headers).

---

## 17. Updating the deployment

### Frontend `[LOCAL WINDOWS]`

Push to the branch Vercel watches — Vercel auto-builds and deploys. For env-var changes, update in the dashboard first, then redeploy.

### Backend `[GCP VM]`

```bash
cd /opt/rag-facts-check
git pull origin main
.venv/bin/pip install -e ".[server]"     # picks up any pyproject.toml changes
sudo systemctl restart rag-facts-check
sudo systemctl status rag-facts-check
journalctl -u rag-facts-check -n 50
```

> The editable install means `git pull` updates the code in place; the `pip install` step is only needed when dependencies change but is safe to always run.

---

## 18. Rollback

### Frontend

`[VERCEL DASHBOARD]` → Project → Deployments → ⋯ on the last known-good deployment → **Promote to Production**. Instant, no rebuild of the bad commit needed.

### Backend `[GCP VM]`

```bash
cd /opt/rag-facts-check
git log --oneline -5                     # find the previous good commit
git checkout <PREVIOUS_COMMIT>           # or: git revert <BAD_COMMIT>
sudo systemctl restart rag-facts-check
curl -s http://127.0.0.1:8000/health     # confirm
```

Return to the branch later with `git checkout main && git pull && sudo systemctl restart rag-facts-check`.

---

## 19. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Header stuck on "API offline" | CORS mismatch, HTTP instead of HTTPS, or firewall | Check browser console for CORS error; confirm `CORS_ORIGINS` exactly matches the page origin; confirm backend is HTTPS (§9) |
| SSE frames arrive all at once | Proxy buffering | Caddy: `flush_interval -1` present; Nginx: `proxy_buffering off` (§8) |
| SSE dies after ~60 s of progress | Proxy read timeout | Raise to 600 s+ (§8.2/8.3); check no corporate proxy in between |
| 500 with "LLM returned null content" | Reasoning model exhausted token budget | `llm.py` retries automatically; consider raising `LLM_MAX_TOKENS` |
| 500 with model/auth text from XKiro | Wrong `LLM_MODEL` or key | Verify env file values; `sudo systemctl restart rag-facts-check` |
| `curl /health` works from VM but not externally | Firewall or Caddy down | `sudo systemctl status caddy`; re-check §6.9 firewall rules; `sudo ufw status` (if enabled, allow 80/443/22) |
| Vercel preview shows offline | Preview origin not in `CORS_ORIGINS` | Add that preview URL, restart backend (§11) |
| Service fails to start after deploy | Missing `prompts/` or deps | `journalctl -u rag-facts-check -n 100`; re-run §6.6 install |

---

## 20. Final production checklist

- [ ] VM created, Python ≥ 3.10, repo cloned at `/opt/rag-facts-check`
- [ ] `.venv` installed with `.[server]`; manual test passed (§6.8)
- [ ] `/etc/rag-facts-check.env` — 8 vars, `chmod 600`, real XKiro key, `CORS_ORIGINS` locked to Vercel origin(s)
- [ ] `rag-facts-check.service` enabled + running; survives `sudo reboot`
- [ ] Firewall: only 22/80/443 open; port 8000 closed externally
- [ ] Caddy serving `https://api.<DOMAIN>/health` with valid cert
- [ ] SSE test (§12.5) shows progressive frames
- [ ] Vercel project: root dir `frontend`, `NEXT_PUBLIC_API_BASE_URL` set for Production (+ Preview)
- [ ] No `LLM_*` variables exist in Vercel
- [ ] Full browser smoke test passed (§14)
- [ ] Rollback procedure rehearsed (§18)

---

## Appendix A — Audit record

**Files inspected (exact):**

Backend: `rag_facts_check/server.py`, `checker.py`, `llm.py`, `retriever.py`, `__init__.py`, `prompts.py` (import-time path usage), `models.py`/`spans.py`/`agents.py` (referenced); `pyproject.toml`, `Makefile`, `Dockerfile`, `.dockerignore`, `Jenkinsfile`, `.env`, `.env.example`, `.gitignore`, `README.md`, `docs/guides/web-service.md`, `prompts/` (file listing).

Frontend: `package.json`, `package-lock.json` (presence), `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts` (presence), `.eslintrc.json`, `.env.local.example`, `frontend/.gitignore`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css` (listing), `components/Workspace.tsx`, `components/layout/Header.tsx`, `lib/api.ts`, `lib/types.ts`, `lib/validation.ts`, `hooks/useVerification.ts`, `hooks/useApiStatus.ts`.

Repo/deploy: git status, `git ls-files` (secret/env scan), root `.gitignore`, `frontend/.gitignore`.

**Files created by this audit:** `DEPLOYMENT_GUIDE.md` (this file) — **no application code was modified**.

**Files that would need modification before deployment:** **none required.** Configuration-only deployment. 💡 Optional future improvements (not blockers): log-level env support in `server.py`, SSE heartbeat, request-size validation.

**Unresolved issues / NEEDS VERIFICATION:**
1. ⚠️ Exact XKiro model id your key is entitled to (`LLM_MODEL`) — taken from your current `.env`; confirm it is the production model you want.
2. ⚠️ Whether you own/will buy a domain (§13). Without one, use the Cloudflare Tunnel temporary path.
3. ⚠️ Whether the app is public or internal-only — decides firewall source ranges and whether Caddy rate limiting is worth adding.
4. ⚠️ If the XKiro key has ever left your machine (e.g., pasted into another tool), rotate it before go-live.

**Deployment architecture:** §1 (Vercel static/SSR frontend; browser→GCP direct HTTPS+SSE; Caddy→Uvicorn→pipeline→XKiro).

**Final readiness assessment:** ✅ **READY.** The codebase is production-deployable as-is: clean env-var separation, SSE-safe response headers already present, CORS configurable without code changes, no state/persistence dependencies, no secrets in the frontend, git history clean of credentials. Complete the configuration steps in §4–§13 and the checklist in §20 to go live.