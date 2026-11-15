/**
 * A PDF FINDING NEVER REFUSES (design arabic-pdf v9 §2 S2, §4.1, §5; test E).
 *
 * «Only the positive, no harm»: the look runs after the verdict, on a verified delivery only;
 * what it finds reaches the chat lines, the notes and record.pdf — never deliveryVerdict, a
 * check, a tool call or the app's server. A project with no PDF mechanism and no PDF is
 * delivered exactly as before. The owner hears «<file>»: <words> in his language (six of them).
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createVerifier, deliveryOutput, type BrowserQa, type DeliveryVerification } from '../core/engine/verify';
import { seedRequirementsFromRequest } from '../core/engine/seed';
import { newPlan, seededRequirements } from '../core/engine/plan';
import type { ProcessRegistry, RunState, ToolContext } from '../core/engine/types';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { ShellExecuteTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { PDF_TOLD_IDS } from '../core/quality/outside-proof';
import { carriesRemedy, clearParts, outsideLines, PDF_LANGS, PDF_PHRASES, PDF_WORDS, type PdfLineId } from '../core/quality/outside-parts';
import type { AppAuditFinding } from '../core/quality/app-audit';
import type { CapturedPdf } from '../core/quality/outside-probe';

jest.setTimeout(300_000);

const TOOL_CONTEXT = { sessionId: 'joe-pdf-told-session', workspaceId: 'joe-pdf-told', userId: 'joe-pdf-told-user', runId: 'joe-pdf-told-run' };
const workspace = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-pdf-told-'));
const FIX = path.join(__dirname, 'fixtures', 'pdf-proof');

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-pdf-told-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => { fs.rmSync(workspace, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

let projects = 0;
function project(files: Record<string, string>): string {
    const dir = path.join(workspace, `project-${++projects}`);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

/** A notes app that keeps its records in data/notes.json; its page is Arabic, right-to-left. */
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>My notes</title></head><body><h1>My notes</h1><p>ملاحظاتي اليومية</p><ul></ul></body></html>';
const NOTES_SERVER = [
    "const http = require('http');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const file = path.join(__dirname, 'data', 'notes.json');",
    "let notes = JSON.parse(fs.readFileSync(file, 'utf8'));",
    'http.createServer((req, res) => {',
    "  if (req.method === 'POST' && req.url === '/api/notes') {",
    "    let body = '';",
    "    req.on('data', c => { body += c; });",
    "    req.on('end', () => { notes.push({ id: notes.length + 1, text: JSON.parse(body).text }); fs.writeFileSync(file, JSON.stringify(notes)); res.writeHead(201); res.end('{}'); });",
    '    return;',
    '  }',
    "  if (req.url === '/api/notes') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(notes)); }",
    "  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });",
    `  res.end(${JSON.stringify(PAGE)});`,
    "}).listen(Number(process.env.PORT) || 4173, '127.0.0.1');",
    '',
].join('\n');
const SEED = JSON.stringify([{ id: 1, text: 'Buy milk' }]);
const REQUEST = 'Build a page that shows my notes.';
const WANTED = [{ text: 'my notes', quote: 'my notes', line: '<h1>My notes</h1>' }];

function notesApp(extra: Record<string, string> = {}): string {
    return project({
        'server.js': NOTES_SERVER,
        'public/index.html': PAGE,
        'data/notes.json': SEED,
        'package.json': JSON.stringify({ name: 'my-notes', version: '1.0.0', private: true, scripts: { start: 'node server.js' } }, null, 2),
        ...extra,
    });
}

function request(url: string, method = 'GET', body?: string): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method, timeout: 5000, headers: body ? { 'content-type': 'application/json' } : {} }, res => {
            let text = '';
            res.on('data', c => { text += c; });
            res.on('end', () => resolve({ status: res.statusCode || 0, text }));
        });
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end(body);
    });
}

/**
 * The watched panel. `pdf`: the walk «received» this PDF — written where the capture writes, and
 * returned on AppAudit.pdfs as the capture returns it. `writes`: the walk saves a note, as the QA's forms do.
 */
