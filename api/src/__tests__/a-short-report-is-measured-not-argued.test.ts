/**
 * A SHORT REPORT IS MEASURED, NOT ARGUED (named-requirements.ts documentLengthVerdict).
 *
 * The Manus-style exam, 2026-11-09 (M01): «اكتب لي تقريرًا قصيرًا…» — the judge
 * ruled «أن يكون التقرير قصيرًا» unprovable four times, «short is relative»,
 * and a correct report was refused. Pinned: a short, brief or concise document
 * is judged on the words of the delivered documents (README and Joe's own
 * certificate aside), with no model; a long one is unmet; a requirement that
 * says nothing of length is left to the judge; and the judge is told how
 * today's figures are met when nothing newer than yesterday is published.
 */
import { documentLengthVerdict, judgeSourceOf, verificationPrompt, SHORT_DOCUMENT_WORDS } from '../core/quality/named-requirements';

const words = (n: number) => Array.from({ length: n }, (_, i) => `كلمة${i}`).join(' ');
const R = { id: 'R1', text: 'أن يكون التقرير قصيرًا', quote: 'تقريرًا قصيرًا' };

test('a short report is met by its measured length, and the certificate and README are not the report', () => {
    const src = judgeSourceOf([
        { path: 'report.md', text: `# أسعار الذهب\n${words(320)}` },
        { path: 'JOE-DELIVERY.md', text: words(5000) },
        { path: 'README.md', text: words(4000) },
        { path: 'build.js', text: 'console.log(1)' },
    ]);
    const v = documentLengthVerdict(R, src, true);
    expect(v?.verdict).toBe('met');
    expect(v?.why).toMatch(/report\.md فيه 32\d كلمة/);
});

test('a long one is unmet; one that says nothing of length is left to the judge', () => {
    const long = judgeSourceOf([{ path: 'report.html', text: `<html><body><p>${words(SHORT_DOCUMENT_WORDS + 400)}</p><script>${words(9000)}</script></body></html>` }]);
    expect(documentLengthVerdict(R, long, false)?.verdict).toBe('unmet');
    expect(documentLengthVerdict({ id: 'R2', text: 'a table of prices with dates', quote: 'جدول بالأسعار' }, long, false)).toBeNull();
    expect(documentLengthVerdict({ id: 'R3', text: 'a brief summary', quote: 'a brief summary' }, judgeSourceOf([{ path: 'app.js', text: 'x' }]), false)).toBeNull();
});

test('the judge is told how today\'s figures are met when the newest published is yesterday', () => {
    const p = verificationPrompt([{ id: 'R5', text: "today's gold price in Jordan", quote: 'سعر اليوم' }], judgeSourceOf([{ path: 'report.md', text: 'x' }]), true);
    expect(p).toMatch(/Current facts \(today's price, the latest news, this week's figures\) are\s+met by the most recent value/);
});

test('a document asked for is the product, even beside code the model added: its lines are not «only documentation»', async () => {
    //  M07, 2026-11-09: a recommendation in recommendation.md beside 15 files of code, refused four times.
    const { verifyNamed } = require('../core/quality/named-requirements');
    const line = '1. Acer Aspire 5 (2026) — 649 دولاراً، معالج Core i5 وذاكرة 16GB (المصدر: https://example.com/acer)';
    const src = judgeSourceOf([
        { path: 'recommendation.md', text: `# أفضل ثلاثة حواسيب للطلاب\n${line}\n` },
        { path: 'src/build.js', text: 'console.log("render the table")' },
    ]);
    const R = [{ id: 'R8', text: 'تحديد أفضل ثلاثة حواسيب محمولة للطلاب لعام 2026', quote: 'أفضل ثلاثة حواسيب' }];
    const judge = async () => JSON.stringify({ verdicts: [{ id: 'R8', verdict: 'met', evidence: line, why: 'التوصية في الملف' }] });
    const asDocument = await verifyNamed(R, src, true, judge, undefined, undefined, { documentsAreTheProduct: true });
    expect(asDocument[0].verdict).toBe('met');
    //  A build that was asked for is still proven by its code, not by a .md claim.
    const asBuild = await verifyNamed(R, src, true, judge);
    expect(asBuild[0].verdict).toBe('unprovable');
});
