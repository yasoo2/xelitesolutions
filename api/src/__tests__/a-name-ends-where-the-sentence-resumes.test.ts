/**
 * A NAME ENDS WHERE THE SENTENCE RESUMES.
 *
 * Names are bounded by sentence shape and function words, never by a catalogue
 * of business nouns. This keeps user identity intact while rejecting fragments
 * from the following clause.
 */

import { brandFrom, brandFallback } from '../core/design/page-head';

const brand = (text: string): string => {
    const isAr = /[\u0600-\u06FF]/.test(text);
    return brandFrom(text, isAr) || brandFallback(text, isAr, 'generic');
};

describe('the name comes from his words, and only the part that is a name', () => {
    it.each([
        ['quoted Arabic', 'اعمل لي متجر اسمه «بيت القهوة» فيه المنتجات', 'بيت القهوة'],
        ['bare Arabic', 'اعمل لي متجر اسمه بيت القهوة فيه المنتجات', 'بيت القهوة'],
        ['called + comma', 'Build a project called SpendWise, a personal expense tracker for one user.', 'SpendWise'],
        ['called + period', 'Build a small project called Gate062. Create one polished page titled Gate 062 with a heading.', 'Gate062'],
        ['named + and', 'Create an app named TaskFlow and make it responsive', 'TaskFlow'],
    ])('%s → %s', (_label, request, expected) => {
        expect(brand(request)).toBe(expected);
    });

    it.each([
        ['clinic', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد.', 'عيادة أسنان'],
        ['nursery', 'عندي مشتل نباتات. بدي كرّاسة أدوّن فيها الشتلات: اسم الشتلة والكمية والسعر', 'مشتل نباتات'],
        ['camel farm', 'أملك مزرعة إبل. بدي سجل أسجل فيه: اسم الناقة والعمر والوزن', 'مزرعة إبل'],
        ['English', 'I run a dental clinic. I want a table to record appointments: patient name, phone and amount paid', 'Dental Clinic'],
    ])('%s → %s', (_label, request, expected) => {
        expect(brand(request)).toBe(expected);
    });

    it.each([
        ['possessive pronoun', 'بدي صفحة أبحث فيها عن الزبون باسمه أو رقمه'],
        ['full live request', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.'],
    ])('%s does not name the project after the rest of the sentence', (_label, request) => {
        expect(brandFrom(request, true)).toBe('');
    });

    it('a request that names nothing and owns nothing falls back honestly', () => {
        expect(brand('بدي صفحة فيها عدّاد وزر')).toBe('مشروعي');
    });

    it('no brand ever contains a connective', () => {
        for (const request of [
            'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه، وبدي أبحث عن المريض باسمه أو تلفونه.',
            'Build a project called SpendWise, a personal expense tracker for one user.',
        ]) {
            expect(brand(request)).not.toMatch(/(?:^|\s)(?:أو|او|و|and|or|a|an|the)(?:\s|$)/);
        }
    });
});


describe('the Arabic lam boundary is measured in both directions', () => {
    it.each([
        ['للقهوة', 'ابنِ متجراً للقهوة المختصة', 'store', 'متجر القهوة'],
        ['للمأكولات', 'اعمل موقع مطعم للمأكولات البحرية', 'restaurant', 'مطعم المأكولات'],
        ['لبيع', 'بدي متجر لبيع القهوة فيه المنتجات', 'store', 'متجر القهوة'],
    ])('%s introduces a subject', (_label, request, kind, expected) => {
        expect(brandFallback(request, true, kind)).toBe(expected);
    });

    it('a bare «ل» on a recording verb still names nothing', () => {
        expect(brandFallback('بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد', true, 'generic')).toBe('مشروعي');
    });
});
