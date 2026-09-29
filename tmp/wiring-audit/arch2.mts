// MUSE wiring-audit checkpoint 8 follow-up: archive backend matrix.
// Distinguishes "zip binary missing on Windows" from "create broken":
// tar.gz create+list on the same contained fixture, plus zip-create rerun.
// Run from api/: ..\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\arch2.mts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);

async function main() {
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const ws: any = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  const executeTool = toolService.executeTool as (n: string, i: any, c?: any) => Promise<any>;
  const ctx = { sessionId: 'audit-sess', userId: 'audit-user', traceId: 'audit-trace' };
  const sessionRoot: string = ws.workspaceService.getActiveRoot('session-audit-sess');
  const FX = path.join(sessionRoot, 'wiring-arch-fx');
  fs.mkdirSync(FX, { recursive: true });
  fs.writeFileSync(path.join(FX, 'a.txt'), 'arch probe alpha\n');
  const cases: Record<string, any> = {};
  const run = async (id: string, input: any) => {
    try {
      const r: any = await fw.executionFirewall.runInContext('audit-trace',
        () => executeTool('archive_files', input, ctx),
        { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' });
      cases[id] = {
        ok: !!r?.ok, error: r?.error ? String(r.error).slice(0, 220) : null,
        output: r?.output && typeof r.output === 'object' ? JSON.stringify(r.output).slice(0, 300) : null,
      };
    } catch (e: any) {
      cases[id] = { threw: String(e?.message || e).slice(0, 220) };
    }
  };
  await run('targz:create', { action: 'create', format: 'tar.gz', archivePath: path.join(FX, 'b.tar.gz'), sourcePaths: [path.join(FX, 'a.txt')] });
  if (cases['targz:create']?.ok) {
    await run('targz:list', { action: 'list', archivePath: path.join(FX, 'b.tar.gz') });
  }
  await run('zip:create-rerun', { action: 'create', format: 'zip', archivePath: path.join(FX, 'c.zip'), sourcePaths: [path.join(FX, 'a.txt')] });
  const before = fs.readdirSync(FX).sort();
  fs.rmSync(FX, { recursive: true, force: true });
  const out = { generatedAt: new Date().toISOString(), cases, before, removed: !fs.existsSync(FX) };
  fs.writeFileSync(path.join(ROOT, 'tmp', 'wiring-audit', 'arch2.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
main().catch(e => { console.error('ARCH2_FAILED', e); process.exit(1); });
