/**
 * THE READERS THAT RUN ON EVERY REQUEST STAY LINEAR — MEASURED IN CPU TIME.
 *
 * The third pre-merge review (2026-11-12), process.cpuUsage, one call each:
 *
 *     «بدي أعرف، » repeated             derivedColumns · columnsAnywhereInHisRequest · detectAppKind
 *                                        0.9 s at 2 KB · 2.0 s at 5 KB · 8.5–9 s at 20 KB
 *     «صلح الصفحة الرئيسية، » repeated  the same
 *     «أَصْلِحْ الزِّرَّ، » repeated      the same
 *
 * Nine tenths of it was one question asked once per list item: «does this
 * word open a behaviour?», answered by the language layer at about four
 * milliseconds a call (it stems its sixteen verbs again every time). The
 * layer is now asked only about a word that holds one of the eight roots, and
 * remembers its answer.
 *
 * Wall clock on a loaded machine says nothing, so the bound is on CPU time
 * (process.cpuUsage) and it is generous: the measured figures are 50–400 ms.
 */
import { derivedColumns, columnsAnywhereInHisRequest, detectAppKind } from '../core/design/app-blueprints';
import { saysAny } from '../core/language/arabic';

const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
let nonce = 0;
const cpuMs = (run: () => unknown): number => {
    const t0 = process.cpuUsage();
    run();
    const spent = process.cpuUsage(t0);
    return (spent.user + spent.system) / 1000;
};

const READERS: Array<[string, (text: string) => unknown]> = [
    ['derivedColumns', derivedColumns],
    ['columnsAnywhereInHisRequest', columnsAnywhereInHisRequest],
    ['detectAppKind', detectAppKind],
];
const UNITS = [
    'بدي أعرف، ',
    'صلح الصفحة الرئيسية، ',
    'أَصْلِحْ الزِّرَّ، ',
    'يطلع المجموع، ',
    'اسم الصنف، وأبغاه بالعربي، ',
    'نظام مخزون: اسم الصنف، الكمية، السعر\n',
    'نظام مخزون:\nاسم الصنف\n',
    'آخر تعديل، حذف الصنف، ',
];

beforeAll(() => {
    // Warm every lazy module and compiled pattern once, outside the measurement.
    for (const [, reader] of READERS) for (const unit of UNITS) reader(rep(unit, 400));
});

describe.each(READERS)('%s', (_name, reader) => {
    it.each(UNITS)('%j repeated to 20 KB: under 1.5 s of CPU', unit => {
        expect(cpuMs(() => reader(`${rep(unit, 20000)} ${nonce++}`))).toBeLessThan(1500);
    });

    it('a list under a colon with blank lines after it', () => {
        const text = `نظام مخزون: اسم الصنف، الكمية، السعر${rep('\n\n', 20000)} ${nonce++}`;
        expect(cpuMs(() => reader(text))).toBeLessThan(1500);
    });
});

describe('the cheap question gives the answers the language layer gave', () => {
    const VERBS = ['يطلع', 'تطلع', 'يحسب', 'تحسب', 'يظهر', 'تظهر', 'يعرض', 'تعرض', 'يجمع', 'تجمع', 'يرتب', 'ترتب', 'يبحث', 'تبحث', 'يطبع', 'تطبع'];
    const ROOTS = [...new Set(VERBS.map(verb => verb.slice(1)))];

    it('no word reads as one of the behaviour verbs without holding its root', () => {
        const words = new Set<string>();
        const before = ['', 'و', 'ف', 'ب', 'ل', 'ال', 'وال', 'س', 'سي', 'ي', 'ت', 'ن', 'ا'];
        const after = ['', 'ه', 'ها', 'هم', 'ون', 'ين', 'وا', 'ي', 'نا', 'ات', 'ني'];
        for (const root of ROOTS) for (const a of before) for (const b of after) words.add(a + root + b);
        for (const plain of ['المجموع', 'الصفحة', 'أعرف', 'الرئيسية', 'اسم', 'الكمية', 'تاريخ', 'مصاريفي', 'الزر', 'بدي', 'صلح', 'مطبوعات', 'عروض', 'ظاهرة']) words.add(plain);
        const missed = [...words].filter(word => saysAny(word, VERBS) && !ROOTS.some(root => word.includes(root)));
        expect(missed).toEqual([]);
    });

    it('a behaviour is still where the list ends, and a noun is still a column', () => {
        const columns = (text: string) => (derivedColumns(text) || []).map(column => String(column.label));
        expect(columns('اعمل لي صفحة أسجل فيها مصاريفي ويطلع المجموع')).not.toContain('يطلع المجموع');
        expect(columns('بدي جدول للمصاريف فيه التاريخ والمبلغ والسبب')).toEqual(['التاريخ', 'المبلغ', 'السبب']);
        expect(columns('بدي جدول فيه اسم الصنف والسعر ويحسب الإجمالي')).toEqual(['اسم الصنف', 'السعر']);
    });
});
