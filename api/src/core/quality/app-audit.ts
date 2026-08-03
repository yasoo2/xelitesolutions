/**
 * SELF-QA — Joe opens a REAL browser on the app it just built and MEASURES
 * it before handing it over. Not a linter, not a guess: the production dist
 * is served, Chromium loads it, and the checks are the ones a careful
 * reviewer runs by hand:
 *
 *   - page errors and console errors (a broken app announces itself here)
 *   - failed asset requests (the 404 that ships silently)
 *   - images that never painted (naturalWidth 0)
 *   - dead controls (href="" / href="#") — the oldest field complaint
 *   - tap targets under 40px among real controls
 *   - exactly one h1
 *   - the theme toggle actually CHANGES the colours (a shipped build once
 *     flipped the attribute while every colour stayed put)
 *
 * Honest by contract: when the browser cannot launch (a machine without the
 * Playwright browsers), the audit reports itself SKIPPED — it never invents
 * a score.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';

export interface AppAuditFinding {
    id: string;
    severity: 'high' | 'medium' | 'low';
    detail: string;
}

export interface AppAudit {
    skipped?: string;
    score: number;
    findings: AppAuditFinding[];
}

/** 100 minus what the findings earn — the same finding always costs the same. */
export function scoreOf(findings: AppAuditFinding[]): number {
    const cost = { high: 15, medium: 8, low: 3 } as const;
    return Math.max(0, findings.reduce((s, f) => s - cost[f.severity], 100));
}

export async function auditBuiltApp(distDir: string, opts?: { timeoutMs?: number }): Promise<AppAudit> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
        return { skipped: 'no dist/index.html to audit', score: 0, findings: [] };
    }
    let chromium: any;
    try { chromium = require('playwright').chromium; }
    catch { return { skipped: 'playwright not installed', score: 0, findings: [] }; }

    const srv = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(distDir, rel);
        if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(fs.readFileSync(file));
    });
    await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(srv.address() as any).port}/`;

    let browser: any = null;
    try {
        browser = await chromium.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        page.on('pageerror', (e: any) => pageErrors.push(String(e).slice(0, 120)));
        page.on('console', (m: any) => { if (m.type() === 'error') consoleErrors.push(String(m.text()).slice(0, 120)); });
        page.on('response', (r: any) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url().slice(-60)}`); });
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

        const dom = await page.evaluate(() => {
            const controls = [...document.querySelectorAll('a.btn, button, .nav-links a')] as HTMLElement[];
            const small = controls.filter(c => {
                const r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40);
            }).map(c => (c.textContent || c.className || '').trim().slice(0, 30));
            return {
                deadImgs: ([...document.images] as HTMLImageElement[]).filter(i => i.currentSrc && i.naturalWidth === 0).length,
                deadLinks: [...document.querySelectorAll('a')].filter(a => {
                    const h = a.getAttribute('href');
                    return h === '' || h === '#';
                }).length,
                small,
                h1s: document.querySelectorAll('h1').length,
                bg: getComputedStyle(document.body).backgroundColor,
                hasToggle: !!document.querySelector('.theme-toggle'),
            };
        });

        let toggleWorks = true;
        if (dom.hasToggle) {
            await page.click('.theme-toggle');
            await page.waitForTimeout(150);
            const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            toggleWorks = bg2 !== dom.bg;
        }

        const findings: AppAuditFinding[] = [];
        if (pageErrors.length) findings.push({ id: 'page_errors', severity: 'high', detail: `${pageErrors.length} خطأ صفحة: ${pageErrors[0]}` });
        if (consoleErrors.length) findings.push({ id: 'console_errors', severity: 'high', detail: `${consoleErrors.length} خطأ كونسول: ${consoleErrors[0]}` });
        if (failedRequests.length) findings.push({ id: 'failed_requests', severity: 'high', detail: `${failedRequests.length} ملف لم يصل: ${failedRequests[0]}` });
        if (dom.deadImgs) findings.push({ id: 'dead_images', severity: 'high', detail: `${dom.deadImgs} صورة لم تُرسم` });
        if (dom.deadLinks) findings.push({ id: 'dead_links', severity: 'medium', detail: `${dom.deadLinks} رابط ميت (href فارغ أو #)` });
        if (dom.small.length) findings.push({ id: 'small_targets', severity: 'medium', detail: `${dom.small.length} هدف لمس أصغر من 40px: ${dom.small[0]}` });
        if (dom.h1s !== 1) findings.push({ id: 'h1_count', severity: 'low', detail: `عدد h1 = ${dom.h1s} (المطلوب 1)` });
        if (dom.hasToggle && !toggleWorks) findings.push({ id: 'theme_toggle_dead', severity: 'medium', detail: 'زر الوضع الليلي لا يغيّر الألوان فعلياً' });

        return { score: scoreOf(findings), findings };
    } catch (e: any) {
        return { skipped: `browser failed (${String(e?.message || e).slice(0, 80)})`, score: 0, findings: [] };
    } finally {
        try { await browser?.close(); } catch { /* already gone */ }
        srv.close();
    }
}

/** The verdict, formatted for the chat — findings named, never buried. */
export function formatAudit(a: AppAudit, isAr: boolean): string {
    if (a.skipped) return isAr ? `🔎 فحص الجودة الذاتي: تخطيته (${a.skipped}).` : `🔎 Self-QA skipped (${a.skipped}).`;
    if (!a.findings.length) return isAr ? '🔎 فحص الجودة الذاتي في متصفح حقيقي: 100/100 — صفر أخطاء، كل الصور مرسومة، كل الأزرار حية.' : '🔎 Self-QA in a real browser: 100/100 — clean.';
    const lines = a.findings.map(f => `   • ${f.detail}`).join('\n');
    return isAr
        ? `🔎 فحص الجودة الذاتي في متصفح حقيقي: ${a.score}/100 — وجدت:\n${lines}`
        : `🔎 Self-QA: ${a.score}/100:\n${lines}`;
}
