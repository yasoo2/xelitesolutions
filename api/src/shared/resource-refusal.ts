/**
 * A RESOURCE REFUSAL IS NOT A CRASH.
 *
 * Eval P001-landing-ar (run-1793050584667, 2026-10-27): ToolService admits a
 * heavy tool through RequestResourceManager.withHeavy, which refused
 * shell_execute with RESOURCE_LOW_MEMORY (available 1 023 799 296 bytes,
 * floor 1 073 741 824). The refusal reached ToolService's last catch, the
 * one meant for a tool that threw by mistake, and he read in the terminal
 * and in the phase receipt:
 *
 *     internal_exception: ResourceAdmissionError: RESOURCE_LOW_MEMORY
 *         at RequestResourceManager.admitMemory (…RequestResourceManager.ts:459:19)
 *         … nine more stack lines
 *
 * The tool never ran. Nothing inside it failed. Joe chose not to start it,
 * on purpose, with its own code and the numbers behind it. That is a
 * documented state, and it says so in the code, the numbers and his language.
 *
 * The sentences live here because two readers say them: ToolService (a tool
 * that was not admitted) and AgentLoopService.humanizeFailure (a run that was
 * not admitted). Kept separately, they would drift apart.
 *
 * ⛔ AND ONLY A REFUSAL IS A REFUSAL (review r21, 578e2dbe). The first version
 * took every RESOURCE_* code for one and told him «the step did not start»
 * for codes that mean the opposite: RESOURCE_CLEANUP_FAILED is thrown after
 * the work ran, RESOURCE_TIMEOUT when a local model call ran past its
 * deadline, and REENTRANT / SCOPE_* / HEAVY_LEASE_CLOSED / HEAVY_DEPTH_LIMIT /
 * INVALID_BUDGET are guards against a fault in Joe's own call order. Those
 * stay internal_exception, worded for what they are (describeResourceFault).
 */
import type { ResourceAdmissionCode } from '../core/resources/RequestResourceManager';

/**
 * The codes a guard throws BEFORE the step's work begins, because the machine
 * cannot take it now (RequestResourceManager admission, managed-ollama-chat's
 * context fit) or because he cancelled it. Typed against the manager's own
 * code list, so a renamed code fails the build instead of silently becoming
 * a fault.
 */
const ADMISSION_REFUSALS: ReadonlySet<ResourceAdmissionCode> = new Set<ResourceAdmissionCode>([
    'RESOURCE_LOW_MEMORY', 'RESOURCE_MEMORY_UNAVAILABLE',
    'RESOURCE_QUEUE_FULL', 'RESOURCE_QUEUE_TIMEOUT',
    'RESOURCE_CONTEXT_OVERFLOW', 'RESOURCE_CANCELLED',
]);

const codeOf = (error: unknown): string | null => {
    const code = (error as any)?.code;
    return typeof code === 'string' && /^RESOURCE_[A-Z_]+$/.test(code) ? code : null;
};

/** The admission code a value carries, or null when it is not a resource refusal. */
export function resourceRefusalCode(error: unknown): string | null {
    const code = codeOf(error);
    return code && ADMISSION_REFUSALS.has(code as ResourceAdmissionCode) ? code : null;
}

/** A RESOURCE_* code that is NOT an admission refusal (a fault, or work that ran), or null. */
export function resourceFaultCode(error: unknown): string | null {
    const code = codeOf(error);
    return code && !ADMISSION_REFUSALS.has(code as ResourceAdmissionCode) ? code : null;
}

