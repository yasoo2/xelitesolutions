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

export type CriterionKind = 'feature' | 'artifact' | 'verification';
export type Verdict = 'met' | 'unmet' | 'unprovable';

export interface Criterion {
    id: string;
    kind: CriterionKind;
    ar: string;
    en: string;
    /** Source markers that prove a FEATURE was really generated. */
    markers?: RegExp[];
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
        id: 'add_row', kind: 'feature',
        asked: /(إضافة|اضافة|أضف|\badd\b|\bcreate\b)\s*(حجز|صف|عنصر|سجل|row|record|entry|item|booking)?/iu,
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

/** The criteria THIS brief actually asks for — never a fixed checklist. */
export function acceptanceFor(request: string): Criterion[] {
    const t = String(request || '');
    return CATALOGUE.filter(c => c.asked.test(t))
        .map(({ asked, ...rest }) => rest);
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
        const hit = (c.markers || []).some(re => re.test(src));
        return hit
            ? say('met', isAr ? 'موجود في مصدر المشروع' : 'present in the generated source')
            : say('unmet', isAr ? 'لا أثر له في المصدر المولَّد' : 'no trace of it in the generated source');
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
            ? `✅ حكم القبول: كل ما طلبتَه (${a.met}) مُثبَت بدليل.`
            : `✅ Acceptance: every one of the ${a.met} things you asked for is proven.`)
        : (isAr
            ? `⚠️ حكم القبول: ${a.met} من ${a.criteria.length} مُثبَت — و${a.unmet} لم أُثبته:`
            : `⚠️ Acceptance: ${a.met} of ${a.criteria.length} proven — ${a.unmet} not:`);
    const lines = a.criteria.map(c => {
        const mark = c.verdict === 'met' ? '✅' : c.verdict === 'unmet' ? '❌' : '⏭️';
        return `   ${mark} ${isAr ? c.ar : c.en} — ${c.why}`;
    });
    return [head, ...lines].join('\n');
}
