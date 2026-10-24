import fs from 'fs';
import os from 'os';
import path from 'path';
import { requirementsFromRequestClauses } from '../core/quality/named-requirements';
import { namedEntities, alreadyOwned, listedReservedKeys } from '../core/design/named-entities';
import { featurePhrases, inferModel } from '../core/design/entity-inference';
import { brandFrom, brandFallback } from '../core/design/page-head';
import { requestedFeatures, uncoveredFeatures } from '../core/design/app-blueprints';
import { isPossessivePhrase } from '../core/design/request-lists';
import { ApiProjectTool, selectApiPrimary, unbuiltRequestedEntities } from '../modules/tools/definitions/ApiProjectTool';

/**
 * Eval round 15, 2026-10-24 (P101-api-ar) — a FALSE PASS:
 *
 *   «أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها
 *    نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز
 *    أخطاء صحيحة واختبارات آلية لكل نقطة.»
 *
 * Joe delivered «api-rest»: a stock bookings/orders API with no patient, no
 * appointment, no treatment and no test, and every gate passed it. Each
 * reader of the sentence lost it its own way — `\b` after Arabic verbs (zero
 * acceptance criteria), a three-word list item nobody unwrapped, «وصول» split
 * at its waw, deliverables read as tables, «REST» taken for the brand, and the
 * kind's own `bookings` table outranking the tables he listed.
 *
 * Every case is also run on a different domain in each language (the library
 * and school prompts of the same exam) so the fix is a reading of the
 * language, not of this clinic.
 */
const P101 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P105 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمكتبة عامة فيها نقاط وصول لـالكتب والإعارات والقراء، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P103 = 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـمطعم فيها نقاط وصول لـالأصناف والطلبات والطاولات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.';
const P102 = 'Create a REST API with Node.js and Express for a private school with endpoints for students, classes, grades, input validation, proper error codes, and automated tests for every endpoint.';
const P251 = 'Build a booking web app for a car rental company where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.';
const P252 = 'ابني تطبيق حجز لـمدرسة خاصة: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.';

const quotes = (request: string) => requirementsFromRequestClauses(request).map(r => r.quote);
const texts = (request: string) => requirementsFromRequestClauses(request).map(r => r.text);
const keys = (entities: Array<{ key: string }>) => entities.map(e => e.key);

describe('the requirement reader reads Arabic (JavaScript\'s \\b does not)', () => {
    it('P101 yields every listed resource and every requested quality', () => {
        expect(quotes(P101)).toEqual(expect.arrayContaining([
            'المرضى', 'المواعيد', 'العلاجات', 'التحقق من المدخلات', 'رموز أخطاء صحيحة', 'اختبارات آلية لكل نقطة',
        ]));
        // The interface head is carried to every resource it introduces.
        expect(texts(P101)).toEqual(expect.arrayContaining(['نقاط وصول لـالمرضى', 'نقاط وصول لـالمواعيد', 'نقاط وصول لـالعلاجات']));
    });
    it('the same reading on another Arabic domain and in English', () => {
        expect(quotes(P105)).toEqual(expect.arrayContaining(['الكتب', 'الإعارات', 'القراء', 'اختبارات آلية لكل نقطة']));
        expect(texts(P102)).toEqual(expect.arrayContaining([
            'endpoints for students', 'endpoints for classes', 'endpoints for grades',
            'input validation', 'proper error codes', 'automated tests for every endpoint',
        ]));
    });
    it('an Arabic imperative clause is a requirement, whichever alef it is written with', () => {
        expect(quotes('أضف مريضاً جديداً. احذف موعداً ملغى.')).toEqual(['أضف مريضاً جديداً', 'احذف موعداً ملغى']);
        expect(quotes('اضف مريضاً جديداً. إحذف موعداً ملغى.')).toEqual(['اضف مريضاً جديداً', 'إحذف موعداً ملغى']);
        // …and the ask itself is still not one, in any alef form.
        expect(quotes('إنشئ متجراً للعطور.')).toEqual([]);
    });
    it('a feature list after a colon keeps «عرض المنتجات بالصور والأسعار» whole', () => {
        const q = quotes('ابني متجر إلكتروني لـعيادة أسنان: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، ونموذج إتمام طلب مع التحقق من البيانات.');
        expect(q).toContain('عرض المنتجات بالصور والأسعار');
        expect(q).toContain('التحقق من البيانات');
        expect(q).not.toContain('الأسعار');
    });
});

