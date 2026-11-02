/**
 * The agent narrating its own work, in its own words.
 *
 * What Joe had was `broadcastThinkingDetail('🚀 Running: ' + node.task)` — a
 * string written months ago, fired from a fixed line of code, displayed to the
 * user under the heading "التفكير العصبي". It is an honest progress log and a
 * dishonest label: nothing is thinking. A pre-written sentence presented as the
 * agent's reasoning is a simulated tool wearing a real one's name, which is the
 * one thing this system is not allowed to contain.
 *
 * So the narration is generated. Between two steps the model is shown what just
 * finished — including whether it actually worked — and what is about to start,
 * and asked for one sentence about it. That sentence can only exist because the
 * previous step produced the result it did, which is what makes it narration
 * rather than decoration.
 *
 * THE RULES THIS MODULE KEEPS
 *
 *   1. If the model does not answer, or answers badly, NOTHING is shown. There
 *      is no fallback sentence. Silence is honest; a canned line under a
 *      "thinking" heading is exactly the fake this replaces.
 *   2. It never blocks the work. The call is time-boxed and its failure is not
 *      the step's failure.
 *   3. It never claims an outcome. The model is told the real result and told
 *      not to editorialise about success it cannot see.
 */

import { isProviderFailure } from '../llm/intelligent-router';

export interface NarrationContext {
    /** What the user asked for, verbatim. */
    goal: string;
    /** The step that just finished, if any. */
    done?: { task: string; ok: boolean; summary?: string };
    /** The step about to start. */
    next: { task: string; tool?: string };
    /** Position in the plan, so the model knows whether it is opening or closing. */
    index: number;
    total: number;
    isArabic: boolean;
}

/**
 * The instruction. Deliberately narrow: one sentence, no preamble, no markdown,
 * no promises about a result that has not happened yet.
 */
export function narrationPrompt(c: NarrationContext): string {
    const lang = c.isArabic
        ? 'Write in ARABIC, in the first person singular, as an engineer talking to a colleague.'
        : 'Write in ENGLISH, in the first person singular, as an engineer talking to a colleague.';
    return `You are the engineer doing this work, saying one line about what you are doing next.

THE REQUEST: ${c.goal}
${c.done ? `WHAT YOU JUST FINISHED: ${c.done.task}
HOW IT WENT: ${c.done.ok ? 'it worked' : 'it FAILED'}${c.done.summary ? ` — ${c.done.summary.slice(0, 300)}` : ''}` : 'This is the first step.'}
WHAT YOU ARE ABOUT TO DO: ${c.next.task}${c.next.tool ? ` (using ${c.next.tool})` : ''}
STEP ${c.index} OF ${c.total}.

Reply with ONE sentence, 4 to 20 words. ${lang}

RULES — breaking any of them makes the line useless:
- Say what you are doing and WHY it follows from what just happened. If the last
  step failed, say what you are doing about that.
- Never claim a result you do not have yet. You have not done the next step.
- No markdown, no bullet, no quotes, no code, no emoji, no "Step 3:" prefix.
- Do not repeat the request back. Do not explain what a tool is.
- One sentence. Nothing before it, nothing after it.`;
}

/** Reasons a reply is not usable as narration. */
export type NarrationReject =
    | 'empty' | 'provider_failure' | 'too_long' | 'too_short'
    | 'markup' | 'echoed_the_request' | 'wrong_language' | 'multi_sentence';

const ARABIC = /[ؠ-ٟٮ-ۓۺ-ۿ]/;

/**
 * Clean and JUDGE a reply. Returns '' with a reason whenever the line would be
 * worse than showing nothing — which is the default, not the exception.
 */
