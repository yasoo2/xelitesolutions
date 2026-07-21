# COMPLETE REPOSITORY FILE INVENTORY & MODULE CLASSIFICATION

**Total Tracked Repository Files:** 631 Files  
**Primary Execution Stack:** Node.js / Express / TypeScript / React / Tailwind / Playwright / Docker

---

## 1. FILE DISTRIBUTION BY TOP-LEVEL DIRECTORY

| Directory | File Count | Primary Role |
|---|---|---|
| `api/` | 423 | Express Server, Kernel Execution Engines, Orchestrators, Tools, Services, Mongoose Models |
| `web/` | 86 | React SPA Frontend (Vite, TypeScript, Tailwind, WebSockets, State Management) |
| `docs/` | 30 | Historical system documentation, API specs, deployment notes |
| `data/` | 24 | Local JSON persistence stores, memory dumps, test DB files |
| `scripts/` | 19 | Operations, DB backups, deployment, server initialization, Docker scripts |
| `.github/` | 7 | GitHub Actions CI/CD workflows and repository templates |
| `services/` | 6 | Browser Worker service Docker files and startup scripts |
| `infra/` | 3 | Docker Compose production manifests and Nginx configuration |
| Root Dir | 26 | System Bibles, AGENTS.md, configuration manifests, root scripts |

---

## 2. API SUBSYSTEM (423 Files Breakdown)

### A. Routes (`api/src/api/routes/`) - 25 Files
- `admin.ts`: User management, Sentinel logs, query filters.
- `agent.ts`: Autonomous agent triggering endpoints.
- `approvals.ts`: Approval request queue and status resolution.
- `assets.ts`: Static project asset serving and mime resolution.
- `auth.ts`: Authentication (`/login`, `/register`, `/guest`, `/google`, `/dev`).
- `browser.ts`: Playwright browser session control and page audits.
- `build.ts`: Project build execution endpoints.
- `files.ts`: File uploads (Multer with fileFilter), downloads, text/binary detection.
- `git.ts`: Git operations (diff, status, commit, log).
- `github.ts`: GitHub API integration (PRs, issues, repos).
- `health.ts`: Comprehensive system diagnostics and uptime metrics.
- `knowledge.ts`: Knowledge Base ingestion, PDF parsing, vector search query.
- `memory.ts`: Summary memory and message tracking.
- `packages.ts`: Package manager query and npm package handling.
- `ping-deploy.ts`: External deploy ping listener.
- `project.ts`: Workspace resolution, boundary checking (`resolvePathInsideWorkspace`), AST graphs.
- `providers.ts`: LLM provider connection testing.
- `run.ts`: Async execution entry point (`/api/run/start`).
- `sentinel.ts`: Telemetry ingestion, live incident retrieval, audit verification.
- `servers.ts`: Remote server configuration management.
- `sessions.ts`: Workspace chat session creation, history, pinning.
- `system.ts`: Low-level system info and memory statistics.
- `tools.ts`: Tool execution endpoint (`/:name/execute`), selftest.
- `webhooks.ts`: GitHub deployment webhooks with HMAC verification.
- `workspaces.ts`: Workspace CRUD operations and user workspace membership.

### B. Kernel Layer (`api/src/kernel/`) - 5 Files
- `ExecutionEngine.ts`: Concurrency queue (15 active, 100 max), 5s TTL cache, child_process spawning, node-pty terminal management.
- `ExecutionGateway.ts`: Central execution gateway routing commands to ExecutionEngine.
- `ExecutionGuard.ts`: Enforces runtime tool and execution safety invariants on process launch.
- `ExecutionEnforcer.ts`: Validates architectural integrity on server boot.
- `types.ts`: Core kernel execution interfaces.

### C. Orchestration (`api/src/orchestration/`) - 5 Files
- `AgentLoopService.ts`: Orchestrates execution loops and phase transitions.
- `AgentOrchestrator.ts`: Dynamic runtime agent goal solver.
- `AgentExecutionFirewall.ts`: Single-brain context authorization guard (`validateExecution`, `runAsSystem`).
- `RepairTicketService.ts`: Diagnostic engine generating failure tickets from error trace logs.
- `SelfFixService.ts`: Generates bounded repair plans (max 1 attempt).
- `SelfFixExecutionService.ts`: Verifies repair tools against allowlists and executes phase reruns.

### D. Tools Core (`api/src/modules/tools/`) - 30+ Files
- `registry.ts`: Central tool registry.
- `definitions/`: Individual tool implementations (`ProjectPlannerTool`, `TerminalManagerTool`, `LLMCacheTool`, `JoeEngineeringReportTool`, `AdvancedTools`, `TaskInteractionTools`, etc.).

### E. LLM Intelligence (`api/src/core/llm/`) - 15+ Files
- `intelligent-router.ts`: Task analysis, complexity mapping, multimodal flattening, provider fallback cascade.
- `providers/`: Groq, OpenAI, Gemini, DeepSeek, Pollinations, OpenRouter, Anthropic integration logic.

### F. Terminal & Browser Modules (`api/src/modules/`)
- `terminal/terminal-kernel.ts`: Real-time PTY terminal kernel.
- `browser/manager.ts` & `executor.ts`: Playwright browser session manager, stealth injection, viewport capture.

### G. Mongoose Data Models (`api/src/shared/models/`) - 25 Files
- `user.ts`, `session.ts`, `approval.ts`, `userSecret.ts` (AES-256-GCM encrypted), `workspace.ts`, `run.ts`, `file.ts`, `message.ts`, `SentinelAuditLog.ts`, `SentinelIncident.ts`, `SentinelActionRun.ts`, `ServerConfigModel.ts`, etc.

---

## 3. FRONTEND WEB SUBSYSTEM (86 Files Breakdown)

- `web/src/components/`: Modular React components for chat interfaces, code editors, terminal views, file trees, approval modals, and settings.
- `web/src/hooks/`: Custom React hooks for WebSocket subscriptions (`useWebSocket`), session history, tool execution, theme management.
- `web/src/services/`: API clients connecting to Express REST endpoints on `/api`.
- `web/src/types/`: TypeScript type definitions matching backend models.

---

## 4. SCRIPTS & SERVICES (25 Files Breakdown)

- `scripts/backup-db.sh`: Automated compressed `mongodump` with 7-day rotation.
- `scripts/deploy.sh`: Full CI/CD update script.
- `scripts/health-check.sh`: Health verification script.
- `services/joe-browser-worker/`: Dockerized Chromium Playwright service setup.
