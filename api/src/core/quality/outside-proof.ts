/**
 * THE PROOF OF A PDF RUNS IN A CHILD PROCESS, NEVER IN JOE (design arabic-pdf v9 §4.4).
 *
 * pdf.js in a worker_threads Worker segfaulted Joe's process (round 4), and a PDF is
 * hostile input: a 900 MB picture, five thousand pages, a font of 800 MB. The proof is
 * assets/pdf-proof/prove.mjs (the lab's prove9.mjs, word for word), started only
 * through executionEngine.runArgvStreaming; its watchdog thread stops a job over its
 * share of the call's time or the child over 768 MB, writing that job's line first.
 * Joe reads only complete lines of the results file. It loads nothing of pdf.js.
 *
 * What it says is told, never a refusal: no verdict reads it (design §2, S2).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { listProjectFiles } from '../../shared/utils/project-tree';
import { findJoeAsset } from './outside-scan';

export interface PdfJob { pdf: string; marker?: string; number?: string; fontFiles: string[] | null; readMs?: number; appLang?: string }
export interface ProofLimits { memMB: number; jobMs: number; readMs: number; pageOps: number; pageGlyphs: number; depth: number; fileBytes: number }
export const PROOF_LIMITS: ProofLimits = { memMB: 768, jobMs: 25_000, readMs: 20_000, pageOps: 1_500_000, pageGlyphs: 150_000, depth: 1_000, fileBytes: 50 * 1048576 };
export type PdfTold = 'pdf_text_is_image' | 'pdf_typed_text_missing' | 'pdf_number_not_as_typed' | 'pdf_text_tiny' | 'pdf_text_cut'
    | 'pdf_text_hidden' | 'pdf_text_mirrored' | 'pdf_text_upside_down' | 'pdf_text_off_page' | 'pdf_font_not_embedded'
    | 'pdf_font_not_from_project' | 'pdf_letters_reversed' | 'pdf_words_reversed' | 'pdf_text_painted_over'
    | 'pdf_text_overlapped' | 'pdf_no_ink' | 'pdf_text_very_faint' | 'pdf_text_light';
export const PDF_TOLD_IDS: readonly PdfTold[] = ['pdf_text_is_image', 'pdf_typed_text_missing', 'pdf_number_not_as_typed', 'pdf_text_tiny', 'pdf_text_cut',
    'pdf_text_hidden', 'pdf_text_mirrored', 'pdf_text_upside_down', 'pdf_text_off_page', 'pdf_font_not_embedded',
    'pdf_font_not_from_project', 'pdf_letters_reversed', 'pdf_words_reversed', 'pdf_text_painted_over',
    'pdf_text_overlapped', 'pdf_no_ink', 'pdf_text_very_faint', 'pdf_text_light'];
export interface PdfProof {
    i: number; told: Array<{ id: PdfTold; detail: string }>; notMeasured: Array<{ what: string; why: string }>;
    producer: string; creator: string; browserMade: boolean; pages: number; pagesRead: number; ms: number;
    ink?: { seen: number; c: number; l: number }; stopped?: 'memory' | 'time' | 'died' | 'budget'; rssMB?: number;
}
export const PROOF_VERSION = 9;

/** Fonts over this are never read, here or in the child (v9 M6: an 800 MB «font» killed every child in v8). */
export const FONT_FILE_MAX_BYTES = 20 * 1048576;

