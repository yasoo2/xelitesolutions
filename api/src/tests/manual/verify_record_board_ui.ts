import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { blueprintFor } from '../../core/design/app-blueprints';
import { buildAppFiles, fileAppCss } from '../../modules/tools/definitions/react-app-templates';

async function main() {
    const request = 'Build an equipment return board with title and a returned toggle.';
    const bp = blueprintFor('generic', request, false);
    assert.deepEqual(bp.fields.map(field => field.label), ['title', 'returned']);
    assert.equal(bp.fields[1].control, 'toggle');
    const files = buildAppFiles(bp, { brand: 'Equipment Returns', isArabic: false, storeKey: 'board-ui', sourceRequest: request }, 'board-ui');
    const webRoot = path.resolve(__dirname, '../../../../web');
    const bundle = await build({
        stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
            import RecordsApp from './src/components/RecordsApp.jsx'; import {content} from './src/content.js';
            createRoot(document.getElementById('root')).render(React.createElement(RecordsApp,{content}));`, resolveDir: webRoot },
        bundle: true, write: false, platform: 'browser', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'generated-files', setup(builder) {
            builder.onResolve({ filter: /^\./ }, args => {
                const key = path.posix.normalize(path.posix.join(args.namespace === 'generated' ? path.posix.dirname(args.importer) : '', args.path));
                return key in files ? { path: key, namespace: 'generated' } : undefined;
            });
            builder.onLoad({ filter: /.*/, namespace: 'generated' }, args => ({ contents: files[args.path], loader: args.path.endsWith('.jsx') ? 'jsx' : 'js', resolveDir: webRoot }));
        } }],
    });
    const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const browser = await chromium.launch({ headless: true, ...(fs.existsSync(executablePath) ? { executablePath } : {}) });
    const evidence = path.resolve('data/tests/record-board-ui');
    fs.mkdirSync(evidence, { recursive: true });
    const errors: string[] = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
        page.on('pageerror', error => errors.push(error.message));
        await page.route('http://board.test/**', route => route.fulfill({ contentType: 'text/html', body: `<style>:root{--text:#202427;--muted:#596264;--brand:#167a62;--border:#d5dcdf;--panel:#fff;--bg:#f7f9fa;--tint:#edf4f2} ${fileAppCss()}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>` }));
        await page.goto('http://board.test/');
        await page.locator('.board-lane').first().waitFor();
        assert.equal(await page.locator('.board-lane').count(), 2);
        await page.locator('input[name="title"]').fill('Camera kit');
        await page.locator('button[type="submit"]').click();
        await page.locator('.board-lane').filter({ hasText: 'No' }).locator('.row').waitFor();
        await page.locator('.row').getByRole('button', { name: 'Edit', exact: true }).click();
        await page.getByRole('switch').check();
        await page.locator('button[type="submit"]').click();
        const returned = page.locator('.board-lane').filter({ has: page.locator('.board-lane-title', { hasText: 'Yes' }) });
        await returned.locator('.row').waitFor();
        assert.equal(await returned.locator('.row').count(), 1);
        await page.reload();
        await returned.locator('.row').waitFor();
        assert.equal(await returned.locator('.row').count(), 1);
        await page.screenshot({ path: path.join(evidence, 'desktop.png'), fullPage: true, animations: 'disabled' });
        await page.setViewportSize({ width: 390, height: 844 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: path.join(evidence, 'mobile.png'), fullPage: true, animations: 'disabled' });
        assert.deepEqual(errors, []);
        fs.writeFileSync(path.join(evidence, 'report.json'), JSON.stringify({ request, lanes: 2, create: true, moveByEditing: true, persistence: true, mobileFits: true, errors, scope: 'Request-derived schema, generated records component and real store in Chromium; not the Joe orchestrator or API backend.' }, null, 2));
        console.log('Record board: create, edit/move, reload persistence and mobile fit passed. ' + evidence);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
