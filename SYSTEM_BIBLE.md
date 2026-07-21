# JOE AUTONOMOUS SOFTWARE ENGINEERING PLATFORM - SYSTEM BIBLE

**Version:** 2.2 (Verified Production Specification)  
**Date:** July 22, 2026  
**Repository:** `yasoo2/xelitesolutions`  
**Primary Reference:** Repository Implementation (`c:\Users\home\xelitesolutions-2`)

---

## 1. EXECUTIVE OVERVIEW

### 1.1 Platform Description
Joe is an autonomous, multi-agent software engineering platform. It acts as a disciplined engineering organization rather than a simple chat assistant, receiving high-level goals from users and executing complete software engineering lifecycles—planning, phase orchestration, execution, verification, quality gating, automated diagnosis, and single-attempt self-healing.

### 1.2 Core Philosophy
- **Determinism over Randomness:** Uncontrolled tool-calling loops are strictly rejected. All execution flows through the canonical pipeline: `User Request → ProjectPlannerTool → AgentLoopService → PhaseExecutorTool → ToolService → QualityGate → RepairTicketService → SelfFixService → SelfFixExecutionService → Phase Rerun → Verification`.
- **System Isolation & Security:** All tool operations operate through the `ToolService` and `ExecutionFirewall` policy gateways. Unsafe operations (such as plain-text authentication bypasses or unescaped path traversals) are strictly rejected.
- **Fail-Fast & Self-Healing:** Failures trigger structured diagnostic tickets (`RepairTicketService`) and bounded repair plans (`SelfFixService`) rather than infinite retry loops.

### 1.3 Current System Maturity
- **Execution Architecture:** Hardened against infinite loops via `ExecutionEnforcer` and `ExecutionGuard`.
- **API Protection:** Protected via `express-rate-limit`, mandatory `JWT_SECRET`, HMAC signature verification for webhooks, and `multer` MIME/file extension filtering.
- **Database Model:** Supports dual mode—MongoDB (`mongoose`) or local JSON persistence (`PERSISTENCE_MODE=JSON`) for offline development.

---

## 2. HISTORICAL EVOLUTION

- **Version 1 (Initial Setup):** Basic Express server with ad-hoc agent prompts and local MongoDB instance.
- **Version 2 (Hetzner Docker Setup):** Deployed to Hetzner Linux (`joe-server-1`). Nginx reverse proxy mapped public SSL traffic to Docker containers (`joe_web`, `joe_mongo`, `joe_browser_worker`). API executed natively on the host OS via `systemctl` (`joe-api.service`).
- **Version 3 (Planner & Quality Gates):** Decoupled planning from execution (`ProjectPlannerTool` strictly planner-only). Introduced phase-based quality gates.
- **Version 4 (Agent Loop & Self-Healing):** Built `AgentLoopService`, `RepairTicketService`, `SelfFixService`, and `SelfFixExecutionService` to establish a closed-loop self-healing pipeline (limited to 1 attempt).
- **Version 5 (Execution Firewall & Security Hardening):** Added `AgentExecutionFirewall` and `ExecutionEnforcer`. Completed Phase 2.1 Audit Remediation to eliminate plaintext backdoors, add HMAC webhook verification, rate-limiting, and path-traversal prevention.
- **Version 6 (Current Environment):** Migrated to local Windows execution workspace (`c:\Users\home\xelitesolutions-2`). Updated Docker Compose configurations to use dynamic `host-gateway`. Express serves `web/dist` directly for offline operation.

---

## 3. CURRENT SYSTEM ARCHITECTURE

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 CLIENT LAYER                                    │
│                 React SPA (Vite) / WebSocket / REST Clients                     │
└───────────────────────────────────────┬─────────────────────────────────────────┘
                                        │ HTTP / WS (Port 5000)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  API GATEWAY                                    │
│  Express App (app.ts) | Rate Limiter | Auth Middleware | Global Error Handler  │
└───────────────────┬──────────────────────────────────────────┬──────────────────┘
                    │                                          │
                    ▼                                          ▼
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│        ORCHESTRATION PIPELINE        │   │           SUPPORT SERVICES           │
│  ProjectPlannerTool                  │   │  WorkspaceService & TraceManager     │
│  AgentLoopService (Orchestrator)     │   │  IntelligentRouter (LLM Engine)      │
│  PhaseExecutorTool                   │   │  MemoryService & KnowledgeService    │
│  QualityGate & RepairTicketService   │   │  DeployManager (Auto-Poller)         │
│  SelfFixService & Execution          │   │  Sentinel (Telemetry & Policy)       │
└───────────────────┬──────────────────┘   └──────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                  KERNEL LAYER                                   │
│   ExecutionGateway  ◄─────►  AgentExecutionFirewall  ◄─────►  ExecutionEngine   │
└───────────────────┬──────────────────────────────────────────┬──────────────────┘
                    │                                          │
                    ▼                                          ▼
