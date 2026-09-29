import fs from 'fs';
import http from 'http';
import path from 'path';

import { blueprintFor } from '../core/design/app-blueprints';
import { requireChromiumOrThrow } from './helpers/require-chromium';

/**
 * THE STATIC FALLBACK HEADER MUST FIT THE MOBILE GATE IT IS JUDGED BY.
 *
 * Real-UI evidence (run-1790704292481, run27 RESULT.md): Joe delivered a
 * working dependency-free static records app showing all 5 requested rows,
 * yet the run ended failed/0-of-1 because Browser QA measured the mobile
 * header at 154px — above the 144px `mobile_header_fragmented` gate. An
 * independent fresh-profile replay confirmed HEADER.top = 154px at 390px
 * (identity div 83px + count line stacked, no horizontal overflow), so the
 * QA reading is CORRECT and the generator template is the defect.
 *
 * Contract pinned here, for every static records bundle:
 *
 *   1. At 390px the rendered `header.top` is at most 144px tall with both
 *      the run27-faithful header text AND unseen transfer wording.
 *   2. At 320px there is no horizontal overflow and the title + count
 *      stay visible and on-screen.
 *   3. At 1280px the desktop header keeps its single-band layout.
 *   4. The Arabic RTL bundle obeys the same mobile bound.
 *
 * The suite fails closed: no launchable Chromium means the suite FAILS.
 * Set JOE_ALLOW_NO_BROWSER=1 for an explicit loud skip in browserless
 * environments.
 */

// Scratch lives inside the repo (untracked api/.tmp/) because the sandbox
// denies the system temp directory.
const scratchRoot = () => {
    const base = path.join(__dirname, '..', '.tmp', 'static-mobile-header');
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, 'app-'));
};

// The exact header text Joe's planner produced for run27 (from the
// preserved dist joe-config). This case reproduces the 154px failure.
const RUN27_TITLE = 'web app';
const RUN27_LEDE = 'Add web app, search them, sort them and export them.';

// Fresh transfer wording, never used to build the fix: a different domain
// with its own wrap pressure. The bound must hold, not the prompt.
const TRANSFER_TITLE = 'Community tool library';
const TRANSFER_LEDE = 'Track borrowed tools, due dates and returns in one shared place.';

const TRANSFER_AR_TITLE = 'مكتبة أدوات الحي';
const TRANSFER_AR_LEDE = 'تتبع الأدوات المستعارة ومواعيد الإرجاع في مكان واحد مشترك.';

const FIELDS_REQUEST = 'Build a community tool library: a table of tools with name, borrower and due columns. Seed it with 5 example tools.';

const bundleFor = (title: string, lede: string, isArabic: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeDependencyFreeRecordsBundle } = require('../modules/tools/definitions/ReactProjectTool');
    const bp: any = blueprintFor('generic', FIELDS_REQUEST, isArabic);
    const fields = (bp.fields || []).filter((f: any) => f && (f.label || f.key));
    expect(fields.length).toBeGreaterThanOrEqual(2);
    const dir = scratchRoot();
    const entry = writeDependencyFreeRecordsBundle(dir, {
        title, lede, entityOne: bp.entityOne, entityMany: bp.entityMany, fields,
    }, isArabic, []);
    return entry;
};

const measureHeader = (page: any) => page.evaluate(() => {
    const header = document.querySelector('header.top') as HTMLElement | null;
    const title = document.querySelector('header.top h1') as HTMLElement | null;
    const count = document.querySelector('header.top .count') as HTMLElement | null;
    if (!header || !title || !count) return null;
    const box = header.getBoundingClientRect();
    const kids = Array.from(header.children) as HTMLElement[];
    const rows = new Set(kids.map(k => Math.round(k.getBoundingClientRect().top)));
    // The desktop band aligns children at the end, so their tops differ by
    // design; same-band means vertical overlap, not equal tops.
    const bands = kids.map(k => k.getBoundingClientRect());
    const sameBand = bands.length < 2 || bands.every(b => b.top < bands[0].bottom && bands[0].top < b.bottom);
    const vw = window.innerWidth;
    const offscreen = [title, count].some(el => {
        const r = el.getBoundingClientRect();
        return r.right < 0 || r.left > vw || r.bottom < 0;
    });
    return {
        height: Math.round(box.height),
        rows: rows.size,
        sameBand,
        offscreen,
        overflowX: document.documentElement.scrollWidth > vw + 1,
        titleVisible: title.getBoundingClientRect().height > 0,
        countText: (count.textContent || '').trim(),
    };
});

