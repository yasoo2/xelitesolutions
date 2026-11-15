/**
 * THE LOOK AT AN ARABIC PDF: NO REQUEST, NO WRITE (design arabic-pdf v9 §4).
 *
 * Stage 1 sends no request of its own to the app. The look reads only (a) PDF
 * files the delivery wrote into the project and (b) PDF bytes Joe's existing
 * Browser QA walk already received — kept by a capture beside the walk's own
 * response listener (attachPdfCapture, app-audit.ts). Every reading runs in a
 * child (the scan child for text, the proof child for PDFs); one look at a time
 * per Joe process (withLookSlot). What it finds is told: a chat line, a note and
 * DeliveryRecord.pdf — never a refusal, never a verdict.
 */
import fs from 'fs';
import path from 'path';
import { isJoeAppKit, listProjectFiles } from '../../shared/utils/project-tree';
import { scanText, writeTrigger, type Mechanism, type ScanItem } from './outside-scan';
import { projectFontFiles, provePdfs, type PdfJob, type PdfProof } from './outside-proof';
import { carriesRemedy, clearParts, NO_PDF_PRODUCED, type PdfLineId, type PdfRecordEntry } from './outside-parts';

/* ───────────── §4.3 one look at a time (lab slot9.cjs, line for line) ───────────── */

export type LookSlotResult<T> = { ok: true; value: T } | { ok: false; why: 'no-slot' | 'budget' | 'aborted' | 'failed'; error?: string };
export type WithLookSlot = <T>(opts: { budgetMs: number; waitMs: number; signal?: AbortSignal },
    fn: (look: AbortSignal, leftMs: number) => Promise<T>) => Promise<LookSlotResult<T>>;

/**
 * An in-process semaphore of 1, FIFO. A waiter gives up at waitMs and never runs
 * later. After a budget or cancel abort the caller is answered at once, but the slot
 * is released only when the old look has settled — its child exited — or 2 s after
 * the abort, whichever comes first.
 */
export function makeLookSlot(): { withLookSlot: WithLookSlot; stats: { granted: number; lateSettles: number; maxActive: number }; busy: () => boolean } {
    let busy = false; const queue: any[] = []; const stats = { granted: 0, lateSettles: 0, maxActive: 0 }; let active = 0;
    const pump = () => { while (!busy && queue.length) { const w = queue.shift(); if (w.gaveUp) continue; w.grant(); } };
    function withLookSlot<T>(opts: { budgetMs: number; waitMs: number; signal?: AbortSignal }, fn: (look: AbortSignal, leftMs: number) => Promise<T>): Promise<LookSlotResult<T>> {
        const t0 = Date.now(); const { budgetMs, waitMs, signal } = opts; const left = () => Math.max(0, budgetMs - (Date.now() - t0));
        return new Promise<LookSlotResult<T>>(resolve => {
            let settled = false; const done = (r: LookSlotResult<T>) => { if (!settled) { settled = true; resolve(r); } };
            const run = () => {
                busy = true; active++; stats.granted++; stats.maxActive = Math.max(stats.maxActive, active); let released = false;
                const release = () => { if (released) return; released = true; busy = false; active--; pump(); };
                const look = new AbortController(); const ms = left();
                let settledFn: Promise<LookSlotResult<T>> | null = null; const afterOld = () => Promise.race([settledFn, new Promise(r => setTimeout(r, 2000))]).then(release);
                const onAbort = () => { look.abort('aborted'); done({ ok: false, why: 'aborted' }); afterOld(); };
                const tm = setTimeout(() => { look.abort('budget'); done({ ok: false, why: 'budget' }); afterOld(); }, ms);
                if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
                settledFn = Promise.resolve().then(() => fn(look.signal, ms)).then(v => ({ ok: true as const, value: v }), e => ({ ok: false as const, why: 'failed' as const, error: String(e && e.message || e) }));
                settledFn
                    .then(r => { if (settled) stats.lateSettles++; clearTimeout(tm); if (signal) signal.removeEventListener('abort', onAbort); release(); done(r); });
            };
            if (signal && signal.aborted) return done({ ok: false, why: 'aborted' });
            if (!busy && !queue.length) return run();
            const w: any = { gaveUp: false, grant: () => { clearTimeout(w.timer); if (signal) signal.removeEventListener('abort', w.abort); if (w.gaveUp) return pump(); run(); } };
            w.timer = setTimeout(() => { w.gaveUp = true; done({ ok: false, why: 'no-slot' }); }, Math.max(0, waitMs));
            w.abort = () => { w.gaveUp = true; clearTimeout(w.timer); done({ ok: false, why: 'aborted' }); };
            if (signal) signal.addEventListener('abort', w.abort, { once: true });
            queue.push(w);
        });
    }
    return { withLookSlot, stats, busy: () => busy };
}

