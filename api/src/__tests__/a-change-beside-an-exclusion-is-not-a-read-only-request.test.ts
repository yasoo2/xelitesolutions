/**
 * The pipeline's read-only boundary (isReadOnlyRequest) reads a denial of changes the way
 * requested-action does: «without changing X» / «بدون تعديل X» beside an order that changes is
 * an exclusion; a denial of every file change beside an order that only reads — or beside no
 * order — is the boundary, in whichever dialect it is said.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.NODE_ENV = 'test';

import { isReadOnlyRequest, looksLikeBuild } from '../core/orchestrator/buildIntent';
import { hasRequestedAction } from '../core/intelligence/requested-action';

describe('a change beside an exclusion is not a read-only request', () => {
    it.each([
        'Fix the typo without changing the layout',
        'Move the button to the left without touching anything',
        'Without changing anything else, fix the header',
        'Add dark mode without changing any files except style.css',
        'Refactor utils.js without changing anything about its behavior',
        'Can you make the button blue without changing anything else?',
        'without modifying the tests, add a new endpoint',
        'صلح الزر بدون تعديل التصميم',
        'بدون تعديل التصميم، صلح الزر',
        'كبر الخط دون تغيير الألوان',
        'غير لون الزر بدون تغيير الخط',
        'أضف زر واتساب بدون تعديل ملف الإعدادات',
        'صلّح الزر من دون تغيير الهيدر',
        'طوّر نفس المشروع الحالي دون إنشاء مشروع جديد: أضف شعاراً وأضف زر',
    ])('an order that changes keeps its exclusion: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(false);
    });

    it.each([
        'Fix the typo without changing the layout',
        'Move the button to the left without touching anything',
        'Without changing anything else, fix the header',
        'Add dark mode without changing any files except style.css',
        'Refactor utils.js without changing anything about its behavior',
    ])('requested-action reads no denial in it either: %s', (request) => {
        expect(hasRequestedAction(request).hasDenial).toBe(false);
    });

    it.each([
        'بدون ما تعدل أي ملف، افحص المشروع',
        'من غير ما تغير أي ملف، راجع المشروع وقل لي المشاكل',
        'ما تعدلش أي ملف، افحص المشروع',
        'متعدلش أي ملف وراجع المشروع',
        'حلل الكود من غير ما تعدل أي ملف',
        'لخص المشروع بدون ما تغير أي ملف',
        'بدونِ ما تُعدّل أي ملف، اِفحص المشروع',
    ])('a denial of every file change in his dialect, beside a reading, is the boundary: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(true);
        expect(looksLikeBuild(request)).toBe(false);
    });

    it.each([
        'بدون تعديل أي ملف، افحص المشروع',
        'من فضلك، بدون تعديل أي ملف، افحص المشروع',
        'افحص المشروع دون إنشاء أي ملفات أو تعديلها، وأخبرني بما تجده',
        'اعرض ملفات مساحة العمل الرئيسية، ثم لخّص README للمستخدم دون تعديل أي ملف',
        'راجع الكود ولا تعدل أي ملف',
        'Review the repo without changing anything',
        'Without changing any files, review the project',
        'Can you review the project without touching any files?',
        'Show me the routes without modifying anything',
        'Summarize the project without editing any files',
        'Explain the header without changing anything',
        'Do not modify any files. Inspect the project',
        'Review the code. Do not modify any files.',
        'Explain hooks. Do not create any files.',
        'What does this project do? Do not change any files.',
        'Do not modify anything.',
        'Read-only audit. Do not create, edit, delete, move, install, publish, deploy, or commit anything. You may only read project files.',
    ])('a reading beside a denial of every change stays read-only: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(true);
    });

    it.each([
        'Without changing anything',
        'لا تعدل أي ملف',
        'بدون ما تعدل أي ملف',
    ])('a denial with nothing ordered is read-only: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(true);
    });

    it.each([
        // The one thing is excluded only beside an order that changes.
        'اشرح الهيدر بدون تعديل التصميم',
        'افحص المشروع دون إنشاء مشروع جديد',
        // The files, the code, anything, or nothing named: the denial it always was.
        'صلح الزر بدون تعديل الكود',
        'صلح الزر بدون أي تعديل',
        'Do not modify any files. Fix the header',
    ])('what was read-only and names no one thing beside a change stays read-only: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(true);
    });

    it.each([
        // An order to create or run beside a denial of edits is the request (requested-action frees it).
        'ما تعدلش أي ملف، اعملي صفحة تسجيل',
        'Run the project. Do not create any files.',
        'Create a file named a.txt. Do not change any other files.',
        'Build a calculator. Do not create a database.',
        // A denial of every file change beside an order that changes is no inspection.
        'بدون ما تعدل أي ملف، صلح الزر',
        'Without changing any files, fix the header',
    ])('an order that is not a reading is not made read-only: %s', (request) => {
        expect(isReadOnlyRequest(request)).toBe(false);
    });

    it('a quoted denial is copy, not an instruction', () => {
        expect(isReadOnlyRequest('Add a banner that says "without changing any files" to the page')).toBe(false);
    });

    it('reads 20 KB in linear time', () => {
        const inputs = [
            'بدون تعديل التصميم، '.repeat(1000) + 'صلح الزر',
            'without changing the layout, '.repeat(700) + 'fix the header',
            'صلح الزر ' + 'بدون '.repeat(4000),
            'Review the repo ' + 'without changing '.repeat(1200),
            'من غير ما '.repeat(2000) + 'افحص المشروع',
            'please '.repeat(2900) + 'review the project without changing any files',
            'بدون تعديل ' + 'و'.repeat(20000),
            'راجع المشروع' + '\n'.repeat(20000) + 'ولا تعدل أي ملف',
        ];
        for (const input of inputs) {
            const before = process.cpuUsage();
            isReadOnlyRequest(input);
            const spent = process.cpuUsage(before);
            expect((spent.user + spent.system) / 1e6).toBeLessThan(0.5);
        }
    });
});
