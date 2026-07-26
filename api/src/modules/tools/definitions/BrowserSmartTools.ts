import fs from 'fs';
import path from 'path';
import { ToolDefinition } from '../types';
import { getBrowserSession, withBrowserConcurrency } from '../../browser/manager';
import { routeToModel } from '../../../core/llm/intelligent-router';
import { broadcast } from '../../../api/ws';

const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';

/** Normalise a user-supplied URL (add https:// when missing). */
function normalizeUrl(raw: string): string {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u}`;
}

/** Save a JPEG buffer to the artifact dir and broadcast it to the browser panel. */
function publishShot(sessionId: string | undefined, buf: Buffer, url: string): string | undefined {
    try {
        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
        const name = `browser-${Date.now()}.jpg`;
        fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
        const href = `/artifacts/${name}`;
        try { broadcast({ type: 'browser_screenshot', sessionId, data: { href, url, sessionId } } as any); } catch { /* ignore */ }
        return href;
    } catch { return undefined; }
}

/** Shared: get a page, optionally navigate, return { page, url }. */
async function openPage(sessionId: string, rawUrl?: string) {
    const s = await getBrowserSession(sessionId);
    const page = s.page;
    const target = normalizeUrl(rawUrl || '');
    if (target) {
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(600);
    }
    return { page, url: page.url() };
}

const isAr = (t: string) => /[؀-ۿ]/.test(String(t || ''));

/** Extract a structural signature of the current page (for before/after diffing). */
async function pageSignature(page: any) {
    return await page.evaluate(() => {
        const txt = (el: Element) => ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim();
        const list = (sel: string) => Array.from(document.querySelectorAll(sel)).map(txt).filter(Boolean).slice(0, 60);
        return {
            title: document.title || '',
            buttons: list('button, [role="button"], input[type="submit"]'),
            links: list('a'),
            headings: list('h1, h2, h3'),
            inputs: Array.from(document.querySelectorAll('input, textarea, select')).map(el => el.getAttribute('name') || el.getAttribute('id') || el.getAttribute('placeholder') || '').filter(Boolean).slice(0, 60),
            images: document.querySelectorAll('img').length,
            bodyLen: ((document.body?.innerText || '').replace(/\s+/g, ' ').trim()).length,
        };
    });
}

function setDiff(a: string[], b: string[]) {
    const nb = new Set((b || []).map(x => x.toLowerCase().trim()));
    return (a || []).filter(x => !nb.has(x.toLowerCase().trim()));
}

function toCsv(rows: any[]): string {
    if (!rows.length) return '';
    const cols = Array.from(rows.reduce((s: Set<string>, r: any) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set<string>()));
    const esc = (v: any) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

/* ============================================================
   5) browser_extract_data — tables/lists -> JSON + CSV
   ============================================================ */
export class BrowserExtractDataTool implements ToolDefinition {
    name = 'browser_extract_data';
    version = '1.0.0';
    description = 'Open a page and extract structured data (tables or lists) into JSON, and save a CSV file. Optionally pass a CSS selector.';
    tags = ['browser', 'web', 'extract', 'data', 'scrape', 'csv'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const }, selector: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || ''; const selector = String(input?.selector || '').trim();
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const result = await page.evaluate((sel: string) => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    // 1) explicit selector -> list of texts
                    if (sel) {
                        const els = Array.from(document.querySelectorAll(sel));
                        return { kind: 'selector', rows: els.map((e, i) => ({ index: i + 1, text: clean((e as HTMLElement).innerText) })) };
                    }
                    // 2) largest table -> rows keyed by header
                    const tables = Array.from(document.querySelectorAll('table'));
                    let best: HTMLTableElement | null = null; let bestCells = 0;
                    tables.forEach(t => { const c = t.querySelectorAll('td,th').length; if (c > bestCells) { bestCells = c; best = t as HTMLTableElement; } });
                    if (best && bestCells > 0) {
                        const rowsEls = Array.from((best as HTMLTableElement).querySelectorAll('tr'));
                        const headerCells = Array.from(rowsEls[0]?.querySelectorAll('th,td') || []).map(c => clean((c as HTMLElement).innerText) || `col${1}`);
                        const rows = rowsEls.slice(1).map(tr => {
                            const cells = Array.from(tr.querySelectorAll('td,th')).map(c => clean((c as HTMLElement).innerText));
                            const obj: any = {}; cells.forEach((v, i) => obj[headerCells[i] || `col${i + 1}`] = v); return obj;
                        }).filter(r => Object.keys(r).length);
                        return { kind: 'table', rows };
                    }
                    // 3) fallback: largest <ul>/<ol>
                    const lists = Array.from(document.querySelectorAll('ul,ol'));
                    let bl: Element | null = null; let bn = 0;
                    lists.forEach(l => { const n = l.querySelectorAll('li').length; if (n > bn) { bn = n; bl = l; } });
                    if (bl && bn > 0) return { kind: 'list', rows: Array.from((bl as Element).querySelectorAll('li')).map((li, i) => ({ index: i + 1, text: clean((li as HTMLElement).innerText) })) };
                    return { kind: 'none', rows: [] };
                }, selector);

                const rows = result.rows || [];
                let csvHref: string | undefined;
                if (rows.length) {
                    try {
                        fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
                        const name = `extract-${Date.now()}.csv`;
                        fs.writeFileSync(path.join(ARTIFACT_DIR, name), '﻿' + toCsv(rows), 'utf-8'); // BOM for Excel/Arabic
                        csvHref = `/artifacts/${name}`;
                    } catch { /* ignore */ }
                }
                const preview = JSON.stringify(rows.slice(0, 8), null, 1);
                const message = rows.length
                    ? `📊 استخرجتُ ${rows.length} صفّاً (${result.kind}) من ${finalUrl}.\n${csvHref ? `⬇️ ملف CSV: ${csvHref}\n` : ''}\nمعاينة:\n\`\`\`json\n${preview}\n\`\`\``
                    : `لم أجد جدولاً أو قائمة قابلة للاستخراج في ${finalUrl}.`;
                return { ok: rows.length > 0, output: { message, kind: result.kind, count: rows.length, rows: rows.slice(0, 200), csv: csvHref, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `extract_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   6) browser_check_links — find broken links on a page
   ============================================================ */
export class BrowserCheckLinksTool implements ToolDefinition {
    name = 'browser_check_links';
    version = '1.0.0';
    description = 'Open a page, collect its links, and check each for broken (4xx/5xx/unreachable) status. Returns a report of broken links.';
    tags = ['browser', 'web', 'links', 'audit', 'qa'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const }, limit: { type: 'number' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || ''; const limit = Math.max(1, Math.min(60, Number(input?.limit) || 40));
        if (!url) return { ok: false, error: 'no_url' };
        try {
            const links: string[] = await withBrowserConcurrency(async () => {
                const { page } = await openPage(sessionId, url);
                return await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
                    .map(a => (a as HTMLAnchorElement).href)
                    .filter(h => /^https?:\/\//i.test(h)));
            });
            const unique = Array.from(new Set(links)).slice(0, limit);
            const check = async (link: string) => {
                try {
                    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
                    let res = await fetch(link, { method: 'HEAD', signal: ctrl.signal }).catch(() => null as any);
                    if (!res || res.status === 405 || res.status === 501) res = await fetch(link, { method: 'GET', signal: ctrl.signal }).catch(() => null as any);
                    clearTimeout(t);
                    if (!res) return { link, status: 0, ok: false };
                    return { link, status: res.status, ok: res.status < 400 };
                } catch { return { link, status: 0, ok: false }; }
            };
            const results = await Promise.all(unique.map(check));
            const broken = results.filter(r => !r.ok);
            const message = `🔗 فحص الروابط في الصفحة (${unique.length} رابطاً):\n` +
                (broken.length ? `❌ ${broken.length} رابط مكسور:\n` + broken.map(b => `  • ${b.status || 'تعذّر الوصول'} — ${b.link}`).slice(0, 15).join('\n')
                    : '✅ كل الروابط تعمل.');
            return { ok: true, output: { message, total: unique.length, brokenCount: broken.length, broken, url } };
        } catch (e: any) { return { ok: false, error: `check_links_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   7) browser_performance — page load performance metrics
   ============================================================ */
export class BrowserPerformanceTool implements ToolDefinition {
    name = 'browser_performance';
    version = '1.0.0';
    description = 'Open a page and measure performance: load time, DOMContentLoaded, transfer size, resource counts by type, and slowest resources.';
    tags = ['browser', 'web', 'performance', 'speed', 'audit'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;
                const t0 = Date.now();
                await page.goto(normalizeUrl(url), { waitUntil: 'load', timeout: 30000 });
                const wall = Date.now() - t0;
                await page.waitForTimeout(400);
                const perf = await page.evaluate(() => {
                    const nav = performance.getEntriesByType('navigation')[0] as any;
                    const res = performance.getEntriesByType('resource') as any[];
                    const byType: Record<string, number> = {};
                    let totalBytes = 0;
                    res.forEach(r => { byType[r.initiatorType] = (byType[r.initiatorType] || 0) + 1; totalBytes += (r.transferSize || 0); });
                    const slowest = res.map(r => ({ name: String(r.name).slice(-60), ms: Math.round(r.duration) })).sort((a, b) => b.ms - a.ms).slice(0, 5);
                    return {
                        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
                        load: nav ? Math.round(nav.loadEventEnd) : null,
                        transferBytes: nav ? (nav.transferSize || 0) : 0,
                        resourceBytes: totalBytes,
                        resourceCount: res.length,
                        byType, slowest,
                    };
                });
                const kb = (n: number) => `${(n / 1024).toFixed(0)}KB`;
                const grade = wall < 1500 ? 'ممتاز ⚡' : wall < 3500 ? 'جيد' : 'بطيء ⚠️';
                const message = `⚡ أداء الصفحة (${url}):\n\n` +
                    `⏱️ زمن التحميل: ${wall}ms (${grade})\n` +
                    `📄 DOMContentLoaded: ${perf.domContentLoaded ?? '—'}ms · Load: ${perf.load ?? '—'}ms\n` +
                    `📦 الموارد: ${perf.resourceCount} ملف · الحجم: ${kb(perf.resourceBytes)}\n` +
                    `🧩 حسب النوع: ${Object.entries(perf.byType).map(([k, v]) => `${k}:${v}`).join(' · ')}\n` +
                    (perf.slowest.length ? `🐢 الأبطأ:\n` + perf.slowest.map((r: any) => `  • ${r.ms}ms — ${r.name}`).join('\n') : '');
                return { ok: true, output: { message, wallMs: wall, ...perf, url } };
            });
        } catch (e: any) { return { ok: false, error: `performance_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   8) browser_seo_audit — SEO / meta / social tags audit
   ============================================================ */
export class BrowserSEOAuditTool implements ToolDefinition {
    name = 'browser_seo_audit';
    version = '1.0.0';
    description = 'Open a page and audit its SEO: title, meta description, canonical, robots, Open Graph/Twitter cards, headings, image alt coverage, and HTTPS.';
    tags = ['browser', 'web', 'seo', 'audit', 'meta'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const seo = await page.evaluate(() => {
                    const meta = (n: string) => (document.querySelector(`meta[name="${n}"]`) as HTMLMetaElement)?.content || '';
                    const prop = (p: string) => (document.querySelector(`meta[property="${p}"]`) as HTMLMetaElement)?.content || '';
                    const issues: { severity: string; message: string }[] = [];
                    const title = document.title || '';
                    if (!title) issues.push({ severity: 'critical', message: 'لا يوجد <title>.' });
                    else if (title.length < 10 || title.length > 65) issues.push({ severity: 'warning', message: `طول العنوان ${title.length} حرفاً (يُفضّل 10–60).` });
                    const desc = meta('description');
                    if (!desc) issues.push({ severity: 'warning', message: 'لا يوجد meta description.' });
                    else if (desc.length < 50 || desc.length > 160) issues.push({ severity: 'info', message: `وصف الميتا ${desc.length} حرفاً (يُفضّل 50–160).` });
                    if (!document.querySelector('link[rel="canonical"]')) issues.push({ severity: 'info', message: 'لا يوجد رابط canonical.' });
                    if (!prop('og:title') || !prop('og:image')) issues.push({ severity: 'info', message: 'بطاقات Open Graph ناقصة (og:title/og:image) — تؤثر على المشاركة الاجتماعية.' });
                    if (document.querySelectorAll('h1').length !== 1) issues.push({ severity: 'warning', message: `عدد <h1> = ${document.querySelectorAll('h1').length} (يُفضّل واحد).` });
                    if (!document.documentElement.getAttribute('lang')) issues.push({ severity: 'warning', message: 'وسم <html> بلا lang.' });
                    const imgs = Array.from(document.querySelectorAll('img'));
                    const noAlt = imgs.filter(i => !i.getAttribute('alt')).length;
                    if (noAlt) issues.push({ severity: 'info', message: `${noAlt}/${imgs.length} صورة بلا alt (يضر SEO الصور).` });
                    if (location.protocol !== 'https:') issues.push({ severity: 'warning', message: 'الصفحة ليست على HTTPS.' });
                    return { title, desc, issues };
                });
                const crit = seo.issues.filter((i: any) => i.severity === 'critical').length;
                const warn = seo.issues.filter((i: any) => i.severity === 'warning').length;
                const info = seo.issues.filter((i: any) => i.severity === 'info').length;
                const score = Math.max(0, 100 - crit * 25 - warn * 10 - info * 4);
                const icon = (sv: string) => sv === 'critical' ? '🔴' : sv === 'warning' ? '🟡' : '🔵';
                const lines = seo.issues.length ? seo.issues.map((i: any) => `${icon(i.severity)} ${i.message}`).join('\n') : '✅ SEO سليم.';
                const message = `🔍 تدقيق SEO: ${finalUrl}\n\nالدرجة: ${score}/100\n\n${lines}`;
                return { ok: true, output: { message, score, issues: seo.issues, title: seo.title, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `seo_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   9) browser_console_scan — detect JS / console / network errors
   ============================================================ */
export class BrowserConsoleScanTool implements ToolDefinition {
    name = 'browser_console_scan';
    version = '1.0.0';
    description = 'Open a page and capture JavaScript errors, console errors/warnings, and failed network requests (4xx/5xx). Reports whether the page is error-free.';
    tags = ['browser', 'web', 'errors', 'console', 'qa', 'debug'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;
                const consoleErrors: string[] = []; const consoleWarns: string[] = [];
                const pageErrors: string[] = []; const netFails: string[] = [];
                const onConsole = (m: any) => { try { const t = m.type?.(); const tx = String(m.text()).slice(0, 200); if (t === 'error') consoleErrors.push(tx); else if (t === 'warning') consoleWarns.push(tx); } catch { } };
                const onPageErr = (e: any) => { try { pageErrors.push(String(e?.message || e).slice(0, 200)); } catch { } };
                const onReqFail = (r: any) => { try { netFails.push(`${r.failure?.()?.errorText || 'failed'} — ${String(r.url()).slice(0, 120)}`); } catch { } };
                const onResp = (r: any) => { try { const st = r.status(); if (st >= 400) netFails.push(`${st} — ${String(r.url()).slice(0, 120)}`); } catch { } };
                page.on('console', onConsole); page.on('pageerror', onPageErr); page.on('requestfailed', onReqFail); page.on('response', onResp);
                try {
                    await page.goto(normalizeUrl(url), { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(1800);
                    const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                    const shot = publishShot(sessionId, Buffer.from(buf), page.url());
                    const total = consoleErrors.length + pageErrors.length + netFails.length;
                    const sec = (title: string, arr: string[]) => arr.length ? `\n${title} (${arr.length}):\n` + arr.slice(0, 6).map(x => `  • ${x}`).join('\n') : '';
                    const message = total === 0 && consoleWarns.length === 0
                        ? `✅ الصفحة نظيفة — لا أخطاء JavaScript ولا أخطاء شبكة (${page.url()}).`
                        : `🐞 فحص أخطاء الصفحة (${page.url()}):` +
                          sec('🔴 أخطاء JavaScript', pageErrors) +
                          sec('🔴 أخطاء console', consoleErrors) +
                          sec('🌐 طلبات فاشلة', netFails) +
                          sec('🟡 تحذيرات', consoleWarns);
                    return { ok: true, output: { message, errorCount: total, pageErrors, consoleErrors, netFails, warnings: consoleWarns, url: page.url(), screenshot: shot } };
                } finally {
                    try { page.off('console', onConsole); page.off('pageerror', onPageErr); page.off('requestfailed', onReqFail); page.off('response', onResp); } catch { }
                }
            });
        } catch (e: any) { return { ok: false, error: `console_scan_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   10) browser_save_pdf — export the page to a PDF file
   ============================================================ */
export class BrowserSavePdfTool implements ToolDefinition {
    name = 'browser_save_pdf';
    version = '1.0.0';
    description = 'Open a page and save it as a PDF file (served from /artifacts).';
    tags = ['browser', 'web', 'pdf', 'export'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                let pdfHref: string | undefined;
                try {
                    const buf = await page.pdf({ format: 'A4', printBackground: true }) as Buffer;
                    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
                    const name = `page-${Date.now()}.pdf`;
                    fs.writeFileSync(path.join(ARTIFACT_DIR, name), buf);
                    pdfHref = `/artifacts/${name}`;
                } catch (e: any) {
                    return { ok: false, error: `pdf_failed: ${e?.message || e} (يتطلّب متصفحاً بدون واجهة headless).` };
                }
                return { ok: true, output: { message: `📄 حُفظت الصفحة كملف PDF: ${pdfHref}\n(المصدر: ${finalUrl})`, pdf: pdfHref, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `save_pdf_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   11) browser_readability — clean article/main-content extraction
   ============================================================ */
export class BrowserReadabilityTool implements ToolDefinition {
    name = 'browser_readability';
    version = '1.0.0';
    description = 'Open a page and extract the clean main article/content (stripping nav, ads, sidebars), with title, author, word count and reading time.';
    tags = ['browser', 'web', 'readability', 'article', 'extract'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const art = await page.evaluate(() => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    // Score candidates by paragraph text density.
                    const candidates = Array.from(document.querySelectorAll('article, main, [role="main"], .content, #content, .post, .article, body'));
                    let best: HTMLElement | null = null; let bestScore = 0;
                    for (const c of candidates) {
                        const ps = Array.from(c.querySelectorAll('p'));
                        const score = ps.reduce((s, p) => s + ((p as HTMLElement).innerText || '').length, 0);
                        if (score > bestScore) { bestScore = score; best = c as HTMLElement; }
                    }
                    const root = best || document.body;
                    // Collect paragraph/heading text in order, skip tiny/boilerplate bits.
                    const parts: string[] = [];
                    root.querySelectorAll('h1,h2,h3,p,li,blockquote').forEach(el => {
                        const t = clean((el as HTMLElement).innerText);
                        if (t.length >= 25 || /^h[1-3]$/i.test(el.tagName)) parts.push(t);
                    });
                    const author = (document.querySelector('meta[name="author"]') as HTMLMetaElement)?.content
                        || (document.querySelector('[rel="author"], .author, .byline') as HTMLElement)?.innerText || '';
                    return { title: document.title || '', author: clean(author), text: parts.join('\n\n').slice(0, 9000) };
                });
                const words = art.text.split(/\s+/).filter(Boolean).length;
                const mins = Math.max(1, Math.round(words / 200));
                const message = `📖 المقال (${finalUrl}):\n\n**${art.title}**${art.author ? ` — ${art.author}` : ''}\n⏱️ ${words} كلمة · ~${mins} دقيقة قراءة\n\n${art.text.slice(0, 1500)}${art.text.length > 1500 ? '…' : ''}`;
                return { ok: words > 0, output: { message, title: art.title, author: art.author, words, readingMinutes: mins, text: art.text, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `readability_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   12) browser_contrast_audit — WCAG colour-contrast audit
   ============================================================ */
export class BrowserContrastAuditTool implements ToolDefinition {
    name = 'browser_contrast_audit';
    version = '1.0.0';
    description = 'Open a page and audit text colour contrast against WCAG AA (4.5:1 normal, 3:1 large). Lists low-contrast text with its ratio.';
    tags = ['browser', 'web', 'accessibility', 'contrast', 'wcag', 'audit'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const res = await page.evaluate(() => {
                    const parse = (c: string): [number, number, number, number] => {
                        const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0];
                        const p = m[1].split(',').map(s => parseFloat(s)); return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
                    };
                    const lum = (r: number, g: number, b: number) => { const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
                    const ratio = (f: number[], b: number[]) => { const L1 = lum(f[0], f[1], f[2]), L2 = lum(b[0], b[1], b[2]); const hi = Math.max(L1, L2), lo = Math.min(L1, L2); return (hi + 0.05) / (lo + 0.05); };
                    const effBg = (el: Element): number[] => {
                        let node: Element | null = el;
                        while (node) { const bg = parse(getComputedStyle(node).backgroundColor); if (bg[3] > 0) return bg; node = node.parentElement; }
                        return [255, 255, 255, 1];
                    };
                    const isVisible = (el: HTMLElement) => { const r = el.getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0.1; };
                    const seen = new Set<string>(); const fails: any[] = []; let checked = 0;
                    const els = Array.from(document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,button,label,td,th,div')) as HTMLElement[];
                    for (const el of els) {
                        const txt = (el.childNodes.length && Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim().length > 1)) ? (el.textContent || '').trim() : '';
                        if (!txt || txt.length < 2 || !isVisible(el)) continue;
                        checked++;
                        const st = getComputedStyle(el);
                        const fg = parse(st.color); if (fg[3] === 0) continue;
                        const bg = effBg(el);
                        const rt = ratio(fg, bg);
                        const size = parseFloat(st.fontSize) || 16; const bold = (parseInt(st.fontWeight) || 400) >= 700;
                        const large = size >= 24 || (size >= 18.66 && bold);
                        const min = large ? 3 : 4.5;
                        if (rt < min) {
                            const key = txt.slice(0, 30) + rt.toFixed(2);
                            if (!seen.has(key)) { seen.add(key); fails.push({ text: txt.slice(0, 40), ratio: Math.round(rt * 100) / 100, need: min }); }
                        }
                        if (checked > 400) break;
                    }
                    return { checked, fails: fails.slice(0, 20) };
                });
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), finalUrl);
                const score = Math.max(0, 100 - res.fails.length * 6);
                const message = res.fails.length
                    ? `🎨 تدقيق تباين الألوان (WCAG AA) — ${finalUrl}\nالدرجة: ${score}/100 · فحصتُ ${res.checked} عنصراً · ${res.fails.length} ضعيف التباين:\n` +
                      res.fails.map((f: any) => `  🔸 نسبة ${f.ratio}:1 (يلزم ${f.need}:1) — «${f.text}»`).join('\n')
                    : `✅ تباين الألوان جيد — كل النصوص المفحوصة (${res.checked}) تجتاز WCAG AA.`;
                return { ok: true, output: { message, score, checked: res.checked, fails: res.fails, url: finalUrl, screenshot: shot } };
            });
        } catch (e: any) { return { ok: false, error: `contrast_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   13) browser_a11y_deep — deep accessibility audit
   ============================================================ */
export class BrowserA11yDeepTool implements ToolDefinition {
    name = 'browser_a11y_deep';
    version = '1.0.0';
    description = 'Open a page and run a deep accessibility audit: landmarks, heading order, duplicate IDs, empty/# links, positive tabindex, aria-hidden focusables, skip link, focusable count.';
    tags = ['browser', 'web', 'accessibility', 'a11y', 'aria', 'audit'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const a = await page.evaluate(() => {
                    const issues: { severity: string; message: string }[] = [];
                    const q = (s: string) => Array.from(document.querySelectorAll(s));
                    // Landmarks
                    if (!document.querySelector('header, [role="banner"]')) issues.push({ severity: 'info', message: 'لا يوجد رأس صفحة (header/banner).' });
                    if (!document.querySelector('nav, [role="navigation"]')) issues.push({ severity: 'info', message: 'لا يوجد شريط تنقّل (nav).' });
                    if (!document.querySelector('main, [role="main"]')) issues.push({ severity: 'warning', message: 'لا يوجد منطقة محتوى رئيسية (main) — يصعّب التنقّل بالقارئ الصوتي.' });
                    // Skip link
                    const firstLink = document.querySelector('a') as HTMLAnchorElement;
                    if (!(firstLink && /#(content|main|skip)/i.test(firstLink.getAttribute('href') || ''))) issues.push({ severity: 'info', message: 'لا يوجد رابط «تخطٍّ إلى المحتوى» (skip link).' });
                    // Duplicate IDs
                    const ids: Record<string, number> = {}; q('[id]').forEach(e => { const id = e.id; ids[id] = (ids[id] || 0) + 1; });
                    const dups = Object.entries(ids).filter(([, n]) => n > 1).map(([k]) => k);
                    if (dups.length) issues.push({ severity: 'warning', message: `معرّفات id مكرّرة: ${dups.slice(0, 5).join('، ')} (يكسر aria/label).` });
                    // Empty / # links
                    const badLinks = (q('a') as HTMLAnchorElement[]).filter(a => { const h = a.getAttribute('href'); return !h || h === '#' || /^javascript:/i.test(h); }).length;
                    if (badLinks) issues.push({ severity: 'info', message: `${badLinks} رابط بلا وجهة حقيقية (#/جافاسكربت).` });
                    // Positive tabindex (anti-pattern)
                    const posTab = q('[tabindex]').filter(e => parseInt(e.getAttribute('tabindex') || '0') > 0).length;
                    if (posTab) issues.push({ severity: 'warning', message: `${posTab} عنصر بـ tabindex موجب — يفسد ترتيب التنقّل بلوحة المفاتيح.` });
                    // aria-hidden on focusables
                    const hiddenFocus = q('[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] input').length;
                    if (hiddenFocus) issues.push({ severity: 'warning', message: `${hiddenFocus} عنصر تفاعلي داخل aria-hidden (غير مرئي للقارئ لكنه قابل للتركيز).` });
                    // Heading order (no skipped levels)
                    const levels = (q('h1,h2,h3,h4,h5,h6') as HTMLElement[]).map(h => parseInt(h.tagName[1]));
                    let skip = false; for (let i = 1; i < levels.length; i++) if (levels[i] - levels[i - 1] > 1) skip = true;
                    if (skip) issues.push({ severity: 'info', message: 'ترتيب العناوين يتخطّى مستويات (مثل h1 ثم h3).' });
                    const focusables = q('a[href], button, input, select, textarea, [tabindex]').length;
                    return { issues, focusables };
                });
                const crit = a.issues.filter((i: any) => i.severity === 'critical').length;
                const warn = a.issues.filter((i: any) => i.severity === 'warning').length;
                const info = a.issues.filter((i: any) => i.severity === 'info').length;
                const score = Math.max(0, 100 - crit * 20 - warn * 10 - info * 4);
                const icon = (sv: string) => sv === 'critical' ? '🔴' : sv === 'warning' ? '🟡' : '🔵';
                const lines = a.issues.length ? a.issues.map((i: any) => `${icon(i.severity)} ${i.message}`).join('\n') : '✅ لا مشاكل وصولية عميقة واضحة.';
                const message = `♿ تدقيق الوصولية العميق: ${finalUrl}\n\nالدرجة: ${score}/100 · عناصر قابلة للتركيز: ${a.focusables}\n\n${lines}`;
                return { ok: true, output: { message, score, issues: a.issues, focusables: a.focusables, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `a11y_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   14) browser_extract_meta — all metadata + JSON-LD structured data
   ============================================================ */
export class BrowserExtractMetaTool implements ToolDefinition {
    name = 'browser_extract_meta';
    version = '1.0.0';
    description = 'Open a page and extract ALL metadata: title, description, canonical, robots, Open Graph, Twitter cards, favicon, JSON-LD structured data, and a headings outline.';
    tags = ['browser', 'web', 'meta', 'seo', 'structured-data', 'extract'];
    inputSchema = { type: 'object' as const, properties: { url: { type: 'string' as const } }, required: ['url'] };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const meta = await page.evaluate(() => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    const named: Record<string, string> = {}; const og: Record<string, string> = {}; const tw: Record<string, string> = {};
                    document.querySelectorAll('meta').forEach(m => {
                        const n = m.getAttribute('name'); const p = m.getAttribute('property'); const c = m.getAttribute('content') || '';
                        if (p && /^og:/i.test(p)) og[p] = c; else if ((n || p) && /^twitter:/i.test(n || p || '')) tw[n || p!] = c; else if (n) named[n] = c;
                    });
                    const jsonld: any[] = [];
                    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { jsonld.push(JSON.parse(s.textContent || '')); } catch { } });
                    const outline = Array.from(document.querySelectorAll('h1,h2,h3')).map(h => `${'  '.repeat(parseInt(h.tagName[1]) - 1)}${h.tagName} ${clean((h as HTMLElement).innerText)}`);
                    return {
                        title: document.title || '',
                        description: named['description'] || '',
                        keywords: named['keywords'] || '',
                        robots: named['robots'] || '',
                        canonical: (document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href || '',
                        favicon: (document.querySelector('link[rel*="icon"]') as HTMLLinkElement)?.href || '',
                        lang: document.documentElement.getAttribute('lang') || '',
                        openGraph: og, twitter: tw, jsonld, outline,
                    };
                });
                const ogCount = Object.keys(meta.openGraph).length; const twCount = Object.keys(meta.twitter).length;
                const message = `🏷️ البيانات الوصفية (${finalUrl}):\n\n` +
                    `• العنوان: ${meta.title || '—'}\n• الوصف: ${meta.description || '—'}\n• اللغة: ${meta.lang || '—'} · canonical: ${meta.canonical ? '✓' : '—'} · robots: ${meta.robots || '—'}\n` +
                    `• Open Graph: ${ogCount} وسم · Twitter: ${twCount} وسم · JSON-LD: ${meta.jsonld.length} كتلة\n\n` +
                    (meta.outline.length ? `مخطّط العناوين:\n${meta.outline.slice(0, 15).join('\n')}` : '');
                return { ok: true, output: { message, ...meta, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `extract_meta_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   4) browser_compare — before/after visual + structural diff
   ============================================================ */
export class BrowserCompareTool implements ToolDefinition {
    name = 'browser_compare';
    version = '1.0.0';
    description = 'Compare a page before/after a change: pass {before,after} URLs, or a single {url} to capture a baseline the first time and diff on the next call. Returns what was added/removed and a visual diff image + % changed.';
    tags = ['browser', 'web', 'compare', 'diff', 'visual', 'qa'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Single URL: first call captures a baseline, next call diffs against it' },
            before: { type: 'string' as const, description: 'URL of the BEFORE state' },
            after: { type: 'string' as const, description: 'URL of the AFTER state' },
        },
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        let before = normalizeUrl(input?.before || '');
        let after = normalizeUrl(input?.after || '');
        const single = normalizeUrl(input?.url || '');

        // Single-URL baseline workflow.
        const baselines: Record<string, { sig: any; png: string }> = (global as any).joeCompareBaselines || ((global as any).joeCompareBaselines = {});
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;

                const capture = async (url: string) => {
                    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(600);
                    const sig = await pageSignature(page);
                    const png = (await page.screenshot({ type: 'png', animations: 'disabled' })) as Buffer;
                    return { sig, pngB64: png.toString('base64') };
                };

                let beforeCap: { sig: any; pngB64: string };
                let afterCap: { sig: any; pngB64: string };

                if (before && after) {
                    beforeCap = await capture(before);
                    afterCap = await capture(after);
                } else if (single) {
                    const cur = await capture(single);
                    const prev = baselines[single];
                    if (!prev) {
                        baselines[single] = { sig: cur.sig, png: cur.pngB64 };
                        return { ok: true, output: { message: `📸 التقطتُ لقطة أساس (baseline) للصفحة: ${single}\nأجرِ تعديلك ثم اطلب المقارنة مرة أخرى لِأُظهر لك ما تغيّر.`, baseline: true, url: single } };
                    }
                    beforeCap = { sig: prev.sig, pngB64: prev.png };
                    afterCap = cur;
                    before = single; after = single;
                    baselines[single] = { sig: cur.sig, png: cur.pngB64 }; // refresh baseline
                } else {
                    return { ok: false, error: 'need_before_after_or_url' };
                }

                // --- Structural diff (what changed) ---
                const a = beforeCap.sig, b = afterCap.sig;
                const changes: string[] = [];
                const addedBtns = setDiff(b.buttons, a.buttons); const remBtns = setDiff(a.buttons, b.buttons);
                const addedLinks = setDiff(b.links, a.links); const remLinks = setDiff(a.links, b.links);
                const addedH = setDiff(b.headings, a.headings); const remH = setDiff(a.headings, b.headings);
                if (addedBtns.length) changes.push(`➕ أزرار جديدة: ${addedBtns.join('، ')}`);
                if (remBtns.length) changes.push(`➖ أزرار محذوفة: ${remBtns.join('، ')}`);
                if (addedLinks.length) changes.push(`➕ روابط جديدة: ${addedLinks.slice(0, 8).join('، ')}`);
                if (remLinks.length) changes.push(`➖ روابط محذوفة: ${remLinks.slice(0, 8).join('، ')}`);
                if (addedH.length) changes.push(`➕ عناوين جديدة: ${addedH.join('، ')}`);
                if (remH.length) changes.push(`➖ عناوين محذوفة: ${remH.join('، ')}`);
                if (b.images !== a.images) changes.push(`🖼️ عدد الصور: ${a.images} ← ${b.images}`);
                if (b.title !== a.title) changes.push(`🏷️ العنوان: «${a.title}» ← «${b.title}»`);
                const lenDelta = b.bodyLen - a.bodyLen;
                if (Math.abs(lenDelta) > 20) changes.push(`📝 حجم النص: ${lenDelta > 0 ? '+' : ''}${lenDelta} حرف`);

                // --- Visual diff via canvas (no external libs) ---
                let pctChanged = -1;
                let compositeHref: string | undefined;
                try {
                    const compareHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                      body{margin:0;background:#0f1113;font-family:sans-serif;color:#ddd}
                      .row{display:flex;gap:2px}.col{flex:1;text-align:center}
                      .lbl{font-size:13px;padding:6px;color:#9aa}img,canvas{width:100%;display:block;border-top:1px solid #333}
                    </style></head><body>
                      <div class="row">
                        <div class="col"><div class="lbl">قبل</div><img id="ib"></div>
                        <div class="col"><div class="lbl">بعد</div><img id="ia"></div>
                        <div class="col"><div class="lbl">الفرق</div><canvas id="cd"></canvas></div>
                      </div>
                      <script>
                        const ib=document.getElementById('ib'), ia=document.getElementById('ia'), cd=document.getElementById('cd');
                        function load(img,src){return new Promise(r=>{img.onload=()=>r(img);img.src=src;});}
                        (async()=>{
                          const b=await load(ib,'data:image/png;base64,${beforeCap.pngB64}');
                          const a=await load(ia,'data:image/png;base64,${afterCap.pngB64}');
                          const w=Math.min(b.naturalWidth,a.naturalWidth), h=Math.min(b.naturalHeight,a.naturalHeight);
                          const c1=document.createElement('canvas'),c2=document.createElement('canvas');
                          c1.width=c2.width=cd.width=w; c1.height=c2.height=cd.height=h;
                          const x1=c1.getContext('2d'),x2=c2.getContext('2d'),xd=cd.getContext('2d');
                          x1.drawImage(b,0,0,w,h); x2.drawImage(a,0,0,w,h);
                          const d1=x1.getImageData(0,0,w,h),d2=x2.getImageData(0,0,w,h),out=xd.createImageData(w,h);
                          let diff=0; const n=w*h;
                          for(let i=0;i<d1.data.length;i+=4){
                            const dr=Math.abs(d1.data[i]-d2.data[i]),dg=Math.abs(d1.data[i+1]-d2.data[i+1]),db=Math.abs(d1.data[i+2]-d2.data[i+2]);
                            if(dr+dg+db>60){diff++;out.data[i]=255;out.data[i+1]=40;out.data[i+2]=40;out.data[i+3]=255;}
                            else {out.data[i]=d2.data[i];out.data[i+1]=d2.data[i+1];out.data[i+2]=d2.data[i+2];out.data[i+3]=90;}
                          }
                          xd.putImageData(out,0,0);
                          (window).__pct=((diff/n)*100).toFixed(1);
                          document.title='PCT:'+(window).__pct;
                        })();
                      </script></body></html>`;
                    await page.setContent(compareHtml, { waitUntil: 'load' });
                    await page.waitForFunction(() => (window as any).__pct !== undefined, { timeout: 8000 }).catch(() => { });
                    pctChanged = parseFloat(await page.evaluate(() => (window as any).__pct ?? '-1'));
                    const comp = (await page.screenshot({ type: 'jpeg', quality: 70, fullPage: true })) as Buffer;
                    compositeHref = publishShot(sessionId, Buffer.from(comp), after);
                } catch { /* visual diff optional */ }

                const headline = changes.length ? changes.join('\n') : 'لا تغييرات بنيوية واضحة (قد يكون التغيير في الألوان/التنسيق فقط).';
                const pctLine = pctChanged >= 0 ? `\n\n👁️ نسبة التغيّر البصري: ${pctChanged}%` : '';
                const message = `🔀 مقارنة قبل/بعد:\n\n${headline}${pctLine}`;
                return { ok: true, output: { message, changes, pctChanged, url: after, composite: compositeHref } };
            });
        } catch (e: any) {
            return { ok: false, error: `compare_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   1) browser_summarize — read a page and summarise it
   ============================================================ */
export class BrowserSummarizeTool implements ToolDefinition {
    name = 'browser_summarize';
    version = '1.0.0';
    description = 'Open a web page in the browser, read its content, and return a concise summary (optionally answering a question about it).';
    tags = ['browser', 'web', 'summarize', 'research'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Page URL to summarise' },
            question: { type: 'string' as const, description: 'Optional question to answer from the page' },
        },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const question = String(input?.question || input?.instruction || '').trim();
        if (!url) return { ok: false, error: 'no_url' };
        const ar = isAr(question) || isAr(String(input?.request || ''));

        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                // Extract the meaningful text from the page.
                const data = await page.evaluate(() => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    const title = document.title || '';
                    const desc = (document.querySelector('meta[name="description"]') as HTMLMetaElement)?.content || '';
                    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 30).map(h => clean((h as HTMLElement).innerText)).filter(Boolean);
                    const main = (document.querySelector('main') || document.body) as HTMLElement;
                    const text = clean(main?.innerText || '').slice(0, 7000);
                    return { title, desc, headings, text };
                });
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), finalUrl);

                const sys = ar
                    ? 'أنت محلّل محتوى. لخّص الصفحة التالية بإيجاز واضح بالعربية: النقاط الرئيسية في شكل قائمة قصيرة، ثم جملة خلاصة. إن وُجد سؤال فأجب عنه من محتوى الصفحة.'
                    : 'You are a content analyst. Summarise the page concisely: key points as a short bullet list, then a one-line takeaway. If a question is given, answer it from the page.';
                const userContent = `URL: ${finalUrl}\nTitle: ${data.title}\nDescription: ${data.desc}\nHeadings: ${data.headings.join(' | ')}\n\nContent:\n${data.text}\n\n${question ? `Question: ${question}` : ''}`;

                let summary = '';
                try {
                    summary = await routeToModel([{ role: 'system', content: sys }, { role: 'user', content: userContent }], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch (e: any) { summary = ''; }
                if (!summary || summary.trim().length < 2) {
                    // Deterministic fallback so it never fails silently.
                    summary = (ar ? `تعذّر التلخيص بالذكاء الآن. عنوان الصفحة: ${data.title}. أبرز العناوين: ` : `Summary unavailable. Page title: ${data.title}. Top headings: `) + data.headings.slice(0, 6).join(' • ');
                }
                const message = (ar ? `📄 ملخّص الصفحة (${finalUrl}):\n\n` : `📄 Page summary (${finalUrl}):\n\n`) + summary;
                return { ok: true, output: { message, summary, url: finalUrl, title: data.title, screenshot: shot } };
            });
        } catch (e: any) {
            return { ok: false, error: `summarize_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   2) browser_ui_audit — deterministic UI/accessibility audit
   ============================================================ */
export class BrowserUIAuditTool implements ToolDefinition {
    name = 'browser_ui_audit';
    version = '1.0.0';
    description = 'Open a web page and run a UI/UX and accessibility audit (missing alt text, unlabeled inputs, heading structure, broken images, viewport/lang, console errors) with a score.';
    tags = ['browser', 'web', 'ui', 'audit', 'accessibility', 'qa'];
    inputSchema = {
        type: 'object' as const,
        properties: { url: { type: 'string' as const, description: 'Page URL to audit' } },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const ar = isAr(String(input?.request || input?.instruction || '')) || true; // default Arabic UI
        if (!url) return { ok: false, error: 'no_url' };
        try {
            return await withBrowserConcurrency(async () => {
                const s = await getBrowserSession(sessionId);
                const page = s.page;
                const consoleErrors: string[] = [];
                const onErr = (m: any) => { try { if (m.type?.() === 'error') consoleErrors.push(String(m.text()).slice(0, 200)); } catch { } };
                const onPageErr = (e: any) => { try { consoleErrors.push(String(e?.message || e).slice(0, 200)); } catch { } };
                page.on('console', onErr); page.on('pageerror', onPageErr);
                try {
                    const target = normalizeUrl(url);
                    await page.goto(target, { waitUntil: 'load', timeout: 30000 });
                    await page.waitForTimeout(700);

                    const audit = await page.evaluate(() => {
                        const issues: { severity: string; message: string }[] = [];
                        const q = (s: string) => Array.from(document.querySelectorAll(s));
                        // Language + viewport + title
                        if (!document.documentElement.getAttribute('lang')) issues.push({ severity: 'warning', message: 'وسم <html> بلا سمة lang (يضر الوصولية والـ RTL).' });
                        if (!document.querySelector('meta[name="viewport"]')) issues.push({ severity: 'critical', message: 'لا يوجد meta viewport — الصفحة غير متجاوبة على الجوال.' });
                        if (!document.querySelector('meta[charset]') && !document.characterSet) issues.push({ severity: 'warning', message: 'لا يوجد meta charset.' });
                        if (!(document.title || '').trim()) issues.push({ severity: 'warning', message: 'الصفحة بلا عنوان <title>.' });
                        // Images
                        const imgs = q('img') as HTMLImageElement[];
                        const noAlt = imgs.filter(i => !i.hasAttribute('alt')).length;
                        if (noAlt > 0) issues.push({ severity: 'warning', message: `${noAlt} صورة بلا نص بديل alt.` });
                        const broken = imgs.filter(i => i.complete && i.naturalWidth === 0).length;
                        if (broken > 0) issues.push({ severity: 'critical', message: `${broken} صورة مكسورة لا تُحمّل.` });
                        // Headings
                        const h1 = q('h1').length;
                        if (h1 === 0) issues.push({ severity: 'warning', message: 'لا يوجد عنوان رئيسي <h1>.' });
                        if (h1 > 1) issues.push({ severity: 'info', message: `يوجد ${h1} عناوين <h1> (يُفضّل واحد).` });
                        // Inputs without labels
                        const inputs = q('input, textarea, select').filter((el: any) => !['hidden', 'submit', 'button'].includes(el.type)) as HTMLElement[];
                        const unlabeled = inputs.filter((el: any) => {
                            const id = el.getAttribute('id');
                            const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                            return !hasLabel && !el.getAttribute('aria-label') && !el.getAttribute('placeholder');
                        }).length;
                        if (unlabeled > 0) issues.push({ severity: 'warning', message: `${unlabeled} حقل إدخال بلا تسمية (label/aria-label/placeholder).` });
                        // Buttons/links without text
                        const emptyBtns = (q('button, a') as HTMLElement[]).filter(b => !b.innerText.trim() && !b.getAttribute('aria-label') && !b.querySelector('img[alt], svg')).length;
                        if (emptyBtns > 0) issues.push({ severity: 'warning', message: `${emptyBtns} زر/رابط بلا نص واضح.` });
                        // Tiny tap targets (quick heuristic)
                        const smallTargets = (q('a, button') as HTMLElement[]).filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).length;
                        if (smallTargets > 3) issues.push({ severity: 'info', message: `${smallTargets} عنصر تفاعلي صغير (<24px) قد يصعب لمسه على الجوال.` });
                        return { issues, counts: { images: imgs.length, inputs: inputs.length, h1 } };
                    });

                    if (consoleErrors.length) audit.issues.push({ severity: 'critical', message: `${consoleErrors.length} خطأ في console: ${consoleErrors.slice(0, 2).join(' | ')}` } as any);

                    const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                    const shot = publishShot(sessionId, Buffer.from(buf), page.url());

                    const crit = audit.issues.filter((i: any) => i.severity === 'critical').length;
                    const warn = audit.issues.filter((i: any) => i.severity === 'warning').length;
                    const info = audit.issues.filter((i: any) => i.severity === 'info').length;
                    const score = Math.max(0, 100 - crit * 20 - warn * 8 - info * 3);
                    const icon = (sv: string) => sv === 'critical' ? '🔴' : sv === 'warning' ? '🟡' : '🔵';
                    const lines = audit.issues.length
                        ? audit.issues.map((i: any) => `${icon(i.severity)} ${i.message}`).join('\n')
                        : '✅ لم أجد مشاكل واضحة.';
                    const message = `🔎 تدقيق واجهة الصفحة: ${page.url()}\n\nالدرجة: ${score}/100 (🔴 ${crit} · 🟡 ${warn} · 🔵 ${info})\n\n${lines}`;
                    return { ok: true, output: { message, score, issues: audit.issues, counts: audit.counts, url: page.url(), screenshot: shot } };
                } finally {
                    try { page.off('console', onErr); page.off('pageerror', onPageErr); } catch { }
                }
            });
        } catch (e: any) {
            return { ok: false, error: `ui_audit_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   3) browser_fill_form — fill a form from provided fields
   ============================================================ */
export class BrowserFillFormTool implements ToolDefinition {
    name = 'browser_fill_form';
    version = '1.0.0';
    description = 'Open a page and fill a form. Provide fields as { "label or name or placeholder": "value" }. Optionally submit.';
    tags = ['browser', 'web', 'form', 'automation'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Page URL containing the form' },
            fields: { type: 'object' as const, description: 'Map of field identifier (label/name/id/placeholder) to value' },
            submit: { type: 'boolean' as const, description: 'Click the submit button after filling' },
        },
        required: ['fields'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };
    permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || input?.link || '';
        const fields = (input?.fields && typeof input.fields === 'object') ? input.fields : {};
        const submit = !!input?.submit;
        const keys = Object.keys(fields);
        if (keys.length === 0) return { ok: false, error: 'no_fields' };
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const filled: string[] = [];
                const missed: string[] = [];
                for (const key of keys) {
                    const value = String(fields[key] ?? '');
                    const ok = await page.evaluate(({ key, value }) => {
                        const norm = (s: string) => (s || '').toLowerCase().trim();
                        const k = norm(key);
                        const inputs = Array.from(document.querySelectorAll('input, textarea, select')) as HTMLInputElement[];
                        const match = inputs.find(el => {
                            const t = (el.type || '').toLowerCase();
                            if (['hidden', 'submit', 'button'].includes(t)) return false;
                            if (norm(el.getAttribute('name') || '') === k) return true;
                            if (norm(el.getAttribute('id') || '') === k) return true;
                            if (norm(el.getAttribute('placeholder') || '').includes(k)) return true;
                            if (norm(el.getAttribute('aria-label') || '').includes(k)) return true;
                            const id = el.getAttribute('id');
                            if (id) { const lbl = document.querySelector(`label[for="${id}"]`) as HTMLElement; if (lbl && norm(lbl.innerText).includes(k)) return true; }
                            return false;
                        });
                        if (!match) return false;
                        const tag = match.tagName.toLowerCase();
                        const type = (match.type || '').toLowerCase();
                        if (type === 'checkbox' || type === 'radio') { (match as HTMLInputElement).checked = /^(true|1|yes|on|نعم|صح)$/i.test(value); }
                        else if (tag === 'select') {
                            const sel = match as unknown as HTMLSelectElement;
                            const opt = Array.from(sel.options).find(o => norm(o.text).includes(norm(value)) || norm(o.value) === norm(value));
                            if (opt) sel.value = opt.value;
                        } else { match.value = value; }
                        match.dispatchEvent(new Event('input', { bubbles: true }));
                        match.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }, { key, value });
                    if (ok) filled.push(key); else missed.push(key);
                }

                let submitted = false;
                if (submit) {
                    submitted = await page.evaluate(() => {
                        const btn = (document.querySelector('button[type="submit"], input[type="submit"]') ||
                            Array.from(document.querySelectorAll('button')).find(b => /submit|send|إرسال|ارسال|تسجيل|حفظ/i.test(b.textContent || ''))) as HTMLElement | null;
                        if (btn) { btn.click(); return true; }
                        const form = document.querySelector('form') as HTMLFormElement | null;
                        if (form) { form.requestSubmit ? form.requestSubmit() : form.submit(); return true; }
                        return false;
                    }).catch(() => false);
                    await page.waitForTimeout(800);
                }
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), page.url());

                const message = `📝 تعبئة النموذج (${finalUrl}):\n✅ عُبّئت: ${filled.join('، ') || 'لا شيء'}` +
                    (missed.length ? `\n⚠️ لم أجد: ${missed.join('، ')}` : '') +
                    (submit ? `\n📤 الإرسال: ${submitted ? 'تم' : 'لم أجد زر إرسال'}` : '');
                return { ok: filled.length > 0, output: { message, filled, missed, submitted, url: page.url(), screenshot: shot } };
            });
        } catch (e: any) {
            return { ok: false, error: `fill_form_failed: ${e?.message || e}` };
        }
    }
}

/* ============================================================
   15) browser_translate — extract page text + translate via LLM
   ============================================================ */
export class BrowserTranslateTool implements ToolDefinition {
    name = 'browser_translate';
    version = '1.0.0';
    description = 'Open a page, extract its readable text (title, headings, paragraphs) and translate it into a target language (default Arabic) using the LLM, with a deterministic fallback that keeps the original text.';
    tags = ['browser', 'web', 'translate', 'i18n', 'language'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'Page URL to translate' },
            target: { type: 'string' as const, description: 'Target language (e.g. "ar", "arabic", "en", "english", "fr"). Default: arabic.' },
        },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        const rawTarget = String(input?.target || '').trim().toLowerCase();
        const targetAr = !rawTarget || /^(ar|arabic|عرب)/.test(rawTarget) || isAr(rawTarget);
        const targetLabel = targetAr ? 'Arabic (العربية)'
            : /^(en|eng)/.test(rawTarget) ? 'English'
                : /^(fr)/.test(rawTarget) ? 'French'
                    : /^(es)/.test(rawTarget) ? 'Spanish'
                        : /^(de)/.test(rawTarget) ? 'German'
                            : /^(tr)/.test(rawTarget) ? 'Turkish'
                                : input.target;
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const data = await page.evaluate(() => {
                    const clean = (t: string) => (t || '').replace(/\s+/g, ' ').trim();
                    const title = document.title || '';
                    const main = (document.querySelector('main, article') || document.body) as HTMLElement;
                    const blocks = Array.from(main.querySelectorAll('h1,h2,h3,h4,p,li'))
                        .map(el => clean((el as HTMLElement).innerText))
                        .filter(t => t.length > 1)
                        .slice(0, 120);
                    return { title, blocks, text: clean(main?.innerText || '').slice(0, 8000) };
                });
                const buf = await page.screenshot({ type: 'jpeg', quality: 60, animations: 'disabled' });
                const shot = publishShot(sessionId, Buffer.from(buf), finalUrl);

                const sys = `You are a professional translator. Translate the following web page content into ${targetLabel}. Preserve the structure: keep the title on its own first line, then each block on its own line in the same order. Translate faithfully and naturally; do NOT add commentary, notes, or explanations. Output ONLY the translation.`;
                const userContent = `Title: ${data.title}\n\nBlocks:\n${data.blocks.join('\n')}`;
                let translated = '';
                try {
                    translated = await routeToModel([{ role: 'system', content: sys }, { role: 'user', content: userContent }], undefined, undefined, undefined, undefined, undefined, undefined, context);
                } catch { translated = ''; }
                if (!translated || translated.trim().length < 2) {
                    translated = (targetAr ? '⚠️ تعذّرت الترجمة بالذكاء الآن؛ هذا هو النص الأصلي:\n\n' : '⚠️ Translation unavailable; original text follows:\n\n') + data.title + '\n' + data.blocks.slice(0, 60).join('\n');
                }
                const header = targetAr ? `🌐 ترجمة الصفحة (${finalUrl}) إلى ${targetLabel}:\n\n` : `🌐 Page translation (${finalUrl}) → ${targetLabel}:\n\n`;
                return { ok: true, output: { message: header + translated, translation: translated, target: targetLabel, blocks: data.blocks.length, url: finalUrl, screenshot: shot } };
            });
        } catch (e: any) { return { ok: false, error: `translate_failed: ${e?.message || e}` }; }
    }
}