┌──────────────────────────────────────┐   ┌──────────────────────────────────────┐
│           TOOL & OS LAYER            │   │            STORAGE LAYER             │
│  ToolService (Policy Engine)         │   │  MongoDB (Mongoose Models)           │
│  TerminalKernel (node-pty/Fallback)  │   │  JSON Persistence (api/data/db)      │
│  Browser Worker (Playwright/Stealth) │   │  Workspace Filesystem                │
└──────────────────────────────────────┘   └──────────────────────────────────────┘
```

### Subsystems Breakdown:
1. **Express API Server (`api/src/api/app.ts`):** Serves API endpoints, applies CORS, mounts security middleware, rate limiters, global error handler, and serves static artifacts/frontend.
2. **Orchestration Core (`api/src/orchestration/`):** Houses `AgentLoopService`, `AgentOrchestrator`, and `AgentExecutionFirewall`. Controls lifecycle and ensures tasks run through phase execution.
3. **Execution Engine & Gateway (`api/src/kernel/`):** Centralized execution contract. `ExecutionGateway` delegates to `ExecutionEngine` which manages process spawning (`child_process`), queue concurrency (max 15 concurrent), caching (5s TTL), and terminal sessions (`node-pty`).
4. **Tool Engine (`api/src/modules/services/ToolService.ts`):** Central gateway for tool invocations. Normalizes workspace paths via `workspaceService.getActiveRoot(contextWorkspaceId)`.
5. **Intelligent Router (`api/src/core/llm/intelligent-router.ts`):** Multimodal LLM routing engine supporting Groq, OpenAI, Gemini, DeepSeek, and Pollinations proxy fallbacks.
6. **Sentinel Subsystem (`api/src/api/routes/sentinel.ts`):** Autonomous agent telemetry ingestion (`/api/admin/sentinel/telemetry`), live incident management (`SentinelIncidentModel`), policy evaluation (`SentinelPolicyEngine`), and tamper-evident audit logging (`SentinelAuditService`).
7. **Terminal Kernel (`api/src/modules/terminal/terminal-kernel.ts`):** Real-time interactive PTY session manager (`TerminalKernel`). Streams terminal input/output bidirectional updates over WebSockets (`ws.ts`) and supports window resizing and shell process management.
8. **Knowledge & RAG Engine (`api/src/api/routes/knowledge.ts` & `KnowledgeService`):** Document ingestion (support for text and PDF parsing via DOMMatrix polyfills), document listing, snippet extraction, and keyword vector scoring (`/api/knowledge/query`).
9. **DeployManager Poller (`api/src/modules/services/DeployManager.ts`):** Singleton manager with an auto-deploy polling loop (`POLL_INTERVAL_MS=60000`) that compares local vs remote git commit hashes (`git fetch origin main`), records deployment states in MongoDB, and triggers builds via `ExecutionGateway`.
10. **TraceManager (`api/src/modules/services/TraceManager.ts`):** Structured tracing service recording step-by-step execution events, tool inputs/outputs, and durations per session.

---

## 4. COMPLETE REQUEST LIFECYCLE

1. **Ingress:** Request hits `/api/run/start` or `/api/tools/run`.
2. **Authentication:** `authenticate` or `authenticateOptional` extracts JWT claims from `Authorization: Bearer <token>`.
3. **Trace Initialization:** `traceManager.startTrace(sessionId, goal)` creates a unique trace context.
4. **Planning Phase:** `ProjectPlannerTool` generates a multi-phase JSON execution plan.
5. **Orchestrated Execution:** `AgentLoopService` iterates through each phase via `PhaseExecutorTool`.
6. **Tool Execution:** `PhaseExecutorTool` calls `ToolService.executeTool(name, params)`.
7. **Firewall Context:** `AgentExecutionFirewall.validateExecution()` verifies that the tool call originates from an authorized context.
8. **Kernel Dispatch:** `ExecutionGateway.execute()` delegates to `ExecutionEngine`, which spawns a child process or PTY instance.
9. **Quality Gate:** `QualityGate.evaluate()` checks phase output against success criteria.
10. **WebSocket Broadcast:** Live progress events (`step_progress`, `artifact_created`, `terminal_output`) broadcast to connected clients via `ws.ts`.
11. **Completion:** Returns final payload `{ ok: true, runId, traceId }`.

---

## 5. COMPLETE SELF-HEALING LIFECYCLE

```text
Phase Execution Fails (status === "failed" | "partial")
                    │
                    ▼
       RepairTicketService.diagnose()
  (Extracts TypeScript errors, line numbers, logs)
                    │
                    ▼
         SelfFixService.planFix()
    (Generates self_fix_plan; Max 1 attempt)
                    │
                    ▼
     SelfFixExecutionService.executeFix()
 (Verifies tool against allowlist: write_file, file_edit, etc.)
                    │
                    ▼
          Rerun Failed Phase
                    │
            ┌───────┴───────┐
            ▼               ▼
    status === "completed"  status !== "completed"
            │               │
            ▼               ▼
    Continue Next Phase    STOP Pipeline & Report Ticket
