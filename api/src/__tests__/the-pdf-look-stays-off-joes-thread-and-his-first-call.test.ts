/**
 * THE PDF LOOK STAYS OFF JOE'S THREAD AND OFF THE BUILDER'S FIRST CALL
 * (review 3 of r40, findings 7, 8 and 11).
 *
 * - 7: the font search walked every dependency's node_modules folder with
 *   readdirSync/statSync — 1.7 s cold, 0.4–0.9 s warm on api/, all on the thread
 *   every other user's run shares.
 * - 8: the request gate held bare substrings («طب» in «تطبيق», «دي» in «جديد»,
 *   "cop" in "scope"), so almost every request paid a scan child, and the loop
 *   awaited it before the first model call (about 2 s). After a write, every step
 *   that wrote a file holding "canvas", "print" or "pdf" paid a new child, all run
 *   long, in a left-to-right Chart.js dashboard that never gets the brief.
 * - 11: every scan or proof call added a `cancel.then(kill)` to the run's own
 *   long-lived `cancelled` promise.
 * No model is called; the scan and proof children are real.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getEventListeners } from 'events';
import { mayAskPdf, scanText, findJoeAsset } from '../core/quality/outside-scan';
import { dependencyFontFiles, projectFontFiles, provePdfs } from '../core/quality/outside-proof';
import { pdfBriefAfterWrite, pdfBriefAtStart, type PdfBriefState } from '../core/engine/pdf-brief';
import { runEngine, type EngineDeps } from '../core/engine/loop';
import { finishTool, type Verifier } from '../core/engine/finish';
import { planUpdateTool } from '../core/engine/plan';
import type { BrowserSession, ChatMessage, EngineEvent, EngineModel, ModelStep, ProcessRegistry, ToolSchema, VerificationReport } from '../core/engine/types';
import { executionEngine } from '../kernel/ExecutionEngine';

jest.setTimeout(300_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r40-pdf-thread-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
let n = 0;
const project = (files: Record<string, string | Buffer> = {}) => {
    const dir = path.join(tmp, `p${++n}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); }
    return dir;
};
const facts = (dir: string, request: string, language: string) => ({ runId: `run-${path.basename(dir)}`, request, language, projectDir: dir });

/** Every child the PDF code starts goes through runArgvStreaming: count them, and keep what each was handed. */
function countChildren() {
    const calls: any[] = [];
    const original = executionEngine.runArgvStreaming.bind(executionEngine);
    const spy = jest.spyOn(executionEngine, 'runArgvStreaming').mockImplementation(((...args: any[]) => { calls.push(args[2] || {}); return (original as any)(...args); }) as any);
    return { calls, restore: () => spy.mockRestore() };
}

describe('7 — the font search never blocks Joe\'s thread', () => {
    it('dependencyFontFiles is asynchronous, finds the same fonts, and calls no synchronous fs at all', async () => {
        const dir = project({
            'package.json': JSON.stringify({ dependencies: { '@fontsource/cairo': '5.0.0', 'left-pad': '1.0.0' } }),
            'node_modules/@fontsource/cairo/files/cairo-arabic-400-normal.woff2': Buffer.from('wOF2fakefont'),
            'node_modules/@fontsource/cairo/files/cairo-latin-400-normal.woff2': Buffer.from('wOF2fakefont'),
            'node_modules/left-pad/index.js': 'module.exports = 1;',
        });
        const readdirSync = jest.spyOn(fs, 'readdirSync');
        const statSync = jest.spyOn(fs, 'statSync');
        try {
            const pending = dependencyFontFiles(dir) as unknown;
            expect(pending).toBeInstanceOf(Promise);
            const found = (await pending as string[]).map(f => path.basename(f)).sort();
            expect(found).toEqual(['cairo-arabic-400-normal.woff2', 'cairo-latin-400-normal.woff2']);
            const jobDir = path.join(dir, '.job'); fs.mkdirSync(jobDir);
            await projectFontFiles(dir, jobDir);
            const under = (calls: any[][]) => calls.filter(c => String(c[0] || '').startsWith(dir));
            expect(under(readdirSync.mock.calls)).toEqual([]);
            expect(under(statSync.mock.calls)).toEqual([]);
        } finally { readdirSync.mockRestore(); statSync.mockRestore(); }
    });

    it('a dependency of thousands of files is sampled, never walked whole, and the search has a deadline', async () => {
        const files: Record<string, string> = { 'package.json': JSON.stringify({ dependencies: { huge: '1.0.0' } }) };
        for (let i = 0; i < 1200; i++) files[`node_modules/huge/lib/f${String(i).padStart(4, '0')}.js`] = '';
        files['node_modules/huge/lib/zzzz-late.woff2'] = 'wOF2';
        const dir = project(files);
        expect(await dependencyFontFiles(dir)).toEqual([]);           // the font after 400 entries is not reached
        expect(await dependencyFontFiles(dir, 40, { deadlineMs: 0 })).toEqual([]);
    });
});

