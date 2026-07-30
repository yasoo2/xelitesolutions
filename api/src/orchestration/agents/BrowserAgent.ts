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
                // Read tasks are usually 1-2 steps, but leave room for the search
                // fallback (type → Enter → open result → read) when the subject
                // isn't on the landing page.
                maxSteps: readTask ? 6 : Number(process.env.BROWSER_AGENT_MAX_STEPS || 12),
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
        const typed = history.some(h => h.action.action === 'type');
        const pressedEnter = history.some(h => h.action.action === 'key');
        const clicked = history.some(h => h.action.action === 'click');
        const subject = extractSearchSubject(task);
        const snippet = (observation.textSnippet || '');
        // Is the subject plausibly present on the page we're looking at?
        const subjHead = subject.trim().slice(0, 14).toLowerCase();
        const subjectOnPage = subjHead.length >= 2 && (snippet.toLowerCase().includes(subjHead) || (observation.title || '').toLowerCase().includes(subjHead));

        // INTELLIGENT SEARCH (instead of giving up): if the subject is NOT on this
        // page but the page has a search box, type the subject and run the search,
        // then read the result — the exact behaviour the user expected on Wikipedia.
        if (subject && !subjectOnPage) {
            if (!typed) {
                const box = observation.elements.find(e =>
                    e.tag === 'input' && (e.type === 'search' || /search|بحث|ابحث|query|q$/i.test(`${e.type || ''} ${e.text || ''}`))
                ) || observation.elements.find(e => e.tag === 'input' && (e.type === 'text' || !e.type) && !e.isPassword);
                if (box) return { action: 'type', index: box.index, text: subject, reason: `يكتب «${subject}» في صندوق البحث` };
            } else if (!pressedEnter) {
                return { action: 'key', key: 'Enter', reason: 'يشغّل البحث' };
            } else if (!clicked) {
                // On a results list, open the most relevant link matching the subject.
                const hit = observation.elements.find(e =>
                    (e.tag === 'a' || e.type === 'link') && subjHead.length >= 2 && (e.text || '').toLowerCase().includes(subjHead)
                );
                if (hit) return { action: 'click', index: hit.index, reason: `يفتح نتيجة «${hit.text.slice(0, 30)}»` };
            }
        }

        const thin = snippet.trim().length < 60;
        if (thin && !scrolled && !typed) return { action: 'scroll', direction: 'down', reason: 'المحتوى الظاهر قليل — تمرير واحد ثم الإجابة' };

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

/** Resolve a well-known site named in words/transliteration (any language) to its
 *  URL, so «ادخل على جيت هاب» / "go to youtube" actually navigates there. */
export function knownSiteUrl(task: string): string | undefined {
    const t = `${String(task || '')}\n${normalizeIntentText(task)}`.toLowerCase();
    const sites: Array<[RegExp, string]> = [
        [/جيت\s*هاب|github/i, 'https://github.com'],
        [/يوتيوب|youtube/i, 'https://www.youtube.com'],
        [/فيس\s*بوك|facebook/i, 'https://www.facebook.com'],
        [/تويتر|twitter|\bx\.com\b/i, 'https://twitter.com'],
        [/انست[غق]رام|instagram/i, 'https://www.instagram.com'],
        [/لينكد\s*ان|linkedin/i, 'https://www.linkedin.com'],
        [/ريديت|reddit/i, 'https://www.reddit.com'],
        [/جيميل|gmail/i, 'https://mail.google.com'],
        [/ويكيبيديا|wikipedia/i, 'https://www.wikipedia.org'],
        [/امازون|amazon/i, 'https://www.amazon.com'],
        [/نتفليكس|netflix/i, 'https://www.netflix.com'],
        [/واتساب|whatsapp/i, 'https://web.whatsapp.com'],
        [/تيك\s*توك|tiktok/i, 'https://www.tiktok.com'],
    ];
    for (const [re, u] of sites) if (re.test(t)) return u;
    return undefined;
}

