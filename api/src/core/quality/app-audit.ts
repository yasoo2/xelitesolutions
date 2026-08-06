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
import { getChromiumLaunchOptions } from '../../modules/browser/manager';
import { probeControls, judgeBehaviour } from './behaviour-audit';

export interface AppAuditFinding {
    id: string;
    severity: 'high' | 'medium' | 'low';
    detail: string;
}

export interface AppAudit {
    skipped?: string;
    score: number;
    findings: AppAuditFinding[];
    /** Which pages were opened, and how many controls were actually pressed. */
    routes?: string[];
    pressed?: number;
    dead?: string[];
}

/** 100 minus what the findings earn — the same finding always costs the same. */
export function scoreOf(findings: AppAuditFinding[]): number {
    const cost = { high: 15, medium: 8, low: 3 } as const;
    return Math.max(0, findings.reduce((s, f) => s - cost[f.severity], 100));
}

export async function auditBuiltApp(
    distDir: string,
    opts?: { timeoutMs?: number; watchSessionId?: string; onProgress?: (m: string) => void },
): Promise<AppAudit> {
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
    let borrowed = false;
    /**
     * Taking the listeners back off is not tidiness — it is correctness.
     * A borrowed panel page lives for the whole session, so a listener left
     * behind by an audit that threw is still counting console errors from
     * whatever the user browses next, and the audit after it inherits them.
     */
    let detach: () => void = () => { /* nothing hooked yet */ };
    try {
        /**
         * THE AUDIT HAPPENS WHERE HE CAN SEE IT — «كيف بدنا نصلح المتصفح».
         *
         * Two field complaints, six weeks apart, that look contradictory and
         * are not:
         *   «في اثناء البناء تم فتح المتصفح … بدون اي فائده»  — an OS window
         *      popped up on his desktop mid-build. Correctly killed: this
         *      audit forced headless from that day on.
         *   «تم تشغيل المتصفح ولكن لم يقم بما لازم القيام به» — and then
         *      nothing was ever visible again. The build said «self-QA:
         *      62/100 — console_errors, failed_requests» and he had no way to
         *      see any of it happen.
         *
         * What he wants is neither: not a window on his desktop, and not an
         * invisible process. It is Joe's OWN browser panel, which already
         * exists and already streams frames to the interface. So the audit
         * borrows that session when one is offered — the page loads in the
         * panel, he watches it load, and the findings are drawn ON it.
         *
         * When there is no panel (a script, a test, a machine with no UI) it
         * falls back to exactly what it did before: a private headless browser.
         */
        let page: any = null;
        if (opts?.watchSessionId) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { getBrowserSession, resumeStreamingIfWatched } = require('../../modules/browser/manager');
                const s = await getBrowserSession(opts.watchSessionId);
                if (s?.page) {
                    page = s.page; borrowed = true;
                    /**
                     * AND START THE STREAM, BECAUSE NOBODY ELSE WILL.
                     *
                     * The panel attaches BEFORE this line runs — that is the
                     * whole point of waiting for it — and `onFirstClient` fires
                     * `startStreaming` at that moment, when there is no browser
                     * session yet and therefore nothing to stream. The session
                     * is born HERE, one line above, and until this call nobody
                     * told the streamer it exists.
                     *
                     * Measured before this line: 47 frames reached a watching
                     * panel during an eight-second audit, and ZERO of them in
                     * its first third. He was shown the end of a thing he was
                     * promised he could watch.
                     */
                    try { resumeStreamingIfWatched(opts.watchSessionId); } catch { /* streaming is a bonus */ }
                    opts.onProgress?.('watching');
                }
            } catch { /* no panel available — the private browser below serves */ }
        }
        if (!page) {
            browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
            page = await browser.newPage();
            /**
             * AND SAY SO. A silent fallback is what produced «مازال يفتح
             * المتصفح دون عمل شيء»: the panel was opened for him, the audit ran
             * somewhere else entirely, and the white rectangle explained
             * nothing. If he cannot watch it, he is told he cannot watch it.
             */
            opts?.onProgress?.('private');
        }
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        const heavyImages: string[] = [];
        const onPageError = (e: any) => pageErrors.push(String(e).slice(0, 120));
        page.on('pageerror', onPageError);
        /**
         * A console error must name the RESOURCE, not just the complaint.
         * «Failed to load resource: 404» told the reader nothing — not which
         * file, not from where — so a finding that cost 15 points could not
         * be acted on. Chromium carries the location; we print it.
         */
        const onConsole = (m: any) => {
            if (m.type() !== 'error') return;
            const where = (() => {
                try { const l = m.location(); return l?.url ? ` ← ${String(l.url).slice(-60)}` : ''; } catch { return ''; }
            })();
            // Chrome asks every site for /favicon.ico and reports the miss as a
            // console error with the URL only in the location. It was costing a
            // clean build 15 points for a file the browser invented a request for.
            if (/favicon\.ico/i.test(String(m.text()) + where)) return;
            consoleErrors.push((String(m.text()).slice(0, 120) + where).slice(0, 180));
        };
        page.on('console', onConsole);
        const onResponse = (r: any) => {
            if (r.status() >= 400 && !/favicon\.ico/i.test(r.url())) failedRequests.push(`${r.status()} ${r.url().slice(-60)}`);
            try {
                const len = Number(r.headers()['content-length'] || 0);
                if (len > 400_000 && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(r.url())) {
                    heavyImages.push(`${Math.round(len / 1024)}KB ${r.url().slice(-50)}`);
                }
            } catch { /* headers optional */ }
        };
        page.on('response', onResponse);
        // A borrowed panel page is long-lived: its listeners must not pile up
        // one audit at a time.
        // The real unhook is installed below, once every listener exists; this
        // keeps the reference in scope for the `finally` that must run it even
        // when the audit throws halfway through.
        const unhook = () => detach();
        // A page that pops a confirm() would hang the audit the moment a button
        // is pressed — and buttons are pressed now. Named, because on a BORROWED
        // panel page an anonymous listener is one that can never be taken off,
        // and the panel outlives every audit that touches it.
        const onDialog = (d: any) => d.dismiss().catch(() => { });
        page.on('dialog', onDialog);
        detach = () => {
            try {
                page.off('pageerror', onPageError); page.off('console', onConsole);
                page.off('response', onResponse); page.off('dialog', onDialog);
            } catch { /* the page may already be gone */ }
        };
        await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });

        // The declared webfont must actually LOAD — a stack that names Cairo
        // while serving no file is the exact costume this audit was born from.
        await page.evaluate(() => (document as any).fonts?.ready);
        const inspect = () => page.evaluate(() => {
            const controls = [...document.querySelectorAll('a.btn, button, .nav-links a')] as HTMLElement[];
            const small = controls.filter(c => {
                const r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40);
            }).map(c => (c.textContent || c.className || '').trim().slice(0, 30));
            return {
                deadImgs: ([...document.images] as HTMLImageElement[]).filter(i => i.currentSrc && i.naturalWidth === 0).length,
                deadLinks: [...document.querySelectorAll('a')].filter(a => {
                    const h = a.getAttribute('href');
                    if (h !== '' && h !== '#') return false;
                    // A map library's zoom controls are real, working buttons
                    // that happen to be anchors — reporting them as dead links
                    // punished the first build that carried an actual map.
                    if (a.getAttribute('role') === 'button') return false;
                    if (a.closest('[class*="leaflet"], [class*="mapbox"], [class*="ol-control"]')) return false;
                    return true;
                }).length,
                small,
                h1s: document.querySelectorAll('h1').length,
                bg: getComputedStyle(document.body).backgroundColor,
                hasToggle: !!document.querySelector('.theme-toggle'),
                declaredFont: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim(),
                fontLoaded: (() => {
                    const first = getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, '').trim();
                    if (!['Cairo', 'Amiri', 'Tajawal'].includes(first)) return null;   // not one of ours — no claim to check
                    try { return (document as any).fonts.check(`16px "${first}"`); } catch { return null; }
                })(),
            };
        });
        const dom = await inspect();

        let toggleWorks = true;
        if (dom.hasToggle) {
            await page.click('.theme-toggle');
            await page.waitForTimeout(150);
            const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
            toggleWorks = bg2 !== dom.bg;
        }

        /**
         * AND NOW THE PART THAT WAS NEVER HERE: THE APP IS USED.
         *
         * Everything above this line looks at a page. None of it presses
         * anything, and none of it leaves the home route. So a React build
         * could ship with a «أضف إلى السلة» button wired to nothing and a
         * second page that throws on load, and this audit would call it
         * 100/100 — truthfully, about the wrong question.
         *
         * The single-file HTML builder has clicked its controls for months.
         * The React path — the newer and far more capable one — never did.
         * It uses the SAME probe now, so «this button does nothing» has one
         * definition in the system rather than two.
         */
        const routes: string[] = await page.evaluate(() => {
            const out = new Set<string>();
            document.querySelectorAll('a[href]').forEach(a => {
                const h = (a.getAttribute('href') || '').trim();
                if (/^#\/.+/.test(h)) out.add(h);                       // hash router
                else if (/^\/?[\w-]+\.html$/i.test(h)) out.add(h.replace(/^\//, ''));   // multi-file
            });
            return [...out].slice(0, 5);
        }).catch(() => []);

        const allControls: any[] = [];
        const behaviourMetrics: Record<string, any> = { pressed: 0, dead: 0, deadAnchors: 0, keyboardUnreachable: 0, keyboardUnreachableSamples: [], formsWithoutValidation: 0 };
        const mergeProbe = (p: { controls: any[]; metrics: Record<string, any> }, route: string) => {
            for (const c of p.controls) allControls.push({ ...c, label: route === '/' ? c.label : `${route} ${c.label}` });
            behaviourMetrics.deadAnchors += p.metrics.deadAnchors || 0;
            behaviourMetrics.formsWithoutValidation += p.metrics.formsWithoutValidation || 0;
            behaviourMetrics.keyboardUnreachable += p.metrics.keyboardUnreachable || 0;
            behaviourMetrics.keyboardUnreachableSamples.push(...(p.metrics.keyboardUnreachableSamples || []));
        };

        opts?.onProgress?.('pressing');
        try { mergeProbe(await probeControls(page), '/'); } catch { /* the controls are what is under test */ }

        // Every other page the app offers, audited as a page in its own right.
        const brokenRoutes: string[] = [];
        for (const r of routes) {
            const target = r.startsWith('#') ? url + r : url + r;
            try {
                await page.goto(target, { waitUntil: 'load', timeout: Math.min(timeoutMs, 20_000) });
                await page.waitForTimeout(500);
                const d2 = await inspect();
                if (d2.deadImgs) dom.deadImgs += d2.deadImgs;
                if (d2.deadLinks) dom.deadLinks += d2.deadLinks;
                if (d2.small.length) dom.small.push(...d2.small.map((s: string) => `${r} ${s}`));
                if (d2.h1s !== 1) brokenRoutes.push(`${r} (h1=${d2.h1s})`);
                mergeProbe(await probeControls(page), r);
            } catch (e: any) {
                brokenRoutes.push(`${r} (${String(e?.message || e).slice(0, 40)})`);
            }
        }
        if (routes.length) { try { await page.goto(url, { waitUntil: 'load', timeout: 15_000 }); } catch { /* home is optional now */ } }

        behaviourMetrics.pressed = allControls.filter(c => c.kind !== 'anchor').length;
        behaviourMetrics.dead = allControls.filter(c => c.kind !== 'anchor' && !c.worked).length;
        const behaviour = judgeBehaviour(allControls, behaviourMetrics, []);

        const findings: AppAuditFinding[] = [];
        if (pageErrors.length) findings.push({ id: 'page_errors', severity: 'high', detail: `${pageErrors.length} خطأ صفحة: ${pageErrors[0]}` });
        if (consoleErrors.length) findings.push({ id: 'console_errors', severity: 'high', detail: `${consoleErrors.length} خطأ كونسول: ${consoleErrors[0]}` });
        if (failedRequests.length) findings.push({ id: 'failed_requests', severity: 'high', detail: `${failedRequests.length} ملف لم يصل: ${failedRequests[0]}` });
        if (dom.deadImgs) findings.push({ id: 'dead_images', severity: 'high', detail: `${dom.deadImgs} صورة لم تُرسم` });
        if (dom.deadLinks) findings.push({ id: 'dead_links', severity: 'medium', detail: `${dom.deadLinks} رابط ميت (href فارغ أو #)` });
        if (dom.small.length) findings.push({ id: 'small_targets', severity: 'medium', detail: `${dom.small.length} هدف لمس أصغر من 40px: ${dom.small[0]}` });
        if (dom.h1s !== 1) findings.push({ id: 'h1_count', severity: 'low', detail: `عدد h1 = ${dom.h1s} (المطلوب 1)` });
        if (dom.hasToggle && !toggleWorks) findings.push({ id: 'theme_toggle_dead', severity: 'medium', detail: 'زر الوضع الليلي لا يغيّر الألوان فعلياً' });
        if (dom.fontLoaded === false) findings.push({ id: 'webfont_missing', severity: 'medium', detail: `الخط المعلن «${dom.declaredFont}» لم يُحمَّل فعلياً — ملفاته غائبة` });
        if (heavyImages.length) findings.push({ id: 'heavy_images', severity: 'low', detail: `${heavyImages.length} صورة ثقيلة (>400KB): ${heavyImages[0]}` });
        if (brokenRoutes.length) findings.push({ id: 'broken_routes', severity: 'high', detail: `${brokenRoutes.length} صفحة لم تُفتح أو بلا عنوان رئيسي: ${brokenRoutes[0]}` });
        // Behaviour speaks in its own vocabulary; it is translated here rather
        // than re-judged, so the two audits never disagree about a dead button.
        const asSeverity = { critical: 'high', major: 'medium', minor: 'low' } as const;
        for (const f of behaviour.findings) {
            findings.push({ id: f.code, severity: asSeverity[f.severity], detail: f.ar });
        }

        /**
         * AND HE SEES THE VERDICT ON THE PAGE ITSELF.
         *
         * A number in a log is not watching a check happen. When the audit is
         * running in his own panel, the findings are painted onto the page for
         * a few seconds — the score, and a red outline around every element
         * that earned a deduction — so «62/100 — small_targets» stops being a
         * word and becomes the three buttons it is actually talking about.
         */
        if (borrowed) {
            try {
                await page.evaluate(({ score, list }: any) => {
                    document.querySelectorAll('[data-joe-audit]').forEach(e => e.remove());
                    const mark = (sel: string) => document.querySelectorAll(sel).forEach((el: any) => {
                        const r = el.getBoundingClientRect();
                        if (!r.width || !r.height) return;
                        const box = document.createElement('div');
                        box.setAttribute('data-joe-audit', '1');
                        box.style.cssText = `position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;`
                            + `width:${r.width}px;height:${r.height}px;border:2px solid #ef4444;border-radius:6px;`
                            + 'pointer-events:none;z-index:2147483646;box-shadow:0 0 0 3px rgba(239,68,68,.18)';
                        document.body.appendChild(box);
                    });
                    for (const id of list.map((f: any) => f.id)) {
                        if (id === 'dead_images') mark('img');
                        if (id === 'small_targets') mark('a.btn, button, .nav-links a');
                        if (id === 'dead_links') mark('a[href=""], a[href="#"]');
                    }
                    const card = document.createElement('div');
                    card.setAttribute('data-joe-audit', '1');
                    card.dir = 'rtl';
                    card.style.cssText = 'position:fixed;inset-inline-end:16px;top:16px;z-index:2147483647;'
                        + 'background:rgba(2,6,23,.92);color:#e2e8f0;border:1px solid rgba(148,163,184,.3);'
                        + 'border-radius:14px;padding:14px 16px;font:13px/1.7 system-ui,sans-serif;'
                        + 'max-width:340px;box-shadow:0 18px 50px -12px rgba(0,0,0,.7)';
                    const colour = score >= 90 ? '#34d399' : score >= 70 ? '#fbbf24' : '#f87171';
                    card.innerHTML = `<div style="font-size:22px;font-weight:800;color:${colour}">${score}/100</div>`
                        + '<div style="opacity:.75;margin-bottom:6px">فحص الجودة الذاتي — جو</div>'
                        + (list.length
                            ? '<ul style="margin:0;padding-inline-start:18px">'
                            + list.map((f: any) => `<li>${String(f.detail).replace(/</g, '&lt;')}</li>`).join('')
                            + '</ul>'
                            : '<div style="color:#34d399">لا ملاحظات — نظيف تماماً.</div>');
                    document.body.appendChild(card);
                }, { score: scoreOf(findings), list: findings });
                // Long enough for the frames to reach the panel and be read.
                await page.waitForTimeout(3500);
                await page.evaluate(() => document.querySelectorAll('[data-joe-audit]').forEach(e => e.remove()));
            } catch { /* the overlay is a courtesy — never a failed audit */ }
        }
        unhook();

        return {
            score: scoreOf(findings), findings,
            routes: ['/', ...routes],
            pressed: behaviourMetrics.pressed,
            dead: allControls.filter(c => c.kind !== 'anchor' && !c.worked).map(c => c.label),
        };
    } catch (e: any) {
        return { skipped: `browser failed (${String(e?.message || e).slice(0, 80)})`, score: 0, findings: [] };
    } finally {
        // Whatever happened — clean return, throw, or timeout — the panel page
        // goes back to the user with no listeners of ours left on it.
        detach();
        // Only a browser WE launched is ours to close — closing the panel's
        // would take his own browser down with the audit.
        if (!borrowed) { try { await browser?.close(); } catch { /* already gone */ } }
        srv.close();
    }
}

/** The verdict, formatted for the chat — findings named, never buried. */
export function formatAudit(a: AppAudit, isAr: boolean): string {
    if (a.skipped) return isAr ? `🔎 فحص الجودة الذاتي: تخطيته (${a.skipped}).` : `🔎 Self-QA skipped (${a.skipped}).`;
    // «كل الأزرار حية» used to be printed by an audit that never pressed one.
    // The claim is now the count of what was actually pressed, on how many pages.
    const pages = (a.routes || []).length || 1;
    const scope = isAr
        ? `(${pages} صفحة، ${a.pressed || 0} زر مضغوط فعلاً)`
        : `(${pages} page(s), ${a.pressed || 0} control(s) pressed)`;
    if (!a.findings.length) {
        return isAr
            ? `🔎 فحص الجودة الذاتي في متصفح حقيقي ${scope}: 100/100 — صفر أخطاء، كل الصور مرسومة، وكل زر ضُغط استجاب.`
            : `🔎 Self-QA in a real browser ${scope}: 100/100 — clean.`;
    }
    const lines = a.findings.map(f => `   • ${f.detail}`).join('\n');
    return isAr
        ? `🔎 فحص الجودة الذاتي في متصفح حقيقي ${scope}: ${a.score}/100 — وجدت:\n${lines}`
        : `🔎 Self-QA ${scope}: ${a.score}/100:\n${lines}`;
}