/* ============================================================
   16) browser_responsive_check — multi-viewport responsive audit
   ============================================================ */
export class BrowserResponsiveCheckTool implements ToolDefinition {
    name = 'browser_responsive_check';
    version = '1.0.0';
    description = 'Open a page and test it across mobile / tablet / desktop viewports: captures a screenshot of each, and flags horizontal overflow, tiny tap targets, unreadable font sizes, and missing viewport meta. Returns a responsiveness score.';
    tags = ['browser', 'web', 'responsive', 'mobile', 'ui', 'audit'];
    inputSchema = {
        type: 'object' as const,
        properties: { url: { type: 'string' as const, description: 'Page URL to test' } },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const }; permissions = []; sideEffects = []; rateLimitPerMinute = 0; auditFields = []; mockSupported = false;

    async execute(input: any, context?: any) {
        const sessionId = String(context?.sessionId || 'default');
        const url = input?.url || '';
        if (!url) return { ok: false, error: 'no_url' };
        const viewports = [
            { name: 'mobile', label: '📱 جوال', w: 390, h: 844 },
            { name: 'tablet', label: '📲 لوحي', w: 820, h: 1180 },
            { name: 'desktop', label: '🖥️ سطح المكتب', w: 1440, h: 900 },
        ];
        try {
            return await withBrowserConcurrency(async () => {
                const { page, url: finalUrl } = await openPage(sessionId, url);
                const results: any[] = [];
                for (const vp of viewports) {
                    await page.setViewportSize({ width: vp.w, height: vp.h });
                    await page.waitForTimeout(500);
                    const metrics = await page.evaluate((vw: number) => {
                        const doc = document.documentElement;
                        const scrollW = Math.max(doc.scrollWidth, document.body?.scrollWidth || 0);
                        const overflowX = scrollW > vw + 2;
                        // find elements physically wider than the viewport
                        const wide: string[] = [];
                        Array.from(document.querySelectorAll('*')).slice(0, 4000).forEach(el => {
                            const r = (el as HTMLElement).getBoundingClientRect();
                            if (r.width > vw + 4 && r.height > 0 && wide.length < 8) {
                                const tag = el.tagName.toLowerCase();
                                const cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).join('.');
                                wide.push(cls ? `${tag}.${cls}` : tag);
                            }
                        });
                        // tap targets (interactive elements smaller than 40px)
                        let tiny = 0;
                        Array.from(document.querySelectorAll('a,button,input,select,[role="button"]')).forEach(el => {
                            const r = (el as HTMLElement).getBoundingClientRect();
                            if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40)) tiny++;
                        });
                        // small fonts
                        let smallFonts = 0;
                        Array.from(document.querySelectorAll('p,span,li,a,td')).slice(0, 1500).forEach(el => {
                            const fs = parseFloat(getComputedStyle(el as HTMLElement).fontSize || '16');
                            if (fs && fs < 12) smallFonts++;
                        });
                        const hasViewportMeta = !!document.querySelector('meta[name="viewport"]');
                        return { scrollW, overflowX, wide: Array.from(new Set(wide)), tiny, smallFonts, hasViewportMeta };
                    }, vp.w);
                    const buf = await page.screenshot({ type: 'jpeg', quality: 55, animations: 'disabled' });
                    const shot = publishShot(sessionId, Buffer.from(buf), `${finalUrl}#${vp.name}`);
                    results.push({ ...vp, ...metrics, screenshot: shot });
                }
                // restore a sane desktop viewport
                await page.setViewportSize({ width: 1280, height: 800 }).catch(() => { });

                // scoring
                let score = 100;
                const issues: string[] = [];
                if (!results[0]?.hasViewportMeta) { score -= 25; issues.push('❌ لا يوجد وسم viewport — الصفحة لن تتكيّف مع الجوال.'); }
                results.forEach(r => {
                    if (r.overflowX) { score -= 15; issues.push(`↔️ تمرير أفقي على ${r.label} (${r.w}px)${r.wide.length ? ` — عناصر عريضة: ${r.wide.join('، ')}` : ''}.`); }
                });
                const mob = results.find(r => r.name === 'mobile');
                if (mob?.tiny > 0) { score -= Math.min(15, mob.tiny * 2); issues.push(`👆 ${mob.tiny} هدف لمس أصغر من 40px على الجوال.`); }
                if (mob?.smallFonts > 0) { score -= Math.min(10, mob.smallFonts); issues.push(`🔎 ${mob.smallFonts} عنصر بخط أصغر من 12px على الجوال.`); }
                score = Math.max(0, Math.min(100, score));

                const grade = score >= 90 ? 'ممتاز ✅' : score >= 70 ? 'جيد 👍' : score >= 50 ? 'متوسط ⚠️' : 'ضعيف ❌';
                const message = `📐 فحص التجاوب (${finalUrl}) — النتيجة: ${score}/100 (${grade})\n\n` +
                    results.map(r => `${r.label} ${r.w}×${r.h}: ${r.overflowX ? 'تمرير أفقي ⚠️' : 'لا تمرير أفقي ✅'}`).join('\n') +
                    (issues.length ? `\n\nالملاحظات:\n${issues.map(i => `• ${i}`).join('\n')}` : '\n\nلا مشاكل تجاوب واضحة. 🎉');
                return { ok: true, output: { message, score, grade, viewports: results.map(r => ({ name: r.name, w: r.w, h: r.h, overflowX: r.overflowX, tiny: r.tiny, smallFonts: r.smallFonts, wide: r.wide, screenshot: r.screenshot })), issues, url: finalUrl } };
            });
        } catch (e: any) { return { ok: false, error: `responsive_check_failed: ${e?.message || e}` }; }
    }
}
