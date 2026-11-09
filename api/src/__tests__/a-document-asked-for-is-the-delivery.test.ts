/**
 * A DOCUMENT ASKED FOR IS THE DELIVERY (select.ts asksForDocument, verify.ts deliveredDocuments).
 *
 * The Manus-style exam, 2026-11-09: M03's trip plan was written to one
 * Markdown file, as asked, and refused «no runnable project» — the delivery
 * checks wanted a live page; M01 and M02 passed only because the model built
 * a server and tests around a report and a CSV. Pinned: a report, a plan, a
 * sheet or slides asked for, with no page, site or app named, is a document;
 * the documents delivered are found with their words (README, Joe's own
 * certificate and machine folders aside); and the engine is told so.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { asksForDocument } from '../core/engine/select';
import { deliveredDocuments } from '../core/engine/verify';
import { systemPrompt } from '../core/engine/prompt';

jest.setTimeout(120_000);

test.each([
    ['ابحث عن سعر غرام الذهب عيار 21 اليوم في الأردن والسعودية والإمارات، واكتب لي تقريرًا قصيرًا فيه جدول بالأسعار وتاريخها ومصدر كل سعر.', true],
    ['قارن بين أفضل ثلاثة هواتف لعام 2026 من حيث السعر والكاميرا والبطارية، وضع المقارنة في ملف جدول بيانات (Excel أو CSV) مع عمود للمصدر.', true],
    ['خطط لي رحلة ثلاثة أيام إلى إسطنبول بميزانية 1000 دولار: أماكن حقيقية لكل يوم، ومصدر لكل معلومة. اجعلها في ملف واحد مرتب.', true],
    ['اعمل لي عرضًا تقديميًا من خمس شرائح عن استخدام الذكاء الاصطناعي في التعليم في الوطن العربي.', true],
    ['Research the gold price today and write a short report with a table and a source for each price.', true],
    ['ابحث عن خمسة مطاعم شاورما مشهورة في عمّان، واعمل صفحة ويب جميلة تعرضها مع رابط المصدر لكل مطعم.', false],
    ['Build a website for my bakery and put the menu in a PDF file too.', false],
    ['اعمل لي تطبيق مهام وضع البيانات في ملف CSV', false],
    ['ما هو ملف CSV؟', false],
])('«%s» is a document: %s', (text, doc) => {
    expect(asksForDocument(text)).toBe(doc);
});

test('the documents delivered are found with their words; README, the certificate and machine folders are not', async () => {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-doc-'));
    try {
        fs.writeFileSync(path.join(dir, 'istanbul-plan.md'), '# خطة إسطنبول\nاليوم الأول: آيا صوفيا — 25 يورو (المصدر: https://example.com)\n');
        fs.writeFileSync(path.join(dir, 'phones.csv'), 'phone,price,source\nA,1299,https://example.com\n');
        fs.writeFileSync(path.join(dir, 'README.md'), 'how to read this');
        fs.writeFileSync(path.join(dir, 'JOE-DELIVERY.md'), 'certificate');
        fs.mkdirSync(path.join(dir, '.joe'));
        fs.writeFileSync(path.join(dir, '.joe', 'notes.md'), 'machine');
        fs.writeFileSync(path.join(dir, 'empty.md'), '');
        const docs = await deliveredDocuments(dir);
        expect(docs.map(d => d.path).sort()).toEqual(['istanbul-plan.md', 'phones.csv']);
        expect(docs.find(d => d.path === 'istanbul-plan.md')!.words).toBeGreaterThan(5);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('the engine is told a document needs no server, package.json or tests', () => {
    expect(systemPrompt({ platform: 'win32', shell: 'powershell' })).toMatch(/A document needs no server, no package\.json and no tests/);
});
