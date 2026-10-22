import { hasRequestedAction } from '../core/intelligence/requested-action';
import { classifyIntent, isBuildRequest } from '../core/intelligence/intent-classifier';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: () => { throw new Error('Classification must not contact a provider'); },
}));

describe('explicit denial outranks inferred execution authority', () => {
    it.each([
        'Create a tool. Answer only.',
        'Create a calculator app. Do not execute anything.',
        'Build a working app. No file changes.',
        'Build a production-grade autonomous system from scratch with real working code and a complete API. '
            + 'Use architecture planning, tests, deployment and all engineering capabilities. '
            + 'The specification is intentionally long to reach the engineering shortcut. Do not execute.',
        'Build a system with users: name, email, role, status. No file changes.',
        'Build a dashboard. Do not create a database. Do not execute anything.',
        'Build a dashboard. Do not create a database. Do not create or change any files.',
        'Build a dashboard. Do not create a database or login page. Read only.',
        'Build a tool. Without making any file changes.',
        'Create a tool. Do not build it.',
        'أريد نظاماً فيه الاسم والبريد والدور. الرد فقط.',
        'ابنِ نظاماً ثم اشرح فقط.',
        'اشرح الكود بدون أي تعديل على الملفات',
        'أنشئ متجراً دون إنشاء ملفات',
        'أريد تطبيقاً. قراءة فقط.',
    ])('%s', async goal => {
        expect(hasRequestedAction(goal).hasDenial).toBe(true);
        expect(hasRequestedAction(goal).hasAffirmativeAction).toBe(false);
        expect(isBuildRequest(goal).isBuild).toBe(false);
        expect((await classifyIntent(goal)).isBuild).toBe(false);
    });

    it.each([
        'Build a calculator. Do not create a database or login page.',
        'Build a calculator. Do not create a database, no auth.',
        'هل يمكنك إنشاء متجر؟ بدون قاعدة بيانات.',
        'Create a page with a label "Do not execute".',
        'Create a page with a label “Answer only”.',
        'Create a page with a label «Do not execute».',
        'Explain the approach briefly, then create a converter.',
        'اشرح النهج باختصار ثم ابني محول وحدات',
    ])('scoped constraints or quoted copy grant no global denial: %s', goal => {
        expect(hasRequestedAction(goal).hasDenial).toBe(false);
        expect(hasRequestedAction(goal).hasAffirmativeAction).toBe(true);
    });

    it.each([
        'Why do developers build apps?',
        'كيف ابني نظاماً؟',
        'Explain the phrase "Create a todo app".',
        'اشرح العبارة «أنشئ تطبيقاً».',
        'اشرح العبارة «من فضلك أنشئ تطبيقاً».',
        'اشرح معنى "من فضلك ابني نظاماً".',
        'Explain the phrase “Please create a tool”.',
        '"Please create a task app"',
    ])('information and quoted examples are not commands: %s', goal => {
        expect(hasRequestedAction(goal).hasAffirmativeAction).toBe(false);
        expect(isBuildRequest(goal).isBuild).toBe(false);
    });

    it.each(['Can you help me?', 'Can you tell me what a singleton pattern is?'])('%s', async goal => {
        const result = await classifyIntent(goal);
        expect(result.isBuild).toBe(false);
        expect(result.isBrowser).toBe(false);
        expect(result.isKnowledgeQuestion).toBe(true);
        expect(result.reason).toBe('knowledge question');
    });
});
