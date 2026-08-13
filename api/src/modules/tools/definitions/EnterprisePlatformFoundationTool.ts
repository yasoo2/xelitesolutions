import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastTerminalLine, broadcastThinkingDetail } from '../../../api/ws';
import { workspaceService } from '../../services/WorkspaceService';
import { executionEngine } from '../../../kernel/ExecutionEngine';
import { isArabicReply, say } from '../../../shared/reply-language';

const PLATFORM_DIR = 'autonomous-engineering-platform';

function writeText(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Builds a reviewable, deterministic foundation for requests that explicitly
 * require an enterprise multi-agent / microservices platform. It deliberately
 * does not claim to deploy, scale, or operate an unproven production system.
 * Those operations remain separate, user-controlled phases after review.
 */
export class EnterprisePlatformFoundationTool extends BaseTool {
  name = 'enterprise_platform_foundation';
  version = '1.0.0';
  description = 'Create and locally verify an enterprise multi-agent platform foundation: architecture, API contracts, service skeletons, CI, observability, security policy, and deployment templates.';
  tags = ['enterprise', 'microservices', 'multi-agent', 'architecture', 'foundation'];
  permissions: ToolPermission[] = ['read', 'write', 'execute'];
  sideEffects: ToolPermission[] = ['write', 'execute'];
  rateLimitPerMinute = 2;
  auditFields = ['request'];

  inputSchema = {
    type: 'object' as const,
    properties: {
      request: { type: 'string', description: 'The user request for the enterprise platform.' },
    },
    required: ['request'],
  };

  outputSchema = {
    type: 'object' as const,
    properties: {
      projectPath: { type: 'string' },
      writtenFiles: { type: 'number' },
      verified: { type: 'boolean' },
      verification: { type: 'string' },
      deliveryScope: { type: 'string' },
    },
  };

  async execute(input: { request: string }, context?: any): Promise<ToolExecutionResult> {
    const request = String(input?.request || '').trim();
    if (!request) return { ok: false, error: 'request is required', logs: [] };

    const logs: string[] = [];
    const sessionId = context?.sessionId;
    const term = (line: string) => {
      logs.push(line);
      try { broadcastTerminalLine(sessionId, `${line}\r\n`); } catch { /* terminal is optional */ }
    };
    const stream = (relativePath: string, content: string) => {
      try {
        broadcast({ type: 'file_stream', sessionId, data: {
          file: relativePath, chunk: content, done: true,
          bytes: Buffer.byteLength(content), at: Date.now(), label: 'written',
        } } as any);
      } catch { /* UI streaming must not block writing */ }
    };

    const root = path.resolve(String(context?.workspaceRoot || workspaceService.getExplorerRoot()));
    const projectPath = path.join(root, PLATFORM_DIR);
    const rootPrefix = `${root}${path.sep}`;
    if (!projectPath.startsWith(rootPrefix)) {
      return { ok: false, error: 'unsafe project path', logs };
    }

    const isAr = isArabicReply({ language: context?.language, text: request });
    term(`[enterprise] creating reviewable foundation in ${projectPath}`);
    const foundationThinking = say(
      isAr,
      'أبني أساساً مؤسسياً قابلاً للمراجعة: المعمارية والعقود والخدمات والبنية التحتية والتحقق المحلي.',
      'Building a reviewable enterprise foundation: architecture, contracts, services, infrastructure, and local verification.',
    );
    try { broadcastThinkingDetail(sessionId, foundationThinking); } catch { /* UI optional */ }

    const files: Record<string, string> = {
      'README.md': `# Autonomous Engineering Platform — Enterprise Foundation\n\nThis repository is a **reviewable foundation**, not a claim of production deployment. It provides the architecture, contracts, secure service skeletons, infrastructure templates, CI policy, observability plan, and executable local contract tests required to implement the requested multi-agent software-engineering platform in controlled increments.\n\n## Delivery boundary\n\n- Generated and locally verified: service boundaries, API/event contracts, FastAPI control-plane skeleton, policy model, database migration outline, Docker/Kubernetes/Helm/Terraform templates, CI quality gates, tests, and implementation roadmap.\n- Intentionally not performed: credential provisioning, cloud changes, Kubernetes apply, Docker publish, external deployment, or a claim that millions-of-users SLOs have been proven.\n\nRead [docs/implementation-plan.md](docs/implementation-plan.md) before implementing a production increment.\n`,
      'docs/architecture.md': `# Architecture Decision Record\n\n## Chosen design\n\nThe platform uses bounded microservices with an event-driven workflow core. The **Control Plane** accepts natural-language engineering requests and persists workflows. The **Agent Orchestrator** assigns tasks to role-specific agents, records review/vote/rejection decisions, and emits immutable events. The **Execution Gateway** is the only service permitted to invoke repository, browser, terminal, or CI adapters.\n\n\`\`\`mermaid\nflowchart LR\n  UI[Next.js Operations Console] --> GW[API Gateway]\n  GW --> CP[Control Plane / FastAPI]\n  CP --> PG[(PostgreSQL)]\n  CP --> R[(Redis cache + locks)]\n  CP --> K[(Kafka event bus)]\n  K --> AO[Agent Orchestrator]\n  AO --> AG[Role agents: CEO, Product, Architect, Backend, Frontend, QA, Security, SRE]\n  AO --> EG[Execution Gateway]\n  EG --> REPO[Repository / CI / Browser / Terminal adapters]\n  K --> OBS[Telemetry + audit pipeline]\n  OBS --> PROM[Prometheus / Grafana / OTEL]\n\`\`\`\n\n## Why this over a single monolith\n\nA modular monolith is cheaper initially but isolates neither privileged execution nor independent scaling. Microservices add operational cost; therefore service extraction is limited to independently scalable or security-sensitive boundaries. Kafka provides durable workflow events; synchronous REST/GraphQL is reserved for command/query APIs. PostgreSQL is the source of truth, Redis supplies cache and distributed leases, and an object store retains immutable build artifacts.\n\n## Delivery safety\n\nDeployment intent is represented as a workflow state only. A human approval boundary is required before any external apply, rollout, credential access, or source-control push.\n`,
      'docs/api-contracts.md': `# API and Event Contracts\n\n## REST commands\n\n| Method | Path | Purpose |\n|---|---|---|\n| POST | /v1/workflows | Create an engineering workflow from natural language |\n| GET | /v1/workflows/{id} | Read workflow state, tasks, evidence, and approvals |\n| POST | /v1/workflows/{id}/approve | Approve a named guarded transition |\n| POST | /v1/tasks/{id}/review | Record an agent review, rejection, or vote |\n\n## Event envelope\n\n\`\`\`json\n{\n  "event_id": "uuid",\n  "event_type": "task.reviewed",\n  "workflow_id": "uuid",\n  "task_id": "uuid",\n  "occurred_at": "RFC-3339",\n  "producer": "agent-orchestrator",\n  "trace_id": "w3c-trace-id",\n  "payload": {}\n}\n\`\`\`\n\nConsumers must be idempotent by \`event_id\`; schema versions are additive and include a compatibility test before release.\n`,
      'docs/implementation-plan.md': `# Incremental Implementation Plan\n\n## Milestone 0 — architecture validation\n\nReview threat model, service boundaries, event schemas, data retention, ownership, SLOs, and cloud account boundaries. No deployment occurs in this milestone.\n\n## Milestone 1 — trusted workflow core\n\nImplement the control plane, PostgreSQL migrations, RBAC/JWT/OAuth2 integration, audit append log, workflow state machine, and Kafka outbox. Prove unit, integration, and migration rollback tests.\n\n## Milestone 2 — governed agent execution\n\nImplement the agent registry, task assignment, peer review/voting, policy engine, execution gateway, repository indexer, and sandboxed terminal/browser adapters. Every privileged operation has a typed approval record.\n\n## Milestone 3 — operator console\n\nImplement the Next.js dashboard, WebSocket live logs, task graph, architecture viewer, approvals, and incident screens. Validate accessibility, responsive layout, and real-time failure recovery.\n\n## Milestone 4 — operations and resilience\n\nAdd Helm releases, Terraform modules, GitHub Actions, OpenTelemetry, metrics, dashboards, alerts, load tests, chaos scenarios, blue/green and canary runbooks. Each production transition requires signed evidence and a human gate.\n`,
      'docs/security-model.md': `# Security Model\n\nThe default is deny. The control plane issues short-lived workload identities; agents never receive broad cloud, repository, or cluster credentials. RBAC controls tenant and workflow access, ABAC policy controls operation context, and an approval record is required for external side effects. Secrets are references to a managed secret store, never values in events, logs, or source.\n\nAudit records are append-only and include actor, delegated agent identity, workflow, command hash, approval, result hash, trace id, and timestamp. Transport uses TLS; persistent stores use encryption at rest supplied by the platform.\n`,
      'docs/operations.md': `# Operations and Observability\n\nEvery request carries a W3C trace context through gateway, control plane, events, agents, and execution adapters. Metrics include workflow latency, task failure/retry rate, approval latency, queue lag, execution duration, policy denials, and evidence completeness. Alerting creates an incident workflow; automatic rollback is limited to an already-approved rollout with an explicit rollback policy.\n`,
      'docs/agent-collaboration.md': `# Agent Collaboration and Governance\n\nEach workflow has accountable roles: CEO (objective and business constraints), Product Manager (requirements and acceptance criteria), System Architect (bounded contexts and ADRs), Backend Engineer (API and domain implementation), Frontend Engineer (operator UI), Database Agent (schema and migration review), DevOps and Kubernetes Agents (delivery templates and operational readiness), QA Lead (quality gates), Security Agent (threat model and policy), Performance Agent (SLO/load evidence), Documentation Agent (runbooks and ADRs), Monitoring Agent (telemetry and incident signals), and Bug Hunter (reproduction, regression test, and verified remediation).\n\nThe orchestrator emits an immutable task proposal. A task cannot enter privileged execution until the Architect, QA, and Security roles record a decision; unresolved disagreement escalates to the workflow owner. Votes are evidence, not an override of policy. The execution gateway writes command hashes, inputs, outputs, approvals, and trace IDs to the audit stream.\n`,
      'docs/testing-strategy.md': `# Testing Strategy\n\nQuality gates run in increasing cost order: static and contract checks on every change; unit tests for workflow state transitions and policy evaluation; integration tests with PostgreSQL, Redis, and Kafka test containers; API and WebSocket contract tests; end-to-end operator-console journeys; security scanning and dependency review; load and soak tests against defined SLOs; and controlled chaos experiments in a non-production environment.\n\nNo deployment transition is eligible until its required evidence is attached to the workflow. Failed checks create a reproducible bug task with a regression test before closure.\n`,
      'docs/deployment-strategy.md': `# Deployment Strategy\n\nBuild immutable, signed images after CI evidence is complete. Promote the same artifact through isolated development, staging, and production environments using Helm values and Terraform-managed infrastructure. Production changes require an approved change record, secrets resolved at runtime from a managed store, database migration compatibility evidence, and observability dashboards.\n\nUse canary or blue/green rollout only after an explicit human approval. Roll back automatically only when an approved rollback policy and health thresholds exist; otherwise create an incident and pause promotion. This foundation does not apply infrastructure or deploy externally.\n`,
      'docs/monitoring-strategy.md': `# Monitoring Strategy\n\nOpenTelemetry traces correlate workflow, agent, queue, and execution-gateway activity. Prometheus metrics track throughput, queue lag, task latency, tool error rate, policy denials, evidence completeness, and deployment health. Logs are structured, redacted, and tied to trace IDs. Grafana dashboards and alert rules use service ownership and SLO burn rate to create governed incident workflows.\n`,
      'services/control-plane/app/domain.py': `from datetime import datetime, timezone\nfrom typing import Callable\nfrom uuid import uuid4\n\ndef create_workflow_record(request: str, identifier: Callable[[], object] = uuid4, now: Callable[[], datetime] = lambda: datetime.now(timezone.utc)) -> dict:\n    if not isinstance(request, str) or len(request.strip()) < 10:\n        raise ValueError("request must contain at least 10 characters")\n    return {\n        "id": str(identifier()),\n        "request": request.strip(),\n        "state": "planned",\n        "created_at": now().isoformat(),\n        "approval_required": True,\n        "evidence": [],\n    }\n`,
      'services/control-plane/Dockerfile': 'FROM python:3.12-slim\nWORKDIR /app\nCOPY requirements.txt ./\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY app ./app\nEXPOSE 8080\nCMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]\n',
      'services/control-plane/.dockerignore': '__pycache__/\n*.py[cod]\n.env\n',
      'services/control-plane/app/main.py': `from fastapi import FastAPI, HTTPException\nfrom pydantic import BaseModel, Field\nfrom uuid import uuid4\nfrom .domain import create_workflow_record\n\napp = FastAPI(title="Autonomous Engineering Platform Control Plane", version="0.1.0")\nworkflows: dict[str, dict] = {}\n\nclass WorkflowRequest(BaseModel):\n    request: str = Field(min_length=10, max_length=20000)\n\n@app.get("/healthz")\nasync def healthz():\n    return {"status": "ok", "service": "control-plane", "external_effects": "disabled"}\n\n@app.post("/v1/workflows", status_code=201)\nasync def create_workflow(payload: WorkflowRequest):\n    workflow = create_workflow_record(payload.request, identifier=uuid4)\n    workflows[workflow["id"]] = workflow\n    return workflow\n\n@app.get("/v1/workflows/{workflow_id}")\nasync def get_workflow(workflow_id: str):\n    workflow = workflows.get(workflow_id)\n    if workflow is None:\n        raise HTTPException(status_code=404, detail="workflow not found")\n    return workflow\n`,
      'services/control-plane/requirements.txt': 'fastapi==0.115.6\nuvicorn[standard]==0.34.0\npydantic==2.10.5\n',
      /**
       * THIS TEST MUST NOT DEMAND WHAT THE FOUNDATION REFUSES TO INSTALL.
       *
       * The tool deliberately installs nothing — its own README says so — and
       * then verified itself by importing `app.main`, which imports FastAPI.
       * On any machine without FastAPI already present that import raises
       * ModuleNotFoundError, the check reports failed, and the whole tool
       * returns ok:false on a foundation it wrote perfectly. Measured here:
       * «control-plane-contract-tests=failed … No module named 'fastapi'»,
       * with every other check passing.
       *
       * A contract test that cannot run says SKIPPED. That is the same rule
       * the terminal audit lives by — «a check that cannot run says so and is
       * excluded from the score» — and it keeps the test real on a machine
       * that does have the dependency instead of deleting it for everyone.
       */
      'services/control-plane/tests/test_contract.py': `import sys\nimport unittest\nfrom pathlib import Path\n\nCONTROL_PLANE_ROOT = Path(__file__).resolve().parents[1]\nsys.path.insert(0, str(CONTROL_PLANE_ROOT))\n\n# The foundation installs nothing on your behalf. Where FastAPI is present\n# this contract is checked for real; where it is not, it is SKIPPED rather\n# than reported as a broken foundation.\ntry:\n    from app.main import healthz, create_workflow, WorkflowRequest\n    HAS_FASTAPI = True\nexcept ModuleNotFoundError as missing:\n    HAS_FASTAPI = False\n    MISSING = str(missing)\n\n@unittest.skipUnless(HAS_FASTAPI, "FastAPI is not installed — run pip install -r requirements.txt to check this contract")\nclass ControlPlaneContractTest(unittest.IsolatedAsyncioTestCase):\n    async def test_health_contract(self):\n        self.assertEqual((await healthz())["status"], "ok")\n\n    async def test_new_workflow_requires_approval(self):\n        result = await create_workflow(WorkflowRequest(request="Build a governed platform"))\n        self.assertEqual(result["state"], "planned")\n        self.assertTrue(result["approval_required"])\n\nif __name__ == "__main__":\n    unittest.main()\n`,
      'apps/operations-console/package.json': '{\n  "name": "operations-console",\n  "private": true,\n  "packageManager": "npm@10",\n  "scripts": { "dev": "next dev", "build": "next build", "test": "node --test" },\n  "dependencies": { "next": "16.3.0", "react": "19.2.8", "react-dom": "19.2.8" },\n  "devDependencies": { "typescript": "5.7.2", "@types/node": "22.13.10", "@types/react": "19.2.18", "@types/react-dom": "19.2.3" }\n}\n',
      'apps/operations-console/tsconfig.json': '{\n  "compilerOptions": { "target": "ES2022", "lib": ["dom", "dom.iterable", "es2022"], "strict": true, "noEmit": true, "jsx": "react-jsx", "module": "esnext", "moduleResolution": "bundler", "allowJs": false, "skipLibCheck": true, "incremental": true, "plugins": [{ "name": "next" }], "esModuleInterop": true, "resolveJsonModule": true, "isolatedModules": true },\n  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],\n  "exclude": ["node_modules"]\n}\n',
      'apps/operations-console/next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\nimport "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n\n// NOTE: This file should not be edited\n// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.\n',
      'apps/operations-console/app/layout.tsx': `import type { Metadata } from "next";\nimport "./globals.css";\n\nexport const metadata: Metadata = { title: "AEP Operations Console", description: "Governed multi-agent workflow operations" };\nexport default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`,
      'apps/operations-console/app/page.tsx': `"use client";\nimport { useMemo, useState } from "react";\n\ntype Workflow = { id: string; state: "planned" | "awaiting_approval" | "running"; evidence: number };\nconst seed: Workflow[] = [{ id: "wf-demo-001", state: "awaiting_approval", evidence: 3 }];\n\nexport default function OperationsConsole() {\n  const [workflows, setWorkflows] = useState(seed);\n  const pending = useMemo(() => workflows.filter((item) => item.state === "awaiting_approval").length, [workflows]);\n  const approve = (id: string) => setWorkflows((items) => items.map((item) => item.id === id ? { ...item, state: "running" } : item));\n  return <main><header><p>Autonomous Engineering Platform</p><h1>Governed Operations Console</h1><span>{pending} approval{pending === 1 ? "" : "s"} pending</span></header><section className="metrics"><article><b>Zero</b><small>external effects</small></article><article><b>{workflows.length}</b><small>tracked workflows</small></article><article><b>Required</b><small>human approval</small></article></section><section><h2>Workflow queue</h2>{workflows.map((workflow) => <article className="workflow" key={workflow.id}><div><strong>{workflow.id}</strong><p>State: {workflow.state} · Evidence: {workflow.evidence}</p></div>{workflow.state === "awaiting_approval" ? <button onClick={() => approve(workflow.id)}>Approve local transition</button> : <span>Execution governed</span>}</article>)}</section></main>;\n}\n`,
      'apps/operations-console/app/globals.css': ':root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui; background: #07111f; color: #e5eefb; } * { box-sizing: border-box; } body { margin: 0; } main { max-width: 960px; margin: auto; padding: 48px 24px; } header { display: grid; gap: 8px; border-bottom: 1px solid #25415f; padding-bottom: 24px; } h1, h2, p { margin: 0; } header p { color: #6ee7b7; font-weight: 700; } header span, small { color: #93a4b8; } .metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 28px 0; } article { background: #0e2035; border: 1px solid #25415f; border-radius: 12px; padding: 18px; } .metrics article { display: grid; gap: 6px; } b { font-size: 1.35rem; } .workflow { display: flex; justify-content: space-between; align-items: center; gap: 16px; } button { border: 0; border-radius: 8px; padding: 10px 14px; background: #34d399; color: #042f2e; font-weight: 800; cursor: pointer; } @media (max-width: 640px) { .metrics { grid-template-columns: 1fr; } .workflow { align-items: flex-start; flex-direction: column; } }\n',
      'apps/operations-console/README.md': '# Operations Console\n\nThis runnable Next.js foundation visualizes governed workflows and makes approval state explicit. It intentionally uses local demo data until the reviewed control-plane API and authenticated WebSocket gateway are connected.\n\n## Local build\n\nRun `npm install` then `npm run build` inside this directory. This project is generated without a lockfile or installed dependencies so the foundation does not perform network installation on the user\'s behalf.\n',
      'contracts/events/task-reviewed.v1.json': '{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "title": "task.reviewed.v1",\n  "type": "object",\n  "required": ["event_id", "event_type", "workflow_id", "task_id", "occurred_at", "payload"],\n  "properties": {\n    "event_id": {"type": "string", "format": "uuid"},\n    "event_type": {"const": "task.reviewed"},\n    "workflow_id": {"type": "string", "format": "uuid"},\n    "task_id": {"type": "string", "format": "uuid"},\n    "occurred_at": {"type": "string", "format": "date-time"},\n    "payload": {"type": "object", "required": ["decision"], "properties": {"decision": {"enum": ["approve", "reject", "abstain"]}}}\n  }\n}\n',
      'db/migrations/001_workflows.sql': 'CREATE TABLE workflows (\n  id UUID PRIMARY KEY,\n  tenant_id UUID NOT NULL,\n  request TEXT NOT NULL,\n  state TEXT NOT NULL CHECK (state IN (\'planned\', \'running\', \'awaiting_approval\', \'completed\', \'failed\')),\n  created_at TIMESTAMPTZ NOT NULL DEFAULT now()\n);\nCREATE INDEX workflows_tenant_created_idx ON workflows (tenant_id, created_at DESC);\n',
      'deploy/docker-compose.foundation.yml': 'services:\n  control-plane:\n    build: ../../services/control-plane\n    command: uvicorn app.main:app --host 0.0.0.0 --port 8080\n    ports: ["8080:8080"]\n    profiles: ["foundation"]\n  postgres:\n    image: postgres:16\n    environment:\n      POSTGRES_PASSWORD: change-me-through-a-secret-manager\n    profiles: ["foundation"]\n  redis:\n    image: redis:7\n    profiles: ["foundation"]\n',
      'deploy/helm/autonomous-engineering-platform/Chart.yaml': 'apiVersion: v2\nname: autonomous-engineering-platform\nversion: 0.1.0\nappVersion: "0.1.0"\ndescription: Governed multi-agent engineering platform foundation\n',
      'deploy/helm/autonomous-engineering-platform/values.yaml': 'image:\n  repository: registry.example.invalid/autonomous-engineering-platform\n  tag: review-required\nsecurity:\n  requireApprovalForExternalEffects: true\n',
      'infra/terraform/main.tf': 'terraform { required_version = ">= 1.8.0" }\n# Cloud resources are intentionally not instantiated by the foundation.\n# Add a reviewed provider module and remote state backend per environment.\n',
      '.github/workflows/ci.yml': 'name: foundation-ci\non: [pull_request, push]\njobs:\n  contracts:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: "3.11" }\n      - run: python -m compileall -q services/control-plane\n      - run: python -m unittest discover -s tests -v\n      - run: python -m unittest discover -s services/control-plane/tests -v\n      - run: python -c "import json; json.load(open(\'contracts/events/task-reviewed.v1.json\'))"\n      - name: build-operations-console\n        working-directory: apps/operations-console\n        run: npm install && npm run build\n',
      'tests/test_control_plane_domain.py': `import sys\nimport unittest\nfrom datetime import datetime, timezone\nfrom pathlib import Path\n\nROOT = Path(__file__).parents[1]\nsys.path.insert(0, str(ROOT / "services" / "control-plane"))\nfrom app.domain import create_workflow_record\n\nclass ControlPlaneDomainTest(unittest.TestCase):\n    def test_workflow_is_governed_and_deterministic(self):\n        fixed = datetime(2026, 1, 1, tzinfo=timezone.utc)\n        workflow = create_workflow_record("Build a governed engineering workflow", identifier=lambda: "wf-001", now=lambda: fixed)\n        self.assertEqual(workflow["id"], "wf-001")\n        self.assertEqual(workflow["state"], "planned")\n        self.assertTrue(workflow["approval_required"])\n        self.assertEqual(workflow["evidence"], [])\n\n    def test_short_request_is_rejected(self):\n        with self.assertRaises(ValueError):\n            create_workflow_record("short")\n\nif __name__ == "__main__":\n    unittest.main()\n`,
      'tests/test_foundation_contracts.py': `import json\nimport unittest\nfrom pathlib import Path\n\nROOT = Path(__file__).parents[1]\n\nclass FoundationContractsTest(unittest.TestCase):\n    def test_event_contract_is_valid_json(self):\n        event = json.loads((ROOT / "contracts/events/task-reviewed.v1.json").read_text())\n        self.assertEqual(event["title"], "task.reviewed.v1")\n\n    def test_production_boundary_is_documented(self):\n        readme = (ROOT / "README.md").read_text()\n        self.assertIn("not a claim of production deployment", readme)\n\n    def test_required_delivery_strategies_exist(self):\n        for document in ("testing-strategy.md", "deployment-strategy.md", "monitoring-strategy.md", "agent-collaboration.md"):\n            self.assertTrue((ROOT / "docs" / document).is_file(), document)\n\n    def test_runnable_foundation_components_exist(self):\n        for component in ("services/control-plane/app/domain.py", "services/control-plane/Dockerfile", "apps/operations-console/app/page.tsx", "apps/operations-console/tsconfig.json"):\n            self.assertTrue((ROOT / component).is_file(), component)\n\nif __name__ == "__main__":\n    unittest.main()\n`,
      '.gitignore': '__pycache__/\n*.py[cod]\n.env\n.env.*\n!.env.example\nnode_modules/\n.next/\ncoverage/\n',
      'foundation-manifest.json': JSON.stringify({
        schemaVersion: 1,
        kind: 'enterprise-platform-foundation',
        status: 'review-required',
        requestDigest: Buffer.from(request).toString('base64').slice(0, 96),
        generatedAt: new Date().toISOString(),
        milestones: ['architecture-validation', 'trusted-workflow-core', 'governed-agent-execution', 'operator-console', 'operations-and-resilience'],
        externalEffects: 'none',
      }, null, 2) + '\n',
    };

    let writtenFiles = 0;
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.resolve(projectPath, relativePath);
      if (!target.startsWith(`${projectPath}${path.sep}`)) return { ok: false, error: 'unsafe relative path', logs };
      writeText(target, content);
      stream(relativePath, content);
      writtenFiles += 1;
    }

    term(`[enterprise] wrote ${writtenFiles} architecture, contract, service, infrastructure, and test artifacts`);
    const python = process.platform === 'win32' ? 'python' : 'python3';
    term(`[enterprise] ${python} -m compileall -q services/control-plane`);
    const compile = await executionEngine.runArgv(python, ['-m', 'compileall', '-q', 'services/control-plane'], {
      cwd: projectPath, timeout: 30_000,
    });
    term(`[enterprise] ${python} -m unittest discover -s tests -v`);
    const tests = await executionEngine.runArgv(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], {
      cwd: projectPath, timeout: 30_000,
    });
    term(`[enterprise] ${python} -m unittest discover -s services/control-plane/tests -v`);
    const serviceTests = await executionEngine.runArgv(python, ['-m', 'unittest', 'discover', '-s', 'services/control-plane/tests', '-v'], {
      cwd: projectPath, timeout: 30_000,
    });
    const jsonPath = path.join(projectPath, 'contracts/events/task-reviewed.v1.json');
    let jsonValid = false;
    try { JSON.parse(fs.readFileSync(jsonPath, 'utf8')); jsonValid = true; } catch { jsonValid = false; }
    const verified = compile.ok === true && tests.ok === true && serviceTests.ok === true && jsonValid;
    term(`[enterprise] verification: python-contract-syntax=${compile.ok ? 'passed' : 'failed'}; foundation-contract-tests=${tests.ok ? 'passed' : 'failed'}; control-plane-contract-tests=${serviceTests.ok ? 'passed' : 'failed'}; event-schema-json=${jsonValid ? 'passed' : 'failed'}`);
    term('[enterprise] external deployment intentionally not attempted; human review and approvals are required.');

    return {
      ok: verified,
      error: verified ? undefined : `foundation verification failed: ${compile.error || tests.error || serviceTests.error || compile.output || tests.output || serviceTests.output || 'contract validation failed'}`,
      output: {
        projectPath,
        writtenFiles,
        verified,
        verification: verified ? 'Python control-plane syntax, governed workflow-domain tests, control-plane API contract tests, and JSON event contract verified locally' : 'Local verification failed',
        deliveryScope: 'reviewable foundation; no external deployment or production-scale claim',
      },
      logs,
    };
  }
}
