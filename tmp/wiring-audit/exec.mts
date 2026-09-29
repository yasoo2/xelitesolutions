// MUSE wiring-audit LEVEL-4 spot-execution probe (bounded, no network).
// Checkpoint 4B: safe tools through the CANONICAL path —
// executionFirewall.runInContext (the same legitimate context entry every
// orchestrated run uses) -> ToolService.executeTool -> rewrite/registry/tool.
// Fixture files live under tmp/wiring-audit/fx/ and are removed afterwards.
// memorize_codebase is DELIBERATELY NOT executed (inline handler calls
// vectorDb.clear() — destructive). Its routing is proven by source order +
// the recall_memory live proof of the same mechanism.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\exec.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const FX = path.join(HERE, 'fx');
const TOKEN = 'WIRING_AUDIT_TOKEN_7f3a';
const imp = (p: string) => import(pathToFileURL(p).href);

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 8).join(',')}}`;
  return typeof v;
}

async function main() {
  fs.mkdirSync(FX, { recursive: true });
  fs.writeFileSync(path.join(FX, 'spot-a.txt'), `alpha line\nthe token is ${TOKEN} here\n`);
  fs.writeFileSync(path.join(FX, 'spot-b.txt'), `beta line\nnothing special\n`);

  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX2 = path.join(sessionRoot, 'wiring-fx');
  fs.mkdirSync(FX2, { recursive: true });
  fs.writeFileSync(path.join(FX2, 'spot-c.txt'), `gamma line\nthe token is ${TOKEN} here too\n`);
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const byName = new Map<string, any>((registry.tools as any[]).map(t => [t.name, t]));
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };

  const cases: Record<string, any> = {};
  const run = async (id: string, fn: () => Promise<any>) => {
    try {
      const r = await fw.executionFirewall.runInContext('audit-trace', fn,
        { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' });
      const o = r?.output;
      cases[id] = {
        ok: !!r?.ok, error: r?.error ? String(r.error).slice(0, 220) : null,
        outputShape: shape(o),
        outputHead: typeof o === 'string' ? o.slice(0, 160) : null,
        outputTotal: o && typeof o === 'object' && typeof o.total === 'number' ? o.total : null,
        outputValue: o && typeof o === 'object' && 'value' in o ? String(o.value).slice(0, 60) : null,
        logs: Array.isArray(r?.logs) ? r.logs.slice(0, 3).map((x: any) => String(x).slice(0, 160)) : null,
      };
    } catch (e: any) {
      cases[id] = { threw: String(e?.message || e).slice(0, 220) };
    }
  };

  // 1. pure positive: json_query through canonical path
  await run('json_query:canonical', () =>
    executeTool('json_query', { json: { a: { b: 42 } }, path: 'a.b' }, ctx));
  // 2. registry-path positive: search_text over the fixture dir
  await run('search_text:canonical', () =>
    executeTool('search_text', { query: TOKEN, path: FX, glob: '*.txt', maxResults: 10 }, ctx));
  // 3. rewrite-path positive: grep -> search_text, same fixture
  await run('grep:rewrite-to-search_text', () =>
    executeTool('grep', { query: TOKEN, path: FX, glob: '*.txt', maxResults: 10 }, ctx));
  // 2b/3b. same searches INSIDE the session workspace (containment allows)
  await run('search_text:in-workspace', () =>
    executeTool('search_text', { query: TOKEN, path: FX2, glob: '*.txt', maxResults: 10 }, ctx));
  await run('grep:in-workspace', () =>
    executeTool('grep', { query: TOKEN, path: FX2, glob: '*.txt', maxResults: 10 }, ctx));
  // 4a. recall_memory via canonical path with EMPTY input (inline has no validation)
  await run('recall_memory:canonical-empty-input', () =>
    executeTool('recall_memory', {}, ctx));
  // 4b. recall_memory registry implementation DIRECTLY with same empty input
  try {
    const def = byName.get('recall_memory');
    const r = await def.execute({}, ctx);
    cases['recall_memory:registry-direct-empty-input'] = {
      ok: !!r?.ok, error: r?.error ? String(r.error).slice(0, 220) : null,
      outputShape: shape(r?.output),
      outputHead: typeof r?.output === 'string' ? r.output.slice(0, 160) : null,
    };
  } catch (e: any) {
    cases['recall_memory:registry-direct-empty-input'] = { threw: String(e?.message || e).slice(0, 220) };
  }
  // 5. negative control: dormant unregistered name must fail honestly
  await run('fs_glob:unregistered-negative', () =>
    executeTool('fs_glob', { pattern: '*.txt' }, ctx));
  // 6. broken-rewrite proof: image_generate -> unregistered generate_image
  await run('image_generate:broken-rewrite', () =>
    executeTool('image_generate', { prompt: 'a mountain lake' }, ctx));

  // cleanup fixtures (record, then remove)
  const fxBefore = fs.readdirSync(FX).sort();
  fs.rmSync(FX, { recursive: true, force: true });
  fs.rmSync(FX2, { recursive: true, force: true });
  const fxAfterExists = fs.existsSync(FX) || fs.existsSync(FX2);

  const out = { generatedAt: new Date().toISOString(), cases, sessionRoot, fixtures: { before: fxBefore, removed: !fxAfterExists } };
  const jsonPath = path.join(ROOT, 'tmp', 'wiring-audit', 'exec.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  console.log(`wrote ${jsonPath}`);
}

main().catch(e => { console.error('EXEC_FAILED', e); process.exit(1); });
