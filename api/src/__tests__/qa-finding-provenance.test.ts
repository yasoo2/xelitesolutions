/**
 * QA FINDING PROVENANCE — a finding must carry where and how it was measured.
 *
 * Run-22 evidence (real Joe UI, run-1790620230868): Browser QA reported a
 * fragmented mobile header at 154px, but an isolated replay of the same
 * preserved build measured 105px. The persisted run record kept only the
 * prose — no URL, no requested/actual viewport, no selector geometry, no
 * child boxes — so the discrepancy could not be adjudicated from evidence.
 *
 * Two narrow repairs pin this:
 *  1. The responsive header finding carries measurement provenance
 *     (sanitized URL, requested/actual viewport, header + child boxes).
 *  2. The durable lastAudit mapping keeps finding id + capped evidence
 *     instead of dropping everything but an (empty) message.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { compactQaFindings } from '../core/quality/app-audit';

describe('compactQaFindings keeps findings durable', () => {
    it('keeps id, severity, message and capped evidence', () => {
        const out = compactQaFindings([{
            id: 'mobile_header_fragmented', severity: 'medium',
            detail: 'تفاصيل', detailEn: 'detail text',
            evidence: [{ sel: 'header', h: 154 }, { sel: 'b' }, { sel: 'c' }, { sel: 'd' }, { sel: 'e' }],
        }]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe('mobile_header_fragmented');
        expect(out[0].severity).toBe('medium');
        expect(out[0].message).toBe('detail text');
        // Evidence survives, bounded: the store is per-project durable state.
        expect(out[0].evidence).toHaveLength(4);
        expect(out[0].evidence![0]).toEqual({ sel: 'header', h: 154 });
    });

    it('falls back through detail, message and what instead of persisting empties', () => {
        expect(compactQaFindings([{ id: 'a', severity: 'low', detail: 'عربي فقط' }])[0].message).toBe('عربي فقط');
        expect(compactQaFindings([{ severity: 'low', message: 'plain' }])[0].message).toBe('plain');
        expect(compactQaFindings([{ severity: 'low', what: 'legacy' }])[0].message).toBe('legacy');
        expect(compactQaFindings([{ severity: 'low' }])[0].message).toBe('');
        // Findings without evidence carry no evidence key at all.
        expect('evidence' in compactQaFindings([{ severity: 'low', message: 'x' }])[0]).toBe(false);
    });

    it('bounds the durable list and tolerates non-array input', () => {
        const many = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, severity: 'low', detail: 'x' }));
        expect(compactQaFindings(many)).toHaveLength(12);
        expect(compactQaFindings(undefined as any)).toEqual([]);
        expect(compactQaFindings(null as any)).toEqual([]);
    });
});

describe('the durable writers use the compact mapping', () => {
    it('ReactProjectTool persists lastAudit findings through compactQaFindings', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('compactQaFindings(audit.findings');
        expect(src).not.toContain("message: String(f.message || f.what || '').slice(0, 200)");
    });

    it('ProjectRepairTool persists remaining findings through compactQaFindings', () => {
        const src = fs.readFileSync(
            path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRepairTool.ts'), 'utf-8');
        expect(src).toContain('compactQaFindings(remaining');
    });
});

describe('the fragmented-header finding carries measurement provenance', () => {
    // Real Chromium + real inspectUi: geometry must be measured, not asserted
    // from source text. Honest skip when no browser is available.
    jest.setTimeout(180_000);
    let browser: any = null;
    let server: http.Server | null = null;
    let baseUrl = '';

    const FIXTURE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>provenance fixture</title>
<style>
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; background: #fff; color: #111; }
  header.app-bar { display: grid; }
  header.app-bar .identity { height: 80px; background: #eee; }
  header.app-bar nav { height: 80px; background: #ddd; }
  main { padding: 16px; }
</style></head><body>
<header class="app-bar"><div class="wrap"><div class="identity">brand row</div><nav>nav row</nav></div></header>
<main><h1>fixture</h1><p>body copy</p></main>
</body></html>`;

    beforeAll(async () => {
        const { findChromiumExecutable, getChromiumLaunchOptions } =
            require('../modules/browser/manager');
        const exe = findChromiumExecutable();
        const { chromium } = require('playwright');
        try {
            browser = await chromium.launch({
                ...getChromiumLaunchOptions(),
                ...(exe ? { executablePath: exe } : {}),
            });
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.warn(`[qa-provenance] no browser, real-Chromium assertions skip: ${String(e?.message || e).slice(0, 120)}`);
            browser = null;
        }
        if (!browser) return;
        server = http.createServer((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(FIXTURE);
        });
        await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    });

    afterAll(async () => {
        await browser?.close().catch(() => { });
        await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
    });

    it('records url, viewports and header/child geometry on the finding', async () => {
        if (!browser) {
            // eslint-disable-next-line no-console
            console.warn('[qa-provenance] SKIP: no Chromium available');
            return;
        }
        const { inspectUi } = require('../core/quality/ui-inspection');
        const context = await browser.newContext();
        try {
            const page = await context.newPage();
            // A token-bearing URL must never survive into persisted evidence.
            await page.goto(`${baseUrl}/app/page?token=secret-canary-9z#frag`, { waitUntil: 'load', timeout: 30_000 });
            const ui = await inspectUi(page);
            const header = ui.findings.find((f: any) => f.code === 'mobile_header_fragmented');
            expect(header).toBeTruthy();
            const ev = header.evidence[0];
            // Legacy keys stay intact for existing repairers.
            expect(typeof ev.sel).toBe('string');
            expect(ev.h).toBeGreaterThan(144);
            expect(ev.rows).toBeGreaterThanOrEqual(2);
            // Provenance: sanitized URL, no query/hash/secret.
            expect(ev.url).toBe(`${baseUrl}/app/page`);
            expect(String(ev.url)).not.toContain('secret-canary-9z');
            expect(String(ev.url)).not.toContain('?');
            expect(String(ev.url)).not.toContain('#');
            // Provenance: the viewport the number was measured at.
            expect(ev.requestedVw).toBe(390);
            expect(Math.abs(Number(ev.actualVw) - 390)).toBeLessThanOrEqual(2);
            // Provenance: header + child geometry that a replay can compare.
            expect(ev.headerBox.width).toBeGreaterThan(0);
            expect(ev.headerBox.height).toBe(ev.h);
            expect(Array.isArray(ev.childBoxes)).toBe(true);
            expect(ev.childBoxes.length).toBeGreaterThan(0);
            expect(ev.childBoxes.length).toBeLessThanOrEqual(10);
            for (const box of ev.childBoxes) {
                expect(Number.isInteger(box.x)).toBe(true);
                expect(Number.isInteger(box.y)).toBe(true);
                expect(box.width).toBeGreaterThan(0);
                expect(box.height).toBeGreaterThan(0);
            }
            // The durable mapping keeps the provenance for post-hoc diagnosis.
            const durable = compactQaFindings([{
                id: 'mobile_header_fragmented', severity: 'medium',
                detail: header.ar, detailEn: header.en, evidence: header.evidence,
            }]);
            expect(durable[0].evidence![0].url).toBe(`${baseUrl}/app/page`);
            expect(durable[0].evidence![0].headerBox.height).toBe(ev.h);
        } finally {
            await context.close().catch(() => { });
        }
    });
});
