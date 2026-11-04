/**
 * ⛔ A PREVIEW OUTLIVES THE JOE THAT STARTED IT — SO THE NEXT JOE ADOPTS IT.
 *
 * 2026-11-04: after a morning of restarting the exam's Joe, nine previews it
 * had started were still serving with no owner — 27 processes. A killed
 * parent's children live on, and the running-servers map is memory: the next
 * Joe neither counted them against the live-preview bound nor could stop
 * them. At start, a recorded live server that is still the process recorded
 * (pid and start time) is adopted; one that is gone is forgotten; one recorded
 * without its start time is never touched; and past the bound the oldest are
 * stopped — a real process here, stopped for real.
 */
import fs from 'fs';
import path from 'path';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { _runningServers, adoptRecordedPreviews, pidIdentity } from '../modules/tools/definitions/ProjectRunTool';

jest.setTimeout(120_000);

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const record = (pid: number, identity: string | undefined, at: number, port: number) =>
    ({ dir: `/projects/${pid}`, live: { url: `http://127.0.0.1:${port}/`, port, pid, cwd: `/projects/${pid}`, at, ...(identity ? { identity } : {}) } });

afterEach(() => { _runningServers.clear(); (global as any).joeProjects = {}; });

describe('the previews of the previous start', () => {
    it('are adopted when they are still the process recorded, forgotten when not, and untouched without an identity', async () => {
        const projects: Record<string, any> = {
            alive_a: record(70001, 'win32:111', 1, 4301),
            reused_b: record(70002, 'win32:222', 2, 4302),
            unknown_c: record(70003, undefined, 3, 4303),
            alive_d: record(70004, 'win32:444', 4, 4304),
        };
        (global as any).joeProjects = projects;
        const now: Record<number, string> = { 70001: 'win32:111', 70002: 'win32:999', 70003: 'win32:333', 70004: 'win32:444' };
        const r = await adoptRecordedPreviews(projects, { read: async pid => now[pid] || '', cap: 8 });
        expect(r).toEqual({ adopted: ['alive_a', 'alive_d'], forgotten: ['reused_b'], retired: [] });
        expect(Array.from(_runningServers.keys())).toEqual(['alive_a', 'alive_d']);
        expect(_runningServers.get('alive_a')).toMatchObject({ pid: 70001, port: 4301, sessionKey: 'alive_a', identity: 'win32:111', startedAt: 1 });
        //  A pid now another process's is no longer this session's preview…
        expect(projects.reused_b.live).toBeUndefined();
        //  …and one recorded without its start time cannot be told from a reused pid: left as it was.
        expect(projects.unknown_c.live).toMatchObject({ pid: 70003 });
        expect(_runningServers.has('unknown_c')).toBe(false);
    });

    it('a server this start already runs is not adopted twice', async () => {
        _runningServers.set('current', { pid: 70005, port: 4305, cwd: '/p', command: 'npx serve', startedAt: Date.now() });
        const projects = { old_record: record(70005, 'win32:555', 1, 4305) };
        const r = await adoptRecordedPreviews(projects, { read: async () => 'win32:555', cap: 8 });
        expect(r.adopted).toEqual([]);
        expect(_runningServers.size).toBe(1);
    });

    it('past the bound, the oldest adopted preview is stopped — for real', async () => {
        const server = await executionFirewall.runInContext('adopt-previews-test', async () =>
            ExecutionGateway.startManaged(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true }));
        const pid = Number(server.pid);
        try {
            expect(alive(pid)).toBe(true);
            const identity = await executionFirewall.runInContext('adopt-previews-test', () => pidIdentity.read(pid));
            expect(identity).not.toBe('');
            const projects: Record<string, any> = {
                oldest: record(pid, identity, 1, 4310),
                newer: record(70006, 'win32:666', 2, 4311),
            };
            (global as any).joeProjects = projects;
            const read = async (p: number) => (p === pid ? pidIdentity.read(p) : 'win32:666');
            const r = await executionFirewall.runInContext('adopt-previews-test', () => adoptRecordedPreviews(projects, { read, cap: 1 }));
            expect(r).toMatchObject({ adopted: ['oldest', 'newer'], retired: ['oldest'] });
            expect(Array.from(_runningServers.keys())).toEqual(['newer']);
            for (let i = 0; i < 40 && alive(pid); i++) await new Promise(res => setTimeout(res, 250));
            expect(alive(pid)).toBe(false);
            //  Stopped and forgotten: the session's record no longer names it.
            expect(projects.oldest.live).toBeUndefined();
        } finally {
            if (alive(pid)) process.kill(pid);
        }
    });

    it('Joe adopts them as it starts, right after loading the session records', () => {
        const app = fs.readFileSync(path.join(__dirname, '..', 'api', 'app.ts'), 'utf-8');
        const loaded = app.indexOf('try { loadJoeProjects(); }');
        const adopted = app.indexOf('adoptRecordedPreviews()');
        expect(loaded).toBeGreaterThan(0);
        expect(adopted).toBeGreaterThan(loaded);
    });
});
