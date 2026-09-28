/**
 * THE LANGUAGE CONTRACT + THE FABRICATION BAN.
 *
 * Field case, pasted by the user: he asked «حلل هذه الصورة» in Arabic and
 * Joe answered in fluent English — AND "analyzed" an image it never saw:
 * invented pixel dimensions, a creation date lifted from the FILENAME,
 * imaginary embedded links. Two contracts now enforce what instructions
 * only requested.
 */
import fs from 'fs';
import path from 'path';
import { arabicShare } from '../shared/utils/language';
import { formatAttachmentsBlock } from '../shared/attachments';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(),
    isProviderFailure: (text: unknown) => typeof text === 'string' && (text.trimStart().startsWith('⚠️ تعذّر الوصول إلى محرّك الذكاء') || /request timed out/i.test(text)),
    isUsableAnswer: (text: unknown) => /[\p{L}\p{N}]/u.test(String(text ?? '').trim()),
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';
import { ImageStudioTool } from '../modules/tools/definitions/ImageStudioTool';
import { ProjectRepairTool } from '../modules/tools/definitions/ProjectRepairTool';
import { githubReportLanguage } from '../modules/tools/definitions/GitHubRepoManagerTool';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('arabicShare — the measurement behind the contract', () => {
    test('pure Arabic ≈ 1, pure English ≈ 0, and code/digits do not dilute', () => {
        expect(arabicShare('مساء الخير يا يونس، كيف حالك اليوم؟')).toBeGreaterThan(0.95);
        expect(arabicShare('Good evening, Younes. Here is the analysis.')).toBe(0);
        expect(arabicShare('الحجم 1920x1080 والملف PNG')).toBeGreaterThan(0.5);
        expect(arabicShare('')).toBe(0);
    });
});

describe('central_answer context is relevant to the question', () => {
    beforeEach(() => (routeToModel as jest.Mock).mockReset());

    test('a strict non-temporal answer is not burdened with clock or marketing instructions', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce('133');
        await new CentralAnswerTool().execute({ question: 'What is 19 × 7? Answer with the number only.' }, { language: 'en', userName: 'Guest User' });
        const system = String((routeToModel as jest.Mock).mock.calls[0][0][0].content);
        expect(system).toMatch(/requested format/i);
        expect(system).not.toContain('Right now it is');
        expect(system).not.toContain('Guest');
        expect(system).not.toMatch(/premium state-of-the-art|enticing/i);
    });

    test('records the answering provider after fallback without logging the key', async () => {
        (routeToModel as jest.Mock).mockImplementationOnce(async (...args: any[]) => {
            const context = args[7];
            context.providerAttempts = [
                { provider: 'nvidia', success: false, error: 'provider request failed' },
                { provider: 'LLM7 (Keyless)', success: true },
            ];
            return 'The answer is 133.';
        });
        const result: any = await new CentralAnswerTool().execute(
            { question: 'What is 19 × 7?' },
            { language: 'en', modelConfig: { provider: 'nvidia', apiKey: 'test-key-never-log' } },
        );
        expect(result.ok).toBe(true);
        expect(result.logs).toContain('central_answer: provider_used=LLM7 (Keyless)');
        expect(JSON.stringify(result)).not.toContain('test-key-never-log');
    });
    test('a current-time question still receives the real clock context', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce('It is 09:30.');
        await new CentralAnswerTool().execute({ question: 'What time is it now?' }, { language: 'en' });
        const system = String((routeToModel as jest.Mock).mock.calls[0][0][0].content);
        expect(system).toContain('Right now it is');
        expect(system).toContain('ONLY clock you have');
    });
});

