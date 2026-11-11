/**
 * ⛔ RUN EVIDENCE IS ONE FILE PER RUN, READ FROM MEMORY, WRITTEN IN BATCHES.
 *
 * The 500-prompt exam, 2026-11-03 (P155): every event of every run read the
 * one 24.6 MB evidence file four times and wrote all of it back. Forty minutes
 * after the library system's run had ended, its receipt still could not be
 * read — the request waited behind that run's own event writes — and the
 * exam waited on it. Each run made every later event slower.
 *
 * Measured here on a real directory: hundreds of events cost a handful of
 * writes and no reads, a receipt is on disk when its call returns, the old
 * single file is moved in once, and the bound on records still holds.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MAX_RUN_RECORDS, RunEvidenceShelf } from '../shared/run-evidence-store';

jest.setTimeout(60_000);

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const shelfDir = () => {
    const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-evidence-'));
    dirs.push(root);
    return path.join(root, 'run-evidence');
};
const record = (runId: string, extra: Record<string, unknown> = {}) => ({
    runId, id: runId, sessionId: 's1', startedAt: '2026-11-03T00:00:00Z', updatedAt: '2026-11-03T00:00:00Z', status: 'running', events: [], ...extra,
});

describe('the evidence shelf', () => {
    it('hundreds of events are a few writes and no reads, and each run is its own file', async () => {
        const dir = shelfDir();
        const shelf = new RunEvidenceShelf(dir);
        await shelf.create(record('run-a') as any);
        await shelf.flush();
        const writes = jest.spyOn(fs.promises, 'writeFile');
        const reads = jest.spyOn(fs.promises, 'readFile');
        try {
            for (let i = 0; i < 300; i++) {
                const current = (await shelf.findOne({ runId: 'run-a' }))!;
                await shelf.updateOne({ runId: 'run-a' }, { ...current, events: [...current.events, { type: 'step', seq: i }] });
            }
            await shelf.flush();
            expect(reads).not.toHaveBeenCalled();
            expect(writes.mock.calls.length).toBeLessThanOrEqual(10); // 300 events, not 300 writes
        } finally {
            writes.mockRestore();
            reads.mockRestore();
        }
        const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'run-a.json'), 'utf-8'));
        expect(onDisk.events).toHaveLength(300);
        expect(fs.readdirSync(dir).filter(n => n.endsWith('.json'))).toEqual(['run-a.json']);
    });

    it('what one process wrote, the next one reads back', async () => {
        const dir = shelfDir();
        const first = new RunEvidenceShelf(dir);
        await first.create(record('run-b', { status: 'done', receipt: { status: 'done' } }) as any);
        await first.flush();
        const second = new RunEvidenceShelf(dir);
        expect(await second.findOne({ runId: 'run-b' })).toMatchObject({ status: 'done', receipt: { status: 'done' } });
        expect(await second.find({ status: 'running' })).toEqual([]);
    });

    it('the old single file is moved in once and set aside', async () => {
        const dir = shelfDir();
        const legacy = path.join(path.dirname(dir), 'run-evidence.json');
        fs.writeFileSync(legacy, JSON.stringify([record('old-1'), record('old-2', { status: 'done' })]));
        const shelf = new RunEvidenceShelf(dir);
        expect((await shelf.find()).map(r => r.runId).sort()).toEqual(['old-1', 'old-2']);
        await shelf.flush();
        expect(fs.existsSync(legacy)).toBe(false);
        expect(fs.readdirSync(path.dirname(dir)).some(n => n.startsWith('run-evidence.json.migrated-'))).toBe(true);
        expect(fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()).toEqual(['old-1.json', 'old-2.json']);
    });

    it('a deleted run leaves no file behind', async () => {
        const dir = shelfDir();
        const shelf = new RunEvidenceShelf(dir);
        await shelf.create(record('gone') as any);
        await shelf.flush();
        await shelf.deleteOne({ runId: 'gone' });
        await shelf.flush();
        expect(fs.existsSync(path.join(dir, 'gone.json'))).toBe(false);
        expect(await shelf.findOne({ runId: 'gone' })).toBeNull();
    });
});

describe('the store functions on the shelf', () => {
    //  The module's own store, as the API uses it (data/db/run-evidence under the test cwd).
    const store = require('../shared/run-evidence-store');
    const rid = (label: string) => `per-run-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    it('a run with hundreds of events still answers its receipt at once', async () => {
        const runId = rid('busy');
        await store.createRunEvidence(runId, { sessionId: 'busy' });
        const appends: Promise<void>[] = [];
        for (let i = 0; i < 400; i++) appends.push(store.appendRunEvidenceEvent(runId, { type: 'engine_step', seq: i, data: { text: `step ${i}`.repeat(20) } }));
        await store.saveRunReceipt(runId, { status: 'done' }, 'done');
        const t0 = Date.now();
        const evidence = await store.getRunEvidence(runId);
        expect(Date.now() - t0).toBeLessThan(1_000);
        expect(evidence).toMatchObject({ status: 'done', receipt: { status: 'done' } });
        await Promise.all(appends);
        //  Durable when the receipt call returned: the run's own file says so.
        const file = path.join(process.cwd(), 'data', 'db', 'run-evidence', `${encodeURIComponent(runId)}.json`);
        expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toMatchObject({ status: 'done' });
    });

    it('the bound on records still holds', async () => {
        const shelfRecords = await store.runEvidenceStore.find();
        expect(shelfRecords.length).toBeLessThanOrEqual(MAX_RUN_RECORDS);
    });
});
