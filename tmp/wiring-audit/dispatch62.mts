/**
 * MUSE wiring discovery checkpoint 062 — dispatch/firewall gating probe.
 * Runs the ACTUAL ToolService.executeTool dispatch path in-process with
 * fixture identity and env-controlled approval flags. No servers, no
 * network, no provider calls. The ONLY tool execution is `echo` (pure:
 * returns its input). All other sample tools are stopped at the approval
 * gate (AUTO_APPROVE_SAFE=0) so their implementations never run.
 * Writes only under --out. cwd should be --out (contains vectorDb
 * data/memory created by the ToolService import).
 * Usage: tsx dispatch62.mts --out=<abs dir>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, '1'];
}));
const OUT = String(args.out || '');
if (!OUT) { console.error('missing --out'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const SRC = 'D:/Joe/muse-worktree/api/src';
const svcUrl = pathToFileURL(path.join(SRC, 'modules/services/ToolService.ts')).href;
const fwUrl = pathToFileURL(path.join(SRC, 'orchestration/AgentExecutionFirewall.ts')).href;

delete process.env.ENABLE_AUTH_BYPASS;
delete process.env.AUTO_APPROVE_ALL;
process.env.AUTO_APPROVE_SAFE = '0';

const { executeTool } = await import(svcUrl);
const { executionFirewall } = await import(fwUrl);
const results: any = { legs: [] };

// Leg 0: direct call without orchestrator context must throw (firewall gate).
try {
    await executeTool('echo', { text: 'leg0' }, { userId: 'fx', workspaceId: OUT } as any);
    results.legs.push({ leg: 0, firewall: 'NOT_ENFORCED_UNEXPECTED' });
} catch (e: any) {
    results.legs.push({ leg: 0, firewall: 'ENFORCED', error: String(e?.message || e).slice(0, 160) });
}

// Legs A+B inside the orchestrator (non-system) context: gating path active.
const SAMPLE = ['web_page_builder', 'alert_manager', 'cache_manager',
    'project_state_manager', 'template_manager', 'echo', 'central_answer'];
await executionFirewall.runInContext('fx-dispatch62', async () => {
    const ctx = { userId: 'fx-user-062', workspaceId: OUT, sessionId: '' } as any;
    for (const name of SAMPLE) {
        const input = name === 'echo' ? { text: 'fx62' } : {};
        try {
            const r: any = await executeTool(name, input, { ...ctx });
            results.legs.push({
                leg: 'A', tool: name, ok: !!r?.ok, error: String(r?.error || '').slice(0, 80),
                risk: r?.output?.risk || null,
                logTail: Array.isArray(r?.logs) ? r.logs.slice(-2) : [],
            });
        } catch (e: any) {
            results.legs.push({ leg: 'A', tool: name, threw: String(e?.message || e).slice(0, 120) });
        }
    }
    // Leg B: identity gating — missing user, then missing workspace.
    try {
        const r1: any = await executeTool('echo', { text: 'b1' }, { workspaceId: OUT, sessionId: '' } as any);
        results.legs.push({ leg: 'B', case: 'missing_user', ok: !!r1?.ok, error: String(r1?.error || '').slice(0, 80) });
    } catch (e: any) {
        results.legs.push({ leg: 'B', case: 'missing_user', threw: String(e?.message || e).slice(0, 120) });
    }
    try {
        const r2: any = await executeTool('echo', { text: 'b2' }, { userId: 'fx-user-062', sessionId: '' } as any);
        results.legs.push({ leg: 'B', case: 'missing_workspace', ok: !!r2?.ok, error: String(r2?.error || '').slice(0, 80) });
    } catch (e: any) {
        results.legs.push({ leg: 'B', case: 'missing_workspace', threw: String(e?.message || e).slice(0, 120) });
    }
});

// Leg C: default approval env — full dispatch of pure `echo` only.
delete process.env.AUTO_APPROVE_SAFE;
await executionFirewall.runInContext('fx-dispatch62-exec', async () => {
    try {
        const r: any = await executeTool('echo', { text: 'dispatch62-ping' },
            { userId: 'fx-user-062', workspaceId: OUT, sessionId: '' } as any);
        results.legs.push({
            leg: 'C', tool: 'echo', ok: !!r?.ok, error: String(r?.error || '').slice(0, 80),
            echoed: r?.output?.text ?? null,
        });
    } catch (e: any) {
        results.legs.push({ leg: 'C', tool: 'echo', threw: String(e?.message || e).slice(0, 160) });
    }
});

fs.writeFileSync(path.join(OUT, 'dispatch62_MUSE.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
process.exit(0);