describe('the list reader unwraps the interface head and keeps every item', () => {
    it('P101: patients, appointments and treatments — the unlisted noun too', () => {
        const read = namedEntities(P101);
        expect(keys(read).slice(0, 2)).toEqual(['patients', 'appointments']);
        expect(read).toHaveLength(3);
        expect(read[2].ar).toBe('العلاجات');
        expect(read[2].key).toMatch(/^[a-z][a-z0-9_]*$/);
    });
    it('another Arabic domain and English read the same way', () => {
        expect(namedEntities(P105).map(e => e.ar)).toEqual(['الكتب', 'الإعارات', 'القراء']);
        expect(keys(namedEntities(P102))).toEqual(['students', 'classes', 'grades']);
    });
    it('a listed table the system already serves proves the list but is not generated again', () => {
        expect(namedEntities(P103).map(e => e.ar)).toEqual(['الطاولات']);
        expect(listedReservedKeys(P103)).toEqual(['items', 'orders']);
        expect(alreadyOwned(P103)).toEqual(['الأصناف', 'الطلبيات']);
    });
    it('a list behind a plain opener still needs two recognised nouns, and a phrase is not a table', () => {
        expect(keys(namedEntities('a booking app with customers, staff and a calendar view'))).toEqual(['customers', 'employees']);
        expect(keys(namedEntities('a landing page with sections for about, services and contact'))).not.toContain('abouts');
        expect(namedEntities('API لعيادة فيها نقاط وصول لـالمرضى')).toEqual([]);
    });
});

describe('the shape reader: no waw cut, no deliverable tables, no catalogue columns on people', () => {
    it('«وصول» keeps its waw and the head is not a table', () => {
        const phrases = featurePhrases(P101);
        expect(phrases.join(' | ')).not.toMatch(/(?:^|\s)صول/u);
        expect(phrases).not.toContain('نقاط وصول');
        // …and without any head to take it off first: a root waw is not «and».
        expect(featurePhrases('نظام لعيادة: تسجيل وصول المرضى، المواعيد')).toContain('تسجيل وصول المرضى');
    });
    it('P101 infers exactly the three tables, keyed like the list reader keys them', () => {
        const model = inferModel(P101).entities;
        expect(keys(model).slice(0, 2)).toEqual(['patients', 'appointments']);
        expect(model).toHaveLength(3);
        expect(model[0].fields.map(f => f.key)).toContain('phone');
        expect(model[0].fields.map(f => f.key)).not.toContain('price');
        // A clinic sells nothing in this sentence: a treatment is not stock.
        expect(model[2].fields.map(f => f.key)).not.toEqual(expect.arrayContaining(['price']));
        expect(model[2].fields.map(f => f.key)).not.toContain('quantity');
    });
    it('validation, error codes and tests never become tables, in either language', () => {
        for (const request of [P101, P105, P102]) {
            for (const key of keys(inferModel(request).entities)) {
                expect(`${key}`).not.toMatch(/mdkhl|shyh|ikhtibar|test|code|endpoint|valid|nqt/);
            }
        }
    });
    it('a request that sells keeps the picture, the price and the quantity', () => {
        const candles = inferModel('my shop sells candles, soaps and gift boxes').entities.find(e => e.key === 'candles');
        expect(candles?.fields.map(f => f.key)).toEqual(expect.arrayContaining(['image', 'price', 'quantity']));
    });
});

describe('a Latin word in a technology position is not the brand', () => {
    it('P101 is not «REST», «Node.js» or «Express» — its name comes from the clinic', () => {
        expect(brandFrom(P101, true)).toBe('');
        expect(brandFallback(P101, true, 'landing')).toContain('العيادة');
    });
    it('a real Latin brand is still read, and the kind word is not said twice', () => {
        expect(brandFrom('ابني متجر Nova للعطور باستخدام React و Vite', true)).toBe('Nova');
        expect(brandFallback(P103, true, 'restaurant')).toBe('المطعم');
    });
});

