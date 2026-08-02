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
}));
import { routeToModel } from '../core/llm/intelligent-router';
import { CentralAnswerTool } from '../modules/tools/definitions/CentralAnswerTool';

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

    test('an English question is never touched by the Arabic enforcement', async () => {
        (routeToModel as jest.Mock).mockResolvedValueOnce(ENGLISH_REPLY);
        const tool = new CentralAnswerTool();
        const r: any = await tool.execute({ question: 'Please analyze this configuration file for me' }, { language: 'en' });
        expect(r.output).toBe(ENGLISH_REPLY);
        expect((routeToModel as jest.Mock).mock.calls.length).toBe(1);
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