describe('central_answer — an Arabic question gets an Arabic answer, measured', () => {
    const ENGLISH_REPLY = 'Good evening. I analyzed the image: it is a dashboard with charts and sliders.';
    const ARABIC_REWRITE = 'مساء الخير. حللت الصورة: إنها صفحة هبوط داكنة تحمل شعاراً ذهبياً وزرّين رئيسيين.';

    beforeEach(() => (routeToModel as jest.Mock).mockReset());

    test('an English reply to an Arabic question is rewritten — and the rewrite ships', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_REPLY)     // the weak model ignores the instruction
            .mockResolvedValueOnce(ARABIC_REWRITE);   // the enforcement pass
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'حلل هذه الصورة بدقة من فضلك' }, { language: 'ar' });
        expect(r.ok).toBe(true);
        expect(r.output).toBe(ARABIC_REWRITE);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        const rewriteCall = (routeToModel as jest.Mock).mock.calls[1][0];
        expect(rewriteCall[0].content).toContain('أعد كتابة النص التالي بالعربية');
        expect(rewriteCall[1].content).toBe(ENGLISH_REPLY);
        expect(String(r.logs.join(' '))).toContain('language enforced');
    });

    test('a compliant Arabic reply is NOT taxed with a second model call', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ARABIC_REWRITE);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'حلل هذه الصورة بدقة من فضلك' }, { language: 'ar' });
        expect(r.output).toBe(ARABIC_REWRITE);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
    });

    test('a failed rewrite keeps the original — a wrong language beats a dead reply', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_REPLY)
            .mockRejectedValueOnce(new Error('provider down'));
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'حلل هذه الصورة بدقة من فضلك' }, { language: 'ar' });
        expect(r.ok).toBe(true);
        expect(r.output).toBe(ENGLISH_REPLY);
    });

    test('a provider failure is not an answer or a language rewrite candidate', async () => {
        const failure = '⚠️ تعذّر الوصول إلى محرّك الذكاء — طلب التوليد تجاوز المهلة.';
        (routeToModel as jest.Mock).mockResolvedValueOnce(failure);
        const r: any = await new CentralAnswerTool().execute({ question: 'ما عاصمة فرنسا؟' }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect(r.error).toBe(failure);
        expect(r.output).toBeUndefined();
        expect(r.logs.join(' ')).not.toContain('Answered via router');
        expect(routeToModel).toHaveBeenCalledTimes(1);
    });

    test('a failed language rewrite cannot replace a valid answer', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_REPLY)
            .mockResolvedValueOnce('⚠️ تعذّر الوصول إلى محرّك الذكاء');
        const r: any = await new CentralAnswerTool().execute({ question: 'حلل هذه الصورة بدقة من فضلك' }, { language: 'ar' });
        expect(r.ok).toBe(true);
        expect(r.output).toBe(ENGLISH_REPLY);
    });

    test('a thrown provider timeout cannot become a fabricated success', async () => {
        (routeToModel as jest.Mock).mockRejectedValueOnce(new Error('Request timed out.'));
        const r: any = await new CentralAnswerTool().execute({ question: 'What is the capital of France?' }, { language: 'en' });
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/timed out/i);
        expect(r.output).toBeUndefined();
        expect(r.logs.join(' ')).not.toContain('fallback');
    });

    test('an empty model response cannot become a fabricated success', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce('');
        const r: any = await new CentralAnswerTool().execute({ question: 'What is the capital of France?' }, { language: 'en' });
        expect(r.ok).toBe(false);
        expect(r.output).toBeUndefined();
        expect(r.error).toMatch(/empty/i);
    });

    test('a thrown router error does not expose an environment credential', async () => {
        const previous = process.env.GROQ_API_KEY;
        process.env.GROQ_API_KEY = 'test-secret-only-for-central-answer';
        try {
            (routeToModel as jest.Mock).mockRejectedValueOnce(new Error('upstream echoed test-secret-only-for-central-answer'));
            const r: any = await new CentralAnswerTool().execute({ question: 'What is the capital of France?' }, { language: 'en' });
            expect(r.ok).toBe(false);
            expect(JSON.stringify(r)).not.toContain(process.env.GROQ_API_KEY);
            expect(r.error).toContain('[REDACTED]');
        } finally {
            if (previous === undefined) delete process.env.GROQ_API_KEY;
            else process.env.GROQ_API_KEY = previous;
        }
    });

    test('a thrown router error does not expose a selected provider credential', async () => {
        const apiKey = 'test-selected-key-only-for-central-answer';
        (routeToModel as jest.Mock).mockRejectedValueOnce(new Error('upstream echoed ' + apiKey));
        const r: any = await new CentralAnswerTool().execute(
            { question: 'What is the capital of France?' }, { language: 'en', modelConfig: { provider: 'groq', apiKey } },
        );
        expect(r.ok).toBe(false);
        expect(JSON.stringify(r)).not.toContain(apiKey);
        expect(r.error).toContain('[REDACTED]');
    });

    test('owner cancellation cannot become a generic answer', async () => {
        (routeToModel as jest.Mock).mockRejectedValueOnce(new Error('run_cancelled_by_owner'));
        const r: any = await new CentralAnswerTool().execute(
            { question: 'What is the capital of France?' }, { language: 'en', isCancelled: () => true },
        );
        expect(r.ok).toBe(false);
        expect(r.error).toBe('run_cancelled_by_owner');
        expect(r.output).toBeUndefined();
    });

    test.each([
        ["Hi, what's 2+2?", '4', 'en'],
        ['مرحبا، ما عاصمة فرنسا؟', 'باريس', 'ar'],
        ['Thanks, explain photosynthesis.', 'Photosynthesis converts light to energy.', 'en'],
        ["Who are you and what's 2+2?", '4', 'en'],
    ])('small-talk prefix does not swallow the request: %s', async (question, answer, language) => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(answer);
        const r: any = await new CentralAnswerTool().execute({ question }, { language });
        expect(r.ok).toBe(true);
        expect(r.output).toBe(answer);
        expect(routeToModel).toHaveBeenCalledTimes(1);
        expect(r.logs.join(' ')).not.toContain('instant fast-path');
    });

    test.each(['Hello!', 'مرحبا', 'شكراً', 'Who are you?'])(
        'pure small talk still answers without a model: %s', async (question) => {
            const r: any = await new CentralAnswerTool().execute({ question });
            expect(r.ok).toBe(true);
            expect(String(r.output).length).toBeGreaterThan(0);
            expect(r.logs.join(' ')).toContain('instant fast-path');
            expect(routeToModel).not.toHaveBeenCalled();
        },
    );

    test('punctuation without words or digits is not an answer', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce('?!');
        const r: any = await new CentralAnswerTool().execute({ question: 'What is the result?' }, { language: 'en' });
        expect(r.ok).toBe(false);
        expect(r.output).toBeUndefined();
    });

    test('an English question is never touched by the Arabic enforcement', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ENGLISH_REPLY);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'Please analyze this configuration file for me' }, { language: 'en' });
        expect(r.output).toBe(ENGLISH_REPLY);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
    });

    // NEGATIVE — no caller-side language must still keep an English request English.
    test('an English question without a language stays English', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ENGLISH_REPLY);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'Please explain this configuration file' });
        expect(r.output).toBe(ENGLISH_REPLY);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
    });
});

