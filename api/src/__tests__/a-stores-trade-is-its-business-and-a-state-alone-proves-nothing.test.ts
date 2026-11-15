/**
 * ⛔ THE SECOND REVIEW OF claude/r40-qa (cd4b7f111, 2026-11-15) — THE PURE RULES.
 *
 *   C1  a kept booking was «lost» because the page then POSTed /api/notifications, whose list is empty;
 *   C2  any state in the POST's answer («"status": "pending"») or a «Pending» badge switched the
 *       empty-list proof off for a 201 that kept nothing;
 *   C3  a review kept «pending» on a list of «approved» and «featured» was lost;
 *   B1  a POST to a record's own address (/api/items/1) was read as a create;
 *   C4  a store's trade («a discount store», «لمتجر خصومات», «a ticket marketplace») asked coupons, support…;
 *   C8  the QA's own asks excused the product's 404s at that address for the rest of the walk;
 *   C9  a clinic's or a school's real payment card lost its card cases;
 *   C10 routeBoundTo scanned a minified line whole for each match;
 *   C11 «invalid» stopped a retry beside a 502;
 *   5   «تم استلام طلبك بنجاح، يرجى الاحتفاظ برقم الطلب» was read as a refusal.
 * Each with its broken twin still caught.
 */
import { serverListVerdict, isVisibleFormRefusal, isExpectedRefusal, formEditedRecord, writeMadeRecord, recordIdOfUrl, answeredRecordId, refusalOnScreen } from '../core/quality/behaviour-audit';
import { meaningOf } from '../core/quality/qa-field-cases';
import { requestedCapabilities, capabilityReading, CAPABILITIES } from '../core/quality/scope-audit';
import { routeBoundTo } from '../core/quality/request-coverage';
import { transientModelFailure } from '../core/engine/loop';

const mark = 'mhx1-abcdea';
const at = 'http://localhost:5000/api/bookings';

describe('C1: the loss is judged on the form\'s own POST', () => {
    const booking = { at, body: JSON.stringify({ slot: '10:00', service: 'cut' }), method: 'POST', answer: '{"id":9,"slot":"10:00"}' };
    const notify = { at: 'http://localhost:5000/api/notifications', body: JSON.stringify({ type: 'booking', bookingId: 9 }), method: 'POST', answer: '{"ok":true}' };
    it('a kept booking followed by a notification POST whose list is empty is never lost', () => {
        const lists = [{ at, body: JSON.stringify([{ id: 9, slot: '10:00', service: 'cut' }]) }, { at: notify.at, body: '[]' }];
        expect(serverListVerdict([booking, notify], lists, '', 'Thanks')).toBe('');
        expect(serverListVerdict([booking, notify], lists, '', 'Thanks', ['cut', '10:00'])).toBe('');
        //  The notification carries none of the form's values: never judged, even first.
        expect(serverListVerdict([notify, booking], lists, '', 'Thanks', ['cut', '10:00'])).toBe('');
    });
    it('…and the same booking not kept, its own list empty, is still lost', () => {
        const lists = [{ at, body: '[]' }, { at: notify.at, body: '[]' }];
        expect(serverListVerdict([booking, notify], lists, '', 'Thanks', ['cut', '10:00'])).toBe('empty');
        expect(serverListVerdict([notify, booking], lists, '', 'Thanks', ['cut', '10:00'])).toBe('empty');
    });
});