describe('8 — the request gate is whole words', () => {
    it('«تطبيق», «جديد», "scope", "copy", «طبعاً», "printer", "blueprint" start no scan child', async () => {
        for (const r of ['ابني تطبيق جديد للمطعم', 'اعمل لي موقع طبيب أسنان', 'تطبيق ديليفري', 'Build a scope tracker', 'copy the text to the clipboard',
            'طبعاً أبي التطبيق بالعربي', 'a printer inventory app', 'a blueprint editor', 'fingerprint login', 'موقع لبيع الطابعات']) {
            expect([r, mayAskPdf(r)]).toEqual([r, false]);
        }
        for (const r of ['اطبع الفاتورة', 'وللطباعة', 'تصدير بي دي إف', 'export to PDF', 'بالPDF', 'print-friendly receipts', 'reprint lost certificates', 'نسخة ورقية', 'hard copies', 'أريد مطبوعات للشهادات']) {
            expect([r, mayAskPdf(r)]).toEqual([r, true]);
        }
        const kids = countChildren();
        try {
            const dir = project();
            const state: PdfBriefState = { given: false };
            expect(await pdfBriefAtStart(state, facts(dir, 'ابني تطبيق جديد للمطعم مع صفحة طلبات', 'ar') as any)).toBe('');
            expect(kids.calls.length).toBe(0);
        } finally { kids.restore(); }
    });
});

describe('8 — scans after writes are bounded', () => {
    const CHART = "import Chart from 'chart.js/auto';\nconst ctx = document.getElementById('c').getContext('2d');\nnew Chart(ctx, { type: 'bar', data });\n// canvas\n";
    it('a left-to-right dashboard: one scan child, then never again in the run', async () => {
        const dir = project({ 'src/chart.js': CHART, 'src/chart2.js': CHART.replace('bar', 'line'), 'src/print.js': "export const p = () => window.print();\n" });
        const kids = countChildren();
        try {
            const state: PdfBriefState = { given: false };
            const f = facts(dir, 'Build a sales dashboard with charts', 'en');
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart.js'])).toBe('');
            expect(kids.calls.length).toBe(1);
            expect(state.settledLtr).toBe(true);
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart2.js'])).toBe('');
            expect(await pdfBriefAfterWrite(state, f as any, ['src/print.js'])).toBe('');
            fs.appendFileSync(path.join(dir, 'src/chart.js'), '// more canvas\n');
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart.js'])).toBe('');
            expect(kids.calls.length).toBe(1);
        } finally { kids.restore(); }
    });

    it('a right-to-left app: the same file at the same size and time is never rescanned, a used hint kind starts no child, a new kind still gives the brief', async () => {
        const dir = project({
            'src/chart.js': CHART,
            'src/chart2.js': CHART.replace('bar', 'pie'),
            'server/cert.js': "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.text(student.name, { align: 'right' });\n",
        });
        const kids = countChildren();
        try {
            const state: PdfBriefState = { given: false, speaksRtl: true, asksPdf: false };
            const f = facts(dir, 'لوحة مبيعات بالعربي', 'ar');
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart.js'])).toBe('');
            expect(kids.calls.length).toBe(1);
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart.js'])).toBe('');      // same size and time
            expect(await pdfBriefAfterWrite(state, f as any, ['src/chart2.js'])).toBe('');     // «canvas» already scanned once
            expect(kids.calls.length).toBe(1);
            const brief = await pdfBriefAfterWrite(state, f as any, ['server/cert.js']);        // a PDF library: a new kind
            expect(kids.calls.length).toBe(2);
            expect(brief).toMatch(/pdfkit/u);
            expect(state.given).toBe(true);
        } finally { kids.restore(); }
    });
});

