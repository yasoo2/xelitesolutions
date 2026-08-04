/**
 * AN ANSWER MUST BE ABOUT SOMETHING.
 *
 * From a real session: the user asked Joe to search Google for «دوله فلسطين»,
 * and the browser agent declared the task finished with
 *
 *   «حسناً، عنوان IP: 2a00:1d34:7472:3300:… الوقت: 2026-08-04T15:38:54Z»
 *
 * That sentence has nothing to do with the question, nothing to do with the page
 * the agent was standing on, and the run reported SUCCESS. The loop already
 * collects the evidence it needed to catch this — the final url, title and text
 * snippet — and then never looked at it.
 *
 * So an answer is checked against the only two things that could ground it: the
 * task the user gave, and the page the agent ended on. Not «is it true» — that
 * is not decidable here — but «is it ABOUT this at all». An answer that shares
 * not one content word with either is not an answer; it is a sentence that
 * arrived from somewhere else, and saying so is better than passing it on.
 *
 * Deliberately narrow, because a false alarm here would reject good work:
 *   - short confirmations («تم», «نعم، سجّلت الدخول») are never judged;
 *   - one shared word is enough to pass;
 *   - and the check only ever DOWNGRADES a claimed success to an honest report
 *     of where the agent got to. It never invents an answer of its own.
 */

/** Arabic normalisation: strip diacritics and unify the letters that vary. */
function norm(s: string): string {
    return String(s || '')
        .replace(/[ً-ْٰـ]/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .toLowerCase();
}

/** Words that carry no subject matter and so cannot ground anything. */
const STOP = new Set([
    'حسنا', 'حسناً', 'نعم', 'لا', 'تم', 'الان', 'الآن', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي',
    'على', 'في', 'من', 'عن', 'الى', 'مع', 'قد', 'ثم', 'كان', 'هو', 'هي', 'ما', 'هل',
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'here', 'there', 'ok', 'okay', 'done', 'yes', 'no',
]);

/** Content words — what a sentence is actually about. */
export function contentWords(text: string): string[] {
    return norm(text)
        .split(/[^\p{L}\p{N}]+/u)
        .filter(w => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/** A machine fact with no subject: an IP address, a bare timestamp, a hash. */
const MACHINE_NOISE = /^(?:[0-9a-f]{2,4}:){2,}[0-9a-f]{0,4}$|^\d{4}-\d{2}-\d{2}t[\d:.]+z?$|^[0-9a-f]{16,}$/i;

export interface GroundingVerdict { grounded: boolean; shared: string[]; reason?: string }

/**
 * Is this answer about the task, or about the page it was taken from?
 * `evidence` is whatever the loop saw last: the url, the title, a text snippet.
 */
export function judgeAnswer(answer: string, task: string, evidence?: { url?: string; title?: string; snippet?: string }): GroundingVerdict {
    const a = String(answer || '').trim();
    // Too short to be a claim about anything — a confirmation, not a report.
    if (a.length < 20) return { grounded: true, shared: [], reason: 'short_confirmation' };

    const answerWords = contentWords(a).filter(w => !MACHINE_NOISE.test(w));
    if (!answerWords.length) {
        return { grounded: false, shared: [], reason: 'no_subject_matter' };
    }

    const haystack = new Set(contentWords(
        `${task || ''} ${evidence?.title || ''} ${evidence?.snippet || ''} ${decodeURIComponent(String(evidence?.url || ''))}`,
    ));
    const shared = answerWords.filter(w => haystack.has(w));
    if (shared.length) return { grounded: true, shared };
    return { grounded: false, shared: [], reason: 'unrelated_to_task_and_page' };
}

/** What Joe says instead of passing on a sentence that came from nowhere. */
export function ungroundedMessage(task: string, evidence?: { url?: string; title?: string }): string {
    const where = evidence?.url ? `\nآخر صفحة وصلتُ إليها: ${evidence.url}${evidence.title ? ` — «${evidence.title}»` : ''}` : '';
    return `⚠️ لم أستخرج إجابة تخصّ طلبك من الصفحة.${where}\n`
        + `الجواب الذي كوّنه المتصفّح لم يكن عن «${String(task || '').slice(0, 80)}» فأسقطتُه بدل أن أنقله إليك. `
        + `أعد المحاولة، أو حدّد لي الموقع الذي تريد أن أقرأ منه.`;
}
