/**
 * AN OWNER'S PDF IS NEVER THE DELIVERY'S (review 3 of r40, finding 9).
 *
 * The look reads the PDFs «the delivery wrote»: new or changed since the run
 * began, by the times kept at run start. When that map was missing — more than
 * 200 runs in one process (the server), a Joe restart or resume, a verify run
 * outside the engine loop — every project PDF counted as new: an owner's
 * contract in docs/ or his sample invoices were read by the proof child, named
 * in the chat and the notes, and their lines went to the builder. Now no project
 * PDF counts without the run's start, and the start is kept with the run in its
 * state folder, so a restarted Joe still knows it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { forgetRunStartsInMemoryForTests, lookAtPdfs, pdfsAtRunStart, rememberPdfsAtRunStart, RUN_START_FILE, writtenPdfs } from '../core/quality/outside-probe';

jest.setTimeout(120_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r40-owner-pdf-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
const PDF = '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n';
let n = 0;
const project = () => {
    const dir = path.join(tmp, `p${++n}`);
    fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'docs', 'contract.pdf'), PDF);
    fs.writeFileSync(path.join(dir, 'docs', 'sample-invoice.pdf'), PDF);
    return dir;
};

describe('without the run\'s start, no project PDF is the delivery\'s', () => {
    it('writtenPdfs with no run-start map answers nothing, never every PDF of the project', async () => {
        const dir = project();
        expect(await writtenPdfs(dir, undefined)).toEqual([]);
    });

    it('the look of a run whose start Joe never saw reads no owner PDF: nothing to look at', async () => {
        const dir = project();
        const look = await lookAtPdfs({
            root: dir, stateDir: path.join(dir, '.joe'), runId: 'a-run-joe-never-started', request: 'نظام فواتير', language: 'ar',
            servedIndex: null, captured: [], deadlineAt: Date.now() + 5 * 60_000,
        });
        expect(look).toBeNull();
    });
});

describe('the run\'s start is kept with the run', () => {
    it('after a restart (the memory copy gone) the start is read from the run\'s state folder: the owner\'s PDFs stay his, the new one is the delivery\'s', async () => {
        const dir = project();
        const stateDir = path.join(dir, '.joe');
        await rememberPdfsAtRunStart('run-restarted', dir, stateDir);
        expect(fs.existsSync(path.join(stateDir, RUN_START_FILE))).toBe(true);
        forgetRunStartsInMemoryForTests();
        fs.writeFileSync(path.join(dir, 'invoice-1001.pdf'), PDF);
        const before = await pdfsAtRunStart('run-restarted', stateDir);
        expect(before).toBeDefined();
        expect([...before!.keys()].sort()).toEqual(['docs/contract.pdf', 'docs/sample-invoice.pdf']);
        expect((await writtenPdfs(dir, before)).map(w => w.rel)).toEqual(['invoice-1001.pdf']);
        //  Another run of the same project, unknown: still nothing.
        expect(await pdfsAtRunStart('another-run', stateDir)).toBeUndefined();
    });

    it('more than 200 runs in one process: the oldest run still knows its start from disk', async () => {
        const dir = project();
        const stateDir = path.join(dir, '.joe');
        await rememberPdfsAtRunStart('run-first', dir, stateDir);
        for (let i = 0; i < 205; i++) await rememberPdfsAtRunStart(`run-busy-${i}`, path.join(tmp, 'empty-project'));
        const before = await pdfsAtRunStart('run-first', stateDir);
        expect(before && [...before.keys()].sort()).toEqual(['docs/contract.pdf', 'docs/sample-invoice.pdf']);
    });
});
