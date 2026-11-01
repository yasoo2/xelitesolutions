/**
 * shell_start RETURNS THE ADDRESS THAT ANSWERED, AND THE RUN CAN STOP WHAT IT STARTED.
 *
 * Tiny node http servers, started for real through the engine's gateway.
 * Each address below is one a test request actually reached; each "stopped"
 * is a port that no longer accepts a connection.
 */
import { spawn as spawnChild } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import {
    listRunProcesses, shellProcessLogs, startShellProcess, stopAllForRun, stopShellProcess,
} from '../modules/tools/definitions/EngineShellTools';
import * as ProjectRun from '../modules/tools/definitions/ProjectRunTool';
import { isLoopbackPortOpen } from '../modules/tools/definitions/ProjectRunTool';
import { ExecutionGateway } from '../kernel/ExecutionGateway';
import { requestResourceManager } from '../core/resources/RequestResourceManager';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

jest.setTimeout(180_000);

const TMP = process.env.JOE_TEST_TMP_ROOT || os.tmpdir();
let base: string;
let root: string;
const runs = new Set<string>();

const SERVER = [
    'const http = require("http");',
    'const server = http.createServer((req, res) => { console.log("request " + req.url); res.end("hello from the engine test"); });',
    'server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => console.log("Server listening on http://127.0.0.1:" + server.address().port + "/"));',
].join('\n');

beforeAll(() => {
    base = fs.mkdtempSync(path.join(TMP, 'joe-eng-shell-start-'));
    root = path.join(base, 'site');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'eng-shell-server.js'), SERVER);
    fs.writeFileSync(path.join(root, 'eng-shell-wildcard.js'), [
        'const http = require("http");',
        'const server = http.createServer((req, res) => res.end("wildcard"));',
        'server.listen(0, "0.0.0.0", () => console.log("ready at http://0.0.0.0:" + server.address().port));',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'eng-shell-quiet-server.js'), [
        'const http = require("http");',
        'http.createServer((req, res) => res.end("quiet")).listen(Number(process.env.PORT), "127.0.0.1");',
    ].join('\n'));
    //  One address, announced with many paths (a route table): one address to try.
    fs.writeFileSync(path.join(root, 'eng-shell-never-serves.js'), [
        'console.log("Server listening on http://127.0.0.1:1/");',
        'for (let i = 0; i < 40; i++) console.log("route http://127.0.0.1:1/item/" + i);',
        'setInterval(() => {}, 1000);',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'eng-shell-default-port.js'), [
        'const http = require("http");',
        'const server = http.createServer((req, res) => res.end("own port"));',
        'server.on("error", e => { console.error("cannot listen: " + e.code); process.exit(3); });',
        'server.listen(Number(process.env.PORT || 0), "127.0.0.1", () => console.log("listening on http://127.0.0.1:" + server.address().port + "/"));',
    ].join('\n'));
    //  Open from the start, but not ready: its first two answers are 503.
    fs.writeFileSync(path.join(root, 'eng-shell-warming.js'), [
        'const http = require("http");',
        'let n = 0;',
        'const server = http.createServer((req, res) => {',
        '  n++; const status = n <= 2 ? 503 : 200;',
        '  console.log("request " + n + " status " + status);',
        '  res.statusCode = status; res.end(status === 200 ? "warm" : "warming up");',
        '});',
        'server.listen(0, "127.0.0.1", () => console.log("Server listening on http://127.0.0.1:" + server.address().port + "/"));',
    ].join('\n'));
    fs.writeFileSync(path.join(root, 'eng-shell-silent.js'), 'setInterval(() => {}, 1000);\n');
    fs.writeFileSync(path.join(root, 'eng-shell-crash.js'), 'console.error("cannot start: missing config");\nprocess.exit(2);\n');
});
beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(base); });
afterEach(() => { jest.restoreAllMocks(); });
afterAll(async () => {
    for (const runId of runs) await stopAllForRun(runId);
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

function context(runId: string, extra: Record<string, unknown> = {}) {
    runs.add(runId);
    return { projectRoot: root, workspaceId: 'ws-engine-shell', runId, ...extra };
}
const inFirewall = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('engine-shell-start-test', fn);
const start = (runId: string, input: any, extra: Record<string, unknown> = {}): Promise<any> =>
    inFirewall(() => startShellProcess(input, context(runId, extra)));
const logs = (runId: string, input: any): Promise<any> => inFirewall(() => shellProcessLogs(input, context(runId)));
const stop = (runId: string, input: any): Promise<any> => inFirewall(() => stopShellProcess(input, context(runId)));

function get(url: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            let body = '';
            res.on('data', c => { body += c; });
            res.on('end', () => resolve({ status: Number(res.statusCode), body }));
        }).on('error', reject);
    });
}

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.listen(0, '127.0.0.1', () => {
            const port = (s.address() as net.AddressInfo).port;
            s.close(() => resolve(port));
        });
        s.on('error', reject);
    });
}