function panel(opts: { pdf?: string; findings?: AppAuditFinding[]; writes?: boolean }): BrowserQa {
    return {
        async watcher() { return { sessionId: 'joe-pdf-told-panel', watching: true }; },
        async audit(_dir, o: any) {
            const base = String(o.serveUrl).replace(/\/$/u, '');
            if (opts.writes) await request(`${base}/api/notes`, 'POST', JSON.stringify({ text: 'qa note' }));
            const pdfs: CapturedPdf[] = [];
            if (opts.pdf && o.pdfCaptureDir) {
                fs.mkdirSync(o.pdfCaptureDir, { recursive: true });
                const p = path.join(o.pdfCaptureDir, 'qa-1.pdf');
                fs.copyFileSync(opts.pdf, p);
                pdfs.push({ path: p, how: 'response', url: '/api/notes/1/pdf', contentType: 'application/pdf', bytes: fs.statSync(p).size });
            }
            const findings = opts.findings || [];
            return { score: findings.length ? 70 : 100, findings, ...(o.pdfCaptureDir ? { pdfs } : {}) };
        },
    };
}

const calls: Array<{ tool: string; input: any }> = [];
const TOOLS: Record<string, () => { execute(input: any, context?: any): Promise<any> }> = {
    project_run: () => new ProjectRunTool(), project_stop: () => new ProjectStopTool(),
    quality_run: () => new QualityRunTool(), shell_execute: () => new ShellExecuteTool(),
};
/** The server does not come back after the records are put back (the «down» case). */
let runsLeft = Infinity;
const runTool = async (tool: string, input: any) => {
    const make = TOOLS[tool];
    if (!make) throw new Error(`the verifier asked for a tool this test does not provide: ${tool}`);
    calls.push({ tool, input });
    if (tool === 'project_run' && runsLeft-- <= 0) return { ok: false, error: 'the port is taken' };
    return executionFirewall.runInContext(`joe-pdf-told-${tool}`, () => make().execute(input, TOOL_CONTEXT));
};
beforeEach(() => { calls.length = 0; runsLeft = Infinity; });

async function ask(prompt: string): Promise<string> {
    if (prompt.startsWith('Read this request')) return JSON.stringify({ requirements: WANTED.map(w => ({ text: w.text, quote: w.quote })) });
    if (prompt.startsWith('Here is the source')) {
        const verdicts = [...prompt.matchAll(/^\s+\d+\. \[([^\]]+)\] (.+?) {3}\(he wrote: «/gmu)]
            .map(m => ({ id: m[1], verdict: 'met', evidence: WANTED[0].line, why: 'the page carries its heading' }));
        return JSON.stringify({ verdicts });
    }
    if (/look|screenshot/iu.test(prompt)) return JSON.stringify({ verdicts: [] });
    throw new Error('the test model was asked something it does not answer');
}

const noProcesses: ProcessRegistry = {
    async start() { throw new Error('not used'); }, logs: () => undefined,
    async stop() { return false; }, list: () => [], async stopAll() { /* none */ },
};

async function verify(dir: string, qa: BrowserQa): Promise<DeliveryVerification> {
    const seeds = await seedRequirementsFromRequest(REQUEST, 'en', ask);
    const state: RunState = {
        plan: newPlan(seededRequirements(seeds)),
        files: new Map(), commands: [], served: [], pages: [], verifications: [],
        steps: 0, modelMs: 0, toolMs: 0,
    };
    const ctx: ToolContext = {
        runId: `joe-pdf-told-run-${projects}`, projectDir: dir, stateDir: path.join(dir, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => undefined),
        deadlineAt: Date.now() + 15 * 60_000, language: 'en', request: REQUEST, processes: noProcesses,
        browser: () => { throw new Error('not used'); },
        state, emit: () => undefined, joe: {},
    };
    return executionFirewall.runInContext('joe-pdf-told-finish', () => createVerifier({ ask, runTool, browserQa: qa, mend: null })(ctx, { summary: 'done' })) as Promise<DeliveryVerification>;
}

const shape = (r: DeliveryVerification) => ({
    passed: r.passed,
    checks: r.checks.map(c => `${c.id}:${c.status}`),
    verdict: { ...r.delivery.verdict },
    tools: calls.map(c => c.tool),
});
const output = (r: DeliveryVerification, dir: string, language = 'ar') => deliveryOutput({
    result: { status: r.passed ? 'delivered' : 'failed', summary: 'done', verification: r, filesChanged: [], served: [], steps: 1 } as any,
    projectRoot: dir, request: REQUEST, language,
});

