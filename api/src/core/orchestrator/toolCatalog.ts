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
    lex(`${AL}تبعيات|${AL}حزم|${AL}مكتبه|npm|${AL}باكج|ثبت`, ['package', 'dependency', 'npm', 'install', 'library', 'audit']),
    lex(`${AL}وثائق|${AL}توثيق|اشرح|readme|${AL}دليل`, ['documentation', 'docs', 'readme', 'swagger', 'openapi']),
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
    lex(`${AL}واجهه|${AL}تصميم|${AL}الوان|${AL}خط|${AL}تباين|${AL}وصول`, ['design', 'ui', 'contrast', 'tokens', 'accessibility', 'style']),
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

/** How well one tool answers this goal. Name matches hardest, then tags, then prose. */
export function scoreTool(tool: any, terms: string[]): number {
    const name = norm(tool?.name || '');
    const tags = (tool?.tags || []).map((t: any) => norm(String(t))).join(' ');
    const desc = norm(tool?.description || '');
    let score = 0;
    for (const t of terms) {
        if (!t) continue;
        if (name.includes(t)) score += 5;
        if (tags.includes(t)) score += 3;
        if (desc.includes(t)) score += 1;
    }
    return score;
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
