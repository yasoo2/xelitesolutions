/**
 * THE ARABIC-PDF BRIEF REACHES THE BUILDER, AND NO READING OF HIS TEXT RUNS ON JOE'S MAIN THREAD
 * (design arabic-pdf v9 §3, test B).
 *
 * L452's certificate printed an Arabic name reversed and glued with pdfkit; Joe passed it. The brief
 * and the kit are given to a right-to-left app that makes or prints a PDF — the gate decides only
 * that. Every regex over the builder's text runs in the scan child (assets/pdf-proof/scan.mjs with
 * scan-rules.cjs, the lab's scan9.mjs and mech9.cjs word for word) under a 5 s item watchdog; the
 * v7 review measured two of those readers quadratic on the main thread (15–229 s).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { monitorEventLoopDelay } from 'perf_hooks';
import { spawnSync } from 'child_process';
import { findJoeAsset, mayAskPdf, scanText, writeTrigger, SCAN_REQUEST_CHARS, type ScanItem } from '../core/quality/outside-scan';
import { firstMessage } from '../core/engine/prompt';
import { newPlan } from '../core/engine/plan';
import { pdfBriefAfterWrite, pdfBriefAtStart, type PdfBriefState } from '../core/engine/pdf-brief';

jest.setTimeout(300_000);

const RULES_PATH = findJoeAsset(path.join('pdf-proof', 'scan-rules.cjs'))!;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const R = require(RULES_PATH);
const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pdf-prevention-'));
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

describe('the scan child and its rules are the lab\'s, word for word', () => {
    it('ships the lab scripts: scan-rules.cjs is mech9.cjs, scan.mjs is scan9.mjs below its header', () => {
        const lab = 'D:/Joe/eval/egm/pdf-lab/egm-pdf-v9';
        if (!fs.existsSync(lab)) return; // the lab is on the owner's laptop only; the table below is the shipped measurement
        expect(fs.readFileSync(RULES_PATH, 'utf8')).toBe(fs.readFileSync(path.join(lab, 'mech9.cjs'), 'utf8'));
        const shipped = fs.readFileSync(findJoeAsset(path.join('pdf-proof', 'scan.mjs'))!, 'utf8').split('\n');
        const labScan = fs.readFileSync(path.join(lab, 'scan9.mjs'), 'utf8').split('\n');
        expect(shipped.slice(shipped.findIndex(l => l.startsWith('import fs'))).join('\n')).toBe(labScan.slice(labScan.findIndex(l => l.startsWith('import fs'))).join('\n'));
    });

    it('every table row of the rules: asksPdf, speaksRtl, appIsRtl, pdfMechanismsIn as measured', () => {
        //  The rules module's own table mode, run as the lab ran it (a test process may start a child).
        const r = spawnSync(process.execPath, [RULES_PATH, 'table'], { encoding: 'utf8', timeout: 120_000 });
        const out = String(r.stdout);
        expect(out).toMatch(/asksPdf design rows: 21 must, 20 must not, 0 wrong/u);
        expect(out).toMatch(/asksPdf reviewer 46: 46 of 46 right/u);
        expect(out).toMatch(/asksPdf held-out 24: 22 of 24 right/u);
        expect(out).toMatch(/speaksRtl: 14 rows, 0 wrong/u);
        expect(out).toMatch(/appIsRtl: 5 rows, 0 wrong/u);
        expect(out).toMatch(/pdfMechanismsIn: 31 must, 31 must not, 0 wrong/u);
    });

    it('the gate knows the v8 review\'s 12 server stacks (v8: 5), and a commented-out <html dir="rtl"> is skipped', () => {
        const STACKS: Array<[string, string]> = [
            ['server/pdf.js', "const { spawn } = require('node:child_process');\nconst p = spawn(CHROME, ['--headless', '--no-pdf-header-footer', `--print-to-pdf=${out}`, url]);"],
            ['app/pdf.py', "import subprocess\nsubprocess.run([chrome, '--headless', f'--print-to-pdf={out}', url], check=True)"],
            ['app/main.py', "from weasyprint import HTML\n@app.get('/invoice/{id}.pdf')\ndef inv(id: int):\n    return Response(HTML(string=render(id)).write_pdf(), media_type='application/pdf')"],
            ['server/make.js', "const PdfPrinter = require('pdfmake');\nconst printer = new PdfPrinter(fonts);\nconst doc = printer.createPdfKitDocument(dd);\ndoc.pipe(res); doc.end();"],
            ['server/make.js', "const pdfmake = require('pdfmake');\npdfmake.addFonts(fonts);\nconst buf = await pdfmake.createPdf(dd).getBuffer();\nres.type('pdf').send(buf);"],
            ['server/pdf.js', "const html_to_pdf = require('html-pdf-node');\nconst buf = await html_to_pdf.generatePdf({ content: html }, { format: 'A4' });\nres.type('pdf').send(buf);"],
            ['app/pdf.py', "import pdfkit\npdf = pdfkit.from_string(html, False)\nreturn Response(pdf, mimetype='application/pdf')"],
            ['app/api/invoice/[id]/route.ts', "import { renderToBuffer } from '@react-pdf/renderer';\nexport async function GET() { const b = await renderToBuffer(<Inv />); return new Response(b, { headers: { 'Content-Type': 'application/pdf' } }); }"],
            ['app/api/invoice/route.ts', "import puppeteer from 'puppeteer';\nexport async function GET() { const b = await (await (await puppeteer.launch()).newPage()).pdf(); return new Response(b); }"],
            ['server/pdf.js', "const r = await fetch('http://gotenberg:3000/forms/chromium/convert/html', { method: 'POST', body: form });\nres.type('application/pdf').send(Buffer.from(await r.arrayBuffer()));"],
            ['server/index.js', "const { chromium } = require('playwright');\napp.get('/api/invoices/:id/pdf', async (q, r) => { const b = await browser.newPage(); await b.goto(u); r.type('pdf').send(await b.pdf()); });"],
            ['main.py', "from fastapi import FastAPI\nfrom playwright.async_api import async_playwright\n@app.get('/x.pdf')\nasync def x():\n    pdf = await page.pdf(format='A4')"],
        ];
        for (const [rel, src] of STACKS) {
            expect(R.pdfMechanismsIn(src, rel).length).toBeGreaterThan(0);
            //  None of the seven new stacks is «measured»: no claim about their Arabic.
            expect(R.pdfMechanismsIn(src, rel).some((m: any) => m.measured)).toBe(false);
            expect(writeTrigger(src, rel)).toBe(true);
        }
        expect(R.appIsRtl(['<!-- <html dir="rtl"> --><html lang="en"><body>Invoice</body></html>'], 'invoice app', 'en')).toBe(false);
    });
});

/* ───────────── writeTrigger: whole file, case-insensitive, no regex ───────────── */

