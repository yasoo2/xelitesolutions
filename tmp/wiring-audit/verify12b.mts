// V12 follow-up: dump raw outer result for the gate-rejection shape (V3) + control (V1-clone).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);
const WSID = 'audit-verify12b';
const WSROOT = path.join(HERE, 'fx-verify12', 'wsb');
async function main() {
  fs.mkdirSync(WSROOT, { recursive: true });
  const { workspaceService } = await imp(path.join(SRC, 'modules', 'services', 'WorkspaceService.ts'));
  await workspaceService.setActiveRoot(WSROOT, WSID);
  const registry: any = await imp(path.join(SRC, 'modules', 'tools', 'registry.ts'));
  if ((registry.tools as any[]).length !== 163) { console.error('ABORT reg'); process.exit(1); }
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const toolService: any = await imp(path.join(SRC, 'modules', 'services', 'ToolService.ts'));
  const run = async (id: string, phase: any) => {
    const ctx = { runId: id, sessionId: 'audit-v12b', workspaceId: WSID, userId: 'audit-user', traceId: `t-${id}` };
    const r: any = await fw.executionFirewall.runInContext(ctx.traceId,
      () => toolService.executeTool('phase_executor', { phase, projectContext: {} }, ctx),
      { userId: 'audit-user', sessionId: 'audit-v12b', runId: id });
    return {
      id, outerOk: r?.ok ?? null, outerError: String(r?.error || '').slice(0, 100) || null,
      outputType: Array.isArray(r?.output) ? 'array' : typeof r?.output,
      outputKeys: r?.output && typeof r.output === 'object' ? Object.keys(r.output) : null,
      outputStatus: r?.output?.status ?? null,
      resultsLen: Array.isArray(r?.output?.results) ? r.output.results.length : null,
      resHasOutput: r && 'output' in r,
    };
  };
  const v3 = await run('audit-v12b-r3', {
    phaseNumber: 1, name: 'v12b rejection',
    tasks: [{ task: 'write f', tool: 'write_file', args: { path: 'f.txt', content: 'x' } }],
    verificationTask: { task: 'click verifies', tool: 'browser_click', args: { url: 'http://127.0.0.1:9/', text: 'x' }, verificationId: 'v12b:badgate', verificationMode: 'affected' },
  });
  const v1 = await run('audit-v12b-r1', {
    phaseNumber: 1, name: 'v12b positive',
    tasks: [{ task: 'write g', tool: 'write_file', args: { path: 'g.txt', content: 'y' } }],
    verificationTask: { task: 'verify g', tool: 'read_file', args: { path: 'g.txt' }, verificationId: 'v12b:ex:g.txt', verificationMode: 'affected' },
  });
  console.log(JSON.stringify({ v3, v1 }, null, 1));
  console.log('V12B_DONE');
}
main().catch(e => { console.error(`V12B_FATAL ${String(e?.stack || e).slice(0, 1500)}`); process.exit(1); });
