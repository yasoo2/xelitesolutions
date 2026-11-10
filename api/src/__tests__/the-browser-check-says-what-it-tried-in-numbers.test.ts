/**
 * ⛔ THE BROWSER CHECK SAYS WHAT IT TRIED, IN NUMBERS (certificate.ts qaCoverageLine).
 *
 * The owner, 2026-11-10, after watching it: «حاسس انه فحص فاشل». «فُتح المشروع في
 * متصفح حقيقي وجُرّبت أزراره ونماذجه» gave him nothing to weigh. Pinned: the
 * counts of an audit, said in his language in the certificate and in the
 * reply; a count of zero is not said; an audit that walked nothing says
 * nothing; and the reply carries it only when the browser check passed.
 */
import fs from 'fs';
import path from 'path';
import { arabicCount, deliveryCertificate, qaCoverageLine, qaCoverageOf } from '../core/engine/certificate';

const AUDIT = {
    routes: ['/', '#/projects', '#/account', '#/p/1/board', '#/p/1/board'],
    pressed: 146, formsFilled: 14, fieldsFilled: 43, fieldCasesTried: 61, fieldCasesSubmitted: 4, reachedAtOtherWidths: 203,
};

test('the counts of an audit, said in Arabic and in English', () => {
    const c = qaCoverageOf(AUDIT)!;
    expect(c).toEqual({ screens: 4, pressed: 146, formsFilled: 14, fieldsFilled: 43, cases: 61, casesSent: 4, reached: 203 });
    const ar = qaCoverageLine(c, 'ar');
    expect(ar).toBe('جرّب جو في المتصفح: مرّ على 4 شاشات، وضغط 146 عنصراً واحداً تلو الآخر، وملأ 14 نموذجاً (43 حقلاً)، وجرّب فيها 61 قيمة بين خاطئة وصحيحة، وأرسل 4 منها مع النموذج ليرى ردّ الخادم، وتحقّق من أن 203 أزرار في متناول اليد على شاشتي اللوحي والجوال.');
    expect(qaCoverageLine(c, 'en')).toMatch(/^In the browser Joe walked 4 screen\(s\), pressed 146 control\(s\) one by one, filled 14 form\(s\) \(43 field\(s\)\)/);
});

test('Arabic counts as Arabic counts: one, two, three to ten, eleven and up, a hundred', () => {
    const w = { one: 'شاشة واحدة', two: 'شاشتين', plural: 'شاشات', single: 'شاشة', hundred: 'شاشة' };
    expect([1, 2, 3, 10, 11, 99, 100, 102, 103, 111].map(n => arabicCount(n, w))).toEqual([
        'شاشة واحدة', 'شاشتين', '3 شاشات', '10 شاشات', '11 شاشة', '99 شاشة', '100 شاشة', '102 شاشة', '103 شاشات', '111 شاشة',
    ]);
    //  The live check's line (2026-11-10): «مرّ على 1 شاشة، وضغط 7 زراً، وملأ 1 نموذجاً (4 حقلاً)».
    expect(qaCoverageLine({ screens: 1, pressed: 7, formsFilled: 1, fieldsFilled: 4, cases: 6, reached: 7, jobs: 6 } as any, 'ar')).toBe(
        'جرّب جو في المتصفح: مرّ على شاشة واحدة، وضغط 7 عناصر واحداً تلو الآخر، وملأ نموذجاً واحداً (4 حقول)، وجرّب فيها 6 قيم بين خاطئة وصحيحة، وتحقّق من أن 7 أزرار في متناول اليد على شاشتي اللوحي والجوال، وتأكّد أن كلاً من 6 أزرار أدّى عمله بالضبط.');
});

test('a count of zero is not said, and an audit that walked nothing says nothing', () => {
    const line = qaCoverageLine(qaCoverageOf({ routes: ['/'], pressed: 5 }), 'ar');
    expect(line).toBe('جرّب جو في المتصفح: مرّ على شاشة واحدة، وضغط 5 عناصر واحداً تلو الآخر.');
    expect(qaCoverageOf({ skipped: 'no browser' })).toBeUndefined();
    expect(qaCoverageOf({ routes: [], pressed: 0 })).toBeUndefined();
    expect(qaCoverageLine(undefined, 'ar')).toBe('');
});

test('the certificate says it under the browser check, and only when that check passed', () => {
    const base = { request: 'متجر', summary: 'متجر', language: 'ar', qaCoverage: qaCoverageOf(AUDIT) };
    expect(deliveryCertificate({ ...base, passed: ['live', 'browser'] })).toContain('- 🔎 جرّب جو في المتصفح: مرّ على 4 شاشات');
    expect(deliveryCertificate({ ...base, passed: ['live'] })).not.toContain('جرّب جو في المتصفح');
});

test('the reply carries it beside the verdict, from the run\'s own browser audit', () => {
    const verify = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'verify.ts'), 'utf8');
    expect(verify).toMatch(/taskReceipts\.some\(r => r\.tool\.replace\(\/\^delivery:\/u, ''\) === 'browser'\) \? qaCoverageLine\(qaCoverageOf\(record\.browserQa\), lang\) : ''/);
    const tool = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AgentEngineTool.ts'), 'utf8');
    expect(tool).toMatch(/qaCoverage: qaCoverageOf\(\(result\.verification as DeliveryVerification \| undefined\)\?\.delivery\?\.browserQa\)/);
});
