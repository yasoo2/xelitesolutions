/**
 * A TOOL THAT APOLOGISES DID NOT SUCCEED.
 *
 * Measured with every model provider unreachable:
 *
 *   central_answer     ok=true   output: «⚠️ تعذّر الوصول إلى محرّك الذكاء …»
 *   browser_summarize  ok=true   output: «📄 ملخّص الصفحة: ⚠️ تعذّر الوصول …»
 *   browser_translate  ok=true   output: «🌐 Page translation → English: ⚠️ …»
 *
 * `ok: true` is not a formality. It decides three things at once:
 *
 *   - the orchestrator marks the step COMPLETED, so nothing is retried and the
 *     run ends claiming success;
 *   - the answer composer reads that text as THE ANSWER;
 *   - and a dependent step consuming {{FROM:…}} receives the apology AS ITS
 *     DATA — «افحص ثم اكتب تقريراً بالنتيجة» writes «تعذّر الوصول إلى محرّك
 *     الذكاء» into the report, in the place where the findings belong.
 *
 * So the question is asked once, centrally, of every tool result: did anything
 * actually get produced? A tool that DID make something real — a page, a file,
 * a screenshot, rows — keeps its success even if its prose mentions a degraded
 * model, because the artifact is the deliverable. A tool whose entire output is
 * the apology is a failure, and is reported as one.
 */
import { PROVIDER_FAILURE_PREFIX } from '../../core/llm/intelligent-router';

/** Fields that mean the tool really produced something. */
const ARTIFACT_KEYS = [
    // NOT bare `url`: a summariser echoes back the page it VISITED, which is its
    // input, not its output. Every tool that really builds something returns a
    // previewUrl or a path beside it.
    // NOR `screenshot`: the smart browser tools photograph the page as a side
    // effect of visiting it. A summary that came back as an apology did not
    // succeed because a picture was taken along the way.
    'previewUrl', 'path', 'file', 'files', 'filename', 'html',
    'rows', 'items', 'products', 'pdf', 'artifact', 'artifacts', 'dir', 'repo', 'deployed',
];

const textOf = (output: any): string => {
    if (output == null) return '';
    if (typeof output === 'string') return output;
    if (typeof output !== 'object') return String(output);
    return ['answer', 'text', 'summary', 'message', 'content', 'result']
        .map(k => (typeof (output as any)[k] === 'string' ? (output as any)[k] : ''))
        .filter(Boolean).join('\n');
};

/**
 * True when the tool's whole answer is the router's «no provider» notice and it
 * has nothing else to show for the work.
 */
export function isApologyOnly(output: any): boolean {
    const text = textOf(output);
    if (!text || !text.includes(PROVIDER_FAILURE_PREFIX)) return false;
    if (output && typeof output === 'object') {
        for (const k of ARTIFACT_KEYS) {
            const v = (output as any)[k];
            if (v === undefined || v === null || v === false) continue;
            if (typeof v === 'string' && !v.trim()) continue;
            if (Array.isArray(v) && !v.length) continue;
            return false;   // something real came out of it
        }
    }
    return true;
}

/** The apology text itself, for the honest error that replaces the false success. */
export function apologyText(output: any): string {
    const text = textOf(output).trim();
    const at = text.indexOf(PROVIDER_FAILURE_PREFIX);
    return (at >= 0 ? text.slice(at) : text).slice(0, 600);
}