/** His sentence for a refusal code found in the text, or null when the text names none. */
export function resourceRefusalSentence(text: string, isAr: boolean): string | null {
    const t = String(text || '');
    if (/RESOURCE_(?:LOW_MEMORY|MEMORY_UNAVAILABLE)/.test(t)) return isAr
        ? 'تعذّر بدء الخطوة الثقيلة لأن الذاكرة المتاحة لا تكفي أو تعذّر قياسها. لم أوقف أي برنامج آخر.'
        : 'The heavy step could not start because available memory is insufficient or could not be measured. No other application was stopped.';
    if (/RESOURCE_CONTEXT_OVERFLOW|OLLAMA_OUTPUT_INPUT|LOCAL_COMPLETION_LIMIT/.test(t)) return isAr
        ? 'لم يكتمل الطلب ضمن السياق والذاكرة المتاحين. لم أقصّ الطلب أو أغيّر النموذج؛ يلزم تقسيم العمل إلى خطوات أصغر.'
        : 'The request did not complete within the available context and memory. The request was not truncated and the model was not changed; the work needs smaller steps.';
    if (/RESOURCE_QUEUE_(?:FULL|TIMEOUT)/.test(t)) return isAr
        ? 'تعذّر بدء الخطوة ضمن طابور الموارد المحدود. توقفت هذه المحاولة دون تشغيل عمل ثقيل إضافي.'
        : 'The step could not start within the bounded resource queue. This attempt stopped without launching additional heavy work.';
    if (/RESOURCE_CANCELLED|OLLAMA_ABORTED/.test(t)) return isAr
        ? 'أوقفتُ الطلب بناءً على الإلغاء؛ تُحرَّر حجوزاته عند توقف العمل التابع له فعليًا.'
        : 'The request was cancelled; its reservations are released as its owned work settles.';
    return null;
}

/**
 * «RESOURCE_LOW_MEMORY: <his sentence> (availableBytes=…, minFreeBytes=…)».
 * The code leads so every machine reader still finds it; the numbers stay
 * because a refusal that hides them cannot be checked. No stack: the stack
 * of a deliberate refusal points at the guard, not at a fault.
 */
export function describeResourceRefusal(error: unknown, isAr: boolean): string | null {
    const code = resourceRefusalCode(error);
    if (!code) return null;
    const sentence = resourceRefusalSentence(code, isAr)
        || (isAr ? 'لم تبدأ الخطوة: رفضها حارس الموارد.' : 'The step did not start: the resource guard refused it.');
    return `${code}: ${sentence}${numbersOf(error)}`;
}

function numbersOf(error: unknown): string {
    const details = (error as any)?.details;
    const numbers = details && typeof details === 'object'
        ? Object.entries(details).filter(([, v]) => typeof v === 'number' || typeof v === 'string').map(([k, v]) => `${k}=${v}`)
        : [];
    return numbers.length ? ` (${numbers.join(', ')})` : '';
}

/**
 * «RESOURCE_CLEANUP_FAILED: <what really happened> (count=1)» for a RESOURCE_*
 * code that is not a refusal, or null. The caller keeps it internal_exception:
 * none of these says the step did not start, because for none of them is
 * that known to be true.
 */
export function describeResourceFault(error: unknown, isAr: boolean): string | null {
    const code = resourceFaultCode(error);
    if (!code) return null;
    let sentence: string;
    if (code === 'RESOURCE_CLEANUP_FAILED') sentence = isAr
        ? 'نُفّذت الخطوة، لكن تحرير ما حجزته من موارد فشل بعد انتهائها.'
        : 'The step ran, but releasing what it held failed after it finished.';
    else if (code === 'RESOURCE_TIMEOUT') sentence = isAr
        ? 'تجاوز استدعاء النموذج المحلي مهلته (ويشمل ذلك انتظاره في الطابور) فأُوقف؛ لم يُرفض لنقصٍ في الموارد، وقد يكون جزءٌ من العمل قد نُفّذ.'
        : 'The local model call ran past its deadline (queue wait included) and was stopped; it was not refused for lack of resources, and part of the work may have run.';
    else sentence = isAr
        ? 'فشل فحصٌ داخليّ في حارس الموارد — عطلٌ في ترتيب استدعاءات جو نفسه، لا نقصٌ في الذاكرة أو الطابور.'
        : 'An internal resource-guard check failed — a fault in the order of Joe\'s own calls, not a shortage of memory or queue room.';
    return `${code}: ${sentence}${numbersOf(error)}`;
}
