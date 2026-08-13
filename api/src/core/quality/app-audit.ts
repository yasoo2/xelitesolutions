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
import { probeControls, judgeBehaviour, FormResult, ControlResult } from './behaviour-audit';
import { AuditEyes } from './audit-eyes';
import { inspectUi } from './ui-inspection';

export interface AppAuditFinding {
    id: string;
    severity: 'high' | 'medium' | 'low';
    /**
     * THE OFFENDERS, BY NAME.
     *
     * A finding used to be a sentence: «3 tap target(s) under 32px on mobile
     * (احجز الآن = 51x36)». True, readable, and nothing a repairer can aim at
     * — so the repair was a blanket rule over every button on the page, and a
     * blanket is what makes a second round impossible: there is nothing left
     * to tighten that has not already been loosened everywhere.
     *
     * The audit knows exactly WHICH element measured 51x36 and exactly WHICH
     * two colours made 3.29:1. Carrying that here turns the next round from a
     * bandage into surgery.
     */
    evidence?: any[];
    /** The sentence, in Arabic. */
    detail: string;
    /**
     * …AND IN ENGLISH.
     *
     * The English delivery message read: «⛔ Delivered, but it does NOT work
     * properly — 2 blocking finding(s) remain: • 3 خطأ كونسول: Failed to load
     * resource…». The behaviour audit had carried both languages for months;
     * these eleven findings were Arabic-only, and the message printed them
     * into whatever language it was written in.
     */
    detailEn?: string;
}

/** The finding in the reader's language, never in the other one. */
export function findingText(f: AppAuditFinding, isAr: boolean): string {
    return (isAr ? f.detail : (f.detailEn || f.detail)) || '';
}

export interface AppAudit {
    skipped?: string;
    score: number;
    findings: AppAuditFinding[];
    /** Which pages were opened, and how many controls were actually pressed. */
    routes?: string[];
    pressed?: number;
    dead?: string[];
    /** …how many forms were really filled in and sent, and at how many widths. */
    formsFilled?: number;
    fieldsFilled?: number;
    forms?: FormResult[];
    viewports?: string[];
    /** Every control, with what actually changed — what a proof can read. */
    controls?: ControlResult[];
}

/** 100 minus what the findings earn — the same finding always costs the same. */
export function scoreOf(findings: AppAuditFinding[]): number {
    const cost = { high: 15, medium: 8, low: 3 } as const;
    return Math.max(0, findings.reduce((s, f) => s - cost[f.severity], 100));
}

