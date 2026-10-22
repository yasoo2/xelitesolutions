/**
 * THE LANGUAGE CONTRACT + THE FABRICATION BAN.
 *
 * Field case: an Arabic request got a fluent English reply — AND an
 * undescribed image was "analyzed" with invented metadata. Two contracts
 * enforce what instructions only requested. Current contract (verified in
 * CentralAnswerTool.ts): the correction re-answers the ORIGINAL question
 * with the prior draft kept as a separate assistant-role draft, exactly one
 * correction, and a failed/invalid/empty/error correction fails closed with
 * nonRecoverable (never keeps the wrong-language draft).
 */
// Tool bootstrap must use the declared synthetic test environment, never a real .env.
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));
import fs from 'fs';
import path from 'path';
import { arabicShare, hasUnrequestedAnswerScript } from '../shared/utils/language';
import { formatAttachmentsBlock } from '../shared/attachments';

jest.mock('../core/llm/intelligent-router', () => ({
  analyzeTask: jest.fn(() => ({ type: 'simple_chat', requiresTools: false })),
  routeToModel: jest.fn(),
  PROVIDER_FAILURE_PREFIX: '⚠️ تعذّر الوصول إلى محرّك الذكاء',
}));
jest.mock('../core/llm/selected-local-answer-budget', () => ({
  selectedLocalAnswerBudgetMs: jest.fn(() => 8000),
}));
import { routeToModel, PROVIDER_FAILURE_PREFIX } from '../core/llm/intelligent-router';
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

