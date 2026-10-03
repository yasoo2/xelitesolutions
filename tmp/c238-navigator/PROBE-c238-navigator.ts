import { CodebaseNavigatorTool } from '../../api/src/modules/tools/definitions/CodebaseNavigatorTool';

type Exec = (i: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function main(): Promise<void> {
  const fixture = process.argv[2];
  if (!fixture) { console.error('usage: probe.ts <fixtureDir>'); process.exit(2); }

  const tool = CodebaseNavigatorTool as {
    name?: string; version?: string; permissions?: string[]; execute: Exec;
  };
  const out: Record<string, unknown> = {
    tool: tool.name,
    version: tool.version,
    permissions: tool.permissions,
    openaiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    cwd: process.cwd(),
  };

  const t0 = Date.now();
  try {
    const idx = await tool.execute({ action: 'index', targetDir: fixture });
    out.indexOk = (idx as { ok?: boolean }).ok;
    out.indexOutput = (idx as { output?: unknown }).output;
    out.indexLogs = ((idx as { logs?: string[] }).logs || []).slice(0, 12);
    out.indexMs = Date.now() - t0;
  } catch (e) {
    out.indexError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const t1 = Date.now();
  try {
    const res = await tool.execute({ action: 'search', query: 'zephyr invoice totals', limit: 3 });
    out.searchOk = (res as { ok?: boolean }).ok;
    out.searchOutput = (res as { output?: unknown }).output;
    out.searchMs = Date.now() - t1;
  } catch (e) {
    out.searchError = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  try {
    await tool.execute({ action: 'delete' });
    out.unknownActionThrows = false;
  } catch {
    out.unknownActionThrows = true;
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e: unknown) => {
  console.error(`PROBE_FATAL: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