export async function auditBuiltApp(
    distDir: string,
    opts?: {
        timeoutMs?: number; watchSessionId?: string; onProgress?: (m: string) => void;
        /**
         * AUDIT THE SYSTEM, NOT THE FOLDER.
         *
         * His store was measured on a bare static server and marked broken:
         *
         *     ⛔ Delivered, but it does NOT work properly — 2 blocking findings
         *        • 3 console errors: 404 ← http://127.0.0.1:57701/api/health
         *        • 1 file did not arrive: 404 /api/health
         *
         * Nothing was broken. The app asks its own origin one question at
         * startup — «do you serve my API?» — and a folder cannot answer it.
         * The build had ALREADY packaged that interface inside its API server,
         * where the question answers itself; the audit just never went there.
         *
         * Give this the address of the running system and the audit measures
         * the real thing: the API answers, the catalogue loads from the real
         * database, and a 404 on /api/health becomes what it should always
         * have been — a genuine defect.
         */
        serveUrl?: string;
        /**
         * The request forbade using the network. The audit still runs; it
         * simply never downloads anything to make itself possible.
         */
        offline?: boolean;
    },
): Promise<AppAudit> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
        return { skipped: 'no dist/index.html to audit', score: 0, findings: [] };
    }
    let chromium: any;
    try { chromium = require('playwright').chromium; }
    catch { return { skipped: 'playwright not installed', score: 0, findings: [] }; }

    /**
     * When the system is already running somewhere, audit THERE. The static
     * server below exists only for a build that has no server of its own.
     */
    const givenUrl = String(opts?.serveUrl || '').trim();
    const srv = http.createServer((req, res) => {
        const rel = decodeURIComponent(String(req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const file = path.join(distDir, rel);
        if (!file.startsWith(distDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
        const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream';
        res.writeHead(200, { 'content-type': type });
        res.end(fs.readFileSync(file));
    });
    if (!givenUrl) await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
    const url = givenUrl || `http://127.0.0.1:${(srv.address() as any).port}/`;

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
        let borrowError = '';
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
                } else {
                    borrowError = 'the panel session opened without a page';
                }
            } catch (e: any) {
                /**
                 * AND THE REASON IS NEVER SWALLOWED AGAIN.
                 *
                 * This catch was `catch { }`. On his machine the panel session
                 * failed to start on EVERY run — a stale saved cookie, a locked
                 * profile, a headed mode Chromium would not give — and the only
                 * thing he ever saw was a white rectangle and a log line saying
                 * the browser had been opened: «كل شي وهمي».
                 */
                borrowError = String(e?.message || e).slice(0, 300);
            }
            // …and written down where a later diagnosis can read it, because the
            // failure happens inside the SERVER process, which no standalone
            // check can enter.
            if (borrowError) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    require('../../modules/browser/manager').noteBrowserFailure(opts.watchSessionId, 'audit-borrow', borrowError);
                } catch { /* the log is a bonus, never a blocker */ }
            }
        }
        if (!page) {
            /**
             * A MISSING BROWSER IS A COMMAND JOE CAN RUN, NOT A NOTE TO HIM.
             *
             * Chromium's binary is a download, not a dependency, so a fresh
             * machine reaches here with playwright present and no browser to
             * launch. Until now that ended the check and printed a warning
             * telling the user to type `npx playwright install chromium`. He
             * has a terminal open with Joe working inside it; the command
             * belongs to Joe. It runs once, visibly, and the launch is retried.
             */
            try {
                browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
            } catch (e: any) {
                const { isMissingBrowser, ensureChromium } = require('./ensure-chromium');
                if (!isMissingBrowser(e)) throw e;
                const got = await ensureChromium({
                    say: (l: string) => opts?.onProgress?.(`term:${l}`),
                    offline: !!opts?.offline,
                });
                if (!got.ok) return { skipped: got.detail, score: 0, findings: [] };
                browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
            }
            page = await browser.newPage();
            /**
             * AND SAY SO. A silent fallback is what produced «مازال يفتح
             * المتصفح دون عمل شيء»: the panel was opened for him, the audit ran
             * somewhere else entirely, and the white rectangle explained
             * nothing. If he cannot watch it, he is told he cannot watch it.
             */
            opts?.onProgress?.(borrowError ? `private:${borrowError}` : 'private');
        }
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        const heavyImages: string[] = [];
        /** Set only when the address the audit was given refused its own root. */
        let frontDoor: { url: string; status: number; recovered: boolean } | null = null;
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
            /**
             * AND THE APP'S OWN «DO YOU SERVE MY API?» IS NOT A DEFECT OF THE
             * APP. On a static folder that question CANNOT be answered — the
             * folder has no server — and its 404 cost his working store two
             * blocking findings and 15 points. When the audit runs against the
             * real system (serveUrl), the same 404 counts in full, because
             * there it means the API really is missing.
             */
            if (!givenUrl && /\/api\/health/.test(String(m.text()) + where)) return;
            /**
             * AND «401 Unauthorized» IS NOT A BROKEN BUILD.
             *
             * Measured on his own run: the audit filled the form and pressed
             * «أضف»; the app saved locally, tried to sync, and the server
             * refused because the audit never signed in — which is exactly what
             * the server is FOR. The app even says so on screen («حُفظ محلياً
             * فقط — سجّل الدخول»). It cost the build two blocking findings and
             * fifteen points each, for behaving correctly.
             *
             * 404 and 500 still count in full: those are real.
             */
            if (/\b40[13]\b|Unauthorized|Forbidden/i.test(String(m.text()))) return;
            consoleErrors.push((String(m.text()).slice(0, 120) + where).slice(0, 180));
        };
        page.on('console', onConsole);
        const onResponse = (r: any) => {
            // 401/403: the audit is signed out on purpose — see onConsole above.
            if (r.status() >= 400 && r.status() !== 401 && r.status() !== 403
                && !/favicon\.ico/i.test(r.url())
                && !(!givenUrl && /\/api\/health/.test(r.url()))) failedRequests.push(`${r.status()} ${r.url().slice(-60)}`);
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
        /**
         * THE AUDIT ANSWERS «YES».
         *
         * This was `d.dismiss()` — the audit clicked «حذف», the app asked «حذف
         * هذا السجلّ؟», and the audit said NO. Nothing changed, so the probe
         * reported «أزرار لا تستجيب: حذف» on every build with a confirm on it.
         * A tester who cancels every dialog is not testing the button; he is
         * testing the cancel path and calling the button broken.
         *
         * beforeunload stays dismissed: accepting it navigates away from the
         * page being measured.
         */
        const onDialog = (d: any) => {
            const kind = (() => { try { return String(d.type()); } catch { return ''; } })();
            const p = kind === 'beforeunload' ? d.dismiss() : d.accept('Joe QA');
            return p.catch(() => { });
        };
        page.on('dialog', onDialog);
        detach = () => {
            try {
                page.off('pageerror', onPageError); page.off('console', onConsole);
                page.off('response', onResponse); page.off('dialog', onDialog);
            } catch { /* the page may already be gone */ }
        };
        /**
         * DID I EVEN LAND ON THE SYSTEM? — «انه بدائي وفاشل».
         *
         * His «social media platform» build was graded 41/100 with six
         * findings: no <h1>, no <main>, no viewport meta, horizontal scroll at
         * 390px, 0 controls pressed, 0 forms filled. Every one of them was
         * true — of EXPRESS'S 404 PAGE. The packaged feed server did not serve
         * public/ (fixed at the cause), so «/» answered 404, and the auditor
         * walked into an error page and reviewed its typography.
         *
         * A browser that behaves intelligently with any system asks this
         * question FIRST, and then does two things no naive one does:
         *
         *   1. it says the truth about the SYSTEM — the front door is shut —
         *      as one blocking finding, instead of six invented ones;
         *   2. it does not give up: it falls back to serving the built
         *      interface itself, so the report is still about the product.
         */
        const landing = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
        const doorStatus = Number(landing?.status?.() || 0);
        if (doorStatus >= 400) {
            frontDoor = { url, status: doorStatus, recovered: false };
            // The running system refused its own root. Measure the interface
            // anyway — from the folder, which is the thing that was built.
            if (givenUrl) {
                await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
                const fallback = `http://127.0.0.1:${(srv.address() as any).port}/`;
                try {
                    const second = await page.goto(fallback, { waitUntil: 'networkidle', timeout: timeoutMs });
                    if (Number(second?.status?.() || 0) < 400) {
                        frontDoor.recovered = true;
                        // Everything counted while standing on the error page
                        // belonged to the error page, not to the product.
                        consoleErrors.length = 0;
                        failedRequests.length = 0;
                        pageErrors.length = 0;
                        opts?.onProgress?.('recovered');
                    }
                } catch { /* the folder could not be served either — reported below */ }
            }
        }

        // The declared webfont must actually LOAD — a stack that names Cairo
        // while serving no file is the exact costume this audit was born from.
        await page.evaluate(() => (document as any).fonts?.ready);
        const inspect = () => page.evaluate(() => {
            const controls = [...document.querySelectorAll('a.btn, button, .nav-links a')] as HTMLElement[];
            /** A stable-enough selector for one element: tag + its first class. */
            const selOf = (el: Element): string => {
                const id = (el as HTMLElement).id;
                if (id) return '#' + id;
                const cls = String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
                return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
            };
            const tooSmall = controls.filter(c => {
                const r = c.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40);
            });
            const small = tooSmall.map(c => (c.textContent || c.className || '').trim().slice(0, 30));
            // …and the same offenders as selectors, so a repair can aim.
            const smallSel = tooSmall.map(c => {
                const r = c.getBoundingClientRect();
                return { sel: selOf(c), label: (c.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
            });
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
                smallSel,
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
        const allForms: FormResult[] = [];
        const behaviourMetrics: Record<string, any> = {
            pressed: 0, dead: 0, deadAnchors: 0, keyboardUnreachable: 0, keyboardUnreachableSamples: [],
            formsWithoutValidation: 0, formsFilled: 0, fieldsFilled: 0, formsDeadSubmit: 0, formsValidated: 0, formsReloaded: 0,
        };
        const mergeProbe = (p: { controls: any[]; metrics: Record<string, any>; forms?: FormResult[] }, route: string) => {
            for (const c of p.controls) allControls.push({ ...c, label: route === '/' ? c.label : `${route} ${c.label}` });
            behaviourMetrics.deadAnchors += p.metrics.deadAnchors || 0;
            behaviourMetrics.formsWithoutValidation += p.metrics.formsWithoutValidation || 0;
            behaviourMetrics.keyboardUnreachable += p.metrics.keyboardUnreachable || 0;
            behaviourMetrics.keyboardUnreachableSamples.push(...(p.metrics.keyboardUnreachableSamples || []));
            for (const k of ['formsFilled', 'fieldsFilled', 'formsDeadSubmit', 'formsValidated', 'formsReloaded']) {
                behaviourMetrics[k] += p.metrics[k] || 0;
            }
            for (const f of p.forms || []) allForms.push({ ...f, label: route === '/' ? f.label : `${route} ${f.label}` });
        };

        /**
         * AND HE WATCHES IT HAPPEN — «لا يوجد موشر وتحديد بالاحمر».
         *
         * The eyes only exist when the audit is running in his panel. They move
         * the real mouse to each control, outline it in red while it is pressed,
         * and stream `cursor_move` / `highlight_boxes` to the panel — the two
         * events the panel has been able to render since the day it was written,
         * and which no audit had ever sent.
         */
        const eyes = new AuditEyes({ watchSessionId: borrowed ? opts?.watchSessionId : undefined });

        opts?.onProgress?.('pressing');
        /**
         * ONE budget for the whole walk, not one per page. Five routes × a
         * per-page budget is how a self-check turns into a five-minute stall on
         * a build that was supposed to take two.
         */
        const walkUntil = Date.now() + Math.max(45_000, timeoutMs * 2);
        const seenForms = new Set<string>();
        const probeOpts = () => ({ eyes, budgetMs: Math.max(6000, walkUntil - Date.now()), seenForms });
        try { mergeProbe(await probeControls(page, probeOpts()), '/'); } catch { /* the controls are what is under test */ }

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
                // The selectors merge too — a target that is small on page two
                // is still a target this repair can aim at.
                if (Array.isArray(d2.smallSel) && d2.smallSel.length) {
                    dom.smallSel = [...(dom.smallSel || []), ...d2.smallSel];
                }
                if (d2.h1s !== 1) brokenRoutes.push(`${r} (h1=${d2.h1s})`);
                mergeProbe(await probeControls(page, probeOpts()), r);
            } catch (e: any) {
                brokenRoutes.push(`${r} (${String(e?.message || e).slice(0, 40)})`);
            }
        }
        if (routes.length) { try { await page.goto(url, { waitUntil: 'load', timeout: 15_000 }); } catch { /* home is optional now */ } }

        /**
         * AND THE UI ITSELF IS INSPECTED — «وفحص ui».
         *
         * Colours against WCAG, structure against a screen reader, and the same
         * page re-laid-out at 390px and 820px with every element that spills off
         * the screen outlined where he can see it. Joe owned tools that did all
         * three; his own builds were never put through any of them.
         */
        opts?.onProgress?.('inspecting');
        let ui: { findings: any[]; metrics: Record<string, any> } = { findings: [], metrics: {} };
        try {
            const desktop = page.viewportSize?.() || { width: 1280, height: 900 };
            ui = await inspectUi(page, {
                eyes, restore: desktop,
                // The panel draws every frame at the size the session declares;
                // without this the phone screenshot arrives in a desktop frame.
                onViewport: (w, h) => {
                    if (!borrowed || !opts?.watchSessionId) return;
                    try { require('../../modules/browser/manager').setSessionViewport(opts.watchSessionId, w, h); } catch { /* cosmetic */ }
                },
            });
        } catch { /* the inspection is additive — never the reason a build fails */ }
        /**
         * AND THE DESIGN ITSELF — «حتى يخرج بنتيجه مبهره».
         *
         * Everything above answers «does it work». All of it can be perfect on
         * a page nobody would call good. These five counts ask whether there is
         * a SYSTEM here — a type scale, a spacing rhythm, a readable measure, a
         * colour discipline, a hierarchy — and they are counts taken from
         * computed styles, not opinions.
         */
        try {
            const { auditDesign } = require('./design-audit');
            const design = await auditDesign(page);
            if (design.findings.length) {
                ui.findings.push(...design.findings);
                opts?.onProgress?.('design');
            }
            Object.assign(ui.metrics, { design: design.metrics });
        } catch { /* the design pass is additive — never the reason a build fails */ }

        try { await eyes.clear(page); } catch { /* the overlay removes itself with the page */ }

        behaviourMetrics.pressed = allControls.filter(c => c.kind !== 'anchor').length;
        behaviourMetrics.dead = allControls.filter(c => c.kind !== 'anchor' && !c.worked).length;
        const behaviour = judgeBehaviour(allControls, behaviourMetrics, []);
        behaviour.findings.push(...ui.findings);

        const findings: AppAuditFinding[] = [];
        /**
         * THE SYSTEM'S FRONT DOOR — said once, plainly, and FIRST.
         *
         * This is a defect of the system, not of the interface: the server is
         * running and answering its API, and refuses the address a visitor
         * types. Left unsaid, it disguises itself as six cosmetic complaints
         * about a page nobody built.
         */
        if (frontDoor) {
            findings.push({
                id: 'server_root_dead', severity: 'high',
                detail: `الخادم يعمل لكنه أجاب ${frontDoor.status} على «/» — الواجهة غير مخدومة من الخادم، فالنظام مغلق عند بابه`
                    + (frontDoor.recovered ? '. قِستُ الواجهة من مجلد البناء بدلاً منه، والنتائج أدناه عنها هي.' : ''),
                detailEn: `The server runs but answered ${frontDoor.status} at "/" — it never serves the interface, so the system is shut at its front door`
                    + (frontDoor.recovered ? '. Measured the built folder instead; everything below is about that.' : ''),
            });
        }
        /**
         * AND A PAGE WITH NOTHING ON IT IS NOT A PAGE WITH GOOD TYPOGRAPHY.
         *
         * «0 عنصر مضغوط، 0 نموذج» on an application build is the loudest fact
         * in the report and it used to be a parenthesis. If the audit found no
         * control and no form at all, that IS the finding — grading contrast
         * on such a page is how an error page scored 41/100.
         */
        if (!allControls.length && !allForms.length) {
            findings.push({
                id: 'empty_page', severity: 'high',
                detail: 'لا زر ولا رابط ولا نموذج على الصفحة — هذه ليست واجهة تطبيق، ولم أقِس شكلها لأن لا شيء فيها ليُقاس',
                detailEn: 'Not one button, link or form on the page — this is not an application interface, and there was nothing to measure',
            });
        }
        if (pageErrors.length) findings.push({ id: 'page_errors', severity: 'high', detail: `${pageErrors.length} خطأ صفحة: ${pageErrors[0]}`, detailEn: `${pageErrors.length} page error(s): ${pageErrors[0]}` });
        if (consoleErrors.length) findings.push({ id: 'console_errors', severity: 'high', detail: `${consoleErrors.length} خطأ كونسول: ${consoleErrors[0]}`, detailEn: `${consoleErrors.length} console error(s): ${consoleErrors[0]}` });
        if (failedRequests.length) findings.push({ id: 'failed_requests', severity: 'high', detail: `${failedRequests.length} ملف لم يصل: ${failedRequests[0]}`, detailEn: `${failedRequests.length} request(s) never arrived: ${failedRequests[0]}` });
        if (dom.deadImgs) findings.push({ id: 'dead_images', severity: 'high', detail: `${dom.deadImgs} صورة لم تُرسم`, detailEn: `${dom.deadImgs} image(s) never rendered` });
        if (dom.deadLinks) findings.push({ id: 'dead_links', severity: 'medium', detail: `${dom.deadLinks} رابط ميت (href فارغ أو #)`, detailEn: `${dom.deadLinks} dead link(s) (empty href or #)` });
        if (dom.small.length) {
            findings.push({
                id: 'small_targets', severity: 'medium',
                detail: `${dom.small.length} هدف لمس أصغر من 40px: ${dom.small[0]}`,
                detailEn: `${dom.small.length} tap target(s) under 40px: ${dom.small[0]}`,
                ...(Array.isArray(dom.smallSel) && dom.smallSel.length ? { evidence: dom.smallSel } : {}),
            });
        }
        if (dom.h1s !== 1) findings.push({ id: 'h1_count', severity: 'low', detail: `عدد h1 = ${dom.h1s} (المطلوب 1)`, detailEn: `${dom.h1s} <h1> headings (exactly 1 expected)` });
        if (dom.hasToggle && !toggleWorks) findings.push({ id: 'theme_toggle_dead', severity: 'medium', detail: 'زر الوضع الليلي لا يغيّر الألوان فعلياً', detailEn: 'The dark-mode toggle does not actually change any colour' });
        if (dom.fontLoaded === false) findings.push({ id: 'webfont_missing', severity: 'medium', detail: `الخط المعلن «${dom.declaredFont}» لم يُحمَّل فعلياً — ملفاته غائبة`, detailEn: `The declared webfont "${dom.declaredFont}" never loaded — its files are missing` });
        if (heavyImages.length) findings.push({ id: 'heavy_images', severity: 'low', detail: `${heavyImages.length} صورة ثقيلة (>400KB): ${heavyImages[0]}`, detailEn: `${heavyImages.length} heavy image(s) (>400KB): ${heavyImages[0]}` });
        if (brokenRoutes.length) findings.push({ id: 'broken_routes', severity: 'high', detail: `${brokenRoutes.length} صفحة لم تُفتح أو بلا عنوان رئيسي: ${brokenRoutes[0]}`, detailEn: `${brokenRoutes.length} page(s) did not open or have no main heading: ${brokenRoutes[0]}` });
        // Behaviour speaks in its own vocabulary; it is translated here rather
        // than re-judged, so the two audits never disagree about a dead button.
        const asSeverity = { critical: 'high', major: 'medium', minor: 'low' } as const;
        for (const f of behaviour.findings) {
            findings.push({
                id: f.code, severity: asSeverity[f.severity], detail: f.ar, detailEn: f.en,
                ...(Array.isArray((f as any).data) && (f as any).data.length ? { evidence: (f as any).data } : {}),
            });
        }

        /**
         * AND IF THE PRODUCT WAS NEVER REACHED, NOTHING ELSE HERE IS TRUE.
         *
         * Everything measured on an error page describes the error page. The
         * honest report is ONE finding — the door is shut — not that Express's
         * 404 has no <main> landmark. This is the difference between a browser
         * that reports and a browser that understands what it is looking at.
         */
        if (frontDoor && !frontDoor.recovered) {
            const door = findings.filter(f => f.id === 'server_root_dead');
            findings.length = 0;
            findings.push(...door);
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
            formsFilled: behaviourMetrics.formsFilled,
            fieldsFilled: behaviourMetrics.fieldsFilled,
            forms: allForms,
            viewports: ui.metrics.viewports || [],
            controls: allControls,
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
        // The callback form is not decoration: closing a server that never
        // listened (the serveUrl path) emits an 'error' with no listener, and
        // an unhandled 'error' takes the process with it.
        srv.close(() => { /* not listening is a fine way to be closed */ });
    }
}

/** The verdict, formatted for the chat — findings named, never buried. */
export function formatAudit(a: AppAudit, isAr: boolean): string {
    /**
     * A SKIPPED CHECK IS A WARNING, NOT A FOOTNOTE.
     *
     * This read «🔎 فحص الجودة الذاتي: تخطيته» — the same calm icon as a
     * passing audit, one line among twenty. An outside test read the delivery
     * as a success while Chromium had never started, and it was not wrong to:
     * nothing in the message said «this page was never looked at». It says so
     * now, in the shape a reader treats as a warning, with the reason and the
     * one command that fixes it.
     */
    if (a.skipped) {
        return isAr
            ? `⚠️ لم أفحص الصفحة بصرياً — تعذّر تشغيل المتصفح (${a.skipped}). لا رقم جودة لهذا البناء،`
            + ` ولم يضغط أحد أزرارها. لتشغيل الفحص: npx playwright install chromium ثم «افحص الجودة».`
            : `⚠️ This page was NOT visually checked — the browser could not start (${a.skipped}).`
            + ` No quality score was earned and no control was pressed. To enable it:`
            + ` npx playwright install chromium.`;
    }
    // «كل الأزرار حية» used to be printed by an audit that never pressed one.
    // The claim is now the count of what was actually pressed, on how many pages.
    const pages = (a.routes || []).length || 1;
    /**
     * AND THE SCOPE NAMES EVERY KIND OF WORK THAT WAS DONE.
     *
     * «هل يستخدمها كلها» — the answer has to be countable, not adjectival. So:
     * how many pages, how many controls actually pressed, how many forms
     * actually filled in and sent, and at how many widths the layout was
     * re-measured. Each of those four numbers is produced by something that
     * really happened in the browser.
     */
    const widths = (a.viewports || []).length;
    const scope = isAr
        ? `(${pages} صفحة، ${a.pressed || 0} عنصر مضغوط، ${a.formsFilled || 0} نموذج معبّأ ومُرسل`
        + `${a.fieldsFilled ? ` (${a.fieldsFilled} حقل)` : ''}${widths ? `، ${widths} مقاسات شاشة` : ''})`
        : `(${pages} page(s), ${a.pressed || 0} control(s) pressed, ${a.formsFilled || 0} form(s) filled and submitted`
        + `${a.fieldsFilled ? ` (${a.fieldsFilled} fields)` : ''}${widths ? `, ${widths} viewport(s)` : ''})`;
    if (!a.findings.length) {
        return isAr
            ? `🔎 فحص الجودة الذاتي في متصفح حقيقي ${scope}: 100/100 — صفر أخطاء، كل الصور مرسومة، وكل زر ضُغط استجاب.`
            : `🔎 Self-QA in a real browser ${scope}: 100/100 — clean.`;
    }
    const lines = a.findings.map(f => `   • ${findingText(f, isAr)}`).join('\n');
    return isAr
        ? `🔎 فحص الجودة الذاتي في متصفح حقيقي ${scope}: ${a.score}/100 — وجدت:\n${lines}`
        : `🔎 Self-QA ${scope}: ${a.score}/100:\n${lines}`;
}