const EDITS: Array<[string, string, string]> = [
    ['server/cert.js', "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.font('Amiri');\n", "doc.text(student.name, { align: 'right' });\n"],
    ['app/report.py', 'from reportlab.pdfgen import canvas\nc = canvas.Canvas(buf)\n', 'c.drawRightString(500, 700, customer_name)\n'],
    ['app/report.py', 'from reportlab.platypus import SimpleDocTemplate, Paragraph\n', 'doc = SimpleDocTemplate(buffer)\ndoc.build([Paragraph(name)])\n'],
    ['src/Invoice.jsx', "import { useReactToPrint } from 'react-to-print';\n", 'const handlePrint = useReactToPrint({ contentRef });\n'],
    ['server/make.js', "const PdfPrinter = require('pdfmake');\nconst printer = new PdfPrinter(fonts);\n", 'const kit = printer.createPdfKitDocument(dd); kit.pipe(res); kit.end();\n'],
    ['src/report.jsx', "import { renderToStream, Document } from '@react-pdf/renderer';\n", 'const stream = await renderToStream(<Invoice data={d} />);\n'],
    ['server/pdf.js', "const puppeteer = require('puppeteer');\n", "const buf = await page.pdf({ format: 'A4' });\n"],
    ['public/app.js', '', "document.querySelector('#p').onclick = () => window.print();\n"],
    ['server/route.js', "const { makeInvoice } = require('./lib/invoice');\n", "app.get('/api/invoices/:id/doc', async (q, r) => r.type('application/pdf').send(await makeInvoice(q.params.id)));\n"],
    ['app/x.py', 'import fitz\n', 'page.insert_text((72, 72), name)\n'],
];
const PLAIN: Array<[string, string]> = [
    ['app/main.py', 'import os\nprint("server started")\nfor x in range(3):\n    print(x)\n'], ['app/util.py', 'def log(m):\n    print(f"[log] {m}")\n'],
    ['public/style.css', '@media print { .no-print { display:none } }'], ['src/App.jsx', 'export default function App() { return <div>Hello</div>; }'],
    ['server/index.js', "const express = require('express'); const app = express(); app.get('/', (q, r) => r.send('ok')); app.listen(3000);"],
    ['src/api.ts', "export async function load() { const r = await fetch('/api/items'); return r.json(); }"], ['README.md', 'print the receipt, export a PDF'],
    ['src/Login.vue', '<template><form @submit.prevent="go"><input v-model="email"></form></template>'], ['tests/test_x.py', 'def test(): print(1)'],
    ['server/db.js', "const Database = require('better-sqlite3'); module.exports = new Database('data/app.db');"],
];

