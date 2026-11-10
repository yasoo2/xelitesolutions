/**
 * ⛔ EACH KIND OF PRODUCT HAS ITS OWN JOURNEY, AND THE QA KNOWS WHICH ONE IT BUILT.
 *
 * The owner, 2026-11-10: «اختبار الجودة للمتجر غير اختبار الجودة لصفحة واجهة شركة …
 * لعيادة … تطبيق مثل فيسبوك … لكل واحد فيهم اختبار جودة مختص فيه حسب كيف النظام
 * اللي بناه». A walk that pressed every control of a shop and never proved that
 * a product reaches the cart has tested a shop's buttons, not a shop.
 *
 * The request says what was built (a store, a booking system, a social feed, a
 * chat, a records dashboard, a landing page) and which journeys it promised —
 * a cart, a checkout, a booking, a post, a like, a message, adding and removing
 * a record. Only a journey whose words are in the request is asked for: a shop
 * nobody asked a cart of is not refused for having none. Each journey is
 * proven, or not, on what the walk measured: a control that did its job
 * (qa-control-intent.ts), a form that was sent and saved, a QA record removed.
 *
 * Pure: judged on an audit's own counts and lists (app-audit AppAudit).
 */
import { detectAppKind } from '../design/app-blueprints';

export type ProductKind = 'store' | 'booking' | 'social' | 'chat' | 'learning' | 'records' | 'landing' | 'other';

export interface JourneyProof { proven: boolean; why: string }

export interface Journey {
    id: 'cart' | 'checkout' | 'booking' | 'post' | 'like' | 'message' | 'manage';
    ar: string;
    en: string;
    prove: (audit: any) => JourneyProof;
}

export interface ProductProfile { kind: ProductKind; ar: string; en: string; journeys: Journey[] }

const KIND_WORDS: Record<ProductKind, { ar: string; en: string }> = {
    store: { ar: 'متجر', en: 'a store' },
    booking: { ar: 'نظام حجز', en: 'a booking system' },
    social: { ar: 'شبكة اجتماعية', en: 'a social network' },
    chat: { ar: 'تطبيق محادثة', en: 'a chat app' },
    learning: { ar: 'منصة تعليم', en: 'a learning platform' },
    records: { ar: 'لوحة إدارة سجلات', en: 'a records dashboard' },
    landing: { ar: 'صفحة تعريفية', en: 'a landing page' },
    other: { ar: 'تطبيق', en: 'an application' },
};

const FORM_DONE = new Set(['submitted', 'refused']);
const formsOf = (audit: any): Array<{ label: string; effect: string; persisted?: boolean }> => Array.isArray(audit?.forms) ? audit.forms : [];
const metBy = (audit: any, intent: string) => Number(audit?.intentsMetBy?.[intent] || 0);
const missedBy = (audit: any, intent: string) => (Array.isArray(audit?.intentFailures) ? audit.intentFailures : []).filter((x: any) => x.intent === intent).length;

function formJourney(id: Journey['id'], ar: string, en: string, label: RegExp, needSaved: boolean): Journey {
    return {
        id, ar, en,
        prove: (audit: any) => {
            const forms = formsOf(audit).filter(f => label.test(String(f.label || '')));
            if (!forms.length) return { proven: false, why: 'no such form was found on any screen' };
            const sent = forms.filter(f => FORM_DONE.has(String(f.effect || '')));
            if (!sent.length) return { proven: false, why: `the form «${forms[0].label}» was not answered when sent` };
            if (needSaved && !sent.some(f => f.persisted)) return { proven: false, why: `«${sent[0].label}» was sent, and what it made was not found after a reload` };
            return { proven: true, why: `«${sent[0].label}» was filled, sent${needSaved ? ' and kept after a reload' : ''}` };
        },
    };
}

