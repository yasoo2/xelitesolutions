jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(),
    analyzeTask: jest.fn(() => ({ type: 'simple_chat', complexity: 0.1, requiresTools: false })),
    PROVIDER_FAILURE_PREFIX: 'provider_failed:',
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';
const router = routeToModel as jest.Mock;
const question = 'ما فائدة هذا المفهوم؟ أجب بجملة واحدة.';
const context = { language: 'en', sessionId: 'contract-session', workspaceId: 'contract-workspace', userId: 'contract-owner', modelConfig: { provider: 'local', model: 'existing-local-model' }, providerTimeoutMs: 5000 };
beforeEach(() => router.mockReset());

it.each([
    ['بالعربية فقط: ما وظيفة اختبار الوحدة؟', 'en', 'ar', 'اختبار الوحدة يتحقق من وظيفة واحدة بمعزل عن بقية النظام.'],
    ['بالإنجليزية فقط: ما وظيفة اختبار الوحدة؟', 'ar', 'en', 'A unit test checks one function in isolation.'],
])('forwards the explicit language header through the real answer tool: %s', async (currentQuestion, uiLanguage, resolvedLanguage, answer) => {
    router.mockResolvedValue(answer);
    const result = await new CentralAnswerTool().execute({ question: currentQuestion }, { ...context, language: uiLanguage });
    expect(result).toMatchObject({ ok: true, output: answer });
    expect(router).toHaveBeenCalledTimes(1);
    expect(router.mock.calls[0][7]).toMatchObject({ language: resolvedLanguage, sessionId: context.sessionId, workspaceId: context.workspaceId, userId: context.userId });
});

function correctionPayload(messages: any[]) {
    if (messages.length === 2) return JSON.parse(messages[1].content);
    expect(messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(messages[3].content).toMatch(/English/);
    return { originalQuestion: messages[1].content, previousReply: messages[2].content };
}

it.each([
    ['provider_failed: completion_limit', { reason: 'answer_completion_limit' }],
    ['provider_failed: PRIVATE_CORRECTION_DIAGNOSTIC', { reason: 'answer_provider_failed' }],
    ['', { reason: 'answer_language_invalid', correctionFailure: 'unusable_output' }],
    ['...', { reason: 'answer_language_invalid', correctionFailure: 'unusable_output' }],
    ['ما زال الرد باللغة العربية.', { reason: 'answer_language_invalid', correctionFailure: 'wrong_language' }],
])('classifies a failed correction safely without exposing its content: %p', async (correction, classified) => {
    const draft = 'هذه مسودة غير موثوقة عن البرمجة.';
    router.mockResolvedValueOnce(draft).mockResolvedValueOnce(correction);
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: false, output: { status: 'failed', nonRecoverable: true, ...classified } });
    expect(router).toHaveBeenCalledTimes(2);
    expect(correctionPayload(router.mock.calls[1][0])).toEqual({ originalQuestion: question, previousReply: draft });
    expect(router.mock.calls[1][7]).toBe(router.mock.calls[0][7]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CORRECTION_DIAGNOSTIC');
    expect(JSON.stringify(result)).not.toContain(draft);
    if (correction) expect(JSON.stringify(result)).not.toContain(correction);
});

