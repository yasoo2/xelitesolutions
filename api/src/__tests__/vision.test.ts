/**
 * VISION — the last attachment gap. Text, PDF and Office reach Joe as
 * words; an image reached him as a filename. describeImageAttachments
 * turns each attached picture into a precise description before the
 * attachment block is built, via any OpenAI-compatible vision endpoint
 * (Groq's free llama-4 models with the user's key, or a local override).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describeImageAttachments, VISION_MAX_IMAGE_BYTES } from '../shared/vision';
import { formatAttachmentsBlock, type AttachmentInput } from '../shared/attachments';

const PNG_1x1 = Buffer.from(
    'iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-vision-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; delete process.env.JOE_VISION_BASE_URL; delete process.env.JOE_VISION_MODEL; });

function imageAtt(name = 'shot.png', bytes: Buffer = PNG_1x1): AttachmentInput {
    const p = path.join(tmp, name);
    fs.writeFileSync(p, bytes);
    return { name, mimeType: 'image/png', size: bytes.length, content: '', path: p };
}

describe('vision — the image becomes a scene', () => {
    test('the request is a real vision call: model + prompt + the image as a base64 data URL', async () => {
        let seen: any = null;
        global.fetch = (async (url: any, init: any) => {
            seen = { url: String(url), body: JSON.parse(init.body) };
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'لقطة شاشة لواجهة داكنة فيها زر أخضر مكتوب عليه إرسال' } }] }) } as any;
        }) as any;
        process.env.JOE_VISION_BASE_URL = 'http://fake-vision.local/v1';
        process.env.JOE_VISION_MODEL = 'llava-test';

        const att = imageAtt();
        const r = await describeImageAttachments([att], { language: 'ar' });

        expect(r.described).toBe(1);
        expect(seen.url).toBe('http://fake-vision.local/v1/chat/completions');
        expect(seen.body.model).toBe('llava-test');
        const content = seen.body.messages[0].content;
        expect(content.find((c: any) => c.type === 'image_url').image_url.url)
            .toBe(`data:image/png;base64,${PNG_1x1.toString('base64')}`);
        expect(content.find((c: any) => c.type === 'text').text).toContain('صِف هذه الصورة');
        // …and the description became the attachment's content.
        expect(att.content).toContain('زر أخضر');
        expect(att.visionDescribed).toBe(true);
    });

    test('the formatter labels a described image as ANALYZED, keeping the disk path', () => {
        const block = formatAttachmentsBlock([{
            name: 'shot.png', mimeType: 'image/png', size: 1000,
            content: 'واجهة تسجيل دخول بحقلين وزر أزرق', path: '/uploads/shot.png', visionDescribed: true,
        }]);
        expect(block).toContain('ANALYZED by a vision model');
        expect(block).toContain('واجهة تسجيل دخول');
        expect(block).toContain('/uploads/shot.png');
    });

    test('no provider configured → images stay honestly declared, nothing invented', async () => {
        const savedKey = process.env.GROQ_API_KEY;
        delete process.env.GROQ_API_KEY;
        try {
            const att = imageAtt('lonely.png');
            const r = await describeImageAttachments([att], { language: 'ar' });
            expect(r.described).toBe(0);
            expect(att.content).toBe('');
            expect(formatAttachmentsBlock([att])).toContain('binary image file');
        } finally { if (savedKey !== undefined) process.env.GROQ_API_KEY = savedKey; }
    });

    test('a failing endpoint is survived — the run never dies for a picture', async () => {
        global.fetch = (async () => { throw new Error('boom'); }) as any;
        process.env.JOE_VISION_BASE_URL = 'http://fake-vision.local/v1';
        const att = imageAtt('unlucky.png');
        const r = await describeImageAttachments([att], { language: 'ar' });
        expect(r.described).toBe(0);
        expect(r.skipped).toBe(1);
        expect(att.content).toBe('');
    });

    test('an image over the endpoint limit is skipped WITH an honest note', async () => {
        global.fetch = (async () => { throw new Error('must not be called'); }) as any;
        process.env.JOE_VISION_BASE_URL = 'http://fake-vision.local/v1';
        const big = imageAtt('huge.png', Buffer.alloc(VISION_MAX_IMAGE_BYTES + 1000, 7));
        const r = await describeImageAttachments([big], { language: 'ar' });
        expect(r.described).toBe(0);
        expect(big.content).toContain('أكبر من حد التحليل البصري');
    });

    test('non-images and already-described images are never re-sent', async () => {
        let calls = 0;
        global.fetch = (async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'desc desc desc' } }] }) } as any; }) as any;
        process.env.JOE_VISION_BASE_URL = 'http://fake-vision.local/v1';
        const doc: AttachmentInput = { name: 'a.txt', mimeType: 'text/plain', size: 3, content: 'hi', path: '/x' };
        const done: AttachmentInput = { ...imageAtt('done.png'), content: 'already seen', visionDescribed: true };
        await describeImageAttachments([doc, done], { language: 'en' });
        expect(calls).toBe(0);
    });

    test('Groq vision models are DISCOVERED from the live catalog, not hardcoded', async () => {
        // The field failure: both pinned llama-4 ids answered 404 on the
        // user's machine. The chain must ask /models and use what exists.
        const calls: Array<{ url: string; body?: any }> = [];
        global.fetch = (async (url: any, init: any) => {
            calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
            if (String(url).endsWith('/models')) {
                return {
                    ok: true, json: async () => ({
                        data: [
                            { id: 'llama-3.3-70b-versatile' },
                            { id: 'qwen-2.5-vl-72b-instruct' },
                            { id: 'meta-llama/llama-4-scout-17b-16e-instruct' },
                        ],
                    }),
                } as any;
            }
            return { ok: true, json: async () => ({ choices: [{ message: { content: 'وصف بصري كامل للمشهد كما طُلب' } }] }) } as any;
        }) as any;
        const saved = process.env.GROQ_API_KEY;
        process.env.GROQ_API_KEY = 'gsk_test';
        try {
            const att = imageAtt('cat.png');
            const r = await describeImageAttachments([att], { language: 'ar' });
            expect(r.described).toBe(1);
            expect(calls[0].url).toContain('/models');
            const chat = calls.find(c => c.url.endsWith('/chat/completions'));
            // A DISCOVERED vision id was used — scout outranks the generic vl model.
            expect(chat?.body?.model).toBe('meta-llama/llama-4-scout-17b-16e-instruct');
            expect(att.visionDescribed).toBe(true);
        } finally {
            if (saved !== undefined) process.env.GROQ_API_KEY = saved; else delete process.env.GROQ_API_KEY;
        }
    });

    test('the run actually invokes the vision pass before building the block', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'services', 'AgentLoopService.ts'), 'utf-8');
        expect(src).toContain('describeImageAttachments(options.attachments || []');
        expect(src.indexOf('describeImageAttachments')).toBeLessThan(src.indexOf('const attachBlock = formatAttachmentsBlock'));
    });
});
