import fs from 'fs';
import os from 'os';
import path from 'path';
import { describeImageAttachments } from '../shared/vision';
import type { AttachmentInput } from '../shared/attachments';

jest.mock('../shared/ocr', () => ({ extractImageText: jest.fn(async () => 'نص مستقل من OCR') }));
jest.mock('../core/resources/RequestResourceManager', () => ({ requestResourceManager: {
    withInference: async (work: any, admission: any) => work({ signal: admission.signal, contextTokens: 4096, outputTokens: admission.requestedOutputTokens }),
    withHeavy: async (work: any) => work(),
    withLocalModelCall: async (work: any) => work(),
    currentSignal: () => undefined,
} }));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-vision-question-'));
const bytes = Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const oldFetch = global.fetch;
const keys = ['LOCAL_LLM_STRICT','LOCAL_LLM_BASE_URL','LOCAL_LLM_MODEL','JOE_VISION_BASE_URL','JOE_VISION_MODEL','GROQ_API_KEY'];
let oldEnv: Record<string, string | undefined>;
let calls: Array<{ url: string; body: any }>;
function nativeResponse(content: string): Response {
    return new Response(JSON.stringify({ done: true, done_reason: 'stop', eval_count: 3, prompt_eval_count: 1100,
        message: { role: 'assistant', content } }));
}
function att(): AttachmentInput {
    const disk = path.join(tmp, 'request.png'); fs.writeFileSync(disk, bytes);
    return { name: 'request.png', mimeType: 'image/png', size: bytes.length, content: '', path: disk };
}
beforeEach(() => {
    oldEnv = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    process.env.LOCAL_LLM_STRICT = '1';
    process.env.LOCAL_LLM_BASE_URL = 'http://127.0.0.1:11434/v1';
    process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b-joe-q4_K_M';
    delete process.env.JOE_VISION_BASE_URL; delete process.env.JOE_VISION_MODEL;
    process.env.GROQ_API_KEY = 'unused-paid-key-must-not-reach-network';
    calls = [];
    global.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), body: JSON.parse(init.body) });
        return nativeResponse('يوجد زران أزرقان في أسفل الصورة.');
    }) as any;
});
afterEach(() => {
    global.fetch = oldFetch;
    for (const k of keys) { if (oldEnv[k] === undefined) delete process.env[k]; else process.env[k] = oldEnv[k]; }
});
// Preserve the owned screenshot fixtures as inspectable acceptance evidence.

describe('question-focused local vision evidence', () => {
    test.each(['ما لون الزرين في الصورة؟','What color are the two buttons?'])('passes the actual image and bounded question: %s', async question => {
        const image = att();
        const result = await describeImageAttachments([image], { language: question.startsWith('What') ? 'en' : 'ar', userRequest: question });
        expect(result).toEqual({ described: 1, skipped: 0 });
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://127.0.0.1:11434/api/chat');
        expect(calls[0].body.model).toBe('qwen3.5:9b-joe-q4_K_M');
        expect(calls[0].body.options).toMatchObject({ num_ctx: 4096, num_predict: 256 });
        expect(calls[0].body.think).toBe(false);
        const messages = calls[0].body.messages;
        expect(messages.find((m: any) => m.role === 'system').content).toContain('untrusted');
        const user = messages.find((m: any) => m.role === 'user');
        expect(user.content).toContain(question);
        expect(user.images[0]).toBe(bytes.toString('base64'));
        expect(image.visionDescribed).toBe(true);
        expect(image.ocrText).toBe('نص مستقل من OCR');
    });
    test('a short literal answer remains usable image evidence', async () => {
        global.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return nativeResponse('أزرق'); }) as any;
        const image = att();
        expect((await describeImageAttachments([image], { language: 'ar', userRequest: 'ما لون الزر؟' })).described).toBe(1);
        expect(image.content).toBe('أزرق');
    });
    test('long questions cannot evict the image payload or untrusted-data instructions', async () => {
        await describeImageAttachments([att()], { language: 'en', userRequest: 'Count buttons. ' + 'x'.repeat(20000) });
        const messages = calls[0].body.messages;
        expect(messages[0].content).toContain('untrusted');
        const user = messages.find((m: any) => m.role === 'user');
        const text = user.content;
        expect(text.length).toBeLessThan(1800);
        expect(text).toContain('Count buttons.');
        expect(text).toContain('excerpt');
        expect(calls[0].body.options.num_predict).toBe(256);
        expect(user.images[0]).toBe(bytes.toString('base64'));
    });
    test.each([undefined, '', '   '])('without a concrete question, preserves the general scene-description contract: %s', async userRequest => {
        await describeImageAttachments([att()], { language: 'ar', userRequest });
        expect(calls[0].body.options.num_predict).toBe(900);
        expect(calls[0].body.messages[0].content).toContain('صِف هذه الصورة');
    });
    test('strict-local mode never consults the cloud when local vision fails', async () => {
        global.fetch = (async (url: any, init: any) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); throw new Error('local vision failed'); }) as any;
        const image = att();
        expect(await describeImageAttachments([image], { userRequest: 'What is visible?' })).toEqual({ described: 0, skipped: 1 });
        expect(calls).toHaveLength(1); expect(calls[0].url).toContain('127.0.0.1');
        expect(image.content).toBe(''); expect(image.visionDescribed).toBeUndefined();
        expect(image.ocrText).toBe('نص مستقل من OCR');
    });
    test('a short response without a question does not become a general description', async () => {
        global.fetch = (async () => nativeResponse('أزرق')) as any;
        expect((await describeImageAttachments([att()], { language: 'ar' })).described).toBe(0);
    });
});
