/**
 * THE ARABIC-PDF BRIEF, GIVEN ONCE PER RUN (design arabic-pdf v9 §3.1, S1).
 *
 * At run start, when the request asks for a PDF or printing and the app is
 * right-to-left; or when the builder's own file_write/file_edit adds a PDF
 * mechanism to a right-to-left app. Repository mode gets nothing. Every reading
 * of text is the scan child's (outside-scan.ts); on Joe's main thread only
 * indexOf decides whether a child is worth starting. The brief comes with the
 * kit (app-kit.ts), placed at the same moment and never earlier.
 *
 * OFF THE CRITICAL PATH (review 3 of r40, finding 8). The run-start scan child took
 * about 2 s and was awaited before the first model call, and almost every request
 * started one. Now the gate is whole words (mayAskPdf), the loop starts the scan in
 * parallel and gives the brief when it answers (pdfRunStart + pdfStartScan), and the
 * scans after a write are bounded: a path is never rescanned at the same size and
 * time, each hint kind starts at most one child per run, and once the request is
 * left-to-right and a scanned file said so too, no written file is scanned again.
 *
 * THE KIT LANDS ONLY WITH ITS BRIEF (review 4 of r40, S5). The run-start scan runs
 * beside the run, so it returns only the decision (pdfStartScan): it never writes into
 * the project. The loop gives the brief (pdfGiveBrief, which places the kit) at the
 * moment the brief joins the conversation — the first message, or the end of a step —
 * so the kit never appears while a step's build, git or verification walk runs, and
 * never for a run that is ending, ended, failed or was cancelled.
 */
import fs from 'fs';
import path from 'path';
import { isWithinRoot } from '../../modules/tools/path-containment';
import { mayAskPdf, scanText, writeTrigger, type ScanItem } from '../quality/outside-scan';
import { outsideBrief } from '../quality/outside-parts';
import { rememberPdfsAtRunStart } from '../quality/outside-probe';
import { appKitSource, placeAppKit } from './app-kit';
import type { ChangeContext } from './types';

export interface PdfBriefState {
    /** The brief was given in this run. */
    given: boolean;
    /** The request's own reading, once the scan child gave it. */
    speaksRtl?: boolean;
    asksPdf?: boolean;
    /** A left-to-right request whose scanned file said left-to-right too: no written file is scanned again in this run. */
    settledLtr?: boolean;
    /** rel → "size:mtime" of every written file already scanned. */
    scanned?: Map<string, string>;
    /** The hint kinds (writeHintKinds) that already started a scan child in this run. */
    hintKindsScanned?: Set<WriteHintKind>;
    /** Scan children started after writes in this run (tests read it). */
    writeScans?: number;
}

export interface RunFacts { runId: string; request: string; language: string; projectDir: string; stateDir?: string; change?: ChangeContext; signal?: AbortSignal; cancelled?: Promise<void> }

/**
 * The kinds of hint a written file holds, by indexOf on Joe's thread: printing, a canvas
 * that draws, or a PDF library or service. Each kind starts at most one scan child per run.
 */
export type WriteHintKind = 'print' | 'canvas' | 'pdf';
const HINTS_BY_KIND: Readonly<Record<WriteHintKind, readonly string[]>> = {
    print: ['print'],
    canvas: ['canvas', 'drawstring', 'drawrightstring', 'drawcentredstring', 'insert_text'],
    pdf: ['pdf', 'fitz', 'weasyprint', 'wkhtml', 'gotenberg', 'reportlab', 'doctemplate'],
};
export function writeHintKinds(text: string): WriteHintKind[] {
    const t = String(text || '').slice(0, WRITTEN_BYTES_MAX).toLowerCase();
    return (Object.keys(HINTS_BY_KIND) as WriteHintKind[]).filter(k => HINTS_BY_KIND[k].some(w => t.includes(w)));
}
const WRITTEN_BYTES_MAX = 1048576;

const variantOf = (request: string): 'print' | 'document' => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./select') as typeof import('./select')).asksForDocument(request) ? 'document' : 'print';
};

/**
 * The brief, with the kit placed now: called only where the brief joins the conversation
 * (the loop's first message or a step's end, and pdfBriefAfterWrite, which the loop awaits
 * there). '' when it was given already, when the run ended, or when the run ends during
 * the copy (placeAppKit then takes back what it wrote).
 */
export async function pdfGiveBrief(state: PdfBriefState, facts: RunFacts): Promise<string> {
    //  A run that ended (or was cancelled) gets nothing written into its project.
    if (state.given || facts.signal?.aborted) return '';
    const kit = await placeAppKit(facts.projectDir, facts.signal).catch(() => ({ dir: '', written: [] as string[], kept: [] as string[] }));
    if (!kit.dir || facts.signal?.aborted) return '';
    state.given = true;
    return outsideBrief(variantOf(facts.request), kit.dir);
}