```

---

## 6. AI DECISION MAKING & ROUTING

- **Model Selection:** `IntelligentRouter.ts` maps task complexity to providers:
  - Complex coding / architecture → OpenAI / Claude / DeepSeek
  - Speed / lightweight queries → Groq (Llama-3, Mixtral)
  - Vision / multimodal → Gemini
- **Fallback Chain:** Primary Provider → Secondary Provider → Pollinations Free Proxy → Emergency Static Fallback Response (`I apologize, but I am currently experiencing a temporary connection issue...`).

---

## 7. SECURITY MODEL

1. **JWT Enforcement:** `JWT_SECRET` is mandatory across all environments. Ephemeral secret generation is disabled.
2. **Rate Limiting:** `express-rate-limit` enforces 1000 req/15m globally, and 50 req/15m on `/api/auth/login` and `/api/auth/guest`.
3. **HMAC Webhook Validation:** `webhooks.ts` validates GitHub webhooks via `X-Hub-Signature-256` using `crypto.timingSafeEqual()`.
4. **File Filter Protection:** `files.ts` rejects `.exe`, `.sh`, `.bat`, `.cmd`, `.html` extensions and dangerous MIME types.
5. **Path Traversal Protection:** `project.ts` enforces `candidateReal.startsWith(workspaceReal + path.sep)`.
6. **User Secret Encryption:** `userSecret.ts` encrypts secret values using AES-256-GCM prior to MongoDB persistence.
7. **Sentinel Telemetry & Policy:** `sentinel.ts` enforces `X-Sentinel-API-Key` headers for remote agent ingestion and verifies audit log chain integrity.

---

## 8. INFRASTRUCTURE & MIGRATION REPORT

### 8.1 Current Local Environment (Windows Host)
- **API Runtime:** `ts-node` or `node dist/index.js` on port `5000`.
- **Database:** Local MongoDB on `mongodb://localhost:27017/joe` (or `PERSISTENCE_MODE=JSON` / `api/data/db`).
- **Nginx & Web:** Express serves `web/dist` directly at `app.use(express.static(webDistPath))`.
- **Docker Compose:** Supports dynamic `host-gateway` mapping for container-to-host connectivity.

### 8.2 Historical Migration Differences
- Migrated away from Hetzner `joe-server-1` Linux host systemd service (`systemctl restart joe-api.service`).
- Path references updated from hardcoded `/root/xelitesolutions` to dynamic `process.cwd()` resolution.

---

## 9. DEVELOPER GUIDE

### 9.1 Local Setup
```bash
# Navigate to API directory
cd api

# Install dependencies
npm install

# Set mandatory environment variables in .env
# JWT_SECRET=your_secure_secret_key_here
# NODE_ENV=development

# Run build
npm run build

# Run linting
npm run lint

# Run architecture guards
npm run guard:architecture
npm run guard:package-scripts

# Start development API server
npm run dev
```

### 9.2 Verification Commands
```bash
# Run full engineering E2E flow
npm run test:joe:engineer-flow

# Run self-healing verification tests
npm run test:self-healing:success
npm run test:self-healing:failure
```

---

## 10. REPOSITORY MAP

- `api/src/api/`: Express application setup (`app.ts`), WebSocket handlers (`ws.ts`), and route handlers (`routes/`).
- `api/src/api/routes/sentinel.ts`: Telemetry, audit trail, and incident management API.
- `api/src/api/routes/knowledge.ts`: Knowledge base & RAG document query routes.
- `api/src/kernel/`: Core execution engines (`ExecutionEngine.ts`, `ExecutionGateway.ts`, `ExecutionGuard.ts`).
- `api/src/orchestration/`: Pipeline orchestrators (`AgentLoopService.ts`, `AgentExecutionFirewall.ts`).
- `api/src/modules/terminal/`: PTY terminal kernel (`terminal-kernel.ts`).
- `api/src/modules/services/`: Core application services (`ToolService.ts`, `WorkspaceService.ts`, `DeployManager.ts`, `TraceManager.ts`).
- `api/src/shared/models/`: Mongoose data schemas (`user.ts`, `approval.ts`, `userSecret.ts`, `Sentinel*.ts`).
- `infra/`: Docker compose files and Nginx reverse proxy configuration.
- `scripts/`: Operational scripts (`backup-db.sh`, `deploy.sh`).
