import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decode } from 'jpeg-js';

async function main() {
    const target = new URL(process.argv[2]);
    assert(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Use a local test preview');
    process.env.USE_USER_BROWSER_PROFILE = 'false';
    process.env.BROWSER_HEADLESS = 'true';
    const manager = await import('../../modules/browser/manager');
    const { applyViewportSize } = await import('../../core/quality/ui-inspection');
    const sid = `viewport-stream-proof-${Date.now()}`;
    const directory = path.resolve('data/tests', sid);
    fs.mkdirSync(directory, { recursive: true });
    const results: unknown[] = [];
    try {
        const session = await manager.getBrowserSession(sid);
        const page = session.page;
        await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        const maskedStreaming = process.env.JOE_VIEWPORT_MASK === '1';
        if (maskedStreaming) {
            const field = page.locator('input:visible').first();
            assert(await field.count(), 'A visible input is required for the masked-stream test');
            manager.setStreamMask(sid, [field]);
        }
        if (process.env.JOE_VIEWPORT_FORCE_CDP === '1') {
            // Reproduce the supported borrowed-page adapter whose normal
            // setter acknowledges changes without applying device metrics.
            page.setViewportSize = async () => { };
        }
        for (const streaming of [false, true]) {
            if (streaming) manager.startStreaming(sid);
            for (const width of [1280, 390, 820, 1280, 1280]) {
                const requested = { width, height: 900 };
                const measured = await applyViewportSize(page, width, requested.height);
                await page.waitForTimeout(300);
                const actual = await page.evaluate(() => ({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    clientWidth: document.documentElement.clientWidth,
                    phoneMedia: matchMedia('(max-width: 500px)').matches,
                }));
                results.push({ streaming, maskedStreaming, requested, measured, actual, playwright: page.viewportSize() });
                console.log(JSON.stringify(results[results.length - 1]));
                if (maskedStreaming) {
                    fs.writeFileSync(path.join(directory, `${streaming ? 'stream' : 'idle'}-${width}.jpg`),
                        await manager.screenshotSessionJpeg(sid));
                } else {
                    await page.screenshot({ path: path.join(directory, `${streaming ? 'stream' : 'idle'}-${width}.png`) });
                }
                assert.equal(actual.width, width, 'Document width must match the requested viewport');
                assert.equal(actual.height, requested.height, 'Document height must match the requested viewport');
                assert.equal(actual.phoneMedia, width <= 500, 'CSS media queries must match the viewport');
                if (streaming) {
                    const deadline = Date.now() + 2_000;
                    while (Date.now() < deadline) {
                        const frame = manager.sessionViewport(sid);
                        if (frame?.w === width && frame?.h === requested.height) break;
                        await page.waitForTimeout(100);
                    }
                    assert.deepEqual(manager.sessionViewport(sid), { w: width, h: requested.height },
                        'Published frame dimensions must follow the captured image, not cached Playwright dimensions');
                }
            }
        }
        if (process.argv[3]) {
            const { auditBuiltApp } = await import('../../core/quality/app-audit');
            const audit = await auditBuiltApp(path.resolve(process.argv[3]), {
                serveUrl: target.href,
                watchSessionId: sid,
                timeoutMs: 45_000,
                onProgress: message => console.log(`audit: ${message}`),
            });
            results.push({ audit });
            console.log(JSON.stringify({ score: audit.score, skipped: audit.skipped, findings: audit.findings }));
            assert(!audit.skipped, 'The actual audit must run');
            assert(!audit.findings.some(finding => /viewport emulation/i.test(JSON.stringify(finding))),
                'The full audit must retain working viewport control');
        }
        manager.stopStreaming(sid);
        const field = page.locator('input:visible').first();
        if (await field.count()) {
            manager.setStreamMask(sid, [field]);
            const box = await field.boundingBox();
            assert(box, 'Masked field must be measurable');
            const masked = await manager.screenshotSessionJpeg(sid);
            fs.writeFileSync(path.join(directory, 'masked.jpg'), masked);
            const pixels = decode(masked);
            const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            const x = Math.floor((box.x + box.width / 2) * pixels.width / viewport.width);
            const y = Math.floor((box.y + box.height / 2) * pixels.height / viewport.height);
            const offset = (y * pixels.width + x) * 4;
            assert(pixels.data[offset] > 220 && pixels.data[offset + 1] < 40 && pixels.data[offset + 2] > 220,
                'The captured image must actually obscure the configured field');
            results.push({ redactionMaskPassed: true });
        }
    } finally {
        fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify({ target: target.href, results }, null, 2));
        manager.stopStreaming(sid);
        await manager.stopSession(sid);
        console.log(`Evidence: ${directory}`);
    }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