describe('C2: an unfiltered empty list after a 201 is lost whatever state the answer gave', () => {
    const post = (answer: string) => [{ at, body: JSON.stringify({ name: 'Joe QA ' + mark, slot: '10:00' }), method: 'POST', answer }];
    it('a «"status": "pending"» answer, or a «Pending» badge on the page, no longer hides the loss', () => {
        expect(serverListVerdict(post('{"id":9,"status":"pending"}'), [{ at, body: '[]' }], mark, 'Booking #9\nJoe QA ' + mark + '\nPending')).toBe('empty');
        expect(serverListVerdict(post('{"id":9,"status":"new","active":true}'), [{ at, body: '[]' }], mark, 'Booked')).toBe('empty');
        expect(serverListVerdict(post('{"id":9}'), [{ at, body: '[]' }], mark, 'Booked')).toBe('empty');
    });
    it('…but a list asked with a filter, a record the server keeps unseen, or a sentence about its review proves nothing', () => {
        expect(serverListVerdict(post('{"id":9,"status":"pending"}'), [{ at: at + '?status=approved', body: '[]' }], mark)).toBe('');
        expect(serverListVerdict(post('{"id":9,"approved":false}'), [{ at, body: '[]' }], mark)).toBe('');
        expect(serverListVerdict(post('{"id":9,"status":"pending_review"}'), [{ at, body: '[]' }], mark)).toBe('');
        expect(serverListVerdict(post('{"id":9}'), [{ at, body: '[]' }], mark, 'Your booking is pending confirmation.')).toBe('');
        expect(serverListVerdict(post('{"id":9}'), [{ at, body: '[]' }], mark, 'Thanks! It will appear once it is approved.')).toBe('');
        expect(serverListVerdict(post('{"id":9,"message":"Your review is awaiting moderation"}'), [{ at, body: '[]' }], mark)).toBe('');
    });
});

describe('C3: a record kept in a state the list does not show is not lost', () => {
    const review = (answer: string) => [{ at: 'http://localhost:5000/api/reviews', body: JSON.stringify({ name: 'Joe QA ' + mark, text: 'ok ' + mark }), method: 'POST', answer }];
    const listed = (...states: string[]) => [{ at: 'http://localhost:5000/api/reviews', body: JSON.stringify(states.map((s, i) => ({ id: i + 1, name: `n${i}`, text: 'great', status: s }))) }];
    it('a review answered «pending» on a list of «approved» and «featured» is unmeasured', () => {
        expect(serverListVerdict(review('{"id":3,"status":"pending"}'), listed('approved', 'featured'), mark, 'Thank you for your review!')).toBe('');
    });
    it('…and the same list showing «pending» records, without this one, still proves it lost', () => {
        expect(serverListVerdict(review('{"id":3,"status":"pending"}'), listed('approved', 'pending'), mark, 'Thank you for your review!')).toBe('others');
    });
});

describe('B1: a POST is a create only to a collection that grew, or with a new id', () => {
    const seen = new Set(['1', '2']);
    it('reads the id of a record\'s own address and of an answer', () => {
        expect(recordIdOfUrl('http://x/api/items/1')).toBe('1');
        expect(recordIdOfUrl('http://x/api/items/1/update')).toBe('1');
        expect(recordIdOfUrl('http://x/api/items/65f1c2a9e4b0a1b2c3d4e5f6')).toBe('65f1c2a9e4b0a1b2c3d4e5f6');
        expect(recordIdOfUrl('http://x/api/items')).toBe('');
        expect(recordIdOfUrl('http://x/api/v1')).toBe('');
        expect(recordIdOfUrl('http://x/api/products/3/reviews')).toBe('');
        expect(answeredRecordId('{"data":{"updateMovie":{"id":"1"}}}')).toBe('1');
        expect(answeredRecordId('[{"id":7,"name":"x"}]')).toBe('7');
    });
    it('a prefilled form that POSTs a record\'s own address, or answers a record that was there, edited it', () => {
        const facts = { openedFilled: true, rowsGrew: false, seenIds: seen };
        expect(formEditedRecord([{ at: 'http://x/api/items/1', body: '{"name":"Joe QA m"}', method: 'POST', answer: '{"id":1,"name":"Joe QA m"}' }], 'm', facts).edited).toBe(true);
        //  GraphQL: one address for every write; the variables name the record.
        expect(formEditedRecord([{ at: 'http://x/graphql', body: '{"query":"mutation","variables":{"id":"5","name":"x"}}', method: 'POST', answer: '{"data":{"updateMovie":{"id":"5"}}}' }], 'm', facts).edited).toBe(true);
        //  The rows did not grow and the answer names no new record.
        expect(formEditedRecord([{ at: 'http://x/api/items', body: '{"id":2,"name":"x"}', method: 'POST', answer: '{"ok":true}' }], 'm', facts).edited).toBe(true);
    });
    it('…and a form that made a record — a collection that grew, a new id, an empty form\'s POST — is the QA\'s own', () => {
        expect(writeMadeRecord({ at: 'http://x/api/items', body: '{"name":"x"}', method: 'POST', answer: '{"id":3}' }, { openedFilled: true, rowsGrew: false, seenIds: seen })).toBe(true);
        expect(writeMadeRecord({ at: 'http://x/api/items', body: '{"name":"x"}', method: 'POST', answer: '{"ok":true}' }, { openedFilled: true, rowsGrew: true, seenIds: seen })).toBe(true);
        expect(writeMadeRecord({ at: 'http://x/api/items', body: '{"name":"x"}', method: 'POST', answer: '' }, { openedFilled: false, rowsGrew: false, seenIds: seen })).toBe(true);
        expect(formEditedRecord([{ at: 'http://x/api/items', body: '{"name":"x"}', method: 'POST', answer: '{"id":3}' }], 'm', { openedFilled: true, rowsGrew: false, seenIds: seen }).edited).toBe(false);
        //  A PUT that carried the QA's values is an edit, whatever else was sent.
        expect(formEditedRecord([{ at: 'http://x/api/items/1', body: '{"name":"Joe QA m"}', method: 'PUT' }], 'm', { openedFilled: false, rowsGrew: false, seenIds: seen }).edited).toBe(true);
    });
});

