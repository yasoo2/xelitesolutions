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
 */

/** The admission code a value carries, or null when it is not a resource refusal. */
export function resourceRefusalCode(error: unknown): string | null {
    const code = (error as any)?.code;
    return typeof code === 'string' && /^RESOURCE_[A-Z_]+$/.test(code) ? code : null;
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
    const details = (error as any)?.details;
    const numbers = details && typeof details === 'object'
        ? Object.entries(details).filter(([, v]) => typeof v === 'number' || typeof v === 'string').map(([k, v]) => `${k}=${v}`)
        : [];
    return `${code}: ${sentence}${numbers.length ? ` (${numbers.join(', ')})` : ''}`;
}
