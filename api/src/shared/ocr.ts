/**
 * OCR — the EXACT words inside the picture, read locally.
 *
 * moondream gives Joe scene understanding («شاشة إعدادات بواجهة عربية»)
 * but a 1.8B model cannot READ Arabic screenshot text — field-measured:
 * the user's settings screenshot came back as a vague paragraph with not
 * one literal string from the screen. Tesseract (WASM, fully local, no
 * key, no quota) reads the text verbatim — Arabic and English together —
 * and the vision pass merges both: moondream says what the image IS,
 * tesseract says what it SAYS. This is the layer PRD-from-screenshot
 * analysis stands on.
 *
 * Everything is best-effort and bounded: a worker is created once and
 * reused; traineddata is cached on disk after the first download; any
 * failure returns '' — a run never dies for a picture.
 */
import path from 'path';
import fs from 'fs';

/** OCR is skipped above this size — a 40MB photo is not a screenshot. */
export const OCR_MAX_IMAGE_BYTES = 12_000_000;
/** Hard ceiling per recognition — a stuck WASM pass must not stall a run. */
const OCR_TIMEOUT_MS = 90_000;
/** The block carries at most this much verbatim text per image. */
export const OCR_TEXT_CAP = 6_000;

let workerPromise: Promise<any> | null = null;
let ocrDisabledReason = '';

function cacheDir(): string {
    const dir = String(process.env.JOE_OCR_CACHE || '').trim()
        || path.join(process.cwd(), 'data', 'ocr-cache');
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* best-effort */ }
    return dir;
}

/**
 * OFFLINE BY CONSTRUCTION. The language data ships as npm packages
 * (@tesseract.js-data/ara, /eng) installed with Joe itself — copied once
 * into the local lang dir so tesseract NEVER downloads at runtime. The
 * first draft fetched from a CDN on first use; on a machine that blocks
 * the CDN the download failed INSIDE the worker thread and crashed the
 * whole process (measured live). No runtime network, no crash surface.
 */
function ensureLocalLangs(dir: string, langs: string[]): boolean {
    let all = true;
    for (const lang of langs) {
        const target = path.join(dir, `${lang}.traineddata.gz`);
        if (fs.existsSync(target)) continue;
        try {
            const pkgDir = path.dirname(require.resolve(`@tesseract.js-data/${lang}/package.json`));
            const src = path.join(pkgDir, '4.0.0_best_int', `${lang}.traineddata.gz`);
            if (fs.existsSync(src)) fs.copyFileSync(src, target);
            else all = false;
        } catch { all = false; }
    }
    return all;
}

/** Lazily create the shared worker (ara+eng unless overridden). */
async function getWorker(): Promise<any | null> {
    if (String(process.env.JOE_OCR || '1') === '0') return null;
    if (ocrDisabledReason) return null;
    if (!workerPromise) {
        workerPromise = (async () => {
            const langs = String(process.env.JOE_OCR_LANGS || 'ara+eng').trim();
            const dir = cacheDir();
            const offline = ensureLocalLangs(dir, langs.split('+').map(s => s.trim()).filter(Boolean));
            if (!offline) console.warn('[OCR] some language packs missing locally — tesseract may try its default source.');
            const { createWorker } = require('tesseract.js');
            const worker = await createWorker(langs, 1, {
                langPath: String(process.env.JOE_OCR_LANGPATH || '').trim() || dir,
                cachePath: dir,
                gzip: true,
                // Quiet by default; the recognize call logs its own summary.
                logger: () => { /* silent */ },
                // Worker-thread errors must NEVER take the process down — a
                // failed language load surfaces here instead of crashing Joe.
                errorHandler: (e: any) => {
                    ocrDisabledReason = String(e?.message || e);
                    console.warn(`[OCR] worker error (${ocrDisabledReason.slice(0, 120)}) — continuing without verbatim text.`);
                },
            });
            // FULL-PAGE segmentation. tesseract.js defaults to SINGLE_BLOCK
            // (PSM 6), which read the headings of a real screenshot but
            // silently dropped a bordered button's label — measured live.
            // AUTO (PSM 3) read all of them at the same 92% confidence.
            await worker.setParameters({ tessedit_pageseg_mode: '3' });
            console.info(`[OCR] 📖 local reader ready (${langs}) — screenshot text is read verbatim, fully offline.`);
            return worker;
        })().catch((e: any) => {
            // One honest line, then OCR stays off for the process — the vision
            // description still flows; only the verbatim layer is missing.
            ocrDisabledReason = String(e?.message || e);
            console.warn(`[OCR] unavailable (${ocrDisabledReason.slice(0, 120)}) — descriptions continue without verbatim text.`);
            workerPromise = null;
            return null;
        });
    }
    return workerPromise;
}

/** Collapse OCR noise: long runs of blank lines / trailing spaces. */
function tidy(text: string): string {
    return String(text || '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Read the text inside an image file. Returns '' when there is none worth
 * carrying (or OCR is unavailable) — callers can trust the emptiness.
 */
export async function extractImageText(filePath: string): Promise<string> {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > OCR_MAX_IMAGE_BYTES) return '';
        const worker = await getWorker();
        if (!worker) return '';
        const timeout = new Promise<null>(r => { const t = setTimeout(() => r(null), OCR_TIMEOUT_MS); (t as any).unref?.(); });
        const result: any = await Promise.race([worker.recognize(filePath), timeout]);
        if (!result) { console.warn('[OCR] recognition timed out — continuing without verbatim text.'); return ''; }
        const text = tidy(String(result?.data?.text || ''));
        // A couple of stray characters is noise, not reading.
        if (text.replace(/\s/g, '').length < 6) return '';
        const capped = text.length > OCR_TEXT_CAP ? `${text.slice(0, OCR_TEXT_CAP)}\n…[truncated]` : text;
        console.info(`[OCR] read ${text.length} chars from ${path.basename(filePath)} (confidence ${Math.round(result?.data?.confidence || 0)}%)`);
        return capped;
    } catch (e: any) {
        console.warn(`[OCR] failed on ${path.basename(String(filePath))}: ${String(e?.message || e).slice(0, 120)}`);
        return '';
    }
}

/**
 * CLOSE THE READER.
 *
 * `getWorker()` creates one tesseract worker for the whole process and nothing
 * ever closed it. In a long-lived server that is correct — the reader is meant
 * to be shared and reused. In a test run it is a worker THREAD that outlives
 * the last assertion, so Jest reports «a worker process has failed to exit
 * gracefully» and force-exits, which hides real leaks behind a known one.
 *
 * This is the missing half of the lifecycle: it terminates the worker if one
 * was ever built, and resets the lazy promise so a later call can build
 * another. Safe to call when no worker exists, and safe to call twice.
 */
export async function shutdownOcr(): Promise<void> {
    const p = workerPromise;
    workerPromise = null;
    if (!p) return;
    try {
        const w = await p;
        if (w && typeof w.terminate === 'function') await w.terminate();
    } catch { /* a reader that never opened needs no closing */ }
}