/** This Joe process's one slot. */
const PROCESS_SLOT = makeLookSlot();
export const withLookSlot: WithLookSlot = (opts, fn) => PROCESS_SLOT.withLookSlot(opts, fn);

/* ───────────── §4.2 (2): the capture beside the Browser QA walk (lab capture9.cjs, the rule word for word) ───────────── */

export type CapturedPdf = { path: string; how: 'response' | 'download'; url: string; contentType: string; bytes: number };

const MAX_ONE = 50 * 1048576, MAX_ALL = 100 * 1048576, MAX_FILES = 12;
export const mediaType = (h: unknown) => String(h || '').split(';')[0].trim().toLowerCase();
export const pdfName = (d: unknown) => /filename\*?\s*=\s*(?:utf-8'')?["']?[^"';]*\.pdf\b/iu.test(String(d || ''));
const PDF_TYPES = new Set(['application/pdf', 'application/x-pdf']);
export const headersSayPdf = (ct: unknown, cd: unknown) => PDF_TYPES.has(mediaType(ct)) || (mediaType(ct) === 'application/octet-stream' && pdfName(cd)) || (/^\s*attachment\b/iu.test(String(cd || '')) && pdfName(cd));
export const bytesArePdf = (b: Buffer) => { const head = b.subarray(0, 1024).toString('latin1'); return head.indexOf('%PDF-') >= 0; };

/**
 * Keep the PDFs a page receives, from the bytes the browser already has: a response
 * whose headers say PDF is read with response.body() (no request), a download from
 * download.path() (the browser wrote it). Kept only when %PDF- is in the first 1,024
 * bytes; at most 12 files, 50 MB each, 100 MB in all, as <dir>/qa-<n>.pdf.
 */
export function attachPdfCapture(page: any, dir: string): { kept: CapturedPdf[]; seen: { responses: number; considered: number }; settle: (ms?: number) => Promise<CapturedPdf[]>; stop: () => void } {
    const kept: CapturedPdf[] = []; let bytes = 0; let reserved = 0; const seen = { responses: 0, considered: 0 }; const pending: Promise<unknown>[] = [];
    let stopped = false;
    /** The walk opens a page at several widths and after reloads: one PDF is kept once (its path and its size). */
    const seenPdfs = new Set<string>();
    const keep = async (buf: Buffer, how: CapturedPdf['how'], url: string, ct: string) => {
        if (stopped || reserved >= MAX_FILES || buf.length > MAX_ONE || bytes + buf.length > MAX_ALL || !bytesArePdf(buf)) return false;
        const same = `${how} ${String(url || '').replace(/^https?:\/\/[^/]+/u, '')} ${buf.length}`;
        if (seenPdfs.has(same)) return false;
        seenPdfs.add(same);
        reserved++; bytes += buf.length;
        const p = path.join(dir, `qa-${reserved}.pdf`);
        try { await fs.promises.mkdir(dir, { recursive: true }); await fs.promises.writeFile(p, buf); }
        catch { bytes -= buf.length; return false; }
        kept.push({ path: p, how, url: String(url || '').replace(/^https?:\/\/[^/]+/u, ''), contentType: ct, bytes: buf.length });
        return true;
    };
    const onResponse = (r: any) => {
        seen.responses++; let h: any = {}; try { h = r.headers(); } catch { return; } const ct = h['content-type'], cd = h['content-disposition'];
        if (!headersSayPdf(ct, cd)) return; const len = Number(h['content-length'] || 0); if (len > MAX_ONE) return; seen.considered++;
        //  response.body() returns the bytes the browser already received (CDP Network.getResponseBody): no new request.
        pending.push(Promise.resolve(r.body()).then((b: Buffer) => keep(Buffer.from(b), 'response', r.url(), mediaType(ct))).catch(() => { /* gone */ }));
    };
    const onDownload = (d: any) => {
        pending.push(Promise.resolve(d.path()).then(async (p: string) => {
            if (!p) return; const st = await fs.promises.stat(p); if (st.size > MAX_ONE) return;
            const name = String(d.suggestedFilename?.() || '');
            await keep(await fs.promises.readFile(p), 'download', d.url(), name);
        }).catch(() => { /* gone */ }));
    };
    try { page.on('response', onResponse); page.on('download', onDownload); } catch { /* a page without events keeps nothing */ }
    const stop = () => { stopped = true; try { page.off('response', onResponse); page.off('download', onDownload); } catch { /* the page may be gone */ } };
    const settle = async (ms = 5000) => {
        await Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, ms))]);
        stop();
        return kept.slice();
    };
    return { kept, seen, settle, stop };
}

