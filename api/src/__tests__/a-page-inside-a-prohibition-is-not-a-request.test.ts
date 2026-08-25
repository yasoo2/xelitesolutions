/**
 * HE SAID «DO NOT ADD A LOGIN PAGE», AND THAT IS HOW JOE LEARNED TO ADD ONE.
 *
 *     «اعمل موقع محل زهور ولا تضف صفحة تسجيل دخول»
 *       →  thePagesHeNamed: «تسجيل دخول»
 *
 * The page reader looked for «صفحة» anywhere in the sentence and took the
 * words after it. The one page he explicitly refused therefore became the page
 * most likely to be built — a negation read as a request, which is worse than
 * ignoring him, because ignoring him at least does nothing.
 *
 * Measured across a thousand requests: fifteen conditional requests carried a
 * page name inside their own negation. None of them built it only because they
 * named just one page and the plan stays single-page below two — a floor put
 * there for an unrelated reason, which is not a guard, it is luck.
 *
 * And beside it, the smaller misread:
 *
 *     «اعمل صفحة بخلفية زرقاء»  →  a page called «بخلفية زرقاء»
 *
 * «بخلفية» is «ب» glued to a noun — «with a background». A description of the
 * page, read as its name.
 *
 * Both are fixed by the same reader the rule layer already uses. A second
 * opinion about where a clause begins is how one sentence gets two readers.
 */

import { thePagesHeNamed, planSite } from '../core/design/site-plan';

const fold = (s: string) => s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');

const named = (r: string) => thePagesHeNamed(fold(r)).map(p => p.slug);
const built = (r: string) => planSite('landing', r, true).pages.map(p => p.file);

describe('a page inside a prohibition is not a page he asked for', () => {
    it.each([
        'اعمل موقع محل زهور ولا تضف صفحة تسجيل دخول',
        'اعمل موقع ولا تضف صفحة الأسعار',
        'ابنِ موقعًا ولا تضع صفحة تسجيل الدخول',
    ])('%s', (request) => {
        expect(named(request)).toEqual([]);
        expect(built(request)).toEqual(['index.html']);
    });

    it('and the pages he DID ask for in the same sentence survive', () => {
        //  The prohibition is skipped, not the sentence. This is the case that
        //  a blanket «ignore requests containing لا» would have broken.
        const r = 'اعمل موقع فيه صفحة من نحن وصفحة تواصل ولا تضف صفحة تسجيل دخول';
        expect(named(r)).toEqual(['about', 'contact']);
        expect(built(r)).toEqual(['index.html', 'about.html', 'contact.html']);
    });

    it('two forbidden pages do not become a two-page site', () => {
        //  The floor of two is why the single case never built. Two negated
        //  pages would have cleared it — this is the case that had no guard
        //  at all, only luck.
        const r = 'اعمل موقع ولا تضف صفحة تسجيل دخول ولا تضف صفحة الأسعار';
        expect(named(r)).toEqual([]);
        expect(planSite('landing', r, true).multiPage).toBe(false);
    });
});

describe('a page he named is never deleted to avoid inventing one', () => {
    /**
     *  A rule was written here to stop «صفحة بخلفية زرقاء» being read as a
     *  page called «بخلفية زرقاء» — reject a first token shaped «ب + noun».
     *  Its own negative case killed it, and these are that case: «بطاقات» is
     *  one word beginning with the same letter, and the rule would have
     *  dropped a page he asked for.
     *
     *  Kept as a test rather than deleted with the rule, because the trade is
     *  the finding: inventing a bad TITLE for a single page is cheap, and
     *  silently removing a page from a plan is not.
     */
    it('a real name that merely starts with ب survives', () => {
        const r = 'اعمل موقع فيه صفحة بطاقات الهدايا وصفحة تواصل';
        expect(named(r)).toContain('contact');
        expect(named(r).length).toBeGreaterThanOrEqual(2);
    });

    it('«من نحن» keeps its «من» — that is a word, not a glued preposition', () => {
        expect(named('اعمل موقع فيه صفحة من نحن وصفحة تواصل')).toEqual(['about', 'contact']);
    });

    it('and the descriptive misread is still only ever ONE page, never a site', () => {
        //  The cost of having no rule, measured and bounded: a poor title on
        //  a single-page build, and nothing more.
        expect(planSite('landing', 'اعمل صفحة بخلفية زرقاء ولون أزرق فاتح', true).multiPage).toBe(false);
    });
});

describe('the map is read in the fold the input arrives in', () => {
    it('«الأسئلة الشائعة» is faq, not a page filed under a letter', () => {
        //  Every entry in the slug map is spelled with «ه»; the probe reaching
        //  the reader has folded only diacritics, hamzas and alif maqsura, so
        //  «الأسئلة الشائعة» kept its ة and matched nothing. Measured: 25 real
        //  multi-page plans came back with a `page-a` between `services` and
        //  `contact`.
        expect(built('اعمل موقع متجر ملابس فيه صفحة خدمات وصفحة الأسئلة الشائعة'))
            .toEqual(['index.html', 'services.html', 'faq.html']);
    });

    it.each([
        ['اعمل موقع فيه صفحة قائمة الطعام وصفحة الحجز', ['index.html', 'menu.html', 'reservations.html']],
        ['اعمل موقع فيه صفحة المدونة وصفحة الأعمال', ['index.html', 'blog.html', 'work.html']],
        ['اعمل موقع فيه صفحة نبذة وصفحة تواصل معنا', ['index.html', 'about.html', 'contact.html']],
    ])('%s', (request, files) => {
        expect(built(request)).toEqual(files);
    });
});
