/**
 * A NAME ENDS WHERE THE SENTENCE RESUMES.
 *
 * Three separate defects, all measured live, all the same shape: a fragment
 * of his sentence became the name of his project, on his disk and in his
 * browser tab.
 *
 *   1. «…وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف…»
 *          → brand «ه أو تلفونه وبدي»
 *      «باسمه» is «by his name» — a possessive pronoun. The naming marker
 *      «اسمه» matched INSIDE it, with no word boundary, exactly the trap this
 *      repository already fixed for verbs («واجهة برمجية» → «برمج»).
 *
 *   2. «Build a project called SpendWise, a personal expense tracker…»
 *          → brand «SpendWise a personal expense»
 *      The marker was real; the name was not bounded. After it, the next
 *      sixty characters were taken whatever they were.
 *
 *   3. «عندي عيادة أسنان. بدي جدول أسجل فيه…»
 *          → brand «مشروع الأسجل»
 *      A BARE «ل» in the subject patterns is a preposition that attaches to
 *      any word — here to the verb «أسجل» — and the first thing it touched
 *      became the subject of his project.
 *
 * The repairs are shape-based, not vocabulary-based:
 *   · a marker must be a whole word;
 *   · a name stops at punctuation, at a function word that resumes the
 *     sentence, or after four words — function words are a CLOSED class,
 *     unlike nouns, so bounding a name by them consults no catalogue;
 *   · a bare «ل» is removed rather than patched, and what replaces it is what
 *     he states outright: «عندي X», «أملك X», «I run a X».
 *
 * The camel-farm case matters most: no list in this repository contains
 * «إبل». If it names itself correctly, no catalogue was consulted.
 */

import { brandFrom, brandFallback } from '../core/design/page-head';

const brand = (text: string): string => {
    const isAr = /[\u0600-\u06FF]/.test(text);
    return brandFrom(text, isAr) || brandFallback(text, isAr, 'generic');
};

describe('the name comes from his words, and only the part that is a name', () => {
    // POSITIVE — an explicit name, quoted or bare, in either language.
    it.each([
        ['بعلامات اقتباس', 'اعمل لي متجر اسمه «بيت القهوة» فيه المنتجات', 'بيت القهوة'],
        ['بلا علامات', 'اعمل لي متجر اسمه بيت القهوة فيه المنتجات', 'بيت القهوة'],
        ['called + فاصلة', 'Build a project called SpendWise, a personal expense tracker for one user.', 'SpendWise'],
        ['called + نقطة', 'Build a small project called Gate062. Create one polished page titled Gate 062 with a heading.', 'Gate062'],
        ['named + and', 'Create an app named TaskFlow and make it responsive', 'TaskFlow'],
    ])('%s → %s', (_label, request, expected) => {
        expect(brand(request)).toBe(expected);
    });

    // POSITIVE — no name given, but he says what he has. Trades that are in no list.
    it.each([
        ['عيادة', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد.', 'عيادة أسنان'],
        ['مشتل', 'عندي مشتل نباتات. بدي كرّاسة أدوّن فيها الشتلات: اسم الشتلة والكمية والسعر', 'مشتل نباتات'],
        ['مزرعة إبل', 'أملك مزرعة إبل. بدي سجل أسجل فيه: اسم الناقة والعمر والوزن', 'مزرعة إبل'],
        ['English', 'I run a dental clinic. I want a table to record appointments: patient name, phone and amount paid', 'Dental Clinic'],
    ])('%s → %s', (_label, request, expected) => {
        expect(brand(request)).toBe(expected);
    });

    // NEGATIVE — a possessive pronoun is not an introduction.
    it.each([
        ['باسمه داخل الجملة', 'بدي صفحة أبحث فيها عن الزبون باسمه أو رقمه'],
        ['الطلب الحيّ كاملاً', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.'],
    ])('%s does not name the project after the rest of the sentence', (_label, request) => {
        expect(brandFrom(request, true)).toBe('');
    });

    // NEGATIVE — nothing to go on is honest, not invented.
    it('a request that names nothing and owns nothing falls back honestly', () => {
        expect(brand('بدي صفحة فيها عدّاد وزر')).toBe('مشروعي');
    });

    // NEGATIVE — the fragment that shipped must never come back.
    it('no brand ever contains a connective', () => {
        for (const request of [
            'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه، وبدي أبحث عن المريض باسمه أو تلفونه.',
            'Build a project called SpendWise, a personal expense tracker for one user.',
        ]) {
            expect(brand(request)).not.toMatch(/(?:^|\s)(?:أو|او|و|and|or|a|an|the)(?:\s|$)/);
        }
    });
});
