/**
 * WHAT THE BRAIN IS ALLOWED TO KNOW IT HAS.
 *
 * Joe registers 151 tools. The planner's prompt said, in one hardcoded line:
 *
 *     «Use ONLY existing tools: shell_execute, read_file, write_file,
 *      browser_run, grep_search, ls, npm_manager.»
 *
 * Seven names — and two of them (`grep_search`, `ls`) are aliases rather than
 * registered tools. Counting the ~21 more that hardcoded keyword paths name
 * directly, exactly 26 of 151 tools could EVER be chosen. 125 could not be
 * reached by any request phrased in any way: the browser's whole audit suite,
 * the builders for Go, Java, Python and mobile, the database tools, the
 * i18n translator, the load tester, the accessibility passes — all present,
 * all registered, all locked by tests, and all invisible to the thing that
 * decides what to do.
 *
 * Dumping 151 descriptions into the prompt is not the answer either: it is
 * twenty thousand tokens on every plan, on free-tier models that die well
 * before that — which is very likely why someone froze the list at seven.
 *
 * So the catalogue is RETRIEVED, not dumped: for this goal, in this language,
 * score every tool and offer the planner the ones that could plausibly serve
 * it, with their real arguments. Deterministic — no model, no network, no
 * latency — so the intelligence costs nothing per request.
 *
 * The scoring has to cross a language boundary the rest of the system already
 * crosses: the owner writes «ترجم الموقع» and the tool is called
 * `i18n_translator` with an English description. A small bilingual lexicon
 * carries the intent across; without it, an Arabic request scores zero
 * against every tool and the catalogue collapses back to the core.
 */
import { tools } from '../../modules/tools/registry';

/** Arabic (and common transliteration) → the English words tools describe themselves with. */
/**
 * Arabic (and common transliteration) → the English words tools describe
 * themselves with.
 *
 * The patterns are written against the NORMALISED goal — ة→ه, أ/إ/آ→ا, ى→ي,
 * diacritics stripped — and every one tolerates the definite article, because
 * «قاعدة البيانات» and «قاعدة بيانات» are the same request and the first
 * spelling silently scored zero until this was fixed.
 */
