/**
 * WHAT HE ASKED FOR, CHECKED ONE BY ONE, BEFORE ANYTHING IS CALLED DONE.
 *
 * An outside audit put it exactly right: «نجاح البناء لا يساوي نجاح الوكيل».
 * A wide brief asked for a booking board with six rows, search, a status
 * filter, an add form, empty states, a local export, a README, a production
 * build and a preview. What came back was a working project, a message listing
 * files, and `success: true` — with no build, no README, and no mention that
 * seven of the nine things asked for had not been demonstrated.
 *
 * Nothing in the run was lying. Each individual claim was true. The failure
 * was that nobody ever ASKED the question the user cares about: of the things
 * I was told to deliver, which ones can I actually show?
 *
 * That question is this file. It has three parts, and the third is the one
 * that matters:
 *
 *   1. READ the brief into a list of criteria — features, artifacts and
 *      verifications, each with a stable id.
 *   2. LOOK for evidence of each one in what was really produced: files on
 *      disk, the build flag, a running server, the browser audit, and the
 *      generated source itself.
 *   3. REFUSE to call the run accepted while any criterion is unmet, and name
 *      every one of them in the delivery.
 *
 * The judge never invents a criterion the user did not ask for, and never
 * marks one met on anything except evidence it can point at. A criterion it
 * cannot test says «unprovable» rather than passing quietly — because a check
 * that cannot fail is the thing this project keeps deleting.
 */
import fs from 'fs';
import path from 'path';

/**
 * Gate062's fixed acceptance input: four source-backed UI criteria.
 * Keep this separate from the live-run input below, which also asks for a
 * verified preview and therefore yields five criteria.
 */
export const GATE062_ACCEPTANCE_PROMPT =
    'Build a small project called Gate062. Create one polished page titled Gate 062 with a heading, a short status message, and a button that increments a visible counter.';

export const GATE062_LIVE_PROMPT =
    GATE062_ACCEPTANCE_PROMPT + ' Run the real build and open the live preview. Do not modify existing projects.';

export type CriterionKind = 'feature' | 'artifact' | 'verification';
export type Verdict = 'met' | 'unmet' | 'unprovable';

export interface Criterion {
    id: string;
    kind: CriterionKind;
    ar: string;
    en: string;
    /** Source markers that prove a FEATURE was really generated. */
    markers?: RegExp[];
    /** Exact user-requested title text, when it can be extracted safely. */
    expectedText?: string;
}

export interface JudgedCriterion extends Criterion {
    verdict: Verdict;
    /** The evidence, or the reason there is none — in one line. */
    why: string;
}

export interface Acceptance {
    criteria: JudgedCriterion[];
    met: number;
    unmet: number;
    /** True only when every asked-for criterion is met. */
    accepted: boolean;
}

/**
 * THE CATALOGUE OF THINGS A BRIEF CAN ASK FOR.
 *
 * Shapes, not domains: «بحث» is a shape a request has or has not got, and it
 * means the same thing for a clinic, a warehouse and a bookings board. Each
 * entry carries what would have to exist in the generated source for the
 * answer to be yes — so «met» is a grep with a reason, never an opinion.
 */