/* ───────────── the child's pure helpers, the SAME text as prove.mjs (test A compares them through its selfTest job) ───────────── */
/* eslint-disable */
const STRIP = /[ـً-ٰٟ​-‏‪-‮⁦-⁩\u0000�]/gu;
const DIG = '٠١٢٣٤٥٦٧٨٩', PDIG = '۰۱۲۳۴۵۶۷۸۹';
// @ts-ignore — the child's text, kept identical: a digit's index stands in for the digit
const fold: (s: unknown) => string = s => String(s).normalize('NFKC').replace(STRIP, '').replace(/[­‐‑]/gu, '-').replace(/[٠-٩]/gu, d => DIG.indexOf(d)).replace(/[۰-۹]/gu, d => PDIG.indexOf(d)).replace(/[یى]/gu, 'ي').replace(/ک/gu, 'ك').replace(/[ۀہھ]/gu, 'ه').replace(/[آأإ]/gu, 'ا').toLowerCase();
const codesOf: (m: unknown) => string[] = m => String(m || '').trim().split(/\s+/u).filter(w => /^[A-Za-z]{2,}-?\d{3,}$/u.test(w));
const numberForms: (n: unknown) => { exact: string[]; whole: string; fraction: string } = n => { const [i, f = ''] = String(n).split(/[.,]/u); const ft = f.replace(/0+$/u, ''); return { exact: [i + f, i + ft].filter((v, k, a) => v.length >= 4 && a.indexOf(v) === k), whole: i, fraction: ft }; };
const fontKey: (n: unknown) => string = n => String(n || '').replace(/^[A-Z]{6}\+/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* eslint-enable */
export const proofHelpers = { fold, codesOf, numberForms, fontKey };

/* ───────────── the crash rule (v7 crash7.cjs, 3 of 3) ───────────── */

/**
 * A crash is a child that ended with null / 134 / 139 / ≥ 0xC0000000 while a job it
 * had started has no line (the watchdog always writes its line first). It turns the
 * picture library off for the rest of this call; two children that die before any job
 * started turn it off for this Joe process.
 */
export const PROOF_PROCESS = { noCanvas: false, preStartCrashes: 0 };

const crashCode = (c: number | null) => c === null || c === 134 || c === 139 || (typeof c === 'number' && c >= 0xC0000000);

/** The node_modules that holds pdfjs-dist (and @napi-rs/canvas beside it), for the child. */
export function proofNodeModules(): string | null {
    try { return path.dirname(path.dirname(require.resolve('pdfjs-dist/package.json'))); } catch { /* look by hand */ }
    for (const start of [__dirname, process.cwd()]) {
        let dir = path.resolve(start);
        for (let k = 0; k < 8; k++) {
            const nm = path.join(dir, 'node_modules');
            if (fs.existsSync(path.join(nm, 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs'))) return nm;
            const up = path.dirname(dir); if (up === dir) break; dir = up;
        }
    }
    return null;
}

const nothing = (i: number, why: string, stopped?: PdfProof['stopped']): PdfProof => ({
    i, told: [], notMeasured: [{ what: 'everything', why }], producer: '', creator: '', browserMade: false, pages: 0, pagesRead: 0, ms: 0,
    ...(stopped ? { stopped } : {}),
});

/** A line from the child, with every field a reader expects. */
function proofOf(i: number, o: any): PdfProof {
    return {
        i,
        told: Array.isArray(o?.told) ? o.told.filter((t: any) => t && typeof t.id === 'string').map((t: any) => ({ id: t.id, detail: String(t.detail || '').slice(0, 600) })) : [],
        notMeasured: Array.isArray(o?.notMeasured) ? o.notMeasured.map((n: any) => ({ what: String(n?.what || ''), why: String(n?.why || '').slice(0, 300) })) : [],
        producer: String(o?.producer || '').slice(0, 200), creator: String(o?.creator || '').slice(0, 200), browserMade: o?.browserMade === true,
        pages: Number(o?.pages) || 0, pagesRead: Number(o?.pagesRead) || 0, ms: Number(o?.ms) || 0,
        ...(o?.ink && typeof o.ink === 'object' ? { ink: { seen: Number(o.ink.seen) || 0, c: Number(o.ink.c) || 0, l: Number(o.ink.l) || 0 } } : {}),
        ...(o?.stopped ? { stopped: o.stopped } : {}),
        ...(o?.rssMB ? { rssMB: Number(o.rssMB) } : {}),
    };
}

/**
 * Prove these PDFs: one child at a time, the call's deadline in the job file (each
 * job's fair share), a new child at the next job with no line while time remains and
 * fewer children than jobs have run. A line for every job, in order. Never throws.
 */
export async function provePdfs(jobs: PdfJob[], opts: {
    deadlineAt: number; signal?: AbortSignal; cancelled?: Promise<void>;
    script?: string; noCanvas?: boolean; limits?: Partial<ProofLimits>;
}): Promise<PdfProof[]> {
    if (!jobs.length) return [];
    const got = new Map<number, PdfProof>();
    let dir = '';
    try {
        const script = opts.script || findJoeAsset(path.join('pdf-proof', 'prove.mjs'));
        const nodeModules = proofNodeModules();
        if (!script) return jobs.map((_, i) => nothing(i, 'the proof script is not installed (api/assets/pdf-proof)'));
        if (!nodeModules) return jobs.map((_, i) => nothing(i, 'the PDF reader (pdfjs-dist) is not installed'));
        dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-pdf-proof-'));
        const results = path.join(dir, 'results.jsonl');
        const jobFile = path.join(dir, 'job.json');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        let callNoCanvas = !!opts.noCanvas || PROOF_PROCESS.noCanvas;
        let first = 0;
        let children = 0;
        while (first < jobs.length && children < jobs.length && opts.deadlineAt - Date.now() > 5000 && !opts.signal?.aborted) {
            await fs.promises.writeFile(jobFile, JSON.stringify({ list: jobs, nodeModules, results, first, noCanvas: callNoCanvas, limits: opts.limits, deadlineAt: opts.deadlineAt }));
            const firstAtStart = first;
            const handle = executionEngine.runArgvStreaming(process.execPath, ['--max-old-space-size=384', script, jobFile], {
                cwd: dir, timeout: Math.max(1000, opts.deadlineAt - Date.now()), env: { NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' },
                ...(opts.cancelled ? { cancel: opts.cancelled } : {}),
            });
            children++;
            const done: { ok: boolean; exitCode: number | null; error?: string } = await handle.done;
            const code = done.exitCode;
            const budget = code === 124 || code === 130;
            let text = '';
            try { text = await fs.promises.readFile(results, 'utf8'); } catch { /* no line yet */ }
            const started = new Set<number>();
            for (const l of text.split('\n')) {
                if (!l.endsWith('}')) continue;
                try {
                    const o = JSON.parse(l);
                    if (o.started) { started.add(o.i); continue; }
                    if (typeof o.i === 'number' && o.i >= 0 && o.i < jobs.length && !got.has(o.i)) got.set(o.i, proofOf(o.i, o));
                } catch { /* a half line is no line */ }
            }
            let k = 0;
            while (got.has(k)) k++;
            if (!budget && crashCode(code) && (started.has(k) || !started.has(firstAtStart))) {
                callNoCanvas = true;
                if (!started.has(firstAtStart)) {
                    PROOF_PROCESS.preStartCrashes++;
                    if (PROOF_PROCESS.preStartCrashes >= 2) PROOF_PROCESS.noCanvas = true;
                }
            }
            if (k < jobs.length && code !== 0 && started.has(k)) {
                got.set(k, nothing(k, budget ? 'the time for these PDFs ran out on this file' : `the reading process stopped on this file (exit ${code})`, budget ? 'budget' : 'died'));
            }
            first = 0;
            while (got.has(first)) first++;
            if (code === 0 && first < jobs.length) break;
        }
    } catch { /* every job without a line is said so below */ }
    finally {
        if (dir) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ });
    }
    return jobs.map((_, i) => got.get(i) || nothing(i, 'no time left', 'budget'));
}

/* ───────────── the project's fonts (v7 fonts7.cjs; v9 M6: every size read first) ───────────── */

const FONT_FILE = /\.(?:woff2?|ttf|otf)$/iu;
const FONT_NAME_FIRST = /arab|hebr|persian|farsi|vazir|naskh|kufi|nastaliq/iu;
const isFontBytes = (b: Buffer) => {
    if (!b || b.length < 4) return false;
    const s = b.toString('latin1', 0, 4);
    return s === 'wOF2' || s === 'wOFF' || s === 'OTTO' || s === 'true' || b.readUInt32BE(0) === 0x00010000;
};
const smallEnough = (file: string) => { try { const st = fs.statSync(file); return st.isFile() && st.size <= FONT_FILE_MAX_BYTES; } catch { return false; } };

/**
 * Every data: URI font in a text, of any media type and quoting, decoded and kept when
 * its first bytes are a font's (fonts7.cjs: 9 of 9 forms). Read by indexOf and one
 * linear pass per URI — no regex over the builder's text on Joe's main thread.
 */
export function fontsInDataUris(text: string, max = 40): Buffer[] {
    const out: Buffer[] = [];
    const s = String(text || '');
    const lower = s.toLowerCase();
    let from = 0;
    while (out.length < max) {
        const at = lower.indexOf('data:', from);
        if (at < 0) break;
        from = at + 5;
        //  The URI sits in url( … ): only whitespace and one quote between «url(» and «data:».
        let back = at - 1;
        while (back >= 0 && /\s/u.test(s[back])) back--;
        if (back >= 0 && (s[back] === '"' || s[back] === "'")) { back--; while (back >= 0 && /\s/u.test(s[back])) back--; }
        if (back < 3 || lower.slice(back - 3, back + 1) !== 'url(') continue;
        //  «;base64,» within the URI's header (its type and parameters, at most 200 characters).
        const head = lower.slice(at, at + 200);
        const b64 = head.indexOf('base64');
        if (b64 < 0) continue;
        let k = at + b64 + 6;
        while (k < s.length && /\s/u.test(s[k])) k++;
        if (s[k] !== ',') continue;
        k++;
        let data = '';
        for (; k < s.length; k++) {
            const c = s[k];
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '+' || c === '/' || c === '=') data += c;
            else if (c === ' ' || c === '\n' || c === '\r' || c === '\t') continue;
            else break;
        }
        from = k;
        if (data.length < 16) continue;
        let b: Buffer;
        try { b = Buffer.from(data, 'base64'); } catch { continue; }
        if (isFontBytes(b) && b.length <= FONT_FILE_MAX_BYTES) out.push(b);
    }
    return out;
}

/** Fonts the app takes from its dependencies (≤ 4 a package, two levels) and a Next.js build's own copies. */
export function dependencyFontFiles(root: string, max = 40): string[] {
    const out: string[] = [];
    let pkg: any = {};
    try { pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); } catch { /* none */ }
    const deps = Object.keys({ ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) });
    const walk = (dir: string, depth: number, found: string[]) => {
        let es: fs.Dirent[] = [];
        try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of es) {
            if (found.length >= 12) return;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (depth < 2 && e.name !== 'node_modules') walk(p, depth + 1, found); }
            else if (FONT_FILE.test(e.name) && smallEnough(p)) found.push(p);
        }
    };
    for (const d of deps) {
        const found: string[] = [];
        walk(path.join(root, 'node_modules', d), 0, found);
        found.sort((a, b) => Number(FONT_NAME_FIRST.test(path.basename(b))) - Number(FONT_NAME_FIRST.test(path.basename(a))));
        out.push(...found.slice(0, 4));
        if (out.length >= max) break;
    }
    const media = path.join(root, '.next', 'static', 'media');
    try { for (const f of fs.readdirSync(media)) if (FONT_FILE.test(f) && out.length < max && smallEnough(path.join(media, f))) out.push(path.join(media, f)); } catch { /* no build */ }
    return out.slice(0, max);
}

