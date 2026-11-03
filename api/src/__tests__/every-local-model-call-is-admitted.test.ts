import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'net';
import { config } from '../shared/config';
import { RequestResourceManager, requestResourceManager } from '../core/resources/RequestResourceManager';
import { isLocalModelEndpoint } from '../core/resources/local-model-call';
import { askLocalStructured } from '../core/llm/structured';
import { routeToModel } from '../core/llm/intelligent-router';
import { describeImageAttachments } from '../shared/vision';
import { OpenAIProvider } from '../core/llm/providers/openai';
import { ImageGenerationTool } from '../modules/tools/definitions/ImageGenerationTool';
import audioRouter from '../api/routes/audio';

// Vision's verbatim layer has its own contract; here it must not load model assets.
jest.mock('../shared/ocr', () => ({ extractImageText: jest.fn(async () => '') }));

/**
 * Second review of round 21 (S6): the managed Ollama transport and
 * LocalProvider admit their model calls, but the same local model reached by
 * another spelling was not admitted at all — structured.ts's /api/generate for
 * OLLAMA_HOST=http://0.0.0.0:11434, the router's custom OpenAI-compatible
 * route at a local URL that is not the canonical one. Those calls ran beside
 * admitted work, and an install could unload the model they were using: the
 * idle-model unload is safe only because every model call holds the heavy lane
 * for its whole run.
 *
 * Every path that sends a model call to a server is driven below against a
 * real HTTP model server on this machine at a non-canonical address (a port
 * that is not 11434). While another heavy admission holds the lane, not one of
 * them may reach the server; once it is released, each one does.
 */
const GiB = 1024 ** 3;
const hits: Record<string, number> = {};
let server: http.Server;
let base = '';
const ENV_KEYS = ['OLLAMA_HOST', 'LOCAL_LLM_MODEL', 'AI_COST_POLICY', 'JOE_VISION_BASE_URL', 'JOE_VISION_MODEL', 'LOCAL_LLM_BASE_URL',
    'GROQ_API_KEY', 'OPENAI_API_BASE', 'OPENAI_MODEL', 'LLM7_BASE_URL', 'LLM7_MODEL', 'OPENAI_BASE_URL', 'OPENAI_API_KEY', 'TTS_BASE_URL', 'ENABLE_AUTH_BYPASS'];
const savedEnv: Record<string, string | undefined> = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
const restoreEnv = () => {
    for (const key of ENV_KEYS) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
};

beforeAll(async () => {
    server = http.createServer((req, res) => {
        const route = `${req.method} ${String(req.url).split('?')[0]}`;
        hits[route] = (hits[route] || 0) + 1;
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            res.setHeader('content-type', 'application/json');
            if (route === 'POST /api/generate') return res.end(JSON.stringify({ done: true, response: '{"ok":true}' }));
            if (route === 'POST /v1/chat/completions') return res.end(JSON.stringify({ id: 'c1', object: 'chat.completion', created: 1, model: 'local-model',
                choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'a local answer from the local model' } }] }));
            if (route === 'GET /v1/models') return res.end(JSON.stringify({ data: [{ id: 'local-model', model_type: 'chat' }] }));
            if (route === 'POST /v1/images/generations') return res.end(JSON.stringify({ created: 1, data: [{ url: 'http://127.0.0.1/image.png' }] }));
            if (route === 'POST /v1/audio/speech') { res.setHeader('content-type', 'audio/mpeg'); return res.end(Buffer.from('ID3-local-speech')); }
            res.statusCode = 404;
            res.end('{}');
        });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    // The suite's network guard stays in force for everything but this machine's model server.
    global.fetch = ((input: any, init?: any) => String(typeof input === 'string' ? input : input?.url ?? input).startsWith(`${base}/`)
        ? (global as any).__realFetch(input, init) : guardedFetch(input, init)) as any;
});
const guardedFetch = global.fetch;
afterAll(async () => {
    global.fetch = guardedFetch;
    restoreEnv();
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
afterEach(() => { jest.restoreAllMocks(); restoreEnv(); });

/** The real admission rules on a test-local manager with room to spare. */
function admittedThrough(manager: { withLocalModelCall: (...args: any[]) => any }) {
    const guard = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 8 * GiB, availableBytes: 8 * GiB }), sampleResidentInference: async () => 0 });
    const kinds: string[] = [];
    jest.spyOn(manager, 'withLocalModelCall').mockImplementation(((work: any, options: any) => {
        kinds.push(String(options?.kind));
        return guard.withLocalModelCall(work, options);
    }) as any);
    return { guard, kinds };
}

