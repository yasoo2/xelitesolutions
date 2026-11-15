/**
 * EVERY READING OF THE BUILDER'S TEXT FOR PDFs RUNS IN A CHILD (design arabic-pdf v9 §3.2).
 *
 * Whether a request asks for a PDF or printing, whether it speaks a right-to-left
 * language, which PDF mechanisms a file holds and whether the built page is
 * right-to-left are regexes over text the builder wrote. The v7 review measured two
 * of them quadratic on Joe's main thread (15–229 s on 125–500 KB). They run in the
 * scan child (assets/pdf-proof/scan.mjs with its rules, scan-rules.cjs — the lab's
 * scan9.mjs and mech9.cjs word for word), started only through
 * executionEngine.runArgvStreaming with a timeout; each item has a 5 s watchdog in
 * the child, and Joe reads only the child's result lines from a file.
 *
 * Joe passes paths, never contents; a request is cut to 20,000 characters before it
 * is written into the job file. The one decision taken on Joe's main thread is
 * writeTrigger: whether a written file is worth a scan child at all — the path's
 * ending and lower-cased indexOf of hint words, no regex.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

export type ScanItem =
    | { kind: 'file'; path: string; rel: string }
    | { kind: 'pages'; paths: string[]; request: string; language: string }
    | { kind: 'request'; text: string; language: string };

export type Mechanism = { kind: 'print' | 'server-browser' | 'other'; what: string; measured: boolean; line: number };

export type ScanLine = {
    i: number; mechanisms?: Mechanism[]; rtl?: boolean; appLang?: string; asksPdf?: boolean; speaksRtl?: boolean;
    timedOut?: true; skipped?: 'over 1 MB'; failed?: string; ms: number;
};

/** A request is cut to this before it is written into the job file (§3.2). */
export const SCAN_REQUEST_CHARS = 20_000;
/** Each item's time in the child (its watchdog). */
export const SCAN_ITEM_MS = 5_000;

/**
 * WHERE JOE'S OWN ASSETS ARE, wherever Joe was started from: `npm run start` in
 * api/ (cwd/assets), the repository root (cwd/api/assets), the bundle
 * (dist/../assets) and the source or jest (src/core/quality/../../../assets).
 */
export function findJoeAsset(rel: string): string | null {
    const candidates = [
        path.join(process.cwd(), 'assets'),
        path.join(process.cwd(), 'api', 'assets'),
        path.resolve(__dirname, '..', 'assets'),
        path.resolve(__dirname, '..', '..', '..', 'assets'),
    ];
    for (const dir of candidates) {
        const p = path.join(dir, rel);
        try { if (fs.statSync(p).isFile()) return p; } catch { /* not here */ }
    }
    return null;
}

/* ───────────── writeTrigger: the lab's mech9.cjs writeTrigger, word for word in TypeScript ───────────── */

const SCRIPT_ENDS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.html', '.htm', '.py'];
const TRIGGER_WORDS = ['pdf', 'print', 'canvas', 'fitz', 'weasyprint', 'wkhtml', 'gotenberg', 'reportlab', 'doctemplate', 'drawstring', 'drawrightstring', 'drawcentredstring', 'insert_text'];

/**
 * Whether a written file starts the scan child (v9 should-fix 4): the path ends in
 * a script or page extension and is not the kit or node_modules; the WHOLE file as
 * written (after an edit, the file as it now is, ≤ 1 MB), lower-cased, holds a hint
 * word — a Python `print(` not preceded by `.` does not count. No regex.
 */
export function writeTrigger(text: string, relPath: string): boolean {
    const rel = String(relPath || '').toLowerCase(); if (!SCRIPT_ENDS.some(e => rel.endsWith(e)) || rel.includes('vendor/joe-kit/') || rel.includes('node_modules/')) return false;
    const t = String(text || '').slice(0, 1048576).toLowerCase(); const py = rel.endsWith('.py');
    for (const w of TRIGGER_WORDS) for (let i = t.indexOf(w); i >= 0; i = t.indexOf(w, i + 1)) { if (py && w === 'print' && t[i + 5] === '(' && t[i - 1] !== '.') continue; return true; }
    return false;
}

/**
 * Whether a request could be one asksPdf says yes to — a superset by plain
 * substrings (no regex), so a request with none of them never pays a scan child.
 * Every word asksPdf reads as a PDF or a print word holds one of these.
 */
