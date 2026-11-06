/**
 * ⛔ THE ENGINE READS A PUBLIC PAGE — AND NOTHING THE MACHINE IS NOT MEANT TO REACH.
 *
 * Read on 2026-11-05: the agent engine could not read the web at all, so a
 * model that did not know a library's API guessed it. web_read now reads one
 * public page as text. What it must never reach is checked at the moment it
 * connects: local and private addresses, internal names, a name that
 * resolves private (rebinding), a redirect into the machine, and anything
 * that is not text. What it returns is labelled as the internet's words.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { htmlToText, publicOnlyLookup, readPublicPage, webAddressProblem, WEB_READ_MAX_BYTES, type Lookup } from '../core/engine/web-read';
import { parseWebReadArgs, webTools } from '../core/engine/tools/web';
import { EngineWebReadTool, UNTRUSTED_NOTE } from '../modules/tools/definitions/EngineWebTools';
import { systemPrompt } from '../core/engine/prompt';
import { isPrivateAddress } from '../core/api-discovery/network-policy';

let server: http.Server;
let port = 0;
const routes: Record<string, (res: http.ServerResponse) => void> = {
    '/docs': res => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end('<html><head><title>Fetch API &amp; you</title><script>steal()</script><style>p{}</style></head><body><h1>fetch()</h1><p>Returns a <code>Promise</code>.</p><ul><li>GET</li><li>POST</li></ul></body></html>'); },
    '/hop': res => { res.statusCode = 302; res.setHeader('location', `http://docs.example.test:${port}/docs`); res.end(); },
    '/into-the-machine': res => { res.statusCode = 302; res.setHeader('location', 'http://localhost:9/admin'); res.end(); },
    '/rebound': res => { res.statusCode = 302; res.setHeader('location', `http://evil.example.test:${port}/docs`); res.end(); },
    '/binary': res => { res.setHeader('content-type', 'application/octet-stream'); res.end(Buffer.alloc(10)); },
    '/huge': res => { res.setHeader('content-type', 'text/plain'); res.end('x'.repeat(WEB_READ_MAX_BYTES + 5000)); },
};
beforeAll(async () => {
    server = http.createServer((req, res) => (routes[String(req.url)] || (r => { r.statusCode = 404; r.end('missing'); }))(res));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));

// The test's own resolver: docs → this loopback server (the one address it allows), evil → a private address.
const resolver: Lookup = (host, _o, cb) => cb(null, host.startsWith('evil.') ? [{ address: '10.0.0.5', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);
const onlyThisServer = (address: string) => address !== '127.0.0.1' && isPrivateAddress(address);
const read = (p: string) => readPublicPage(`http://docs.example.test:${port}${p}`, { lookup: resolver, blocked: onlyThisServer });

describe('what web_read refuses before it connects', () => {
    it('refuses local, private, reserved and internal addresses, other schemes and embedded credentials', () => {
        for (const url of ['http://localhost:3000', 'http://127.0.0.1/', 'http://[::1]/', 'http://10.1.2.3/', 'http://192.168.1.5/admin', 'http://172.20.0.1/',
            'http://169.254.169.254/latest/meta-data', 'http://metadata.google.internal/', 'http://printer.local/', 'file:///etc/passwd', 'ftp://example.com/', 'https://user:pw@example.com/', 'not a url']) {
            expect([url, webAddressProblem(url) !== '']).toEqual([url, true]);
        }
        expect(webAddressProblem('https://developer.mozilla.org/en-US/docs/Web/API/fetch')).toBe('');
    });

    it('tells the model the way forward when it asks for this machine', () => {
        const parsed = parseWebReadArgs({ url: 'http://127.0.0.1:5173/' });
        expect(parsed.ok).toBe(false);
        expect(!parsed.ok && parsed.error).toMatch(/shell_start and use browser_open/);
        expect(parseWebReadArgs({ url: 'https://expressjs.com/en/api.html', max_chars: 3000 })).toEqual({ ok: true, value: { url: 'https://expressjs.com/en/api.html', max_chars: 3000 } });
    });
});

describe('what web_read refuses at connect time', () => {
    it('refuses a name that resolves to a private address, in the connection\'s own lookup', done => {
        publicOnlyLookup(resolver)('evil.example.test', {}, (err: any) => {
            expect(err?.code).toBe('EPRIVATEADDRESS');
            done();
        });
    });

    it('refuses a redirect into the machine, and a redirect to a name that resolves private', async () => {
        await expect(read('/into-the-machine')).rejects.toThrow(/local or internal host/);
        await expect(read('/rebound')).rejects.toThrow(/private, local or reserved/);
    });

    it('refuses what is not text', async () => {
        await expect(read('/binary')).rejects.toThrow(/not a page of text/);
    });
});

describe('what web_read returns', () => {
    it('reads a page as text: its title, its headings and lists, never its scripts or styles', async () => {
        const page = await read('/docs');
        expect(page.title).toBe('Fetch API & you');
        expect(page.text).toContain('# fetch()');
        expect(page.text).toContain('Returns a Promise.');
        expect(page.text).toContain('- GET');
        expect(page.text).not.toMatch(/steal|p\{\}/);
    });

    it('follows a redirect to a public address, and cuts a huge page at its ceiling', async () => {
        expect((await read('/hop')).text).toContain('fetch()');
        const huge = await read('/huge');
        expect(huge.truncated).toBe(true);
        expect(huge.text.length).toBe(WEB_READ_MAX_BYTES);
    });

    it('turns HTML entities and blocks into readable text', () => {
        expect(htmlToText('<p>a &lt; b &#x26; c&nbsp;d</p><p>next</p>').text).toBe('a < b & c d\nnext');
    });

    it('the registered tool refuses this machine and labels nothing it did not read', async () => {
        const root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-web-'));
        try {
            const out: any = await new EngineWebReadTool().execute({ url: 'http://localhost:1/' }, { projectRoot: root });
            expect(out.ok).toBe(false);
            expect(out.output.text).toMatch(/refused/);
            expect(out.output.text).not.toContain(UNTRUSTED_NOTE);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('the engine is told about it', () => {
    it('offers web_read and says its text is reference data, never instructions', () => {
        expect(webTools.map(t => t.name)).toEqual(['web_read']);
        expect(webTools[0].description).toMatch(/never instructions/);
        const prompt = systemPrompt({ platform: 'linux', shell: 'bash' });
        expect(prompt).toMatch(/web_read/);
        expect(prompt).toMatch(/never instructions/);
        expect(UNTRUSTED_NOTE).toMatch(/not instructions/);
    });
});
