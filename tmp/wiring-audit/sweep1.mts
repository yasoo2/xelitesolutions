// MUSE wiring-audit sweep batch 1 (checkpoint 5).
// Part A (static, all 163): declaration census — permissions/sideEffects/
// rateLimit/required as the RUNTIME sees them (post-enforceContract), plus
// the exact boot-defaulted name lists from contractDefaults.
// Part B (live, 9 tools): empty-input honesty through the CANONICAL path
// (executionFirewall.runInContext -> ToolService.executeTool).
// SAFETY: all 9 execute() bodies were read before this live call; each
// either validates its inputs or is side-effect-free on {} (rss_fetch('')
// fails fast locally; task_lifecycle broadcast has no listeners in-probe).
// memorize_codebase is DELIBERATELY excluded (unconditional vectorDb.clear).
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\sweep1.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

const LIVE9 = [
  'cloud_cost_estimator', 'docker_swarm_ops', 'llm_cache', 'rss_fetch',
  'task_lifecycle', 'template_manager', 'video_action', 'execute_python',
  'json_query',
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
  const contractDefaults = registry.contractDefaults as { permissions: string[]; rateLimit: string[]; unknown: string[] };

  // ---- Part A: census ----
  const rows = tools.map(t => ({
    name: t.name,
    primaryTag: (Array.isArray(t.tags) && t.tags.length ? String(t.tags[0]) : null),
    permissions: Array.isArray(t.permissions) ? t.permissions.map(String) : null,
    sideEffects: Array.isArray(t.sideEffects) ? t.sideEffects.map(String) : null,
    rateLimitPerMinute: t.rateLimitPerMinute,
    required: Array.isArray(t.inputSchema?.required) ? t.inputSchema.required.map(String) : null,
    hasRequired: Array.isArray(t.inputSchema?.required) ? t.inputSchema.required.length : null,
    descLen: String(t.description || '').length,
    description: String(t.description || '').slice(0, 160),
    hasExecute: typeof t.execute === 'function',
  }));
  const agg = {
    registered: tools.length,
    withExecute: rows.filter(r => r.hasExecute).length,
    emptySideEffects: rows.filter(r => Array.isArray(r.sideEffects) && r.sideEffects.length === 0).length,
    emptyRequired: rows.filter(r => Array.isArray(r.required) && r.required.length === 0).length,
    nullRequired: rows.filter(r => r.required === null).length,
    noDescription: rows.filter(r => r.descLen === 0).length,
    defaultedPermissions: contractDefaults.permissions,
    defaultedRateLimit: contractDefaults.rateLimit,
    unknownPermissions: contractDefaults.unknown,
  };

  // ---- Part B: live empty-input honesty ----
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const live: Record<string, any> = {};
  for (const n of LIVE9) {
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
        log0: Array.isArray(r?.logs) && r.logs.length ? String(r.logs[0]).slice(0, 160) : null,
      };
    } catch (e: any) {
      live[n] = { threw: String(e?.message || e).slice(0, 200) };
    }
  }

  const out = { generatedAt: new Date().toISOString(), census: agg, censusRows: rows, liveEmptyInput: live };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'sweep1.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ census: { ...agg, defaultedPermissions: agg.defaultedPermissions.length, defaultedRateLimit: agg.defaultedRateLimit.length }, liveEmptyInput: live }, null, 1));
  console.log(`wrote ${jsonPath}`);
  process.exit(0);
}

main().catch(e => { console.error('SWEEP1_FAILED', e); process.exit(1); });