/** Pull the SUBJECT the user wants (e.g. "صدام حسين" from "ادخل ويكيبيديا واعطيني
 *  ملخص عن صدام حسين") so we can go straight to it instead of a bare homepage. */
export function extractSearchSubject(task: string): string {
    const t = String(task || '').trim();
    // The topic usually follows «عن / حول / بخصوص / about / regarding / on».
    const after = t.match(/(?:عن|حول|بخصوص|about|regarding)\s+(.+)$/i)?.[1];
    let q = after || t;
    q = q
        .replace(/https?:\/\/\S+/gi, ' ')
        // leading question phrases: «من هو / ما هي / who is / what is»
        .replace(/(?:^|\s)(من\s*هو|من\s*هي|ما\s*هو|ما\s*هي|من\s*هم|who\s*is|what\s*is|what'?s)\s+/gi, ' ')
        // command verbs
        .replace(/(ادخل|اذهب|روح|افتح|زر|ابحث|بحث|اعطني|اعطيني|واعطني|واعطيني|اعرض|اقرأ|لخّ?ص|ملخّ?ص|go\s*to|open|visit|enter|search|find|give\s*me|read|summar\w*)/gi, ' ')
        // site/scaffolding words + Arabic particles
        .replace(/(موقع|website|site|صفحة|page|the|a|an|for)/gi, ' ')
        // known site names (we don't want them inside the subject)
        .replace(/(ويكيبيديا|wikipedia|يوتيوب|youtube|جوجل|google|ياهو|yahoo|جيت\s*هاب|github|ريديت|reddit)/gi, ' ')
        .replace(/[«»"'،,]/g, ' ')
        // standalone Arabic particles (whole-word) that survive as noise
        .replace(/(?:^|\s)(على|الى|إلى|في|من|لي|و)(?=\s|$)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // Trim leading/trailing particles left at the edges.
    q = q.replace(/^(?:على|الى|إلى|في|من|لي|و)\s+/g, '').replace(/\s+(?:على|الى|إلى|في|من|عن|لي|و)$/g, '').trim();
    return q;
}

/** Give the loop a productive first page. Crucially: when the task names a SITE
 *  *and* a SUBJECT, go straight to the subject on that site (a Wikipedia article,
 *  a YouTube/Google search) — NOT the bare homepage. Landing on wikipedia.org's
 *  home page with no subject is exactly why "summarise Saddam from Wikipedia"
 *  found nothing and gave up. The loop then reacts to whatever actually loads. */
export function deriveStartUrl(task: string): string | undefined {
    const t = String(task || '');
    const url = t.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
    if (url) return url;

    const tl = t.toLowerCase();
    const subject = extractSearchSubject(t);
    const hasSubject = subject.length >= 2;

    // Wikipedia → the article itself (Arabic wiki for an Arabic user). Wikipedia
    // resolves close titles / shows search suggestions if the title isn't exact.
    if (/ويكيبيديا|wikipedia/i.test(tl)) {
        return hasSubject
            ? `https://ar.wikipedia.org/wiki/${encodeURIComponent(subject.replace(/\s+/g, '_'))}`
            : 'https://ar.wikipedia.org';
    }
    // YouTube / Yahoo → their own search results for the subject.
    if (/يوتيوب|youtube/i.test(tl) && hasSubject) return `https://www.youtube.com/results?search_query=${encodeURIComponent(subject)}`;
    if ((tl.includes('yahoo') || tl.includes('ياهو')) && hasSubject) return `https://search.yahoo.com/search?p=${encodeURIComponent(subject)}`;

    // Any other named site → its homepage (login/navigation tasks).
    const site = knownSiteUrl(t);
    if (site) return site;

    // A generic lookup with no named site → Google the subject. (No \b around the
    // Arabic alternatives — JS word boundaries are ASCII-only and would never match.)
    if (hasSubject && /(?:\b(?:search|find)\b)|بحث|ابحث|ملخص|لخّ?ص|معلومات|من\s*هو|ما\s*هو|من\s*هي|ما\s*هي/i.test(t)) {
        return `https://www.google.com/search?q=${encodeURIComponent(subject)}`;
    }
    return undefined;
}
