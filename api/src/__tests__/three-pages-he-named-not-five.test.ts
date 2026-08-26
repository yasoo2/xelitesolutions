/**
 * HE NAMED THREE PAGES. THE READER FOUND FIVE, AND TWO OF THEM WERE NONSENSE.
 *
 * Measured on his own request:
 *
 *     «… فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير.
 *      في صفحة المخزون اعمل جدول فيه … في صفحة التقارير اعرض إجمالي قيمة …»
 *
 *     thePagesHeNamed →
 *        المخزون · الموردين · «التقارير في» ·
 *        «المخزون اعمل جدول» · «التقارير اعرض إجمالي قيمة»
 *
 * Every one of those five became an acceptance criterion, so a build that had
 * done exactly what he asked reported itself short by two pages that were
 * never pages — and the two real repeats («المخزون», «التقارير») each took a
 * second slug, because deduplication compared SLUGS and an Arabic title has no
 * latin slug to compare.
 *
 * Two faults, both grammar rather than vocabulary:
 *
 *   1. A NAME ENDS WHERE A NEW INSTRUCTION BEGINS. The stop list knew «فيه»
 *      and «فيها» and not bare «في», and knew no imperative at all — so
 *      «اعمل» and «اعرض», his orders to Joe, were read as part of a page's
 *      name. A page name is a noun phrase; it stops at a preposition and it
 *      stops at a verb aimed at Joe.
 *
 *   2. A PAGE HE NAMED TWICE IS ONE PAGE. Its identity is the name he gave
 *      it, folded, and the slug comes after — not the other way round.
 *
 * Same class as everything else tonight: a decision taken from a fragment of
 * the sentence, and a comparison made on the wrong thing.
 */

import { thePagesHeNamed } from '../core/design/site-plan';
import { acceptanceFor } from '../core/quality/acceptance';

const HIS = 'ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة والكمية وسعر الشراء. في صفحة التقارير اعرض إجمالي قيمة المخزون. ولا تضف صفحة تسجيل دخول.';

const titles = (r: string) => thePagesHeNamed(r).map(p => p.title);

describe('the pages he named are the pages he named', () => {
    it('three sentences mentioning them yield three pages, in his words', () => {
        expect(titles(HIS)).toEqual(['المخزون', 'الموردين', 'التقارير']);
    });

    it('each page gets exactly one slug', () => {
        const slugs = thePagesHeNamed(HIS).map(p => p.slug);
        expect(new Set(slugs).size).toBe(slugs.length);
        expect(slugs).toHaveLength(3);
    });

    it('and the judge derives one criterion per page, not five', () => {
        //  The layer where the false pages actually hurt him: an unmeetable
        //  criterion turns a correct build into a reported failure.
        const pageIds = acceptanceFor(HIS).map(c => c.id).filter(id => id.startsWith('page:'));
        expect(pageIds).toHaveLength(3);
    });

    it('a name never swallows the order that follows it', () => {
        //  Each of the three garbage names, named individually so a partial
        //  fix cannot pass.
        const t = titles(HIS);
        expect(t).not.toContain('التقارير في');
        expect(t).not.toContain('المخزون اعمل جدول');
        expect(t.some(x => x.includes('اعرض'))).toBe(false);
    });
});

describe('and a real multi-word page name is still read whole', () => {
    it('«صفحة من نحن» and «صفحة اتصل بنا» keep their words', () => {
        //  The negative case: stopping at prepositions and imperatives must
        //  not clip a name that genuinely contains several words. If this
        //  breaks, the cure is worse than the disease.
        const t = titles('ابني موقع شركة فيه صفحة من نحن وصفحة اتصل بنا وصفحة خدماتنا');
        expect(t.length).toBeGreaterThanOrEqual(3);
        expect(t.join(' | ')).toContain('من نحن');
        expect(t.join(' | ')).toContain('اتصل بنا');
    });

    it('and a request naming no page yields none', () => {
        expect(thePagesHeNamed('اعمل جدول مبيعات فيه الاسم والسعر')).toEqual([]);
    });
});
