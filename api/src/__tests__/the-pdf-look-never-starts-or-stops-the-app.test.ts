/**
 * THE LOOK AT A PDF SENDS NO REQUEST OF ITS OWN AND NEVER STARTS OR STOPS THE APP
 * (design arabic-pdf v9 §4.2–§4.3, test D).
 *
 * The v8 review found the doors unsafe: a GET to a PDF route wrote into the owner's data and
 * made putQaRecordsBack stop and restart his server. v9 has no doors: the look reads the PDF
 * files the delivery wrote and the PDF bytes Joe's own Browser QA walk already received (a
 * capture beside its response listener). A local app counts every request it gets: the count
 * during the look is 0, and the walk with the capture sends what the walk without it sends.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { attachPdfCapture, bytesArePdf, headersSayPdf, lookAtPdfs, makeLookSlot, mediaType, projectPdfTimes, rememberPdfsAtRunStart, writtenPdfs, type CapturedPdf } from '../core/quality/outside-probe';
import { NO_PDF_PRODUCED, outsideLines } from '../core/quality/outside-parts';

jest.setTimeout(300_000);

const FIX = path.join(__dirname, 'fixtures', 'pdf-proof');
const PDF = fs.readFileSync(path.join(FIX, 'r8-thermal-80mm.pdf'));
const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pdf-look-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const never = () => new Promise<never>(() => { /* never settles */ });

/* ───────────── §4.3 one look at a time: slot9.cjs's 7 cases ───────────── */

describe('one look at a time (withLookSlot)', () => {
    it('A one at a time, the wait taken from the budget', async () => {
        const S = makeLookSlot(); const order: string[] = []; let left2 = 0;
        const a = S.withLookSlot({ budgetMs: 2000, waitMs: 1000 }, async () => { order.push('a+'); await sleep(300); order.push('a-'); });
        const b = S.withLookSlot({ budgetMs: 2000, waitMs: 1000 }, async (_s, left) => { left2 = left; order.push('b+'); });
        const [ra, rb] = await Promise.all([a, b]);
        expect(order.join(',')).toBe('a+,a-,b+'); expect(ra.ok && rb.ok).toBe(true); expect(left2).toBeLessThanOrEqual(1720);
    });
    it('B a holder that never settles frees the slot 2 s after its budget', async () => {
        const S = makeLookSlot(); let hungResolve!: (v: unknown) => void; let sawAbort = false;
        const a = S.withLookSlot({ budgetMs: 300, waitMs: 1000 }, s => { s.addEventListener('abort', () => { sawAbort = true; }); return new Promise(r => { hungResolve = r; }); });
        const t = Date.now(); const b = S.withLookSlot({ budgetMs: 5000, waitMs: 4000 }, async () => 'b ran');
        const ra = await a; const rb = await b; const waited = Date.now() - t; hungResolve('late'); await sleep(20);
        expect(ra).toMatchObject({ ok: false, why: 'budget' }); expect(sawAbort).toBe(true); expect(rb.ok).toBe(true);
        expect(waited).toBeGreaterThanOrEqual(2250); expect(waited).toBeLessThan(3500); expect(S.busy()).toBe(false); expect(S.stats.lateSettles).toBe(1);
    });
    it('C a waiter that gave up never runs', async () => {
        const S = makeLookSlot(); let ranLate = false;
        const a = S.withLookSlot({ budgetMs: 2000, waitMs: 1000 }, () => sleep(500));
        const b = S.withLookSlot({ budgetMs: 2000, waitMs: 100 }, async () => { ranLate = true; });
        const rb = await b; await a; await sleep(50);
        expect(rb).toMatchObject({ ok: false, why: 'no-slot' }); expect(ranLate).toBe(false); expect(S.busy()).toBe(false);
    });
    it('D cancelled while waiting, and while holding (the slot held up to 2 s for the old child)', async () => {
        const S = makeLookSlot(); const ac = new AbortController(); let ran = false;
        const a = S.withLookSlot({ budgetMs: 2000, waitMs: 1000 }, () => sleep(400));
        const b = S.withLookSlot({ budgetMs: 2000, waitMs: 1000, signal: ac.signal }, async () => { ran = true; }); setTimeout(() => ac.abort(), 100);
        const rb = await b; await a;
        const ac2 = new AbortController(); const c = S.withLookSlot({ budgetMs: 2000, waitMs: 1000, signal: ac2.signal }, () => never()); setTimeout(() => ac2.abort(), 100);
        const rc = await c; const busyAtOnce = S.busy(); await sleep(2100);
        expect(rb).toMatchObject({ why: 'aborted' }); expect(ran).toBe(false); expect(rc).toMatchObject({ why: 'aborted' }); expect(busyAtOnce).toBe(true); expect(S.busy()).toBe(false);
    });
    it('E a throwing look frees the slot', async () => {
        const S = makeLookSlot(); const r = await S.withLookSlot({ budgetMs: 500, waitMs: 100 }, async () => { throw new Error('boom'); });
        const r2 = await S.withLookSlot({ budgetMs: 500, waitMs: 100 }, async () => 'ok');
        expect(r).toMatchObject({ ok: false, why: 'failed', error: 'boom' }); expect(r2.ok).toBe(true); expect(S.busy()).toBe(false);
    });
    it('F 200 mixed looks (hangs, give-ups, cancels): never two at once', async () => {
        const S = makeLookSlot(); let ghost = 0; const all: Promise<any>[] = [];
        for (let i = 0; i < 200; i++) {
            const kind = i % 7; const ac = new AbortController(); if (kind === 5) setTimeout(() => ac.abort(), Math.random() * 300); const st = { gaveUp: false };
            all.push(S.withLookSlot({ budgetMs: 150 + Math.random() * 300, waitMs: kind === 3 ? 20 : 4000, signal: ac.signal }, async () => { if (st.gaveUp) ghost++; if (kind === 1) await never(); else await sleep(Math.random() * 60); })
                .then(r => { if (!r.ok && r.why === 'no-slot') st.gaveUp = true; return r; }));
        }
        const rs = await Promise.race([Promise.all(all), sleep(120_000).then(() => null)]); await sleep(2100);
        expect(rs).not.toBeNull(); expect(S.stats.maxActive).toBe(1); expect(ghost).toBe(0); expect(S.busy()).toBe(false);
    });
    it('G the next look starts when the old one\'s child has exited, not at the abort and not 2 s later', async () => {
        const S = makeLookSlot(); let bStart = 0; const t0 = Date.now();
        const a = S.withLookSlot({ budgetMs: 300, waitMs: 1000 }, s => new Promise(r => s.addEventListener('abort', () => setTimeout(r, 800))));
        const b = S.withLookSlot({ budgetMs: 5000, waitMs: 4000 }, async () => { bStart = Date.now() - t0; });
        await a; await b;
        expect(bStart).toBeGreaterThanOrEqual(1050); expect(bStart).toBeLessThan(1900);
    });
});

