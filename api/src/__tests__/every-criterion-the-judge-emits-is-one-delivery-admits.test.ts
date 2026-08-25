/**
 * HIS COLUMNS WERE RIGHT ON SCREEN, AND THE RULE HE STATED KILLED THE DELIVERY.
 *
 * Seen in front of the owner, on a clean session, from one sentence:
 *
 *     «اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ ولا تقبل مبلغًا صفرًا»
 *
 *     preview:  اسم العميل * · المبلغ * · التاريخ · أضف · تصدير CSV   ← correct
 *     chat:     Failed phase: Interface on the service
 *               Error: delivery_acceptance_unmapped:rule:1,rule:2,rule:3
 *
 * The delivery layer keeps a deliberately narrow list of acceptance ids so an
 * unknown one fails loudly instead of passing as something nobody checked.
 * That instinct is right. But the list named `column:` alone, and the same day
 * the judge learned to read PAGES he names and RULES he states, both new
 * families were unknown to it — so a build that had done everything asked of
 * it threw on the way to reporting that.
 *
 * This is the joining class, and it is about a SEAM rather than a reader: two
 * lists that must agree, maintained in two files, with nothing making them.
 * The judge's vocabulary grows on one side and the delivery's on the other.
 *
 * So the two are compared here, by generating criteria from real requests and
 * requiring every id to be one delivery admits. It fails when they drift,
 * which is the only moment it matters.
 */

import { acceptanceFor } from '../core/quality/acceptance';
import * as fs from 'fs';
import * as path from 'path';

/**
 * The admitting side, read from the source it lives in.
 *
 * Read rather than imported because `isKnownAcceptanceId` is module-private
 * and exporting it only for a test would change the shape of the thing under
 * test. The patterns are what matter and they are unambiguous on the page.
 */
const DELIVERY = (() => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
    const at = src.indexOf('const DYNAMIC_ACCEPTANCE_ID');
    const end = src.indexOf('];', at);
    const block = at < 0 ? '' : src.slice(at, end);
    const dynamic = [...block.matchAll(/\/\^([^/]+)\/[a-z]*,/g)].map(m => new RegExp('^' + m[1]));
    const topics = src.slice(src.indexOf('ACCEPTANCE_TOPIC_IDS'), src.indexOf('};', src.indexOf('ACCEPTANCE_TOPIC_IDS')));
    const fixed = new Set([...topics.matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1]));
    return { dynamic, fixed };
})();

const admitted = (id: string) => DELIVERY.fixed.has(id) || DELIVERY.dynamic.some(re => re.test(id));

/** Requests that between them exercise every family the judge can read. */
const REQUESTS = [
    'اعمل جدول فواتير فيه اسم العميل والمبلغ والتاريخ ولا تقبل مبلغًا صفرًا',
    'اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف',
    'ابني موقع شركة فيه صفحة من نحن وصفحة خدمات وصفحة اتصل بنا',
    'اعمل موقع مطعم واجعل التصميم داكنًا ولا تضف صفحة تسجيل دخول',
    'اعمل جدول موظفين فيه الاسم والراتب والقسم مع بحث وتصدير',
    'Build a small project called Gate062. Create one polished page titled Gate 062 with a heading, a short status message, and a button that increments a visible counter. Run the real build and open the live preview. Do not modify existing projects.',
    'اعمل صفحة سياسة الخصوصية وصفحة الشروط',
    'اعمل متجر فيه صفحة المنتجات وصفحة الشحن والاسترجاع',
];

describe('the delivery admits every criterion the judge can emit', () => {
    it('the two lists were both found — an empty comparison proves nothing', () => {
        expect(DELIVERY.fixed.size).toBeGreaterThan(5);
        expect(DELIVERY.dynamic.length).toBeGreaterThanOrEqual(3);
    });

    it.each(REQUESTS.map(r => [r]))('%s', (request) => {
        const ids = acceptanceFor(request).map(c => c.id);
        const unknown = ids.filter(id => !admitted(id));
        //  The message carries the ids, because «some id is unknown» is the
        //  report that made this take an hour to find the first time.
        expect(`unmapped:${unknown.join(',')}`).toBe('unmapped:');
    });

    it('and the three request-derived families are each admitted by name', () => {
        //  Named one by one rather than as a count: a list that admits three
        //  of four families passes a count and fails a person.
        expect(admitted('column:money1')).toBe(true);
        expect(admitted('page:contact')).toBe(true);
        expect(admitted('rule:1')).toBe(true);
    });

    it('while a genuinely unknown id still fails loudly', () => {
        //  The narrowness is the point. Widening this to «anything with a
        //  colon» would turn a loud failure into a silent pass, which is the
        //  defect this list exists to prevent.
        expect(admitted('whatever:1')).toBe(false);
        expect(admitted('column:')).toBe(false);
        expect(admitted('rule:abc')).toBe(false);
    });
});