describe('which written file starts a scan child', () => {
    it('the review\'s 10 edits, read whole as the file now is: 10 scanned (v8 missed 5 of the 9 new mechanisms)', () => {
        for (const [rel, before, edit] of EDITS) expect(writeTrigger(before + edit, rel)).toBe(true);
    });
    it('10 ordinary files (Python print(, CSS @media print, a README, a test …): 0 scanned', () => {
        for (const [rel, text] of PLAIN) expect(writeTrigger(text, rel)).toBe(false);
    });
    it('Joe\'s TypeScript writeTrigger answers exactly as the rules module\'s on every row', () => {
        for (const [rel, before, edit] of EDITS) expect(writeTrigger(before + edit, rel)).toBe(R.writeTrigger(before + edit, rel));
        for (const [rel, text] of PLAIN) expect(writeTrigger(text, rel)).toBe(R.writeTrigger(text, rel));
        expect(writeTrigger('window.print()', 'vendor/joe-kit/x.js')).toBe(false);
        expect(writeTrigger('window.print()', 'node_modules/x/y.js')).toBe(false);
    });
    it('the request gate on the main thread is a superset of asksPdf: every sentence of the rules\' tables it asks for passes it', () => {
        const src = fs.readFileSync(RULES_PATH, 'utf8');
        const table = src.slice(src.indexOf("if (mode === 'table')"));
        const sentences = [...table.matchAll(/'((?:[^'\\\n]|\\.){3,200})'/gu)].map(m => m[1].replace(/\\'/gu, "'"));
        const asked = sentences.filter(s => R.asksPdf(s));
        expect(asked.length).toBeGreaterThan(60);
        for (const s of asked) expect([s, mayAskPdf(s)]).toEqual([s, true]);
        expect(mayAskPdf('Build a page that shows my notes.')).toBe(false);
        expect(mayAskPdf('طِباعة الفاتورة')).toBe(true);
    });
});

/* ───────────── the child: hostile inputs at 1 MB, each within its 5 s, Joe's loop free ───────────── */

const MB = 1e6;
const fill = (u: string, n = MB) => u.repeat(Math.ceil(n / u.length)).slice(0, n);
const rnd = () => Math.random().toString(36).slice(2, 8);
const per = (u: string, n = MB) => { let s = ''; while (s.length < n) s += u.replace(/\$K/gu, rnd()); return s.slice(0, n); };
const HOSTILE_FILES: Array<[string, string, string]> = [
    ['[v7 review] pdfkit: N × const dX = new PDFDocument(), no .text(', 'server/pdf.js', "import PDFDocument from 'pdfkit';\n" + per('const d$K = new PDFDocument();\n')],
    ['[v7 review] jsPDF: N × let pX = new jsPDF()', 'src/pdf.js', "import { jsPDF } from 'jspdf';\n" + per('let p$K = new jsPDF();\n')],
    ['[v7 review] fpdf: N × pX = FPDF() and one .cell(', 'app/pdf.py', 'from fpdf import FPDF\nx.cell(1)\n' + per('p$K = FPDF()\n')],
    ['[v6 review c1] unclosed /* ×N, then window.print()', 'a.js', fill('/* ') + '\nwindow.print()'],
    ['[v6 review c2] unclosed <!-- ×N, then <script>window.print()', 'a.html', fill('<!-- ') + '\n<script>window.print()</script>'],
    ['[v6 review c3] <script ×N with no >, .html', 'a.html', fill('<script ')],
    ['[v6 review c4] onclick=" ×N with no closing quote', 'a.html', fill('onclick="a ')],
    ['[v6 review c5] "src/**/*.js" glob strings ×N', 'a.js', fill('x("src/**/*.js");\n') + 'window.print()'],
    ['[v5 review] 1,000 × "x = open(" in 1 MB, plus y.print()', 'public/app.js', Array.from({ length: 1000 }, (_, i) => `w${i} = open(u${i});\n` + 'let aa = 1;\n'.repeat(80)).join('').slice(0, MB) + '\ny.print();'],
    ['[v5 review] 30k open( assignments + 30k print calls of other names', 'public/app.js', (Array.from({ length: 3000 }, (_, i) => `v${i}=open(u);z${i}.print()`).join(';') + ';').repeat(10).slice(0, MB)],
    ['1 MB of // comments, then window.print()', 'public/app.js', ('const a = 1; // x\n').repeat(55000) + 'window.print()'],
    ["require(' ×N unclosed, with pdfkit words", 'a.js', fill("require('pdfkit ") + 'new PDFDocument(); doc.text(x)'],
    ['pdfkit + 1,000 unclosed doc.font( calls', 'a.js', "const PDFDocument = require('pdfkit'); const doc = new PDFDocument();\n" + 'doc.font(\n'.repeat(1000) + ' '.repeat(900000)],
    ['%PDF: 20k comparisons in a writing file', 'a.js', "res.send(x);\n" + "if (h === '%PDF-1.7') {}\n".repeat(20000)],
];
const HOSTILE_PAGES: Array<[string, string]> = [
    ['[v7 review] appIsRtl: <html ×N with no >', fill('<html ')],
    ['[v7 review] appIsRtl: <a b ×N (tag stripping)', '<html>' + fill('<a b ')],
    ['[v7 review] appIsRtl: <script x ×N unclosed', '<html>' + fill('<script x ')],
];
const HOSTILE_REQUESTS: Array<[string, string]> = [
    ['[v7 review] asksPdf: «view the pdf» ×N (1 MB request)', fill('view the pdf ')],
    ['asksPdf: «اطبع» ×N (1 MB request)', fill('اطبع ')],
];

