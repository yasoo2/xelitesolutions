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

type OcrState = {
    workerPromise: Promise<any> | null;
    disabledReason: string;
};

// A test may call jest.resetModules(), which otherwise creates a second module
// scope and leaves its Tesseract worker beyond the original teardown's reach.
// Keep this resource state process-wide so all imports share one worker and one
// shutdown path, as the production process does.
const OCR_STATE_KEY = '__joeOcrSharedState' as const;
const globalOcr = globalThis as typeof globalThis & { __joeOcrSharedState?: OcrState };
const ocrState = globalOcr[OCR_STATE_KEY] ||= { workerPromise: null, disabledReason: '' };

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
    if (ocrState.disabledReason) return null;
    if (!ocrState.workerPromise) {
        ocrState.workerPromise = (async () => {
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
                    ocrState.disabledReason = String(e?.message || e);
                    console.warn(`[OCR] worker error (${ocrState.disabledReason.slice(0, 120)}) — continuing without verbatim text.`);
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
            ocrState.disabledReason = String(e?.message || e);
            console.warn(`[OCR] unavailable (${ocrState.disabledReason.slice(0, 120)}) — descriptions continue without verbatim text.`);
            ocrState.workerPromise = null;
            return null;
        });
    }
    return ocrState.workerPromise;
}

/**
 * Release the shared Tesseract worker on a controlled shutdown.
 *
 * Tesseract runs in a Node worker thread; leaving it alive keeps the process
 * alive even after every request has completed. The server normally owns the
 * process lifetime, while tests and controlled shutdowns must terminate it
 * explicitly. The function is idempotent so concurrent teardown paths are safe.
 */
export async function shutdownOcr(): Promise<void> {
    const pending = ocrState.workerPromise;
    ocrState.workerPromise = null;
    if (!pending) return;
    try {
        const worker = await pending;
        await worker?.terminate?.();
    } catch {
        // OCR is best-effort. A failed worker must never block shutdown.
    }
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

