import { hasRequestedAction } from '../core/intelligence/requested-action';

describe('requested-action authority: 22 cases + 6 guards', () => {
const cases = [
        {
            name: 'English polite build with container',
            input: 'Can you create a task manager with projects and tasks?',
            expected: { hasAffirmativeAction: true, isPoliteBuild: true, hasDenial: false },
        },
        {
            name: 'Arabic polite build with container',
            input: 'هل يمكنك إنشاء تطبيق مخزون مع منتجات؟',
            expected: { hasAffirmativeAction: true, isPoliteBuild: true, hasDenial: false },
        },
        {
            name: 'Calculator with targeted exclusions',
            input: 'Build a calculator. Do not create a database or login page.',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Explain-then-build',
            input: 'Explain the approach briefly, then create a working unit converter.',
            expected: { hasAffirmativeAction: true, isExplainThenBuild: true, hasDenial: false },
        },
        {
            name: 'Long quoted spec with answer-only',
            input: 'Explain this proposed specification without executing it: "Create a user management system with roles and permissions." No file changes.',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'Simple imperative build',
            input: 'Create a todo app with add, remove, and list features.',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Arabic imperative build',
            input: 'ابنِ نظام حجوزات مع تقارير',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Explicit read-only request',
            input: 'Read the files only, do not change anything.',
            expected: { hasAffirmativeAction: false, hasDenial: true, denialReason: 'explicit read-only request' },
        },
        {
            name: 'Knowledge question',
            input: 'What is the best way to structure a React app?',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
        {
            name: 'Answer-only contract',
            input: 'Answer only: what is 2+2?',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'No file changes contract',
            input: 'Explain the architecture without making any file changes.',
            expected: { hasAffirmativeAction: false, hasDenial: true, isNoFileChanges: true },
        },
        {
            name: 'Polite build without container (should not trigger)',
            input: 'Can you help me?',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
        {
            name: 'Negative constraint with affirmative build',
            input: 'Build a blog with posts and comments. No database, no authentication.',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Explain then implement',
            input: 'Describe the solution first, then implement a simple CLI tool.',
            expected: { hasAffirmativeAction: true, isExplainThenBuild: true, hasDenial: false },
        },
        {
            name: 'Pure question',
            input: 'Why does TypeScript have strict mode?',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
        {
            name: 'Do not execute',
            input: 'Do not execute this, just explain the approach: Build a REST API.',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'Without building',
            input: 'Without building anything, describe how to create a user system.',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'Arabic answer-only',
            input: 'الرد فقط: ما هو أفضل تصميم؟',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'Arabic no file changes',
            input: 'اشرح الكود بدون أي تعديل على الملفات',
            expected: { hasAffirmativeAction: false, hasDenial: true, isNoFileChanges: true },
        },
        {
            name: 'Polite Arabic with negative constraint',
            input: 'هل يمكنك إنشاء متجر؟ بدون قاعدة بيانات.',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Explain-then-build Arabic',
            input: 'اشرح النهج باختصار ثم ابني محول وحدات',
            expected: { hasAffirmativeAction: true, isExplainThenBuild: true, hasDenial: false },
        },
        {
            name: 'Information question with polite verb but no container',
            input: 'Can you tell me what a singleton pattern is?',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
        {
            name: 'Explicit no build with knowledge verb',
            input: 'What is the difference between REST and GraphQL? Do not create anything.',
            expected: { hasAffirmativeAction: false, hasDenial: true, isAnswerOnly: true },
        },
        {
            name: 'Could you please build',
            input: 'Could you please build a markdown previewer?',
            expected: { hasAffirmativeAction: true, isPoliteBuild: true, hasDenial: false },
        },
        {
            name: 'Would you create',
            input: 'Would you create a simple game?',
            expected: { hasAffirmativeAction: true, isPoliteBuild: true, hasDenial: false },
        },
        {
            name: 'Arabic desire verb with container',
            input: 'أريد تطبيق مهام مع إضافة وحذف',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'English desire verb with container',
            input: 'I want a note taking app with tags',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Recording verb with container and fields',
            input: 'Record expenses with amount, category, date',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Derived columns',
            input: 'Build a system with users: name, email, role, status',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Engineering brief',
            input: 'Build a production-grade autonomous agent platform from scratch with complex orchestration, real working code, and autonomous debugging capabilities.',
            expected: { hasAffirmativeAction: true, hasDenial: false },
        },
        {
            name: 'Browser request with URL',
            input: 'Open https://github.com and analyze the repo',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
        {
            name: 'Browser request with known site',
            input: 'Search on Google for TypeScript tutorials',
            expected: { hasAffirmativeAction: false, hasDenial: false },
        },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
        const result = hasRequestedAction(input);
        for (const [key, expectedValue] of Object.entries(expected)) {
            expect(result[key as keyof typeof result]).toBe(expectedValue);
        }
    });

    // Guard cases
    const guardCases = [
        {
            name: 'Denial should not trigger on affirmative build with negative constraint',
            input: 'Build a dashboard. No database, no auth.',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.hasDenial,
        },
        {
            name: 'Answer-only should not trigger on polite build',
            input: 'Can you create a user system?',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.isAnswerOnly,
        },
        {
            name: 'Read-only should not trigger on explain-then-build',
            input: 'Explain the design then build a converter.',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.hasDenial,
        },
        {
            name: 'Knowledge question should not trigger on build with question words',
            input: 'How to build a React app? Create one for me.',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.hasDenial,
        },
        {
            name: 'No file changes should not trigger on normal build',
            input: 'Create a simple calculator app.',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.isNoFileChanges,
        },
        {
            name: 'Denial should not trigger on explain-then-build with negative constraint',
            input: 'Explain the approach then build a tool. No database.',
            check: (r: ReturnType<typeof hasRequestedAction>) => r.hasAffirmativeAction && !r.hasDenial,
        },
    ];

    it.each(guardCases)('$name', ({ input, check }) => {
        const result = hasRequestedAction(input);
        expect(check(result)).toBe(true);
    });
});