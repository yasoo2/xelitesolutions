/**
 * TWO JOES ON ONE LEDGER ADD THEIR SPEND; NEITHER WRITES OVER THE OTHER.
 *
 * 2026-11-12: a second Joe (port 5097) ran a paid exam beside the test Joe
 * (5047), both on D:\Joe\eval\data\engine-spend.json. Each held the ledger in
 * memory and wrote its whole copy back on every charge, so each write erased
 * the calls the other had made since it last read the file — and the budget
 * check of each counted only its own spend. On a server with several workers
 * that is every write. Here two ledgers on one file stand for two processes.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SpendLedger } from '../core/engine/budget';

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });
function ledgerFile(): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-two-ledgers-'));
    roots.push(dir);
    return path.join(dir, 'engine-spend.json');
}
const usage = { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWrite5mTokens: 0, cacheWrite1hTokens: 0 };
async function charge(l: SpendLedger, runId: string, usd: number): Promise<void> {
    const r = await l.reserve(runId, usd);
    await r.charge({ at: Date.now(), model: 'claude-haiku-5-5', costUsd: usd, usage, purpose: 'test' });
}
const onDisk = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8'));

describe('two Joes on one ledger', () => {
    it('every charge of both is in the file, whatever order they wrote in', async () => {
        const file = ledgerFile();
        const a = new SpendLedger(file, 100, 10);
        const b = new SpendLedger(file, 100, 10);
        //  Both read the (empty) file first, as two processes started apart would.
        await a.spent(); await b.spent();
        const work: Promise<void>[] = [];
        for (let i = 0; i < 20; i++) {
            work.push(charge(a, 'run-a', 0.01));
            work.push(charge(b, 'run-b', 0.02));
        }
        await Promise.all(work);
        await a.flushed(); await b.flushed();
        const f = onDisk(file);
        expect(f.calls).toBe(40);
        expect(f.totalUsd).toBeCloseTo(20 * 0.01 + 20 * 0.02, 9);
        expect(f.byRun['run-a'].calls).toBe(20);
        expect(f.byRun['run-b'].calls).toBe(20);
        expect(f.byRun['run-b'].usd).toBeCloseTo(0.4, 9);
        expect(f.recent.length).toBe(40);
        expect(fs.existsSync(`${file}.lock`)).toBe(false);
    });

    it('a ledger that was written before this process started is added to, not replaced', async () => {
        const file = ledgerFile();
        const first = new SpendLedger(file, 100, 10);
        await charge(first, 'run-old', 1.5);
        await first.flushed();
        const later = new SpendLedger(file, 100, 10);
        await charge(first, 'run-old', 0.5);   // the first process goes on charging…
        await charge(later, 'run-new', 0.25);  // …while the later one, loaded before that, charges too
        await first.flushed(); await later.flushed();
        const f = onDisk(file);
        expect(f.totalUsd).toBeCloseTo(2.25, 9);
        expect(f.byRun['run-old'].usd).toBeCloseTo(2, 9);
        expect(f.byRun['run-new'].usd).toBeCloseTo(0.25, 9);
    });

    it('the total budget counts what the other process spent', async () => {
        const file = ledgerFile();
        const a = new SpendLedger(file, 1, 1);
        const b = new SpendLedger(file, 1, 1);
        await b.spent();
        await charge(a, 'run-a', 0.9);
        await a.flushed();
        //  The other process reads the file again once it changed (at most once a second).
        await new Promise(r => setTimeout(r, 1100));
        expect((await b.spent()).totalUsd).toBeCloseTo(0.9, 9);
        await expect(b.reserve('run-b', 0.2)).rejects.toMatchObject({ code: 'ENGINE_BUDGET_EXHAUSTED' });
    });

    it('a lock left by a process that died does not stop the next write', async () => {
        const file = ledgerFile();
        fs.writeFileSync(`${file}.lock`, 'dead');
        const old = new Date(Date.now() - 60_000);
        fs.utimesSync(`${file}.lock`, old, old);
        const l = new SpendLedger(file, 10, 3);
        await charge(l, 'run-x', 0.1);
        await l.flushed();
        expect(onDisk(file).totalUsd).toBeCloseTo(0.1, 9);
        expect(fs.existsSync(`${file}.lock`)).toBe(false);
    });
});
