/**
 * WORK WHOSE RESULT IS A FILE IS BUILT (select.ts asksForDeliverable).
 *
 * The Manus-style exam, 2026-11-09: «قارن … وضع المقارنة في ملف جدول بيانات»
 * was answered in the chat with no file; «خطط لي رحلة … اجعلها في ملف واحد
 * مرتب» reached the old planner, which asked «حدّد هدف project_planner قبل
 * التنفيذ: projectDescription»; a five-slide deck and «اعمل صفحة ويب جميلة»
 * were not read as work. Pinned: every task of that exam, and their English
 * twins, are work for the engine; a question about files, a greeting and a
 * device command are not.
 */
import fs from 'fs';
import path from 'path';
import { asksForDeliverable } from '../core/engine/select';

const MANUS = [
    'ابحث عن سعر غرام الذهب عيار 21 اليوم في الأردن والسعودية والإمارات، واكتب لي تقريرًا قصيرًا فيه جدول بالأسعار وتاريخها ومصدر كل سعر.',
    'قارن بين أفضل ثلاثة هواتف لعام 2026 من حيث السعر والكاميرا والبطارية، وضع المقارنة في ملف جدول بيانات (Excel أو CSV) مع عمود للمصدر.',
    'خطط لي رحلة ثلاثة أيام إلى إسطنبول بميزانية 1000 دولار: أماكن حقيقية لكل يوم، وأسعار تقريبية للدخول والمواصلات والأكل، ومصدر لكل معلومة. اجعلها في ملف واحد مرتب.',
    'اعمل لي عرضًا تقديميًا من خمس شرائح عن استخدام الذكاء الاصطناعي في التعليم في الوطن العربي، بأرقام حديثة ومصادر في الشريحة الأخيرة.',
    'ابحث عن خمسة مطاعم شاورما مشهورة في عمّان مع عناوينها وتقييماتها، واعمل صفحة ويب جميلة تعرضها مع رابط المصدر لكل مطعم.',
    'ما أفضل ثلاثة حواسيب محمولة للطلاب في 2026 بسعر أقل من 800 دولار؟ اكتب توصية لكل واحد مع مواصفاته وسعره ومصدره، في ملف.',
    'Compare the three best phones of 2026 by price, camera and battery, and put the comparison in a spreadsheet with a source column.',
    'Make me a five-slide presentation about AI in education in the Arab world, with recent numbers.',
    'Research the gold price today and write a short report with a table and a source for each price.',
];

describe('work whose result is a file is built', () => {
    test.each(MANUS)('«%s» is built', text => {
        expect(asksForDeliverable(text)).toBe(true);
    });

    test('every task of the exam on this machine is built', () => {
        const file = path.resolve(__dirname, '..', '..', '..', '..', '..', 'eval', 'manus', 'manus8.json');
        let prompts: string[] = [];
        try { prompts = JSON.parse(fs.readFileSync(file, 'utf8')).prompts.map((p: any) => String(p.text)); } catch { /* the exam lives beside the repository on the owner's machine only */ }
        for (const p of prompts) expect([p, asksForDeliverable(p)]).toEqual([p, true]);
    });

    test.each([
        'ما هو ملف CSV؟',
        'What is a PDF file and how is it different from Word?',
        'explain how excel formulas work please',
        'مرحبا جو كيف حالك اليوم',
        'شغل الكشاف في هاتفي',
        'ما الفرق بين ملف pdf وملف docx',
    ])('«%s» is not', text => {
        expect(asksForDeliverable(text)).toBe(false);
    });
});