/* ───────────── §4.2 (1): PDF files the delivery wrote ───────────── */

const RUN_START_PDFS = new Map<string, Map<string, number>>();
const RUNS_KEPT = 200;
const pdfFile = (name: string) => /\.pdf$/iu.test(name);

/** The project's .pdf files and their mtimes, as they are now. */
export async function projectPdfTimes(root: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    let files: string[] = [];
    try { files = await listProjectFiles(root, { keepFile: (rel, name) => pdfFile(name) && !isJoeAppKit(rel) }); } catch { return out; }
    for (const rel of files) {
        try { out.set(rel, (await fs.promises.stat(path.join(root, rel))).mtimeMs); } catch { /* gone */ }
    }
    return out;
}

/**
 * The run starts' PDF times, kept with the run in the project's state folder too
 * (.joe/pdfs-at-run-start.json), so a look after a Joe restart, a resume, or more
 * than RUNS_KEPT runs in one process still knows which PDFs were already his
 * (review 3 of r40, finding 9). The last RUNS_ON_DISK runs of the project are kept.
 */
export const RUN_START_FILE = 'pdfs-at-run-start.json';
const RUNS_ON_DISK = 20;
type RunStartRecord = { runId: string; at: number; pdfs: Record<string, number> };

async function readRunStarts(stateDir: string): Promise<RunStartRecord[]> {
    try {
        const o = JSON.parse(await fs.promises.readFile(path.join(stateDir, RUN_START_FILE), 'utf8'));
        return Array.isArray(o?.runs) ? o.runs.filter((r: any) => r && typeof r.runId === 'string' && r.pdfs && typeof r.pdfs === 'object') : [];
    } catch { return []; }
}

/** Kept at run start (loop.ts): rel → mtimeMs of the project's .pdf files, in memory and, given stateDir, on disk. */
export async function rememberPdfsAtRunStart(runId: string, root: string, stateDir?: string): Promise<void> {
    if (!runId) return;
    const times = await projectPdfTimes(root);
    RUN_START_PDFS.set(runId, times);
    while (RUN_START_PDFS.size > RUNS_KEPT) RUN_START_PDFS.delete(RUN_START_PDFS.keys().next().value as string);
    if (!stateDir) return;
    try {
        const runs = (await readRunStarts(stateDir)).filter(r => r.runId !== runId);
        runs.push({ runId, at: Date.now(), pdfs: Object.fromEntries(times) });
        await fs.promises.mkdir(stateDir, { recursive: true });
        const file = path.join(stateDir, RUN_START_FILE);
        await fs.promises.writeFile(`${file}.tmp`, JSON.stringify({ runs: runs.slice(-RUNS_ON_DISK) }));
        await fs.promises.rename(`${file}.tmp`, file);
    } catch { /* the memory copy still answers in this process */ }
}

/** The PDFs the project had when this run began: from memory, else from the run's record in stateDir; undefined when neither knows. */
export async function pdfsAtRunStart(runId: string, stateDir?: string): Promise<Map<string, number> | undefined> {
    const kept = RUN_START_PDFS.get(runId);
    if (kept || !runId || !stateDir) return kept;
    const rec = (await readRunStarts(stateDir)).find(r => r.runId === runId);
    if (!rec) return undefined;
    return new Map(Object.entries(rec.pdfs).filter(([, at]) => typeof at === 'number') as Array<[string, number]>);
}

/** Tests: forget the in-memory copy (as a restarted Joe would). */
export function forgetRunStartsInMemoryForTests(): void { RUN_START_PDFS.clear(); }

/**
 * The .pdf files new or changed since the run began, outside the kit, ≤ 50 MB, newest
 * first, at most 4. When the run's start is not known (`before` undefined) NO project
 * PDF counts as written by the delivery — an owner's contract in docs/ or his sample
 * invoices are never read, named or sent to the builder as the delivery's; only the
 * PDFs the Browser QA walk captured are then looked at (review 3 of r40, finding 9).
 */