describe('C4: a store\'s trade is the business it is for (the review\'s table, as on the base)', () => {
    const ids = (r: string) => requestedCapabilities(r).map(c => c.id);
    it.each([
        ['Build a landing page for a discount store', 'coupons'],
        ['أنشئ صفحة هبوط لمتجر خصومات', 'coupons'],
        ['Build a website for a subscription box shop', 'subscriptions'],
        ['Build a landing page for a mobile app store', 'mobile_app'],
        ['Build a website for a ticket marketplace', 'support'],
        ['Build a landing page for a search platform startup', 'search'],
    ])('«%s» asks no %s', (request, id) => {
        expect(ids(request)).not.toContain(id);
        expect(ids(request)).toEqual([]);
    });
    it.each([
        ['Build a full-stack e-commerce website for a multi-vendor marketplace', 'multi_vendor'],
        ['Build the backend for an analytics platform with charts', 'analytics'],
        ['Build a REST API for a loyalty rewards platform', 'loyalty'],
        ['Create a website for a multilingual store', 'i18n'],
        ['ابني موقعاً لسوق متعدد البائعين', 'multi_vendor'],
        ['ابني واجهة خلفية لمنصة تحليلات مع رسوم بيانية', 'analytics'],
        ['Build a discount store with coupon codes at checkout', 'coupons'],
        ['Build a support platform for a ticket marketplace with support tickets', 'support'],
    ])('…while «%s» still asks %s', (request, id) => {
        expect(capabilityReading(CAPABILITIES.find(c => c.id === id)!, request)).toBe('asked');
    });
});

describe('C9: a real payment card keeps its cases in a clinic\'s or a school\'s form', () => {
    const F = (name: string, context: string) => ({ tag: 'input', type: 'text', name, context }) as any;
    it('a card paid with, beside its expiry and CVC, is a card', () => {
        expect(meaningOf(F('Card number', 'Book appointment Patient name Card number Expiry date CVC'))).toBe('card');
        expect(meaningOf(F('CVC', 'Book appointment Patient name Card number Expiry date CVC'))).toBe('cvc');
        expect(meaningOf(F('Card number', 'Student registration Student name Card number MM/YY CVC'))).toBe('card');
        expect(meaningOf(F('Card number', 'Staff training fees Employee name Card number Expiry Security code'))).toBe('card');
    });
    it('…and an insurance or a student card with no expiry and CVC beside it is still no payment card', () => {
        expect(meaningOf(F('Card number', 'Patient intake Patient name Insurance provider Card number'))).not.toBe('card');
        expect(meaningOf(F('Card number', 'Student registration Student name Card number Year'))).not.toBe('card');
    });
});

describe('C10: a minified line is read around each match, never whole for each', () => {
    const record = { item: 'العروض', key: 'shows', ar: 'العروض', en: 'shows' };
    it('a megabyte of one line with thousands of matches is read in well under a second or two', () => {
        const line = Array.from({ length: 40_000 }, (_, i) => `a${i}="/api/showtimes"`).join(';').slice(0, 1_000_000);
        expect(line.length).toBeGreaterThan(900_000);
        const started = Date.now();
        expect(routeBoundTo('showtimes', record, [line])).toBe(false);
        expect(Date.now() - started).toBeLessThan(3000);
    });
    it('…and his word beside the route, on its line or in its handler, still binds it', () => {
        expect(routeBoundTo('showtimes', record, ["test('GET /api/showtimes يعرض قائمة العروض', () => {});"])).toBe(true);
        expect(routeBoundTo('showtimes', record, ["app.get('/api/showtimes', (req, res) => {\n  if (!x) return notFound('العروض');\n});"])).toBe(true);
    });
});