describe('the stock API builds the tables he listed', () => {
    const bookings = { resource: 'bookings', labelAr: 'الحجوزات' };
    it('P101: his first table leads and the others are built beside it — not `bookings`', () => {
        const designed = namedEntities(P101);
        const sel = selectApiPrimary('booking', bookings, designed, P101);
        expect(sel.resource).toBe('patients');
        expect(sel.explicitKeys).toEqual(expect.arrayContaining(keys(designed)));
        expect(unbuiltRequestedEntities(sel.requestedEntities, sel.resource, designed.filter(e => e.key !== 'patients'))).toEqual([]);
    });
    it('a booking system that lists rooms and customers still stores bookings, beside them', () => {
        const request = 'ابني نظام حجوزات لفندق: الغرف والعملاء';
        const sel = selectApiPrimary('booking', bookings, namedEntities(request), request);
        expect(sel.resource).toBe('bookings');
        expect(sel.explicitKeys).toEqual(expect.arrayContaining(['rooms', 'customers']));
    });
    it('a request that lists nothing keeps the kind\'s table and no inferred extras', () => {
        const sel = selectApiPrimary('booking', bookings, [{ key: 'services', fields: [] }], 'Build a booking system for a salon');
        expect(sel.resource).toBe('bookings');
        expect(sel.explicitKeys).toEqual([]);
    });
    it('a listed table left out of the build is named, not dropped', () => {
        expect(unbuiltRequestedEntities(namedEntities(P101), 'patients', [{ key: 'appointments' }])).toEqual(['العلاجات']);
    });

    describe('end to end, offline', () => {
        let tmp: string;
        const savedSchema = process.env.JOE_AI_SCHEMA;
        beforeAll(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-his-list-')); process.env.JOE_AI_SCHEMA = '0'; });
        afterAll(() => {
            if (savedSchema === undefined) delete process.env.JOE_AI_SCHEMA; else process.env.JOE_AI_SCHEMA = savedSchema;
            fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
            delete (global as any).joeProjects?.['his-list-p101'];
        });
        it('api_project on P101 serves patients, appointments and treatments under the clinic\'s name', async () => {
            const res: any = await new ApiProjectTool().execute({ request: P101, skipInstall: true, root: tmp }, { sessionId: 'his-list-p101' });
            expect(res.ok).toBe(true);
            expect(res.output.resource).toBe('patients');
            expect(path.basename(res.output.path)).not.toMatch(/rest/i);
            const state = (global as any).joeProjects['his-list-p101'];
            const built = [state.resource, ...(state.model || []).map((e: any) => e.key)];
            expect(built).toEqual(expect.arrayContaining(['patients', 'appointments', namedEntities(P101)[2].key]));
            expect(built).not.toContain('bookings');
        }, 120_000);
        it('api_project on P103 builds the listed table the design did not carry', async () => {
            const res: any = await new ApiProjectTool().execute({ request: P103, skipInstall: true, root: tmp }, { sessionId: 'his-list-p103' });
            expect(res.ok).toBe(true);
            const state = (global as any).joeProjects['his-list-p103'];
            const built = [state.resource, ...(state.model || []).map((e: any) => e.key)];
            expect(built).toEqual(expect.arrayContaining([namedEntities(P103)[0].key]));
            delete (global as any).joeProjects?.['his-list-p103'];
        }, 120_000);
    });
});

describe('fields of an action are not capabilities of the app (P251, P252)', () => {
    it('«book with their name and phone» names no feature', () => {
        expect(requestedFeatures(P251)).toEqual([]);
        expect(uncoveredFeatures(P251, 'records', true, '').join(' | ')).not.toMatch(/their name/i);
    });
    it('the Arabic «ويحجز باسمه ورقم هاتفه» — and the same fields after «مع»', () => {
        expect(uncoveredFeatures(P252, 'records', true, '').join(' | ')).not.toMatch(/اسمه|هاتفه/u);
        expect(requestedFeatures('ابني تطبيق حجز لعيادة مع اسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.')).toEqual([]);
    });
    it('a real «with» feature list is still read, and a possessive is told from a spelling', () => {
        expect(requestedFeatures('Build a booking app with search, filters and CSV export.')).toEqual(['search', 'filters', 'CSV export']);
        expect(isPossessivePhrase('their name')).toBe(true);
        expect(isPossessivePhrase('باسمه ورقم هاتفه')).toBe(true);
        expect(isPossessivePhrase('مواعيدها')).toBe(true);
        // Informal ة written as ه on one word is not a possessive.
        expect(isPossessivePhrase('سله مشتريات')).toBe(false);
        expect(isPossessivePhrase('صفحه رئيسيه')).toBe(false);
    });
});
