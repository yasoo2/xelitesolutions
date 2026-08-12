/**
 * «جو غبي ومحدود جدا في التفكير والتنفيذ» — AND THE NUMBERS AGREED.
 *
 * Measured on this repository:
 *
 *     72 tools registered
 *     24 tool names appear anywhere in PlanningEngine
 *     ── 48 tools (67%) that NO plan can reach
 *
 * The planner sorts a request into three boxes — page / app / system — and
 * each box maps to a fixed pair of tools. Anything outside them falls to
 * generateDynamicDag, which asks a model; and his logs show the model
 * answering «CRITICAL: All LLM providers failed» over and over, so the plan
 * collapses to central_answer. Forty-eight capabilities exist and cannot be
 * summoned.
 *
 * That is the same disease as the six hardcoded domains, one layer up: a
 * whitelist of intents instead of a whitelist of businesses.
 *
 * THE CURE IS THE SAME ONE. Do not enumerate intents. Ask the TOOLS what they
 * are for — every one of them already carries a name, tags and a description
 * written by whoever built it — and match the request against that. Adding a
 * tool then makes Joe measurably more capable with no line written here, which
 * is the property the old design could never have.
 */
import { tools as registeredTools } from '../../modules/tools/registry';

export interface Capable {
    name: string;
    score: number;
    /** The words that earned it — so a plan can say WHY it chose this. */
    why: string[];
}

/**
 * Tools that match everything and therefore mean nothing here. They remain
 * perfectly good fallbacks — they are simply not evidence of a capability.
 */
const NEUTRAL = new Set(['central_answer', 'echo', 'ask_user', 'multi_agent_debate',
    'self_confidence_evaluator', 'ambiguity_resolver', 'request_analyzer']);

/** Words too common in either language to carry meaning. */
const STOP = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'you', 'your', 'our', 'are', 'can',
    'build', 'make', 'create', 'want', 'need', 'please', 'add', 'new', 'use', 'using', 'about',
    'في', 'من', 'الى', 'إلى', 'على', 'عن', 'مع', 'هذا', 'هذه', 'التي', 'الذي', 'أن', 'ان',
    'لي', 'لنا', 'ثم', 'كل', 'ابن', 'ابنِ', 'اعمل', 'أريد', 'اريد', 'قم', 'يجب', 'جو',
]);

/** Words, in any script, long enough to mean something. */
export function terms(text: string): string[] {
    return String(text || '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map(w => w.replace(/^(ال)/, ''))
        .filter(w => w.length >= 3 && !STOP.has(w));
}

/**
 * THE BRIDGE — and why it is allowed to be a list.
 *
 * Measured the moment this was written: eight Arabic requests matched NOTHING,
 * while their English twins matched archive_files, security_scanner,
 * api_tester and alert_manager exactly. The capability map is written in
 * English — every tool names and describes itself in it — so an Arabic user
 * reaches none of the 149.
 *
 * This is the one kind of list I will still write, and the distinction is the
 * one he already accepted: it grows with a LANGUAGE, not with the world. It
 * holds verbs and instruments — «اضغط», «ثغرة», «قاعدة بيانات» — not
 * businesses. A veterinary clinic and a car rental both use these same words,
 * and neither of them is named here.
 */
const BRIDGE: Array<[RegExp, string[]]> = [
    [/ضغط|اضغط|أرشف|أرشيف|مضغوط/, ['archive', 'compress', 'zip', 'files']],
    [/ثغر|أمني|امني|اختراق|حماية/, ['security', 'vulnerability', 'scanner', 'audit']],
    [/راجع|مراجع|جودة الكود|دقّ?ق/, ['review', 'code', 'quality']],
    [/اختبر|اختبار|فحص الوحدات/, ['test', 'tester', 'testing']],
    [/قاعدة بيانات|قواعد بيانات|استعلام|جدول/, ['database', 'sql', 'query', 'table']],
    [/متصفّ?ح|تصفّ?ح|افتح الموقع/, ['browser', 'page', 'navigate']],
    [/صور|صورة|تصميم صور/, ['image', 'photo', 'picture']],
    [/تنبيه|إنذار|أنذر|نبّ?ه/, ['alert', 'notify', 'monitoring']],
    [/خطّ?ط|خطة|مهام|تقسيم العمل/, ['plan', 'planner', 'project', 'tasks']],
    [/انشر|نشر|رفع|استضاف/, ['deploy', 'publish', 'pages']],
    [/مستودع|جيت|فرع|كوميت/, ['git', 'repository', 'branch', 'commit']],
    [/حلّ?ل|تحليل|اشرح البنية|بنية المشروع/, ['analyze', 'codebase', 'structure', 'outline']],
    [/بحث|ابحث|فتّ?ش/, ['search', 'find']],
    [/ملفّ?|ملفات|اكتب ملف/, ['file', 'files', 'write']],
    [/طرفي|تيرمنال|أمر شل|سطر الأوامر/, ['shell', 'terminal', 'command', 'execute']],
    [/ترجم|ترجمة/, ['translate', 'translation']],
    [/ذاكرة|تذكّ?ر|احفظ معلومة/, ['memory', 'remember', 'store']],
    [/أداء|بطء|سرعة|تحسين الأداء/, ['performance', 'cache', 'optimize']],
    [/توثيق|وثّ?ق|شرح للمستخدم/, ['documentation', 'docs', 'readme']],
    [/واجهة برمجية|إندبوينت|مسار برمجي/, ['api', 'endpoint', 'rest']],
];

/** The request's own words, plus the English a tool would have used for them. */
function bridged(request: string): string[] {
    const out: string[] = [];
    for (const [re, words] of BRIDGE) if (re.test(request)) out.push(...words);
    return out;
}

interface Profile { name: string; nameTerms: Set<string>; tagTerms: Set<string>; descTerms: Set<string> }

let cached: Profile[] | null = null;

/**
 * What every tool says about itself. Built once — the registry does not change
 * while Joe runs — and rebuilt for a test that registers its own.
 */
export function toolProfiles(force = false): Profile[] {
    if (cached && !force) return cached;
    cached = (registeredTools as any[])
        .filter(t => t && typeof t.name === 'string' && !NEUTRAL.has(t.name))
        .map(t => ({
            name: t.name,
            nameTerms: new Set(terms(String(t.name).replace(/[_-]+/g, ' '))),
            tagTerms: new Set((t.tags || []).flatMap((g: string) => terms(g))),
            descTerms: new Set(terms(String(t.description || '')).slice(0, 60)),
        }));
    return cached;
}

/**
 * THE MATCH.
 *
 * A hit on the tool's NAME is the strongest evidence — a name is chosen to say
 * what the thing does. A tag is next. A description word is weakest, because a
 * long description matches everything by accident; it is also capped so a
 * wordy tool cannot out-shout a precise one.
 */
export function capableTools(request: string, limit = 4): Capable[] {
    const want = terms(request);
    if (!want.length) return [];
    // The words he wrote, and the words a tool would have written for them.
    const seen = new Set([...want, ...bridged(String(request || ''))]);

    const scored: Capable[] = [];
    for (const p of toolProfiles()) {
        let score = 0;
        const why: string[] = [];
        let descHits = 0;
        for (const w of seen) {
            if (p.nameTerms.has(w)) { score += 5; why.push(w); continue; }
            if (p.tagTerms.has(w)) { score += 3; why.push(w); continue; }
            if (p.descTerms.has(w) && descHits < 3) { score += 1; descHits++; why.push(w); }
        }
        if (score >= 5) scored.push({ name: p.name, score, why: [...new Set(why)].slice(0, 4) });
    }

    /**
     * AND IT DECLINES RATHER THAN GUESSES.
     *
     * A threshold of 5 means at least one NAME hit, or a tag plus something.
     * A request that matches nothing returns nothing, and the planner keeps
     * whatever it would have done — this widens the reach, it never hijacks.
     */
    return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)).slice(0, limit);
}