/* ───────────── §4.2 (2) the capture rule: capture9.cjs's 12 rows ───────────── */

const ROUTES: Record<string, (q: http.IncomingMessage, r: http.ServerResponse) => void> = {
    'plain': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end(PDF); },
    'charset': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf; charset=utf-8' }); r.end(PDF); },
    'upper': (_q, r) => { r.writeHead(200, { 'content-type': 'Application/PDF' }); r.end(PDF); },
    'x-pdf': (_q, r) => { r.writeHead(200, { 'content-type': 'application/x-pdf' }); r.end(PDF); },
    'octet-attach': (_q, r) => { r.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="invoice.pdf"' }); r.end(PDF); },
    'bom': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), PDF])); },
    'crlf': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end(Buffer.concat([Buffer.from('\r\n'), PDF])); },
    'gzip': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf', 'content-encoding': 'gzip' }); r.end(zlib.gzipSync(PDF)); },
    'html-as-pdf': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end('<html><body>not a pdf</body></html>'); },
    'zero': (_q, r) => { r.writeHead(200, { 'content-type': 'application/pdf' }); r.end(); },
    'octet-noname': (_q, r) => { r.writeHead(200, { 'content-type': 'application/octet-stream' }); r.end(PDF); },
    'json': (_q, r) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end('{"ok":true}'); },
};
const KEPT = ['plain', 'charset', 'upper', 'x-pdf', 'octet-attach', 'bom', 'crlf', 'gzip'];

describe('the capture rule', () => {
    it('headers: media type without parameters, any case, x-pdf, octet-stream or attachment with a .pdf name', () => {
        expect(mediaType(' Application/PDF ; charset=utf-8')).toBe('application/pdf');
        expect(headersSayPdf('application/pdf', '')).toBe(true);
        expect(headersSayPdf('application/x-pdf', '')).toBe(true);
        expect(headersSayPdf('application/octet-stream', 'attachment; filename="invoice.pdf"')).toBe(true);
        expect(headersSayPdf('application/octet-stream', "attachment; filename*=UTF-8''%D9%81.pdf")).toBe(true);
        expect(headersSayPdf('text/plain', 'attachment; filename=r.pdf')).toBe(true);
        expect(headersSayPdf('application/octet-stream', '')).toBe(false);
        expect(headersSayPdf('application/json', '')).toBe(false);
        expect(bytesArePdf(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), PDF]))).toBe(true);
        expect(bytesArePdf(Buffer.from('<html>%PDF-</html>'.padStart(2000, ' ')))).toBe(false);
        expect(bytesArePdf(Buffer.alloc(0))).toBe(false);
    });
});

