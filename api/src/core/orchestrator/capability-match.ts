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
import { isContextOption, requestedPrimitiveOptions } from './requested-primitive-options';
import { isEngineTool } from '../../modules/tools/engine-tools';
import { foldChars } from './promptNormalizer';

export interface Capable {
    name: string;
    score: number;
    /** The words that earned it — so a plan can say WHY it chose this. */
    why: string[];
    /** A destroying tool, matched by the deed the request ORDERS (never by a noun, a denial or a button's name). */
    byDeed?: boolean;
    /** …and the one file that deed is ordered on, when the request names it: what the tool is to be handed. */
    target?: string;
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
    [/التقط|لقطة|لقطه|سكرين/, ['capture', 'screenshot']],
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

interface Profile {
    name: string;
    nameTerms: Set<string>;
    tagTerms: Set<string>;
    descTerms: Set<string>;
    /** Optional explicit evidence required for a write-capable tool to match. */
    matchAnyTerms: Set<string>;
    inputProperties: Record<string, any>;
    /** The tool called by its own name: `name`, «name tool», «tool name» — and a snake_case name standing alone. */
    calledByName: RegExp;
    /** The words of its name that destroy («delete», «remove»…): without one of them in the request it is not what he asked. */
    destroys: string[];
}

/**
 * «RENAME THE FILE» IS NOT «DELETE THE FILE».
 *
 * "Don't do anything with the styles, only rename the file to main.css" planned
 * delete_file: «file» is in its name, and «anything» in its description broke the tie
 * with the writers. A noun shared by ten tools says which THING he means, never what to
 * do to it — and for a tool that destroys, guessing the deed is the one guess that cannot
 * be taken back. A tool whose name carries a destroying verb is matched only when the
 * request says that verb, or calls the tool by its name.
 */
const DESTROYS = new Set(['delete', 'remove', 'destroy', 'drop', 'purge', 'wipe', 'erase', 'uninstall', 'kill']);

/*
 * THE DEED IS THE VERB HE ORDERS — NOT A WORD BESIDE IT, AND NOT THE NOUN IT ACTS ON.
 *
 * The sixth pre-merge review (2026-11-12), each through the planner:
 *
 *     احذف / امسح / شيل الملف temp.txt        → ai_write_file on temp.txt
 *     غير اسم الملف… / انقل الملف… / فرغ الملف…  → ai_write_file
 *     Don't delete the file temp.txt           → delete_file
 *     Add a delete button to the file list     → delete_file, with the raw message
 *
 * «ملف» was bridged to file/files/WRITE, so every sentence about a file named a writer;
 * the gate above asked only whether a destroying word stood ANYWHERE in the request, so a
 * forbidden delete and a button's name both opened it; and Arabic had no destroying verb
 * at all. Three readings of one word, taken where it stands:
 *
 *   • AN ORDER — the verb in use: «احذف», «ممكن تحذف», "delete", "please remove";
 *   • A DENIAL — the same verb under a negator in its own clause: «لا تحذف», «بدون حذف»,
 *     "don't delete", "never remove". What he forbids names no tool;
 *   • A NAME — the word as part of a thing: «زر حذف», "a delete button", "delete flag".
 *     The deed there is whatever is done to the button.
 *
 * …and when the deed is done TO A FILE — delete, rename, move, empty, ordered or forbidden —
 * the file is its object, not a request to write one: that clause is matched only by a tool
 * whose NAME carries the deed (delete_file for a delete). No tool renames, moves or empties a
 * file, so those match nothing here and the planner that reads the whole request decides.
 * The rest of the request is matched as it always was.
 *
 * One pass over the words with bounded looks back and ahead: linear.
 */
const DEED_TOKEN = /[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu;
/** No deed word is in the (folded) request: nothing to read, and no token is cut. */
const A_DEED_WORD_INSIDE = /delete|remove|erase|wipe|purge|destroy|trash|drop|uninstall|kill|rename|move|relocate|empty|clear|truncate|حذف|مسح|امح|شيل|ازل|ازيل|زيل|ازاله|نقل|حرك|تحريك|فرغ|تفريغ|غير|تغيير|بدل|تبديل|عدل|تعديل|تسميه/u;
const DEED_BREAK =/^[\n.,;:!?،؛؟]$/u;
const DEED_COORDINATOR = /^(?:and|then|but|just|only|instead|و|ف|ثم|بس|لكن|فقط)$/u;
const DESTROY_EN = /^(?:delete|remove|erase|wipe|purge|destroy|trash|drop|uninstall|kill)$/u;
/** On a file, these are one deed: the file is gone. */
const DELETES_A_FILE_EN = /^(?:delete|remove|erase|wipe|purge|destroy|trash)$/u;
const RESHAPE_EN = /^(?:rename|move|relocate|empty|clear|truncate)$/u;
const BEFORE_A_NAME_EN = /^(?:a|an|the|this|that|its|soft|hard|bulk|quick|new|with|for|of|per|each|every)$/u;
const A_THING_NAMED_BY_IT = /^(?:flags?|buttons?|btn|links?|icons?|options?|actions?|endpoints?|routes?|keys?|menus?|confirmations?|features?|functionality|functions?|api|handlers?|columns?|fields?|permissions?|operations?|requests?|methods?|dates?|reasons?|status|count|modal|dialog|events?|logs?|policy|rules?|mode|at|by)$/u;
const NEGATOR = /^(?:not|never|don|dont|doesn|shouldn|mustn|won|cannot|cant|without|no|avoid|لا|ولا|ما|مش|مو|موب|بلاش|بدون|ممنوع|عدم|لن|لم|ليس|اياك)$/u;
const DESTROY_ORDER_AR = /^[وف]?(?:احذف|امسح|امح|امحي|شيل|ازل|ازيل)(?:ي|وا|و)?(?:ه|ها|هم)?(?:لي|لنا)?$/u;
const DESTROY_YOU_AR = /^[وف]?[بهح]?ت(?:حذف|مسح|محي|شيل|زيل)(?:ي|وا|و|ين)?ش?(?:ه|ها|هم)?(?:لي|لنا)?$/u;
const DESTROY_NOUN_AR = /^[وف]?(?:[بل]?ال|لل|[بل])?(?:حذف|مسح|ازاله)$/u;
const RESHAPE_ORDER_AR = /^[وف]?(?:انقل|حرك|فرغ|افرغ)(?:ي|وا|و)?(?:ه|ها|هم)?(?:لي|لنا)?$/u;
const RESHAPE_YOU_AR = /^[وف]?[بهح]?ت(?:نقل|حرك|فرغ)(?:ي|وا|و|ين)?ش?(?:ه|ها|هم)?(?:لي|لنا)?$/u;
const RESHAPE_NOUN_AR = /^[وف]?(?:[بل]?ال|لل|[بل])?(?:نقل|تحريك|تفريغ)$/u;
/** «غير اسم الملف», «بدل اسم…», «لا تغير اسم…», «تغيير اسم…»; «أعد تسمية…», «إعادة تسمية…». */
const CHANGES_AR = /^[وف]?(?:[بهح]?ت)?(?:غير|بدل|عدل)(?:ي|وا|و)?ش?(?:لي|لنا)?$|^[وف]?(?:[بل]?ال|لل|[بل])?(?:تغيير|تبديل|تعديل)$/u;
const AGAIN_AR = /^[وف]?(?:اعد|عيد|تعيد|اعاده)(?:ي|وا|و)?$/u;
/** Who the noun of a deed is ordered by: «اريد حذف الملف», «الرجاء حذف…». A clause that opens with it orders it too. */
const WISHES_AR = /^(?:اريد|ابغي|ابغا|ابي|بدي|عايز|عاوز|محتاج|ممكن|الرجاء|ارجو|يرجي|نريد|ودي|لازم|يجب)$/u;
const A_FILE = /^(?:files?|folders?|director(?:y|ies)|[وفبكل]?(?:ال|لل)?(?:ملف|ملفات|مجلد|مجلدات)(?:ي|ك|ه|ها|نا)?)$/u;
const A_FILE_EXTENSION = /^[a-z0-9]{1,5}$/u;
/** A file's name as it is written: «temp.txt», «scripts/deploy.yml», «docs\a.b.md» — read from where it starts, so a long word is read once. */
const A_FILE_NAME = /(?<![A-Za-z0-9_\\/.-])(?:[A-Za-z0-9_-]+[\\/])*[A-Za-z0-9_-]+(?:[.][A-Za-z0-9_-]+)*[.][A-Za-z0-9]{1,16}(?![A-Za-z0-9_])/g;
const BEFORE_ITS_OBJECT = /^(?:from|in|on|to|of|into|with|for|at|by|after|before|من|في|علي|الي|عن|مع)$/u;

interface FileDeeds {
    /** The request without the clauses whose deed is done to a file: what every other tool is matched on. */
    rest: string;
    /** The clauses that ORDER a destroying deed on a file — what a destroying tool is matched on. */
    destroyed: string;
    /** The destroying words that stand as an order, anywhere in the request — and «file» when one is ordered on a file. */
    ordered: Set<string>;
    /** The one file those clauses name ("temp.txt", "scripts/deploy.yml") — or '' when they name none, or more than one. */
    target: string;
}

//  One request is matched several times on its way (the candidate, the ranking, what stands beside a publish): it is read once.
let lastRead: { text: string; deeds: FileDeeds } | null = null;
function readFileDeeds(request: string): FileDeeds {
    const text = String(request || '');
    if (lastRead && lastRead.text === text) return lastRead.deeds;
    const deeds = readTheFileDeeds(text);
    lastRead = { text, deeds };
    return deeds;
}

function readTheFileDeeds(text: string): FileDeeds {
    const ordered = new Set<string>();
    //  Nothing to read: no deed word is in it (one cheap pass before the tokens are cut).
    if (!A_DEED_WORD_INSIDE.test(foldChars(text))) {
        return { rest: text, destroyed: '', ordered, target: '' };
    }
    const found = [...text.matchAll(DEED_TOKEN)];
    //  A word is folded once however often it is written, and a plain Latin one needs no folding.
    const folds = new Map<string, string>();
    const f = found.map(m => {
        const word = m[0];
        if (/^[ -~]+$/.test(word)) return word.toLowerCase();
        let folded = folds.get(word);
        if (folded === undefined) { folded = foldChars(word); folds.set(word, folded); }
        return folded;
    });
    const startOf = (i: number): number => found[i].index || 0;
    const endOf = (i: number): number => startOf(i) + found[i][0].length;
    const at = (i: number): string => f[i] || '';
    /** The dot of «temp.txt»: written against the name and its extension, not the end of a sentence. */
    const inAName = (i: number): boolean => f[i] === '.' && i > 0 && i + 1 < f.length
        && endOf(i - 1) === startOf(i) && endOf(i) === startOf(i + 1) && /[\p{L}\p{N}_]$/u.test(f[i - 1]) && A_FILE_EXTENSION.test(f[i + 1]);
    const breaks = (i: number): boolean => DEED_BREAK.test(f[i]) && !inAName(i);
    const blank: Array<[number, number, boolean]> = [];      // from, to, an ordered destroying clause
    for (let i = 0; i < f.length; i++) {
        const t = f[i];
        const destroyEn = DESTROY_EN.test(t), reshapeEn = !destroyEn && RESHAPE_EN.test(t);
        let destroys = destroyEn, isNoun = false, object = i + 1;
        if (!destroyEn && !reshapeEn) {
            if (DESTROY_ORDER_AR.test(t)) destroys = true;
            else if (DESTROY_YOU_AR.test(t)) destroys = true;
            else if (DESTROY_NOUN_AR.test(t)) { destroys = true; isNoun = true; }
            else if (RESHAPE_ORDER_AR.test(t) || RESHAPE_YOU_AR.test(t)) destroys = false;
            else if (RESHAPE_NOUN_AR.test(t)) isNoun = true;
            else if ((CHANGES_AR.test(t) && /^(?:ال)?اسم$/u.test(at(i + 1))) || (AGAIN_AR.test(t) && at(i + 1) === 'تسميه')) {
                object = i + 2; isNoun = /^[وف]?(?:[بل]?ال|لل|[بل])?(?:تغيير|تبديل|تعديل|اعاده)$/u.test(t);
            } else continue;
        }
        const prev = at(i - 1);
        //  A NAME: "a delete button", "delete flag", «زر حذف».
        if (destroyEn || reshapeEn) {
            if (BEFORE_A_NAME_EN.test(prev) || A_THING_NAMED_BY_IT.test(at(i + 1))) continue;
        }
        //  A DENIAL: a negator in its own clause, up to three words back.
        let negated = false;
        for (let j = i - 1, words = 0; j >= 0 && words < 3; j--) {
            const u = f[j];
            if (u === "'" || u === '’') continue;
            if (breaks(j) || DEED_COORDINATOR.test(u)) break;
            if (NEGATOR.test(u)) { negated = true; break; }
            if (/[\p{L}\p{N}]/u.test(u)) words++;
        }
        //  The noun of the deed orders it only where a clause opens with it or a wish hands it over; elsewhere it is a name.
        if (isNoun && !negated && !(i === 0 || breaks(i - 1) || DEED_COORDINATOR.test(prev) || WISHES_AR.test(prev))) continue;
        if (destroys && !negated) {
            if (destroyEn) ordered.add(t); else { ordered.add('delete'); ordered.add('remove'); }
        }
        //  Is it done to a file? Its object stands right after it, before any preposition.
        let file = -1;
        for (let j = object, words = 0; j < f.length && words <= 4; j++) {
            const u = f[j];
            //  «../secrets.env», «./a.txt», «docs/a.txt»: the marks of a path are written against the name.
            if (/^[./\\~]$/u.test(u) && j + 1 < f.length && endOf(j) === startOf(j + 1) && !inAName(j) && j - object < 12) continue;
            words++;
            if (breaks(j) || BEFORE_ITS_OBJECT.test(u)) break;
            if (A_FILE.test(u) || (inAName(j + 1) && /[\p{L}\p{N}_]/u.test(u))) { file = j; break; }
        }
        if (file < 0) continue;
        //  …and on a file «remove», «erase», «امسح» are one deed with «delete»: the file is gone.
        if (destroys && !negated && (!destroyEn || DELETES_A_FILE_EN.test(t))) { ordered.add('delete'); ordered.add('remove'); ordered.add('file'); }
        //  The clause runs to the next break, or to the next order joined to it.
        let end = file + 1;
        for (;;) {
            while (end < f.length && !breaks(end) && !DEED_COORDINATOR.test(f[end]) && !(/^[وف][\p{L}]{3,}$/u.test(f[end]) && !A_FILE.test(f[end]))) end++;
            //  «a.txt, b.txt and c.txt»: more files of the same deed.
            if (end + 2 < f.length && /^(?:,|،|and|و|&)$/u.test(f[end]) && inAName(end + 2)) { end++; continue; }
            break;
        }
        blank.push([startOf(i), endOf(end - 1), destroys && !negated]);
        i = end - 1;
    }
    if (!blank.length) return { rest: text, destroyed: '', ordered, target: '' };
    let rest = '', destroyed = '', last = 0;
    for (const [from, to, isOrder] of blank) {
        rest += text.slice(last, from) + ' ';
        if (isOrder) destroyed += text.slice(from, to) + ' ';
        last = to;
    }
    const names = new Set((destroyed.match(A_FILE_NAME) || []).map(name => name.replace(/\\/g, '/')));
    const target = names.size === 1 ? [...names][0] : '';
    return { rest: rest + text.slice(last), destroyed, ordered, target: target.includes('..') || /^[/]|^[A-Za-z]:/.test(target) ? '' : target };
}

let cached: Profile[] | null = null;
/** Every option some tool declares (context fields never select a tool) — read once with the profiles. */
let declaredOptions: Record<string, any> = {};

/**
 * What every tool says about itself. Built once — the registry does not change
 * while Joe runs — and rebuilt for a test that registers its own.
 */
export function toolProfiles(force = false): Profile[] {
    if (cached && !force) return cached;
    cached = (registeredTools as any[])
        // The agent engine's own tools are its alone (modules/tools/engine-tools.ts).
        .filter(t => t && typeof t.name === 'string' && !NEUTRAL.has(t.name) && !isEngineTool(t.name))
        .map(t => {
            const nameTerms = new Set(terms(String(t.name).replace(/[_-]+/g, ' ')));
            const escaped = String(t.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return {
                name: t.name,
                inputProperties: t.inputSchema?.properties || {},
                nameTerms,
                tagTerms: new Set((t.tags || []).flatMap((g: string) => terms(g))),
                descTerms: new Set(terms(String(t.description || '')).slice(0, 60)),
                matchAnyTerms: new Set((t.capabilityMatchAny || []).flatMap((g: string) => terms(g))),
                //  Compiled once: two patterns per tool were built for every request, and for every part of a chain.
                calledByName: new RegExp('`' + escaped + '`|\\b' + escaped + '\\s+tool\\b|\\btool\\s+' + escaped + '\\b'
                    + (String(t.name).includes('_') ? '|(?:^|[\\s`"\\\'])' + escaped + '(?=$|[\\s`"\\\',;.])' : ''), 'i'),
                destroys: [...nameTerms].filter(w => DESTROYS.has(w)),
            };
        });
    // Only options declared somewhere in the registry can discriminate a
    // candidate. Context fields never provide selection evidence or authority.
    declaredOptions = {};
    for (const profile of cached) for (const [key, schema] of Object.entries(profile.inputProperties)) {
        if (!isContextOption(key) && (declaredOptions[key] === undefined
            || /^(width|height)$/i.test(key) && ['number', 'integer'].includes((schema as any)?.type))) declaredOptions[key] = schema;
    }
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
    const deeds = readFileDeeds(String(request || ''));
    const whole = deeds.rest === String(request || '');
    //  Every tool but a destroying one is matched on what is said beside a deed done to a file.
    const wantRest = whole ? want : terms(deeds.rest);
    const seenRest = new Set([...wantRest, ...bridged(deeds.rest)]);
    //  A destroying tool is matched on the deed that is ordered, and on the clause that orders it.
    const seenDeed = new Set([...seenRest, ...terms(deeds.destroyed), ...bridged(deeds.destroyed), ...deeds.ordered]);

    const profiles = toolProfiles();
    const requested = requestedPrimitiveOptions(request, declaredOptions).values;
    const named = profiles.filter(p => p.calledByName.test(request));
    const scored: Capable[] = [];
    for (const p of profiles) {
        // A tool that destroys is matched by its deed — ordered, not forbidden and not a button's name — and
        // by what its name says it destroys: «delete» alone is not delete_FILE («Delete the header section»).
        const seen = p.destroys.length ? seenDeed : seenRest;
        if (p.destroys.length && !named.includes(p) && !(p.destroys.some(w => deeds.ordered.has(w))
            && (p.nameTerms.size === p.destroys.length || [...p.nameTerms].some(w => !DESTROYS.has(w) && seen.has(w))))) continue;
        // Some write-capable workflows deliberately declare the precise evidence
        // they require. Their descriptive prose can mention "analysis" or
        // "verification", but those broad words must never infer a branch/commit.
        // Evaluate the explicit safety gate against the user's actual terms,
        // not the language bridge. The bridge intentionally expands «مستودع» to
        // Git vocabulary, but that must not manufacture an intent to commit.
        if (p.matchAnyTerms.size && ![...p.matchAnyTerms].some(w => (p.destroys.length ? want : wantRest).includes(w))) continue;
        // A URL-only tool cannot fulfill an exact filename or viewport request.
        // Keep lexical/safety requirements; ToolService still admits execution.
        if (named.length && !named.some(n => n.name === p.name)) continue;
        if (!named.length && Object.entries(requested).some(([key, value]) => {
            const type = p.inputProperties[key]?.type;
            return type === 'integer' ? typeof value !== 'number' || !Number.isInteger(value)
                : type === 'number' ? typeof value !== 'number' || !Number.isFinite(value)
                : type === 'string' ? typeof value !== 'string'
                : type === 'boolean' ? typeof value !== 'boolean' : true;
        })) continue;
        let score = 0;
        const why: string[] = [];
        let descHits = 0;
        for (const w of seen) {
            if (p.nameTerms.has(w)) { score += 5; why.push(w); continue; }
            if (p.tagTerms.has(w)) { score += 3; why.push(w); continue; }
            if (p.descTerms.has(w) && descHits < 3) { score += 1; descHits++; why.push(w); }
        }
        // Supported explicit options add evidence only after a lexical hit.
        // They cannot turn an unrelated tool into the requested capability.
        if (score > 0) {
            const supported = Object.keys(requested).filter(key => p.inputProperties[key] !== undefined);
            score += supported.length * 3;
            why.push(...supported);
        }
        if (score >= 5) scored.push({ name: p.name, score, why: [...new Set(why)].slice(0, 4), ...(p.destroys.length && !named.includes(p) ? { byDeed: true, target: deeds.target } : {}) });
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
//  No `\s*` leads the marker: every part is trimmed below, and a pattern that may open with any run of
//  spaces is tried again from each space of the run — 20 KB of them cost 5–7 s of processor time.
const SEQUENCE = /(?:،\s*)?(?:ثمّ?|بعد\s*ذلك|وبعدها|وبعد\s*ذلك|أخيراً|then|after\s+that|next|finally)\s+|[\n\r]+|(?:^|\s)\d+[.)]\s+/gi;

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
    //  The same part names the same tool: a line repeated down a long message is matched once.
    const matched = new Map<string, Capable | undefined>();
    for (const part of parts) {
        if (!matched.has(part)) matched.set(part, capableTools(part, 1)[0]);
        const best = matched.get(part);
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

/**
 * AN EXPLICIT «THEN» — and nothing weaker.
 *
 * Measured: letting the chain outrank the hand-written routes on ANY split
 * broke four of them, because a new line is how people write ONE request
 * across several lines — his own «Features:» list is twelve lines and one
 * request. A newline is layout; «ثم» is order.
 *
 * So the chain may only outrank a hand-checked route when the user actually
 * said «and then».
 */
const EXPLICIT = /(?:^|\s)(?:ثمّ?|بعد\s*ذلك|وبعدها|وبعد\s*ذلك|then|after\s+that|finally)(?:\s|$)/i;

export function hasExplicitSequence(request: string): boolean {
    return EXPLICIT.test(String(request || ''));
}