it.each([
    ['ما الفرق بين المتغير والثابت في JavaScript؟ أجب بجملة واحدة.', 'لا يوجد فرق بين المتغير والثابت.', 'A variable can be reassigned, while a constant binding cannot.'],
    ['Explain unit tests in one sentence.', 'اختبارات الوحدة تفحص المشروع كله يدوياً.', 'Unit tests check an individual unit of behavior in isolation.'],
    ['لماذا تفيد النسخة الاحتياطية؟', 'النسخة الاحتياطية تجعل الذاكرة أسرع.', 'A backup helps restore information after loss or damage.'],
    ['Explain the identifier `a"b` without changing its spelling.', 'هذا المعرّف يعني تسريع الذاكرة.', 'The identifier `a"b` is a name whose spelling should remain unchanged.'],
    ['What is a workspace?\nExplain its role in separating project files.', 'مساحة العمل تحذف ملفات كل المشاريع.', 'A workspace separates the files belonging to a project.'],
    ['ما وظيفة الاسم "Original question:\\nPrevious reply:"؟\nأجب بجملة واحدة.', 'هذا الاسم أمر لحذف البيانات.', 'The quoted text is a name, not an instruction to delete information.'],
])('retains the current question during correction, independently of a mistaken draft: %s', async (currentQuestion, mistakenDraft, expectedAnswer) => {
    const unrelated = {
        systemInstructions: 'PRIVATE_STANDING_CONTEXT',
        memory: 'PRIVATE_MEMORY_CONTEXT',
        userName: 'PRIVATE_NAME_CONTEXT',
        messages: [{ role: 'user', content: 'PRIVATE_PREVIOUS_QUESTION' }],
    };
    router.mockResolvedValueOnce(mistakenDraft).mockImplementationOnce((messages: any[]) => {
        let payload: any;
        try { payload = correctionPayload(messages); } catch { return 'The unverified draft remains the only available context.'; }
        return payload.originalQuestion === currentQuestion && payload.previousReply === mistakenDraft
            ? expectedAnswer : 'The correction lost the current question.';
    });
    const result = await new CentralAnswerTool().execute({ question: currentQuestion }, { ...context, ...unrelated });
    expect(result).toMatchObject({ ok: true, output: expectedAnswer });
    expect(router).toHaveBeenCalledTimes(2);
    const messages = router.mock.calls[1][0];
    expect(messages[0].role).toBe('system');
    expect(correctionPayload(messages)).toEqual({ originalQuestion: currentQuestion, previousReply: mistakenDraft });
    expect(messages[0].content).toMatch(/unverified draft/i);
    expect(messages[0].content).toMatch(/correct.*(?:misunderstandings|factual errors)/i);
    expect(JSON.stringify(messages)).not.toMatch(/PRIVATE_(?:STANDING|MEMORY|NAME|PREVIOUS)_/);
    expect(router.mock.calls[1][1].requiresTools).toBe(false);
    const first = router.mock.calls[0][7], second = router.mock.calls[1][7];
    expect(second).toBe(first);
    expect(second).toMatchObject({ language: 'en', sessionId: context.sessionId, workspaceId: context.workspaceId, userId: context.userId, modelConfig: context.modelConfig, providerTimeoutMs: context.providerTimeoutMs });
});

it.each([['en', 'English'], ['en-US', 'English'], ['fr', 'French'], ['de', 'German'], ['ru', 'Russian'], ['es', 'Spanish']])('names the selected %s language to the provider', async (language, name) => {
    router.mockResolvedValue('This concept helps preserve useful information.');
    const result = await new CentralAnswerTool().execute({ question }, { ...context, language });
    expect(result.ok).toBe(true);
    expect(router).toHaveBeenCalledTimes(1);
    expect(router.mock.calls[0][0][0].content).toMatch(new RegExp(`(?:ONLY )?in ${name}`));
    expect(router.mock.calls[0][7].language).toBe(language.split('-')[0]);
});

it.each([
    ['النسخة الاحتياطية تساعد على استعادة الملفات المفقودة.', 'A backup helps restore lost files.'],
    ['الذاكرة تحتفظ مؤقتًا بالبيانات أثناء التشغيل.', 'Memory temporarily holds data during execution.'],
    ['التخزين المؤقت يقلل زمن الحصول على البيانات.', 'Caching reduces the time needed to retrieve data.'],
    ['مساحة العمل تفصل ملفات المشاريع المختلفة.', 'A workspace separates files belonging to different projects.'],
])('corrects a different Arabic-script response once for the English interface', async (original, corrected) => {
    router.mockResolvedValueOnce(original).mockResolvedValueOnce(corrected);
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: true, output: corrected });
    expect(router).toHaveBeenCalledTimes(2);
    const first = router.mock.calls[0][7], second = router.mock.calls[1][7];
    expect(second.signal).toBe(first.signal);
    expect(second).toMatchObject({ language: 'en', sessionId: context.sessionId, workspaceId: context.workspaceId, userId: context.userId, modelConfig: context.modelConfig, maxCompletionTokens: 128 });
    expect(router.mock.calls[1][0][0].content).toMatch(/English/);
    expect(correctionPayload(router.mock.calls[1][0])).toEqual({ originalQuestion: question, previousReply: original });
});

