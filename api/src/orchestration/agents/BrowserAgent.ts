import { BaseAgent } from './BaseAgent';
import intelligentRouter from '../../core/llm/intelligent-router';
import { runReactBrowserTask, renderObservation, type Decider, type ReactAction } from '../../modules/browser/reactLoop';

/**
 * BrowserAgent — Autonomous Web Interaction Specialist.
 *
 * Runs a REAL closed observe→decide→act loop (see reactLoop.ts): it looks at the
 * live page, asks the model for the single next action based on what is actually
 * there, executes it, then looks again — repeating until the task is done or it
 * needs the user (2FA / CAPTCHA / a missing credential). This replaces the old
 * single-shot "plan the whole thing blind, then fire" behaviour.
 */
export class BrowserAgent extends BaseAgent {
    public readonly name = "Browser-Automation";
    public readonly type = "Browser";

    async execute(task: string, input: any, context: any): Promise<{ ok: boolean; output: any; error?: string }> {
        console.log(`[BrowserAgent] ReAct web task: "${task}"`);
        const sessionId = input?.sessionId || context?.sessionId || 'default-browser-session';
        const userId = String(context?.userId || input?.userId || '').trim();
        // On RESUME (after the user supplied credentials / a 2FA code) do NOT
        // re-navigate to the start URL — continue from the live page where the
        // agent paused. Otherwise start the task at a productive first page.
        const resume = Boolean(input?.resume);
        const startUrl = resume ? undefined : deriveStartUrl(task);

        try {
            const result = await runReactBrowserTask({
                sessionId,
                userId,
                task,
                startUrl,
                maxSteps: Number(process.env.BROWSER_AGENT_MAX_STEPS || 12),
                decide: makeLlmDecider(),
            });
            // A pause for the user (2FA / missing credential) is NOT a failure — the
            // node completed its attempt and is waiting for input. Report it as ok so
            // the orchestrator surfaces it (and the live panel prompts) instead of
            // trying to "recover" from a non-error.
            const pausedForUser = result.status === 'needs_user';
            return {
                ok: result.ok || pausedForUser,
                output: result,
                error: (result.ok || pausedForUser) ? undefined : result.summary,
            };
        } catch (error: any) {
            return { ok: false, output: null, error: `Browser execution failed: ${error?.message || error}` };
        }
    }

    public canHandle(task: string): number {
        const t = task.toLowerCase();
        if (t.includes('browser') || t.includes('web') || t.includes('click') || t.includes('navigate') || t.includes('متصفح')) return 0.9;
        if (t.includes('search') || t.includes('بحث') || t.includes('افتح') || t.includes('login') || t.includes('تسجيل')) return 0.7;
        return 0.1;
    }
}

/** The LLM "brain": turns the current observation into the next single action. */
export function makeLlmDecider(): Decider {
    return async ({ task, observation, history, stepBudgetLeft }) => {
        const hist = history.slice(-6)
            .map(s => `- ${JSON.stringify(s.action)} => ${s.ok ? 'ok' : 'FAILED:' + (s.note || '')}`)
            .join('\n') || '(none yet)';

        const system = `You are an autonomous web-browser agent controlling a REAL browser.
Goal: ${task}

Act ONE step at a time. Choose the single best next action based ONLY on what is
actually present on the page right now (the ELEMENTS list). Respond with ONLY a
JSON object — no prose. Allowed actions:
{"action":"goto","url":"https://..."}
{"action":"click","index":N}
{"action":"type","index":N,"text":"..."}
{"action":"select","index":N,"value":"..."}   // choose an option in a dropdown (value must match one of its [options: ...])
{"action":"key","key":"Enter"}
{"action":"scroll","direction":"down"}
{"action":"done","answer":"<short result for the user>"}
{"action":"ask_user","message":"<what you need: a 2FA code, a CAPTCHA, or credentials>"}

Rules:
- Enter a username/email with text "{{SECRET:JOE_LOGIN_EMAIL}}".
- Enter a password with text "{{SECRET:JOE_LOGIN_PASSWORD}}". NEVER write a real password literally.
- For a 2FA / OTP / verification-code field, type into it with text "{{SECRET:JOE_2FA_CODE}}" (the system will pause and ask the user for the code, then resume).
- If a CAPTCHA (image/puzzle) is reached, use ask_user (a text code cannot solve it).
- When the goal is clearly achieved, use done with a concise answer.
- Steps left: ${stepBudgetLeft}.`;

        const user = `Current page:\n${renderObservation(observation)}\n\nHistory of your actions:\n${hist}\n\nReturn ONLY the next action as JSON.`;

        const text = await intelligentRouter.routeToModel(
            [{ role: 'system', content: system }, { role: 'user', content: user }],
            { type: 'browser_task', complexity: 'medium', requiresTools: false, estimatedTokens: 800, language: 'en' } as any
        );
        return parseAction(text);
    };
}

/** Robustly extract a JSON action from a model response; fall back to ask_user. */
export function parseAction(text: string): ReactAction {
    try {
        const m = String(text || '').match(/\{[\s\S]*\}/);
        const obj = m ? JSON.parse(m[0]) : JSON.parse(String(text));
        if (obj && typeof obj.action === 'string') return obj as ReactAction;
    } catch { /* fall through */ }
    return { action: 'ask_user', message: 'تعذّر فهم الخطوة التالية من النموذج. أعد صياغة الطلب بتفاصيل أوضح.' };
}

/** Give the loop a productive first page: an explicit URL if present, otherwise a
 *  web search for the request. The loop then reacts to whatever actually loads. */
export function deriveStartUrl(task: string): string | undefined {
    const t = String(task || '');
    const url = t.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
    if (url) return url;
    const tl = t.toLowerCase();
    const q = (t.match(/(?:عن|about|for|ابحث(?:\s+عن)?|search)\s+(.+)/i)?.[1] || t).trim();
    if (tl.includes('yahoo') || tl.includes('ياهو')) return `https://search.yahoo.com/search?p=${encodeURIComponent(q)}`;
    if (tl.includes('wikipedia') || tl.includes('ويكيبيديا')) return `https://ar.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`;
    // Only auto-search when the task reads like a lookup; login/site tasks let the brain goto.
    if (/\b(search|find|بحث|ابحث)\b/i.test(t)) return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    return undefined;
}
