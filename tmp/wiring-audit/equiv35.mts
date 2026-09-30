// MUSE wiring-audit checkpoint 35: dormant<->lead EQUIVALENCE probes.
// Pairs: business_logic->business_logic_parser, cost_estimator->
// cloud_cost_estimator, self_confidence->self_confidence_evaluator,
// chaos_testing->chaos_test_plan, security_scan_repo->secrets_scan_repo,
// terraform_ops->terraform_manager (+ weak triple for the record),
// shell_status->shell_check_status.
// Part A: static declaration capture (Muse live registry) + main-tree
//   parity by read-only file grep (both trees must agree or drift is noted).
// Part B: fixture-contained canonical-path legs (created + removed here).
// EMBARGO: no terraform action legs (binary/side-effect risk); no kubectl
//   beyond read-only `get pods`; no swarm beyond list_services; no git leg
//   touching a repo (only `--version` + {}); no model legs beyond one
//   minimal input per Elite lead with a 60s timeout; no live network.
// Filed JSON carries NO timestamps/labels so A/B bytes compare directly.
// Run from api/: .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\equiv35.mts ..\tmp\wiring-audit\fx-equiv35\equiv35_runA.json
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const MAIN_SRC = 'D:\\Joe\\xelitesolutions\\api\\src';
const imp = (p: string) => import(pathToFileURL(p).href);

const CALL_TIMEOUT_MS = 25000;
const MODEL_TIMEOUT_MS = 60000;

const PAIRS: Array<{ dormant: string; leads: string[] }> = [
  { dormant: 'business_logic', leads: ['business_logic_parser'] },
  { dormant: 'cost_estimator', leads: ['cloud_cost_estimator'] },
  { dormant: 'self_confidence', leads: ['self_confidence_evaluator'] },
  { dormant: 'chaos_testing', leads: ['chaos_test_plan'] },
  { dormant: 'security_scan_repo', leads: ['secrets_scan_repo'] },
  { dormant: 'terraform_ops', leads: ['terraform_manager', 'docker_swarm_ops', 'git_ops', 'kubernetes_ops'] },
  { dormant: 'shell_status', leads: ['shell_check_status'] },
];

const LEAD_FILE: Record<string, string> = {
  business_logic_parser: 'EliteTools.ts',
  cloud_cost_estimator: 'EliteTools.ts',
  self_confidence_evaluator: 'EliteTools.ts',
  chaos_test_plan: 'EliteTools.ts',
  secrets_scan_repo: 'QualityTools.ts',
  terraform_manager: 'InfrastructureTools.ts',
  docker_swarm_ops: 'InfrastructureTools.ts',
  git_ops: 'GitTools.ts',
  kubernetes_ops: 'InfrastructureTools.ts',
  shell_check_status: 'SystemTools.ts',
};

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

function scrub(s: string): string {
  return String(s)
    .replace(/Bearer [A-Za-z0-9\-._~+/=]+/g, 'Bearer [REDACTED]')
    .replace(/(password|passwd|secret|token|apiKey|api_key|authorization)["']?\s*[:=]\s*["']?[^"',}\s\\]+/gi, '$1=[REDACTED]');
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

