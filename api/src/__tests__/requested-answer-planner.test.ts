import { hasRequestedAction } from '../core/intelligence/requested-action';
import { classifyIntent } from '../core/intelligence/intent-classifier';
import { hasRequestedAction as hasRequestedActionParser } from '../core/intelligence/requested-action';

describe('planner answer-contract: classifyIntent integration', () => {
    const cases = [
        {
            name: 'English polite build → isBuild=true',
            input: 'Can you create a task manager with projects and tasks?',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Arabic polite build → isBuild=true',
            input: 'هل يمكنك إنشاء تطبيق مخزون مع منتجات؟',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Calculator with targeted exclusions → isBuild=true',
            input: 'Build a calculator. Do not create a database or login page.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Explain-then-build → isBuild=true',
            input: 'Explain the approach briefly, then create a working unit converter.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Long quoted spec with answer-only → isKnowledgeQuestion=true',
            input: 'Explain this proposed specification without executing it: "Create a user management system with roles and permissions." No file changes.',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Simple imperative build → isBuild=true',
            input: 'Create a todo app with add, remove, and list features.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Arabic imperative build → isBuild=true',
            input: 'ابنِ نظام حجوزات مع تقارير',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Explicit read-only → isReadOnly=true',
            input: 'Read the files only, do not change anything.',
            expect: { isBuild: false, isKnowledgeQuestion: false, isReadOnly: true },
        },
        {
            name: 'Knowledge question → isKnowledgeQuestion=true',
            input: 'What is the best way to structure a React app?',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Answer-only contract → isKnowledgeQuestion=true',
            input: 'Answer only: what is 2+2?',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'No file changes contract → isKnowledgeQuestion=true',
            input: 'Explain the architecture without making any file changes.',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            // This is an informational question with no execution authority.
            // The prior ambiguous expectation contradicted the existing question classifier.
            name: 'Polite help question without container → answer',
            input: 'Can you help me?',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Negative constraint with affirmative build → isBuild=true',
            input: 'Build a blog with posts and comments. No database, no authentication.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Explain then implement → isBuild=true',
            input: 'Describe the solution first, then implement a simple CLI tool.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Pure question → isKnowledgeQuestion=true',
            input: 'Why does TypeScript have strict mode?',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Do not execute → isKnowledgeQuestion=true',
            input: 'Do not execute this, just explain the approach: Build a REST API.',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Without building → isKnowledgeQuestion=true',
            input: 'Without building anything, describe how to create a user system.',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Arabic answer-only → isKnowledgeQuestion=true',
            input: 'الرد فقط: ما هو أفضل تصميم؟',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Arabic no file changes → isKnowledgeQuestion=true',
            input: 'اشرح الكود بدون أي تعديل على الملفات',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Polite Arabic with negative constraint → isBuild=true',
            input: 'هل يمكنك إنشاء متجر؟ بدون قاعدة بيانات.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Explain-then-build Arabic → isBuild=true',
            input: 'اشرح النهج باختصار ثم ابني محول وحدات',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Information question with polite verb but no container → answer',
            input: 'Can you tell me what a singleton pattern is?',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Explicit no build with knowledge verb → isKnowledgeQuestion=true',
            input: 'What is the difference between REST and GraphQL? Do not create anything.',
            expect: { isBuild: false, isKnowledgeQuestion: true, isReadOnly: false },
        },
        {
            name: 'Could you please build → isBuild=true',
            input: 'Could you please build a markdown previewer?',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Would you create → isBuild=true',
            input: 'Would you create a simple game?',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Arabic desire verb with container → isBuild=true',
            input: 'أريد تطبيق مهام مع إضافة وحذف',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'English desire verb with container → isBuild=true',
            input: 'I want a note taking app with tags',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Recording verb with container and fields → isBuild=true',
            input: 'Record expenses with amount, category, date',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Derived columns → isBuild=true',
            input: 'Build a system with users: name, email, role, status',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Engineering brief → isBuild=true',
            input: 'Build a production-grade autonomous agent platform from scratch with complex orchestration, real working code, and autonomous debugging capabilities.',
            expect: { isBuild: true, isKnowledgeQuestion: false, isReadOnly: false },
        },
        {
            name: 'Browser request with URL → isBrowser=true',
            input: 'Open https://github.com and analyze the repo',
            expect: { isBrowser: true },
        },
        {
            name: 'Browser request with known site → isBrowser=true',
            input: 'Search on Google for TypeScript tutorials',
            expect: { isBrowser: true },
        },
    ];

    it.each(cases)('$name', async ({ input, expect: expectedResult }) => {
        const result = await classifyIntent(input);
        for (const [key, expectedValue] of Object.entries(expectedResult)) {
            expect(result[key as keyof typeof result]).toBe(expectedValue);
        }
    });
});

describe('hasRequestedAction integration with planner', () => {
    it('should detect answer-only and route to central_answer', () => {
        const result = hasRequestedAction('Explain this spec without executing: "Build a user system." No file changes.');
        expect(result.isAnswerOnly).toBe(true);
        expect(result.hasDenial).toBe(true);
        expect(result.hasAffirmativeAction).toBe(false);
    });

    it('should detect no file changes and route to central_answer', () => {
        const result = hasRequestedAction('Describe the architecture without making any file changes.');
        expect(result.isNoFileChanges).toBe(true);
        expect(result.hasDenial).toBe(true);
        expect(result.hasAffirmativeAction).toBe(false);
    });

    it('should allow polite builds through', () => {
        const result = hasRequestedAction('Can you create a task manager?');
        expect(result.hasAffirmativeAction).toBe(true);
        expect(result.isPoliteBuild).toBe(true);
        expect(result.hasDenial).toBe(false);
    });

    it('should allow explain-then-build through', () => {
        const result = hasRequestedAction('Explain the approach then build a converter.');
        expect(result.hasAffirmativeAction).toBe(true);
        expect(result.isExplainThenBuild).toBe(true);
        expect(result.hasDenial).toBe(false);
    });

    it('should allow builds with negative constraints through', () => {
        const result = hasRequestedAction('Build a blog. No database, no auth.');
        expect(result.hasAffirmativeAction).toBe(true);
        expect(result.hasDenial).toBe(false);
    });
});
