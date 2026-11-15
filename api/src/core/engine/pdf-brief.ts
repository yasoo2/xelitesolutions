/**
 * THE ARABIC-PDF BRIEF, GIVEN ONCE PER RUN (design arabic-pdf v9 §3.1, S1).
 *
 * At run start, when the request asks for a PDF or printing and the app is
 * right-to-left; or when the builder's own file_write/file_edit adds a PDF
 * mechanism to a right-to-left app. Repository mode gets nothing. Every reading
 * of text is the scan child's (outside-scan.ts); on Joe's main thread only
 * indexOf decides whether a child is worth starting. The brief comes with the
 * kit (app-kit.ts), placed at the same moment and never earlier.
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
}

interface RunFacts { runId: string; request: string; language: string; projectDir: string; change?: ChangeContext; signal?: AbortSignal; cancelled?: Promise<void> }

const variantOf = (request: string): 'print' | 'document' => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return (require('./select') as typeof import('./select')).asksForDocument(request) ? 'document' : 'print';
};

async function giveBrief(state: PdfBriefState, facts: RunFacts): Promise<string> {
    const kit = await placeAppKit(facts.projectDir).catch(() => ({ dir: '', written: [] as string[], kept: [] as string[] }));
    if (!kit.dir) return '';
    state.given = true;
    return outsideBrief(variantOf(facts.request), kit.dir);
}

/**
 * Run start: the project's PDFs and their times are kept (a PDF the delivery writes is
 * then known as new), and the brief when the request asks for it. '' for nothing —
 * then the first message is byte-identical to what it was.
 */
export async function pdfBriefAtStart(state: PdfBriefState, facts: RunFacts): Promise<string> {
    await rememberPdfsAtRunStart(facts.runId, facts.projectDir).catch(() => { /* a later PDF is then judged as new */ });
    if (facts.change?.repository || !appKitSource()) return '';
    if (!mayAskPdf(facts.request)) { state.asksPdf = false; return ''; }
    const [line] = await scanText([{ kind: 'request', text: facts.request, language: facts.language }], { deadlineAt: Date.now() + 15_000, signal: facts.signal, cancelled: facts.cancelled });
    state.asksPdf = line?.asksPdf === true;
    if (typeof line?.speaksRtl === 'boolean') state.speaksRtl = line.speaksRtl;
    if (!state.asksPdf || state.speaksRtl !== true) return '';
    return giveBrief(state, facts);
}

/** Files a step wrote, read at most this much each (the file as it now is). */
const WRITTEN_BYTES = 1048576;

/**
 * After a step's file_write/file_edit: the brief, when a written file (as it now is)
 * holds a PDF mechanism and the app is right-to-left, once per run.
 */
export async function pdfBriefAfterWrite(state: PdfBriefState, facts: RunFacts, written: string[]): Promise<string> {
    if (state.given || facts.change?.repository || !written.length || !appKitSource()) return '';
    const root = path.resolve(facts.projectDir);
    const files: Array<{ rel: string; abs: string }> = [];
    for (const raw of [...new Set(written)].slice(0, 8)) {
        const abs = path.resolve(root, String(raw || ''));
        if (!isWithinRoot(abs, root)) continue;
        const rel = path.relative(root, abs).split(path.sep).join('/');
        try {
            const st = await fs.promises.stat(abs);
            if (!st.isFile() || st.size > WRITTEN_BYTES) continue;
            if (writeTrigger(await fs.promises.readFile(abs, 'utf8'), rel)) files.push({ rel, abs });
        } catch { /* gone */ }
    }
    if (!files.length) return '';
    const items: ScanItem[] = files.map(f => ({ kind: 'file' as const, path: f.abs, rel: f.rel }));
    const askRequest = typeof state.speaksRtl !== 'boolean';
    if (askRequest) items.push({ kind: 'request', text: facts.request, language: facts.language });
    const lines = await scanText(items, { deadlineAt: Date.now() + 20_000, signal: facts.signal, cancelled: facts.cancelled });
    if (askRequest) {
        const r = lines[lines.length - 1];
        if (typeof r?.speaksRtl === 'boolean') state.speaksRtl = r.speaksRtl;
        if (typeof r?.asksPdf === 'boolean') state.asksPdf = r.asksPdf;
    }
    const fileLines = lines.slice(0, files.length);
    if (!fileLines.some(l => (l.mechanisms || []).length)) return '';
    if (state.speaksRtl !== true && !fileLines.some(l => l.rtl === true)) return '';
    return giveBrief(state, facts);
}