describe('REAL BROWSER — the static records header fits the mobile gate', () => {
    let browser: any = null;
    let server: any = null;
    let baseUrl = '';
    const entries: Record<string, string> = {};

    beforeAll(async () => {
        entries.run27 = bundleFor(RUN27_TITLE, RUN27_LEDE, false);
        entries.transfer = bundleFor(TRANSFER_TITLE, TRANSFER_LEDE, false);
        entries.rtl = bundleFor(TRANSFER_AR_TITLE, TRANSFER_AR_LEDE, true);
        browser = await requireChromiumOrThrow('static-mobile-header');
        // Null only under explicit JOE_ALLOW_NO_BROWSER=1 (the helper
        // throws otherwise); the loud skip was already logged there.
        if (!browser) return;
        server = http.createServer((req: any, res: any) => {
            const url = String(req.url || '').split('?')[0];
            // One file per route: each bundle gets a real origin so the
            // static script runs exactly as in the delivered preview.
            const entry = url === '/t' ? entries.transfer : url === '/rtl' ? entries.rtl : url === '/' ? entries.run27 : null;
            if (!entry) { res.writeHead(404); res.end('no'); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(entry, 'utf8'));
        });
        await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    }, 120000);

    afterAll(async () => {
        await browser?.close().catch(() => { });
        await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
    });

    const open = async (route: string, width: number, height = 844) => {
        const context = await browser.newContext({ viewport: { width, height } });
        const page = await context.newPage();
        await page.goto(`${baseUrl}${route}`);
        await page.waitForSelector('header.top');
        return { context, page };
    };

    it('RUN27 — the delivered header text fits 144px at 390px', async () => {
        // Reachable only under explicit JOE_ALLOW_NO_BROWSER=1: without
        // the opt-out the beforeAll above already failed the suite.
        if (!browser) return;
        const { context, page } = await open('/', 390);
        const m: any = await measureHeader(page);
        expect(m).toBeTruthy();
        expect(m.height).toBeLessThanOrEqual(144);
        expect(m.rows).toBeLessThanOrEqual(2);
        expect(m.offscreen).toBe(false);
        expect(m.overflowX).toBe(false);
        expect(m.titleVisible).toBe(true);
        await context.close();
    }, 120000);

    it('TRANSFER — unseen wording fits 144px at 390px', async () => {
        if (!browser) return;
        const { context, page } = await open('/t', 390);
        const m: any = await measureHeader(page);
        expect(m).toBeTruthy();
        expect(m.height).toBeLessThanOrEqual(144);
        expect(m.rows).toBeLessThanOrEqual(2);
        expect(m.offscreen).toBe(false);
        expect(m.overflowX).toBe(false);
        await context.close();
    }, 120000);

    it('NARROW — 320px keeps the header visible with no page overflow', async () => {
        if (!browser) return;
        const { context, page } = await open('/t', 320);
        const m: any = await measureHeader(page);
        expect(m).toBeTruthy();
        expect(m.overflowX).toBe(false);
        expect(m.offscreen).toBe(false);
        expect(m.titleVisible).toBe(true);
        expect(m.countText.length).toBeGreaterThan(0);
        await context.close();
    }, 120000);

    it('DESKTOP — 1280px keeps the single-band header', async () => {
        if (!browser) return;
        const { context, page } = await open('/t', 1280, 800);
        const m: any = await measureHeader(page);
        expect(m).toBeTruthy();
        expect(m.sameBand).toBe(true);
        expect(m.overflowX).toBe(false);
        expect(m.titleVisible).toBe(true);
        expect(m.countText.length).toBeGreaterThan(0);
        await context.close();
    }, 120000);

    it('RTL — the Arabic bundle fits 144px at 390px', async () => {
        if (!browser) return;
        const { context, page } = await open('/rtl', 390);
        const m: any = await measureHeader(page);
        expect(m).toBeTruthy();
        expect(m.height).toBeLessThanOrEqual(144);
        expect(m.overflowX).toBe(false);
        expect(m.offscreen).toBe(false);
        await context.close();
    }, 120000);
});