/* ───────────── the request count: a real walk of Joe's Browser QA, with and without the capture ───────────── */

/** An Arabic invoices page that fetches 12 routes in the shapes of the v8 review's door gate and offers a download link. */
function countingApp(): Promise<{ base: string; count: () => number; log: string[]; close: () => Promise<void>; dir: string }> {
    let count = 0; const log: string[] = [];
    const page = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>فواتير</title></head>
<body><main><h1>فواتير</h1><p>فاتورة رقم ٧ للعميل محمد.</p><a id="dl" href="/pdf/octet-attach?link=1" download>تحميل الفاتورة</a>
<script>(async () => { for (const k of ${JSON.stringify(Object.keys(ROUTES))}) { try { await (await fetch('/pdf/' + k)).arrayBuffer(); } catch (e) {} } })();</script></main></body></html>`;
    const dir = fs.mkdtempSync(path.join(tmp, 'app-'));
    fs.writeFileSync(path.join(dir, 'index.html'), page);
    const srv = http.createServer((q, r) => {
        count++; log.push(`${q.method} ${q.url}`);
        const u = String(q.url).split('?')[0];
        if (u === '/' || u === '/index.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(page); }
        const k = u.replace('/pdf/', '');
        if (ROUTES[k]) return ROUTES[k](q, r);
        r.writeHead(404); r.end();
    });
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve({
        base: `http://127.0.0.1:${(srv.address() as any).port}/`, count: () => count, log, dir,
        close: () => new Promise<void>(r => srv.close(() => r())),
    })));
}

describe('the capture on a page that fetches the 12 routes and presses the download link (capture9.cjs)', () => {
    it('keeps 9 (8 responses and the download), each proved to start like a PDF; the app got only the page\'s own 14 requests', async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { chromium } = require('playwright');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getChromiumLaunchOptions } = require('../modules/browser/manager');
        const app = await countingApp();
        const browser = await chromium.launch(getChromiumLaunchOptions());
        try {
            const ctx = await browser.newContext({ acceptDownloads: true });
            const page = await ctx.newPage();
            const cap = attachPdfCapture(page, path.join(tmp, 'capture9'));
            await page.goto(app.base);
            await page.waitForFunction(() => performance.getEntriesByType('resource').filter((e: any) => e.name.includes('/pdf/')).length >= 12, null, { timeout: 20_000 });
            await Promise.all([page.waitForEvent('download', { timeout: 10_000 }).catch(() => null), page.click('#dl')]);
            await page.waitForTimeout(500);
            const kept = await cap.settle();
            const urls = kept.map(c => `${c.how} ${c.url}`);
            for (const k of KEPT) expect(urls).toContain(`response /pdf/${k}`);
            expect(urls).toContain('download /pdf/octet-attach?link=1');
            expect(kept).toHaveLength(9);
            //  The page, its 12 fetches and the download — and the browser's own favicon ask: nothing of the capture's.
            expect(app.log.filter(l => !l.includes('favicon')).length).toBe(14);
        } finally { await browser.close(); await app.close(); }
    });
});