export function extractNarration(
    raw: unknown,
    c: Pick<NarrationContext, 'goal' | 'isArabic'>,
): { text: string; reject?: NarrationReject } {
    if (isProviderFailure(raw)) return { text: '', reject: 'provider_failure' };

    let s = String(raw ?? '').trim();
    // A model that wrapped its sentence in a fence or quotes still meant the
    // sentence; strip the wrapper rather than throwing the line away.
    s = s.replace(/^```[a-z]*\s*|\s*```$/gi, '').trim();
    s = s.replace(/^["'«“]+|["'»”]+$/g, '').trim();
    // "Step 3: …" / "الخطوة ٣: …" — a prefix the prompt forbids and models add.
    s = s.replace(/^\s*(step|الخطوة)\s*[\d٠-٩]+\s*[:—-]\s*/i, '').trim();
    // A stray leading bullet or emoji.
    // The variation selector (U+FE0F) and the ZWJ are separate code points; a
    // class that strips only the base character leaves them behind and the line
    // starts with an invisible stray.
    s = s.replace(/^[-*•]\s+/, '')
        .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]+\s*/u, '')
        .trim();

    if (!s) return { text: '', reject: 'empty' };
    if (/[<>{}]|\]\(|^#{1,6}\s/.test(s)) return { text: '', reject: 'markup' };
    if (s.length > 220) return { text: '', reject: 'too_long' };
    if (s.length < 8) return { text: '', reject: 'too_short' };

    // Several sentences means it started explaining. Keep the first only if the
    // rest is short; otherwise it ignored the instruction and is not trusted.
    const sentences = s.split(/(?<=[.!؟?])\s+/).filter(Boolean);
    if (sentences.length > 2) return { text: '', reject: 'multi_sentence' };
    if (sentences.length === 2) s = sentences[0].trim();

    // It must be in the page's language, or it is noise to the reader.
    const hasArabic = ARABIC.test(s);
    if (c.isArabic !== hasArabic) return { text: '', reject: 'wrong_language' };

    // A line that is mostly the request handed back says nothing.
    const goal = c.goal.trim().slice(0, 60);
    if (goal.length > 20 && s.includes(goal)) return { text: '', reject: 'echoed_the_request' };

    return { text: s };
}

/**
 * Ask for one line about the step about to run.
 *
 * `call` is the model boundary, injected so this is testable without a network
 * and so the caller decides which model pays for it.
 *
 * Returns '' on ANY failure — no model, a timeout, a refusal, a bad line. The
 * caller shows nothing. That is the point: the alternative is a stand-in
 * sentence, which is the fake this module exists to remove.
 */
export async function narrate(
    c: NarrationContext,
    call: (prompt: string) => Promise<string>,
    opts: { timeoutMs?: number } = {},
): Promise<{ text: string; reject?: NarrationReject | 'timeout' | 'threw' }> {
    const timeoutMs = opts.timeoutMs ?? 6000;
    let timer: NodeJS.Timeout | undefined;
    try {
        const raw = await Promise.race([
            call(narrationPrompt(c)),
            new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('narration_timeout')), timeoutMs); }),
        ]);
        return extractNarration(raw, c);
    } catch (e: any) {
        return { text: '', reject: /timeout/.test(String(e?.message)) ? 'timeout' : 'threw' };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Is narration switched on?
 *
 * It costs one small completion per step. On a laptop with no GPU and a local
 * model that is real time the user waits, so it is a choice — but the default is
 * ON, because the alternative that was shipping was a fake.
 */
export function narrationEnabled(): boolean {
    // Both names are supported: JOE_NARRATION is the public switch, while
    // DISABLE_NARRATION is kept for local/offline runs and diagnostic scripts.
    // Treating the latter as data only made an operator believe narration was
    // disabled while every project_pipeline node still spent an LLM request.
    const disabled = String(process.env.DISABLE_NARRATION ?? '').trim().toLowerCase();
    const v = String(process.env.JOE_NARRATION ?? '').trim().toLowerCase();
    if (disabled === '1' || disabled === 'true' || disabled === 'on'
        || v === '0' || v === 'false' || v === 'off') return false;
    // Narration is a DECORATION: one friendly line above a step. When the
    // local brain is paused, that line would be bought from the metered
    // provider — spending the day's quota, and the user's seconds, on
    // something nobody asked for. The field log shows the cost plainly:
    // «[Narrator] no line for … (timeout)» three times in one answer.
    try {
        const { isLocalBrainOpen } = require('../llm/intelligent-router');
        if (typeof isLocalBrainOpen === 'function' && isLocalBrainOpen()) return false;
    } catch { /* router not loaded (unit tests) — narrate as before */ }
    return true;
}