describe('tool language fallbacks never assume Arabic', () => {
    test('ImageStudio reports its missing session in English without a language', async () => {
        const r: any = await new ImageStudioTool().execute(
            { context: 'fetch the pictures' },
            { sessionId: `language-image-missing-${Date.now()}` },
        );
        expect(r.ok).toBe(false);
        expect(r.error).toContain('This session has no system with tables');
        expect(r.error).not.toMatch(/[؀-ۿ]/);
    });

    test('ProjectRepair reports its missing project in English without a language', async () => {
        const r: any = await new ProjectRepairTool().execute(
            {},
            { sessionId: `language-repair-missing-${Date.now()}` },
        );
        expect(r.ok).toBe(false);
        expect(r.error).toContain('No built project in this session to repair');
        expect(r.error).not.toMatch(/[؀-ۿ]/);
    });

    test('GitHub report language defaults to English for an ASCII request and Arabic only for Arabic signal', () => {
        expect(githubReportLanguage({ repoName: 'owner/repo' })).toBe('en');
        expect(githubReportLanguage({ request: 'حلل المستودع' })).toBe('ar');
        expect(githubReportLanguage({ language: 'en', request: 'حلل المستودع' })).toBe('en');
    });
});

describe('the fabrication ban — what Joe has not seen, Joe does not describe', () => {
    test('an UNDESCRIBED image explicitly forbids invented metadata', () => {
        const block = formatAttachmentsBlock([{
            name: 'لقطة شاشة 2026-07-21 014611.png', mimeType: 'image/png', size: 1_200_000,
            content: '', path: 'C:/uploads/x.png',
        }]);
        expect(block).toContain('you have NOT seen this file');
        expect(block).toContain('the filename is a name, not data');
        expect(block).toContain('image analysis is unavailable');
    });

    test('a DESCRIBED image still forbids inventing binary metadata beyond the description', () => {
        const block = formatAttachmentsBlock([{
            name: 'shot.png', mimeType: 'image/png', size: 1000,
            content: 'صفحة هبوط داكنة بشعار ذهبي', path: '/up/shot.png', visionDescribed: true,
        }]);
        expect(block).toContain('Answer ONLY from this description');
        expect(block).toContain('NEVER state such details');
    });

    test('every run carries the language contract, and the builder strips it from subjects', () => {
        const loop = read('modules', 'services', 'AgentLoopService.ts');
        expect(loop).toContain('[RESPONSE LANGUAGE — NON-NEGOTIABLE]');
        const builder = read('modules', 'tools', 'definitions', 'WebPageBuilderTool.ts');
        expect(builder).toContain('STANDING USER INSTRUCTIONS|ENGINEERING DISCIPLINE|RESPONSE LANGUAGE');
    });
});