const AL = '(?:ال)?';
const lex = (body: string, adds: string[]): [RegExp, string[]] => [new RegExp(body), adds];
const AR_LEXICON: Array<[RegExp, string[]]> = [
    lex(`ترجم|ترجمه|${AL}لغات|${AL}لغه`, ['translate', 'i18n', 'language', 'locale']),
    lex(`اختبر|${AL}اختبار|افحص|${AL}فحص|${AL}تجربه|جرب`, ['test', 'testing', 'qa', 'validate', 'audit']),
    lex(`انشر|${AL}نشر|ارفع|${AL}استضافه|deploy`, ['deploy', 'publish', 'pages', 'hosting', 'release']),
    lex(`قاعده\\s*${AL}بيانات|قواعد\\s*${AL}بيانات|${AL}جدول|${AL}استعلام|sql|ترحيل`, ['database', 'sql', 'schema', 'migration', 'seed', 'query']),
    lex(`${AL}متصفح|${AL}براوزر|صفحه\\s*${AL}ويب|${AL}موقع`, ['browser', 'page', 'web', 'url', 'navigate']),
    lex(`${AL}صوره|${AL}صور|${AL}لقطه|${AL}شاشه`, ['image', 'screenshot', 'photo', 'visual', 'vision']),
    lex(`${AL}امان|${AL}ثغره|${AL}ثغرات|${AL}اختراق|${AL}حمايه|${AL}صلاحيات`, ['security', 'vulnerability', 'audit', 'compliance', 'secret', 'permission']),
    lex(`${AL}اداء|${AL}سرعه|بطيء|${AL}بطء|${AL}ضغط`, ['performance', 'speed', 'profile', 'load', 'benchmark', 'lighthouse']),
    lex(`${AL}ذاكره|تذكر|احفظ|استرجع|${AL}معرفه`, ['memory', 'recall', 'remember', 'knowledge', 'store']),
    lex(`جيت|${AL}مستودع|${AL}فرع|كوميت|github|git|${AL}تغييرات`, ['git', 'repository', 'branch', 'commit', 'pull request', 'github', 'diff']),
    lex(`دوكر|${AL}حاويه|${AL}حاويات|كوبرنيتس|${AL}خادم|${AL}سيرفر|${AL}بنيه`, ['docker', 'container', 'kubernetes', 'server', 'infrastructure', 'terraform']),
    // The terminal had no Arabic name at all: «ما آخر خطأ ظهر في الترمنال»

    // matched nothing, so the planner was shown the core tools only and
    // terminal_manager — the one tool that can READ the panel — was invisible.
    lex(`${AL}طرفيه|${AL}طرفيات|ترمنال|تيرمنال|${AL}كونسول|سطر\\s*${AL}اوامر|${AL}شل`, ['terminal', 'console', 'shell', 'command', 'output', 'history']),
    lex(`${AL}تبعيات|${AL}حزم|${AL}مكتبه|npm|${AL}باكج|ثبت`, ['package', 'dependency', 'npm', 'install', 'library', 'audit']),
    lex(`${AL}وثائق|${AL}توثيق|اشرح|readme|${AL}دليل`, ['documentation', 'docs', 'readme', 'swagger', 'openapi']),
    lex(`${AL}روابط|${AL}رابط|${AL}مكسوره|${AL}معطله|${AL}لينك`, ['link', 'links', 'href', 'broken', 'anchor']),
    lex(`pdf|${AL}طباعه|اطبع`, ['pdf', 'print', 'document']),
    lex(`${AL}محتوى|${AL}نص\\s*${AL}صفحه|${AL}قراءه|لخص|${AL}تلخيص`, ['readability', 'summarize', 'content', 'extract', 'text']),
    lex(`${AL}جوال\\s*${AL}واستجابه|${AL}استجابه|${AL}شاشات|responsive`, ['responsive', 'viewport', 'mobile', 'breakpoint']),
    lex(`سيو|${AL}ارشفه|${AL}ظهور|${AL}كلمات\\s*${AL}مفتاحيه|seo|meta`, ['seo', 'meta', 'search engine', 'sitemap']),
    lex(`${AL}خط\\s*${AL}انابيب|${AL}تكامل\\s*${AL}مستمر|pipeline|ci|cd|${AL}اتمته|${AL}اوتوميشن`, ['ci', 'pipeline', 'workflow', 'actions', 'automation', 'deploy']),
    lex(`${AL}جوال|${AL}موبايل|تطبيق\\s*${AL}هاتف|${AL}اندرويد|${AL}ايفون`, ['mobile', 'android', 'ios', 'app', 'react native']),
    lex(`${AL}دفع|${AL}فاتوره|${AL}اشتراك|checkout`, ['payment', 'checkout', 'invoice', 'subscription', 'stripe']),
    lex(`${AL}بريد|${AL}ايميل|${AL}رساله|${AL}تنبيه|${AL}اشعار`, ['email', 'mail', 'notify', 'alert', 'message']),
    lex(`${AL}ملف|${AL}ملفات|${AL}مجلد|احذف|انسخ|انقل`, ['file', 'directory', 'folder', 'delete', 'copy', 'move']),
    lex(`ابحث|${AL}بحث|جد|${AL}عن`, ['search', 'find', 'grep', 'lookup']),
    lex(`${AL}كود|${AL}شفره|برمج|refactor|ريفاكتور|${AL}هيكله|راجع`, ['code', 'refactor', 'generate', 'function', 'review']),
    lex(`${AL}خطا|${AL}اخطاء|${AL}عطل|اصلح|صحح|${AL}لوق`, ['error', 'fix', 'repair', 'debug', 'recovery', 'lint', 'log']),
    lex(`${AL}تقرير|حلل|${AL}تحليل|${AL}احصائيات|${AL}احصاء`, ['report', 'analyze', 'analysis', 'metrics', 'statistics']),
    lex(`${AL}تباين|${AL}وضوح\\s*${AL}الوان`, ['contrast', 'wcag', 'legibility']),
    lex(`${AL}وصول|${AL}اتاحه|${AL}اعاقه|a11y|accessib`, ['accessibility', 'a11y', 'aria', 'wcag']),
    lex(`${AL}واجهه|${AL}تصميم|${AL}الوان|${AL}خطوط|${AL}هويه`, ['design', 'ui', 'tokens', 'style', 'theme']),
    lex(`${AL}طلبات|${AL}زبائن|${AL}عملاء|${AL}مبيعات|${AL}نماذج`, ['orders', 'customers', 'forms', 'inbox']),
    lex(`${AL}سحابه|${AL}تكلفه|aws|azure`, ['cloud', 'cost', 'terraform', 'infrastructure']),
    lex(`${AL}فيديو|${AL}صوت|${AL}مقطع|${AL}نطق`, ['video', 'audio', 'media', 'speech']),
];

