/**
 *  THE BOOT ADOPTS THE PREVIEWS IT FINDS — THE FIREWALL NO LONGER FORGETS THEM.
 *
 *  Every boot of the test Joe on 2026-11-06 logged four «[FIREWALL] [BLOCKED]
 *  ExecutionGateway:execute». app.ts adopted the previous Joe's previews in a
 *  setImmediate, outside any execution context; on Windows a pid's identity is
 *  read through the gateway, the firewall refused it, and a preview whose
 *  identity could not be read was FORGOTTEN while it went on serving. The
 *  tests of the adoption injected their own reader or ran inside a context,
 *  so none of them saw it. Here the reader is the real one and the caller has
 *  no context, as at boot.
 *
 *  And the process ledger (round 34) ends what a dead Joe left: a preview
 *  that is meant to outlive Joe is kept out of it, or the next boot would end
 *  the very preview it adopts.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { _runningServers, adoptPreviewsAtStart, adoptRecordedPreviews, pidIdentity } from '../modules/tools/definitions/ProjectRunTool';
import { disableProcessLedger, enableProcessLedger, readLedger } from '../kernel/process-ledger';

jest.setTimeout(120_000);

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const record = (pid: number, identity: string, port: number) =>
    ({ dir: `/projects/${pid}`, live: { url: `http://127.0.0.1:${port}/`, port, pid, cwd: `/projects/${pid}`, at: 1, identity } });

let dir = '';
const started: Array<{ kill: () => void; pid?: number }> = [];
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-adopt-boot-')); });
afterEach(() => {
    for (const s of started.splice(0)) { try { s.kill(); } catch { /* gone */ } if (s.pid && alive(s.pid)) try { process.kill(s.pid); } catch { /* gone */ } }
    _runningServers.clear();
    (global as any).joeProjects = {};
    disableProcessLedger();
    fs.rmSync(dir, { recursive: true, force: true });
});

function startServer(outlivesJoe: boolean) {
    const h = executionFirewall.runInContext('adopt-boot-test', () =>
        ExecutionGateway.startManaged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, outlivesJoe }));
    started.push(h);
    return h;
}

test('a preview meant to outlive Joe stays out of the process ledger; any other child is in it', () => {
    enableProcessLedger(path.join(dir, 'runtime', 'child-processes.json'));
    const preview = startServer(true);
    const other = startServer(false);
    const pids = readLedger().map(r => r.pid);
    expect(pids).toContain(other.pid);
    expect(pids).not.toContain(preview.pid);
});

test('with no context, as at boot, the real identity read is refused and the preview is forgotten (the fault)', async () => {
    const h = startServer(true);
    const pid = Number(h.pid);
    const identity = await executionFirewall.runInContext('adopt-boot-test', () => pidIdentity.read(pid));
    expect(identity).not.toBe('');
    const projects: Record<string, any> = { s1: record(pid, identity, 4390) };
    (global as any).joeProjects = projects;
    const r = await adoptRecordedPreviews(projects, { cap: 8 });
    expect(r.forgotten).toEqual(['s1']);
    expect(alive(pid)).toBe(true);
});

test('adoptPreviewsAtStart, with no context, adopts the preview that is still the process recorded', async () => {
    const h = startServer(true);
    const pid = Number(h.pid);
    const identity = await executionFirewall.runInContext('adopt-boot-test', () => pidIdentity.read(pid));
    const projects: Record<string, any> = { s2: record(pid, identity, 4391) };
    (global as any).joeProjects = projects;
    const r = await adoptPreviewsAtStart(projects, { cap: 8 });
    expect(r).toMatchObject({ adopted: ['s2'], forgotten: [] });
    expect(_runningServers.get('s2')?.pid).toBe(pid);
    expect(projects.s2.live.pid).toBe(pid);
});
