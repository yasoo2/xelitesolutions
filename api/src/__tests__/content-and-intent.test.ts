/**
 * Understanding what was asked for, and checking what was delivered.
 *
 * The normalisation tests exist because «انشيء» and «انشئ» are the same word to
 * every reader and to no regex, and a spelling gap once sent a build request to
 * the generic planner. The content-contract tests exist because a build shipped
 * a pricing section with no prices and testimonials with no names.
 */

import { normalizeIntentText } from '../core/orchestrator/promptNormalizer';
import { IntentParser } from '../core/intelligence/IntentParser';
import { extractRequirements, verifyContent, wireNavigation } from '../core/design/content-contract';
import { pickArchetype, pickTypePair, layoutCss, primitivesCss, iconSprite } from '../core/design/layouts';

describe('Arabic normalisation folds spellings a reader treats as identical', () => {
    const same = (a: string, b: string) => expect(normalizeIntentText(a)).toBe(normalizeIntentText(b));

    it.each([
        ['انشيء موقع', 'انشئ موقع', 'hamza on ya vs on the seat'],
        ['اعمل صفحه', 'اعمل صفحة', 'ta marbuta written as ha'],
        ['لشركه برمجيات', 'لشركة برمجيات', 'the same, with a prefix'],
        ['موقع بالوان زاهية', 'موقع بألوان زاهية', 'alef with and without hamza'],
    ])('%s == %s (%s)', (a, b) => same(a as string, b as string));

    it('does not fold words that are genuinely different', () => {
        expect(normalizeIntentText('متجر')).not.toBe(normalizeIntentText('مطعم'));
        expect(normalizeIntentText('احذف')).not.toBe(normalizeIntentText('اضف'));
    });

    it('leaves Latin text alone', () => {
        expect(normalizeIntentText('build an online store')).toContain('store');
    });

    it('is stable — normalising twice changes nothing', () => {
        const once = normalizeIntentText('انشيء متجر الكتروني لشركه');
        expect(normalizeIntentText(once)).toBe(once);
    });

    it('does not throw on empty or punctuation-only input', () => {
        expect(() => normalizeIntentText('')).not.toThrow();
        expect(() => normalizeIntentText('؟؟؟ !!!')).not.toThrow();
    });
});

describe('engineering briefs are not hijacked by the browser fast path', () => {
    const brief = `Build a complete production-grade software system from scratch in the GitHub repository.\nUse the browser only for visual QA and inspect the terminal while implementing the backend, frontend, database, tests, and deployment checks. Work from evidence, write real files, run local tests, and repair any verified failures.`;

    it('recognises a long build brief even when it mentions browser and GitHub', () => {
        expect(IntentParser.looksLikeEngineeringBrief(brief)).toBe(true);
    });

    it('does not return a Browser quick intent for the engineering brief', () => {
        expect(IntentParser.quickIntent(brief)).toBeNull();
    });

    it('keeps a short explicit URL request on the Browser fast path', () => {
        expect(IntentParser.quickIntent('افتح https://example.com')).toEqual(expect.objectContaining({
            suggestedAgent: 'Browser',
            requiredTools: ['browser_run'],
        }));
    });

    it('does not mistake an in-app search feature for a browser command', () => {
        expect(IntentParser.quickIntent('عندي مزرعة إبل. بدي سجل أسجل فيه بيانات الناقة: اسم الناقة والعمر والوزن، وبدي أبحث عن الناقة وأحسب الإجمالي')).toBeNull();
    });

    it('keeps a named site as a browser target even inside a build request', () => {
        expect(IntentParser.quickIntent('ابنِ أداة لإدارة عملي ثم افتح GitHub للمراجعة')).toEqual(expect.objectContaining({
            suggestedAgent: 'Browser',
            requiredTools: ['browser_run'],
        }));
    });
});

describe('extractRequirements reads what the user explicitly demanded', () => {
    it('picks up controls the user asked for by name', () => {
        const r = extractRequirements('اعمل صفحة فيها زر تسجيل الدخول وزر اتصل بنا');
        expect(r.buttons).toEqual(expect.arrayContaining(['تسجيل الدخول', 'اتصل بنا']));
    });

    it('requires a control only when the user actually said "زر"', () => {
        // Otherwise every page that merely mentions contact would be failed for
        // lacking a contact button.
        expect(extractRequirements('صفحة فيها معلومات للتواصل').buttons).toEqual([]);
        expect(extractRequirements('اعمل زر تواصل بنا').buttons).toContain('اتصل بنا');
    });

    it('notices when photographs were asked for', () => {
        expect(extractRequirements('اعمل صفحة فيها صور').wantsImages).toBe(true);
        expect(extractRequirements('اعمل لوحة تحكم').wantsImages).toBe(false);
    });

    it('demands nothing from a request that demands nothing specific', () => {
        const r = extractRequirements('اعمل صفحة جميلة');
        expect(r.buttons).toEqual([]);
        expect(r.wantsImages).toBe(false);
    });
});

