// MUSE wiring-audit checkpoint 18 follow-up: deploy_pages own-gate legs under
// AUTO_APPROVE_ALL=1 (the default-deny trunk run stops all three pages legs at
// the approval gate, so the tool's needsConnect/needsRepo/missing-path shapes
// are unproven there). With no token and no repo anywhere in env/store, every
// leg must stop BEFORE any network: resolveRepoAndToken does local lookups
// only, and ghApi is unreachable without token+repo (DeployPagesTool.ts:99-101
// return first). The backend fixture proves the token gate precedes the
// backend-honesty gate. No server/process legs. Run from api/ with
// AUTO_APPROVE_ALL=1 plus the standard trunk env; log to pages_approved.log.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

function shape(v: any): string {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 14).join(',')}}`;
  return typeof v;
}

async function main() {
  if (process.env.AUTO_APPROVE_ALL !== '1') { console.error('PAGES_APPROVED_ABORT need AUTO_APPROVE_ALL=1'); process.exit(1); }
  if (process.env.GITHUB_TOKEN) { console.error('PAGES_APPROVED_ABORT GITHUB_TOKEN must be unset'); process.exit(1); }
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-pages-fx');
  const BACKEND = path.join(FX, 'backend1');
  fs.mkdirSync(BACKEND, { recursive: true });
  fs.writeFileSync(path.join(BACKEND, 'package.json'), JSON.stringify({ name: 'fx-pg-backend', private: true }));
  fs.writeFileSync(path.join(BACKEND, 'server.js'), `require('http').createServer((q,s)=>{s.end('x')}).listen(45990);\n`);
  const live: Record<string, any> = {};
  const run = async (id: string, input: any) => {
    try {
      const r: any = await fw.executionFirewall.runInContext('audit-trace',
        () => executeTool('deploy_pages', input, ctx),
        { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' });
      const o = r?.output;
      live[id] = {
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 260) : null,
        outputShape: shape(o),
        outputPreview: o && typeof o === 'object' ? JSON.stringify(o).slice(0, 600) : null,
      };
    } catch (e: any) {
      live[id] = { threw: String(e?.message || e).slice(0, 260) };
    }
  };
  await run('pagesA.empty', {});
  await run('pagesA.missing-cwd', { cwd: path.join(FX, 'missing') });
  await run('pagesA.backend-unreached', { cwd: BACKEND });
  await run('pagesA.explicit-repo-no-token', { cwd: BACKEND, repo: 'octo/fx-demo' });
  let removed = false;
  try { fs.rmSync(FX, { recursive: true, force: true }); removed = !fs.existsSync(FX); } catch { removed = false; }
  fs.writeFileSync(path.join(HERE, 'pages_approved.json'), JSON.stringify({ live, removed }, null, 2));
  for (const id of Object.keys(live)) {
    const l: any = live[id];
    console.log(`LEG ${id} ok=${l.ok} err=${l.error || l.threw || ''} shape=${l.outputShape || ''} ${String(l.outputPreview || '').slice(0, 200)}`);
  }
  console.log(`PAGES_APPROVED removed=${removed}`);
}

main().catch(e => { console.error('PAGES_APPROVED_FATAL', e); process.exit(1); });