export async function writtenPdfs(root: string, before: Map<string, number> | undefined): Promise<Array<{ rel: string; abs: string }>> {
    if (!before) return [];
    const now = await projectPdfTimes(root);
    const fresh: Array<{ rel: string; abs: string; at: number }> = [];
    for (const [rel, at] of now) {
        if (before.get(rel) === at) continue;
        const abs = path.join(root, rel);
        try { const st = await fs.promises.stat(abs); if (!st.isFile() || !st.size || st.size > MAX_ONE) continue; } catch { continue; }
        fresh.push({ rel, abs, at });
    }
    return fresh.sort((a, b) => b.at - a.at).slice(0, 4).map(({ rel, abs }) => ({ rel, abs }));
}

/* ───────────── §4.1 the look ───────────── */

const SCRIPT_FILE = /\.(?:m?js|cjs|jsx|m?ts|cts|tsx|vue|svelte|html?|py)$/iu;
const SOURCE_FILES_READ = 400;
const SOURCE_FILE_BYTES = 1048576;

export interface PdfLookInput {
    root: string; stateDir: string; runId: string; request: string; language: string;
    /** The served index.html, when the app serves a page (its language decides right-to-left). */
    servedIndex: string | null;
    /** What the Browser QA walk kept (AppAudit.pdfs). */
    captured: CapturedPdf[];
    deadlineAt: number; signal?: AbortSignal; cancelled?: Promise<void>;
    /** Tests: another slot, another proof script. */
    slot?: WithLookSlot; proofScript?: string;
}
export interface PdfLook { entries: PdfRecordEntry[]; notes: string[]; proofs: PdfProof[] }

/** The project's script and page files that hold a hint word (writeTrigger), read on the main thread by indexOf only. */
async function filesWithHints(root: string): Promise<Array<{ rel: string; abs: string }>> {
    let files: string[] = [];
    try { files = await listProjectFiles(root, { skipDirectory: (name, rel) => name === 'dist' || isJoeAppKit(rel), keepFile: (rel, name) => SCRIPT_FILE.test(name) && !isJoeAppKit(rel) }); } catch { return []; }
    const out: Array<{ rel: string; abs: string }> = [];
    for (const rel of files.slice(0, SOURCE_FILES_READ)) {
        const abs = path.join(root, rel);
        try {
            const st = await fs.promises.stat(abs);
            if (!st.isFile() || st.size > SOURCE_FILE_BYTES) continue;
            if (writeTrigger(await fs.promises.readFile(abs, 'utf8'), rel)) out.push({ rel, abs });
        } catch { /* unreadable is not a mechanism */ }
    }
    return out;
}

const whatOf = (m: Mechanism) => m.what;
const routeDetail = (rel: string, m: Mechanism) => `${rel}:${m.line} makes the PDF with ${m.what}. In Joe's tests, ${m.what} printed Arabic with its letters unjoined or its words reversed. The way measured to print Arabic right is a print page turned into a PDF by the browser (vendor/joe-kit/README.md).`;

/**
 * The look, after a verified delivery's verdict: null when there is nothing to say
 * (not right-to-left, no PDF mechanism and no PDF) — then the delivery is as it was.
 */