const CATALOGUE: Array<Criterion & { asked: RegExp }> = [
    {
        id: 'search', kind: 'feature',
        asked: /(بحث|ابحث|\bsearch\b)/iu,
        ar: 'بحث داخل البيانات', en: 'search across the data',
        markers: [/type=["']search["']/i, /\bsearch\b/i, /بحث/u, /filter\(/],
    },
    {
        id: 'filter', kind: 'feature',
        asked: /(مرشّ?ح|فلتر|تصفية|\bfilter\b)/iu,
        ar: 'مُرشّح حالة', en: 'a status filter',
        markers: [/status/i, /الحالة/u, /<select/i],
    },
    {
        id: 'counter', kind: 'feature',
        asked: /(عداد|العدد|إجمالي|المجموع|\bcounter\b|\bcount\b|\btotal\b|\bbadge\b)/iu,
        ar: 'عداد أو إجمالي', en: 'a counter or total',
        markers: [],
    },
    {
        id: 'button', kind: 'feature',
        asked: /(زر|أزرار|\bbutton\b|\bcta\b|call[- ]?to[- ]?action)/iu,
        ar: 'زر تفاعلي', en: 'an interactive button',
        markers: [],
    },
    {
        id: 'title', kind: 'feature',
        asked: /(عنوان|العنوان|\btitle\b|\btitled\b|\bheading\b|\bheadline\b)/iu,
        ar: 'عنوان أو رأس صفحة', en: 'a title or heading',
        markers: [/<h[1-6]\b/i, /<title\b/i],
    },
    {
        id: 'status_message', kind: 'feature',
        asked: /(رسالة\s*(?:حالة|نجاح|خطأ)|حالة\s*(?:نجاح|خطأ)|status\s*message|success\s*message|error\s*message|\btoast\b)/iu,
        ar: 'رسالة حالة أو نتيجة', en: 'a status or result message',
        markers: [],
    },
    {
        id: 'add_row', kind: 'feature',
        asked: /(?:إضافة|اضافة|أضف|\badd\b|\bcreate\b)\s+(?:(?:a|an|the)\s+)?(?:new\s+)?(?:حجز|صف|عنصر|سجل|بيان|مهمة|مشروع|عميل|جهة|منتج|طلب|تذكرة|ملاحظة|row|record|entry|item|booking|task|project|customer|contact|product|order|ticket|note)(?:\s+(?:record|entry|item))?/iu,
        ar: 'إضافة سجلّ جديد', en: 'adding a new record',
        markers: [/<form/i, /onSubmit/i, /\bcreate\b/i, /إضافة/u],
    },
    {
        id: 'export', kind: 'feature',
        asked: /(تصدير|صدّ?ر|تنزيل|\bexport\b|\bdownload\b|\bcsv\b)/iu,
        ar: 'تصدير محلّي', en: 'a local export',
        markers: [/createObjectURL|download=|\bcsv\b|toCSV|Blob\(/i],
    },
    {
        id: 'dashboard', kind: 'feature',
        asked: /(لوحة\s*(مؤشرات|تحكم|قيادة)|إحصاء|احصاء|مؤشرات|\bdashboard\b|\bkpi\b|\bstats?\b)/iu,
        ar: 'لوحة مؤشّرات', en: 'a dashboard of indicators',
        markers: [/stat|kpi|مؤشر|إحصاء/iu],
    },
    {
        id: 'empty_state', kind: 'feature',
        asked: /(حالات?\s*(فراغ|فارغة|خطأ)|\bempty\s*state|\berror\s*state)/iu,
        ar: 'حالات الفراغ والخطأ', en: 'empty and error states',
        markers: [/empty|لا توجد|لا يوجد|فارغ/iu],
    },
    {
        id: 'rtl', kind: 'feature',
        asked: /\brtl\b|عربية?\s*(متجاوبة|واجهة)?|اتجاه\s*عربي/iu,
        ar: 'واجهة عربية RTL', en: 'an Arabic RTL interface',
        markers: [/dir=["']rtl["']/i],
    },
    {
        id: 'readme', kind: 'artifact',
        asked: /\breadme\b|ملف\s*(تعريف|شرح)/iu,
        ar: 'ملف README', en: 'a README file',
    },
    {
        id: 'production_build', kind: 'verification',
        asked: /(?:بناء|ابنِ)\s*(?:لي\s*)?(?:نسخة\s*)?(?:إنتاج|الإنتاج)|(?:نسخة|بيئة)\s*(?:إنتاج|الإنتاج)|production\s+build|build\s+for\s+production|npm\s+run\s+build/iu,
        ar: 'بناء نسخة الإنتاج', en: 'a production build',
    },
    {
        id: 'preview', kind: 'verification',
        asked: /(معاينة|عاين|\bpreview\b|\bserve\b)/iu,
        ar: 'معاينة محلّية تعمل', en: 'a working local preview',
    },
    {
        id: 'browser_check', kind: 'verification',
        asked: /(متصفح|المتصفح|\bbrowser\b|فحص\s*بصري|visual\s*check)/iu,
        ar: 'فحص في متصفّح حقيقي', en: 'a check in a real browser',
    },
];

/** Extract a literal title only when the request gives a safe structural boundary. */
function extractRequestedTitle(request: string): string | undefined {
    const patterns = [
        // Quoted, in either language: the closing quote IS the boundary,
        // so there is no lookahead and no guessing where the name stops.
        /(?:titled|called|named|بعنوان|عنوانها|عنوانه|اسمها|إسمها|اسمه|إسمه)\s*[:：]?\s*[«"'`‘“]([^»"'`’”]{1,60})[»"'`’”]/iu,
        /\btitled\s+(.+?)(?=\s+(?:with|that|which|containing|including|and)\b|[,.;]|$)/iu,
        /(?:بعنوان|عنوانها|عنوانه|اسمها|إسمها|اسمه|إسمه)\s+(.+?)(?=\s+(?:فيها|يحتوي|تحتوي|مع|وبها|والتي|و)(?=\s|[،,؛.;]|$)|[،,؛.;]|$)/u,
    ];
    for (const pattern of patterns) {
        const match = pattern.exec(request);
        if (!match) continue;
        const value = match[1].trim().replace(/["'`]+$/g, '').trim();
        const words = value.split(/\s+/u).filter(Boolean);
        if (words.length > 0 && words.length <= 4) return value;
    }
    return undefined;
}

/** The named, regression-tested title extractor used by acceptanceFor. */
export function titleTextFrom(request: string): string | undefined {
    return extractRequestedTitle(request);
}

/** The criteria THIS brief actually asks for — never a fixed checklist. */
export function acceptanceFor(request: string): Criterion[] {
    const t = String(request || '');
    return CATALOGUE.filter(c => c.asked.test(t))
        .map(({ asked, ...rest }) => rest)
        .map(c => c.id === 'title'
            ? { ...c, expectedText: titleTextFrom(t) }
            : c);
}

export interface Evidence {
    /** The generated project directory, when one exists. */
    dir?: string;
    built?: boolean;
    /** A preview/server url that was verified alive. */
    liveUrl?: string;
    /** The browser audit, or its skip reason. */
    audit?: { skipped?: string; score?: number } | null;
}

/** Read every source file once — the judge greps this, not the disk. */
function sourceOf(dir: string): string {
    const out: string[] = [];
    const walk = (d: string, depth = 0) => {
        if (depth > 4) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p, depth + 1); continue; }
            if (!/\.(jsx?|tsx?|html|css)$/i.test(e.name)) continue;
            try { out.push(fs.readFileSync(p, 'utf-8')); } catch { /* unreadable is not evidence */ }
        }
    };
    walk(dir);
    return out.join('\n');
}

interface StateBinding {
    value: string;
    setter: string;
}

function stateBindings(src: string): StateBinding[] {
    const bindings: StateBinding[] = [];
    const pattern = /\b(?:const|let)\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*(?:React\.)?use(?:State|Reducer)\s*\(/gi;
    for (const match of src.matchAll(pattern)) {
        bindings.push({ value: match[1], setter: match[2] });
    }
    return bindings;
}

function hasCounterEvidence(src: string): boolean {
    return stateBindings(src).some(({ value, setter }) => {
        const setterCall = new RegExp(`\\b${escapeRegExp(setter)}\\s*\\([\\s\\S]{0,180}?(?:\\+\\s*1|-\\s*1|\\bprev[A-Za-z_$]*\\b)`, 'i').test(src);
        const visibleValue = new RegExp(`(?:data-(?:count|total)\\s*=\\s*\\{\\s*${escapeRegExp(value)}\\s*\\}|>\\s*\\{\\s*${escapeRegExp(value)}\\s*\\}\\s*<)`, 'i').test(src);
        const action = new RegExp(`\\b(?:onClick|onChange|onSubmit)\\s*=\\s*[\\s\\S]{0,220}?\\b${escapeRegExp(setter)}\\s*\\(`, 'i').test(src);
        return setterCall && visibleValue && action;
    });
}

function hasActionBoundButtonEvidence(src: string): boolean {
    const clickButton = /<button\b[^>]*\bonClick\s*=/i.test(src)
        || /\brole=["']button["'][^>]*\bonClick\s*=/i.test(src);
    const submitButton = /<form\b[^>]*\bonSubmit\s*=\s*[\s\S]*?<button\b[\s\S]*?<\/form>/i.test(src)
        || /<button\b[^>]*\btype=["']submit["']/i.test(src);
    return clickButton || submitButton;
}

function hasStatusMessageEvidence(src: string): boolean {
    return stateBindings(src).some(({ value, setter }) => {
        if (!/(?:status|message|notice|feedback|success|error|toast|result|alert)/i.test(value)) return false;
        const setterCall = new RegExp(`\\b${escapeRegExp(setter)}\\s*\\([\\s\\S]{0,180}?\\)`, 'i').test(src);
        const semanticNode = new RegExp(`<(?:(?:p|div|span|output|section))\\b[^>]*(?:role=["']status["']|aria-live=["'][^"']+["']|className=["'][^"']*(?:status|message|notice|feedback)[^"']*["'])[^>]*>[\\s\\S]*?\\{\\s*${escapeRegExp(value)}\\s*\\}[\\s\\S]*?<\\/\\w+>`, 'i').test(src);
        return setterCall && semanticNode;
    });
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * PROOF THAT FOLLOWS THE EXPRESSION, NOT A WORD THAT LOOKS LIKE IT.
 *
 * The first version of this proof was reviewed adversarially and it failed —
 * three ways for the title, one for the total. Every case below is real output
 * from that review, not a hypothetical:
 *
 *     const unrelated = { brand: 'A' };  const content = { brand: 'B' };
 *     <h1>{content.brand}</h1>        -> proof claimed A. The page renders B.
 *
 *     // brand: 'A'                   -> a comment proved a title
 *     const note = "brand: 'A'";      -> a string proved a title
 *
 * One shortcut caused all three: content.brand was reduced to the tail brand,
 * and the first line containing that word won. A hop that ignores which object
 * it hopped from is not a hop — it is a search. So the object is resolved
 * first, its literal sliced by balanced braces, comments removed, and only then
 * is the property read. An expression deeper than one hop, or an object that is
 * not a plain literal, resolves to nothing and stays unproven.
 *
 * The total failed the same way in its own dialect:
 *
 *     rows.reduce((a, r) => a + r.label, '')   -> a string join, called a total
 *
 * Plus is not addition when the seed is a string. And the deeper finding of
 * that review: the generated records app does not fold in the view at all. It
 * declares { kind: 'sum', field: 'amount' } and renders computeMetric(m, rows).
 * The earlier proof matched a reduce belonging to a donut chart and called it
 * the user's total — right by accident, which is a kind of wrong.
 */
function withoutComments(text: string): string {
    const kept: string[] = [];
    let rest = text;
    for (;;) {
        const open = rest.indexOf('/' + '*');
        if (open < 0) { kept.push(rest); break; }
        const close = rest.indexOf('*' + '/', open + 2);
        if (close < 0) { kept.push(rest.slice(0, open)); break; }
        kept.push(rest.slice(0, open), ' ');
        rest = rest.slice(close + 2);
    }
    return kept.join('').split('\n').map(line => {
        const at = line.indexOf('/' + '/');
        return at < 0 ? line : line.slice(0, at);
    }).join('\n');
}

/** The braces-balanced body of a plain object binding, or nothing. */
function objectLiteralOf(src: string, objectName: string): string | undefined {
    const BS = String.fromCharCode(92);
    const decl = new RegExp('(?:export' + BS + 's+)?(?:const|let|var)' + BS + 's+' + escapeRegExp(objectName) + '' + BS + 's*=' + BS + 's*[{]', 'u');
    const found = decl.exec(src);
    if (!found) return undefined;
    const opens = src.indexOf('{', found.index);
    let depth = 0;
    for (let at = opens; at < src.length; at++) {
        const ch = src.charAt(at);
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return src.slice(opens, at + 1); }
    }
    return undefined;
}

/** A quoted literal assigned to one name, on one line of decommented text. */
function literalAssignedTo(text: string, name: string): string | undefined {
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        const at = line.indexOf(name);
        if (at < 0) continue;
        const before = at === 0 ? '' : line.charAt(at - 1);
        if (before && /[A-Za-z0-9_$]/u.test(before)) continue;
        const after = line.slice(at + name.length).trim();
        if (!after.startsWith(':') && !after.startsWith('=')) continue;
        const rest = after.slice(1).trim();
        const quote = rest.charAt(0);
        if (quote !== "'" && quote !== '"' && quote !== String.fromCharCode(96)) continue;
        const closes = rest.indexOf(quote, 1);
        if (closes < 1 || closes > 81) continue;
        return rest.slice(1, closes).trim();
    }
    return undefined;
}

function resolvedTitleText(src: string, expression: string): string | undefined {
    if (expression.includes('.')) {
        const parts = expression.split('.');
        //  One hop, and only one: a.b.c is deeper than this proof can follow, so
        //  it stays unproven rather than guessing which object was meant.
        if (parts.length !== 2) return undefined;
        const body = objectLiteralOf(src, parts[0]);
        if (!body) return undefined;
        return literalAssignedTo(withoutComments(body), parts[1]);
    }
    return literalAssignedTo(withoutComments(src), expression);
}

export function titleEvidence(src: string, expected: string): boolean {
    const literal = escapeRegExp(expected);
    const BS = String.fromCharCode(92);
    const heading = new RegExp('<h[1-6]' + BS + 'b[^>]*>' + BS + 's*' + literal + '' + BS + 's*</h[1-6]>', 'iu');
    const docTitle = new RegExp('<title' + BS + 'b[^>]*>' + BS + 's*' + literal + '' + BS + 's*</title>', 'iu');
    if (heading.test(src) || docTitle.test(src)) return true;
    const bound = /<(?:h[1-6]|title)\b[^>]*>\s*\{\s*([A-Za-z_$][\w$.]*)\s*\}\s*<\/(?:h[1-6]|title)>/giu;
    for (const match of src.matchAll(bound)) {
        if (resolvedTitleText(src, match[1]) === expected) return true;
    }
    return false;
}

/**
 * The records engine STATES its totals instead of folding them in the view:
 * { label: '…', kind: 'sum', field: 'amount' } declared, computeMetric(m, rows)
 * rendered. Both halves are required — a declaration nothing renders is a plan,
 * and a render with nothing declared is a call with no total behind it.
 */
function declaredSumMetric(src: string): boolean {
    const clean = withoutComments(src);
    const declares = /kind\s*:\s*['"]sum['"][^}]{0,120}field\s*:\s*['"]/u;
    return declares.test(clean) && clean.includes('computeMetric(');
}

/** A fold that adds NUMBERS and reaches the screen under its own name. */
function numericFoldBindings(src: string): string[] {
    const clean = withoutComments(src);
    const names: string[] = [];
    const declared = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]{0,200}?\.reduce\s*\(/g;
    const seedsNumber = /,\s*-?\d+(?:\.\d+)?\s*\)/u;
    for (const match of clean.matchAll(declared)) {
        const body = clean.slice(match.index || 0, (match.index || 0) + 320);
        if (!body.includes('+')) continue;
        //  A string seed means plus is concatenation: the first version of this
        //  proof called a label join a total.
        if (body.includes("''") || body.includes('""')) continue;
        const coerces = body.includes('Number(') || body.includes('parseFloat(');
        if (!coerces && !seedsNumber.test(body)) continue;
        names.push(match[1]);
    }
    return names;
}

export function computedTotalEvidence(src: string): boolean {
    if (declaredSumMetric(src)) return true;
    return numericFoldBindings(src).some(name => {
        const n = escapeRegExp(name);
        const BS = String.fromCharCode(92);
        const shown = new RegExp('[{]' + BS + 's*' + n + '(?:' + BS + '.[A-Za-z_$][' + BS + 'w$]*' + BS + 's*' + BS + '([^)]*' + BS + '))?' + BS + 's*[}]', 'u');
        return shown.test(src);
    });
}

/**
 * Judge what was asked against what exists.
 *
 * Every «met» points at something real: a file, a flag that came from a
 * process, or a marker in the generated source. Nothing is met by default.
 */
export function judgeAcceptance(criteria: Criterion[], ev: Evidence, isAr = true): Acceptance {
    const dir = String(ev.dir || '');
    const src = dir && fs.existsSync(dir) ? sourceOf(dir) : '';

    const judged: JudgedCriterion[] = criteria.map(c => {
        const say = (verdict: Verdict, why: string): JudgedCriterion => ({ ...c, verdict, why });

        if (c.id === 'readme') {
            const has = !!dir && ['README.md', 'readme.md'].some(f => fs.existsSync(path.join(dir, f)));
            return has
                ? say('met', isAr ? 'README.md موجود في المشروع' : 'README.md is in the project')
                : say('unmet', isAr ? 'لم أكتب README' : 'no README was written');
        }
        if (c.id === 'production_build') {
            return ev.built
                ? say('met', isAr ? 'dist/index.html موجود على القرص' : 'dist/index.html exists on disk')
                : say('unmet', isAr ? 'لم تُبنَ نسخة إنتاج' : 'no production build was produced');
        }
        if (c.id === 'preview') {
            return ev.liveUrl
                ? say('met', isAr ? `خادم يعمل على ${ev.liveUrl}` : `a server is live at ${ev.liveUrl}`)
                : say('unmet', isAr ? 'لم يبقَ خادم معاينة يعمل' : 'no preview server was left running');
        }
        if (c.id === 'browser_check') {
            if (!ev.audit) return say('unmet', isAr ? 'لم يُجرَ أي فحص في المتصفح' : 'no browser check ran');
            if (ev.audit.skipped) {
                return say('unmet', isAr
                    ? `تعذّر تشغيل المتصفح (${ev.audit.skipped})`
                    : `the browser could not start (${ev.audit.skipped})`);
            }
            return say('met', isAr
                ? `فُحصت في متصفّح حقيقي — ${ev.audit.score}/100`
                : `checked in a real browser — ${ev.audit.score}/100`);
        }

        // A FEATURE is met when the generated source really contains it.
        if (!src) {
            return say('unprovable', isAr
                ? 'لا مصدر أستطيع قراءته لأثبت هذا'
                : 'no source to read, so nothing can be proven');
        }
        let hit: boolean;
        let counterProvedByTotal = false;
        if (c.id === 'counter') {
            hit = hasCounterEvidence(src);
            if (!hit && computedTotalEvidence(src)) { hit = true; counterProvedByTotal = true; }
        } else if (c.id === 'button') {
            hit = hasActionBoundButtonEvidence(src);
        } else if (c.id === 'status_message') {
            hit = hasStatusMessageEvidence(src);
        } else if (c.id === 'title' && c.expectedText) {
            hit = titleEvidence(src, c.expectedText);
        } else {
            hit = (c.markers || []).some(re => re.test(src));
        }
        if (hit) {
            const why = counterProvedByTotal
                ? (isAr ? 'مجموع محسوب من بياناتك ومعروض في الصفحة' : 'a total computed from your rows and shown on the page')
                : c.id === 'title' && c.expectedText
                ? (isAr ? `العنوان المطلوب «${c.expectedText}» موجود في مصدر المشروع` : `requested title “${c.expectedText}” is present in the generated source`)
                : (isAr ? 'موجود في مصدر المشروع' : 'present in the generated source');
            return say('met', why);
        }
        return say('unmet', isAr ? 'لا يوجد دليل فعلي كافٍ في المصدر المولَّد' : 'no sufficient behavioral evidence in the generated source');
    });

    const met = judged.filter(c => c.verdict === 'met').length;
    const unmet = judged.filter(c => c.verdict === 'unmet').length;
    return { criteria: judged, met, unmet, accepted: judged.length > 0 && unmet === 0 };
}

/**
 * The ledger, for the delivery message.
 *
 * Printed whenever the brief asked for anything at all — a clean ledger is
 * worth as much as a dirty one, because it is what makes the dirty one
 * believable.
 */
export function acceptanceBlock(a: Acceptance, isAr: boolean): string {
    if (!a.criteria.length) return '';
    const head = a.accepted
        ? (isAr
            ? `✅ حكم القبول الجزئي: أثبتُّ ${a.met} مما أعرف كيف أثبته — ولم أفحص بقية نص طلبك.`
            : `✅ Partial acceptance: I proved ${a.met} of what I know how to prove — I did not inspect the rest of your request.`)
        : (isAr
            ? `⚠️ حكم القبول الجزئي: أثبتُّ ${a.met} مما أعرف كيف أثبته — و${a.unmet} مما أعرف كيف أثبته لم أُثبته، ولم أفحص بقية نص طلبك:`
            : `⚠️ Partial acceptance: I proved ${a.met} things I know how to prove — ${a.unmet} things I know how to prove were not proven, and I did not inspect the rest of your request:`);
    const lines = a.criteria.map(c => {
        const mark = c.verdict === 'met' ? '✅' : c.verdict === 'unmet' ? '❌' : '⏭️';
        return `   ${mark} ${isAr ? c.ar : c.en} — ${c.why}`;
    });
    return [head, ...lines].join('\n');
}
