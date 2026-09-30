// MUSE wiring-audit checkpoint 18 follow-up: project_stop kill mechanism.
// Trunk runs show stopped:true with the server still answering HTTP 200 and
// the stop log on the SUCCESS branch (`stopped pid=...`). killTree awaits
// ExecutionGateway.execute('taskkill /F /T /PID <pid>',...) but never checks
// the result. This probe isolates the gateway/taskkill layer from the tool:
// start a token-serving node server via startManaged (the exact project_run
// path), then run the EXACT killTree gateway call and print the FULL result,
// then check liveness. Cleanup is explicit (process.kill fallback) and the
// port is verified closed. No ToolService, no model, no network.
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);
const TOKEN = 'WIRING_STOPMECH_6d21';
const PORT = 45984;

function httpGet(url: string, ms = 4000): Promise<{ status: number | null; head: string; refused: boolean }> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: { status: number | null; head: string; refused: boolean }) => {
      if (done) return; done = true; resolve(r);
    };
    try {
      const req = http.get(url, (res: any) => {
        let body = '';
        res.on('data', (c: any) => { body += String(c); });
        res.on('end', () => finish({ status: Number(res.statusCode || 0), head: body.slice(0, 200), refused: false }));
        res.resume();
      });
      req.on('error', (e: any) => finish({ status: null, head: String(e?.code || e?.message || e).slice(0, 120), refused: /ECONNREFUSED/i.test(String(e?.code || e?.message || '')) }));
      req.setTimeout(ms, () => { req.destroy(); finish({ status: null, head: 'TIMEOUT', refused: false }); });
    } catch (e: any) {
      finish({ status: null, head: String(e?.message || e).slice(0, 120), refused: false });
    }
  });
}

async function main() {
  const gw: any = await imp(path.join(SRC, 'kernel', 'ExecutionGateway.ts'));
  const fw: any = await imp(path.join(SRC, 'orchestration', 'AgentExecutionFirewall.ts'));
  const managed = await fw.executionFirewall.runInContext('audit-trace', async () => {
    return gw.ExecutionGateway.startManaged(process.execPath,
      ['-e', `require('http').createServer((q,s)=>{s.end('${TOKEN}')}).listen(${PORT},'127.0.0.1');`],
      { windowsHide: true });
  }, { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' });
  const pid = Number(managed?.pid) || 0;
  console.log(`SPAWNED pid=${pid}`);
  await new Promise(r => setTimeout(r, 1500));
  const before = await httpGet(`http://127.0.0.1:${PORT}/`);
  console.log(`BEFORE status=${before.status} head=${before.head} refused=${before.refused}`);
  // EXACT killTree call (ProjectRunTool.ts:1767), result printed in full.
  let gwResult: any = null;
  try {
    gwResult = await fw.executionFirewall.runInContext('audit-trace',
      () => gw.ExecutionGateway.execute(`taskkill /F /T /PID ${pid}`, [], { shell: true, stdio: 'ignore' }),
      { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' });
  } catch (e: any) {
    gwResult = { threw: String(e?.message || e).slice(0, 300) };
  }
  console.log(`TASKKILL_RESULT ${JSON.stringify(gwResult).slice(0, 800)}`);
  await new Promise(r => setTimeout(r, 2000));
  const after = await httpGet(`http://127.0.0.1:${PORT}/`);
  console.log(`AFTER status=${after.status} head=${after.head} refused=${after.refused}`);
  // Explicit cleanup regardless of outcome.
  try { if (pid) process.kill(pid, 'SIGKILL'); } catch { /* already dead */ }
  try { managed?.kill?.(); } catch { /* best effort */ }
  await new Promise(r => setTimeout(r, 1500));
  const final = await httpGet(`http://127.0.0.1:${PORT}/`);
  console.log(`FINAL status=${final.status} head=${final.head} refused=${final.refused}`);
  if (!final.refused && final.status !== null) { console.error('STOPMECH_CLEANUP_FAILED'); process.exit(2); }
  console.log('STOPMECH_DONE');
  process.exit(0);
}

main().catch(e => { console.error('STOPMECH_FATAL', e); process.exit(1); });