describe('the capture beside Joe\'s Browser QA walk, and the look after it', () => {
    let captured: CapturedPdf[] = [];
    let duringWalkWith = 0, duringWalkWithout = 0, duringLook = -1;
    let logWith: string[] = [], logWithout: string[] = [];

    beforeAll(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { auditBuiltApp } = require('../core/quality/app-audit');
        //  The same walk, once without the capture …
        const plain = await countingApp();
        try {
            const a = await auditBuiltApp(plain.dir, { serveUrl: plain.base, timeoutMs: 60_000, request: 'نظام فواتير' });
            expect(a.skipped).toBeUndefined();
            expect(a.pdfs).toBeUndefined();
            duringWalkWithout = plain.count(); logWithout = plain.log.slice();
        } finally { await plain.close(); }
        //  … and once with it; then the look, on the same app, counted.
        const app = await countingApp();
        try {
            const capDir = path.join(tmp, 'state', 'proof', 'outside', 'walk-1');
            const a = await auditBuiltApp(app.dir, { serveUrl: app.base, timeoutMs: 60_000, request: 'نظام فواتير', pdfCaptureDir: capDir });
            expect(a.skipped).toBeUndefined();
            captured = a.pdfs || [];
            duringWalkWith = app.count(); logWith = app.log.slice();
            const root = fs.mkdtempSync(path.join(tmp, 'project-'));
            fs.writeFileSync(path.join(root, 'index.html'), fs.readFileSync(path.join(app.dir, 'index.html')));
            fs.writeFileSync(path.join(root, 'app.js'), "document.querySelector('#p').onclick = () => window.print();\n");
            const before = app.count();
            const look = await lookAtPdfs({
                root, stateDir: path.join(tmp, 'state'), runId: 'look-1', request: 'نظام فواتير', language: 'ar',
                servedIndex: path.join(root, 'index.html'), captured, deadlineAt: Date.now() + 10 * 60_000,
            });
            duringLook = app.count() - before;
            (global as any).__look = look;
        } finally { await app.close(); }
    });

    it('keeps the 9 PDF shapes (8 responses and the download) and none of the 4 non-PDFs', () => {
        const urls = captured.map(c => `${c.how} ${c.url}`);
        for (const k of KEPT) expect(urls).toContain(`response /pdf/${k}`);
        //  Joe's walk opens the page at several widths and does not press a download link: the 8 responses, each once.
        for (const k of ['html-as-pdf', 'zero', 'octet-noname', 'json']) expect(urls.some(u => u.endsWith(`/pdf/${k}`))).toBe(false);
        expect(captured).toHaveLength(8);   // each kept once, though the walk opened the page at several widths
        for (const c of captured) expect(fs.readFileSync(c.path).subarray(0, 1100).toString('latin1')).toContain('%PDF-');
    });

    it('the app received 0 requests during the look; the walk with the capture sent exactly what the walk without it sent', () => {
        expect(duringLook).toBe(0);
        expect(duringWalkWith).toBe(duringWalkWithout);
        expect([...logWith].sort()).toEqual([...logWithout].sort());
    });

    it('the look proved every kept PDF and told the owner each one\'s measured parts', () => {
        const look = (global as any).__look;
        expect(look).not.toBeNull();
        const qa = look.entries.filter((e: any) => e.source === 'qa');
        expect(qa).toHaveLength(captured.length);
        for (const e of qa) { expect(e.told).toEqual([]); expect(e.clear).toBeDefined(); }
        const lines = outsideLines(look.entries, 'ar');
        expect(lines[0]).toMatch(/^📄 «\/pdf\/plain»: النص موجود · بخط التطبيق: لم يُقَس · ظاهر على الورقة$/u);
    });
});

/* ───────────── §4.2 (1) PDFs the delivery wrote, and the «no PDF produced» line ───────────── */

