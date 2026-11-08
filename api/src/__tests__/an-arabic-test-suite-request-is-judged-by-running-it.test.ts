/**
 * «اجعل المجموعة كلها تنجح» IS JUDGED BY RUNNING THE TESTS, GIVEN THE TIME THEY TAKE.
 *
 * The Codex exam in Arabic, beside Claude Code, 2026-11-08 (C04): «مجموعة
 * الاختبارات في المجلد tests/ تفشل. اجعل المجموعة كلها تنجح بإصلاح كود
 * المكتبة» — Joe's fix was right (the hidden tests passed), yet he refused his
 * own delivery four times in 36 minutes:
 *   - the Arabic was not read as asking for the test suite (the English twin
 *     was), so «all tests pass» was judged on the source: «not provable»;
 *   - the project's own pytest ran under the shell's 30-second default for a
 *     «short» command, and a busy laptop cut it: «Execution timed out».
 */
import fs from 'fs';
import path from 'path';
import { testsRequestedIn } from '../core/quality/request-coverage';

describe('the Arabic asks for the test suite, as the English does', () => {
    test.each([
        'فحوص التكامل حمراء في هذا المستودع: مجموعة الاختبارات في المجلد tests/ تفشل. اجعل المجموعة كلها تنجح بإصلاح كود المكتبة. لا تغيّر الاختبارات.',
        'الاختبارات تفشل، أصلح الكود',
        'اجعل كل الاختبارات تنجح',
        'خلّي الاختبارات تمر',
        'ابني تطبيق مهام مع اختبارات',
        'CI is red on this repository: the test suite in tests/ fails. Make the whole suite pass.',
    ])('«%s»', request => expect(testsRequestedIn(request)).toBeTruthy());

    test.each([
        'ابني تطبيق لإدارة الطلاب والمعلمين والاختبارات',
        'تطبيق اختبارات للأطفال يختبر معلوماتهم',
        'موقع لمطعم فيه قائمة طعام',
    ])('«%s» asks for none', request => expect(testsRequestedIn(request)).toBeNull());
});

describe('a test run gets the time a test run takes', () => {
    test('the project\'s Python tests run with five minutes, not the 30-second default', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'request-coverage.ts'), 'utf8');
        expect(src).toContain("runTool('shell_execute', { command, cwd: dir, timeout: 5 * 60_000 })");
    });

    test('pytest, unittest, node --test, go test, jest are long runners for the shell', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf8');
        const rule = src.match(/\|\| \/(\\b\(\?:pytest[^/]+)\/u\.test\(command\)/u);
        expect(rule).toBeTruthy();
        const longRunner = new RegExp(rule![1], 'u');
        for (const cmd of ['python -m pytest -q', 'python -m unittest discover', 'node --test', 'go test ./...', 'npx jest']) expect(longRunner.test(cmd)).toBe(true);
        for (const cmd of ['python app.py', 'node server.js', 'dir']) expect(longRunner.test(cmd)).toBe(false);
    });
});
