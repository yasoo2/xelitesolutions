/**
 * ⛔ THE INSPECTOR TELLS ONLY WHAT IS TRUE (design 2026-11-15 ui-inspection-revival-v3 §4–§6).
 *
 * The inspection is revived told-only: its lines never refuse a delivery, so
 * the one thing they owe the owner is to be TRUE. Every line `inspectUi`
 * writes on the 71 fixtures of the design's lab and its two reviews
 * (fixtures/ui-told, each with its truth.json) is checked here by a check that
 * does not share its measurement, on a fresh load of the page
 * (fixtures/ui-told/checks.ts, the lab's run3.js): colour under the words, the
 * page panned and the named items hit-tested, the visitor's reach, the tap
 * target found again and measured.
 *
 * And the pages of §5 — a busy photo, a gradient, chips moved by their own
 * buttons, a ticker, a carousel, «…» by design, card borders past the edge —
 * get none of the lines that were silenced because they were not true there.
 */
import http from 'http';
import { chromium, type Browser } from 'playwright';
import { inspectUi, applyViewportSize } from '../core/quality/ui-inspection';
import { getChromiumLaunchOptions } from '../modules/browser/manager';
import { fixtureNames, serveFixtures, verifyFindings } from './fixtures/ui-told/checks';

/** Lines a page must not get: the reason it was silenced in v3 (§5). */
const SILENCED: Record<string, string[]> = {
    'en-dark-text-busy-photo': ['low_contrast'],
    'en-hero-gradient-overlay': ['low_contrast'],
    'en-chips-scroll-arrows': ['content_unreachable', 'text_clipped'],
    'ar-ticker-left-anim': ['content_unreachable', 'text_clipped'],
    'x-carousel': ['content_unreachable', 'text_clipped'],
    'x-ellipsis-names': ['content_unreachable', 'text_clipped'],
    'en-truncate-span-cards': ['content_unreachable', 'text_clipped'],
    'ar-truncate-link-table': ['content_unreachable', 'text_clipped'],
    'ar-cards-negative': ['mobile_overflow'],
    'x-toast-parked': ['mobile_overflow', 'content_unreachable'],
    'x-modal-closed': ['mobile_overflow', 'content_unreachable'],
    'x-sr-only': ['text_clipped'],
};

/**
 * The time each page is given. This file asks whether a line is TRUE, not how fast it is found
 * (the bound has its own test, the-inspection-runs-on-a-real-page): measured 2–21 s a page on an idle
 * laptop, and 3–5 times that while the laptop runs other suites — so the deadline is generous, and
 * a page that still runs out of it fails here as «partial», never as a false line.
 */
const DEADLINE_MS = 120_000;

describe('every told line is true', () => {
    let browser: Browser;
    let server: http.Server;
    let base = '';
    beforeAll(async () => {
        browser = await chromium.launch(getChromiumLaunchOptions());
        server = await serveFixtures();
        base = `http://127.0.0.1:${(server.address() as any).port}`;
    }, 60_000);
    afterAll(async () => {
        await browser?.close();
        await new Promise<void>(r => server.close(() => r()));
    });

    const open = async (set: string, name: string) => {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.goto(`${base}/${set}/${name}/`, { waitUntil: 'load' });
        await page.waitForTimeout(250);
        return page;
    };

    for (const { set, name, truth } of fixtureNames()) {
        it(`${set}/${name} — ${truth.slice(0, 70)}`, async () => {
            const page = await open(set, name);
            const r = await inspectUi(page, { restore: { width: 1280, height: 900 }, deadline: Date.now() + DEADLINE_MS })
                .finally(() => page.close());
            expect(r.status).toBe('complete');
            const verdicts = await verifyFindings(r.findings, () => open(set, name), applyViewportSize);
            //  Named in the failure: which line, and what the separate check saw.
            expect(verdicts.filter(v => v.verdict === 'FALSE' || v.verdict === 'partly' || v.verdict === 'unverifiable')).toEqual([]);
            for (const code of SILENCED[name] || []) expect({ name, code, told: r.findings.some(f => f.code === code) }).toEqual({ name, code, told: false });
            //  «fragments into 1 rows» is not true of anything
            for (const f of r.findings.filter(x => x.code === 'mobile_header_fragmented')) expect(Number((f.evidence as any[])[0].rows)).toBeGreaterThanOrEqual(2);
            //  told only: no line the inspector writes refuses, except a page with no viewport meta
            expect(r.findings.filter(f => f.code === 'viewport_emulation_failed')).toEqual([]);
        }, DEADLINE_MS + 60_000);
    }
});