const STOP = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'you', 'are', 'was',
    'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'كل', 'لي', 'لك',
    'اريد', 'أريد', 'ممكن', 'يرجى', 'رجاء', 'الرجاء', 'قم', 'قوم',
]);

const norm = (s: string) => String(s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')            // Arabic diacritics + tatweel
    .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

const words = (s: string) => norm(s).split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));

/** The goal's own words PLUS the English words its Arabic implies. */
export function goalTerms(goal: string): string[] {
    const normalised = norm(goal);
    const out = new Set<string>(words(goal));
    for (const [re, adds] of AR_LEXICON) {
        if (re.test(normalised)) for (const a of adds) out.add(a);
    }
    return [...out];
}

/**
 * Tools that must always be on the table: the ones a plan reaches for no
 * matter the subject — read a file, write one, look around, ask the model.
 * Small on purpose; the ranked list is where the breadth comes from.
 */
export const CORE_TOOLS = [
    'central_answer', 'read_file', 'write_file', 'file_edit', 'delete_file',
    'inspect_directory', 'search_files', 'search_text', 'shell_execute',
];

export interface ScoredTool { name: string; score: number; line: string }

/**
 * How informative a word is, measured across the toolbox itself.
 *
 * «audit», «browser» and «test» appear in dozens of tool names; «seo», «pdf»
 * and «translate» appear in one or two. Counting every match equally made the
 * common words decide — «اكتب اختبارات للمشروع» scored browser_ui_audit as
 * highly as auto_tester, because both carry a common word. Rare words carry
 * the intent; this is the classic inverse-document-frequency weight, computed
 * once from the registry.
 */
const IDF: Map<string, number> = (() => {
    const df = new Map<string, number>();
    for (const t of tools as any[]) {
        const seen = new Set(
            `${norm(t?.name || '')} ${(t?.tags || []).map((x: any) => norm(String(x))).join(' ')}`
                .split(/[\s_]+/).filter(Boolean));
        for (const w of seen) df.set(w, (df.get(w) || 0) + 1);
    }
    const n = (tools as any[]).length || 1;
    const out = new Map<string, number>();
    for (const [w, c] of df) out.set(w, Math.max(0.25, Math.log(n / c) / Math.log(n)));
    return out;
})();

/** Words so common in the toolbox that matching them proves nothing. */
const weight = (term: string): number => {
    let best = 1;
    for (const [w, idf] of IDF) if (w.includes(term) || term.includes(w)) best = Math.min(best, idf);
    return best;
};

/** How well one tool answers this goal. Name matches hardest, then tags, then prose. */
export function scoreTool(tool: any, terms: string[]): number {
    const name = norm(tool?.name || '');
    const tags = (tool?.tags || []).map((t: any) => norm(String(t))).join(' ');
    const desc = norm(tool?.description || '');
    let score = 0;
    for (const t of terms) {
        if (!t) continue;
        const w = weight(t);
        if (name.includes(t)) score += 5 * w;
        if (tags.includes(t)) score += 3 * w;
        if (desc.includes(t)) score += 1 * w;
    }
    return Math.round(score * 10) / 10;
}

/** One compact line per tool: the name, its real arguments, and what it is for. */
export function toolLine(tool: any): string {
    const props = Object.keys(tool?.inputSchema?.properties || {}).slice(0, 6);
    const req: string[] = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
    const args = props.map(p => (req.includes(p) ? p : `${p}?`)).join(', ');
    const desc = String(tool?.description || '').split(/(?<=[.。])\s/)[0].slice(0, 130).trim();
    return `- ${tool.name}(${args}) — ${desc}`;
}

