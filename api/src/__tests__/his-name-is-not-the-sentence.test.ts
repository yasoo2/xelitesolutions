/**
 * HIS BUSINESS NAME IS NOT THE REST OF HIS SENTENCE.
 *
 * Traced backwards from a folder on disk:
 *
 *     data/projects/my-workspace/react-دار-الرفق-والهاتف-0501234567-وال-4071
 *     src/content.js →  brand: '«دار الرفق» والهاتف 0501234567 والعنوان…'
 *
 * The profile parser split on commas and newlines. He wrote one sentence
 * joined by waw, so nothing split: the `brand` label matched first and its
 * value ran to the end of the line, swallowing his phone and his address.
 * That corrupted name then became the project folder, the page <title> and
 * the hero of every build made afterwards — one missing separator, visible
 * in every artifact.
 *
 * The repo had already learned this shape once, in declared-tables: Arabic
 * glues its «و» to the next word, so the rule is «space + waw + an Arabic
 * letter» and never `\bو`, because `\b` is defined by `\w`. Here it is
 * narrowed one step further — the waw separates only where a LABEL follows —
 * so a business that genuinely has a waw in its name keeps it.
 */

import { parseProfileText } from '../core/profile/business-profile';

describe('a business profile written the way people write', () => {
    test('a sentence joined by waw yields separate fields, not one swallowed brand', () => {
        const out = parseProfileText(
            'احفظ بيانات عملي: اسم المطعم «دار الرفق» والهاتف 0501234567 والعنوان الرياض حي النخيل والبريد a@b.com',
        );
        expect(out.brand).toBe('«دار الرفق»');
        expect(out.phone).toBe('0501234567');
        expect(out.address).toBe('الرياض حي النخيل');
        expect(out.email).toBe('a@b.com');
        // The specific corruption that reached disk.
        expect(out.brand).not.toMatch(/0501234567|العنوان|والهاتف/);
    });

    test('and a name that legitimately carries a waw survives', () => {
        const out = parseProfileText('احفظ بيانات عملي: الاسم سعد وأحمد للتجارة والهاتف 0559876543');
        expect(out.brand).toBe('سعد وأحمد للتجارة');
        expect(out.phone).toBe('0559876543');
    });

    test('the comma form that already worked still works', () => {
        const out = parseProfileText('احفظ بيانات عملي: الاسم مطعم الريف، الجوال 0501234567، انستغرام reef_rest');
        expect(out.brand).toBe('مطعم الريف');
        expect(out.phone).toBe('0501234567');
        expect(out.instagram).toBe('reef_rest');
    });

    test('an English sentence joined by "and" splits too', () => {
        const out = parseProfileText('save my business: name Reef Grill and phone 0501234567');
        expect(out.brand).toBe('Reef Grill');
        expect(out.phone).toBe('0501234567');
    });

    test('a bare phone or email still lands where it belongs', () => {
        const out = parseProfileText('احفظ بيانات عملي: 0501234567، owner@example.com');
        expect(out.phone).toBe('0501234567');
        expect(out.email).toBe('owner@example.com');
    });
});