describe('the scan child through runArgvStreaming', () => {
    it('the 19 hostile inputs of the v5–v7 reviews at 1 MB: every one its line within its 5 s, Joe\'s event loop at most its idle max + 100 ms', async () => {
        const items: ScanItem[] = [];
        HOSTILE_FILES.forEach(([, rel, text], k) => { const p = path.join(tmp, `f${k}`); fs.writeFileSync(p, text); items.push({ kind: 'file', path: p, rel }); });
        HOSTILE_PAGES.forEach(([, text], k) => { const p = path.join(tmp, `p${k}.html`); fs.writeFileSync(p, text); items.push({ kind: 'pages', paths: [p], request: '', language: 'en' }); });
        HOSTILE_REQUESTS.forEach(([, text]) => items.push({ kind: 'request', text, language: 'en' }));
        //  The bar is relative: the same loop, idle, in this same test.
        const idle = monitorEventLoopDelay({ resolution: 10 }); idle.enable(); await new Promise(r => setTimeout(r, 5000)); idle.disable();
        const busy = monitorEventLoopDelay({ resolution: 10 }); busy.enable();
        const lines = await scanText(items, { deadlineAt: Date.now() + 120_000 });
        busy.disable();
        expect(lines).toHaveLength(19);
        for (const l of lines) {
            expect(l.failed).toBeUndefined();
            expect(l.timedOut).toBeUndefined();
            expect(l.ms).toBeLessThan(5000);
        }
        expect(lines[2].mechanisms!.map(m => m.what)).toEqual(['fpdf']);
        expect(lines[10].mechanisms!.map(m => m.what)).toEqual(['window.print(']);
        expect(lines.slice(14, 17).every(l => l.rtl === false)).toBe(true);
        expect(lines[17].asksPdf).toBe(false);
        expect(lines[18].asksPdf).toBe(true);
        expect(busy.max).toBeLessThanOrEqual(idle.max + 100e6);
    });

    it('an item over its time is stopped by the watchdog, said «timed out», and the next item still gets its line', async () => {
        //  The slowest hostile input (≈ 0.5 s) under a 100 ms limit, then a tiny file.
        const slow = path.join(tmp, 'slow.js'); fs.writeFileSync(slow, ('const a = 1; // x\n').repeat(55000) + 'window.print()');
        const ok = path.join(tmp, 'ok.js'); fs.writeFileSync(ok, 'window.print();\n');
        const lines = await scanText([{ kind: 'file', path: slow, rel: 'public/app.js' }, { kind: 'file', path: ok, rel: 'public/app.js' }], { deadlineAt: Date.now() + 60_000, itemMs: 100 });
        expect(lines[0].timedOut).toBe(true);
        expect(lines[1].mechanisms!.map(m => m.what)).toEqual(['window.print(']);
    });

    it('the request is cut to 20,000 characters before it reaches the job file', async () => {
        //  A request whose only PDF word is past the cut: the child never sees it.
        const long = 'a '.repeat(SCAN_REQUEST_CHARS / 2) + ' اطبع الفاتورة PDF';
        const [line] = await scanText([{ kind: 'request', text: long, language: 'ar' }], { deadlineAt: Date.now() + 60_000 });
        expect(line.asksPdf).toBe(false);
        const [short] = await scanText([{ kind: 'request', text: 'اطبع الفاتورة PDF', language: 'ar' }], { deadlineAt: Date.now() + 60_000 });
        expect(short.asksPdf).toBe(true);
    });
});