describe('PDFs the delivery wrote, and an app that produced none', () => {
    const rtlPage = '<!doctype html><html lang="ar" dir="rtl"><body><h1>فواتير</h1><button id="p">طباعة</button></body></html>';

    it('a PDF new or changed since the run began is found by its mtime; one that was there unchanged is not', async () => {
        const root = fs.mkdtempSync(path.join(tmp, 'written-'));
        fs.mkdirSync(path.join(root, 'out'));
        fs.writeFileSync(path.join(root, 'out', 'old.pdf'), PDF);
        fs.writeFileSync(path.join(root, 'out', 'changed.pdf'), PDF);
        await rememberPdfsAtRunStart('written-run', root);
        const before = await projectPdfTimes(root);
        await sleep(30);
        fs.writeFileSync(path.join(root, 'out', 'changed.pdf'), Buffer.concat([PDF, Buffer.from('\n')]));
        fs.writeFileSync(path.join(root, 'report.pdf'), PDF);
        fs.mkdirSync(path.join(root, 'vendor', 'joe-kit'), { recursive: true });
        fs.writeFileSync(path.join(root, 'vendor', 'joe-kit', 'kit.pdf'), PDF);
        const fresh = (await writtenPdfs(root, before)).map(w => w.rel).sort();
        expect(fresh).toEqual(['out/changed.pdf', 'report.pdf']);
    });

    it('an app with a PDF mechanism and no PDF: one line, «not measured: no PDF was produced during the checks» — and no request, no tool', async () => {
        const root = fs.mkdtempSync(path.join(tmp, 'print-only-'));
        fs.writeFileSync(path.join(root, 'index.html'), rtlPage);
        fs.writeFileSync(path.join(root, 'app.js'), "document.querySelector('#p').onclick = () => window.print();\n");
        await rememberPdfsAtRunStart('print-only', root);
        const look = await lookAtPdfs({ root, stateDir: path.join(root, '.joe'), runId: 'print-only', request: 'نظام فواتير', language: 'ar', servedIndex: path.join(root, 'index.html'), captured: [], deadlineAt: Date.now() + 10 * 60_000 });
        expect(look!.entries).toEqual([{ source: 'qa', name: '', told: [], notMeasured: [NO_PDF_PRODUCED] }]);
        expect(outsideLines(look!.entries, 'ar')).toEqual(['📄 لم يُقَس: لم يصنع التطبيق ملف PDF أثناء فحوص جو']);
        expect(outsideLines(look!.entries, 'en')).toEqual(["📄 not measured: the app produced no PDF during Joe's checks"]);
    });

    it('a written PDF is proved as a static PDF (font, ink, pictures); pdfkit in the source is told as a fact, never with a remedy', async () => {
        const root = fs.mkdtempSync(path.join(tmp, 'cert-'));
        fs.writeFileSync(path.join(root, 'index.html'), rtlPage);
        fs.mkdirSync(path.join(root, 'server'));
        fs.writeFileSync(path.join(root, 'server', 'cert.js'), "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.text(student.name);\n");
        await rememberPdfsAtRunStart('cert', root);
        fs.copyFileSync(path.join(FIX, 'w8-print-css-white-total.pdf'), path.join(root, 'certificate.pdf'));
        const look = await lookAtPdfs({ root, stateDir: path.join(root, '.joe'), runId: 'cert', request: 'نظام شهادات', language: 'ar', servedIndex: path.join(root, 'index.html'), captured: [], deadlineAt: Date.now() + 10 * 60_000 });
        const code = look!.entries.find(e => e.source === 'code')!;
        expect(code).toEqual({ source: 'code', name: 'server/cert.js', told: ['pdf_route_measured_wrong'], notMeasured: [] });
        const file = look!.entries.find(e => e.source === 'file')!;
        expect(file.name).toBe('certificate.pdf');
        //  White text on white paper: no ink — a fact in stage 1 (no marker typed), so no remedy.
        expect(file.told).toEqual(['pdf_no_ink']);
        expect(file.remedy).toBeUndefined();
        const lines = outsideLines(look!.entries, 'ar');
        expect(lines).toContain('📄 «server/cert.js»: يصنع الملف بمكتبة لا تشكّل العربية في اختبارات جو');
        expect(lines).toContain('📄 «certificate.pdf»: النص لا يظهر على الورق');
        expect(look!.notes.join('\n')).toMatch(/server\/cert\.js:\d+ makes the PDF with pdfkit/u);
    });

    it('nothing to say — an English app, or no mechanism and no PDF — is null: the delivery is as it was', async () => {
        const plain = fs.mkdtempSync(path.join(tmp, 'plain-'));
        fs.writeFileSync(path.join(plain, 'index.html'), '<!doctype html><html lang="ar" dir="rtl"><body><h1>ملاحظاتي</h1></body></html>');
        expect(await lookAtPdfs({ root: plain, stateDir: path.join(plain, '.joe'), runId: 'plain', request: 'ملاحظات', language: 'ar', servedIndex: path.join(plain, 'index.html'), captured: [], deadlineAt: Date.now() + 600_000 })).toBeNull();
        const en = fs.mkdtempSync(path.join(tmp, 'english-'));
        fs.writeFileSync(path.join(en, 'index.html'), '<!doctype html><html lang="en"><body><h1>Invoices</h1><button id="p">Print</button></body></html>');
        fs.writeFileSync(path.join(en, 'app.js'), "document.querySelector('#p').onclick = () => window.print();\n");
        fs.writeFileSync(path.join(en, 'invoice.pdf'), PDF);
        expect(await lookAtPdfs({ root: en, stateDir: path.join(en, '.joe'), runId: 'english', request: 'An invoice app', language: 'en', servedIndex: path.join(en, 'index.html'), captured: [], deadlineAt: Date.now() + 600_000 })).toBeNull();
    });

    it('the look holds no tool: it cannot start or stop the app (no project_run, project_stop or request in its source)', () => {
        const src = ['outside-probe.ts', 'outside-proof.ts', 'outside-scan.ts', 'outside-parts.ts'].map(f => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', f), 'utf8')).join('\n');
        expect(src).not.toMatch(/project_run|project_stop|runTool|fetch\(|http\.request|https\.request/u);
    });
});
