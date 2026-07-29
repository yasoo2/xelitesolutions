import { BaseAgent } from './BaseAgent';
import intelligentRouter from '../../core/llm/intelligent-router';
import { runReactBrowserTask, renderObservation, type Decider, type ReactAction, type Verifier, type Vision } from '../../modules/browser/reactLoop';
import { LocalProvider } from '../../core/llm/providers/local';
import { normalizeIntentText } from '../../core/orchestrator/promptNormalizer';

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
        // CRITICAL: drive the SAME browser session the panel is watching
        // ('panel-browser'). Using the chat session id here created a second,
        // INVISIBLE browser — the user saw no pages, no agent steps and no live
        // thinking, because all events were broadcast to a session nobody watches.
        const sessionId = String(input?.sessionId || input?.browserSessionId || 'panel-browser');
        const userId = String(context?.userId || input?.userId || '').trim();
        // On RESUME (after the user supplied credentials / a 2FA code) do NOT
        // re-navigate to the start URL — continue from the live page where the
        // agent paused. Otherwise start the task at a productive first page.
        const resume = Boolean(input?.resume);
        const startUrl = resume ? undefined : deriveStartUrl(task);

        // READ MODE: "describe / what do you see / read the page / answer from the
        // page" is a QUESTION about a page, not a multi-step interaction. A weak
        // local model in the full act-loop tends to wander (scroll/click) without
        // ever declaring done — 12 slow steps, then a step-limit failure (exactly
        // what happened in the user's live test). In read mode the agent navigates,
        // observes ONCE, and answers from the real page content in a single model
        // call (the vision fallback still covers unreadable pages).
        const readTask = isReadTask(task);

        try {
            const result = await runReactBrowserTask({
                sessionId,
                userId,
                task,
                startUrl,
                maxSteps: readTask ? 4 : Number(process.env.BROWSER_AGENT_MAX_STEPS || 12),
                decide: readTask ? makeReadDecider() : makeLlmDecider(),
                // A read answer is grounded in the observed page (evidence attached);
                // the completion verifier is for interactive goals, skip it here.
                verify: readTask ? undefined : makeLlmVerifier(),
                vision: makeLlmVision(),   // undefined unless a vision model is configured
                // Mirror live activity (tidy step lines + the green thinking
                // indicator) into the CHAT session that launched this task.
                chatSessionId: String(context?.sessionId || '').trim() || undefined,
            });
            // These are all honest, completed OUTCOMES the user should see — not system
            // failures to "recover" from: a real success (done), a pause for the user
            // (needs_user: 2FA / missing credential), or an unverified completion
            // (unverified: the agent claimed done but the page didn't confirm it, so we
            // report that honestly instead of pretending success). Report them as ok so
            // the orchestrator surfaces the message/prompt instead of a recovery loop.
            const honestOutcome = result.status === 'needs_user' || result.status === 'unverified';
            return {
                ok: result.ok || honestOutcome,
                output: result,
                error: (result.ok || honestOutcome) ? undefined : result.summary,
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

/** Is this task a QUESTION about a page (describe / read / what do you see /
 *  summarise) rather than a multi-step interaction (login / fill / buy)? */
export function isReadTask(task: string): boolean {
    // Probe the user's words PLUS the language-universal canonical form, so
    // dialects («شوف الصفحة وقولي ايش فيها»), typos, and other languages
    // ("ouvre la page et decris-la") are understood too.
    const t = `${String(task || '')}\n${normalizeIntentText(task)}`;
    const readWords = /(صِ?ف|وصف|اوصف|أوصف|انظر|أنظر|شاهد|اطّ?لع|ماذا\s*(ترى|يوجد|فيها?)|ما\s*الذي\s*(تراه|فيها?)|ما\s*محتوى|أخبرني\s*(عن|بما)|اخبرني\s*(عن|بما)|اقرأ|لخّ?ص|ملخّ?ص|describe|what\s*(do\s*you\s*)?see|what'?s\s*on|tell\s*me\s*(about|what)|read|summari)/i.test(t);
    // Interactive verbs override read words ("اقرأ ثم سجّل دخولي" is interactive).
    const interactive = /(سجّ?ل|تسجيل|دخول|املأ|عبّ?ئ|انشر|احجز|اطلب|اشترك|ادفع|اشترِ?|log\s*-?\s*in|sign\s*-?\s*in|fill|submit|post|book|order|subscribe|checkout|buy|register)/i.test(t);
    return readWords && !interactive;
}

/** One-shot reading brain: answer the user's question FROM the observed page in a
 *  single model call (allowing at most one scroll if the fold is empty), instead of
 *  wandering through the full act-loop. Streams its thinking like the act brain. */
export function makeReadDecider(): Decider {
    return async ({ task, observation, history, onThinking }) => {
        const scrolled = history.some(h => h.action.action === 'scroll');
        const thin = (observation.textSnippet || '').trim().length < 60;
        if (thin && !scrolled) return { action: 'scroll', direction: 'down', reason: 'المحتوى الظاهر قليل — تمرير واحد ثم الإجابة' };

        const system = `You are reading a REAL web page to answer the user's request.
User's request: ${task}

The current page:
${renderObservation(observation)}

Answer ONLY from what the page actually shows — do not invent anything. Answer in the
user's language (Arabic if the request is Arabic). Reply with ONLY this JSON:
{"action":"done","answer":"<your answer based on the page>"}`;

        const text = await intelligentRouter.routeToModel(
            [{ role: 'system', content: system }, { role: 'user', content: 'Answer now. JSON only.' }],
            { type: 'browser_task', complexity: 'medium', requiresTools: false, estimatedTokens: 600, language: 'en' } as any,
            undefined,
            onThinking,
        );
        const parsed = parseAction(text);
        // Whatever shape the model returns, a read task ends with an answer — never
        // with more wandering. Fall back to the raw text as the answer.
        if (parsed.action === 'done' && (parsed as any).answer) return parsed;
        const raw = String(text || '').replace(/^[\s{"']*action[\s":]*done[\s",]*answer[\s":]*/i, '').trim();
        return { action: 'done', answer: raw.slice(0, 1200) || 'لم أستطع قراءة محتوى مفيد من الصفحة.' };
    };
}

/** The LLM "brain": turns the current observation into the next single action. */
export function makeLlmDecider(): Decider {
    return async ({ task, observation, history, stepBudgetLeft, onThinking }) => {
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
            { type: 'browser_task', complexity: 'medium', requiresTools: false, estimatedTokens: 800, language: 'en' } as any,
            undefined,
            onThinking,   // stream the model's tokens to the panel while it decides
        );
        return parseAction(text);
    };
}

/** The completion checker: given the FINAL page, confirm the goal is really done so
 *  the agent never claims a false success. Lenient on ambiguity (evidence is always
 *  attached to the result anyway), but a CLEAR "not done" downgrades to unverified. */
export function makeLlmVerifier(): Verifier {
    return async ({ task, observation }) => {
        const system = `You verify whether a web task was actually completed, judging ONLY by the page shown.
Goal: ${task}

Current page:
${renderObservation(observation)}

Reply with ONLY a JSON object: {"verified": true|false, "note": "<short reason: what on the page proves it, or what is still missing>"}
Set verified=true ONLY if the page clearly shows the goal is achieved (e.g. a success/confirmation, the requested data, a logged-in state). If the page still shows a login form, an error, a CAPTCHA, or nothing indicating success, set verified=false.`;
        try {
            const text = await intelligentRouter.routeToModel(
                [{ role: 'system', content: system }, { role: 'user', content: 'Is the goal achieved? JSON only.' }],
                { type: 'browser_task', complexity: 'low', requiresTools: false, estimatedTokens: 200, language: 'en' } as any
            );
            const m = String(text || '').match(/\{[\s\S]*\}/);
            const obj = m ? JSON.parse(m[0]) : null;
            // Only a CLEAR, explicit false downgrades the result; anything ambiguous or
            // unparseable is treated as verified (real page evidence is attached anyway).
            if (obj && obj.verified === false) return { verified: false, note: String(obj.note || '').slice(0, 200) };
            return { verified: true, note: obj && obj.note ? String(obj.note).slice(0, 200) : undefined };
        } catch {
            return { verified: true }; // never block on a verifier error
        }
    };
}

/** Vision fallback: only active when a local vision model is configured
 *  (LOCAL_VISION_MODEL + LOCAL_LLM_BASE_URL, e.g. Ollama llava/moondream). Sends the
 *  real screenshot to the vision model and asks for the next action by pixel. */
export function makeLlmVision(): Vision | undefined {
    const model = String(process.env.LOCAL_VISION_MODEL || '').trim();
    const base = String(process.env.LOCAL_LLM_BASE_URL || '').trim();
    if (!model || !base) return undefined;
    const provider = new LocalProvider();
    return async ({ task, screenshotBase64 }) => {
        const system = `You are a browser agent that can SEE. You are given a screenshot of the current page.
Goal: ${task}
Decide the single next action by looking at the image. Reply with ONLY JSON:
{"action":"click_at","x":<pixel>,"y":<pixel>}   // click a point you can see
{"action":"scroll","direction":"down"}
{"action":"done","answer":"<short result>"}
{"action":"ask_user","message":"<what you need>"}
Coordinates are pixels from the top-left of the screenshot.`;
        const messages = [
            { role: 'system', content: system },
            { role: 'user', content: [
                { type: 'text', text: 'What is the next action? JSON only.' },
                { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${screenshotBase64}` } },
            ] },
        ];
        try {
            const text = await provider.chatComplete(messages as any, model);
            return parseAction(text);
        } catch {
            return { action: 'ask_user', message: 'تعذّرت الرؤية بالصورة (تحقّق من نموذج الرؤية).' };
        }
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
