/**
 * LIVE ENGINE PIN for browser action-effect observation.
 *
 * The *-effect.test.ts family (210 tests) pins the comparison LOGIC with
 * fakes: given two snapshots, the effect is classified correctly. What no
 * durable test pins is observation TRUTH against a real engine: that the
 * fingerprint script executes on a live page, that a real DOM mutation
 * classifies as an effect, that an inert click honestly reports no effect,
 * that a real page error lands in the telemetry delta, and that the
 * typed-value repair loop works against a live field.
 *
 * This file pins exactly that, against an isolated real Chromium page and
 * a fixture that belongs to no product prompt. Fail-closed with no
 * browser (requireChromiumOrThrow); JOE_ALLOW_NO_BROWSER=1 is the only
 * skip, and it says its green proves nothing. No user profile is touched:
 * the browser is launched with a default automation context and the
 * telemetry session id is probe-local.
 */
import http from 'http';
import { requireChromiumOrThrow } from './helpers/require-chromium';
import {
    CLICK_FINGERPRINT_SCRIPT,
    compareClickEffect,
    ensureTypedValue,
    type ClickContext,
    type FieldOps,
} from '../modules/browser/actionVerification';
import {
    disposeBrowserTelemetry,
    ensureBrowserTelemetry,
    getBrowserTelemetryErrorCounts,
} from '../modules/browser/telemetry';

const SID = 'effect-live-probe';
const CLICK_SETTLE_MS = 250; // executor settle parity: the same pause the click path waits before comparing

const FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>Effect Probe</title>
<link rel="icon" href="data:,">
</head><body>
<h1 id="title">Effect Probe</h1>
<ul id="items"></ul>
<button id="add" type="button">Add</button>
<input id="name" type="text" value="">
<button id="boom" type="button">Boom</button>
<script>
document.getElementById('add').addEventListener('click', () => {
    const li = document.createElement('li');
    li.textContent = 'item ' + (document.querySelectorAll('#items li').length + 1);
    document.getElementById('items').appendChild(li);
});
document.getElementById('boom').addEventListener('click', () => {
    throw new Error('live-probe-boom');
});
</script>
</body></html>`;

describe('browser action effects observed on a live engine', () => {
    jest.setTimeout(180_000);
    let browser: any = null;
    let context: any = null;
    let page: any = null;
    let server: http.Server | null = null;
    let url = '';

    beforeAll(async () => {
        browser = await requireChromiumOrThrow('effect-live');
        // Null only under explicit JOE_ALLOW_NO_BROWSER=1 (the helper throws
        // otherwise); the loud skip was already logged there.
        if (!browser) return;
        server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(FIXTURE);
        });
        await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        url = `http://127.0.0.1:${port}/`;
        context = await browser.newContext();
        page = await context.newPage();
        ensureBrowserTelemetry(SID, page);
        await page.goto(url);
    });

    afterAll(async () => {
        try { disposeBrowserTelemetry(SID); } catch { /* probe-local cleanup */ }
        try { await page?.close(); } catch { /* already gone */ }
        try { await context?.close(); } catch { /* already gone */ }
        try { await browser?.close(); } catch { /* already gone */ }
        if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
        server = null;
    });

    async function liveSnapshot(): Promise<ClickContext> {
        const fingerprint = await page.evaluate(CLICK_FINGERPRINT_SCRIPT);
        const errors = getBrowserTelemetryErrorCounts(SID) ?? null;
        return { fingerprint, errors };
    }

    function errorTotal(): number {
        const c = getBrowserTelemetryErrorCounts(SID);
        return (c?.js ?? 0) + (c?.console ?? 0) + (c?.network ?? 0);
    }

    async function waitForErrorDelta(before: number, timeoutMs = 3000): Promise<number> {
        const start = Date.now();
        for (;;) {
            const total = errorTotal();
            if (total > before) return total;
            if (Date.now() - start > timeoutMs) return total;
            await new Promise((r) => setTimeout(r, 50));
        }
    }

    it('a click that mutates the DOM is observed as an effect', async () => {
        // Reachable only under explicit JOE_ALLOW_NO_BROWSER=1: without the
        // opt-out the beforeAll above already failed the suite.
        if (!browser || !page) return;
        const before = await liveSnapshot();
        await page.locator('#add').click();
        await page.waitForTimeout(CLICK_SETTLE_MS);
        const after = await liveSnapshot();
        const effect = compareClickEffect(before, after);
        expect(effect.readOk).toBe(true);
        expect(effect.navigated).toBe(false);
        expect(effect.domChanged).toBe(true);
        expect(effect.effectObserved).toBe(true);
        expect(effect.runtimeErrors).toBe(0);
        expect(await page.locator('#items li').count()).toBe(1);
    });

    it('a click that changes nothing reports an honest no-effect', async () => {
        if (!browser || !page) return;
        const before = await liveSnapshot();
        await page.locator('#title').click();
        await page.waitForTimeout(CLICK_SETTLE_MS);
        const after = await liveSnapshot();
        const effect = compareClickEffect(before, after);
        expect(effect.readOk).toBe(true);
        expect(effect.navigated).toBe(false);
        expect(effect.domChanged).toBe(false);
        expect(effect.effectObserved).toBe(false);
    });

    it('a typed value is verified and repaired against the live field', async () => {
        if (!browser || !page) return;
        const ops: FieldOps = {
            read: async () => page.inputValue('#name'),
            clearAndSet: async (text: string) => { await page.fill('#name', text); },
        };
        await page.fill('#name', 'alpha');
        const repaired = await ensureTypedValue(ops, 'beta');
        expect(repaired).toMatchObject({ match: true, readOk: true, repaired: true });
        expect(await page.inputValue('#name')).toBe('beta');
        const steady = await ensureTypedValue(ops, 'beta');
        expect(steady).toMatchObject({ match: true, readOk: true, repaired: false });
    });

    it('a click that throws in the page counts a runtime error', async () => {
        if (!browser || !page) return;
        const before = await liveSnapshot();
        const beforeTotal = errorTotal();
        await page.locator('#boom').click();
        const afterTotal = await waitForErrorDelta(beforeTotal);
        expect(afterTotal).toBeGreaterThan(beforeTotal);
        const after = await liveSnapshot();
        const effect = compareClickEffect(before, after);
        expect(effect.readOk).toBe(true);
        expect(effect.runtimeErrors).toBeGreaterThanOrEqual(1);
    });
});
