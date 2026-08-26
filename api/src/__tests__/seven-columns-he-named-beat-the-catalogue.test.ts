/**
 * HE NAMED SEVEN COLUMNS AND THE CATALOGUE GAVE HIM FIVE OF ITS OWN.
 *
 * Built by Joe on his machine, from the request he typed:
 *
 *     «… في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم القطعة والكمية وسعر
 *      الشراء وسعر البيع واسم المورد وتاريخ الإدخال …»
 *
 * What reached src/content.js:
 *
 *     الصنف · الرمز · الكمية · سعر الوحدة · الحالة
 *
 * Read it against what he wrote. «اسم القطعة» and «رقم القطعة» were renamed to
 * the archetype's words. «سعر الشراء» and «سعر البيع» — two different numbers,
 * and the whole point of the rule he attached to them — were MERGED into one
 * «سعر الوحدة». «اسم المورد» and «تاريخ الإدخال» disappeared. «الحالة» was
 * invented; he never asked for it. And no bound reached the schema, so «لا
 * تقبل كمية بالسالب» was lost with them.
 *
 * This is the fourth law failing at its own centre — «جو يبني من الطلب لا من
 * الكتالوج» — and the file already says so at the archetype branch: «AN
 * EXPLICIT LIST BEATS EVERY ARCHETYPE, WHATEVER THE DOMAIN LOOKS LIKE».
 *
 * The cause is not the archetype. `fieldsFromRequest` asked the single-shot
 * column reader, which returns null when an earlier list in the sentence wins
 * — here «نظاماً فيه ثلاث صفحات: …». Reading null as «he named no columns»,
 * the archetype was free to supply its own. One reader answering a question it
 * had already been taught to answer better, in the one place it decides
 * whether the request or the catalogue is the authority.
 */

import { fieldsFromRequest, blueprintFor } from '../core/design/app-blueprints';

const HIS_REQUEST = 'ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة ورقم القطعة والكمية وسعر الشراء وسعر البيع واسم المورد وتاريخ الإدخال. لا تقبل كمية بالسالب. أضف بحثاً وتصديراً إلى CSV.';

const HIS_SEVEN = ['اسم القطعة', 'رقم القطعة', 'الكمية', 'سعر الشراء', 'سعر البيع', 'اسم المورد', 'تاريخ الإدخال'];

const labelsOf = (fields: any[] | null) => (fields || []).map(f => String(f.label));

describe('the columns he named survive a request with other lists in it', () => {
    it('fieldsFromRequest returns his seven, in his words', () => {
        const labels = labelsOf(fieldsFromRequest(HIS_REQUEST, true));
        //  Named one by one: a length check passes on five canned columns too.
        expect(labels).toEqual(HIS_SEVEN);
    });

    it('and the two prices stay two — the merge is the expensive part', () => {
        //  «سعر الشراء» and «سعر البيع» merged into «سعر الوحدة» destroys the
        //  comparison he asked for. This is the assertion that would have
        //  caught it alone.
        const labels = labelsOf(fieldsFromRequest(HIS_REQUEST, true));
        expect(labels.filter(l => l.includes('سعر'))).toEqual(['سعر الشراء', 'سعر البيع']);
    });

    it('nothing he did not ask for is added', () => {
        //  «الحالة» came from the archetype. An invented column is a question
        //  he has to answer every time he adds a row.
        expect(labelsOf(fieldsFromRequest(HIS_REQUEST, true))).not.toContain('الحالة');
    });

    it('and the blueprint the app is generated from carries the same seven', () => {
        //  One layer further, where content.js is actually decided — a fix
        //  that stops before this is invisible on his screen.
        const bp: any = blueprintFor('generic' as any, HIS_REQUEST, true);
        expect(labelsOf(bp.fields)).toEqual(HIS_SEVEN);
    });
});

describe('and a request that names nothing still gets the archetype', () => {
    it('«بدي نظام مخزون» keeps the canned columns it always had', () => {
        //  The negative case, and the reason the archetype exists: when he
        //  names no columns there is nothing to override, and refusing to
        //  build would be worse than choosing sensibly.
        const fields = fieldsFromRequest('بدي نظام مخزون', true);
        expect(fields).toBeNull();
        const bp: any = blueprintFor('generic' as any, 'بدي نظام مخزون', true);
        expect((bp.fields || []).length).toBeGreaterThan(0);
    });
});
