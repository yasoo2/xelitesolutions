/** Real React/browser state checks with deterministic HTTP and stream boundaries. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium, Route } from 'playwright';

async function main() {
    const webRoot = path.resolve(__dirname, '../../../../web');
    const bundle = await build({
        stdin: {
            contents: `import React from 'react';
                import { createRoot } from 'react-dom/client';
                import { flushSync } from 'react-dom';
                import EmbeddedBrowser from './src/components/EmbeddedBrowser';
                const root = createRoot(document.getElementById('root'));
                window.renderSession = sessionId => flushSync(() => root.render(React.createElement(EmbeddedBrowser, { sessionId })));`,
            resolveDir: webRoot,
        },
        bundle: true, write: false, platform: 'browser', format: 'iife',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'controlled-stream-boundaries', setup(builder) {
            builder.onResolve({ filter: /^(\.\/ModernBrowserStream|\.\/MyBrowserView|react-i18next|\.\.\/config)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents:
                args.path === 'react-i18next' ? 'export const useTranslation = () => ({t: key => key});' :
                args.path === '../config' ? 'export const API_URL = "/api";' :
                'export default function Stream() { return null; }',
            }));
        } }],
    });
    const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1100, height: 600 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const pending = new Map<string, Route>();
    const checks: string[] = [];
    try {
        await page.route('http://navigation.test/**', async route => {
            if (new URL(route.request().url()).pathname === '/api/browser/nav/goto') {
                pending.set(route.request().postDataJSON().url, route);
                return;
            }
            if (new URL(route.request().url()).pathname === '/api/extension/status') {
                await route.fulfill({ json: { connected: false } });
                return;
            }
            await route.fulfill({ contentType: 'text/html', body: '<div id="root" style="height:500px"></div>' });
        });
        await page.goto('http://navigation.test/');
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        const render = (sid: string) => page.evaluate(id => (window as any).renderSession(id), sid);
        const signal = (type: string, detail: object) => page.evaluate(({ type, detail }) => window.dispatchEvent(new CustomEvent(type, { detail })), { type, detail });
        const urlBar = page.locator('.joe-browser-url-bar');
        const navigate = async (url: string, sid = 'browser:one') => {
            await signal('joe:browser-navigate', { sessionId: sid, url });
            const deadline = Date.now() + 5000;
            while (!pending.has(url) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
            assert(pending.has(url), `navigation not received: ${url}`);
        };
        const reply = async (url: string, status = 200, error?: string) => {
            const route = pending.get(url)!;
            pending.delete(url);
            await route.fulfill({ status, json: error ? { ok: false, error } : { ok: true, url } });
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        };
        await render('browser:one');
        await navigate('http://preview.test/old');
        await navigate('http://preview.test/latest');
        await reply('http://preview.test/latest');
        await reply('http://preview.test/old');
        assert.equal(await urlBar.innerText(), 'http://preview.test/latest');
        checks.push('stale success cannot replace latest URL');

        await signal('browser:session_status', { sessionId: 'browser:one' });
        await signal('browser:quality', { sessionId: 'browser:one', status: 'good' });
        await navigate('http://preview.test/old-error');
        await navigate('http://preview.test/newer');
        await reply('http://preview.test/old-error', 502, 'nav_goto_failed');
        assert.equal(await page.locator('button[title="browserRefresh"] svg').evaluate(el => (el as SVGElement).style.animationName), 'spin');
        await reply('http://preview.test/newer');
        assert.equal(await urlBar.innerText(), 'http://preview.test/newer');
        assert.equal(await urlBar.locator('svg').evaluate(el => getComputedStyle(el).color), 'rgb(34, 197, 94)');
        checks.push('stale failure preserves quality and latest loading');

        await navigate('http://preview.test/superseded');
        await reply('http://preview.test/superseded', 409, 'nav_superseded');
        assert.equal(await urlBar.innerText(), 'http://preview.test/newer');
        assert.equal(await urlBar.locator('svg').evaluate(el => getComputedStyle(el).color), 'rgb(34, 197, 94)');
        checks.push('server supersession is not a successful URL or degraded quality');

        await navigate('http://preview.test/failure');
        await reply('http://preview.test/failure', 502, 'nav_goto_failed');
        assert.equal(await urlBar.locator('svg').evaluate(el => getComputedStyle(el).color), 'rgb(245, 158, 11)');
        checks.push('genuine current failure remains visible');

        await navigate('http://preview.test/old-session');
        await render('browser:two');
        await reply('http://preview.test/old-session');
        assert.equal(await urlBar.innerText(), 'browserNoPageLoaded');
        checks.push('old session response cannot populate new session');
        await signal('browser:session_status', { sessionId: 'browser:one', url: 'http://preview.test/other-session' });
        assert.equal(await urlBar.innerText(), 'browserNoPageLoaded');
        checks.push('other session telemetry cannot populate current session');
        assert.deepEqual(errors, []);
        const evidence = path.resolve('data/tests/browser-navigation-ui');
        fs.mkdirSync(evidence, { recursive: true });
        await page.screenshot({ path: path.join(evidence, 'component.png') });
        fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ checks, errors, scope: 'Real EmbeddedBrowser and React in Chromium; controlled stream, translation, configuration and HTTP. Not full Joe UAT.' }, null, 2));
        console.log(JSON.stringify({ passed: checks.length, checks, evidence }));
    } finally {
        await browser.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
