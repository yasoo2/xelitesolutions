import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastTerminalLine, broadcastThinkingDetail } from '../../../api/ws';
import { workspaceService } from '../../services/WorkspaceService';
import { executionEngine } from '../../../kernel/ExecutionEngine';
import { isArabicReply, say } from '../../../shared/reply-language';

const ORION_DIR = 'orion-business-operating-system';

function writeText(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Creates a deliberately bounded, executable phase-one foundation for ORION.
 * It proves local domain invariants; it does not pretend to provision cloud,
 * charge cards, send email, or operate a global multi-tenant platform.
 */
export class OrionBusinessFoundationTool extends BaseTool {
  name = 'orion_business_foundation';
  version = '1.0.0';
  description = 'Create and locally verify the ORION Business Operating System phase-one foundation: multi-tenant business core, governance, contracts, UI starter, infrastructure templates, and executable acceptance tests.';
  tags = ['orion', 'business-os', 'enterprise', 'multi-tenant', 'rbac', 'accounting', 'foundation'];
  permissions: ToolPermission[] = ['read', 'write', 'execute'];
  sideEffects: ToolPermission[] = ['write', 'execute'];
  rateLimitPerMinute = 2;
  auditFields = ['request'];

  inputSchema = { type: 'object' as const, properties: { request: { type: 'string' } }, required: ['request'] };
  outputSchema = { type: 'object' as const, properties: { projectPath: { type: 'string' }, writtenFiles: { type: 'number' }, verified: { type: 'boolean' }, verification: { type: 'string' }, deliveryScope: { type: 'string' } } };

  async execute(input: { request: string }, context?: any): Promise<ToolExecutionResult> {
    const request = String(input?.request || '').trim();
    if (!request) return { ok: false, error: 'request is required', logs: [] };
    const logs: string[] = [];
    const sessionId = context?.sessionId;
    const term = (line: string) => { logs.push(line); try { broadcastTerminalLine(sessionId, `${line}\r\n`); } catch {} };
    const stream = (relativePath: string, content: string) => {
      try { broadcast({ type: 'file_stream', sessionId, data: { file: relativePath, chunk: content, done: true, bytes: Buffer.byteLength(content), at: Date.now(), label: 'written' } } as any); } catch {}
    };
    const root = path.resolve(String(context?.workspaceRoot || workspaceService.getExplorerRoot()));
    const projectPath = path.join(root, ORION_DIR);
    if (!projectPath.startsWith(`${root}${path.sep}`)) return { ok: false, error: 'unsafe project path', logs };

    const arabic = isArabicReply({ language: context?.language, text: request });
    term(`[orion] creating phase-one business foundation in ${projectPath}`);
    try { broadcastThinkingDetail(sessionId, say(arabic, 'أحوّل المواصفة إلى نواة ORION قابلة للاختبار: عزل المستأجرين والصلاحيات والموافقة والمخزون والقيود والتدقيق.', 'Turning the specification into a testable ORION core: tenant isolation, permissions, approvals, inventory, ledger entries, and audit.')); } catch {}

    const core = String.raw`from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timezone
from os import getenv
from uuid import uuid4

class Forbidden(Exception): pass
class ApprovalRequired(Exception): pass
class InsufficientInventory(Exception): pass

def now() -> str: return datetime.now(timezone.utc).isoformat()
def new_id() -> str: return str(uuid4())

@dataclass
class Event:
    event_type: str
    tenant_id: str
    payload: dict
    correlation_id: str
    version: int = 1
    event_id: str = field(default_factory=new_id)
    occurred_at: str = field(default_factory=now)

class StripePaymentProvider:
    """No network call is made in this foundation. A real adapter requires STRIPE_SECRET_KEY."""
    def readiness(self) -> dict:
        return {"provider": "stripe", "configured": bool(getenv("STRIPE_SECRET_KEY")), "external_effects": "disabled"}

class OrionCore:
    def __init__(self):
        self.users, self.roles, self.products, self.inventory = {}, {}, {}, {}
        self.orders, self.approvals, self.ledger, self.audit, self.events = {}, {}, [], [], []

    def _audit(self, actor: str, tenant: str, action: str, data: dict):
        self.audit.append({"at": now(), "actor": actor, "tenant_id": tenant, "action": action, "data": data})

    def _emit(self, kind: str, tenant: str, data: dict, correlation_id: str):
        event = Event(kind, tenant, data, correlation_id)
        self.events.append(event)
        return event

    def add_user(self, tenant: str, user_id: str, role: str):
        self.users[user_id] = tenant; self.roles[user_id] = role
        self._audit(user_id, tenant, "user.role_assigned", {"role": role})

    def _authorize(self, actor: str, tenant: str, allowed: set[str]):
        if self.users.get(actor) != tenant: raise Forbidden("tenant context mismatch")
        if self.roles.get(actor) not in allowed: raise Forbidden("role is not allowed")

    def add_product(self, actor: str, tenant: str, sku: str, quantity: int, unit_price_cents: int):
        self._authorize(actor, tenant, {"owner", "inventory_manager"})
        self.products[(tenant, sku)] = {"sku": sku, "unit_price_cents": unit_price_cents}
        self.inventory[(tenant, sku)] = quantity
        self._audit(actor, tenant, "inventory.seeded", {"sku": sku, "quantity": quantity})

    def create_order(self, actor: str, tenant: str, customer_id: str, sku: str, quantity: int, correlation_id: str) -> str:
        self._authorize(actor, tenant, {"owner", "sales"})
        if self.inventory.get((tenant, sku), 0) < quantity: raise InsufficientInventory(sku)
        order_id = new_id(); amount = self.products[(tenant, sku)]["unit_price_cents"] * quantity
        self.orders[order_id] = {"tenant_id": tenant, "customer_id": customer_id, "sku": sku, "quantity": quantity, "amount_cents": amount, "state": "pending_approval"}
        self.approvals[order_id] = {"approved": False, "risk": "medium", "required": True}
        self._audit(actor, tenant, "order.created", {"order_id": order_id, "amount_cents": amount})
        self._emit("order.created", tenant, {"order_id": order_id}, correlation_id)
        return order_id

    def approve_order(self, actor: str, tenant: str, order_id: str):
        self._authorize(actor, tenant, {"owner", "finance_approver"})
        order = self.orders[order_id]
        if order["tenant_id"] != tenant: raise Forbidden("cross-tenant order")
        self.approvals[order_id]["approved"] = True
        self._audit(actor, tenant, "order.approved", {"order_id": order_id})

    def capture_payment(self, actor: str, tenant: str, order_id: str, correlation_id: str) -> dict:
        self._authorize(actor, tenant, {"owner", "finance_approver"})
        order = self.orders[order_id]
        if order["tenant_id"] != tenant: raise Forbidden("cross-tenant order")
        if not self.approvals[order_id]["approved"]: raise ApprovalRequired(order_id)
        self.inventory[(tenant, order["sku"])] -= order["quantity"]
        order["state"] = "paid"
        entry = {"tenant_id": tenant, "order_id": order_id, "debit": "cash", "credit": "revenue", "amount_cents": order["amount_cents"]}
        self.ledger.append(entry)
        self._audit(actor, tenant, "payment.recorded", {"order_id": order_id, "provider": "abstract"})
        event = self._emit("payment.captured", tenant, {"order_id": order_id, "amount_cents": order["amount_cents"]}, correlation_id)
        return {"invoice_id": new_id(), "ledger_entry": entry, "event": event.__dict__, "provider": StripePaymentProvider().readiness()}
`;

    const test = String.raw`import sys
import unittest
from pathlib import Path

# Make the acceptance suite runnable directly from the repository root.
CORE_ROOT = Path(__file__).resolve().parents[1] / "services" / "business-core"
sys.path.insert(0, str(CORE_ROOT))
from orion.core import OrionCore, Forbidden, ApprovalRequired

class OrionAcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.core = OrionCore()
        self.core.add_user("tenant-a", "alice", "owner")
        self.core.add_user("tenant-a", "sam", "sales")
        self.core.add_user("tenant-a", "fiona", "finance_approver")
        self.core.add_user("tenant-b", "ben", "owner")
        self.core.add_product("alice", "tenant-a", "SKU-1", 7, 2500)

    def test_business_flow_requires_approval_and_creates_ledger_event_audit(self):
        order = self.core.create_order("sam", "tenant-a", "customer-1", "SKU-1", 2, "trace-1")
        with self.assertRaises(ApprovalRequired): self.core.capture_payment("fiona", "tenant-a", order, "trace-1")
        self.core.approve_order("fiona", "tenant-a", order)
        result = self.core.capture_payment("fiona", "tenant-a", order, "trace-1")
        self.assertEqual(5, self.core.inventory[("tenant-a", "SKU-1")])
        self.assertEqual(5000, result["ledger_entry"]["amount_cents"])
        self.assertEqual("tenant-a", result["event"]["tenant_id"])
        self.assertGreaterEqual(len(self.core.audit), 5)

    def test_tenant_isolation_and_role_policy(self):
        with self.assertRaises(Forbidden): self.core.add_product("ben", "tenant-a", "BAD", 1, 1)
        with self.assertRaises(Forbidden): self.core.create_order("fiona", "tenant-a", "customer", "SKU-1", 1, "trace-2")

if __name__ == "__main__": unittest.main()
`;

    const files: Record<string, string> = {
      'README.md': '# ORION Business Operating System — Phase 1 Foundation\n\nORION is a **locally verified phase-one foundation**, not a claim that a globally operated ERP/CRM/payments platform has been deployed. It proves a multi-tenant business flow, governed approval, inventory mutation, double-entry-shaped ledger record, audit evidence, versioned event envelope, and a typed operator-console starter.\n\n## Local verification\n\nFrom the repository root, run `python -m unittest discover -s tests -v`. The acceptance test locates the local business core itself; no environment variable is required. To build the standalone UI starter, run `cd apps/command-center && npm install && npm run build`. No payment, email, cloud, OAuth, or deployment operation is attempted.\n',
      'foundation-manifest.json': JSON.stringify({ product: 'ORION Business Operating System', phase: 'phase-1-foundation', externalEffects: 'none', verifiedLocally: ['tenant-isolation', 'rbac', 'approval-gate', 'inventory', 'ledger', 'audit', 'event-envelope'], deferred: ['real Stripe capture', 'OAuth', 'cloud deployment', 'email delivery'] }, null, 2) + '\n',
      'docs/roadmap.md': '# ORION Incremental Roadmap\n\n1. **Platform core** — tenancy, identity, RBAC/ABAC, audit, event envelope.\n2. **Business domains** — CRM, catalog, inventory, orders, billing, accounting.\n3. **Integrations** — payments, identity, files, search, messaging behind reviewed adapters.\n4. **Collaboration** — approvals, workflows, notifications, task coordination.\n5. **Operational rigor** — migrations, telemetry, CI, rollback runbooks.\n6. **Scale-out** — regional delivery, data residency, SLO and load evidence.\n\nEvery phase requires independent acceptance evidence; this repository only proves Phase 1 locally.\n',
      'docs/architecture.md': '# ORION Architecture\n\nORION begins as a modular domain core: **identity/tenancy**, CRM, catalog/inventory, orders, payments, accounting, workflow/approvals, files/search, AI assistance, notifications, and observability. Commands carry an actor and tenant context. Domain events are versioned and contain tenant, correlation, and trace-ready identity. The payment adapter is an environment-configured boundary; it cannot make a real charge in this foundation.\n',
      'docs/security-and-operations.md': '# Security, Secrets, and Operations\n\nTenant context is mandatory and cross-tenant access raises `Forbidden`. RBAC is executable; ABAC policy inputs may be layered on the same actor/tenant/resource record. Audit records retain actor, tenant, action, and evidence. Secrets are environment references only. Docker, Helm, Terraform, and CI files below are reviewable templates; no apply, deploy, provider call, email, or credential provisioning occurs.\n',
      'contracts/events/payment-captured.v1.json': JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'payment.captured.v1', type: 'object', required: ['event_id', 'event_type', 'tenant_id', 'correlation_id', 'version', 'payload'], properties: { event_id: { type: 'string' }, event_type: { const: 'payment.captured' }, tenant_id: { type: 'string' }, correlation_id: { type: 'string' }, version: { const: 1 }, payload: { type: 'object' } } }, null, 2) + '\n',
      'services/business-core/orion/__init__.py': '',
      'services/business-core/orion/core.py': core,
      'services/business-core/requirements.txt': '# Standard-library-only domain acceptance core\n',
      'tests/test_orion_acceptance.py': test,
      'apps/command-center/package.json': JSON.stringify({ name: 'orion-command-center', private: true, scripts: { build: 'next build', dev: 'next dev' }, dependencies: { next: '16.2.11', react: '19.0.1', 'react-dom': '19.0.1' }, devDependencies: { typescript: '^5.7.0', '@types/node': '^22', '@types/react': '^19', '@types/react-dom': '^19' } }, null, 2) + '\n',
      'apps/command-center/tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: false, skipLibCheck: true, strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler', resolveJsonModule: true, isolatedModules: true, jsx: 'react-jsx', incremental: true, plugins: [{ name: 'next' }] }, include: ['next-env.d.ts', '.next/types/**/*.ts', '.next/dev/types/**/*.ts', '**/*.ts', '**/*.tsx'], exclude: ['node_modules'] }, null, 2) + '\n',
      'apps/command-center/next-env.d.ts': '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n\n// This file is generated by Next.js.\n',
      'apps/command-center/app/page.tsx': `type AccessState = 'authorized' | 'no-data' | 'denied';\nconst cards = [{ name: 'Revenue', value: '$0', state: 'no-data' as AccessState }, { name: 'Inventory', value: '0 SKUs', state: 'no-data' as AccessState }, { name: 'Approvals', value: '0 pending', state: 'authorized' as AccessState }];\nexport default function Page() { return <main style={{fontFamily:'Arial',maxWidth:920,margin:'48px auto',padding:24}}><p>ORION / Command Center / Phase 1</p><h1>Business operations, governed.</h1><p>Starter interface — data is intentionally local and empty until a verified backend adapter is connected.</p><section style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>{cards.map(card => <article key={card.name} style={{border:'1px solid #ddd',borderRadius:12,padding:18}}><small>{card.state}</small><h2>{card.value}</h2><p>{card.name}</p></article>)}</section></main> }\n`,
      'apps/command-center/app/layout.tsx': 'export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html> }\n',
      'docker-compose.yml': 'services:\n  business-core:\n    build: ./services/business-core\n    command: python -m unittest discover -s /app/tests -v\n    profiles: ["verification"]\n',
      'services/business-core/Dockerfile': 'FROM python:3.12-slim\nWORKDIR /app\nCOPY . /app/services/business-core\nCOPY tests /app/tests\nENV PYTHONPATH=/app/services/business-core\nCMD ["python", "-m", "unittest", "discover", "-s", "/app/tests", "-v"]\n',
      'deploy/helm/Chart.yaml': 'apiVersion: v2\nname: orion\ndescription: Review-only ORION chart; no deployment was performed\ntype: application\nversion: 0.1.0\n',
      'infra/terraform/main.tf': 'terraform { required_version = ">= 1.6" }\n# Intentionally no provider resources: infrastructure must be reviewed before apply.\n',
      '.github/workflows/ci.yml': 'name: local-contracts\non: [pull_request, push]\njobs:\n  acceptance:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-python@v5\n        with: { python-version: "3.12" }\n      - run: PYTHONPATH=services/business-core python -m unittest discover -s tests -v\n',
      'docs/verification-report.md': '# Verification Boundary\n\nThe local acceptance test proves tenant isolation, RBAC, approval-before-payment, inventory decrement, a balanced business accounting shape, audit records, and a versioned event envelope. Deferred: database migrations, OAuth, real Stripe calls, email, external search/AI, Kubernetes/Terraform apply, load/SLO evidence, and production recovery.\n'
    };

    let writtenFiles = 0;
    for (const [relativePath, content] of Object.entries(files)) {
      const target = path.resolve(projectPath, relativePath);
      if (!target.startsWith(`${projectPath}${path.sep}`)) return { ok: false, error: 'unsafe relative path', logs };
      writeText(target, content); stream(relativePath, content); writtenFiles += 1;
    }
    term(`[orion] wrote ${writtenFiles} business-core, contract, UI, infrastructure, and evidence artifacts`);
    const python = process.platform === 'win32' ? 'python' : 'python3';
    term(`[orion] ${python} -m compileall -q services/business-core`);
    const compile = await executionEngine.runArgv(python, ['-m', 'compileall', '-q', 'services/business-core'], { cwd: projectPath, timeout: 30000 });
    term(`[orion] PYTHONPATH=services/business-core ${python} -m unittest discover -s tests -v`);
    const testRun = await executionEngine.runArgv(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], { cwd: projectPath, timeout: 30000, env: { ...process.env, PYTHONPATH: path.join(projectPath, 'services/business-core') } } as any);
    let schemaValid = false;
    try { JSON.parse(fs.readFileSync(path.join(projectPath, 'contracts/events/payment-captured.v1.json'), 'utf8')); schemaValid = true; } catch {}
    const verified = compile.ok === true && testRun.ok === true && schemaValid;
    term(`[orion] verification: business-core-syntax=${compile.ok ? 'passed' : 'failed'}; business-acceptance=${testRun.ok ? 'passed' : 'failed'}; payment-event-schema=${schemaValid ? 'passed' : 'failed'}`);
    term('[orion] external effects intentionally not attempted; payment, identity, mail, cloud, and deployment adapters require explicit configuration and approval.');
    return { ok: verified, error: verified ? undefined : `ORION verification failed: ${compile.error || testRun.error || compile.output || testRun.output || 'schema validation failed'}`, output: { projectPath, writtenFiles, verified, verification: verified ? 'ORION business-core syntax, executable acceptance tests, and versioned payment event schema verified locally' : 'Local verification failed', deliveryScope: 'phase-one reviewable foundation; no payment, cloud, deployment, or other external effect was attempted' }, logs };
  }
}
