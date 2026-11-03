/**
 * Half of a two-part edit is never dropped in silence.
 *
 * Round 21 second review (W1), measured: «أضف قسم الأسئلة الشائعة، وغير نص «احجز
 * جلسة» الي «احجز موعدك»» parsed the FAQ only — «الي» (ى typed as ي) was not
 * «إلى» — and the reply listed the FAQ and said ok with the button unchanged.
 * The same with curly quotes, «بـ», «الاسئله الشائعه», «إضف». And once one
 * deterministic operation ran, the part no reader understood was not named.
 * The structure is now read on folded text, every pair of quote marks is a
 * boundary, and a quoted part no operation read is named as not done.
 * No model is called; every reader and the editor are the real code.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { ProjectEditTool, parseLiteralTextReplacement, parsePresentationEdits, quotedSpans } from '../modules/tools/definitions/ProjectEditTool';

jest.setTimeout(120_000);

describe('every way he types a replacement is read', () => {
    it('POSITIVE — ى typed as ي, «بـ» and «لـ», curly and straight quotes', () => {
        expect(parseLiteralTextReplacement('غير «مرحبا» الي «اهلا»')).toEqual({ from: 'مرحبا', to: 'اهلا' });
        expect(parseLiteralTextReplacement('استبدل «مرحبا» بـ «اهلا»')).toEqual({ from: 'مرحبا', to: 'اهلا' });
        expect(parseLiteralTextReplacement('غيّر «مرحبا» لـ«اهلا»')).toEqual({ from: 'مرحبا', to: 'اهلا' });
        expect(parseLiteralTextReplacement('Change “Book now” to “Reserve”')).toEqual({ from: 'Book now', to: 'Reserve' });
        expect(parseLiteralTextReplacement("Change the hero's 'Book now' to 'Reserve'")).toEqual({ from: 'Book now', to: 'Reserve' });
        expect(parseLiteralTextReplacement('غيّر »احجز« إلى »اطلب«')).toEqual({ from: 'احجز', to: 'اطلب' });
    });

    it('POSITIVE — a section named in informal spelling, and an add verb with the wrong hamza', () => {
        expect(parsePresentationEdits('أضف قسم الاسئله الشائعه').map(op => op.kind)).toEqual(['faq_section']);
        expect(parsePresentationEdits('إضف تحت عنوان خدماتنا سطرا «نهتم بك»'))
            .toEqual([{ kind: 'section_subtitle', section: 'خدماتنا', value: 'نهتم بك' }]);
    });

    it('NEGATIVE — a quoted value is his exact text, never folded; an apostrophe is not a quote', () => {
        expect(parseLiteralTextReplacement('غيّر «مرحباً بكم» الى «أهلاً وسهلاً»')).toEqual({ from: 'مرحباً بكم', to: 'أهلاً وسهلاً' });
        expect(quotedSpans("the hero's title and it's done").map(span => span.value)).toEqual([]);
        expect(parseLiteralTextReplacement('غيّر نص الزر إلى شيء أجمل')).toBeNull();
        // «التالي» ends in «الي» but is not the word «إلى».
        expect(parseLiteralTextReplacement('غيّر «أ» في القسم التالي «ب»')).toBeNull();
    });
});

const write = (root: string, rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
};

describe('a two-part edit is done in full, or the part not done is named', () => {
    let site = '';
    beforeEach(() => {
        site = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-writing-two-part-'));
        write(site, 'package.json', '{"name":"clinic-site"}');
        write(site, 'src/content.js', "export const content = {\n  brand: 'عيادتي',\n  cta: 'احجز جلسة',\n  faqTitle: 'أسئلة شائعة',\n  faq: [\n    { q: 'السؤال الأول؟', a: 'الإجابة الأولى.' },\n    { q: 'السؤال الثاني؟', a: 'الإجابة الثانية.' },\n    { q: 'السؤال الثالث؟', a: 'الإجابة الثالثة.' },\n  ],\n  navLinks: [\n    { href: '#contact', label: 'تواصل' },\n  ],\n};\n");
        write(site, 'src/App.jsx', "import React from 'react';\nimport Contact from './components/Contact.jsx';\nimport { content } from './content.js';\nexport default function App(){ return <main><Contact content={content} /></main>; }\n");
        write(site, 'src/components/Contact.jsx', 'export default function Contact(){ return <section id="contact">Contact</section>; }\n');
        write(site, 'src/styles/base.css', ':root{--line:#ddd;--text:#111;--text-muted:#666;--brand:#075;}\n');
        write(site, 'index.html', '<title>عيادتي</title>\n');
    });
    afterEach(() => fs.rmSync(site, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
    const run = async (request: string, sessionId: string) => {
        const res: any = await new ProjectEditTool().execute({ request, dir: site, skipAudit: true }, { sessionId });
        delete (global as any).joeProjects?.[sessionId];
        return res;
    };
    const content = () => fs.readFileSync(path.join(site, 'src', 'content.js'), 'utf-8');

    it('POSITIVE — the review\'s case: the FAQ is added and the button text changed, and the note names the file', async () => {
        const res = await run('أضف قسم الأسئلة الشائعة، وغير نص «احجز جلسة» الي «احجز موعدك»', 'r22-two-part-faq');
        expect(fs.existsSync(path.join(site, 'src', 'components', 'Faq.jsx'))).toBe(true);
        expect(content()).toContain("cta: 'احجز موعدك'");
        expect(res.output.message).toContain('src/content.js');
        expect(res.output.unread).toEqual([]);
    });

    it('POSITIVE — a rename and a wording change in one sentence are both made', async () => {
        const res = await run('غيّر اسم الموقع إلى «نور» وغيّر «احجز جلسة» إلى «اطلب موعداً»', 'r22-two-part-rename');
        expect(content()).toContain("brand: 'نور'");
        expect(content()).toContain("cta: 'اطلب موعداً'");
        expect(res.output.unread).toEqual([]);
    });

    it('POSITIVE — a colour change does not stop the rest of the batch', async () => {
        write(site, 'src/styles/tokens.css', ':root{--brand:#000000}\n');
        const res = await run('غيّر لون الأزرار إلى أخضر، وأضف قسم الأسئلة الشائعة', 'r22-two-part-colour');
        expect(fs.readFileSync(path.join(site, 'src', 'styles', 'tokens.css'), 'utf-8')).not.toBe(':root{--brand:#000000}\n');
        expect(fs.existsSync(path.join(site, 'src', 'components', 'Faq.jsx'))).toBe(true);
        expect(res.output.touched).toEqual(expect.arrayContaining(['src/styles/tokens.css', 'src/components/Faq.jsx']));
    });

    it('POSITIVE — a verbal noun asks for the change too («قم بتغيير»), and both parts are made', async () => {
        const res = await run('أضف قسم الأسئلة الشائعة، وقم بتغيير «احجز جلسة» إلى «احجز موعدك»', 'r22-two-part-masdar');
        expect(fs.existsSync(path.join(site, 'src', 'components', 'Faq.jsx'))).toBe(true);
        expect(content()).toContain("cta: 'احجز موعدك'");
        expect(res.output.unread).toEqual([]);
    });

    it('NEGATIVE — «غير» inside «قيمة غير صحيحة» is «not»: quoted test values are not an edit left undone', async () => {
        const res = await run('غيّر اسم الموقع إلى «نور»، ثم اختبر الحقل بقيمة صحيحة «0790000000» وأخرى غير صحيحة «abc»', 'r22-two-part-test-values');
        expect(content()).toContain("brand: 'نور'");
        expect(res.output.unread).toEqual([]);
    });

    it('NEGATIVE — the quoted promo code a calculator reads from another clause is read by it', async () => {
        const res = await run('أضف حاسبة تكلفة استشارة مع ضريبة 16%، واجعل كود الخصم «BASIRA10» يخفض المجموع 10%', 'r22-two-part-calculator');
        expect(fs.existsSync(path.join(site, 'src', 'components', 'CostCalculator.jsx'))).toBe(true);
        expect(res.output.unread).toEqual([]);
    });

    it('NEGATIVE — a part no reader understood is named, and the reply is not ok', async () => {
        const res = await run('غيّر اسم الموقع إلى «نور»، واجعل الزر «احجز جلسة» يقول «احجز موعدك»', 'r22-two-part-unread');
        expect(content()).toContain("brand: 'نور'");
        expect(content()).toContain("cta: 'احجز جلسة'");
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/^edit_part_unread: /u);
        expect(res.output.unread).toEqual(['واجعل الزر «احجز جلسة» يقول «احجز موعدك»']);
        expect(res.output.message).toContain('«واجعل الزر «احجز جلسة» يقول «احجز موعدك»»');
    });

    it('NEGATIVE — a quoted thing he only asks to test is not an edit left undone', async () => {
        const res = await run('غيّر اسم الموقع إلى «نور»، ثم اختبر زر «احجز جلسة» في المتصفح', 'r22-two-part-test-only');
        expect(content()).toContain("brand: 'نور'");
        expect(res.output.unread).toEqual([]);
    });
});