describe('C11: «invalid» never stops a retry beside a gateway\'s status', () => {
    const e = (m: string) => new Error(m);
    it('«Invalid response from upstream: 502 Bad Gateway» is waited out', () => {
        expect(transientModelFailure(e('Invalid response from upstream: 502 Bad Gateway'))).toBe(true);
        expect(transientModelFailure(e('invalid JSON from gateway (503)'))).toBe(true);
        expect(transientModelFailure(e('Invalid upstream answer: service unavailable'))).toBe(true);
    });
    it('…while an invalid key, model or setting is never waited for', () => {
        expect(transientModelFailure(e('Invalid API key'))).toBe(false);
        expect(transientModelFailure(e('invalid model: claude-x-502'))).toBe(false);
        expect(transientModelFailure(e('Invalid request: max_tokens must be less than 503'))).toBe(false);
        expect(transientModelFailure(e('ECONNREFUSED 127.0.0.1:502'))).toBe(false);
    });
});

describe('the older rule of finding 5: a success that asks him to keep something is no refusal', () => {
    it('«تم استلام طلبك بنجاح، يرجى الاحتفاظ برقم الطلب» and its kind are a success', () => {
        expect(isVisibleFormRefusal('تم استلام طلبك بنجاح، يرجى الاحتفاظ برقم الطلب')).toBe(false);
        expect(isVisibleFormRefusal('شكراً لك! الرجاء الحضور قبل الموعد بعشر دقائق')).toBe(false);
        expect(isVisibleFormRefusal('Booking confirmed! You must arrive 10 minutes early.')).toBe(false);
    });
    it('…while a line asking him to enter or correct something still refuses, success word or not', () => {
        expect(isVisibleFormRefusal('يرجى إدخال رقم الجوال')).toBe(true);
        expect(isVisibleFormRefusal('لم يتم الحفظ بنجاح، يرجى إدخال البريد')).toBe(true);
        expect(isVisibleFormRefusal('الرجاء الاحتفاظ بالبيانات')).toBe(true);
        expect(isVisibleFormRefusal('Saved draft, but the email is invalid')).toBe(true);
        expect(isVisibleFormRefusal('الاسم مطلوب')).toBe(true);
    });
});

describe('C8 and C7: the QA\'s own asks, and a page read that throws', () => {
    it('an ask the QA made from inside the page excuses its 404 for a few seconds only', () => {
        const url = 'http://x/api/users/bb74';
        expect(isExpectedRefusal({ __joeQaAskedUrls: new Map([[url, Date.now() + 5000]]) }, 404, url, 'GET')).toBe(true);
        expect(isExpectedRefusal({ __joeQaAskedUrls: new Map([[url, Date.now() - 1]]) }, 404, url, 'GET')).toBe(false);
        expect(isExpectedRefusal({ __joeQaAskedUrls: new Map([[url, Date.now() + 5000]]) }, 404, 'http://x/api/users', 'GET')).toBe(false);
    });
    it('a page whose read throws, even at once, says no refusal and never throws', async () => {
        const throwsAtOnce = { evaluate: () => { throw new Error('Execution context was destroyed'); } };
        const rejects = { evaluate: () => Promise.reject(new Error('Target closed')) };
        await expect(refusalOnScreen(throwsAtOnce, 'form')).resolves.toEqual({ invalid: [], said: [], tied: [] });
        await expect(refusalOnScreen(rejects, 'form')).resolves.toEqual({ invalid: [], said: [], tied: [] });
        const reads = { evaluate: () => Promise.resolve({ invalid: ['email'], said: ['Email is invalid'], tied: [] }) };
        await expect(refusalOnScreen(reads, 'form')).resolves.toEqual({ invalid: ['email'], said: ['Email is invalid'], tied: [] });
    });
});
