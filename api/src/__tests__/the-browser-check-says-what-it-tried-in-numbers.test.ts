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
import { deliveryCertificate, qaCoverageLine, qaCoverageOf } from '../core/engine/certificate';

const AUDIT = {
    routes: ['/', '#/projects', '#/account', '#/p/1/board', '#/p/1/board'],
    pressed: 146, formsFilled: 14, fieldsFilled: 43, fieldCasesTried: 61, fieldCasesSubmitted: 4, reachedAtOtherWidths: 203,
};

test('the counts of an audit, said in Arabic and in English', () => {
    const c = qaCoverageOf(AUDIT)!;
    expect(c).toEqual({ screens: 4, pressed: 146, formsFilled: 14, fieldsFilled: 43, cases: 61, casesSent: 4, reached: 203 });
    const ar = qaCoverageLine(c, 'ar');
    expect(ar).toBe('جرّب جو في المتصفح: مرّ على 4 شاشة، وضغط 146 زراً ورابطاً واحداً واحداً، وملأ 14 نموذجاً (43 حقلاً)، وجرّب فيها 61 قيمة خاطئة وصحيحة، وأرسل 4 منها مع النموذج ليرى ردّ الخادم، وتحقّق من أن 203 زراً في متناول اليد على شاشتي اللوحي والجوال.');
    expect(qaCoverageLine(c, 'en')).toMatch(/^In the browser Joe walked 4 screen\(s\), pressed 146 control\(s\) one by one, filled 14 form\(s\) \(43 field\(s\)\)/);
});

test('a count of zero is not said, and an audit that walked nothing says nothing', () => {
    const line = qaCoverageLine(qaCoverageOf({ routes: ['/'], pressed: 5 }), 'ar');
    expect(line).toBe('جرّب جو في المتصفح: مرّ على 1 شاشة، وضغط 5 زراً ورابطاً واحداً واحداً.');
    expect(qaCoverageOf({ skipped: 'no browser' })).toBeUndefined();
    expect(qaCoverageOf({ routes: [], pressed: 0 })).toBeUndefined();
    expect(qaCoverageLine(undefined, 'ar')).toBe('');
});

test('the certificate says it under the browser check, and only when that check passed', () => {
    const base = { request: 'متجر', summary: 'متجر', language: 'ar', qaCoverage: qaCoverageOf(AUDIT) };
    expect(deliveryCertificate({ ...base, passed: ['live', 'browser'] })).toContain('- 🔎 جرّب جو في المتصفح: مرّ على 4 شاشة');
    expect(deliveryCertificate({ ...base, passed: ['live'] })).not.toContain('جرّب جو في المتصفح');
});

test('the reply carries it beside the verdict, from the run\'s own browser audit', () => {
    const verify = fs.readFileSync(path.join(__dirname, '..', 'core', 'engine', 'verify.ts'), 'utf8');
    expect(verify).toMatch(/taskReceipts\.some\(r => r\.tool\.replace\(\/\^delivery:\/u, ''\) === 'browser'\) \? qaCoverageLine\(qaCoverageOf\(record\.browserQa\), lang\) : ''/);
    const tool = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'AgentEngineTool.ts'), 'utf8');
    expect(tool).toMatch(/qaCoverage: qaCoverageOf\(\(result\.verification as DeliveryVerification \| undefined\)\?\.delivery\?\.browserQa\)/);
});