/**
 * Run start, the part the loop awaits: the project's PDFs and their times are kept, in
 * memory and with the run in its state folder (a PDF the delivery writes is then known
 * as new; one that was there is never the delivery's). No child is started.
 */
export async function pdfRunStart(facts: RunFacts): Promise<void> {
    await rememberPdfsAtRunStart(facts.runId, facts.projectDir, facts.stateDir).catch(() => { /* a later look then reads no project PDF as new */ });
}

/**
 * Run start, the part the loop does NOT await: the request's scan child, and only its
 * DECISION — true when the request asks for a PDF or printing and speaks a right-to-left
 * language, so the brief (and with it the kit) is to be given. Nothing is placed here:
 * the loop starts it beside the first model call and, once it answered, gives the brief
 * with pdfGiveBrief at the next point where a brief can join the conversation.
 */
export async function pdfStartScan(state: PdfBriefState, facts: RunFacts): Promise<boolean> {
    if (facts.change?.repository || !appKitSource()) return false;
    if (!mayAskPdf(facts.request)) { state.asksPdf = false; return false; }
    const [line] = await scanText([{ kind: 'request', text: facts.request, language: facts.language }], { deadlineAt: Date.now() + 15_000, signal: facts.signal, cancelled: facts.cancelled });
    state.asksPdf = line?.asksPdf === true;
    if (typeof line?.speaksRtl === 'boolean') state.speaksRtl = line.speaksRtl;
    return state.asksPdf && state.speaksRtl === true && !state.given;
}

/**
 * Both parts at once, awaited: the PDFs remembered, then the request's scan, then the
 * brief with its kit (tests, and any caller that wants the brief in its first message).
 */
export async function pdfBriefAtStart(state: PdfBriefState, facts: RunFacts): Promise<string> {
    await pdfRunStart(facts);
    return (await pdfStartScan(state, facts)) ? pdfGiveBrief(state, facts) : '';
}

/** Files a step wrote, read at most this much each (the file as it now is). */
const WRITTEN_BYTES = WRITTEN_BYTES_MAX;

/**
 * After a step's file_write/file_edit: the brief, when a written file (as it now is)
 * holds a PDF mechanism and the app is right-to-left, once per run.
 */
export async function pdfBriefAfterWrite(state: PdfBriefState, facts: RunFacts, written: string[]): Promise<string> {
    if (state.given || state.settledLtr || facts.change?.repository || !written.length || !appKitSource()) return '';
    const root = path.resolve(facts.projectDir);
    const scanned = (state.scanned ??= new Map());
    const kindsDone = (state.hintKindsScanned ??= new Set());
    const files: Array<{ rel: string; abs: string; stamp: string; kinds: WriteHintKind[] }> = [];
    for (const raw of [...new Set(written)].slice(0, 8)) {
        const abs = path.resolve(root, String(raw || ''));
        if (!isWithinRoot(abs, root)) continue;
        const rel = path.relative(root, abs).split(path.sep).join('/');
        try {
            const st = await fs.promises.stat(abs);
            if (!st.isFile() || st.size > WRITTEN_BYTES) continue;
            const stamp = `${st.size}:${st.mtimeMs}`;
            if (scanned.get(rel) === stamp) continue;                       // the same file, already read
            const text = await fs.promises.readFile(abs, 'utf8');
            if (!writeTrigger(text, rel)) continue;
            const kinds = writeHintKinds(text);
            if (kinds.length && kinds.every(k => kindsDone.has(k))) continue;   // each hint kind starts one child per run
            files.push({ rel, abs, stamp, kinds });
        } catch { /* gone */ }
    }
    if (!files.length) return '';
    for (const f of files) { scanned.set(f.rel, f.stamp); for (const k of f.kinds) kindsDone.add(k); }
    const items: ScanItem[] = files.map(f => ({ kind: 'file' as const, path: f.abs, rel: f.rel }));
    const askRequest = typeof state.speaksRtl !== 'boolean';
    if (askRequest) items.push({ kind: 'request', text: facts.request, language: facts.language });
    state.writeScans = (state.writeScans || 0) + 1;
    const lines = await scanText(items, { deadlineAt: Date.now() + 20_000, signal: facts.signal, cancelled: facts.cancelled });
    if (askRequest) {
        const r = lines[lines.length - 1];
        if (typeof r?.speaksRtl === 'boolean') state.speaksRtl = r.speaksRtl;
        if (typeof r?.asksPdf === 'boolean') state.asksPdf = r.asksPdf;
    }
    const fileLines = lines.slice(0, files.length);
    //  A left-to-right request, and a file read as left-to-right: the app is not right-to-left; no more scans.
    if (state.speaksRtl === false && fileLines.some(l => l.rtl === false) && !fileLines.some(l => l.rtl === true)) state.settledLtr = true;
    if (state.given) return '';
    if (!fileLines.some(l => (l.mechanisms || []).length)) return '';
    if (state.speaksRtl !== true && !fileLines.some(l => l.rtl === true)) return '';
    return pdfGiveBrief(state, facts);
}