describe('a verified delivery: the look changes nothing but chat lines, notes and record.pdf', () => {
    it('with no PDF mechanism and no PDF there is no look at all: no record.pdf, no note, no line', async () => {
        const dir = notesApp();
        const r = await verify(dir, panel({}));
        expect(r.passed).toBe(true);
        expect(r.delivery.pdf).toBeUndefined();
        expect(r.delivery.log.join('\n')).not.toMatch(/pdf look/u);
        expect(String(output(r, dir).output.summary)).not.toMatch(/📄/u);
    });

    it('a PDF the walk received is looked at: told in the chat and record.pdf; the verdict, the checks and every tool call are those of the same app without it', async () => {
        const plainDir = notesApp();
        const plain = await verify(plainDir, panel({}));
        const plainShape = shape(plain);
        calls.length = 0;
        const dir = notesApp();
        const r = await verify(dir, panel({ pdf: path.join(FIX, 'w8-print-css-white-total.pdf') }));
        expect(shape(r)).toEqual(plainShape);
        expect(r.delivery.pdf).toEqual([{ source: 'qa', name: '/api/notes/1/pdf', told: ['pdf_no_ink'], notMeasured: ['typed text, cut, order', "font is the project's"] }]);
        expect(r.delivery.log.join('\n')).toMatch(/pdf look: «\/api\/notes\/1\/pdf» \(a PDF the Browser QA walk received/u);
        const said = String(output(r, dir).output.summary);
        expect(said).toContain('📄 «/api/notes/1/pdf»: النص لا يظهر على الورق');
        //  Only those lines differ from the same delivery without the PDF.
        const without = String(output(plain, plainDir).output.summary);
        expect(said.replace(/\n\n📄[^\n]*(?:\n📄[^\n]*)*/u, '').replace(/127\.0\.0\.1:\d+/gu, 'H')).toBe(without.replace(/127\.0\.0\.1:\d+/gu, 'H'));
        expect(output(r, dir).ok).toBe(true);
    });

    it('a refused delivery gets no look', async () => {
        const dir = notesApp();
        const dead: AppAuditFinding[] = [{ id: 'dead_controls', severity: 'high', detail: 'زر لا يفعل شيئاً', detailEn: 'a button that does nothing' } as any];
        const r = await verify(dir, panel({ pdf: path.join(FIX, 'w8-print-css-white-total.pdf'), findings: dead }));
        expect(r.passed).toBe(false);
        expect(r.delivery.pdf).toBeUndefined();
        expect(r.delivery.log.join('\n')).not.toMatch(/pdf look/u);
    });

    it('the «down» case: the server does not come back after the records are put back — refused as today; the look\'s lines are the builder\'s notes only', async () => {
        const dir = notesApp();
        runsLeft = 1;   // the live run starts; the restart after the records are put back does not
        const r = await verify(dir, panel({ pdf: path.join(FIX, 'w8-print-css-white-total.pdf'), writes: true }));
        expect(r.passed).toBe(false);
        expect(r.delivery.measurements.some(m => m.instrument === 'live' && m.ok === false)).toBe(true);
        expect(r.delivery.pdf).toBeUndefined();
        expect(r.delivery.log.join('\n')).toMatch(/pdf look: «\/api\/notes\/1\/pdf»/u);
        expect(String(output(r, dir).output.summary)).not.toMatch(/📄/u);
    });
});

/* ───────────── §5: the words ───────────── */

describe('the owner\'s words', () => {
    const ALL: PdfLineId[] = [...PDF_TOLD_IDS, 'pdf_route_measured_wrong', 'pdf_font_not_shipped'];

    it('every id of §5 has its words in all six languages, and nothing more', () => {
        expect(Object.keys(PDF_WORDS).sort()).toEqual([...ALL].sort());
        for (const id of ALL) for (const l of PDF_LANGS) expect([id, l, PDF_WORDS[id][l].length > 0]).toEqual([id, l, true]);
        for (const k of Object.keys(PDF_PHRASES) as Array<keyof typeof PDF_PHRASES>) for (const l of PDF_LANGS) expect(PDF_PHRASES[k][l].length).toBeGreaterThan(0);
        expect(PDF_WORDS.pdf_letters_reversed.ar).toBe('حروف الكلمات معكوسة');
        expect(PDF_WORDS.pdf_font_not_from_project.ru).toBe('арабский набран системным шрифтом, а не шрифтом приложения');
    });

    it('the remedy only on the lines that never fired on a right file; pdf_text_cut not with an ellipsis; pdf_no_ink only with a marker', () => {
        expect(carriesRemedy('pdf_letters_reversed', '', false)).toBe(true);
        expect(carriesRemedy('pdf_text_cut', 'the long name starts … — an ellipsis is beside it: the app may shorten long names on purpose', false)).toBe(false);
        expect(carriesRemedy('pdf_text_cut', 'the long name starts («INV4817») and its end («JOE3756») is not in the file', false)).toBe(true);
        expect(carriesRemedy('pdf_no_ink', '', false)).toBe(false);
        expect(carriesRemedy('pdf_no_ink', '', true)).toBe(true);
        for (const fact of ['pdf_typed_text_missing', 'pdf_text_is_image', 'pdf_font_not_from_project', 'pdf_text_light', 'pdf_text_very_faint', 'pdf_number_not_as_typed', 'pdf_text_tiny', 'pdf_route_measured_wrong'] as PdfLineId[]) {
            expect([fact, carriesRemedy(fact, '', true)]).toEqual([fact, false]);
        }
        expect(outsideLines([{ source: 'file', name: 'out/cert.pdf', told: ['pdf_text_mirrored'], notMeasured: [], remedy: ['pdf_text_mirrored'] }], 'en'))
            .toEqual(['📄 «out/cert.pdf»: the letters are mirrored — say «fix cert.pdf» to have it fixed']);
    });

    it('the all-clear never claims a part that was not measured', () => {
        const proof = (nm: Array<{ what: string; why: string }>) => ({ i: 0, told: [], notMeasured: nm, producer: '', creator: '', browserMade: true, pages: 1, pagesRead: 1, ms: 1 });
        expect(clearParts(proof([{ what: 'typed text, cut, order', why: 'the door types nothing' }]))).toEqual({ text: true, font: true, ink: true });
        expect(clearParts(proof([{ what: 'typed text, cut, order', why: 'x' }, { what: 'ink', why: 'ink is measured on browser-made files only' }])))
            .toEqual({ text: true, font: true, ink: 'ink is measured on browser-made files only' });
        expect(clearParts(proof([{ what: 'typed text, cut, order', why: 'x' }, { what: "font is the project's", why: 'the project ships no font file Joe could read' }])))
            .toEqual({ text: true, font: 'the project ships no font file Joe could read', ink: true });
        expect(clearParts(proof([{ what: 'typed text, cut, order', why: 'x' }, { what: 'font, ink', why: 'no Arabic text in the file' }])))
            .toEqual({ text: true, font: 'no Arabic text in the file', ink: 'no Arabic text in the file' });
        const all = clearParts(proof([{ what: 'everything', why: 'the file is 55 MB, over the 50 MB Joe reads' }]));
        expect(all).toEqual({ text: 'the file is 55 MB, over the 50 MB Joe reads', font: 'the file is 55 MB, over the 50 MB Joe reads', ink: 'the file is 55 MB, over the 50 MB Joe reads' });
        expect(outsideLines([{ source: 'file', name: 'r.pdf', told: [], notMeasured: [], clear: { text: true, font: 'x', ink: true } }], 'ar'))
            .toEqual(['📄 «r.pdf»: النص موجود · بخط التطبيق: لم يُقَس · ظاهر على الورقة']);
        expect(outsideLines([{ source: 'file', name: 'r.pdf', told: [], notMeasured: [], clear: { text: true, font: true, ink: true } }], 'de'))
            .toEqual(['📄 «r.pdf»: Text vorhanden · in der Schrift der App · auf Papier sichtbar']);
        expect(outsideLines([{ source: 'file', name: 'r.pdf', told: [], notMeasured: [], clear: { text: true, font: 'the project ships no font', ink: true } }], 'en'))
            .toEqual(["📄 «r.pdf»: text present · in the app's font: not measured (the project ships no font) · visible on paper"]);
        expect(outsideLines(undefined, 'ar')).toEqual([]);
    });
});
