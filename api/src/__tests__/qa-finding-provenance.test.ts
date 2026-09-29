/**
 * QA FINDING PROVENANCE — a finding must carry where and how it was measured.
 *
 * Run-22 evidence (real Joe UI, run-1790620230868): Browser QA reported a
 * fragmented mobile header at 154px, but an isolated replay of the same
 * preserved build measured 105px. The persisted run record kept only the
 * prose — no URL, no requested/actual viewport, no selector geometry, no
 * child boxes — so the discrepancy could not be adjudicated from evidence.
 *
 * Three narrow repairs pin this:
 *  1. The responsive header finding carries measurement provenance
 *     (sanitized URL, requested/actual viewport, header + child boxes).
 *  2. The durable lastAudit mapping keeps finding id + capped evidence
 *     instead of dropping everything but an (empty) message.
 *  3. The provenance itself is bounded and secret-safe: opaque path
 *     segments (>=20 chars) are fully redacted with no surviving prefix,
 *     and oversized evidence keeps structural metadata (byte count, key
 *     names) instead of a raw content preview — a bounded raw prefix is
 *     not a redaction boundary.
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

    it('caps each evidence item so one producer cannot bloat durable state', () => {
        const big = { sel: 'header', dump: 'x'.repeat(5000) };
        const out = compactQaFindings([{ id: 'big', severity: 'low', detail: 'x', evidence: [big] }]);
        const kept = out[0].evidence![0];
        expect(kept.truncatedEvidence).toBe(true);
        expect(kept.jsonByteLength).toBeGreaterThan(2000);
        // Structural metadata only: no raw content preview may persist.
        expect(kept.preview).toBeUndefined();
        expect(kept.keys).toEqual(['sel', 'dump']);
        expect(JSON.stringify(kept).length).toBeLessThan(2000);
        // Small items still pass through untouched.
        const small = { sel: 'header', h: 154 };
        expect(compactQaFindings([{ severity: 'low', detail: 'x', evidence: [small] }])[0].evidence![0])
            .toEqual(small);
    });

    it('never persists raw opaque material from oversized evidence', () => {
        const marker = `opaque-${'7Q'.repeat(20)}`; // 47-char token-shaped value
        const big = { sel: 'header', opaquePath: `/reset/${marker}`, pad: 'y'.repeat(3000) };
        const out = compactQaFindings([{ id: 'big', severity: 'low', detail: 'x', evidence: [big] }]);
        const kept = out[0].evidence![0];
        expect(kept.truncatedEvidence).toBe(true);
        expect(kept.jsonByteLength).toBeGreaterThan(2000);
        expect(JSON.stringify(kept)).not.toContain(marker);
        expect(JSON.stringify(kept)).not.toContain('opaque-7Q');
        expect(kept.keys).toContain('opaquePath');
    });

    it('summarizes oversized arrays and long primitives without raw content', () => {
        const rows = Array.from({ length: 500 }, (_, i) => `row-${i}-` + 'z'.repeat(20));
        const arrKept = compactQaFindings(
            [{ severity: 'low', detail: 'x', evidence: [rows] }])[0].evidence![0];
        expect(arrKept.truncatedEvidence).toBe(true);
        expect(arrKept.length).toBe(500);
        expect(arrKept.preview).toBeUndefined();
        expect(JSON.stringify(arrKept)).not.toContain('row-42-');
        const strKept = compactQaFindings(
            [{ severity: 'low', detail: 'x', evidence: [`canary-${'s'.repeat(5000)}`] }])[0].evidence![0];
        expect(strKept.truncatedEvidence).toBe(true);
        expect(strKept.jsonByteLength).toBeGreaterThan(2000);
        expect(strKept.preview).toBeUndefined();
        expect('keys' in strKept).toBe(false);
        expect(JSON.stringify(strKept)).not.toContain('canary-');
    });

    it('measures the per-item budget in UTF-8 bytes, not UTF-16 code units', () => {
        // Codex's Unicode probe shape: 1,200 CJK chars serialize to ~1.2K
        // UTF-16 code units but ~3.6K UTF-8 bytes — over the 2KB store budget,
        // so the item must summarize even though json.length is under 2048.
        const cjk = { sel: 'header', dump: '表'.repeat(1200) };
        expect(JSON.stringify(cjk).length).toBeLessThan(2048);
        const kept = compactQaFindings(
            [{ severity: 'low', detail: 'x', evidence: [cjk] }])[0].evidence![0];
        expect(kept.truncatedEvidence).toBe(true);
        expect(kept.jsonByteLength).toBeGreaterThan(2048);
        expect(JSON.stringify(kept)).not.toContain('表');
        expect(kept.keys).toEqual(['sel', 'dump']);
        // Small multibyte items still pass through untouched.
        const small = { sel: 'header', note: '表ヘッダー' };
        expect(compactQaFindings([{ severity: 'low', detail: 'x', evidence: [small] }])[0].evidence![0])
            .toEqual(small);
    });

    it('marks unserializable evidence instead of throwing', () => {
        const circular: any = { sel: 'header' };
        circular.self = circular;
        const out = compactQaFindings([{ id: 'c', severity: 'low', detail: 'x', evidence: [circular] }]);
        expect(out[0].evidence![0]).toEqual({ truncatedEvidence: true, unserializable: true });
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

    it('redacts opaque path segments from the recorded url', async () => {
        if (!browser) {
            // eslint-disable-next-line no-console
            console.warn('[qa-provenance] SKIP: no Chromium available');
            return;
        }
        const { inspectUi } = require('../core/quality/ui-inspection');
        const context = await browser.newContext();
        try {
            const page = await context.newPage();
            // Full redaction: no prefix of an opaque segment may survive.
            const opaque = '9f2c7a1e'.repeat(8); // 64-char token-shaped segment
            await page.goto(`${baseUrl}/reset/${opaque}`, { waitUntil: 'load', timeout: 30_000 });
            const ui = await inspectUi(page);
            const header = ui.findings.find((f: any) => f.code === 'mobile_header_fragmented');
            expect(header).toBeTruthy();
            const url = String(header.evidence[0].url);
            expect(url).not.toContain(opaque);
            expect(url).not.toContain('9f2c7a1e');
            expect(url).toContain('[redacted]');
            expect(url.startsWith(`${baseUrl}/reset/`)).toBe(true);
            // Shorter token-shaped segments (NanoID-21 class) redact fully too.
            const short = 'V1StGXR8_Z5jdHi6B-myT'; // 21 chars
            await page.goto(`${baseUrl}/invite/${short}`, { waitUntil: 'load', timeout: 30_000 });
            const ui2 = await inspectUi(page);
            const header2 = ui2.findings.find((f: any) => f.code === 'mobile_header_fragmented');
            expect(header2).toBeTruthy();
            const url2 = String(header2.evidence[0].url);
            expect(url2).not.toContain(short);
            expect(url2).not.toContain('V1StGXR8');
            expect(url2).toBe(`${baseUrl}/invite/[redacted]`);
            // Ordinary short slugs stay readable for diagnosis.
            await page.goto(`${baseUrl}/projects/annual-report`, { waitUntil: 'load', timeout: 30_000 });
            const ui3 = await inspectUi(page);
            const header3 = ui3.findings.find((f: any) => f.code === 'mobile_header_fragmented');
            expect(header3).toBeTruthy();
            expect(String(header3.evidence[0].url)).toBe(`${baseUrl}/projects/annual-report`);
        } finally {
            await context.close().catch(() => { });
        }
    });
});