const DATA_URI_SOURCE = /\.(?:css|scss|html?|jsx?|tsx?|mjs|cjs|vue|svelte)$/iu;
const DATA_URI_FILE_BYTES = 2 * 1048576;

/**
 * projectFontFiles(root, jobDir): the project's .woff2/.woff/.ttf/.otf, the font files
 * of every package.json dependency, .next/static/media, and every data: URI font,
 * written into jobDir. Every candidate's size is read first: a file over 20 MB is skipped.
 */
export async function projectFontFiles(root: string, jobDir: string, max = 60): Promise<string[]> {
    const out: string[] = [];
    let files: string[] = [];
    try { files = await listProjectFiles(root, { keepFile: (_rel, name) => FONT_FILE.test(name) || DATA_URI_SOURCE.test(name) }); } catch { files = []; }
    for (const rel of files) {
        if (out.length >= max) break;
        const abs = path.join(root, rel);
        if (FONT_FILE.test(rel) && smallEnough(abs)) out.push(abs);
    }
    out.push(...dependencyFontFiles(root, Math.max(0, max - out.length)));
    let n = 0;
    for (const rel of files) {
        if (out.length >= max) break;
        if (!DATA_URI_SOURCE.test(rel)) continue;
        const abs = path.join(root, rel);
        try {
            const st = await fs.promises.stat(abs);
            if (!st.isFile() || st.size > DATA_URI_FILE_BYTES) continue;
            const text = await fs.promises.readFile(abs, 'utf8');
            if (!text.includes('data:')) continue;
            for (const b of fontsInDataUris(text, max - out.length)) {
                const p = path.join(jobDir, `font-data-${++n}.bin`);
                await fs.promises.writeFile(p, b);
                out.push(p);
            }
        } catch { /* unreadable is no font */ }
    }
    return [...new Set(out)].slice(0, max);
}