/** How much of the registry a plan can currently reach — the number he asked about. */
export function reachableCount(): number {
    return toolProfiles().length;
}

/* ────────────────────────── one request, many tasks ────────────────────── */

/**
 * A SENTENCE WITH FOUR VERBS IS FOUR TASKS.
 *
 * capableTools() scores the WHOLE request against every tool and returns the
 * closest few. That is right for «اضغط الملفات في أرشيف» — one job, one tool.
 * It is wrong for:
 *
 *     «حلّل المستودع، ثم أصلح الثغرات، ثم اختبرها، ثم أرسل تقريراً»
 *
 * which is four jobs in a stated order. Ranking the sentence as a whole picks
 * the two tools most similar to all of it and drops the rest — and both of
 * them read the same raw sentence, so nothing flows.
 *
 * The split is by SEQUENCE MARKERS, not by meaning: «ثم», «بعد ذلك», «then»,
 * a numbered list, a new line. Those are shapes of a language again — finite,
 * and they carry the order the user already wrote down.
 */
const SEQUENCE = /\s*(?:،\s*)?(?:ثمّ?|بعد\s*ذلك|وبعدها|وبعد\s*ذلك|أخيراً|then|after\s+that|next|finally)\s+|[\n\r]+|(?:^|\s)\d+[.)]\s+/gi;

export interface ChainStep { name: string; why: string[]; part: string }

/**
 * The request as an ORDERED chain of tools — one per task it names.
 *
 * Returns [] when the request is a single job (let capableTools answer that)
 * or when a part matches nothing. It never pads the chain to look busy: a
 * step Joe cannot name a tool for is a step he should not pretend to run.
 */
export function capabilityChain(request: string, max = 5): ChainStep[] {
    const parts = String(request || '').split(SEQUENCE).map(p => p.trim()).filter(p => p.length > 2);
    if (parts.length < 2) return [];

    const chain: ChainStep[] = [];
    for (const part of parts) {
        const [best] = capableTools(part, 1);
        // A part with no tool breaks the chain honestly rather than being
        // silently dropped — a plan missing its middle step is worse than none.
        if (!best) return [];
        // «حلّلها ثم اشرحها» may match the same tool twice; running it twice on
        // its own output is noise, not depth.
        if (chain.length && chain[chain.length - 1].name === best.name) continue;
        chain.push({ name: best.name, why: best.why, part });
        if (chain.length >= max) break;
    }
    return chain.length >= 2 ? chain : [];
}