describe('verifyContent catches what a build actually shipped', () => {
    const wrap = (body: string) => `<!DOCTYPE html><html lang="ar" dir="rtl"><body>${body}</body></html>`;

    it('flags a pricing section with no prices in it', () => {
        const issues = verifyContent(wrap(`
            <section id="pricing"><h2>الباقات</h2>
            <div class="card"><h3>الفضية</h3><p>مناسبة للأفراد</p></div>
            <div class="card"><h3>الذهبية</h3><p>للشركات</p></div></section>`), extractRequirements('صفحة أسعار'));
        expect(issues.map(i => i.code)).toContain('pricing_without_prices');
    });

    it.each([
        ['Latin digits', '299 ر.س', '599 ر.س'],
        ['Arabic-Indic digits', '٢٩٩ ر.س', '٥٩٩ ر.س'],
        ['Eastern Arabic-Indic digits', '۲۹۹ ريال', '۵۹۹ ريال'],
        ['a dollar sign', '$29', '$59'],
    ])('accepts a pricing section priced in %s', (_label, a, b) => {
        const issues = verifyContent(wrap(`
            <section id="pricing"><h2>الباقات</h2>
            <div class="card"><h3>الفضية</h3><strong>${a}</strong></div>
            <div class="card"><h3>الذهبية</h3><strong>${b}</strong></div></section>`), extractRequirements('صفحة أسعار'));
        expect(issues.map(i => i.code)).not.toContain('pricing_without_prices');
    });

    it('flags duplicated copy — three cards carrying one sentence with a word swapped', () => {
        const card = (last: string) =>
            `<div class="card"><p>نقدم خدمة متكاملة لعملائنا في جميع أنحاء المنطقة العربية بجودة ${last}</p></div>`;
        const issues = verifyContent(
            wrap(`<section>${card('عالية')}${card('ممتازة')}${card('رائعة')}</section>`),
            extractRequirements('صفحة'));
        expect(issues.map(i => i.code)).toContain('duplicated_copy');
    });

    it('flags placeholder contact details presented as real', () => {
        const issues = verifyContent(wrap('<footer><p>info@example.com</p><p>123-456-7890</p></footer>'), extractRequirements('صفحة تواصل'));
        expect(issues.map(i => i.code)).toContain('placeholder_contact');
    });

    it('flags a control the user asked for that was never built', () => {
        const issues = verifyContent(wrap('<section><h1>مرحبا</h1></section>'), extractRequirements('اعمل صفحة فيها زر تسجيل الدخول'));
        expect(issues.map(i => i.code)).toContain('missing_control');
    });

    it('is quiet when the control is actually there', () => {
        const issues = verifyContent(
            wrap('<section id="s"><h1>مرحبا</h1><a class="btn" href="#login">تسجيل الدخول</a></section>'),
            extractRequirements('اعمل صفحة فيها زر تسجيل الدخول'));
        expect(issues.map(i => i.code)).not.toContain('missing_control');
    });
});

describe('wireNavigation', () => {
    it('gives every section an id and points the nav at it', () => {
        const { html, fixed } = wireNavigation(`<!DOCTYPE html><html><body>
            <nav><a href="#">الخدمات</a><a href="#">تواصل</a></nav>
            <section><h2>الخدمات</h2></section><section><h2>تواصل</h2></section></body></html>`);
        expect(fixed.length).toBeGreaterThan(0);
        const ids = [...html.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map(m => m[1]);
        expect(ids.length).toBe(2);
        for (const id of ids) expect(html).toContain(`href="#${id}"`);
    });
});

describe('the injected layers are well-formed CSS and SVG', () => {
    it.each([
        ['layoutCss', () => layoutCss('split')],
        ['primitivesCss', () => primitivesCss()],
    ])('%s has balanced braces', (_n, make) => {
        const css = make();
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('the icon sprite defines every symbol the QA net names', () => {
        const sprite = iconSprite();
        for (const icon of ['check', 'arrow', 'star', 'shield', 'spark', 'users', 'code', 'chart', 'mail', 'phone', 'pin', 'clock', 'cart', 'menu', 'close']) {
            expect(sprite).toContain(`id="i-${icon}"`);
        }
        expect((sprite.match(/<symbol/g) || []).length).toBe((sprite.match(/<\/symbol>/g) || []).length);
    });

    it('composition and type are decided, not left to chance', () => {
        expect(pickArchetype('store', 'متجر عطور')).toBeTruthy();
        expect(pickTypePair('متجر عطور').display).not.toMatch(/Arial/);
        // Same brief, same decision.
        expect(pickArchetype('store', 'متجر عطور')).toBe(pickArchetype('store', 'متجر عطور'));
    });
});