describe('central_answer — an Arabic question gets an Arabic answer, measured', () => {
    const QUESTION_AR = 'اشرح بالتفصيل ما هي الواجهة الأمامية في تطوير البرمجيات وكيف تتصل بالخادم من فضلك';
    const ENGLISH_DRAFT = 'The frontend is the user interface layer built with web languages; it talks to the server over the network protocol.';
    const ARABIC_FIXED = 'الواجهة الأمامية هي طبقة العرض التي يراها المستخدم وهي تتصل بالخادم لعرض البيانات وتحديث الشاشة باستمرار';
    const QUESTION_EN = 'Please explain in detail how the software frontend layer talks to the server over the network protocol';
    const ENGLISH_OK = 'The frontend is the user interface layer built with web languages; it talks to the server over the network protocol.';
    // Inert isolated-scope private marker: never a real secret, only proves
    // thrown-error text does not leak through the fail-closed result.
    const PRIVATE_MARKER = 'isolated-test-private-marker-5b28';

    beforeEach(() => (routeToModel as jest.Mock).mockReset());

    test('mocked provider sentinel matches the real router value', () => {
        expect(read('core', 'llm', 'intelligent-router.ts')).toContain(
            `export const PROVIDER_FAILURE_PREFIX = '${PROVIDER_FAILURE_PREFIX}';`,
        );
    });

    test('public fixtures sit on the expected sides of the enforcement thresholds', () => {
        expect(arabicShare(ENGLISH_DRAFT)).toBeLessThan(0.35);
        expect(arabicShare(ARABIC_FIXED)).toBeGreaterThanOrEqual(0.5);
        expect(hasUnrequestedAnswerScript(ARABIC_FIXED, QUESTION_AR, 'ar')).toBe(false);
        expect(hasUnrequestedAnswerScript(ENGLISH_DRAFT, QUESTION_EN, 'en')).toBe(false);
    });

    test('an English reply to an Arabic question is rewritten — and the rewrite ships', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockResolvedValueOnce(ARABIC_FIXED);
        const tool = new CentralAnswerTool();
        const parentContext: any = { language: 'ar' };
        const parentBefore = JSON.stringify(parentContext);
        const r: any = await tool.execute({ question: QUESTION_AR }, parentContext);
        expect(r.ok).toBe(true);
        expect(r.output).toBe(ARABIC_FIXED);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        const correctionMessages = (routeToModel as jest.Mock).mock.calls[1][0];
        expect(Array.isArray(correctionMessages)).toBe(true);
        expect(correctionMessages.length).toBe(4);
        expect(correctionMessages[1]).toMatchObject({ role: 'user', content: QUESTION_AR });
        expect(correctionMessages[2]).toMatchObject({ role: 'assistant', content: ENGLISH_DRAFT });
        expect(String(correctionMessages[3].content)).toContain('أجب عن السؤال الأصلي بالعربية');
        // Effective answer language is copied onto both router calls; parent untouched.
        expect((routeToModel as jest.Mock).mock.calls[0][7]).toMatchObject({ language: 'ar' });
        expect((routeToModel as jest.Mock).mock.calls[1][7]).toMatchObject({ language: 'ar' });
        expect((routeToModel as jest.Mock).mock.calls[0][7]).not.toBe(parentContext);
        expect((routeToModel as jest.Mock).mock.calls[1][7]).not.toBe(parentContext);
        expect(JSON.stringify(parentContext)).toBe(parentBefore);
        expect(String(r.logs.join(' '))).toContain('Arabic language correction completed');
    });

    test('a compliant Arabic reply is NOT taxed with a second model call', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ARABIC_FIXED);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.output).toBe(ARABIC_FIXED);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
    });

    test('an invalid correction fails closed — no wrong-language fallback, no draft leak', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockResolvedValueOnce(ENGLISH_DRAFT);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        expect(r.output).toMatchObject({ nonRecoverable: true, status: 'failed', reason: 'answer_language_invalid' });
        expect(r.output.correctionFailure).toBe('wrong_language');
        expect(JSON.stringify(r.output)).not.toContain(ENGLISH_DRAFT);
        expect(String(r.error || '')).not.toContain(ENGLISH_DRAFT);
        expect(String((r.logs || []).join(' '))).toContain('answer_language_invalid');
        expect(JSON.stringify(r)).not.toContain(ENGLISH_DRAFT);
    });

    test('an empty correction fails closed — no wrong-language fallback, no draft leak', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockResolvedValueOnce('');
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        expect(r.output).toMatchObject({ nonRecoverable: true, status: 'failed', reason: 'answer_language_invalid' });
        expect(r.output.correctionFailure).toBe('unusable_output');
        expect(JSON.stringify(r.output)).not.toContain(ENGLISH_DRAFT);
        expect(String(r.error || '')).not.toContain(ENGLISH_DRAFT);
        expect(String((r.logs || []).join(' '))).not.toContain(ENGLISH_DRAFT);
        expect(JSON.stringify(r)).not.toContain(ENGLISH_DRAFT);
    });

    test('a provider error on correction fails closed — no wrong-language fallback', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockRejectedValueOnce(new Error(`${PRIVATE_MARKER} provider down: ${ENGLISH_DRAFT}`));
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        expect(r.output).toMatchObject({ nonRecoverable: true, status: 'failed' });
        expect(r.output.reason).toBe('answer_provider_failed');
        expect(JSON.stringify(r.output)).not.toContain(ENGLISH_DRAFT);
        expect(JSON.stringify(r.output)).not.toContain(PRIVATE_MARKER);
        expect(String(r.error || '')).not.toContain(ENGLISH_DRAFT);
        expect(String(r.error || '')).not.toContain(PRIVATE_MARKER);
        expect(String((r.logs || []).join(' '))).not.toContain(ENGLISH_DRAFT);
        expect(String((r.logs || []).join(' '))).not.toContain(PRIVATE_MARKER);
        expect(JSON.stringify(r)).not.toContain(ENGLISH_DRAFT);
        expect(JSON.stringify(r)).not.toContain(PRIVATE_MARKER);
    });

    test('a provider-failure sentinel correction fails closed without draft leak', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockResolvedValueOnce(`${PROVIDER_FAILURE_PREFIX} isolated injected failure`);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        expect(r.output).toMatchObject({ nonRecoverable: true, status: 'failed', reason: 'answer_provider_failed' });
        expect(JSON.stringify(r.output)).not.toContain(ENGLISH_DRAFT);
        expect(String(r.error || '')).not.toContain(ENGLISH_DRAFT);
        expect(JSON.stringify(r)).not.toContain(ENGLISH_DRAFT);
    });

    test('a completion-limit sentinel correction fails closed with its own reason', async () => {
        (routeToModel as jest.Mock)
            .mockResolvedValueOnce(ENGLISH_DRAFT)
            .mockResolvedValueOnce(`${PROVIDER_FAILURE_PREFIX} completion_limit`);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_AR }, { language: 'ar' });
        expect(r.ok).toBe(false);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(2);
        expect(r.output).toMatchObject({ nonRecoverable: true, status: 'failed', reason: 'answer_completion_limit' });
        expect(JSON.stringify(r.output)).not.toContain(ENGLISH_DRAFT);
        expect(JSON.stringify(r)).not.toContain(ENGLISH_DRAFT);
    });

    test('an English question is never touched by the Arabic enforcement', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ENGLISH_OK);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_EN }, { language: 'en' });
        expect(r.output).toBe(ENGLISH_OK);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
    });

    // NEGATIVE — no caller-side language must still keep an English request English.
    test('an English question without a language stays English', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ENGLISH_OK);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: QUESTION_EN });
        expect(r.output).toBe(ENGLISH_OK);
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
 * messageLanguage is an independent message-script heuristic: the script of
 * the message decides, and the UI switcher only breaks ties. That is distinct
 * from the run-level resolver below (replyLanguageCode), which is UI-priority:
 * an explicit UI language wins for the whole run.
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
 * THE BIDI CONTRACT — a Latin name inside an Arabic sentence scrambled the
 * visual word order. Every text block now resolves its own direction
 * (dir="auto") and isolates mixed runs (unicode-bidi: plaintext).
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