/* ───────────── the brief ───────────── */

describe('the brief, once per run, only for a right-to-left app that prints or makes a PDF', () => {
    const plan = newPlan([]);
    const project = (name: string, files: Record<string, string> = {}) => {
        const dir = path.join(tmp, name);
        fs.mkdirSync(dir, { recursive: true });
        for (const [rel, body] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), body); }
        return dir;
    };
    const facts = (dir: string, request: string, language: string, extra: Record<string, unknown> = {}) => ({ runId: `run-${path.basename(dir)}`, request, language, projectDir: dir, ...extra });

    it('first message byte-identical to today\'s for an English PDF request, an Arabic request with no PDF, repository mode and an Arabic request for an English app', async () => {
        const cases: Array<[string, string, Record<string, unknown>]> = [
            ['Build an invoice app with PDF export', 'en', {}],
            ['ابنِ تطبيق ملاحظات بسيط', 'ar', {}],
            ['اطبع الفاتورة بصيغة PDF', 'ar', { change: { repository: true, history: [] } }],
            ['ابني تطبيق فواتير بالإنجليزي لعملائي في أمريكا مع تصدير PDF', 'ar', {}],
        ];
        for (const [k, [request, language, extra]] of cases.entries()) {
            const dir = project(`same-${k}`);
            const state: PdfBriefState = { given: false };
            const brief = await pdfBriefAtStart(state, facts(dir, request, language, extra) as any);
            expect(brief).toBe('');
            expect(firstMessage(request, language, plan, dir, undefined, (extra as any).change, brief || undefined)).toBe(firstMessage(request, language, plan, dir, undefined, (extra as any).change));
            expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit'))).toBe(false);
        }
    });

    it('an Arabic request for a PDF gets the brief after the isolation line, and the kit; a document-only request gets variant D', async () => {
        const dir = project('arabic-invoice');
        const state: PdfBriefState = { given: false };
        const brief = await pdfBriefAtStart(state, facts(dir, 'اعمل تطبيق فواتير مع زر طباعة', 'ar') as any);
        expect(state.given).toBe(true);
        expect(brief).toMatch(/print view/u);
        expect(brief).toMatch(/page\.pdf\(\{ printBackground: false \}\)/u);
        expect(brief).toContain('vendor/joe-kit');
        expect(fs.existsSync(path.join(dir, 'vendor', 'joe-kit', 'print.css'))).toBe(true);
        const msg = firstMessage('اعمل تطبيق فواتير مع زر طباعة', 'ar', plan, dir, undefined, undefined, brief);
        expect(msg.indexOf(brief)).toBeGreaterThan(0);
        expect(msg.indexOf(brief)).toBeLessThan(msg.indexOf('Start by calling plan_update'));
        const doc = project('arabic-report');
        const d = await pdfBriefAtStart({ given: false }, facts(doc, 'اكتب لي تقرير PDF عن المبيعات', 'ar') as any);
        expect(d).toMatch(/never name it `index\.html`/u);
        expect(d).toMatch(/the PDF file is the delivery/u);
    });

    it('the builder\'s own write that adds a PDF mechanism to a right-to-left app gives the brief once; an ordinary write and an English app give nothing', async () => {
        const dir = project('arabic-cert', {
            'server/cert.js': "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.text(student.name, { align: 'right' });\n",
            'server/index.js': "const express = require('express'); const app = express(); app.listen(3000);",
        });
        const state: PdfBriefState = { given: false };
        const f = facts(dir, 'نظام شهادات للطلاب', 'ar');
        expect(await pdfBriefAtStart(state, f as any)).toBe('');
        expect(await pdfBriefAfterWrite(state, f as any, ['server/index.js'])).toBe('');
        expect(state.given).toBe(false);
        const brief = await pdfBriefAfterWrite(state, f as any, ['server/cert.js']);
        expect(brief).toMatch(/pdfkit/u);
        expect(state.given).toBe(true);
        expect(await pdfBriefAfterWrite(state, f as any, ['server/cert.js'])).toBe('');
        const en = project('english-cert', { 'server/cert.js': "const PDFDocument = require('pdfkit');\nconst doc = new PDFDocument();\ndoc.text(student.name);\n" });
        expect(await pdfBriefAfterWrite({ given: false }, facts(en, 'A certificate system for my students', 'en') as any, ['server/cert.js'])).toBe('');
        expect(fs.existsSync(path.join(en, 'vendor', 'joe-kit'))).toBe(false);
    });
});
