/**
 * A STOREFRONT FOR A MAN WHO ASKED FOR A LEDGER.
 *
 * Measured live on the owner's machine. He typed, in his own words:
 *
 *     «بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر
 *      البيع … وبدي أبحث عن القطعة باسمها أو رقمها، وبدي يطلع لي تحت مجموع
 *      رأس المال ومجموع الربح المتوقع …»
 *
 * Five named fields, persistence, a search, two totals, a low-stock rule.
 * `detectAppKind` returned null, and the builder fell through to the marketing
 * scaffold. What he received: Navbar, Hero, Gallery, Testimonials, FAQ,
 * Location, «تسوق الآن», and a features list about Vite. The acceptance ledger
 * proved exactly one of his requirements — «بحث» — and nothing else existed.
 *
 * The cause was one condition. A generic records engine was available, but its
 * door demanded the words «نظام» or «تطبيق» next to «إدارة»; he had written
 * «صفحة أسجل فيها». A category noun is a LABEL. Recording rows, searching them
 * and totalling them is WORK — and the work is the stronger evidence about what
 * the page must be.
 *
 * Two independent signals are required, so that «سجّل دخولي» and «صفحة
 * تعريفية» stay outside.
 */
import { detectAppKind } from '../core/design/app-blueprints';
import { heroSecondaryDestination, sectionsForRequest } from '../modules/tools/definitions/ReactProjectTool';
import fs from 'node:fs';
import path from 'node:path';

const REACT_TOOL = path.resolve(__dirname, '../modules/tools/definitions/ReactProjectTool.ts');

/** The brief as the owner typed it, verbatim. */
const OWNER_BRIEF = 'أنا عندي محل قطع سيارات. بدي صفحة أسجل فيها كل قطعة: اسمها ورقمها والكمية وسعر الشراء وسعر البيع. لما أضيف قطعة تنحفظ وتضل موجودة لما أسكر الصفحة وأرجع أفتحها. وبدي أبحث عن القطعة باسمها أو رقمها، وبدي يطلع لي تحت مجموع رأس المال ومجموع الربح المتوقع، وإذا كمية قطعة صارت أقل من 3 يصير لونها أحمر عشان أنتبه.';

describe('INVARIANT: described work chooses the engine, not a category noun', () => {
    test('the brief that received a storefront now gets the records engine', () => {
        expect(detectAppKind(OWNER_BRIEF)).toBe('generic');
    });

    test('recording plus one more records signal is enough, without naming an app', () => {
        //  The invariant is that such a request never falls through to the
        //  marketing scaffold. A sharper domain archetype winning — «الأصناف»
        //  selecting `inventory` — is a better answer than `generic`, not a
        //  worse one, so the assertion is «some records engine», not one name.
        expect(detectAppKind('بدي صفحة أسجل فيها الأصناف ويطلع المجموع')).not.toBeNull();
        expect(detectAppKind('I want a page where I record every part and search by number')).not.toBeNull();
    });

    test('IS NOT VACUOUS: a recording verb alone proves nothing', () => {
        //  «سجّل دخولي» is a login, not a ledger.
        expect(detectAppKind('سجّل دخولي بالإيميل')).toBeNull();
    });

    test('IS NOT VACUOUS: pages that are ABOUT something stay outside', () => {
        expect(detectAppKind('اعمل لي صفحة تعريفية عن شركتي')).toBeNull();
        expect(detectAppKind('صفحة هبوط لتطبيق خرائط')).toBeNull();
    });

    test('and the domains that already had an archetype still win it', () => {
        expect(detectAppKind('اعمل لي صفحة فيها قائمة مهام')).toBe('tasks');
        expect(detectAppKind('اعمل لي صفحة أسجل فيها مصاريفي ويطلع المجموع')).toBe('expenses');
    });

    test('quality wording must not trigger the weather engine', () => {
        expect(detectAppKind('أنشئ صفحة اختبار الجودة فيها حقل بريد إلكتروني وزر إرسال')).toBeNull();
        expect(detectAppKind('ابني تطبيق طقس لمدينتي')).toBe('weather');
        expect(detectAppKind('اعمل تطبيق عن الجودة')).toBe('custom');
    });

    test('treats an email field and submit action as a real form section', () => {
        const sections = sectionsForRequest('أنشئ صفحة فيها حقل بريد إلكتروني وزر إرسال', 'landing');
        expect(sections).toContain('Contact');
        expect(sections).not.toContain('Features');
    });

    test('never chooses a dead generic CTA anchor', () => {
        expect(heroSecondaryDestination('landing', ['Hero', 'Contact'], false, true).href).toBe('#contact');
    });

    test('blocks catalogue acceptance when the request judge is blind', () => {
        const source = fs.readFileSync(REACT_TOOL, 'utf8');
        expect(source).toContain('judgeWasBlind && namedByHim.length > 0');
        expect(source).toContain('catalogue fallback is diagnostic only');
        expect(source).toContain('acceptance judge could not verify');
    });
});