export async function lookAtPdfs(input: PdfLookInput): Promise<PdfLook | null> {
    const written = await writtenPdfs(input.root, await pdfsAtRunStart(input.runId, input.stateDir));
    const captured = (input.captured || []).filter(c => c && c.path && fs.existsSync(c.path)).slice(0, 12);
    const hinted = await filesWithHints(input.root);
    if (!written.length && !captured.length && !hinted.length) return null;
    const budgetMs = Math.min(90_000, input.deadlineAt - Date.now() - 60_000);
    if (budgetMs < 15_000) return { entries: [], notes: ['pdf look: not measured — not enough time left before the run\'s deadline'], proofs: [] };
    const slot = input.slot || withLookSlot;
    const r = await slot({ budgetMs, waitMs: Math.min(20_000, budgetMs - 30_000), signal: input.signal }, async (look, leftMs) => {
        const lookEnds = Date.now() + leftMs;
        //  The look's own signal stops its children (it is aborted by the run's signal, its
        //  budget or its slot); the run's long-lived `cancelled` promise is read only by a
        //  caller with no signal (review 3 of r40, 11: one cancel handler per call, removed).
        const cancelled = !input.signal && input.cancelled ? input.cancelled : undefined;
        const items: ScanItem[] = [
            { kind: 'pages', paths: input.servedIndex ? [input.servedIndex] : [], request: input.request, language: input.language },
            ...hinted.map(h => ({ kind: 'file' as const, path: h.abs, rel: h.rel })),
        ];
        const lines = await scanText(items, { deadlineAt: Math.min(lookEnds, Date.now() + 30_000), signal: look, cancelled });
        const page = lines[0];
        if (page?.rtl !== true) return null;
        const mechanisms = hinted.flatMap((h, k) => (lines[k + 1]?.mechanisms || []).map(m => ({ rel: h.rel, m })));
        if (!mechanisms.length && !written.length && !captured.length) return null;
        const entries: PdfRecordEntry[] = [];
        const notes: string[] = [];
        if (mechanisms.length) notes.push(`pdf look: the app's PDF mechanisms: ${mechanisms.map(x => `${x.rel}:${x.m.line} ${whatOf(x.m)} (${x.m.kind})`).join('; ')}`);
        for (const x of mechanisms.filter(y => y.m.measured)) {
            if (entries.some(e => e.source === 'code' && e.name === x.rel)) continue;
            entries.push({ source: 'code', name: x.rel, told: ['pdf_route_measured_wrong'], notMeasured: [] });
            notes.push(`pdf look: ${routeDetail(x.rel, x.m)}`);
        }
        const targets = [
            ...written.map(w => ({ source: 'file' as const, name: w.rel, pdf: w.abs })),
            ...captured.map(c => ({ source: 'qa' as const, name: (String(c.url || '').split(/[?#]/u)[0] || path.basename(c.path)), pdf: c.path })),
        ];
        if (!targets.length) {
            entries.push({ source: 'qa', name: '', told: [], notMeasured: [NO_PDF_PRODUCED] });
            notes.push('pdf look: not measured — the app has a PDF mechanism, and no PDF was produced during the checks (the delivery wrote none, and the Browser QA walk received none)');
            return { entries, notes, proofs: [] as PdfProof[] };
        }
        const jobDir = path.join(input.stateDir, 'proof', 'outside', `fonts-${Date.now()}`);
        let proofs: PdfProof[] = [];
        try {
            await fs.promises.mkdir(jobDir, { recursive: true });
            const fontFiles = await projectFontFiles(input.root, jobDir);
            const appLang = page.appLang || '';
            const jobs: PdfJob[] = targets.map(t => ({ pdf: t.pdf, marker: '', number: '', fontFiles, ...(appLang ? { appLang } : {}) }));
            proofs = await provePdfs(jobs, { deadlineAt: lookEnds, signal: look, cancelled, ...(input.proofScript ? { script: input.proofScript } : {}) });
        } finally {
            await fs.promises.rm(jobDir, { recursive: true, force: true }).catch(() => { /* best effort */ });
        }
        targets.forEach((t, k) => {
            const p = proofs[k];
            if (!p) return;
            const told = p.told.map(x => x.id as PdfLineId);
            const remedy = p.told.filter(x => carriesRemedy(x.id, x.detail, false)).map(x => x.id as PdfLineId);
            entries.push({
                source: t.source, name: t.name, told, notMeasured: p.notMeasured.map(n => n.what),
                ...(remedy.length ? { remedy } : {}),
                ...(!told.length ? { clear: clearParts(p) } : {}),
            });
            notes.push(`pdf look: «${t.name}» (${t.source === 'file' ? 'a PDF the delivery wrote' : 'a PDF the Browser QA walk received'}, ${p.pagesRead}/${p.pages} page(s), ${p.ms} ms): ${p.told.length ? p.told.map(x => `${x.id}${x.detail ? ` — ${x.detail}` : ''}`).join('; ') : 'nothing told'}${p.notMeasured.length ? `; not measured: ${p.notMeasured.map(n => `${n.what} (${n.why})`).join('; ')}` : ''}`);
        });
        return { entries, notes, proofs };
    });
    if (!r.ok) return { entries: [], notes: [`pdf look: not measured — ${r.why === 'no-slot' ? 'another look at a PDF held Joe\'s one slot' : r.why === 'budget' ? 'the look ran out of its time' : r.why === 'aborted' ? 'the run was cancelled' : `the look failed: ${r.error || ''}`}`], proofs: [] };
    return r.value;
}
