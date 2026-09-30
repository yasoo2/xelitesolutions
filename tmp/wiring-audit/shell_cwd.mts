// MUSE wiring-audit checkpoint 19 follow-up: disentangle the shell \\?\ cwd
// artifact (F135) from exit-code normalization (F136).
// Legs (all canonical ToolService path, session fixture root, harmless only):
//   cd.backslash-q  -> `cd` with the \\?\ session cwd: prints the REAL dir cmd used
//   cd.plain        -> `cd` with a plain D:\.. cwd string: does safePath keep it plain?
//   pwd.node        -> node prints process.cwd() under \\?\ cwd (authoritative)
//   exit3.plain     -> exit-3 under plain cwd: clean normalization test?
//   exit3.nocwd     -> exit-3 with default root cwd
// Run from api/ with the same env as trunk_shell.mts (see 019 doc).
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'api', 'src');
const imp = (p: string) => import(pathToFileURL(p).href);
const CALL_TIMEOUT_MS = 25000;

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
  const FX = path.join(sessionRoot, 'wiring-shell-fx2');
  const PKG = path.join(FX, 'pkg');
  fs.mkdirSync(PKG, { recursive: true });
  const plainPkg = PKG.replace(/^\\\\\?\\/, '');

  const live: Record<string, any> = {};
  const run = async (id: string, input: any) => {
    try {
      const raced = await withTimeout(
        fw.executionFirewall.runInContext('audit-trace',
          () => executeTool('shell_execute', input, ctx),
          { userId: 'audit-user', sessionId: 'audit-sess', runId: 'audit-run' }),
        CALL_TIMEOUT_MS);
      if (raced.timedOut) { live[id] = { timedOut: true }; return; }
      const r: any = (raced as any).value;
      live[id] = {
        ok: !!r?.ok,
        error: r?.error ? String(r.error).slice(0, 300) : null,
        stdout: r?.output?.stdout ? String(r.output.stdout).slice(0, 300) : null,
        stderr: r?.output?.stderr ? String(r.output.stderr).slice(0, 300) : null,
        exitCode: r?.output?.exitCode ?? null,
        cwd: r?.output?.cwd ? String(r.output.cwd).slice(0, 200) : null,
      };
    } catch (e: any) { live[id] = { threw: String(e?.message || e).slice(0, 200) }; }
  };

  await run('cd.backslash-q', { command: 'cd', cwd: PKG });
  await run('cd.plain', { command: 'cd', cwd: plainPkg });
  await run('pwd.node', { command: 'node -e "console.log(process.cwd())"', cwd: PKG });
  await run('exit3.plain', { command: 'node -e "process.exit(3)"', cwd: plainPkg });
  await run('exit3.nocwd', { command: 'node -e "process.exit(3)"' });

  let cleanup = 'ok';
  try {
    fs.rmSync(FX, { recursive: true, force: true });
    cleanup = fs.existsSync(FX) ? 'LEFT' : 'ok';
  } catch (e: any) { cleanup = `THREW:${String(e?.message || e).slice(0, 80)}`; }

  fs.writeFileSync(path.join(HERE, 'shell_cwd.json'), JSON.stringify({ live, cleanup, sessionRoot, plainPkg, at: new Date().toISOString() }, null, 2));
  console.log(`EVIDENCE shell-cwd cleanup=${cleanup} sessionRoot=${sessionRoot}`);
  for (const [k, v] of Object.entries<any>(live)) {
    console.log(`  ${k} ok=${v.ok} exit=${v.exitCode} stdout=${JSON.stringify(v.stdout)} stderr=${JSON.stringify((v.stderr || '').slice(0, 160))} cwd=${v.cwd}`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error('SHELL_CWD_FATAL', e); process.exit(1); });