async function holdTheLane(guard: RequestResourceManager) {
    let release!: () => void;
    let entered!: () => void;
    const admitted = new Promise<void>(resolve => { entered = resolve; });
    const done = guard.withHeavy(() => new Promise<void>(resolve => { release = resolve; entered(); }), { kind: 'tool:npm_manager' });
    await admitted;
    return { release, done };
}

/** Start `call` while the lane is held: it must not reach `route` until the lane is released. */
async function waitsForTheLane<T>(guard: RequestResourceManager, route: string, call: () => Promise<T>): Promise<T> {
    const lane = await holdTheLane(guard);
    const before = hits[route] || 0;
    const pending = call();
    pending.catch(() => undefined);
    await new Promise(resolve => setTimeout(resolve, 400));
    expect({ route, reachedWhileHeld: (hits[route] || 0) - before }).toEqual({ route, reachedWhileHeld: 0 });
    lane.release();
    await lane.done;
    const result = await pending;
    expect({ route, reached: (hits[route] || 0) - before }).toEqual({ route, reached: 1 });
    return result;
}

describe('which addresses are this machine', () => {
    test.each([
        'http://127.0.0.1:11434', 'http://0.0.0.0:11434', 'http://127.1:8080/v1', 'http://2130706433:11434',
        'http://0x7f000001:1234/v1', 'http://localhost:1234/v1', 'http://LOCALHOST.:1234', 'http://joe.localhost:5000',
        'http://[::1]:11434', 'http://[::]:11434', 'http://[::ffff:127.0.0.1]:8080', '0.0.0.0:11434', '127.0.0.1',
        `http://${os.hostname()}:11434`,
    ])('%s is a server on this machine', endpoint => {
        expect(isLocalModelEndpoint(endpoint)).toBe(true);
    });

    it("an address of one of this machine's own interfaces is this machine", () => {
        const own = Object.values(os.networkInterfaces()).flat().find(entry => entry && entry.family === 'IPv4' && !entry.internal);
        if (own) expect(isLocalModelEndpoint(`http://${own.address}:11434`)).toBe(true);
    });

    test.each([
        'https://api.openai.com/v1', 'http://example.com:11434', 'https://api.llm7.io/v1', 'http://fake-vision.local/v1',
        'http://203.0.113.7:11434', '', 'not a url at all', 'ftp://127.0.0.1/model',
    ])('%p is not', endpoint => {
        expect(isLocalModelEndpoint(endpoint)).toBe(false);
    });
});