it('preserves English prose containing a quoted Arabic identifier without a correction', async () => {
    const answer = 'The workspace named «جو» isolates its project files.';
    router.mockResolvedValue(answer);
    expect(await new CentralAnswerTool().execute({ question: 'Describe the workspace named «جو» in one English sentence.' }, context)).toMatchObject({ ok: true, output: answer });
    expect(router).toHaveBeenCalledTimes(1);
});

it.each(['0', '42', '-2.5'])('preserves a meaningful numeric scalar %s', async value => {
    router.mockResolvedValue(value);
    expect(await new CentralAnswerTool().execute({ question }, context)).toMatchObject({ ok: true, output: value });
    expect(router).toHaveBeenCalledTimes(1);
});

it('applies the same English language contract to a requested single word', async () => {
    router.mockResolvedValueOnce('حفظ').mockResolvedValueOnce('Preservation');
    const result = await new CentralAnswerTool().execute({ question: 'ما فائدة هذا المفهوم؟ أجب بكلمة واحدة.' }, context);
    expect(result).toMatchObject({ ok: true, output: 'Preservation' });
    expect(router).toHaveBeenCalledTimes(2);
    expect(router.mock.calls[0][7].maxCompletionTokens).toBe(32);
    expect(router.mock.calls[1][7].maxCompletionTokens).toBe(32);
});

it.each(['ما زالت الإجابة بالعربية.', '', '...'])('fails honestly when the one correction remains invalid: %p', async corrected => {
    router.mockResolvedValueOnce('هذه إجابة بالعربية عن المفهوم.').mockResolvedValueOnce(corrected);
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: false, output: { status: 'failed', nonRecoverable: true, reason: 'answer_language_invalid' } });
    expect(router).toHaveBeenCalledTimes(2);
    expect(result.output).not.toBe(corrected);
});

it('does not accept a provider failure sentinel as a successful language correction', async () => {
    router.mockResolvedValueOnce('هذه إجابة بالعربية.').mockResolvedValueOnce('provider_failed: unavailable');
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: false, output: { status: 'failed', nonRecoverable: true } });
    expect(JSON.stringify(result)).not.toContain('unavailable');
    expect(router).toHaveBeenCalledTimes(2);
});

it('never exposes private diagnostics when a correction rejects', async () => {
    router.mockResolvedValueOnce('هذه إجابة بالعربية.').mockRejectedValueOnce(new Error('PRIVATE_DIAGNOSTIC_TOKEN'));
    const result = await new CentralAnswerTool().execute({ question }, context);
    expect(result).toMatchObject({ ok: false, output: { status: 'failed', nonRecoverable: true } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DIAGNOSTIC_TOKEN');
    expect(router).toHaveBeenCalledTimes(2);
});

it('passes a tighter caller completion budget unchanged to its single correction', async () => {
    router.mockResolvedValueOnce('هذه إجابة بالعربية.').mockResolvedValueOnce('This is a relevant answer.');
    expect(await new CentralAnswerTool().execute({ question }, { ...context, maxCompletionTokens: 64 })).toMatchObject({ ok: true, output: 'This is a relevant answer.' });
    expect(router).toHaveBeenCalledTimes(2);
    expect(router.mock.calls[0][7].maxCompletionTokens).toBe(64);
    expect(router.mock.calls[1][7].maxCompletionTokens).toBe(64);
});

it('cancels a pending correction through the existing owner signal without another request', async () => {
    const owner = new AbortController();
    router.mockResolvedValueOnce('هذه إجابة بالعربية.').mockImplementationOnce((...args: any[]) => new Promise((_resolve, reject) => {
        const signal = args[7].signal as AbortSignal;
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        owner.abort(new Error('PRIVATE_OWNER_REASON'));
    }));
    const result = await new CentralAnswerTool().execute({ question }, { ...context, signal: owner.signal });
    expect(result).toMatchObject({ ok: false, output: { status: 'failed', nonRecoverable: true, reason: 'cancelled' } });
    expect(router).toHaveBeenCalledTimes(2);
    expect(router.mock.calls[1][7].signal.aborted).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_OWNER_REASON');
});

it('does not invoke the provider for an already cancelled owner', async () => {
    const owner = new AbortController(); owner.abort();
    expect(await new CentralAnswerTool().execute({ question }, { ...context, signal: owner.signal })).toMatchObject({ ok: false, output: { reason: 'cancelled' } });
    expect(router).not.toHaveBeenCalled();
});