/**
 * The catalogue this goal deserves: every core tool, plus the best-scoring
 * ones, capped so the prompt stays affordable on a free-tier model.
 */
export function selectToolsFor(goal: string, limit = 30): ScoredTool[] {
    const terms = goalTerms(goal);
    const all = (tools as any[]).filter(t => t?.name && t?.description);
    const scored = all
        .map(t => ({ name: t.name, score: scoreTool(t, terms), line: toolLine(t) }))
        .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

    const picked = new Map<string, ScoredTool>();
    for (const name of CORE_TOOLS) {
        const hit = scored.find(s => s.name === name);
        if (hit) picked.set(name, hit);
    }
    for (const s of scored) {
        if (picked.size >= limit) break;
        if (s.score > 0) picked.set(s.name, s);
    }
    // Best first: a planner reads the top of a list far more carefully than
    // the bottom, and the core tools are the least surprising anyway.
    return [...picked.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** The block the planner prompt carries. */
export function catalogueFor(goal: string, limit = 30): string {
    return selectToolsFor(goal, limit).map(s => s.line).join('\n');
}

/** Every registered name — the planner's answers are checked against this. */
export const registeredToolNames = (): string[] => (tools as any[]).map(t => t.name);

/**
 * THE CAPABILITY ROUTER — because a catalogue nobody consults is a catalogue
 * that does not exist.
 *
 * Ranking 151 tools was only half the job, and measuring the other half was
 * humbling: «دقّق السيو في موقعي» never reached the planner at all, because a
 * goal shorter than 30 characters short-circuits to a spoken answer, and
 * «افحص الروابط المكسورة في موقعي» was claimed by the BUILD path, which tried
 * to build a website in response to a request to inspect one. Joe owned a
 * broken-link checker and answered with a paragraph.
 *
 * So the ranking is wired into the decision itself: when the request carries a
 * clear ACT verb (inspect, audit, translate, convert, generate docs…), and one
 * specialist tool wins by a clear margin, that tool is planned — as one honest
 * step, with its arguments filled from the goal.
 *
 * Three refusals keep it from becoming a new source of nonsense:
 *   - builders are excluded: «ابنِ متجراً» has its own deterministic path and
 *     always will;
 *   - a required argument that cannot be filled from the goal means NO route.
 *     Calling a tool that can only answer «url is required» is worse than not
 *     calling it;
 *   - a plain question with no act verb is left alone, so «ما هو أفضل تصميم؟»
 *     stays a conversation.
 */
const ACT_VERB = new RegExp([
    'افحص', 'فحص', 'دقق', 'تدقيق', 'حلل', 'تحليل', 'اختبر', 'اختبار', 'قس', 'قياس',
    'ترجم', 'ترجمه', 'حول', 'تحويل', 'ولد', 'توليد', 'راجع', 'مراجعه', 'استخرج', 'استخراج',
    // NOT bare «صور»: it lives inside the NOUN «صورة», so «حط صورة في الأعلى»
    // — a page edit — read as an act verb and routed to a vision tool.
    'التقط', 'لقطه', 'امسح', 'اقرا', 'قارن', 'مقارنه', 'نظف', 'رتب', 'لخص', 'تلخيص',
    'audit', 'check', 'inspect', 'analy[sz]e', 'test', 'translate', 'convert', 'extract',
    'scan', 'lint', 'profile', 'benchmark', 'measure', 'review', 'compare', 'summari[sz]e',
    'generate\\s+(docs|documentation|tests)', 'screenshot',
].join('|'));

/** Tools with their own deterministic path — the router must never race them. */
const ROUTER_EXCLUDED = new Set([
    'react_project', 'web_page_builder', 'api_project', 'project_pipeline', 'project_edit',
    'project_run', 'project_stop', 'deploy_pages', 'deploy_project', 'import_project',
    'central_answer', 'business_profile', 'orders_read', 'form_inbox', 'website_full_pipeline',
    'shell_execute', 'write_file', 'read_file', 'file_edit', 'delete_file', 'inspect_directory',
    // Builders have their own deterministic paths and answer «ابنِ». An
    // INSPECT verb must never land on one: «افحص الاستجابة على الجوال» scored
    // mobile_builder above browser_responsive_check and would have built an
    // app in answer to a request to test a page.
    'mobile_builder', 'go_builder', 'java_builder', 'python_builder', 'auth_builder',
    'scaffold_project', 'scaffold_full_stack', 'progressive_generator', 'bulk_file_generator',
    'ai_write_file', 'phase_executor', 'task_loop',
]);

const URL_RE = /https?:\/\/[^\s"'<>]+|\b(?:www\.)[^\s"'<>]+/i;

/**
 * «افحص موقعي» names no URL — but the session usually HAS one: the page or
 * project Joe just built and is already previewing. Without this, every
 * browser tool refuses a request that is perfectly clear to the person making
 * it, which is the difference between owning a broken-link checker and being
 * able to use it.
 */
function sessionUrl(context?: any): string {
    const explicit = String(context?.previewUrl || context?.url || '').trim();
    if (explicit) return explicit;
    const key = String(context?.sessionId || 'default').replace(/[^a-zA-Z0-9._-]/g, '_');
    const g: any = global as any;
    const page = g.joePages?.[key];
    const project = g.joeProjects?.[key];
    const port = process.env.PORT || '5002';
    if (project?.dir && project?.type !== 'api') return `http://localhost:${port}/project-preview/${key}/index.html`;
    if (page) return `http://localhost:${port}/preview/${key}`;
    return '';
}

/**
 * Fill a tool's arguments from the goal. Returns null when something REQUIRED
 * cannot be found — the honest answer is then «do not route here».
 */
export function inputForTool(tool: any, goal: string, context?: any): Record<string, any> | null {
    const props: Record<string, any> = tool?.inputSchema?.properties || {};
    const required: string[] = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
    const url = (String(goal).match(URL_RE) || [])[0] || sessionUrl(context);
    const input: Record<string, any> = {};

    for (const key of Object.keys(props)) {
        const k = key.toLowerCase();
        // `target` is deliberately NOT here: browser_translate's target is a
        // LANGUAGE, and filling it with a URL asked the page to be translated
        // into a hyperlink.
        if (/^(url|link|page|address|site|website)$/.test(k)) { if (url) input[key] = url; continue; }
        if (/^(query|question|text|request|instruction|goal|task|prompt|description|topic|content|input)$/.test(k)) {
            input[key] = goal;
            continue;
        }
    }
    // Anything still required and still missing means this tool cannot serve
    // this sentence — and saying so is the point.
    for (const r of required) if (input[r] === undefined) return null;
    // A tool with no required fields still needs SOMETHING to act on.
    if (!Object.keys(input).length) input.request = goal;
    return input;
}

export interface CapabilityRoute { tool: string; input: Record<string, any>; score: number; runnerUp: string }

/** One specialist, or nothing. Deterministic, and deliberately shy. */
export function capabilityRoute(goal: string, context?: any): CapabilityRoute | null {
    const g = String(goal || '').trim();
    if (g.length < 6) return null;
    if (!ACT_VERB.test(norm(g))) return null;

    const terms = goalTerms(g);
    const ranked = (tools as any[])
        .filter(t => t?.name && !ROUTER_EXCLUDED.has(t.name))
        .map(t => ({ tool: t, score: scoreTool(t, terms) }))
        .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 8) return null;                        // weak signal: leave it alone
    // A MARGIN between the top two was the first rule here, and it was wrong:
    // browser_seo_audit(25) and browser_extract_meta(24) are two good answers
    // to the same sentence, and the margin rule rejected both. What actually
    // separates a decision from a guess is whether the winner matched on its
    // NAME — «سيو» → browser_seo_audit — rather than on a stray word deep in
    // some description.
    // …and the name match must be on a word that MEANS something in this
    // toolbox. «audit», «test» and «browser» sit in dozens of names; matching
    // one of those is not a decision. `weight` is the inverse-frequency of the
    // word across the registry, so this asks for a distinctive hit.
    const nameHit = terms.some(t => t.length > 2 && norm(best.tool.name).includes(t) && weight(t) >= 0.5);
    if (!nameHit) return null;

    const input = inputForTool(best.tool, g, context);
    if (!input) return null;                                          // cannot feed it → do not call it
    return { tool: best.tool.name, input, score: best.score, runnerUp: second?.tool?.name || '' };
}