const JOURNEYS: Array<{ asked: RegExp | ((request: string) => boolean); journey: Journey }> = [
    {
        //  An Arabic word is bounded by Arabic letters, never by \b (which knows only Latin): «سلة» in «مع سلة», never in «سلسلة».
        asked: /\bcart\b|\bbasket\b|add to cart|(?<![؀-ۿ])(?:ال|و|بال|لل|وال)?سل[ةه](?![؀-ۿ])|عرب[ةه] التسوق/iu,
        journey: {
            id: 'cart', ar: 'الإضافة إلى السلة', en: 'adding to the cart',
            prove: (audit: any) => metBy(audit, 'add_to_cart') > 0
                ? { proven: true, why: 'an «add to cart» raised the cart\'s count' }
                : { proven: false, why: missedBy(audit, 'add_to_cart') ? 'an «add to cart» was pressed and the cart did not count it' : 'no «add to cart» control was found on any screen' },
        },
    },
    { asked: /checkout|\border\b|\bpay(?:ment)?\b|\bbuy\b|(?<![؀-ۿ])(?:و|ب|ال|بال|وال)?دفع(?![؀-ۿ])|ادفع|إتمام الطلب|الشراء|اطلب الآن/iu, journey: formJourney('checkout', 'إتمام الطلب والدفع', 'checking out', /checkout|order|pay|buy|purchase|place|confirm|complete|إتمام|اطلب|ادفع|دفع|شراء|تأكيد/iu, false) },
    { asked: /\bbook(?:ing)?\b|reserv|appointment|حجز|احجز|موعد|مواعيد/iu, journey: formJourney('booking', 'الحجز', 'booking', /book|reserv|appointment|schedule|احجز|حجز|موعد/iu, true) },
    { asked: /\bposts?\b|\bfeed\b|منشور|تدوين|الخلاصة/iu, journey: formJourney('post', 'نشر منشور', 'posting', /post|publish|share|tweet|نشر|انشر|شارك/iu, true) },
    {
        asked: /\blikes?\b|إعجاب|اعجاب|لايك/iu,
        journey: {
            id: 'like', ar: 'الإعجاب', en: 'liking',
            prove: (audit: any) => metBy(audit, 'toggle') > 0
                ? { proven: true, why: 'a like flipped its own state' }
                : { proven: false, why: missedBy(audit, 'toggle') ? 'a like was pressed and its state did not change' : 'no like control was found on any screen' },
        },
    },
    { asked: /\bchat\b|\bmessag|محادث|دردش|رسائل|رسالة/iu, journey: formJourney('message', 'إرسال رسالة', 'sending a message', /send|message|reply|إرسال|ارسل|أرسل|رد/iu, true) },
    {
        /*
         * Records a visitor adds and removes — never a cart's items. L161 (2026-11-10):
         * «a cart that adds and removes items» asked a water store to «add a record and
         * remove it», told with the delivery as a journey it had not proven.
         */
        asked: (request: string) => /manage|إدارة|ادارة/iu.test(request)
            || Array.from(request.matchAll(/(?:add|create|إضافة|اضافة)[\s\S]{0,40}(?:delete|remove|حذف)/giu))
                .some(m => !/\bcart\b|\bbasket\b|(?<![\u0600-\u06FF])(?:ال|و|بال|لل|وال)?سل[ةه](?![\u0600-\u06FF])/iu.test(request.slice(Math.max(0, (m.index || 0) - 40), (m.index || 0) + m[0].length))),
        journey: {
            id: 'manage', ar: 'إضافة سجل وحذفه', en: 'adding a record and removing it',
            prove: (audit: any) => {
                const saved = Number(audit?.formsPersisted || 0);
                const removed = Number(audit?.qaRecordsDeleted || 0);
                if (saved > 0 && removed > 0) return { proven: true, why: `${saved} record(s) were kept after a reload and the QA's own was removed` };
                if (saved > 0) return { proven: false, why: 'a record was kept after a reload, and the QA\'s own record could not be removed' };
                return { proven: false, why: 'no record the QA created was found after a reload' };
            },
        },
    },
];

function kindOf(request: string): ProductKind {
    const r = String(request || '');
    if (/like facebook|مثل فيسبوك|social network|شبكة اجتماعية|تواصل اجتماعي|news ?feed/iu.test(r)) return 'social';
    const app = detectAppKind(r);
    if (app === 'store' || app === 'pos') return 'store';
    if (app === 'booking') return 'booking';
    if (app === 'social') return 'social';
    if (app === 'chat') return 'chat';
    if (app === 'lms') return 'learning';
    if (/landing|صفحة هبوط|صفحة تعريفية|موقع تعريفي|portfolio/iu.test(r) && !/dashboard|لوحة تحكم|إدارة/iu.test(r)) return 'landing';
    if (/dashboard|admin|manage|لوحة تحكم|إدارة|ادارة/iu.test(r)) return 'records';
    return 'other';
}

/** What was built, and the journeys its request promised. */
export function productProfile(request: string): ProductProfile {
    const kind = kindOf(request);
    const r = String(request || '');
    const journeys = JOURNEYS.filter(j => typeof j.asked === 'function' ? j.asked(r) : j.asked.test(r)).map(j => j.journey);
    return { kind, ...KIND_WORDS[kind], journeys };
}

/** Each promised journey, proven or not, on what the walk measured. */
export function proveJourneys(profile: ProductProfile, audit: any): Array<{ id: string; ar: string; en: string } & JourneyProof> {
    return profile.journeys.map(j => ({ id: j.id, ar: j.ar, en: j.en, ...j.prove(audit) }));
}
