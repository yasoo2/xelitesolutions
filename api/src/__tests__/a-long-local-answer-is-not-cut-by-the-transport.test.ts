import http from 'http';
import fs from 'fs';
import path from 'path';
import { AddressInfo } from 'net';
import { loopbackFetch, localInferenceFetch } from '../core/llm/providers/loopback-fetch';

/**
 * Eval round 6, 2026-10-23: local plans armed for 30 min failed at 311-414 s;
 * instrumented, the rejection was UND_ERR_HEADERS_TIMEOUT after 312 433 ms.
 * Node's fetch waits 300 s for response headers, and a non-streamed Ollama
 * answer sends none until its last token. Local inference goes through a
 * transport whose only deadline is the caller's signal.
 */
// undici is the library behind Node's fetch; it is not a declared dependency,
// so the demonstration of the cut runs only where it is installed.
let undici: any;
try { undici = require('undici'); } catch { undici = undefined; }
let server: http.Server;
let base = '';
let headerDelayMs = 0;
beforeAll(async () => {
    server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
            if (req.url === '/redirect') { res.writeHead(302, { Location: '/x' }); res.end(); return; }
            if (req.url === '/hang') return;
            setTimeout(() => {
                res.writeHead(200, { 'Content-Type': 'application/x-ndjson', 'X-Echo-Method': req.method || '' });
                res.write(JSON.stringify({ got: body }) + '\n');
                setTimeout(() => res.end(JSON.stringify({ done: true }) + '\n'), 50);
            }, headerDelayMs);
        });
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }));
afterEach(() => { headerDelayMs = 0; });

describe('a long local answer is not cut by the transport', () => {
    it('headers later than fetch\'s headers timeout: fetch dies, the local transport answers', async () => {
        // The same class of cut at a test-sized scale: an undici dispatcher with a
        // 200 ms headers timeout stands in for the 300 s one that cut Joe's calls.
        headerDelayMs = 3000; // undici checks its timers coarsely (~1 s ticks)
        const dispatcher = new undici.Agent({ headersTimeout: 200 });
        try {
            await expect(undici.fetch(`${base}/api/chat`, { method: 'POST', body: '{}', dispatcher }))
                .rejects.toMatchObject({ cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } });
            const response = await loopbackFetch(`${base}/api/chat`, { method: 'POST', body: '{}' });
            expect(response.status).toBe(200);
            expect(await response.text()).toContain('"done":true');
        } finally { await dispatcher.close(); }
    });

    it('posts the body and streams the answer back as a web Response', async () => {
        const response = await loopbackFetch(`${base}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"q":"مرحبا"}' });
        expect(response.status).toBe(200);
        expect(response.headers.get('x-echo-method')).toBe('POST');
        const text = await response.text();
        expect(text).toContain('{\\"q\\":\\"مرحبا\\"}');
        expect(text).toContain('"done":true');
    });

    it('the caller\'s signal is the deadline: aborting a request that never answers ends it', async () => {
        const controller = new AbortController();
        const pending = loopbackFetch(`${base}/hang`, { method: 'POST', body: '{}', signal: controller.signal });
        setTimeout(() => controller.abort(), 100);
        await expect(pending).rejects.toBeDefined();
    });

    it('refuses redirects when asked, and anything that is not loopback http', async () => {
        await expect(loopbackFetch(`${base}/redirect`, { redirect: 'error' })).rejects.toThrow(/redirect/i);
        await expect(loopbackFetch('https://example.com/api/chat')).rejects.toThrow(/loopback/);
    });

    it('until the server installs it, the global fetch (a double, the network guard) is used as is', () => {
        expect(localInferenceFetch()).toBe(globalThis.fetch);
    });

    it('once installed, loopback hosts go through it and remote hosts keep the global fetch', async () => {
        await jest.isolateModulesAsync(async () => {
            const isolated = require('../core/llm/providers/loopback-fetch');
            const original = globalThis.fetch;
            const remote = jest.fn().mockResolvedValue(new Response('remote'));
            (globalThis as any).fetch = remote;
            try {
                isolated.installLoopbackInferenceTransport();
                const transport = isolated.localInferenceFetch();
                const local = await transport(`${base}/api/chat`, { method: 'POST', body: '{}' });
                expect(await local.text()).toContain('"done":true');
                expect(remote).not.toHaveBeenCalled();
                expect(await (await transport('https://example.com/x')).text()).toBe('remote');
            } finally { (globalThis as any).fetch = original; }
        });
    });

    it('every local inference path uses it instead of the bare global fetch', () => {
        const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', p), 'utf8');
        expect(read('providers/managed-ollama-chat.ts')).toContain('(dependencies.fetch ?? localInferenceFetch())(endpoint.toString()');
        expect(read('providers/managed-ollama-chat.ts')).not.toContain('dependencies.fetch ?? globalThis.fetch');
        expect(read('structured.ts')).toContain('await localInferenceFetch()(`${host}/api/generate`');
        expect(fs.readFileSync(path.join(__dirname, '..', 'api', 'index.ts'), 'utf8')).toContain('installLoopbackInferenceTransport();');
    });
});
