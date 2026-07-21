# CURRENT SYSTEM ARCHITECTURE & ENVIRONMENT RECONSTRUCTION

**Date of Reconstruction:** July 22, 2026  
**Repository:** `yasoo2/xelitesolutions`  
**Current Host Environment:** Windows (Local Development / Testing Setup)

---

## 1. System Topology & Runtime Overview

```text
                               ┌──────────────────────────────────────────────┐
                               │                 Client Browser               │
                               └──────────────────────┬───────────────────────┘
                                                      │ HTTP / WebSocket
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │           Host Application / Nginx           │
                               │   (Port 5000 API / Port 80,443 Nginx Proxy)  │
                               └──────┬────────────────┬──────────────┬───────┘
                                      │                │              │
                    ┌─────────────────┘                │              └────────────────┐
                    ▼                                  ▼                               ▼
     ┌────────────────────────────┐    ┌─────────────────────────────┐   ┌────────────────────────────┐
     │   Joe API (Host Node.js)   │    │  MongoDB (Docker / Local)   │   │  Browser Worker (Docker)   │
     │      Port 5000 / Express   │───►│       Port 27017            │   │    Port 5050 / 7070 (Pty)  │
     └──────────────┬─────────────┘    └─────────────────────────────┘   └────────────────────────────┘
                    │
                    ├───────────────────────────────┬──────────────────────────────┐
                    ▼                               ▼                              ▼
     ┌────────────────────────────┐    ┌─────────────────────────────┐   ┌────────────────────────────┐
     │   Intelligent Router LLM   │    │   Execution Engine / Shell  │   │   DeepMemory / Vector DB   │
     │  (Groq/Gemini/DeepSeek)    │    │ (Local Powershell / cmd / bash) │   │ (Local File / Mongoose JSON)│
     └────────────────────────────┘    └─────────────────────────────┘   └────────────────────────────┘
```

---

## 2. Component Runtime Breakdown

| Component | Historical Production (Hetzner) | Current Local Runtime | Reason & Impact |
|---|---|---|---|
| **API Server** | Node.js host service managed by `systemd` (`joe-api.service`) listening on `0.0.0.0:5000`. | Executed directly via `ts-node` or `node dist/index.js` on host (Windows Powershell). | Migration to local dev/test environment. `systemctl` commands fail on Windows. |
| **MongoDB** | Docker container (`joe_mongo`) on port `27017` with WiredTiger cache limit (0.25GB). | Local MongoDB instance (`mongodb://localhost:27017/joe`) OR in-memory / JSON fallback mode (`PERSISTENCE_MODE=JSON` / `MOCK_DB=1`). | Enables database-free testing and offline development via `api/data/db`. |
| **Frontend Web** | Docker container (`joe_web`) running Nginx serving static Vite build. | Express static server serving `web/dist` directly at `app.use(express.static(webDistPath))` or Vite dev server on `http://localhost:5173`. | Allows dev feedback loops without building full Docker images. |
| **Reverse Proxy** | Nginx container (`joe_nginx`) handling SSL termination and proxying to `host.docker.internal:5000`. | Express routes handles API/WS directly on port `5000`, with optional Nginx container when `docker-compose` is up. | Local API testing bypasses Nginx when hitting `http://localhost:5000/api` directly. |
| **Browser Worker** | Docker container (`joe_browser_worker`) running Playwright/Chromium on ports `5050` & `7070`. | Playwright executable running locally or via remote WS connection (`BROWSER_WS_ENDPOINT`). | Simplifies local browser automation debugging. |
| **Execution Gateway** | Executed Linux bash commands inside `/root/xelitesolutions`. | Executes Windows PowerShell / CMD commands inside `c:\Users\home\xelitesolutions-2`. | Command paths must support Windows-style paths (`c:\...`) and forward/backward slash normalization. |

---

## 3. Network & Routing Matrix

- **API Base URL:** `http://localhost:5000/api`
- **Health Check Endpoint:** `http://localhost:5000/api/health` and `http://localhost:5000/health`
- **WebSocket Endpoint:** `ws://localhost:5000/api/ws` (and legacy path `/ws`)
- **Browser Worker WS:** `ws://localhost:7070`
- **MongoDB Connection:** `mongodb://localhost:27017/joe` (fallback: `api/data/db` when `PERSISTENCE_MODE=JSON`)

---

## 4. Outdated Infrastructure Assumptions (Technical Debt)

1. **Linux Hardcoded Path `/root/xelitesolutions`:**  
   Present in `webhooks.ts`, `DeployManager.ts`, `backup-db.sh`, `deploy.sh`. On the current Windows environment, paths resolve relative to `process.cwd()` (`c:\Users\home\xelitesolutions-2`).
2. **Systemd Service Management (`systemctl restart joe-api.service`):**  
   Present in `deploy.sh` and `AGENTS.md`. Calling `systemctl` on Windows fails. Local restarts are manual or managed via process supervisors (Nodemon/pm2/ts-node).
3. **Hardcoded IP `172.18.0.1` in Nginx upstream:**  
   Present in `infra/nginx/conf.d/app.conf`. Resolved in Compose via `host-gateway`, but standalone local Nginx requires `127.0.0.1:5000`.
4. **Shell Incompatibilities (`bash` vs `powershell`):**  
   Scripts like `scripts/deploy.sh` and `scripts/backup-db.sh` require Bash (WSL/Git Bash) on Windows, while `ExecutionEngine.ts` resolves `powershell.exe` as default shell on `win32`.

---

## 5. Security & Isolation State

- **Authentication:** JWT strictly enforced (`JWT_SECRET` mandatory).
- **Environment Bypass:** Backdoor plaintext override in `/auth/login` removed. `/dev` route restricted strictly to `NODE_ENV === 'development'` on loopback interfaces.
- **Upload Filtering:** `multer` equipped with MIME and extension filtering (`.exe`, `.sh`, `.html` rejected).
- **Path Traversal:** `resolvePathInsideWorkspace` in `project.ts` enforces `candidateReal.startsWith(workspaceReal + path.sep)`.
- **Database Backup:** `scripts/backup-db.sh` created for compressed `mongodump` archiving and 7-day rotation.

---

## 6. Primary Environment Variables

| Variable | Requirement | Current Default / Usage |
|---|---|---|
| `NODE_ENV` | Required | `development` or `production` |
| `PORT` | Optional | `5000` |
| `JWT_SECRET` | **Mandatory** | String secret for signing JWT tokens |
| `MONGO_URI` | Optional | `mongodb://localhost:27017/joe` |
| `PERSISTENCE_MODE` | Optional | Set to `JSON` for MongoDB-free local storage |
| `MOCK_DB` | Optional | Set to `1` or `true` to bypass MongoDB connection |
| `ADMIN_EMAIL` | Optional | Bootstraps initial `OWNER` / `SUPER_ADMIN` account |
| `ADMIN_PASSWORD` | Optional | Initial password for bootstrapped account |
| `GITHUB_WEBHOOK_SECRET` | Mandatory for Webhooks | Validates `X-Hub-Signature-256` payload signatures |
| `ALLOWED_ORIGINS` | Optional | Comma-separated CORS allowed origin origins |
