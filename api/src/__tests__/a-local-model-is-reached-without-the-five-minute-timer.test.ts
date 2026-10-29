import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { installLoopbackInferenceTransport, localInferenceFetch } from '../core/llm/providers/loopback-fetch';
import { askLocalStructured } from '../core/llm/structured';
import { isThisMachineEndpoint } from '../shared/this-machine-host';

/**
 * Round 22 (the server fork's notes, measured at integration): the inference
 * transport that drops undici's 300 s header timer — eval round 6: every
 * non-streamed local answer longer than five minutes was cut — served only the
 * three canonical loopback spellings and only the callers that asked for it.
 * Ollama at OLLAMA_HOST=0.0.0.0 (its own Linux server value), another spelling
 * of 127.0.0.1, and a vLLM or LM Studio server reached through the OpenAI
 * library all went through undici. And a bare OLLAMA_HOST («127.0.0.1:11434»,
 * as Ollama itself accepts it) made every structured call answer nothing.
 *
 * Real servers on this machine answer below; the global fetch is a spy that
 * must not be reached for them.
 */
let server: http.Server;
let port = 0;
const seen: Array<{ url: string; authorization: string; body: string }> = [];
const savedFetch = globalThis.fetch;
const savedEnv = { OLLAMA_HOST: process.env.OLLAMA_HOST, LOCAL_LLM_MODEL: process.env.LOCAL_LLM_MODEL };

beforeAll(async () => {
    server = http.createServer((req, res) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            seen.push({ url: String(req.url), authorization: String(req.headers.authorization || ''), body });
            res.setHeader('content-type', 'application/json');
            if (req.url === '/api/generate') return res.end(JSON.stringify({ response: '{"tables":["patients"]}', done: true }));
            res.end(JSON.stringify({ ok: true }));
        });
    });
    await new Promise<void>(resolve => server.listen(0, '0.0.0.0', resolve));
    port = (server.address() as AddressInfo).port;
    installLoopbackInferenceTransport();
});
afterAll(async () => {
    globalThis.fetch = savedFetch;
    for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { seen.length = 0; globalThis.fetch = savedFetch; });

describe('a local model is reached without the five-minute timer', () => {
    it('any spelling of this machine is this machine; another host is not', () => {
        for (const host of ['http://127.0.0.1:1', 'http://127.1:1', 'http://2130706433:1', 'http://0.0.0.0:11434', 'http://localhost:8000', 'http://[::1]:1', '0.0.0.0:11434']) {
            expect([host, isThisMachineEndpoint(host)]).toEqual([host, true]);
        }
        expect(isThisMachineEndpoint('https://api.example.com/v1')).toBe(false);
        expect(isThisMachineEndpoint('http://10.255.255.1:11434')).toBe(false);
    });

    it('a call to 0.0.0.0 or 127.1 goes through the timer-free transport, headers of any form intact', async () => {
        const spy = jest.fn(savedFetch);
        globalThis.fetch = spy as any;
        for (const host of ['0.0.0.0', '127.1']) {
            // The OpenAI library hands its headers over as a Headers object.
            const res = await localInferenceFetch()(`http://${host}:${port}/v1/chat/completions`, {
                method: 'POST', headers: new Headers({ authorization: 'Bearer local-key', 'content-type': 'application/json' }), body: '{"x":1}',
            });
            expect(await res.json()).toEqual({ ok: true });
        }
        expect(spy).not.toHaveBeenCalled();
        expect(seen.map(s => [s.url, s.authorization, s.body])).toEqual([
            ['/v1/chat/completions', 'Bearer local-key', '{"x":1}'],
            ['/v1/chat/completions', 'Bearer local-key', '{"x":1}'],
        ]);
    });

    it('a host on another machine still goes through the global fetch', async () => {
        const spy = jest.fn(async () => new Response('{}'));
        globalThis.fetch = spy as any;
        await localInferenceFetch()('https://api.example.com/v1/chat/completions', { method: 'POST', body: '{}' });
        expect(spy).toHaveBeenCalledTimes(1);
    });

    it('OLLAMA_HOST written as Ollama accepts it, without a scheme, is the same server', async () => {
        process.env.OLLAMA_HOST = `127.0.0.1:${port}`;
        process.env.LOCAL_LLM_MODEL = 'qwen3.5:9b';
        const answer = await askLocalStructured({ prompt: 'Which tables?', schema: { type: 'object' }, timeoutMs: 20_000 });
        expect(answer).toEqual({ tables: ['patients'] });
        expect(seen.map(s => s.url)).toEqual(['/api/generate']);
    }, 60_000);
});
