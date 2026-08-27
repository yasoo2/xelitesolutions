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
import { namedRequirements } from '../core/quality/named-requirements';
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

/**
 * ⛔ AND THE GUARD ABOVE HAD THIS FILE'S OWN DEFECT IN IT.
 *
 * Everything above generates ids from `acceptanceFor()` and requires delivery
 * to admit them — which is right, and which is why the comment at
 * `ReactProjectTool.ts:294` says this check «would have caught it before it
 * reached him».
 *
 * It did not. Measured live on `f1958dc0`, in the owner's own Browser UI:
 *
 *     read from your request: 2 named — a responsive website · a service list with prices
 *     acceptance denominator: 2 (2 read from your request + 0 structural)
 *     Error: delivery_acceptance_unmapped:req-4fa,req-m72
 *
 * A SECOND producer now puts ids into `acceptance.criteria` — the request
 * reader — and this file enumerates the families of ONE. **The guard against
 * the second-writer defect had a second-writer defect**, and it is the same
 * shape as the seam it was written to protect: two lists that must agree, and
 * nothing making them.
 *
 * So the question it asks is changed. Not «are `acceptanceFor`'s families
 * admitted» but «is EVERY producer's». The block below is the second producer,
 * end to end, with no knowledge of how its ids are spelled — so a change to
 * that spelling is caught here rather than in front of him.
 */
describe('EVERY producer of an acceptance id, not merely the first one', () => {
    const HIS = 'Build a responsive website for a neighborhood bicycle repair studio called Spoke & Stem. Include a service list with prices, opening hours, location, phone CTA, and a booking form.';

    /** The reader, run for real, with the model stubbed to his own words. */
    const readHisRequest = () => namedRequirements(HIS, false, async () => JSON.stringify({
        requirements: [
            { text: 'a service list with prices', quote: 'a service list with prices' },
            { text: 'opening hours', quote: 'opening hours' },
            { text: 'a booking form', quote: 'a booking form' },
        ],
    }));

    it('⛔ the request reader produces ids delivery admits', async () => {
        const read = await readHisRequest();
        expect(read.requirements.length).toBeGreaterThan(0);
        const unknown = read.requirements.map(r => r.id).filter(id => !admitted(id));
        //  The ids in the message, because «some id is unknown» is the report
        //  that cost an hour the first time and a live run the second.
        expect(`unmapped:${unknown.join(',')}`).toBe('unmapped:');
    });

    it('the family is admitted by name, and carries no delivery topic', () => {
        //  `column:` and `page:` name things a delivery voice can speak about.
        //  A requirement he stated is not a topic — it IS the requirement — so
        //  an empty topic list is the correct answer and not an oversight.
        expect(admitted('req-4fa')).toBe(true);
        expect(admitted('req-m72')).toBe(true);
    });

    it('and a malformed member of that family is still refused', () => {
        //  Fail-closed survives the widening. Admitting `req-` on its own, or
        //  anything merely beginning with those letters, would trade a loud
        //  failure for a silent pass — the exact bargain this file refuses.
        expect(admitted('req-')).toBe(false);
        expect(admitted('req')).toBe(false);
        expect(admitted('request:1')).toBe(false);
    });
});
