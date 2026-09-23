/** Bounded Chromium diagnosis; no provider calls or existing browser sessions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';

async function main() {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const server = http.createServer((request, response) => {
        if (request.url === '/slow.js') {
            const timer = setTimeout(() => {
                timers.delete(timer);
                if (!response.destroyed) response.end('window.moduleReady = true;');
            }, 2500);
            timers.add(timer);
            response.setHeader('Content-Type', 'text/javascript');
            return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(request.url === '/slow'
            ? '<!doctype html><title>Delayed module</title><script type="module" src="/slow.js"></script><p>Document committed</p>'
            : '<!doctype html><title>Ready</title><p>Ready</p>');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    try {
        browser = await chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}) });
        const page = await browser.newPage();
        const navigate = async (target: string, waitUntil: 'domcontentloaded' | 'networkidle') => {
            try {
                await page.goto(`${base}${target}`, { waitUntil, timeout: 1200 });
                return 'completed';
            } catch (error) {
                const message = String(error);
                if (/timeout/i.test(message)) return 'timeout';
                if (/interrupted|ERR_ABORTED/i.test(message)) return 'interrupted';
                throw error;
            }
        };
        assert.equal(await navigate('/ready', 'domcontentloaded'), 'completed');
        const simultaneous = await Promise.all([
            navigate('/ready', 'domcontentloaded'),
            navigate('/ready', 'networkidle'),
        ]);
        assert(simultaneous.every(result => result === 'completed' || result === 'interrupted'));
        const slow = [];
        for (let attempt = 0; attempt < 2; attempt++) {
            slow.push({ result: await navigate('/slow', 'domcontentloaded'),
                readyState: await page.evaluate(() => document.readyState) });
        }
        assert(slow.every(result => result.result === 'timeout'));
        assert(slow.every(result => result.readyState === 'interactive'));
        assert.equal(await navigate('/ready', 'domcontentloaded'), 'completed');
        console.log(JSON.stringify({ simultaneous, slow, recovery: 'completed',
            limitation: 'Controlled browser diagnosis, not a reproduction of the Joe UAT root cause.' }, null, 2));
    } finally {
        await browser?.close();
        for (const timer of timers) clearTimeout(timer);
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
