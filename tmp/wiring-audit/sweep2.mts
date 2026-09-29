// MUSE wiring-audit sweep batch 2 (checkpoint 6).
// Live empty-input honesty for the 19 callable no-required tools through the
// CANONICAL path (executionFirewall.runInContext -> ToolService.executeTool).
// SAFETY: all 25 no-required execute() bodies were read first (see
// MUSE-WIRING-DISCOVERY-006.md). The 6 excluded names are NOT safe for {}:
//   memorize_codebase (unconditional vectorDb.clear, both registry + inline),
//   deploy_pages (cross-workspace token fallback + gh-pages push on success),
//   project_run (starts servers/binds ports from workspace root default),
//   browser_launch (opens a real browser to google.com by default),
//   dead_code_detector (npx knip in Joe's own repo root, uncontained),
//   dependency_audit (npm audit in Joe's own repo root + registry network).
// analyze_codebase IS included: its routeToModel call is the honesty question
// (offline/timeout behavior), bounded by CALL_TIMEOUT_MS like every other call.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep2.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const LIVE19 = [
  'delete_file', 'browser_compare', 'browser_consent', 'browser_ui_fix',
  'project_undo', 'project_repair', 'image_studio', 'repo_diff_summary',
  'engineering_discovery', 'project_stop', 'form_inbox', 'orders_read',
  'security_scanner', 'joe_engineering_report', 'ls', 'analyze_project',
  'search_text', 'project_detect', 'analyze_codebase',
];
const CALL_TIMEOUT_MS = 20000;

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 8).join(',')}}`;
  return typeof v;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

async function main() {
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const tools: any[] = registry.tools as any[];
  if (tools.length !== 163) {
    console.error(`SWEEP2_ABORT registered=${tools.length} expected=163`);
    process.exit(1);
  }
  const names = new Set(tools.map(t => String(t.name)));
  for (const n of LIVE19) {
    if (!names.has(n)) { console.error(`SWEEP2_ABORT missing tool ${n}`); process.exit(1); }
  }

  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const live: Record<string, any> = {};
  for (const n of LIVE19) {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool(n, {}, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        CALL_TIMEOUT_MS);
      if (raced.timedOut) { live[n] = { timeoutMs: CALL_TIMEOUT_MS }; continue; }
      const r: any = (raced as any).value;
      const o = r?.output;
      live[n] = {
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 200) : null,
        outputShape: shape(o),
        outputPreview: typeof o === 'string' ? o.slice(0, 160) : (o && typeof o === 'object' && typeof (o as any).message === 'string' ? String((o as any).message).slice(0, 160) : null),
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[n] = { threw: String(e?.message || e).slice(0, 200) };
    }
  }

  const out = { generatedAt: new Date().toISOString(), liveEmptyInputBatch2: live };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'sweep2.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ liveEmptyInputBatch2: live }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('SWEEP2_FAILED', e); process.exit(1); });
