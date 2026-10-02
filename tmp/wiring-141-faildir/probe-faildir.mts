// WIRING-141 (OBS-140-3): fail direction of unregistered-but-implemented tool names.
// Layer A: live registry membership for the 4 names from RESULT140 + controls.
// Layer B: dispatch ONLY names proven unregistered in Layer A through the real
// executeTool (ToolService) with a synthetic test context; record the fail shape.
// FAIL-CLOSED probe design: any name found registered is NEVER dispatched.
// No network, no filesystem writes, no registry mutation. Deterministic output:
// volatile fields (timings) go to stderr only; stdout is canonical JSON.
const UNREGISTERED_CANDIDATES = [
    'bulk_file_generator',
    'codebase_navigator',
    'generate_image',
    'visual_qa',
];
const CONTROL_NONEXISTENT = 'no_such_tool_141';
const CONTROL_ECHO = 'echo'; // dispatched only if registered; side-effect-free by design

const { tools } = await import('../../api/src/modules/tools/registry.ts');
const names: string[] = (tools as any[]).map((t: any) => t?.name).filter((n: any) => typeof n === 'string');
const registeredSet = new Set(names);

type Row = {
    name: string;
    layerA_registered: boolean;
    alias: string | null;
    dispatched: boolean;
    ok: boolean | null;
    errorCode: string | null;
    errorPrefix: string | null;
    logsCount: number | null;
    lastLog: string | null;
    note: string | null;
};

const rows: Row[] = [];
const cellar = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 160);
// Determinism: service log lines embed ISO timestamps; normalize them so the
// canonical stdout is byte-identical across runs (run1 disclosed this miss).
const det = (s: string | null) => s === null ? null : cellar(s).replace(/\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\]/g, '[TS]');

let executeTool: any = null;
let TOOL_ALIASES: Record<string, string> = {};
let firewall: any = null;
let importNote: string | null = null;
const tImport0 = Date.now();
try {
    const svc = await import('../../api/src/modules/services/ToolService.ts');
    executeTool = svc.executeTool;
    TOOL_ALIASES = svc.TOOL_ALIASES || {};
    const fw = await import('../../api/src/orchestration/AgentExecutionFirewall.ts');
    firewall = fw.executionFirewall;
} catch (e: any) {
    importNote = `service import failed: ${cellar(e?.message || String(e))}`;
}
console.error(`importMs=${Date.now() - tImport0}`);

const ctx = {
    sessionId: 'probe-141-synthetic',
    userId: 'probe-141-synthetic',
    workspaceId: 'D:/Joe/muse-worktree/tmp/wiring-141-faildir/ws-probe-nonexistent',
};

async function probeOne(name: string, allowEcho: boolean): Promise<Row> {
    const layerA = registeredSet.has(name);
    const alias: string | null = typeof TOOL_ALIASES[name] === 'string' ? TOOL_ALIASES[name] : null;
    const row: Row = {
        name, layerA_registered: layerA, alias, dispatched: false,
        ok: null, errorCode: null, errorPrefix: null, logsCount: null, lastLog: null, note: null,
    };
    const mayDispatch = !layerA || (allowEcho && name === CONTROL_ECHO && layerA);
    if (!mayDispatch) {
        row.note = 'SKIPPED_REGISTERED: fail-closed probe never dispatches registered tools';
        return row;
    }
    if (typeof executeTool !== 'function') {
        row.note = importNote || 'executeTool unavailable';
        return row;
    }
    row.dispatched = true;
    try {
        // Mirror AgentOrchestrator.coordinate(): dispatch inside the firewall's
        // own authorized orchestrator context. Unregistered names still return
        // at the lookup layer (ToolService.ts:700-720) before any side effect.
        const input = name === CONTROL_ECHO ? { text: 'probe-141' } : {};
        const res: any = firewall && typeof firewall.runInContext === 'function'
            ? await firewall.runInContext('probe-141', () => executeTool(name, input, ctx), { userId: ctx.userId, sessionId: ctx.sessionId })
            : await executeTool(name, input, ctx);
        row.ok = res?.ok === true;
        const err = typeof res?.error === 'string' ? res.error : null;
        row.errorPrefix = det(err);
        row.errorCode = err && err.startsWith('unknown_tool') ? 'unknown_tool'
            : err ? `other:${cellar(err).split(':')[0]}` : (row.ok ? 'ok' : 'no_error_field');
        const logs = Array.isArray(res?.logs) ? res.logs : [];
        row.logsCount = logs.length;
        row.lastLog = logs.length ? det(String(logs[logs.length - 1])) : null;
    } catch (e: any) {
        row.ok = false;
        row.errorCode = `threw:${cellar(e?.constructor?.name || 'Error')}`;
        row.errorPrefix = det(e?.message || String(e));
        row.note = 'executeTool threw instead of returning a result';
    }
    return row;
}

for (const n of UNREGISTERED_CANDIDATES) rows.push(await probeOne(n, false));
rows.push(await probeOne(CONTROL_NONEXISTENT, false));
rows.push(await probeOne(CONTROL_ECHO, true));

console.log(JSON.stringify({
    probe: 'wiring-141-faildir',
    registeredTools: names.length,
    uniqueNames: registeredSet.size,
    toolServiceImport: executeTool ? 'ok' : `failed: ${importNote}`,
    firewallContext: firewall && typeof firewall.runInContext === 'function' ? 'runInContext-established' : 'MISSING-firewall-bypass-risk',
    rows,
}, null, 2));
process.exit(0);
