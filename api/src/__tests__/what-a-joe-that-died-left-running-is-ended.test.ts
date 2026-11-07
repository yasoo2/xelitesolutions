/**
 *  WHAT A JOE THAT DIED LEFT RUNNING IS ENDED BY THE NEXT ONE.
 *
 *  2026-11-06, 12:25: the test Joe aborted natively in the middle of a run.
 *  The `python -m http.server 5173` that run had started was still serving at
 *  19:30, its parent shell gone, and nothing anywhere knew it was Joe's: a
 *  run's processes are stopped at the end of the run, and a Joe that dies
 *  never reaches the end. Windows does not end children with their parent.
 *
 *  kernel/process-ledger.ts writes down every long-lived child the engine
 *  starts (pid + when it started, and the same for its Joe); a Joe that boots
 *  ends what a Joe that is no longer alive left. The first half holds the plan
 *  to its rules with plain data, the second runs real processes: a server a
 *  shell left behind, and a server whose shell is still running, both owned
 *  by a Joe that has died — and a server of a Joe that is alive, left alone.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import {
    disableProcessLedger, enableProcessLedger, forgetChild, KEPT_CLOSED, ledgerFileFor, parseProcessListing, parsePsElapsed,
    planReap, pruned, readLedger, recordChild, writeLedger,
} from '../kernel/process-ledger';
import type { ChildRecord, LiveProcess, Owner } from '../kernel/process-ledger';
import { executionEngine } from '../kernel/ExecutionEngine';

const T0 = 1_780_000_000_000;
const SELF: Owner = { pid: 900, startedMs: T0, parentPid: 899 };
const DEAD_JOE = { ownerPid: 700, ownerStartedMs: T0 - 3_600_000 };

function rec(over: Partial<ChildRecord>): ChildRecord {
    return { pid: 1000, startedMs: T0 - 600_000, program: 'powershell.exe', group: false, ...DEAD_JOE, ...over };
}
function proc(pid: number, ppid: number, startedMs: number): LiveProcess {
    return { pid, ppid, startedMs };
}

describe('the plan: what is ended and what is never touched', () => {
    test('a record of this Joe is kept, whatever runs', () => {
        const r = rec({ ownerPid: SELF.pid, ownerStartedMs: SELF.startedMs + 40 });
        const plan = planReap([r], [proc(1000, SELF.pid, r.startedMs)], SELF, 'win32');
        expect(plan).toEqual({ trees: [], groups: [], reaped: [], keep: [r] });
    });

    test('a record of another Joe that is alive is kept', () => {
        const r = rec({ ownerPid: 800, ownerStartedMs: T0 - 1000 });
        const plan = planReap([r], [proc(800, 1, T0 - 1200), proc(1000, 800, r.startedMs)], SELF, 'win32');
        expect(plan.trees).toEqual([]);
        expect(plan.keep).toEqual([r]);
    });

    test('a Joe whose pid now belongs to a newer process is dead: its child is ended with its tree', () => {
        const r = rec({});
        const plan = planReap([r], [proc(700, 1, T0 - 10), proc(1000, 1, r.startedMs + 30)], SELF, 'win32');
        expect(plan.trees).toEqual([1000]);
        expect(plan.reaped).toEqual([r]);
    });

    test('a pid that another program took after the record ended is never ended', () => {
        const r = rec({ closedMs: T0 - 500_000 });
        const plan = planReap([r], [proc(1000, 4, T0 - 100_000)], SELF, 'win32');
        expect(plan.trees).toEqual([]);
        expect(plan.reaped).toEqual([r]);
    });

    test('Windows: the server a shell left behind is found by its parent pid and the times', () => {
        const r = rec({ closedMs: T0 - 590_000 });
        const live = [
            proc(2000, 1000, r.startedMs + 800),          // the server the shell started
            proc(2001, 1000, r.startedMs - 60_000),       // older than the shell: another parent's child, pid reused
            proc(2002, 1000, r.closedMs! + 120_000),      // started after the shell ended: not its child
        ];
        expect(planReap([r], live, SELF, 'win32').trees).toEqual([2000]);
    });

    test('Windows: an open record whose shell is gone, with a newcomer on its pid', () => {
        const r = rec({});
        const live = [
            proc(1000, 4, r.startedMs + 200_000),         // the newcomer now holding the pid
            proc(2000, 1000, r.startedMs + 500),          // the shell's server: before the newcomer
            proc(2003, 1000, r.startedMs + 250_000),      // the newcomer's own child
        ];
        expect(planReap([r], live, SELF, 'win32').trees).toEqual([2000]);
    });

    test('Joe himself and the process that started him are never ended', () => {
        const r1 = rec({ pid: SELF.pid, startedMs: SELF.startedMs });
        const r2 = rec({ pid: 1000, closedMs: T0 - 1 });
        const live = [proc(SELF.pid, SELF.parentPid!, SELF.startedMs), proc(SELF.parentPid!, 1000, T0 - 600_000 + 10)];
        const plan = planReap([r1, r2], live, SELF, 'win32');
        expect(plan.trees).toEqual([]);
    });

    test('POSIX: a group is ended by its id while no other process holds it, never a reused one', () => {
        const open = rec({ pid: 1000, group: true });
        const gone = rec({ pid: 1001, group: true, closedMs: T0 - 1 });
        const reused = rec({ pid: 1002, group: true, closedMs: T0 - 1 });
        const plain = rec({ pid: 1003, group: false });
        const live = [proc(1000, 1, open.startedMs + 100), proc(1002, 1, T0 - 100), proc(1003, 1, plain.startedMs)];
        const plan = planReap([open, gone, reused, plain], live, SELF, 'linux');
        expect(plan.groups.sort()).toEqual([1000, 1001]);
        expect(plan.trees).toEqual([1003]);
    });

    test('the two listings are read as pid, parent and start', () => {
        expect(parseProcessListing('4 0 1780000000000\r\n\r\n  1234 4 1780000001000 \r\nnoise\n'))
            .toEqual([proc(4, 0, 1_780_000_000_000), proc(1234, 4, 1_780_000_001_000)]);
        expect(parsePsElapsed('  1     0 3600\n 42 1 5\n', T0)).toEqual([proc(1, 0, T0 - 3_600_000), proc(42, 1, T0 - 5_000)]);
    });
});

describe('the ledger file', () => {
    let dir = '';
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ledger-')); });
    afterEach(() => { disableProcessLedger(); fs.rmSync(dir, { recursive: true, force: true }); });

    test('it lives in his data folder', () => {
        expect(ledgerFileFor({ JOE_DATA_DIR: dir } as any, 'C:/x')).toBe(path.resolve(dir, 'runtime', 'child-processes.json'));
        expect(ledgerFileFor({} as any, dir)).toBe(path.resolve(dir, 'data', 'runtime', 'child-processes.json'));
    });

    test('off until the server turns it on: nothing is written', () => {
        expect(recordChild(1234, 'node.exe')).toBeNull();
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('a child is written when it starts and marked, not dropped, when it ends', () => {
        const file = path.join(dir, 'runtime', 'child-processes.json');
        enableProcessLedger(file);
        const r = recordChild(1234, 'C:\\Windows\\powershell.exe')!;
        expect(readLedger()).toEqual([{ ...r, program: 'powershell.exe' }]);
        forgetChild(r, r.startedMs + 5);
        expect(readLedger()).toEqual([{ ...r, program: 'powershell.exe', closedMs: r.startedMs + 5 }]);
    });

    test('only the newest ended records are kept; open ones always are', () => {
        const open = rec({ pid: 1 });
        const ended = Array.from({ length: KEPT_CLOSED + 5 }, (_, i) => rec({ pid: 10 + i, closedMs: T0 + i }));
        const kept = pruned([open, ...ended]);
        expect(kept).toContain(open);
        expect(kept.length).toBe(KEPT_CLOSED + 1);
        expect(kept.some(r => r.pid === 10)).toBe(false);
    });
});

/* ───────────────────────── real processes ───────────────────────── */