async function gone(pid: number | undefined): Promise<boolean> {
    if (!pid) return false;
    for (let i = 0; i < 50; i++) {
        try { process.kill(pid, 0); } catch { return true; }
        await new Promise(res => setTimeout(res, 100));
    }
    return false;
}

describe('a server is reported at the address that answered', () => {
    it('the address it printed answers; shell_logs reads its output; shell_stop closes the port', async () => {
        const r = await start('run-start-a', { name: 'web', command: 'node eng-shell-server.js' });
        expect(r.ok).toBe(true);
        const served = r.output.served;
        expect(served).toMatchObject({ name: 'web', command: 'node eng-shell-server.js', cwd: '.', running: true });
        expect(served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect(served.port).toBe(Number(new URL(served.url).port));
        expect(r.output.text).toMatch(/It answered at http:\/\/127\.0\.0\.1:\d+\/ \(HTTP 200\)/);
        const page = await get(`${served.url}from-test`);
        expect(page.body).toBe('hello from the engine test');

        //  A native program's lines reach the pipe through PowerShell, measured
        //  ~0.6 s behind the program on this machine: read until the line is in.
        let read = await logs('run-start-a', { name: 'web' });
        for (let i = 0; i < 40 && !String(read.output.text).includes('request /from-test'); i++) {
            await new Promise(res => setTimeout(res, 250));
            read = await logs('run-start-a', { name: 'web' });
        }
        expect(read.ok).toBe(true);
        expect(read.output.text).toMatch(/"web" \(pid \d+\) is running/);
        expect(read.output.text).toContain('Server listening on');
        expect(read.output.text).toContain('request /from-test');
        const one = await logs('run-start-a', { name: 'web', lines: 1 });
        expect(one.output.text).toMatch(/Its last 1 of \d+ lines/);

        const stopped = await stop('run-start-a', { name: 'web' });
        expect(stopped.ok).toBe(true);
        expect(stopped.output.text).toMatch(new RegExp(`Stopped "web" \\(pid \\d+\\) after it ran \\d+\\.\\d s\\. Port ${served.port} is closed\\.`));
        expect(stopped.output.served.running).toBe(false);
        expect(await isLoopbackPortOpen(served.port, 500)).toBe(false);
        const again = await stop('run-start-a', { name: 'web' });
        expect(again.ok).toBe(true);
        expect(again.output.text).toMatch(/was stopped .* Nothing was left to stop\./);

        const saved = fs.readFileSync(path.join(root, r.output.log), 'utf8');
        expect(saved).toContain('Server listening on');
        expect(saved).toContain('request /from-test');
    });

    it('a wildcard address is reported as the loopback address that answered, never as printed', async () => {
        const r = await start('run-start-b', { name: 'wild', command: 'node eng-shell-wildcard.js' });
        expect(r.ok).toBe(true);
        expect(r.output.served.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        expect((await get(r.output.served.url)).body).toBe('wildcard');
        await stop('run-start-b', { name: 'wild' });
    });

    it('a server that prints nothing is found on the port it was given, which it receives as PORT', async () => {
        const port = await freePort();
        const r = await start('run-start-c', { name: 'quiet', command: 'node eng-shell-quiet-server.js', port });
        expect(r.ok).toBe(true);
        expect(r.output.served.port).toBe(port);
        expect(r.output.served.url).toMatch(new RegExp(`^http://(?:127\\.0\\.0\\.1|\\[::1\\]):${port}/$`));
        await stop('run-start-c', { name: 'quiet' });
        expect(await isLoopbackPortOpen(port, 500)).toBe(false);
    });

    it('Joe\'s own PORT is not the project\'s: with Joe\'s port taken, a server that falls back to its own port still starts', async () => {
        //  start-joe.ps1 starts Joe with PORT=5002; here a port the test holds plays Joe.
        const joe = http.createServer((req, res) => res.end('joe')).listen(0, '127.0.0.1');
        await new Promise(res => joe.once('listening', res));
        const joePort = (joe.address() as net.AddressInfo).port;
        const saved = process.env.PORT;
        process.env.PORT = String(joePort);
        try {
            const r = await start('run-start-m', { name: 'own-port', command: 'node eng-shell-default-port.js' });
            expect(r.output.text).not.toContain('cannot listen');
            expect(r.ok).toBe(true);
            expect(r.output.served.port).not.toBe(joePort);
            expect((await get(r.output.served.url)).body).toBe('own port');
            await stop('run-start-m', { name: 'own-port' });
        } finally {
            if (saved === undefined) delete process.env.PORT; else process.env.PORT = saved;
            await new Promise(res => joe.close(res));
        }
    });
});

describe('a process that does not serve is never given an address', () => {
    it('one that exits first is not ok, with its exit code and what it printed, and without waiting for the timeout', async () => {
        const started = Date.now();
        const r = await start('run-start-d', { name: 'broken', command: 'node eng-shell-crash.js' });
        expect(r.ok).toBe(false);
        expect(r.output.served).toMatchObject({ name: 'broken', running: false, exitCode: 2 });
        expect(r.output.served.url).toBeUndefined();
        expect(r.output.text).toMatch(/"broken" \(pid \d+\) exited with code 2 \d+\.\d s after it started, before any address answered\./);
        expect(r.output.text).toContain('cannot start: missing config');
        expect(Date.now() - started).toBeLessThan(60_000);
    });

    it('an address it printed but never served is tried and reported as not answering', async () => {
        //  Long enough for a shell to start on a loaded machine and print the address.
        const r = await start('run-start-e', { name: 'liar', command: 'node eng-shell-never-serves.js', ready_timeout_ms: 25_000 });
        expect(r.ok).toBe(false);
        expect(r.output.served.running).toBe(true);
        expect(r.output.served.url).toBeUndefined();
        expect(r.output.text).toMatch(/is still running, but it is not serving yet\. No address answered within 25 s \(tried: http:\/\/127\.0\.0\.1:1\/\)\./);
        expect((await stop('run-start-e', { name: 'liar' })).ok).toBe(true);
    });

    it('an open port that answers 500 or above is not ready: the address is reported once it answers below 500', async () => {
        const r = await start('run-start-p', { name: 'warming', command: 'node eng-shell-warming.js' });
        expect(r.ok).toBe(true);
        expect(r.output.text).toMatch(/It answered at http:\/\/127\.0\.0\.1:\d+\/ \(HTTP 200\)/);
        //  The server's own log of what the readiness check asked it, read until the 200 is in.
        let read = await logs('run-start-p', { name: 'warming' });
        for (let i = 0; i < 40 && !String(read.output.text).includes('status 200'); i++) {
            await new Promise(res => setTimeout(res, 250));
            read = await logs('run-start-p', { name: 'warming' });
        }
        expect(read.output.text).toContain('request 1 status 503');
        expect(read.output.text).toContain('request 2 status 503');
        expect(read.output.text).toContain('request 3 status 200');
        await stop('run-start-p', { name: 'warming' });
    });

    it('a port that was busy before the start belongs to someone else and is not taken as the new process\'s address', async () => {
        const port = await freePort();
        const other = http.createServer((req, res) => res.end('somebody else')).listen(port, '127.0.0.1');
        await new Promise(res => other.once('listening', res));
        try {
            const r = await start('run-start-f', { name: 'late', command: 'node eng-shell-silent.js', port, ready_timeout_ms: 3000 });
            expect(r.ok).toBe(false);
            expect(r.output.served.url).toBeUndefined();
            expect(r.output.text).toContain(`Port ${port} was already in use before "late" started`);
            await stop('run-start-f', { name: 'late' });
        } finally {
            await new Promise(res => other.close(res));
        }
    });
});

describe('the run owns what it started', () => {
    it('starting a name that is already running stops the old process first', async () => {
        const first = await start('run-start-g', { name: 'web', command: 'node eng-shell-server.js' });
        expect(first.ok).toBe(true);
        const second = await start('run-start-g', { name: 'web', command: 'node eng-shell-server.js' });
        expect(second.ok).toBe(true);
        expect(second.output.text).toMatch(/The "web" that was already running \(pid \d+\) was stopped first\./);
        expect(second.output.served.pid).not.toBe(first.output.served.pid);
        expect(await gone(first.output.served.pid)).toBe(true);
        expect(await isLoopbackPortOpen(first.output.served.port, 500)).toBe(false);
        expect(listRunProcesses('run-start-g').map(p => p.name)).toEqual(['web']);
        await stop('run-start-g', { name: 'web' });
    });

    (process.platform === 'win32' || process.platform === 'linux' ? it : it.skip)('a server whose shell died first is still found and stopped', async () => {
        //  `; echo done` keeps the shell waiting as the server's parent. Killing
        //  the shell alone is what a tree kill that did not finish leaves: the
        //  server serving on, with a parent that no longer exists.
        const r = await start('run-start-k', { name: 'orphaned', command: 'node eng-shell-server.js; echo done' });
        expect(r.ok).toBe(true);
        const { pid, port } = r.output.served;
        process.kill(pid);
        expect(await gone(pid)).toBe(true);
        expect(await isLoopbackPortOpen(port, 500)).toBe(true);
        const stopped = await stop('run-start-k', { name: 'orphaned' });
        expect(stopped.ok).toBe(true);
        expect(stopped.output.text).toContain(`Port ${port} is closed.`);
        expect(await isLoopbackPortOpen(port, 500)).toBe(false);
    });

    it('stopAllForRun stops every process of the run and forgets the run', async () => {
        const a = await start('run-start-h', { name: 'a', command: 'node eng-shell-server.js' });
        const b = await start('run-start-h', { name: 'b', command: 'node eng-shell-server.js' });
        expect(a.ok && b.ok).toBe(true);
        expect(listRunProcesses('run-start-h').filter(p => p.running).length).toBe(2);
        await stopAllForRun('run-start-h');
        expect(listRunProcesses('run-start-h')).toEqual([]);
        expect(await isLoopbackPortOpen(a.output.served.port, 500)).toBe(false);
        expect(await isLoopbackPortOpen(b.output.served.port, 500)).toBe(false);
        expect(await gone(a.output.served.pid)).toBe(true);
    });

    it('inside a request scope, the end of the scope stops what the run left running', async () => {
        let served: any;
        await requestResourceManager.run({ requestId: 'request-engine-shell' }, async () => {
            const r = await start('run-start-i', { name: 'scoped', command: 'node eng-shell-server.js' });
            expect(r.ok).toBe(true);
            served = r.output.served;
        });
        expect(listRunProcesses('run-start-i')).toEqual([]);
        expect(await isLoopbackPortOpen(served.port, 500)).toBe(false);
        expect(await gone(served.pid)).toBe(true);
    });

    /**
     * The kernel's handle of a process that does not end and ignores its
     * kill, until the test ends it. Only the next start gets it.
     */
    function stuckHandle(pid?: number) {
        const kills: number[] = [];
        let end: () => void = () => {};
        const done = new Promise<{ ok: boolean; exitCode: number | null; error?: string }>(res => { end = () => res({ ok: false, exitCode: null, error: 'ended by the test' }); });
        const launches = jest.spyOn(ExecutionGateway, 'startManaged').mockImplementationOnce(() => ({
            pid, done, kill: () => { kills.push(Date.now()); },
        }) as any);
        return { kills, launches, end: () => end() };
    }

    it('a same-name process that does not exit is not replaced: it stays tracked, and a later stop tries again', async () => {
        const stuck = stuckHandle();
        try {
            const first = await start('run-start-n', { name: 'stuck', command: 'node eng-shell-silent.js', ready_timeout_ms: 1000 });
            expect(first.ok).toBe(false);
            expect(first.output.served.running).toBe(true);
            expect(stuck.launches).toHaveBeenCalledTimes(1);
            const second = await start('run-start-n', { name: 'stuck', command: 'node eng-shell-server.js' });
            expect(second.ok).toBe(false);
            expect(second.output.text).toMatch(/The "stuck" that was already running \(pid \?\) was told to stop but had not exited after \d+ s, so nothing new was started\./);
            expect(second.output.served).toMatchObject({ name: 'stuck', running: true });
            expect(stuck.launches).toHaveBeenCalledTimes(1);
            expect(listRunProcesses('run-start-n')).toEqual([expect.objectContaining({ name: 'stuck', running: true, command: 'node eng-shell-silent.js' })]);
            const afterFirstStop = stuck.kills.length;
            expect(afterFirstStop).toBeGreaterThan(0);
            const again = await stop('run-start-n', { name: 'stuck' });
            expect(again.ok).toBe(false);
            expect(again.output.text).toMatch(/"stuck" was told to stop, but it had not exited after \d+ s\./);
            expect(stuck.kills.length).toBe(afterFirstStop * 2);
        } finally {
            stuck.end();
        }
    });

    it('a start still getting ready when the run\'s processes are stopped starts nothing', async () => {
        const real = ProjectRun.isLoopbackPortOpen;
        let reached: () => void = () => {};
        const atProbe = new Promise<void>(res => { reached = res; });
        let release: () => void = () => {};
        const gate = new Promise<void>(res => { release = res; });
        jest.spyOn(ProjectRun, 'isLoopbackPortOpen').mockImplementation(async (port: number, ms?: number) => {
            reached();
            await gate;
            return real(port, ms);
        });
        const launches = jest.spyOn(ExecutionGateway, 'startManaged');
        const pending = start('run-start-l', { name: 'late', command: 'node eng-shell-server.js' });
        await atProbe;
        await stopAllForRun('run-start-l');
        release();
        const r = await pending;
        expect(r.ok).toBe(false);
        expect(r.output.text).toBe('The run was stopped; nothing was started.');
        expect(launches).not.toHaveBeenCalled();
        expect(listRunProcesses('run-start-l')).toEqual([]);
    });

    (process.platform === 'win32' ? it : it.skip)('a pid that is no longer the shell this run started is never killed', async () => {
        //  What Windows can do between a shell's exit and the watch seeing it
        //  gone: give its pid to another program. Here that program is a node
        //  process the test owns, reported as the root of a process.
        const stranger = spawnChild(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
        let stuck: ReturnType<typeof stuckHandle> | undefined;
        try {
            await new Promise(res => stranger.once('spawn', res));
            stuck = stuckHandle(stranger.pid);
            const r = await start('run-start-o', { name: 'reused', command: 'node eng-shell-silent.js', ready_timeout_ms: 1000 });
            expect(r.output.served.pid).toBe(stranger.pid);
            await stop('run-start-o', { name: 'reused' });
            expect(stranger.exitCode).toBeNull();
            expect(() => process.kill(stranger.pid!, 0)).not.toThrow();
        } finally {
            stuck?.end();
            stranger.kill();
        }
    });

    it('a name that does not exist, an invalid name and a call without a run are refused', async () => {
        const unknown = await logs('run-start-j', { name: 'nope' });
        expect(unknown.ok).toBe(false);
        expect(unknown.output.text).toMatch(/There is no process named "nope" in this run\./);
        expect((await stop('run-start-j', { name: 'nope' })).ok).toBe(false);
        expect((await start('run-start-j', { name: 'bad name!', command: 'node eng-shell-server.js' })).output.text).toMatch(/needs a "name"/);
        const noRun = await inFirewall(() => startShellProcess({ name: 'web', command: 'node eng-shell-server.js' }, { projectRoot: root, workspaceId: 'ws-engine-shell' }));
        expect(noRun.ok).toBe(false);
        expect(noRun.output.text).toMatch(/No run is bound to this call/);
        expect(listRunProcesses('run-start-j')).toEqual([]);
    });
});