describe('8 — the run-start scan never holds the builder\'s first call', () => {
    function deps(model: EngineModel): EngineDeps {
        const passing: Verifier = async () => ({ passed: true, checks: [{ id: 'requirements', status: 'passed', detail: 'ok' }], unproven: [], at: 0 } as VerificationReport);
        const reg: ProcessRegistry = {
            async start(spec) { return { name: spec.name, command: spec.command, cwd: spec.cwd, running: true, startedAt: 0, output: '' }; },
            logs() { return undefined; }, async stop() { return true; }, list() { return []; }, async stopAll() { /* nothing runs */ },
        };
        const browser = (): BrowserSession => ({ async open() { throw new Error('unused'); }, async act() { throw new Error('unused'); }, async screenshot() { return ''; }, async close() { /* unused */ } });
        return { model, tools: [planUpdateTool, finishTool(passing)], processes: reg, browser, machine: { platform: 'linux', shell: 'bash' } };
    }

    it('an Arabic PDF request: the first call starts before the scan answers; the brief and the kit come together with a later step, never mid-step; the run start is kept with the run', async () => {
        if (!findJoeAsset(path.join('app-kit', 'print.css'))) return;
        const dir = project();
        const kit = path.join(dir, 'vendor', 'joe-kit', 'print.css');
        const seen: { firstHasBrief?: boolean; kitAtFirstCall?: boolean; kitAfterScanInStep0?: boolean; briefAtStep?: number; kitWithBrief?: boolean } = {};
        //  The real scan child, watched: `answered` once its answer is back (review 4 of r40, S5).
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const outsideScan = require('../core/quality/outside-scan') as typeof import('../core/quality/outside-scan');
        const realScan = outsideScan.scanText;
        let answered = false;
        const scanSpy = jest.spyOn(outsideScan, 'scanText').mockImplementation(((...a: Parameters<typeof realScan>) => realScan(...a).then(r => { answered = true; return r; })) as any);
        let k = 0;
        const model: EngineModel = {
            label: 'fake:pdf', vision: false, contextTokens: () => 64_000,
            async step(messages: ChatMessage[], _t: ToolSchema[]): Promise<ModelStep> {
                const step = k++;
                const text = messages.map(m => typeof m.content === 'string' ? m.content : '').join('\n');
                if (step === 0) {
                    seen.firstHasBrief = /joe-kit/u.test(text);
                    seen.kitAtFirstCall = fs.existsSync(kit);
                    //  A model call takes seconds; the scan answers meanwhile — and the kit still
                    //  waits for the step's end, where the brief is given (review 4 of r40, S5).
                    for (let t = 0; t < 300 && !answered; t++) await new Promise(r => setTimeout(r, 100));
                    await new Promise(r => setTimeout(r, 400));
                    seen.kitAfterScanInStep0 = fs.existsSync(kit);
                    return { text: '', toolCalls: [{ id: 'c0', name: 'nothing_here', arguments: '{}' }], durationMs: 1 };
                }
                //  The brief joins the result of the step during which the scan answered.
                if (/joe-kit/u.test(text) || step >= 12) {
                    seen.briefAtStep = /joe-kit/u.test(text) ? step : -1;
                    seen.kitWithBrief = fs.existsSync(kit);
                    return { text: 'done', toolCalls: [{ id: `c${step}`, name: 'task_finish', arguments: JSON.stringify({ summary: 'done' }) }], durationMs: 1 };
                }
                await new Promise(r => setTimeout(r, 500));
                return { text: '', toolCalls: [{ id: `c${step}`, name: `nothing_here_${step}`, arguments: '{}' }], durationMs: 1 };
            },
        };
        const events: EngineEvent[] = [];
        let result: Awaited<ReturnType<typeof runEngine>> | undefined;
        try {
            result = await runEngine({
                runId: 'run-pdf-parallel', request: 'اعمل تطبيق فواتير مع زر طباعة', language: 'ar', projectDir: dir,
                deadlineAt: Date.now() + 10 * 60_000, signal: new AbortController().signal, emit: (e: EngineEvent) => events.push(e), joe: {},
            } as any, deps(model));
        } finally { scanSpy.mockRestore(); }
        expect(result?.status).toBe('delivered');
        expect(answered).toBe(true);
        expect(seen.firstHasBrief).toBe(false);
        expect(seen.kitAtFirstCall).toBe(false);
        expect(seen.kitAfterScanInStep0).toBe(false);
        expect(seen.briefAtStep).toBe(1);
        expect(seen.kitWithBrief).toBe(true);
        expect(fs.existsSync(kit)).toBe(true);
        const kept = JSON.parse(fs.readFileSync(path.join(dir, '.joe', 'pdfs-at-run-start.json'), 'utf8'));
        expect(kept.runs.map((r: any) => r.runId)).toContain('run-pdf-parallel');
    });
});

describe('11 — one cancel handler per call, removed when it settles', () => {
    it('scanText and provePdfs never hand the run\'s long-lived cancelled promise to a child, and leave no listener on the signal', async () => {
        const run = new AbortController();
        const cancelled = new Promise<void>(resolve => run.signal.addEventListener('abort', () => resolve(), { once: true }));
        const listenersBefore = getEventListeners(run.signal, 'abort').length;
        const kids = countChildren();
        try {
            for (let i = 0; i < 3; i++) await scanText([{ kind: 'request', text: 'اطبع الفاتورة', language: 'ar' }], { deadlineAt: Date.now() + 60_000, signal: run.signal, cancelled });
            const dir = project({ 'x.pdf': '%PDF-1.4\n%%EOF\n' });
            await provePdfs([{ pdf: path.join(dir, 'x.pdf'), fontFiles: [] }], { deadlineAt: Date.now() + 60_000, signal: run.signal, cancelled });
            expect(kids.calls.length).toBeGreaterThanOrEqual(3);
            for (const opts of kids.calls) {
                expect(opts.cancel).toBeDefined();
                expect(opts.cancel).not.toBe(cancelled);
            }
            expect(getEventListeners(run.signal, 'abort').length).toBe(listenersBefore);
        } finally { kids.restore(); }
    });

    it('an abort still stops a call at once', async () => {
        const run = new AbortController();
        run.abort();
        const t0 = Date.now();
        const lines = await scanText([{ kind: 'request', text: 'اطبع الفاتورة', language: 'ar' }], { deadlineAt: Date.now() + 60_000, signal: run.signal });
        expect(lines[0].failed).toBeDefined();
        expect(Date.now() - t0).toBeLessThan(5_000);
    });
});