/**
 * THE MESSAGE BEATS THE SWITCHER — from the same field log: the UI was set
 * to English, the user typed «حلل هذه الصوره», and the run carried
 * «[RESPONSE LANGUAGE …]: The user's language is English». The language of
 * the reply follows what the user WROTE; the switcher only breaks ties.
 */
import { messageLanguage } from '../shared/utils/language';
import { replyLanguageCode } from '../shared/reply-language';

describe('messageLanguage — the script of the message decides', () => {
    test('an Arabic message overrides an English UI switcher (the field bug)', () => {
        expect(messageLanguage('حلل هذه الصوره', 'en')).toBe('ar');
        expect(messageLanguage('لخص هذا الملف من فضلك', 'en')).toBe('ar');
    });
    test('an English message overrides an Arabic UI switcher (the mirror case)', () => {
        expect(messageLanguage('Please analyze this screenshot for me', 'ar')).toBe('en');
    });
    test('a Latin-script message trusts a Latin-script switcher (fr stays fr)', () => {
        expect(messageLanguage('Analyse cette image', 'fr')).toBe('fr');
    });
    test('no signal — numbers, a URL, a two-letter ok — falls back to the switcher', () => {
        expect(messageLanguage('ok', 'ar')).toBe('ar');
        expect(messageLanguage('123 456', 'en')).toBe('en');
        expect(messageLanguage('', 'ar')).toBe('ar');
    });
    test('Arabic mixed with code and English identifiers still reads Arabic', () => {
        expect(messageLanguage('أصلح الخطأ في ملف server.js عند السطر 42', 'en')).toBe('ar');
    });
});

describe('the run derives its language from the shared interface contract', () => {
    it.each([
        ['English UI, Arabic request', 'en', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد', 'en'],
        ['Arabic UI, English request', 'ar', 'Build me a table for my clients', 'ar'],
        ['no UI, Arabic request', undefined, 'عندي عيادة أسنان. بدي جدول', 'ar'],
        ['no UI, English request', '', 'Build me a table for my clients', 'en'],
    ])('%s resolves one language for the whole run', (_label, ui, goal, expected) => {
        expect(replyLanguageCode(ui as string | undefined, goal)).toBe(expected);
    });

    // The complete AgentLoop execution is intentionally not started here: it
    // launches tools and persistence. The semantic tokens below prove that its
    // run context uses the shared resolver and reuses one resolved language.
    test('AgentLoop uses the shared resolver and reuses the resolved language', () => {
        const loop = read('modules', 'services', 'AgentLoopService.ts');
        expect(loop).toContain('replyLanguageCode');
        expect(loop).toContain('const language = language0;');
    });
});

/**
 * THE BIDI CONTRACT — «بسبب كلمة Younes خربشة ترتيب الكلمات» (field report):
 * a Latin name inside an Arabic sentence scrambled the visual word order in
 * the production chat renderer. Every text block now resolves its own
 * direction (dir="auto") and isolates mixed runs (unicode-bidi: plaintext),
 * and the language contract tells the model to write names in the reply's
 * own script in the first place.
 */
describe('mixed-script messages render in logical order', () => {
    const webRead = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf-8');

    test('the production bubble and every markdown block carry dir="auto"', () => {
        const panel = webRead('components', 'ChatPanel.tsx');
        expect(panel).toContain('className="joe-message-bubble" dir="auto"');
        for (const tag of ['p', 'li', 'ul', 'ol', 'h1', 'blockquote']) {
            expect(panel).toContain(`<${tag} dir="auto"`);
        }
    });

    test('unicode-bidi: plaintext isolates mixed runs in both chat renderers', () => {
        const css = webRead('styles', 'joe-premium.css');
        expect(css).toMatch(/\.joe-message-bubble p,[\s\S]{0,400}unicode-bidi: plaintext/);
        expect(css).toMatch(/\.chat-bubble-content[\s\S]{0,400}unicode-bidi: plaintext/);
    });

    test('the language contract covers personal names (Younes → يونس)', () => {
        const loop = read('modules', 'services', 'AgentLoopService.ts');
        expect(loop).toContain('Younes → يونس');
        expect(loop).toContain('never mix a Latin name into an Arabic sentence');
    });
});