const ASKS_PDF_HINTS = ['pdf', 'print', 'طب', 'دي', 'ڈي', 'چاپ', 'پرنٹ', 'ورقي', 'paper', 'cop'];
export function mayAskPdf(request: string): boolean {
    //  The rules' own folding (foldAr), by a loop over the letters: marks, tatweel and joiners out, ى/ی → ي, ک → ك.
    let t = '';
    for (const c of String(request || '').slice(0, SCAN_REQUEST_CHARS).normalize('NFKC').toLowerCase()) {
        const n = c.codePointAt(0) || 0;
        if ((n >= 0x064B && n <= 0x065F) || n === 0x0670 || n === 0x0640 || n === 0x200C || n === 0x200D) continue;
        t += c === 'ى' || c === 'ی' ? 'ي' : c === 'ک' ? 'ك' : c;
    }
    return ASKS_PDF_HINTS.some(h => t.includes(h));
}

/* ───────────── the call ───────────── */

/**
 * One call of the scan child for these items; a line for every item, in order.
 * An item over its time is `timedOut` (the child is killed and a new one starts
 * at the next item); an item the child died on is `failed`; an item never reached
 * before the deadline is `failed: 'no time left'`. Never throws.
 */
export async function scanText(items: ScanItem[], opts: { deadlineAt: number; signal?: AbortSignal; cancelled?: Promise<void>; itemMs?: number }): Promise<ScanLine[]> {
    if (!items.length) return [];
    const got = new Map<number, ScanLine>();
    const script = findJoeAsset(path.join('pdf-proof', 'scan.mjs'));
    const rules = findJoeAsset(path.join('pdf-proof', 'scan-rules.cjs'));
    if (!script || !rules) return items.map((_, i) => ({ i, failed: 'the scan script is not installed (api/assets/pdf-proof)', ms: 0 }));
    const jobItems = items.map(it => it.kind === 'request'
        ? { kind: 'request', text: String(it.text || '').slice(0, SCAN_REQUEST_CHARS), language: String(it.language || '') }
        : it.kind === 'pages'
            ? { kind: 'pages', paths: (it.paths || []).slice(0, 5).map(String), request: String(it.request || '').slice(0, SCAN_REQUEST_CHARS), language: String(it.language || '') }
            : { kind: 'file', path: String(it.path), rel: String(it.rel || '') });
    let dir = '';
    try {
        dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-scan-'));
        const results = path.join(dir, 'results.jsonl');
        const jobFile = path.join(dir, 'job.json');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { executionEngine } = require('../../kernel/ExecutionEngine');
        let first = 0;
        let children = 0;
        while (first < items.length && children < items.length && opts.deadlineAt - Date.now() > 500 && !opts.signal?.aborted) {
            await fs.promises.writeFile(jobFile, JSON.stringify({ rules, results, first, items: jobItems, itemMs: opts.itemMs || SCAN_ITEM_MS }));
            const handle = executionEngine.runArgvStreaming(process.execPath, ['--max-old-space-size=256', script, jobFile], {
                cwd: dir, timeout: Math.max(1000, opts.deadlineAt - Date.now()), env: { NODE_OPTIONS: '', NODE_NO_WARNINGS: '1' },
                ...(opts.cancelled ? { cancel: opts.cancelled } : {}),
            });
            children++;
            const done: { ok: boolean; exitCode: number | null } = await handle.done;
            let text = '';
            try { text = await fs.promises.readFile(results, 'utf8'); } catch { /* no line yet */ }
            let lastStarted = -1;
            for (const l of text.split('\n')) {
                if (!l.endsWith('}')) continue;
                try {
                    const o = JSON.parse(l);
                    if (o.started) { lastStarted = o.i; continue; }
                    if (typeof o.i === 'number' && !got.has(o.i)) got.set(o.i, o);
                } catch { /* a half line is no line */ }
            }
            if (done.exitCode !== 0 && lastStarted >= 0 && !got.has(lastStarted)) {
                got.set(lastStarted, { i: lastStarted, failed: done.exitCode === 124 ? 'no time left' : `the scan stopped on this item (exit ${done.exitCode})`, ms: 0 });
            }
            let next = 0;
            while (got.has(next)) next++;
            if (next < items.length && done.exitCode === 0) break;
            first = next;
        }
    } catch { /* every item without a line is said so below */ }
    finally {
        if (dir) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => { /* best effort */ });
    }
    return items.map((_, i) => got.get(i) || { i, failed: 'no time left', ms: 0 });
}
