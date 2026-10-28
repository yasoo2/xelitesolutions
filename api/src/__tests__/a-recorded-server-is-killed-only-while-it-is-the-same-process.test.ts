import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as pageStore from '../api/page-store';
import { forgetRecordedLive, liveProjectRecord, pidIdentity, retireRecordedServer } from '../modules/tools/definitions/ProjectRunTool';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Round 15 review, finding 39: a session's record kept naming pid P0 after
 * its server stopped or failed to restart, and the next retirement ran
 * `taskkill /F /T /PID P0` — on Windows, whatever process had reused it. A
 * server is now recorded with its start time and killed only while the pid
 * still belongs to the process that started then; a stopped server's pid is
 * forgotten from the record.
 */
jest.setTimeout(60_000);
const inCtx = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('project-run-pid-identity', fn);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const children: ChildProcess[] = [];
const roots: string[] = [];
const savedProjects = (global as any).joeProjects;
beforeAll(() => { jest.spyOn(pageStore, 'persistJoeProjects').mockReturnValue({ status: 'queued' } as any); });
afterAll(() => {
    for (const c of children) { try { c.kill(); } catch { /* gone */ } }
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    (global as any).joeProjects = savedProjects;
    jest.restoreAllMocks();
});

function aProcess(): ChildProcess {
    const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(child);
    return child;
}
function aWorkspace(): { ws: string; dir: string } {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pid-'));
    roots.push(ws);
    const dir = path.join(ws, 'api-clinic');
    fs.mkdirSync(dir);
    return { ws, dir };
}

describe('a pid is not an identity', () => {
    it('this platform reads a start time, and two processes do not share one', async () => {
        const child = aProcess();
        const mine = await inCtx(() => pidIdentity.read(process.pid));
        const theirs = await inCtx(() => pidIdentity.read(Number(child.pid)));
        expect(mine).not.toBe('');
        expect(theirs).not.toBe('');
        expect(theirs).not.toBe(mine);
        expect(await inCtx(() => pidIdentity.read(process.pid))).toBe(mine);
        expect(await inCtx(() => pidIdentity.read(999_999_999))).toBe('');
    });

    it('a recorded pid now held by another process is NOT killed, and the stale record is forgotten', async () => {
        const { ws, dir } = aWorkspace();
        const other = aProcess();
        (global as any).joeProjects = { 's-pid': liveProjectRecord({}, dir, { url: 'http://127.0.0.1:4868/', port: 4868, pid: Number(other.pid), identity: `${process.platform}:started-at-another-moment` }) };
        const logs: string[] = [];
        await inCtx(() => retireRecordedServer({ sessionId: 's-pid', workspaceRoot: ws }, dir, logs));
        expect(alive(Number(other.pid))).toBe(true);
        expect(logs.join('\n')).toMatch(/now belongs to another process[\s\S]*not killed/);
        expect((global as any).joeProjects['s-pid'].live).toBeUndefined();
    });

    it('the recorded server itself — same pid, same start time — is retired', async () => {
        const { ws, dir } = aWorkspace();
        const ours = aProcess();
        const identity = await inCtx(() => pidIdentity.read(Number(ours.pid)));
        (global as any).joeProjects = { 's-pid2': liveProjectRecord({}, dir, { url: 'http://127.0.0.1:4869/', port: 4869, pid: Number(ours.pid), identity }) };
        const logs: string[] = [];
        await inCtx(() => retireRecordedServer({ sessionId: 's-pid2', workspaceRoot: ws }, dir, logs));
        for (let i = 0; i < 40 && alive(Number(ours.pid)); i++) await new Promise(r => setTimeout(r, 150));
        expect(alive(Number(ours.pid))).toBe(false);
        expect(logs.join('\n')).toMatch(/retired previous server pid=/);
        expect((global as any).joeProjects['s-pid2'].live).toBeUndefined();
    });

    it('forgetting touches only the record that names that pid', () => {
        (global as any).joeProjects = { a: { dir: '/w', live: { pid: 11 } }, b: { dir: '/w', live: { pid: 12 } } };
        forgetRecordedLive('a', 12);
        expect((global as any).joeProjects.a.live).toEqual({ pid: 11 });
        forgetRecordedLive('a', 11);
        expect((global as any).joeProjects.a.live).toBeUndefined();
        expect((global as any).joeProjects.b.live).toEqual({ pid: 12 });
    });

    it('the wiring: every kill of a recorded pid checks its identity; a stopped or exited server is forgotten', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRunTool.ts'), 'utf8');
        const stop = src.slice(src.indexOf('async function stopServer'), src.indexOf('export const pidIdentity'));
        expect(stop).toMatch(/await killRecorded\(pid, server\.identity, logs\)/);
        expect(stop).toMatch(/forgetRecordedLive\(server\.sessionKey, pid\);/);
        expect(src).toMatch(/RUNNING\.delete\(key\);\s*forgetRecordedLive\(current\.sessionKey, pid\);/);
        // Only trackRunning records a server, so every one carries its identity.
        expect((src.match(/RUNNING\.set\(/g) || []).length).toBe(1);
        expect(src.slice(src.indexOf('async function trackRunning'))).toMatch(/^async function trackRunning[\s\S]{0,400}RUNNING\.set\(key, \{[\s\S]{0,300}identity: await pidIdentity\.read/);
        expect((src.match(/await trackRunning\(key, context, \{/g) || []).length).toBe(4);
        expect(src).toMatch(/const killed = await killRecorded\(Number\(live\.pid\), live\.identity, logs\);/);
    });
});