const WINDOWS = process.platform === 'win32';

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => { const port = (s.address() as net.AddressInfo).port; s.close(() => resolve(port)); });
    });
}

function answers(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, res => { res.resume(); resolve(true); });
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.on('error', () => resolve(false));
    });
}

async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await check()) return true;
        await new Promise(r => setTimeout(r, 250));
    }
    return check();
}

/** A Joe that has died: a process that ran and ended. */
function deadOwner(): Promise<{ ownerPid: number; ownerStartedMs: number }> {
    return new Promise((resolve, reject) => {
        const startedMs = Date.now();
        const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore', windowsHide: true });
        child.once('error', reject);
        child.once('exit', () => resolve({ ownerPid: child.pid!, ownerStartedMs: startedMs }));
    });
}

(WINDOWS ? describe : describe.skip)('a Joe that boots ends what a dead Joe left (real processes)', () => {
    let dir = '';
    const handles: Array<{ kill: () => void }> = [];
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-reap-'));
        enableProcessLedger(path.join(dir, 'runtime', 'child-processes.json'));
    });
    afterEach(() => {
        for (const h of handles.splice(0)) { try { h.kill(); } catch { /* gone */ } }
        disableProcessLedger();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    function serverFile(port: number): string {
        const file = path.join(dir, `server-${port}.js`);
        fs.writeFileSync(file, `require('http').createServer((q, s) => s.end('ok')).listen(${port}, '127.0.0.1'); setTimeout(() => process.exit(0), 240000);`);
        return file;
    }

    test('the server a shell left behind, and a server under a living shell: both ended; a living Joe\'s server is not', async () => {
        const left = await freePort();
        const under = await freePort();
        const mine = await freePort();
        //  1. A shell that starts a server and ends: the shape of 12:24.
        const leftShell = executionEngine.runArgvStreaming('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
            `Start-Process -WindowStyle Hidden -FilePath '${process.execPath}' -ArgumentList '${serverFile(left)}'`]);
        handles.push(leftShell);
        //  2. A shell still running its server in the foreground.
        const underShell = executionEngine.runArgvStreaming('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
            `& '${process.execPath}' '${serverFile(under)}'`]);
        handles.push(underShell);
        await leftShell.done;
        expect(await until(() => answers(left), 20_000)).toBe(true);
        expect(await until(() => answers(under), 20_000)).toBe(true);
        //  THE FAULT ITSELF: the shell has ended and its server serves on.
        expect(await answers(left)).toBe(true);

        //  Both shells belong to a Joe that has died.
        const dead = await deadOwner();
        const records = readLedger();
        expect(records.map(r => r.pid).sort()).toEqual([leftShell.pid, underShell.pid].sort());
        expect(records.find(r => r.pid === leftShell.pid)?.closedMs).toBeGreaterThan(0);
        writeLedger(records.map(r => ({ ...r, ...dead })));

        //  3. A server of this Joe, who is alive: written after, never touched.
        const mineShell = executionEngine.runArgvStreaming('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
            `& '${process.execPath}' '${serverFile(mine)}'`]);
        handles.push(mineShell);
        expect(await until(() => answers(mine), 20_000)).toBe(true);

        const result = await executionEngine.reapPreviousLife();
        expect(result.error).toBeUndefined();
        expect(result.reaped).toBe(2);
        expect(await until(async () => !(await answers(left)), 15_000)).toBe(true);
        expect(await until(async () => !(await answers(under)), 15_000)).toBe(true);
        expect(await answers(mine)).toBe(true);
        //  The reaped records leave the ledger; this Joe's stays.
        expect(readLedger().map(r => r.pid)).toEqual([mineShell.pid]);
        //  A second boot finds nothing more to do.
        expect((await executionEngine.reapPreviousLife()).reaped).toBe(0);
    }, 240_000);
});
