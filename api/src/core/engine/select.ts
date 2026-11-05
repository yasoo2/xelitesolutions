/**
 * WHICH ENGINE BUILDS THIS RUN'S PROJECT.
 *
 * Two engines exist side by side. The first plans phases and calls Joe's
 * project tools. The second (this folder) is the general agent loop. The
 * second takes a build only when it is asked for: by the run itself (an
 * `engine` field on the run's context) or by the deployment (JOE_ENGINE).
 * It stays off by default until it beats the first engine on the exam. It
 * is read on every call, never at module load, so an operator can switch it
 * without a rebuild.
 */
import { FoldedRegExp } from '../design/request-lists';

export type EngineName = 'agent' | 'legacy';

export function engineFor(context?: { engine?: unknown } | null, env: NodeJS.ProcessEnv = process.env): EngineName {
    const asked = String(context?.engine ?? env.JOE_ENGINE ?? '').trim().toLowerCase();
    return asked === 'agent' ? 'agent' : 'legacy';
}

/**
 * WHICH REQUESTS THE AGENT ENGINE TAKES, BEFORE THE OLD PLANNER PICKS A TOOL.
 *
 * Measured on 2026-11-01: with JOE_ENGINE=agent a build request reached the
 * engine, but «عدّل نفس التطبيق: اجعل زر الإضافة أخضر…» in the same chat went
 * to the first planner, which chose project_planner, found it lacking input,
 * and turned the request into a question to the user; the tool that asks
 * answered «Request sent. Agent loop should now pause.» and nothing changed.
 *
 * With the agent engine on, a request to build software, and a request to
 * change the project this chat already has, go to the engine directly. A
 * change goes back into the chat's own project folder. Everything else (a
 * question, a page to read, a file to look at) stays with the first planner.
 * The readers are Joe's own: the build reader and the edit reader the first
 * engine uses.
 */
export type AgentRoute = { kind: 'build' } | { kind: 'change'; path: string };

export async function agentEngineRoute(
    goal: string,
    context?: { engine?: unknown; sessionId?: unknown } | null,
    env: NodeJS.ProcessEnv = process.env,
): Promise<AgentRoute | null> {
    if (engineFor(context, env) !== 'agent') return null;
    const text = String(goal || '').trim();
    if (!text) return null;
    const project = await chatProjectFolder(context?.sessionId);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isActionableEditRequest } = require('../../modules/tools/definitions/ProjectEditTool');
    if (project && !startsAfresh(text) && (isActionableEditRequest(text) || isFollowUpChange(text))) return { kind: 'change', path: project };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isBuildRequest } = require('../intelligence/intent-classifier');
    return isBuildRequest(text)?.isBuild ? { kind: 'build' } : null;
}

/**
 * A FOLLOW-UP THAT LEADS WITH A CHANGE CHANGES THE CHAT'S PROJECT.
 *
 * The edit reader wants a target it knows (a button, a colour, a field), so
 * «أضف وضعاً ليلياً», «خلي الخلفية زرقاء», "make the header sticky" were new
 * builds in a chat that had a project (2026-11-05). In a chat that has one,
 * a message that opens with a change verb — after the fillers people type
 * before it («وكمان», «لو سمحت», "now", "please") — is a change of it, unless
 * it says it starts afresh.
 */
const CHANGE_LEAD_AR = new FoldedRegExp(
    '^(?:(?:و?(?:ثم|بعدين|كمان|الآن|هلق|هلا|طيب|ممكن|رجاء)|لو\\s+سمحت|من\\s+فضلك|يا\\s+جو)[\\s،,]+)*و?'
    + '(?:أضف|أضيف|ضيف|ضيفي|زيد|زد|غير|عدل|احذف|شيل|امسح|اجعل|خلي|حسن|كبر|صغر|بدل|استبدل|أصلح|صلح|انقل|رتب|ترجم|حول|لون|أخف|أظهر|وسط'
    + '|تضيف|تغير|تعدل|تحذف|تشيل|تخلي|تجعل|تحسن|تكبر|تصغر|تبدل|تصلح|تنقل|ترتب|تترجم|تحول)(?=\\s|$)', 'u');
const CHANGE_LEAD_EN = /^(?:(?:and|also|now|then|ok|okay|please|pls|could\s+you|can\s+you|would\s+you)[\s,]+)*(?:add|change|make|remove|delete|rename|move|fix|improve|translate|replace|turn|put|show|hide|update|edit|set|use|swap|increase|decrease|center|centre|align|shrink|enlarge)\s+\S/iu;
/**
 * …and a message that asks for a whole thing, indefinite, starts one: «اجعل
 * لي موقعاً لمطعم», "make me a booking app" — where «اجعل الموقع أسرع», "make
 * the app faster" change the one the chat has.
 */
const AFRESH = new FoldedRegExp(
    '(?:مشروع|تطبيق|موقع|نظام|لعبة|متجر|برنامج)[اًا]?\\s+(?:\\S+\\s+)?جديد|من\\s+الصفر|من\\s+جديد'
    + '|(?:اعمل|اجعل|خلي|سوي|ابني|ابن|أنشئ|صمم)\\s+(?:لي\\s+|لنا\\s+)?(?:\\S+\\s+)?(?:مشروع|تطبيق|موقع|نظام|لعبة|متجر|برنامج|منصة)(?=[اًا]?(?:\\s|$|[،,.]))'
    + '|\\bnew\\s+(?:\\S+\\s+)?(?:project|app|application|site|website|game|system|store)\\b|\\bfrom\\s+scratch\\b|\\bstart\\s+over\\b|\\banother\\s+(?:project|app)\\b'
    + '|\\b(?:make|build|create)\\s+(?:me\\s+|us\\s+)?(?:a|an)\\s+(?:\\S+\\s+){0,3}?(?:site|website|app|application|game|system|store|platform)\\b', 'iu');

/** Does this message say it starts a new project rather than change this one? */
export function startsAfresh(text: string): boolean {
    return AFRESH.test(String(text || ''));
}

export function isFollowUpChange(text: string): boolean {
    const t = String(text || '').trim().replace(/[ً-ٰٟـ]/gu, '');
    if (t.split(/\s+/).length < 2 || startsAfresh(t)) return false;
    return CHANGE_LEAD_AR.test(t) || CHANGE_LEAD_EN.test(t);
}

/** The folder the agent engine last built for this chat, when it still exists. */
export async function chatProjectFolder(sessionId: unknown): Promise<string | null> {
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { readJoeProjectForRun } = require('../../api/page-store');
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { previewKey } = require('../../modules/tools/preview-site');
        const entry = readJoeProjectForRun(previewKey(sid), null);
        const dir = entry?.type === 'agent' ? String(entry.dir || '').trim() : '';
        if (!dir) return null;
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const stat = await require('fs').promises.stat(dir);
        return stat.isDirectory() ? dir : null;
    } catch {
        return null;
    }
}