async function main() {
  const outPath = process.argv[2];
  if (!outPath) { console.error('EQUIV35_ABORT missing output path argv'); process.exit(1); }

  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) { console.error(`EQUIV35_ABORT registered=${tools.length} expected=163`); process.exit(1); }
  const byName = new Map<string, any>(tools.map(t => [t.name, t]));

  const picker: any = await imp(path.join(SRC, 'core', 'llm', 'tool-picker.ts'));
  const priorityNames: string[] = Array.isArray(picker.PRIORITY_TOOL_NAMES) ? picker.PRIORITY_TOOL_NAMES.map(String) : [];
  const priority = new Set(priorityNames);

  // ---- Part A: static ----
  const decls: Record<string, any> = {};
  for (const pair of PAIRS) {
    for (const lead of pair.leads) {
      const def = byName.get(lead);
      if (!def) { decls[lead] = { registered: false }; continue; }
      const schema = def.inputSchema || {};
      decls[lead] = {
        registered: true,
        hasExecute: typeof def.execute === 'function',
        description: String(def.description || '').slice(0, 120),
        required: Array.isArray(schema.required) ? schema.required.slice().sort() : null,
        props: schema.properties && typeof schema.properties === 'object' ? Object.keys(schema.properties).sort() : null,
        tags: Array.isArray(def.tags) ? def.tags.map(String).sort() : null,
      };
    }
  }
  const dormantStatus: Record<string, any> = {};
  for (const pair of PAIRS) {
    dormantStatus[pair.dormant] = { registered: byName.has(pair.dormant), inPriorityList: priority.has(pair.dormant) };
  }

  // main-tree parity (read-only grep): name literal + required-array presence
  const mainReg = fs.readFileSync(path.join(MAIN_SRC, 'modules', 'tools', 'registry.ts'), 'utf-8');
  const parity: Record<string, any> = {};
  for (const pair of PAIRS) {
    for (const lead of pair.leads) {
      const file = LEAD_FILE[lead];
      let museHas = false; let mainHas = false; let museReq: string | null = null; let mainReq: string | null = null;
      let mainRegistered = false;
      try {
        const museSrc = fs.readFileSync(path.join(SRC, 'modules', 'tools', 'definitions', file), 'utf-8');
        museHas = museSrc.includes(`name = '${lead}'`);
        const m1 = museSrc.match(new RegExp(`name = '${lead}'[\\s\\S]{0,1200}?required: \\[([^\\]]*)\\]`));
        museReq = m1 ? m1[1].replace(/\s+/g, '') : null;
      } catch { museHas = false; }
      try {
        const mainSrc = fs.readFileSync(path.join(MAIN_SRC, 'modules', 'tools', 'definitions', file), 'utf-8');
        mainHas = mainSrc.includes(`name = '${lead}'`);
        const m2 = mainSrc.match(new RegExp(`name = '${lead}'[\\s\\S]{0,1200}?required: \\[([^\\]]*)\\]`));
        mainReq = m2 ? m2[1].replace(/\s+/g, '') : null;
      } catch { mainHas = false; }
      mainRegistered = mainReg.includes(lead);
      parity[lead] = {
        file, museDeclared: museHas, mainDeclared: mainHas,
        requiredMatch: museReq !== null && museReq === mainReq,
        museRequired: museReq, mainRequired: mainReq, mainRegistryMentions: mainRegistered,
      };
    }
  }

  // doc-demand lines (static, both trees)
  const docDemand: Record<string, any> = {};
  for (const [tag, rel] of [['muse', path.join(SRC, 'core', 'knowledge', 'production_sync.md')], ['main', 'D:\\Joe\\xelitesolutions\\api\\src\\core\\knowledge\\production_sync.md']] as Array<[string, string]>) {
    try {
      const txt = fs.readFileSync(rel, 'utf-8').split(/\r?\n/);
      docDemand[tag] = { lines1719: txt.slice(16, 19).map(s => s.slice(0, 160)) };
    } catch (e: any) { docDemand[tag] = { error: String(e?.message || e).slice(0, 120) }; }
  }

  // ---- Part B: live legs ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };

  const FX = path.join(HERE, 'fx-equiv35', 'fx');
  fs.mkdirSync(FX, { recursive: true });
  fs.writeFileSync(path.join(FX, 'clean.txt'), 'hello world\nnothing here\n');
  fs.writeFileSync(path.join(FX, 'seeded.txt'), 'note: password = "FAKESEED-not-real-12345"\n');

  const cases: Record<string, any> = {};
  const run = async (id: string, tool: string, input: any, timeoutMs: number = CALL_TIMEOUT_MS) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace', () => executeTool(tool, input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { cases[id] = { timedOut: true }; return; }
      const r: any = raced.value;
      const o = r?.output;
      cases[id] = {
        timedOut: false, ok: !!r?.ok,
        errorHead: r?.error ? scrub(String(r.error)).slice(0, 160) : null,
        outputShape: shape(o),
        outputHead: typeof o === 'string' ? scrub(o).slice(0, 120) : null,
        scannedFiles: o && typeof o === 'object' && typeof o.scannedFiles === 'number' ? o.scannedFiles : null,
        findings: o && typeof o === 'object' && Array.isArray(o.findings) ? o.findings.length : null,
      };
    } catch (e: any) {
      cases[id] = { threw: scrub(String(e?.message || e)).slice(0, 160) };
    }
  };

  // dormant negatives (must stay unknown_tool)
  for (const pair of PAIRS) {
    await run(`dormant.${pair.dormant}`, pair.dormant, {});
  }
  // lead {} legs
  for (const pair of PAIRS) {
    for (const lead of pair.leads) {
      await run(`lead.${lead}.empty`, lead, {}, lead === 'business_logic_parser' || lead === 'chaos_test_plan' ? MODEL_TIMEOUT_MS : CALL_TIMEOUT_MS);
    }
  }
  // minimal-input legs (precedent-shaped, embargo-respecting)
  await run('lead.business_logic_parser.min', 'business_logic_parser', { requirements: 'orders over $50 ship free' }, MODEL_TIMEOUT_MS);
  await run('lead.cloud_cost_estimator.min', 'cloud_cost_estimator', { resources: ['EC2 t3.small'] }, MODEL_TIMEOUT_MS);
  await run('lead.self_confidence_evaluator.min', 'self_confidence_evaluator', { content: 'the sky is green' }, MODEL_TIMEOUT_MS);
  await run('lead.chaos_test_plan.min', 'chaos_test_plan', { architecture: 'single API plus sqlite' }, MODEL_TIMEOUT_MS);
  await run('lead.secrets_scan_repo.min', 'secrets_scan_repo', { path: FX }, CALL_TIMEOUT_MS);
  await run('lead.kubernetes_ops.readonly', 'kubernetes_ops', { command: 'get pods' }, CALL_TIMEOUT_MS);
  await run('lead.docker_swarm_ops.readonly', 'docker_swarm_ops', { action: 'list_services' }, CALL_TIMEOUT_MS);
  await run('lead.git_ops.version', 'git_ops', { operation: '--version' }, CALL_TIMEOUT_MS);
  await run('lead.shell_check_status.min', 'shell_check_status', { id: 'wiring-35-nope' }, CALL_TIMEOUT_MS);
  // NOTE: terraform_manager action legs EMBARGOED (see header); {} guard leg above suffices.

  const fxBefore = fs.readdirSync(FX).sort();
  fs.rmSync(FX, { recursive: true, force: true });
  const fxRemoved = !fs.existsSync(FX);

  const out = {
    registeredCount: tools.length, priorityCount: priorityNames.length,
    dormantStatus, decls, parity, docDemand, cases,
    fixtures: { before: fxBefore, removed: fxRemoved },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  console.log(`wrote ${outPath}`);
}

main().catch(e => { console.error('EQUIV35_FAILED', e); process.exit(1); });
