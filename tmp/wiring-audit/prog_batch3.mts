// MUSE wiring-audit checkpoint 17 follow-up: progressive_generator batch-3
// (component batch, PROMPT:-bearing) under OFFLINE_MODE. Records whether an
// LLM-dependent batch writes placeholder content yet returns ok:true.
// Contained session fixture, created + removed by the probe; 2x processes.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);
const TOKEN = 'WIRING_BUILD_B3_4d9e';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<{ timedOut: true } | { timedOut: false; value: T }> {
  return Promise.race([
    p.then(value => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>(res => setTimeout(() => res({ timedOut: true }), ms)),
  ]);
}

async function main() {
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-build-b3');
  fs.mkdirSync(FX, { recursive: true });
  const live: Record<string, any> = {};
  const run = async (id: string, input: any, timeoutMs = 60000) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool('progressive_generator', input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        timeoutMs);
      if (raced.timedOut) { live[id] = { timedOut: true, timeoutMs }; return null; }
      const r: any = (raced as any).value;
      live[id] = { ok: !!r?.ok, error: r?.error ? String(r.error).slice(0, 200) : null, output: r?.output ?? null, logN: Array.isArray(r?.logs) ? r.logs.length : null };
      return r?.output ?? null;
    } catch (e: any) { live[id] = { threw: String(e?.message || e).slice(0, 200) }; return null; }
  };
  const PID = 'fx-prog-b3';
  await run('init', { action: 'init', projectId: PID, config: { name: 'fxprog', type: 'web', scale: 'small' }, baseDir: FX });
  const chain = [live['init']?.output?.nextBatch, null, null];
  const o1: any = await run('batch1', { action: 'generate_batch', projectId: PID, batchId: chain[0], baseDir: path.join(FX, 'prog') });
  const o2: any = await run('batch2', { action: 'generate_batch', projectId: PID, batchId: o1?.nextBatch, baseDir: path.join(FX, 'prog') });
  const o3: any = await run('batch3', { action: 'generate_batch', projectId: PID, batchId: o2?.nextBatch, baseDir: path.join(FX, 'prog') });
  const hits: string[] = [];
  const walk = (d: string) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (st.size < 200000 && fs.readFileSync(p, 'utf-8').includes('ERROR GENERATING CODE')) hits.push(path.relative(FX, p)); } };
  try { walk(path.join(FX, 'prog')); } catch { /* best effort */ }
  const batch3Id = o2?.nextBatch ?? null;
  let comp1Head = 'MISSING';
  try { comp1Head = fs.readFileSync(path.join(FX, 'prog', 'apps', 'frontend', 'src', 'components', 'Component1.tsx'), 'utf-8').slice(0, 400); } catch { /* best effort */ }
  fs.rmSync(FX, { recursive: true, force: true });
  const out = { batch3Id, batch3output: o3, live, placeholderHits: hits.slice(0, 10), comp1Head, fixturesRemoved: !fs.existsSync(FX) };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
main().catch(e => { console.error('PROG_B3_FAILED', e); process.exit(1); });
