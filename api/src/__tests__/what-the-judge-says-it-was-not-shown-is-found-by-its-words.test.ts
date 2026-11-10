/**
 * ⛔ WHAT THE JUDGE SAYS IT WAS NOT SHOWN IS FOUND BY ITS OWN WORDS (named-requirements.ts).
 *
 * The hard sample, 2026-11-09 (L452, an e-learning platform in Arabic): «شهادات
 * PDF موقّعة» was «unprovable» three times — «الكود المعروض يوقّع الشهادة
 * (signDigest) … لكن توليد ملف PDF نفسه غير ظاهر في الجزء المعروض». Two
 * things kept src/pdf.js (3 KB) from the judge:
 *   - his words were read without «PDF» (three letters) and without «موقّعة»
 *     (the shadda cut it into «موق» and «عة»), leaving only «شهادات»;
 *   - the answer named no file, so the re-ask by file name never ran.
 * Pinned: a word he wrote in capitals is looked for; an answer that names no
 * file brings the files that hold its code words, a file it saw none of first;
 * and a reason with no code word asks nothing again.
 */
import { codeWordsOf, filesHoldingWordsOf, judgeSourceOf, sliceFor, verifyNamed } from '../core/quality/named-requirements';

const WHY = 'الكود المعروض يوقّع الشهادة (signDigest) ويحفظ توقيعها، لكن توليد ملف PDF نفسه غير ظاهر في الجزء المعروض من المصدر، وهو مقتطع.';

const PDF_JS = [
    'function buildPdf({ title, lines }) {',
    "  let out = '%PDF-1.4\\n';",
    '  for (const line of lines) out += `BT (${line}) Tj ET\\n`;',
    '  return Buffer.from(out);',
    '}',
    'function certificatePdf(cert) {',
    "  return buildPdf({ title: 'Certificate', lines: [cert.student, cert.course, 'Signature: ' + cert.signature] });",
    '}',
    'module.exports = { buildPdf, certificatePdf };',
].join('\n');

/** A page too big to show whole, his word on every line and «PDF» on some; and the generator, which writes no word of his. */
const SOURCE = judgeSourceOf([
    { path: 'public/app.js', text: Array.from({ length: 1400 }, (_, i) => `  el${i}.textContent = 'شهادات الدورة ${i}${i % 9 ? '' : ' — PDF'}';`).join('\n') },
    { path: 'src/pdf.js', text: PDF_JS },
]);
//  His requirement without the capitals, so only the judge's own words can find the generator.
const SIGNED = [{ id: 'R7', text: 'شهادات موقّعة', quote: 'شهادات موقّعة' }];

test('the code words of an answer in Arabic: its identifiers and its capitals, not its prose', () => {
    expect(codeWordsOf(WHY)).toEqual(['signdigest', 'pdf']);
    expect(codeWordsOf('the source shown is truncated and the handler is not visible')).toEqual([]);
});

test('the files that hold them, a file it saw none of before one it saw blocks of', () => {
    expect(SOURCE.length).toBeGreaterThan(40_000);
    const shown = sliceFor(SIGNED[0], SOURCE);
    expect(shown).toContain('==== file: public/app.js ====');
    expect(shown).not.toContain('function certificatePdf');
    expect(filesHoldingWordsOf(WHY, SOURCE, shown)).toEqual(['src/pdf.js', 'public/app.js']);
});

test('the judge whose answer names no file is shown the files of its own words, and its new answer stands', async () => {
    const prompts: string[] = [];
    const judge = async (p: string) => {
        prompts.push(p);
        return p.includes('==== file: src/pdf.js ====')
            ? JSON.stringify({ verdicts: [{ id: 'R7', verdict: 'met', evidence: "return buildPdf({ title: 'Certificate', lines: [cert.student, cert.course, 'Signature: ' + cert.signature] });", why: 'certificatePdf writes the signed certificate as a PDF' }] })
            : JSON.stringify({ verdicts: [{ id: 'R7', verdict: 'unprovable', evidence: '', why: WHY }] });
    };
    const out = await verifyNamed(SIGNED, SOURCE, true, judge);
    expect(prompts[0]).not.toContain('==== file: src/pdf.js ====');
    expect(prompts.filter(p => p.includes('==== file: src/pdf.js ===='))).toHaveLength(1);
    expect(out[0].verdict).toBe('met');
});

test('an answer with no code word asks nothing again', async () => {
    let calls = 0;
    const judge = async () => { calls++; return JSON.stringify({ verdicts: [{ id: 'R7', verdict: 'unprovable', evidence: '', why: 'لا يظهر في الجزء المعروض ما يثبت ذلك' }] }); };
    const out = await verifyNamed(SIGNED, SOURCE, true, judge);
    expect(out[0].verdict).toBe('unprovable');
    expect(calls).toBe(1);
});

test('his capitals are looked for: «PDF» finds the generator that writes no other word of his', () => {
    //  pdf.js between two big unrelated files, and «شهادات» only on the page: read by
    //  «شهادات» alone (the old reading), the slice is the page and nothing of pdf.js.
    const project = judgeSourceOf([
        { path: 'public/app.js', text: "el.textContent = 'شهادات الدورة';" },
        { path: 'src/one.js', text: Array.from({ length: 1300 }, (_, i) => `const unrelatedValue${i} = ${i};`).join('\n') },
        { path: 'src/pdf.js', text: PDF_JS },
        { path: 'src/two.js', text: Array.from({ length: 1300 }, (_, i) => `const anotherValue${i} = ${i};`).join('\n') },
    ]);
    expect(project.length).toBeGreaterThan(40_000);
    expect(sliceFor({ id: 'R7', text: 'شهادات PDF موقّعة', quote: 'شهادات PDF موقّعة' }, project)).toContain('function certificatePdf');
});