describe('every local model call is admitted for its whole run', () => {
    it('structured: Ollama at a non-canonical address (as OLLAMA_HOST=http://0.0.0.0:11434 is)', async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.OLLAMA_HOST = base;
        process.env.LOCAL_LLM_MODEL = 'local-model';
        const answer = await waitsForTheLane(guard, 'POST /api/generate',
            () => askLocalStructured({ prompt: 'name one table', schema: { type: 'object' }, timeoutMs: 20_000 }));
        expect(answer).toEqual({ ok: true });
        expect(kinds).toEqual(['structured-local-inference']);
    });

    it('structured: a wait that outlives its deadline is a queue refusal, and nothing is sent', async () => {
        const { guard } = admittedThrough(requestResourceManager);
        process.env.OLLAMA_HOST = base;
        process.env.LOCAL_LLM_MODEL = 'local-model';
        const lane = await holdTheLane(guard);
        const before = hits['POST /api/generate'] || 0;
        const error: any = await askLocalStructured({ prompt: 'x', schema: { type: 'object' }, timeoutMs: 300 }).catch(e => e);
        lane.release();
        await lane.done;
        expect(error.code).toBe('RESOURCE_QUEUE_TIMEOUT');
        expect((hits['POST /api/generate'] || 0) - before).toBe(0);
    });

    it("the router's custom OpenAI-compatible route at a local URL", async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.AI_COST_POLICY = 'allow_paid';
        const answer = await waitsForTheLane(guard, 'POST /v1/chat/completions', () => routeToModel(
            [{ role: 'user', content: 'say something' }], undefined, undefined, undefined, undefined, undefined, undefined,
            { modelConfig: { provider: 'openai', model: 'local-model', apiKey: 'sk-local-fixture', baseUrl: `${base}/v1` }, strictProviderCheck: true }));
        expect(answer).toContain('a local answer');
        expect(kinds).toEqual(['custom-local-inference']);
    });

    it('vision: a compatible vision server on this machine', async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.JOE_VISION_BASE_URL = `${base}/v1`;
        process.env.JOE_VISION_MODEL = 'llava-test';
        delete process.env.LOCAL_LLM_BASE_URL;
        delete process.env.GROQ_API_KEY;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-server-vision-'));
        try {
            const file = path.join(dir, 'shot.png');
            fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
            const att: any = { name: 'shot.png', mimeType: 'image/png', size: 70, content: '', path: file };
            const result = await waitsForTheLane(guard, 'POST /v1/chat/completions', () => describeImageAttachments([att], { language: 'en' }));
            expect(result.described).toBe(1);
            expect(kinds).toEqual(['vision-local-inference']);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('a cloud vision endpoint is not admitted as this machine\'s work', async () => {
        const { kinds } = admittedThrough(requestResourceManager);
        process.env.JOE_VISION_BASE_URL = 'http://fake-vision.local/v1';
        delete process.env.LOCAL_LLM_BASE_URL;
        delete process.env.GROQ_API_KEY;
        const realFetch = global.fetch;
        global.fetch = (async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'a picture of a remote thing' } }] }) })) as any;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-server-vision-'));
        try {
            const file = path.join(dir, 'shot.png');
            fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
            const result = await describeImageAttachments([{ name: 'shot.png', mimeType: 'image/png', size: 70, content: '', path: file } as any], { language: 'en' });
            expect(result.described).toBe(1);
            expect(kinds).toEqual([]);
        } finally { global.fetch = realFetch; fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('OPENAI_API_BASE at a compatible gateway on this machine', async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.OPENAI_API_BASE = `${base}/v1`;
        process.env.OPENAI_MODEL = 'local-model';
        const provider = new OpenAIProvider('sk-local-fixture');
        const answer = await waitsForTheLane(guard, 'POST /v1/chat/completions', () => provider.chatComplete([{ role: 'user', content: 'hi' }]));
        expect(answer).toContain('a local answer');
        expect(kinds).toEqual(['compatible-gateway-inference']);
    });

    it('LLM7_BASE_URL at a compatible server on this machine', async () => {
        let llm7: any;
        let manager: any;
        process.env.LLM7_BASE_URL = `${base}/v1`;
        process.env.LLM7_MODEL = 'local-model';
        jest.isolateModules(() => {
            llm7 = new (require('../core/llm/providers/llm7').LLM7Provider)();
            manager = require('../core/resources/RequestResourceManager').requestResourceManager;
        });
        const { guard, kinds } = admittedThrough(manager);
        const answer = await waitsForTheLane(guard, 'POST /v1/chat/completions', () => llm7.chatComplete([{ role: 'user', content: 'hi' }], 'local-model'));
        expect(answer).toContain('a local answer');
        expect(kinds).toEqual(['compatible-gateway-inference']);
    });

    it('an image server on this machine (OPENAI_BASE_URL)', async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.OPENAI_BASE_URL = `${base}/v1`;
        process.env.OPENAI_API_KEY = 'sk-local-fixture';
        process.env.AI_COST_POLICY = 'allow_paid';
        const realFetch = global.fetch;
        // The free provider is the internet's; here it is unreachable, so the configured server is asked.
        global.fetch = ((input: any, init?: any) => /pollinations/.test(String(input?.url || input))
            ? Promise.reject(new Error('offline')) : realFetch(input, init)) as any;
        try {
            const result: any = await waitsForTheLane(guard, 'POST /v1/images/generations', () => (ImageGenerationTool as any).execute({ prompt: 'a lighthouse' }, {}));
            expect(result.ok).toBe(true);
            expect(kinds).toEqual(['local-image-generation']);
        } finally { global.fetch = realFetch; }
    });

    it('a speech server on this machine (TTS_BASE_URL)', async () => {
        const { guard, kinds } = admittedThrough(requestResourceManager);
        process.env.TTS_BASE_URL = base;
        const app = express();
        app.use(express.json());
        app.use('/api/audio', audioRouter);
        const front = app.listen(0, '127.0.0.1');
        await new Promise(resolve => front.once('listening', resolve));
        try {
            const port = (front.address() as AddressInfo).port;
            const token = jwt.sign({ sub: 'owner', role: 'OWNER' }, config.jwtSecret);
            const reply = await waitsForTheLane(guard, 'POST /v1/audio/speech', () => (global as any).__realFetch(`http://127.0.0.1:${port}/api/audio/speech`, {
                method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ text: 'hello' }),
            }).then(async (r: Response) => ({ status: r.status, body: Buffer.from(await r.arrayBuffer()).toString() })));
            expect(reply).toEqual({ status: 200, body: 'ID3-local-speech' });
            expect(kinds).toEqual(['local-speech']);
        } finally {
            front.closeAllConnections?.();
            await new Promise(resolve => front.close(resolve));
        }
    });
});
