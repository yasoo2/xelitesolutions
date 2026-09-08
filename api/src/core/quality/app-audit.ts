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
import { inspectUi, applyViewportSize } from './ui-inspection';
import { isWithinRoot } from '../../modules/tools/path-containment';
import { WEATHER_API_ROUTE_PATTERN } from './weather-qa-route';

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
    /** Whether the optional authenticated browser flow completed successfully. */
    authenticated?: boolean;
    /** Present only when credentials were supplied but login could not be proven. */
    authError?: string;
    /**
     *  WHERE IT RAN — and this is not a detail.
     *
     *  He watched a build report «Self-QA in a real browser (1 page, 2
     *  controls pressed, 1 form filled, 3 viewports): 97/100» while nothing
     *  moved on his screen, and asked what the sentence was worth.
     *
     *  It was true and it was useless: a private headless browser IS a real
     *  browser. The sentence simply never said which one, so a number he
     *  could not see read as a number he was shown.
     *
     *  A claim about a PLACE must carry its place.
     */
    visible?: boolean;
    pressed?: number;
    dead?: string[];
    /** …how many forms were really filled in and sent, and at how many widths. */
    formsFilled?: number;
    fieldsFilled?: number;
    /** QA-created form records proven to survive reload, and records that did not. */
    formsPersisted?: number;
    formsPersistenceUnproven?: number;
    qaRecordsDeleted?: number;
    qaRecordsNotDeleted?: number;
    /** Semantic fields challenged with invalid and valid values. */
    semanticFieldsTested?: number;
    semanticValidationFailures?: number;
    semanticValidationEvidence?: Array<{
        field: string;
        expected: string;
        actual: string;
        rejected: boolean;
        pattern?: string;
    }>;
    forms?: FormResult[];
    viewports?: string[];
    /** State-driven browser exploration evidence, separate from the baseline walk. */
    statesVisited?: number;
    exploratoryActions?: number;
    controlsDiscovered?: number;
    /** Every control, with what actually changed — what a proof can read. */
    controls?: ControlResult[];
    /** Stateful disclosure/accordion evidence gathered in each tested context. */
    disclosureEvidence?: Array<{
        count: number;
        opened: number;
        oneAtATime: boolean;
        keyboardClosed: boolean;
        viewport: string;
        route?: string;
    }>;
    /** Computed-widget evidence gathered from real select/input/reset actions. */
    calculatorEvidence?: Array<{
        choices: number;
        choicesTested: number;
        zeroCorrect: boolean;
        largeCorrect: boolean;
        mathCorrect: boolean;
        negativeRejected: boolean;
        resetWorked: boolean;
        currencyChoices?: number;
        currencyRoundTrip?: boolean;
        valuesPreserved?: boolean;
        promoCorrect?: boolean;
        promoInvalidFeedback?: boolean;
        discountBeforeTaxCorrect?: boolean;
        resetCurrency?: boolean;
        resetPromo?: boolean;
        viewport: string;
        route?: string;
    }>;
    /** Named browser passes, so a score cannot hide which kinds of QA ran. */
    passes?: AppAuditPass[];
}

export interface AppAuditPass {
    id: 'runtime' | 'behaviour' | 'design';
    label: string;
    status: 'passed' | 'failed' | 'skipped';
    measured: number;
    findingIds: string[];
}

/**
 * 100 minus what the findings earn — the same finding always costs the same.
 *
 * Coverage is not a cosmetic deduction.  A browser walk which runs out of
 * time has evidence about the surface it visited, but none about the rest of
 * the product.  Returning 92/100 for "one page, five interactions" trained
 * the delivery UI to look reassuring precisely when it should have stopped.
 * Keep normal findings additive, then cap an incomplete audit below a passing
 * score.  The finding remains in the report so the missing proof is explicit.
 */
export function scoreOf(findings: AppAuditFinding[]): number {
    const cost = { high: 15, medium: 8, low: 3 } as const;
    const measuredScore = Math.max(0, findings.reduce((s, f) => s - cost[f.severity], 100));
    return findings.some(f => f.id === 'qa_budget_exhausted')
        ? Math.min(measuredScore, 49)
        : measuredScore;
}

/**
 * Allocate one bounded walk budget across the app's discovered surface.
 * Route-heavy apps need more time for real navigation and responsive checks,
 * but the hard ceiling prevents a broken page from holding the agent forever.
 */
export function browserWalkBudgetMs(timeoutMs: number, routeCount: number): number {
    const routes = Math.max(0, Math.min(20, Math.floor(Number(routeCount) || 0)));
    // `timeoutMs` is the audit's stated wall-clock budget, not a multiplier for
    // a second, much longer hidden budget.  A page that keeps a control busy
    // must end with an honest coverage gap, not leave the conversation running
    // indefinitely while the user watches an unchanged Browser panel.
    const requested = Number(timeoutMs) || 0;
    // Interactive applications need enough time for valid and invalid form
    // paths, state discovery, and three responsive measurements. A 120s
    // ceiling repeatedly exhausted on a single records page, reporting a
    // coverage defect before the audit had actually finished its job.
    const base = Math.min(180_000, Math.max(150_000, requested));
    return Math.min(240_000, base + routes * 6_000);
}

// A slow control must not consume the whole walk before responsive and visual
// evidence runs. The shared deadline still governs the complete audit.
export const CONTROL_PASS_BUDGET_MS = 45_000;

export async function auditBuiltApp(
    distDir: string,
    opts?: {
        timeoutMs?: number; watchSessionId?: string; onProgress?: (m: string) => void;
        /** Refuse invisible fallback: every QA action must stay in the open Browser panel. */
        requireVisibleBrowser?: boolean;
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
         * Optional real credentials for an authenticated browser pass. The
         * password is accepted only in memory, is never logged, and is not
         * persisted with the project record. The default route matches the
         * generated API-backed admin panel; callers may override it for another
         * application contract.
         */
        credentials?: {
            email?: string;
            password?: string;
            /** A short-lived token minted locally from the packaged project. */
            token?: string;
            role?: string;
            loginPath?: string;
            tokenStorageKey?: string;
            route?: string;
        };
        /** Require protected-state coverage when the product advertises sign-in. */
        requireAuthenticatedCoverage?: boolean;
        /**
         * Static pages use root-absolute `/artifacts/...` URLs for shared assets,
         * while the page being audited may live in `/artifacts/<page>/`. When the
         * audit owns the temporary server, this is the filesystem root that must
         * answer those shared-asset requests.
         */
        artifactRootDir?: string;
        /**
         * The request forbade using the network. The audit still runs; it
         * simply never downloads anything to make itself possible.
         */
        offline?: boolean;
        /** Original user request, used only for request-specific observable QA scenarios. */
        request?: string;
    },
): Promise<AppAudit> {
    const timeoutMs = opts?.timeoutMs ?? 30_000;
    // Navigation is one action within an audit, never permission for a single
    // page load to consume the complete QA window.
    const navigationTimeoutMs = Math.min(20_000, Math.max(5_000, timeoutMs));
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
        return { skipped: 'no index.html to audit', score: 0, findings: [] };
    }
    let chromium: any;
    try { chromium = require('playwright').chromium; }
    catch { return { skipped: 'playwright not installed', score: 0, findings: [] }; }

    /**
     * When the system is already running somewhere, audit THERE. The static
     * server below exists only for a build that has no server of its own.
     */
    const givenUrl = String(opts?.serveUrl || '').trim();
    const artifactRoot = path.resolve(String(opts?.artifactRootDir || process.env.ARTIFACT_DIR || distDir));
    const srv = http.createServer((req, res) => {
        const rawPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
        const artifactRequest = /^\/artifacts(?:\/|$)/i.test(rawPath);
        const rel = (artifactRequest
            ? rawPath.replace(/^\/artifacts\/?/i, '')
            : rawPath.replace(/^\/+/, '')) || 'index.html';
        const root = artifactRequest ? artifactRoot : path.resolve(distDir);
        const file = path.resolve(root, rel);
        if (!isWithinRoot(file, root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404); return res.end();
        }
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
    let page: any = null;
    let initialWeatherFixtureForCleanup: any = null;
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
            if (opts?.requireVisibleBrowser) {
                const reason = borrowError || 'no active Browser panel watcher';
                opts.onProgress?.(`eye_required:${reason}`);
                return {
                    skipped: `browser eye required (${reason})`,
                    score: 0,
                    findings: [],
                    visible: false,
                };
            }
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
        // A borrowed page can stay visually present while a single protocol
        // call waits forever.  Put the same bounded contract on every locator
        // and navigation before the audit begins; coverage gaps are reportable,
        // a frozen conversation is not.
        try {
            page.setDefaultTimeout?.(5_000);
            page.setDefaultNavigationTimeout?.(navigationTimeoutMs);
        } catch { /* a minimal browser adapter may not expose Playwright defaults */ }
        // Responsive checks must leave the visible Browser panel in a useful
        // desktop state. Reading the viewport after a phone pass only remembers
        // the transient test size and strands the user in a tiny preview.
        const deliveryViewport = { width: 1280, height: 900 };
        try {
            const actual = await applyViewportSize(page, deliveryViewport.width, deliveryViewport.height);
            if (borrowed && opts?.watchSessionId) {
                require('../../modules/browser/manager').setSessionViewport(opts.watchSessionId, actual.width, actual.height);
            }
        } catch { /* QA can still inspect a constrained browser session */ }
        /**
         * The bundled page probes are compiled by esbuild before Playwright
         * evaluates them. In a borrowed panel this helper may already exist;
         * in a fresh private page it does not. Install it before the first
         * navigation so both audit paths measure the same application rather
         * than turning a missing browser shim into a skipped QA run.
         */
        await page.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        const pageErrors: string[] = [];
        const consoleErrors: string[] = [];
        const failedRequests: string[] = [];
        let expectedWeatherNetworkFailure = false;
        const initialWeatherRequest = String(opts?.request || '');
        const initialWeatherScenario = /\bweather\b/i.test(initialWeatherRequest)
            || /\u0637\u0642\u0633/u.test(initialWeatherRequest);
        const initialWeatherCities = (() => {
            const clause = initialWeatherRequest.match(/\bfor\s+(.{1,160}?)\s+using\b/i)?.[1] || '';
            return clause.split(/\s*,\s*|\s+and\s+/i)
                .map((city: string) => city.trim().replace(/^and\s+/i, ''))
                .filter(Boolean)
                .slice(0, 8);
        })();
        const initialWeatherFixture = async (route: any) => {
            const requestUrl = new URL(route.request().url());
            if (/geocoding-api\.open-meteo\.com/i.test(requestUrl.hostname)) {
                const name = requestUrl.searchParams.get('name') || 'Test city';
                const index = Math.max(0, initialWeatherCities.findIndex(city => city.toLocaleLowerCase() === name.toLocaleLowerCase()));
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ results: [{ name, country: 'QA', latitude: 31.95 + index, longitude: 35.91 + index }] }),
                });
                return;
            }
            const latitude = Number(requestUrl.searchParams.get('latitude') || 31.95);
            const temperature = Math.round(18 + Math.max(0, latitude - 31.95) * 3);
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ current_weather: { temperature, weathercode: 0 } }),
            });
        };
        // A failure in Joe's inspector is evidence that QA is unavailable, not
        // evidence that the application under inspection is broken. Keeping
        // these separate prevents a faulty probe from restoring a generic
        // scaffold over a working, request-specific interface.
        const auditErrors: string[] = [];
        const domainFindings: AppAuditFinding[] = [];
        const isAuditInfrastructureError = (error: unknown) => {
            const stack = String((error as any)?.stack || (error as any)?.message || error || '');
            return /(?:behaviour-audit|app-audit|ui-inspection|audit-eyes)/iu.test(stack);
        };
        /**
         * THE APP ASKING ITS OWN BACKEND, WITH NO BACKEND RUNNING.
         *
         * When no live URL is given this audit serves the built bundle from a
         * throwaway static server — there is no API process behind it. The
         * interface is BUILT to fetch its live rows and to fall back to the
         * rows baked into it when that fetch fails; the `.catch()` is the
         * design, not an accident.
         *
         * Counting those as `failed_requests` reported a delivered system as
         * broken because a check could not be run: measured on a paired build,
         * the phase was refused with «console_errors, failed_requests» while
         * the page rendered perfectly from its baked data.
         *
         * The line below already made this exception for `/api/health` alone.
         * The rule is the same for every endpoint the app owns, and the same
         * one this codebase applies to a missing Python: a check that cannot
         * run says so — it never invents a failure. They are kept, named, and
         * reported as unverified rather than dropped in silence.
         */
        const unverifiedLiveData: string[] = [];
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
            const consoleLocationUrl = (() => {
                try { return String(m.location()?.url || ''); } catch { return ''; }
            })();
            const where = consoleLocationUrl ? ` ← ${consoleLocationUrl.slice(-60)}` : '';
            const weatherConsoleError = /(?:api|geocoding-api)\.open-meteo\.com/i.test(consoleLocationUrl)
                || /open-meteo/i.test(String(m.text()));
            // Weather QA owns these requests from the first navigation onward:
            // successful passes are fulfilled by the deterministic fixture and
            // the failure pass deliberately aborts them. The domain assertions
            // below prove live data, fallback, and recovery directly, so the
            // browser's delayed ERR_FAILED console echo is test noise rather
            // than a second application defect.
            if (weatherConsoleError && (expectedWeatherNetworkFailure || initialWeatherScenario)) return;
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
            // The same rule as the response listener below: with no live server
            // behind this page, an error about any endpoint the app owns is the
            // app asking a backend that is not running. It is reported once, as
            // `live_data_not_verified`, and must not be counted twice here.
            if (!givenUrl && /\/api\//.test(String(m.text()) + where)) return;
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
                && !/favicon\.ico/i.test(r.url())) {
                // No live server behind the page → any /api/… it asks for is
                // its own backend, which is not running. Unverified, not broken.
                if (!givenUrl && /\/api\//.test(r.url())) unverifiedLiveData.push(r.url().slice(-60));
                else failedRequests.push(`${r.status()} ${r.url().slice(-60)}`);
            }
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
        // `project_run` announces the preview to the visible panel immediately
        // before this final audit borrows that same page. The panel navigation
        // and this navigation can cancel each other with net::ERR_ABORTED even
        // though the server is healthy. Retry only that transient cancellation,
        // against the same URL; every other navigation failure remains evidence.
        const openAuditTarget = async (target: string) => {
            try {
                return await page.goto(target, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
            } catch (error: any) {
                if (!/ERR_ABORTED/iu.test(String(error?.message || error))) throw error;
                await page.waitForTimeout(350).catch(() => { });
                return page.goto(target, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
            }
        };
        // Weather apps fetch on mount, before the dedicated scenario runs. The
        // shared fixture must therefore exist for every generic and responsive
        // navigation too, or those passes leak requests to the real network.
        if (initialWeatherScenario) {
            await page.route(WEATHER_API_ROUTE_PATTERN, initialWeatherFixture);
            initialWeatherFixtureForCleanup = initialWeatherFixture;
        }
        const landing = await openAuditTarget(url);
        const doorStatus = Number(landing?.status?.() || 0);
        let authenticated = false;
        let authError = '';
        if (doorStatus >= 400) {
            frontDoor = { url, status: doorStatus, recovered: false };
            // The running system refused its own root. Measure the interface
            // anyway — from the folder, which is the thing that was built.
            if (givenUrl) {
                await new Promise<void>(r => srv.listen(0, '127.0.0.1', () => r()));
                const fallback = `http://127.0.0.1:${(srv.address() as any).port}/`;
                try {
                    const second = await page.goto(fallback, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
                    if (Number(second?.status?.() || 0) < 400) {
                        frontDoor.recovered = true;
                        // Everything counted while standing on the error page
                        // belonged to the error page, not to the product.
                        consoleErrors.length = 0;
                        failedRequests.length = 0;
                        unverifiedLiveData.length = 0;
                        pageErrors.length = 0;
                        opts?.onProgress?.('recovered');
                    }
                } catch { /* the folder could not be served either — reported below */ }
            }
        }
        /**
         * Authenticated QA is explicit, never guessed. A generic form filler
         * must not invent credentials; when the caller hands us the account
         * produced by the API builder, login happens against the real origin
         * and the resulting token is installed before protected controls are
         * pressed. If the live root was recovered from a 404, the audit uses
         * the built folder and cannot claim authenticated coverage.
         */
        const protectedSurfaceAdvertised = !frontDoor?.recovered && await page.evaluate(() => {
            const visible = (el: Element) => {
                const r = (el as HTMLElement).getBoundingClientRect();
                const s = getComputedStyle(el);
                return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
            };
            return [...document.querySelectorAll('button, a')].some((el) =>
                visible(el) && /^(sign in|log in|تسجيل الدخول|دخول)$/iu.test(String(el.textContent || '').trim()));
        }).catch(() => false);
        if (opts?.credentials && !frontDoor?.recovered) {
            const c = opts.credentials;
            try {
                if (c.token) {
                    await page.evaluate(({ token, role, tokenStorageKey }: any) => {
                        localStorage.setItem(tokenStorageKey, token);
                        if (role) localStorage.setItem(tokenStorageKey + ':role', role);
                    }, { token: c.token, role: c.role || 'owner', tokenStorageKey: c.tokenStorageKey || 'joe:auth' });
                    const target = new URL(c.route || '/', url).toString();
                    await page.goto(target, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
                    await page.waitForFunction(() => [...document.querySelectorAll('button, a')].some((el) =>
                        /^(sign out|log out|logout|تسجيل الخروج|خروج)$/iu.test(String(el.textContent || '').trim())),
                    { timeout: Math.min(timeoutMs, 12_000) });
                    authenticated = true;
                } else {
                    const loginUrl = new URL(c.loginPath || '/api/auth/login', url).toString();
                    const result = await page.evaluate(async ({ loginUrl, email, password, tokenStorageKey }: any) => {
                    try {
                        const response = await fetch(loginUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email, password }),
                        });
                        const text = await response.text();
                        let data: any = null;
                        try { data = text ? JSON.parse(text) : null; } catch { /* response was not JSON */ }
                        const token = String(data?.token || '');
                        if (response.ok && token) {
                            try {
                                localStorage.setItem(tokenStorageKey, token);
                                if (data?.user?.role) localStorage.setItem(tokenStorageKey + ':role', String(data.user.role));
                            } catch { /* storage may be blocked */ }
                        }
                        return { ok: response.ok && !!token, status: response.status, role: data?.user?.role || '', error: data?.error || text.slice(0, 120) };
                    } catch (e: any) {
                        return { ok: false, status: 0, error: String(e?.message || e).slice(0, 120) };
                    }
                    }, {
                    loginUrl,
                    email: c.email,
                    password: c.password,
                    // localStorage is already isolated by origin. Keeping the
                    // token independent of pathname lets an authenticated SPA
                    // move from `/` to `/admin` without silently signing out.
                    tokenStorageKey: c.tokenStorageKey || 'joe:auth',
                    });
                    if (!result?.ok) {
                    authError = `login ${result?.status || 0}: ${String(result?.error || 'rejected').slice(0, 120)}`;
                    } else {
                    // A 200 from /auth/login proves the credential, not the
                    // browser state. Reload the product and require a visible
                    // signed-in affordance before protected QA may be claimed.
                    const target = new URL(c.route || '/', url).toString();
                    await page.goto(target, { waitUntil: 'networkidle', timeout: navigationTimeoutMs });
                    const waitForSignedInSurface = () => page.waitForFunction(() => {
                        const visible = (el: Element) => {
                            const r = (el as HTMLElement).getBoundingClientRect();
                            const s = getComputedStyle(el);
                            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
                        };
                        return [...document.querySelectorAll('button, a')].some((el) =>
                            visible(el) && /^(sign out|log out|logout|تسجيل الخروج|خروج)$/iu.test(String(el.textContent || '').trim()));
                    }, { timeout: Math.min(timeoutMs, 12_000) });
                    try {
                        await waitForSignedInSurface();
                        authenticated = true;
                    } catch {
                        // The product's real sign-in path is stronger evidence
                        // than a storage injection. Exercise it as the recovery
                        // path so QA proves the same controls a user relies on.
                        try {
                            const open = page.getByRole('button', { name: /^(sign in|log in|تسجيل الدخول|دخول)$/iu }).first();
                            if (await open.isVisible()) await open.click();
                            await page.locator('input[type="email"]').first().fill(c.email);
                            await page.locator('input[type="password"]').first().fill(c.password);
                            await page.locator('form button[type="submit"]').first().click();
                            await waitForSignedInSurface();
                            authenticated = true;
                        } catch {
                            authError = 'login API accepted the account, but the protected browser surface did not appear';
                        }
                    }
                    }
                }
            } catch (e: any) {
                authError = `login failed: ${String(e?.message || e).slice(0, 120)}`;
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
                h1s: Array.from(document.querySelectorAll('h1')).filter((el: any) => {
                    const rect = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
                }).length,
                bg: getComputedStyle(document.body).backgroundColor,
                hasToggle: !!document.querySelector('.theme-toggle,[aria-label="Toggle dark mode"],[aria-label="تبديل الوضع الليلي"]'),
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
            // The theme check is one optional visual probe.  A delayed or
            // re-rendered toggle must be recorded as evidence, never abort the
            // form, state, and control exploration that follows it.
            try {
                const clicked = await page.evaluate(() => {
                    const selector = '.theme-toggle,[aria-label="Toggle dark mode"],[aria-label="تبديل الوضع الليلي"]';
                    const toggle = Array.from(document.querySelectorAll(selector)).find((candidate: any) => {
                        const rect = candidate.getBoundingClientRect();
                        const style = getComputedStyle(candidate);
                        return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
                    }) as HTMLElement | undefined;
                    toggle?.click();
                    return !!toggle;
                });
                if (!clicked) throw new Error('visible theme toggle disappeared before the probe');
                await page.waitForTimeout(150);
                const bg2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
                toggleWorks = bg2 !== dom.bg;
            } catch (error: any) {
                toggleWorks = false;
                auditErrors.push(`theme toggle probe: ${String(error?.message || error).slice(0, 160)}`);
            }
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
            // Do not silently turn a large application into a five-page smoke
            // test. Keep the walk bounded, but preserve every route the product
            // exposes up to the explicit browser budget.
            return [...out].slice(0, 20);
        }).catch(() => []);

        const allControls: any[] = [];
        const allForms: FormResult[] = [];
        const behaviourMetrics: Record<string, any> = {
            pressed: 0, dead: 0, deadAnchors: 0, keyboardUnreachable: 0, keyboardUnreachableSamples: [],
            formsWithoutValidation: 0, formsFilled: 0, fieldsFilled: 0, formsDeadSubmit: 0, formsValidated: 0, formsReloaded: 0,
            formsPersisted: 0, formsPersistenceUnproven: 0, qaRecordsDeleted: 0, qaRecordsNotDeleted: 0,
            semanticFieldsTested: 0, semanticValidationFailures: 0, semanticValidationEvidence: [],
            disclosureEvidence: [],
            calculatorEvidence: [],
            statesVisited: 0, exploratoryActions: 0, controlsDiscovered: 0,
        };
        const mergeProbe = (p: { controls: any[]; metrics: Record<string, any>; forms?: FormResult[] }, route: string) => {
            //  `bare` is the control's own name; `label` is the name plus where
            //  it was pressed. A reader that needs to FIND the control reads bare.
            for (const c of p.controls) allControls.push({ ...c, bare: c.label, context: `desktop:${route}`, label: route === '/' ? c.label : `${route} ${c.label}` });
            behaviourMetrics.deadAnchors += p.metrics.deadAnchors || 0;
            behaviourMetrics.formsWithoutValidation += p.metrics.formsWithoutValidation || 0;
            behaviourMetrics.keyboardUnreachable += p.metrics.keyboardUnreachable || 0;
            behaviourMetrics.keyboardUnreachableSamples.push(...(p.metrics.keyboardUnreachableSamples || []));
            behaviourMetrics.statesVisited += p.metrics.statesVisited || 0;
            behaviourMetrics.exploratoryActions += p.metrics.exploratoryActions || 0;
            behaviourMetrics.controlsDiscovered += p.metrics.controlsDiscovered || 0;
            for (const k of ['formsFilled', 'fieldsFilled', 'formsDeadSubmit', 'formsValidated', 'formsReloaded', 'formsPersisted', 'formsPersistenceUnproven', 'qaRecordsDeleted', 'qaRecordsNotDeleted', 'semanticFieldsTested', 'semanticValidationFailures']) {
                behaviourMetrics[k] += p.metrics[k] || 0;
            }
            behaviourMetrics.semanticValidationEvidence.push(...(p.metrics.semanticValidationEvidence || []));
            behaviourMetrics.disclosureEvidence.push(...(p.metrics.disclosureEvidence || []).map((evidence: any) => ({ ...evidence, route })));
            behaviourMetrics.calculatorEvidence.push(...(p.metrics.calculatorEvidence || []).map((evidence: any) => ({ ...evidence, route })));
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

        /** A visible QA run must lose no action to a disconnected panel. */
        const eyeIsOpen = () => {
            if (!opts?.requireVisibleBrowser) return true;
            try {
                const { panelWatcherCount } = require('../../modules/browser/wsHub');
                return !!opts.watchSessionId && panelWatcherCount(opts.watchSessionId) > 0;
            } catch { return false; }
        };
        const eyeRequiredResult = (reason = 'Browser panel watcher disconnected during QA'): AppAudit => {
            opts?.onProgress?.(`eye_required:${reason}`);
            return {
                skipped: `browser eye required (${reason})`,
                score: 0,
                findings: [],
                visible: false,
            };
        };
        if (!eyeIsOpen()) return eyeRequiredResult('Browser panel is no longer open');

        opts?.onProgress?.('discovering');
        /**
         * ONE budget for the whole walk, not one per page. Five routes × a
         * per-page budget is how a self-check turns into a five-minute stall on
         * a build that was supposed to take two.
         */
        // Exploration needs room for route discovery, state changes, and the
        // responsive passes. Keep one shared deadline so it cannot loop
        // forever, but do not let the old 60s floor truncate real QA runs.
        const walkUntil = Date.now() + browserWalkBudgetMs(timeoutMs, routes.length);
        const seenForms = new Set<string>();
        // One deadline governs the entire visible walk. Do not reset a small
        // per-page minimum after the deadline: on a route-heavy app that made
        // the browser appear frozen for minutes after "pressing" had started.
        const remainingWalkMs = () => Math.max(0, walkUntil - Date.now());
        const probeOpts = () => ({
            eyes,
            budgetMs: Math.min(CONTROL_PASS_BUDGET_MS, remainingWalkMs()),
            seenForms,
            isEyeOpen: eyeIsOpen,
            // The behavioural probe already knows when it is challenging a
            // field, submitting a form, or entering a newly revealed state.
            // Preserve that evidence at the caller instead of replacing it
            // with a generic "pressing controls" status.
            onProgress: opts?.onProgress,
        });
        const budgetFinding = () => ({
            id: 'qa_budget_exhausted', severity: 'medium' as const,
            detail: 'انتهت ميزانية فحص المتصفح قبل اكتمال كل المسارات والحالات — النتيجة غير مكتملة ولا أعتبر ما لم يُختبر ناجحًا',
            detailEn: 'The browser QA budget ended before every route and state was covered — the result is incomplete, not a pass for what was not tested',
        });
        try {
            if (!remainingWalkMs()) return eyeRequiredResult('Browser QA budget ended before the first page');
            const homeProbe = await probeControls(page, probeOpts());
            mergeProbe(homeProbe, '/');
            // A local control-pass cap preserves time for responsive and visual
            // checks. It is not proof that the shared browser-walk budget ended.
            if ((homeProbe.metrics.budgetExhausted || homeProbe.metrics.explorationBudgetExhausted) && !remainingWalkMs()) behaviourMetrics.budgetExhausted = true;
            if (homeProbe.metrics.eyeLost || !eyeIsOpen()) return eyeRequiredResult();
        } catch (e: any) {
            if (isAuditInfrastructureError(e)) auditErrors.push(String(e?.message || e).slice(0, 160));
        }

        // Every other page the app offers, audited as a page in its own right.
        const brokenRoutes: string[] = [];
        for (const r of routes) {
            if (!remainingWalkMs()) { behaviourMetrics.budgetExhausted = true; break; }
            if (!eyeIsOpen()) return eyeRequiredResult();
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
                const routeProbe = await probeControls(page, probeOpts());
                mergeProbe(routeProbe, r);
                if ((routeProbe.metrics.budgetExhausted || routeProbe.metrics.explorationBudgetExhausted) && !remainingWalkMs()) behaviourMetrics.budgetExhausted = true;
                if (routeProbe.metrics.eyeLost || !eyeIsOpen()) return eyeRequiredResult();
            } catch (e: any) {
                const detail = String(e?.message || e).slice(0, 80);
                if (isAuditInfrastructureError(e)) auditErrors.push(`${r}: ${detail}`);
                else brokenRoutes.push(`${r} (${detail.slice(0, 40)})`);
            }
        }
        if (routes.length) { try { await page.goto(url, { waitUntil: 'load', timeout: 15_000 }); } catch { /* home is optional now */ } }

        /**
         *  ⛔ AND THE MENU THAT ONLY EXISTS ON A PHONE — «ولا القوائم».
         *
         *  Every press above happens at 1280x900, because that is the size the
         *  page was opened at and `probeControls` runs before the widths are
         *  ever changed. And `findControls` catalogues what a visitor could
         *  press by reading `getBoundingClientRect()` and the computed style —
         *  so anything `display:none` at a desktop width **is not skipped as
         *  dead, it is never seen at all.**
         *
         *  That is the hamburger. It is the mobile drawer, the phone-only call
         *  button, the bottom bar. On most sites it is the ONLY way to reach
         *  any other page from a phone, and a build where it does not open is
         *  a build most visitors cannot use — delivered with «0 dead controls»
         *  because the audit was looking at a screen where the button does not
         *  exist.
         *
         *  So one more pass at 390px, and only for controls the desktop walk
         *  never saw. Not a re-press of everything: the budget is shared with
         *  the walk above and the whole point is what desktop CANNOT show.
         */
        const seenLabels = new Set(allControls.map((c: any) => String(c.label || '')));
        // Track completed route/viewport pairs independently from the shared
        // deadline. The dedicated phone pass below is real responsive evidence;
        // rerunning the same route at the same width cannot turn that proof into
        // a coverage failure merely because the optional duplicate ran last.
        const completedResponsiveEvidence = new Set<string>();
        try {
            if (!eyeIsOpen()) return eyeRequiredResult();
            if (!remainingWalkMs()) { behaviourMetrics.budgetExhausted = true; throw new Error('browser QA budget ended before mobile discovery'); }
            await applyViewportSize(page, 390, 844);
            await page.waitForTimeout(420);
            await eyes.say(page, 'فحص ما لا يظهر إلا على الجوّال — القوائم والأزرار المخفية');
            const phone = await probeControls(page, {
                eyes,
                budgetMs: Math.min(20_000, remainingWalkMs()),
                seenForms,
                isEyeOpen: eyeIsOpen,
                maxControls: 12,
                isolateBaselineControls: true,
                baselineViewport: { width: 390, height: 844 },
            });
            if (phone.metrics.eyeLost || !eyeIsOpen()) return eyeRequiredResult();
            if ((phone.metrics.budgetExhausted || phone.metrics.explorationBudgetExhausted) && !remainingWalkMs()) behaviourMetrics.budgetExhausted = true;
            const phoneEvidence = (phone.controls || []).filter((c: any) =>
                c.kind === 'anchor' || !seenLabels.has(String(c.label || '')),
            );
            for (const c of phoneEvidence) allControls.push({ ...c, bare: c.label, context: 'جوّال:/', label: `الجوّال ${c.label}` });
            // The phone-only walk is still a full measured state. Preserve its
            // specialized evidence even if the later responsive sweep expires.
            mergeProbe({ ...phone, controls: [] }, '/');
            completedResponsiveEvidence.add('جوّال:/');
            await applyViewportSize(page, deliveryViewport.width, deliveryViewport.height);
            await page.waitForTimeout(200);
        } catch { /* one width failing must not lose the desktop walk */ }

        /**
         * RESPONSIVE QA IS PER ROUTE, NOT ONLY PER HOME.
         *
         * A mobile drawer, a form, or an overflowing table often exists only
         * on a secondary screen. The old pass checked the home route at 390px
         * and then called the rest of the application responsive by implication.
         * Revisit each discovered route at tablet and phone widths, rediscover
         * controls after the layout changes, and keep the same bounded budget.
         */
        // A single-page app still needs desktop, tablet, and phone evidence.
        // Without this fallback, route-less generated tools never ran the
        // responsive control pass beyond their initial desktop page.
        const responsiveRoutes = (routes.length ? routes : ['/']).slice(0, 20);
        const responsiveBudget = Math.min(90_000, Math.max(28_000, responsiveRoutes.length * 8_000));
        const responsiveDeadline = Math.min(walkUntil, Date.now() + responsiveBudget);
        for (const r of responsiveRoutes) {
            for (const size of [{ name: 'لوحي', w: 820, h: 1180 }, { name: 'جوّال', w: 390, h: 844 }]) {
                const evidenceKey = `${size.name}:${r}`;
                // The home-phone pass above already exercised this exact state,
                // including controls hidden at desktop width. Do not spend the
                // bounded responsive budget replaying it.
                if (completedResponsiveEvidence.has(evidenceKey)) continue;
                if (Date.now() >= responsiveDeadline || !remainingWalkMs() || !eyeIsOpen()) { behaviourMetrics.budgetExhausted = true; break; }
                try {
                    const target = r.startsWith('#') ? url + r : url + r;
                    await page.goto(target, { waitUntil: 'load', timeout: Math.min(timeoutMs, 12_000) });
                    await applyViewportSize(page, size.w, size.h);
                    await page.waitForTimeout(260);
                    await eyes.say(page, `فحص ${size.name}: ${r === '/' ? 'الصفحة الرئيسية' : r}`);
                    const responsive = await probeControls(page, {
                        eyes,
                        budgetMs: Math.min(responsiveDeadline - Date.now(), remainingWalkMs()),
                        seenForms,
                        isEyeOpen: eyeIsOpen,
                        maxControls: 12,
                        isolateBaselineControls: true,
                        baselineViewport: { width: size.w, height: size.h },
                    });
                    if (responsive.metrics.eyeLost || !eyeIsOpen()) return eyeRequiredResult();
                    if ((responsive.metrics.budgetExhausted || responsive.metrics.explorationBudgetExhausted) && !remainingWalkMs()) behaviourMetrics.budgetExhausted = true;
                    const prefix = `${size.name} ${r}`;
                    for (const c of responsive.controls || []) {
                        const label = `${prefix} ${c.label}`;
                        allControls.push({ ...c, bare: c.label, context: `${size.name}:${r}`, label, responsive: size.name });
                    }
                    mergeProbe({ ...responsive, controls: [] }, r);
                    completedResponsiveEvidence.add(evidenceKey);
                } catch (e: any) {
                    // Keep the baseline proof, but do not erase a responsive
                    // failure: an unreachable route at one viewport is itself
                    // a user-visible regression and must reach the repair loop.
                    const detail = String(e?.message || e).slice(0, 80);
                    if (isAuditInfrastructureError(e)) auditErrors.push(`${r} @ ${size.name}: ${detail}`);
                    else brokenRoutes.push(`${r} @ ${size.name} (${detail})`);
                }
            }
        }
        try {
            await applyViewportSize(page, deliveryViewport.width, deliveryViewport.height);
            await page.goto(url, { waitUntil: 'load', timeout: Math.min(timeoutMs, 12_000) });
        } catch { /* final inspection can use the last responsive state */ }

        /**
         * Request-driven weather QA is a state-machine test, not another
         * generic click sweep. It deliberately removes the public API, proves
         * the labelled fallback remains useful, restores the network, and
         * proves Retry returns to live data. Unit switching is checked as a
         * round-trip while the requested cities remain visible.
         */
        const weatherRequest = String(opts?.request || '');
        if (/\bweather\b|طقس/iu.test(weatherRequest)) {
            const requestedCities = (() => {
                const clause = weatherRequest.match(/\bfor\s+(.{1,160}?)\s+using\b/i)?.[1] || '';
                return clause.split(/\s*,\s*|\s+and\s+/i).map((city: string) => city.trim().replace(/^and\s+/i, '')).filter(Boolean).slice(0, 8);
            })();
            const bodyText = async () => String(await page.locator('body').innerText().catch(() => ''));
            const citiesRemain = (text: string) => requestedCities.every(city => new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text));
            const hasLastUpdatedTimestamp = (text: string) => text.split(/\r?\n/).some(line => {
                if (!/(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)/i.test(line)) return false;
                const value = line.replace(/.*?(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)\s*:?/i, '').trim();
                return value.length > 2 && !/^[\s—–-]+$/.test(value);
            });
            const apiPattern = WEATHER_API_ROUTE_PATTERN;
            const weatherFixture = async (route: any) => {
                const requestUrl = new URL(route.request().url());
                if (/geocoding-api\.open-meteo\.com/i.test(requestUrl.hostname)) {
                    const name = requestUrl.searchParams.get('name') || 'Test city';
                    const index = Math.max(0, requestedCities.findIndex(city => city.toLocaleLowerCase() === name.toLocaleLowerCase()));
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({ results: [{ name, country: 'QA', latitude: 31.95 + index, longitude: 35.91 + index }] }),
                    });
                    return;
                }
                const latitude = Number(requestUrl.searchParams.get('latitude') || 31.95);
                const temperature = Math.round(18 + Math.max(0, latitude - 31.95) * 3);
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ current_weather: { temperature, weathercode: 0 } }),
                });
            };
            try {
                opts?.onProgress?.('weather: proving live weather and requested cities');
                for (let index = consoleErrors.length - 1; index >= 0; index--) {
                    if (/open-meteo|teo\.com/i.test(consoleErrors[index])) consoleErrors.splice(index, 1);
                }
                await page.route(apiPattern, weatherFixture);
                await page.goto(url, { waitUntil: 'load', timeout: navigationTimeoutMs });
                await page.waitForFunction((cities: string[]) => {
                    const text = String(document.body?.innerText || '');
                    const updatedLine = text.split(/\r?\n/).find(line => /(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)/i.test(line)) || '';
                    const updatedValue = updatedLine.replace(/.*?(?:Last\s+updated|Updated\s+at|آخر\s+تحديث)\s*:?/i, '').trim();
                    return cities.every(city => text.toLocaleLowerCase().includes(city.toLocaleLowerCase()))
                        && /(?:Live\s+data|بيانات\s+حية)/i.test(text)
                        && updatedValue.length > 2
                        && !/^[\s—–-]+$/.test(updatedValue);
                }, requestedCities, { timeout: Math.min(12_000, timeoutMs) }).catch(() => { });
                const live = await bodyText();
                if ((requestedCities.length && !citiesRemain(live)) || !hasLastUpdatedTimestamp(live) || !/(?:Live\s+data|بيانات\s+حية)/i.test(live)) {
                    domainFindings.push({
                        id: 'weather_live_success_unproven', severity: 'high',
                        detail: 'لم يثبت المتصفح حالة الطقس الحية لكل المدن المطلوبة مع وقت آخر تحديث',
                        detailEn: 'Browser QA could not prove live weather for every requested city with a last-updated timestamp',
                    });
                }

                if (/celsius|fahrenheit|°\s*[CF]|مئوي|فهرنهايت/i.test(weatherRequest)) {
                    opts?.onProgress?.('weather: switching to Fahrenheit and preserving cities');
                    const toF = page.getByRole('button', { name: /Fahrenheit|°F|فهرنهايت/i }).first();
                    if (await toF.count()) await toF.click();
                    await page.waitForTimeout(250);
                    const fahrenheit = await bodyText();
                    const hasF = /°\s*F|Fahrenheit|فهرنهايت/i.test(fahrenheit);
                    const toC = page.getByRole('button', { name: /Celsius|°C|مئوي/i }).first();
                    if (await toC.count()) await toC.click();
                    await page.waitForTimeout(250);
                    const celsius = await bodyText();
                    const hasC = /°\s*C|Celsius|مئوي/i.test(celsius);
                    if (!hasF || !hasC || !citiesRemain(fahrenheit) || !citiesRemain(celsius)) {
                        domainFindings.push({
                            id: 'weather_unit_roundtrip_failed', severity: 'high',
                            detail: 'فشل تبديل مئوي/فهرنهايت ذهاباً وإياباً مع الحفاظ على المدن',
                            detailEn: 'The Celsius/Fahrenheit browser round-trip failed or lost requested cities',
                        });
                    }
                }

                if (/offline\s+fallback|network\s+failure|retry|بديل|دون\s+اتصال|إعادة\s+المحاولة/i.test(weatherRequest)) {
                    const abortWeather = (route: any) => route.abort('failed');
                    opts?.onProgress?.('weather: forcing network failure and inspecting fallback');
                    expectedWeatherNetworkFailure = true;
                    await page.unroute(apiPattern, weatherFixture).catch(() => { });
                    await page.route(apiPattern, abortWeather);
                    try {
                        await page.goto(url, { waitUntil: 'load', timeout: navigationTimeoutMs });
                        await page.waitForTimeout(1_500);
                        const fallback = await bodyText();
                        if (!/(?:Fallback|Cached|Offline|Sample|بديل|مخبأة|دون اتصال)/i.test(fallback) || !citiesRemain(fallback)) {
                            domainFindings.push({
                                id: 'weather_offline_fallback_failed', severity: 'high',
                                detail: 'عند قطع الشبكة لم تظهر بيانات بديلة مفيدة وموسومة بوضوح لكل المدن',
                                detailEn: 'Forced network failure did not show useful, clearly labelled fallback data for every city',
                            });
                        }
                    } finally {
                        await page.unroute(apiPattern, abortWeather).catch(() => { });
                        await page.route(apiPattern, weatherFixture);
                        expectedWeatherNetworkFailure = false;
                    }
                    opts?.onProgress?.('weather: restoring network and retrying live data');
                    const retry = page.getByRole('button', { name: /Retry|Try again|إعادة\s+المحاولة/i }).first();
                    if (await retry.count()) await retry.click();
                    await page.waitForFunction((cities: string[]) => {
                        const text = String(document.body?.innerText || '');
                        return cities.every(city => text.toLocaleLowerCase().includes(city.toLocaleLowerCase()))
                            && /(?:Live\s+data|بيانات\s+حية)/i.test(text)
                            && !/(?:Offline\s+fallback|Fallback\s+data|بيانات\s+بديلة|دون اتصال)/i.test(text);
                    }, requestedCities, { timeout: Math.min(12_000, timeoutMs) }).catch(() => { });
                    const recovered = await bodyText();
                    if (!citiesRemain(recovered) || !/(?:Live\s+data|بيانات\s+حية)/i.test(recovered) || /(?:Offline\s+fallback|Fallback\s+data|بيانات\s+بديلة|دون اتصال)/i.test(recovered)) {
                        domainFindings.push({
                            id: 'weather_retry_recovery_failed', severity: 'high',
                            detail: 'بعد عودة الشبكة لم يثبت زر إعادة المحاولة الرجوع إلى البيانات الحية',
                            detailEn: 'After network restoration, Retry did not prove recovery to live weather',
                        });
                    }
                }
            } catch (error: any) {
                domainFindings.push({
                    id: 'weather_scenario_qa_failed', severity: 'high',
                    detail: `تعذر إكمال سيناريو الطقس الحقيقي في المتصفح: ${String(error?.message || error).slice(0, 120)}`,
                    detailEn: `The real weather browser scenario could not complete: ${String(error?.message || error).slice(0, 120)}`,
                });
            } finally {
                await page.unroute(apiPattern, weatherFixture).catch(() => { });
                try { await applyViewportSize(page, deliveryViewport.width, deliveryViewport.height); } catch { /* preserve QA result */ }
            }
        }

        /**
         * AND THE UI ITSELF IS INSPECTED — «وفحص ui».
         *
         * Colours against WCAG, structure against a screen reader, and the same
         * page re-laid-out at 390px and 820px with every element that spills off
         * the screen outlined where he can see it. Joe owned tools that did all
         * three; his own builds were never put through any of them.
         */
        opts?.onProgress?.('inspecting');
        if (!eyeIsOpen()) return eyeRequiredResult();
        let ui: { findings: any[]; metrics: Record<string, any> } = { findings: [], metrics: {} };
        try {
            const desktop = deliveryViewport;
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
        findings.push(...domainFindings);
        if (behaviourMetrics.budgetExhausted) findings.push(budgetFinding());
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
        if (!allControls.length && !allForms.length && !auditErrors.length) {
            findings.push({
                id: 'empty_page', severity: 'high',
                detail: 'لا زر ولا رابط ولا نموذج على الصفحة — هذه ليست واجهة تطبيق، ولم أقِس شكلها لأن لا شيء فيها ليُقاس',
                detailEn: 'Not one button, link or form on the page — this is not an application interface, and there was nothing to measure',
            });
        }
        if (pageErrors.length) findings.push({ id: 'page_errors', severity: 'high', detail: `${pageErrors.length} خطأ صفحة: ${pageErrors[0]}`, detailEn: `${pageErrors.length} page error(s): ${pageErrors[0]}` });
        if (auditErrors.length) findings.push({
            id: 'qa_infrastructure', severity: 'high',
            detail: `تعذّر على فاحص الجودة إكمال القياس: ${auditErrors[0]}`,
            detailEn: `The quality inspector could not complete its measurement: ${auditErrors[0]}`,
        });
        if (consoleErrors.length) findings.push({ id: 'console_errors', severity: 'high', detail: `${consoleErrors.length} خطأ كونسول: ${consoleErrors[0]}`, detailEn: `${consoleErrors.length} console error(s): ${consoleErrors[0]}` });
        if (failedRequests.length) findings.push({ id: 'failed_requests', severity: 'high', detail: `${failedRequests.length} ملف لم يصل: ${failedRequests[0]}`, detailEn: `${failedRequests.length} request(s) never arrived: ${failedRequests[0]}` });
        // Said out loud and costed at the lowest weight: nothing is broken, and
        // one thing on this page was not measured. Silence would be the lie.
        if (unverifiedLiveData.length) findings.push({
            id: 'live_data_not_verified', severity: 'low',
            detail: `${unverifiedLiveData.length} طلب بيانات حيّة لم يُتحقق منه — لا خادم يعمل أثناء الفحص، والواجهة عادت إلى صفوفها المخبوزة كما صُمّمت: ${unverifiedLiveData[0]}`,
            detailEn: `${unverifiedLiveData.length} live-data request(s) unverified — no backend was running during the audit and the interface fell back to its baked rows by design: ${unverifiedLiveData[0]}`,
        });
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
                ...(Array.isArray((f as any).evidence) && (f as any).evidence.length
                    ? { evidence: (f as any).evidence }
                    : Array.isArray((f as any).data) && (f as any).data.length
                        ? { evidence: (f as any).data }
                        : {}),
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
        if (opts?.credentials && !frontDoor?.recovered && !authenticated) {
            findings.push({
                id: 'auth_failed', severity: 'high',
                detail: `تعذّر إثبات الدخول المحمي بالحساب المعطى: ${authError || 'رفض الخادم بيانات الدخول'}`,
                detailEn: `Authenticated QA could not log in with the supplied account: ${authError || 'the server rejected the credentials'}`,
            });
        }
        if (opts?.requireAuthenticatedCoverage && protectedSurfaceAdvertised && !authenticated && !opts?.credentials) {
            findings.push({
                id: 'authenticated_coverage_missing', severity: 'high',
                detail: 'يعرض النظام دخولًا محميًا، لكن اختبار المتصفح لم يدخل إلى الشاشات المحمية',
                detailEn: 'The product advertises protected sign-in, but browser QA did not enter and test the protected screens',
            });
        }

        // Findings belong in Joe's chat and Logs. Injecting a verdict card into
        // the product obscures the interface and can mix languages. Live
        // outlines and the single panel cursor remain visible during the run.
        unhook();

        return {
            score: scoreOf(findings), findings,
            visible: borrowed,
            authenticated,
            ...(authError ? { authError } : {}),
            routes: ['/', ...routes],
            pressed: behaviourMetrics.pressed,
            dead: allControls.filter(c => c.kind !== 'anchor' && !c.worked).map(c => c.label),
            formsFilled: behaviourMetrics.formsFilled,
            fieldsFilled: behaviourMetrics.fieldsFilled,
            formsPersisted: behaviourMetrics.formsPersisted,
            formsPersistenceUnproven: behaviourMetrics.formsPersistenceUnproven,
            qaRecordsDeleted: behaviourMetrics.qaRecordsDeleted,
            qaRecordsNotDeleted: behaviourMetrics.qaRecordsNotDeleted,
            semanticFieldsTested: behaviourMetrics.semanticFieldsTested,
            semanticValidationFailures: behaviourMetrics.semanticValidationFailures,
            semanticValidationEvidence: behaviourMetrics.semanticValidationEvidence,
            disclosureEvidence: behaviourMetrics.disclosureEvidence,
            calculatorEvidence: behaviourMetrics.calculatorEvidence,
            forms: allForms,
            viewports: ui.metrics.viewports || [],
            statesVisited: behaviourMetrics.statesVisited,
            exploratoryActions: behaviourMetrics.exploratoryActions,
            controlsDiscovered: behaviourMetrics.controlsDiscovered,
            controls: allControls,
            passes: [
                {
                    id: 'runtime',
                    label: 'runtime and network',
                    status: behaviourMetrics.budgetExhausted
                        ? 'skipped'
                        : (pageErrors.length || consoleErrors.length || failedRequests.length || brokenRoutes.length || dom.deadImgs || domainFindings.some(f => f.id === 'weather_live_success_unproven' || f.id === 'weather_scenario_qa_failed')) ? 'failed' : 'passed',
                    measured: routes.length + 1,
                    findingIds: findings.filter(f => ['server_root_dead', 'page_errors', 'console_errors', 'failed_requests', 'broken_routes', 'dead_images', 'weather_live_success_unproven', 'weather_scenario_qa_failed'].includes(f.id)).map(f => f.id),
                },
                {
                    id: 'behaviour',
                    label: 'controls and forms',
                    status: behaviourMetrics.budgetExhausted
                        ? 'skipped'
                        : behaviour.findings.some(f => ['dead_controls', 'dead_anchors', 'forms_dead_submit', 'keyboard_unreachable', 'semantic_input_validation', 'form_persistence_unproven', 'qa_created_record_not_deletable'].includes(f.code)) || domainFindings.some(f => ['weather_unit_roundtrip_failed', 'weather_offline_fallback_failed', 'weather_retry_recovery_failed'].includes(f.id)) ? 'failed' : 'passed',
                    measured: allControls.length + allForms.length,
                    findingIds: findings.filter(f => ['dead_controls', 'dead_anchors', 'forms_dead_submit', 'keyboard_unreachable', 'semantic_input_validation', 'form_persistence_unproven', 'qa_created_record_not_deletable', 'weather_unit_roundtrip_failed', 'weather_offline_fallback_failed', 'weather_retry_recovery_failed'].includes(f.id)).map(f => f.id),
                },
                {
                    id: 'design',
                    label: 'visual, accessibility and responsive',
                    status: behaviourMetrics.budgetExhausted
                        ? 'skipped'
                        : ui.findings.length || dom.small.length || dom.h1s !== 1 || dom.fontLoaded === false ? 'failed' : 'passed',
                    measured: (ui.metrics.viewports || []).length,
                    findingIds: findings.filter(f => ui.findings.some((u: any) => u.code === f.id) || ['small_targets', 'h1_count', 'webfont_missing'].includes(f.id)).map(f => f.id),
                },
            ],
        };
    } catch (e: any) {
        return { skipped: `browser failed (${String(e?.message || e).slice(0, 80)})`, score: 0, findings: [] };
    } finally {
        // Whatever happened — clean return, throw, or timeout — the panel page
        // goes back to the user with no listeners of ours left on it.
        detach();
        if (page && initialWeatherFixtureForCleanup) {
            try { await page.unroute(WEATHER_API_ROUTE_PATTERN, initialWeatherFixtureForCleanup); } catch { /* page may be gone */ }
        }
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
    const authNote = a.authenticated
        ? (isAr ? '، ودخول محمي مثبت' : ', authenticated login proven')
        : '';
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
    const discovery = (a.controlsDiscovered || 0) > 0
        ? (isAr ? `، ${a.controlsDiscovered} عنصرًا اكتُشف` : `, ${a.controlsDiscovered} control(s) discovered`)
        : '';
    const exploration = (a.exploratoryActions || 0) > 0 || (a.statesVisited || 0) > 1
        ? (isAr
            ? `، ${a.exploratoryActions || 0} إجراء استكشافي و${a.statesVisited || 0} حالة مكتشفة`
            : `, ${a.exploratoryActions || 0} exploratory action(s) and ${a.statesVisited || 0} state(s) discovered`)
        : '';
    const semantic = (a.semanticFieldsTested || 0) > 0
        ? (isAr ? `، ${a.semanticFieldsTested} حقلًا دلاليًا اختُبر` : `, ${a.semanticFieldsTested} semantic field(s) challenged`)
        : '';
    const durability = (a.formsPersisted || 0) || (a.formsPersistenceUnproven || 0)
        ? (isAr
            ? `، حفظ بعد التحديث: ${a.formsPersisted || 0} مثبت${a.formsPersistenceUnproven ? `، ${a.formsPersistenceUnproven} غير مثبت` : ''}${a.qaRecordsDeleted ? `، وحُذف ${a.qaRecordsDeleted} سجل اختبار بأمان` : ''}`
            : `, persistence after reload: ${a.formsPersisted || 0} proven${a.formsPersistenceUnproven ? `, ${a.formsPersistenceUnproven} unproven` : ''}${a.qaRecordsDeleted ? `, ${a.qaRecordsDeleted} QA record(s) safely deleted` : ''}`)
        : '';
    const scope = isAr
        ? `(${pages} صفحة، ${a.pressed || 0} عنصر مضغوط، ${a.formsFilled || 0} نموذج معبّأ ومُرسل`
        + `${a.fieldsFilled ? ` (${a.fieldsFilled} حقل)` : ''}${semantic}${durability}${widths ? `، ${widths} مقاسات شاشة` : ''}${discovery}${exploration}${authNote})`
        : `(${pages} page(s), ${a.pressed || 0} control(s) pressed, ${a.formsFilled || 0} form(s) filled and submitted`
        + `${a.fieldsFilled ? ` (${a.fieldsFilled} fields)` : ''}${semantic}${durability}${widths ? `, ${widths} viewport(s)` : ''}${discovery}${exploration}${authNote})`;
    const passes = (a.passes || []).map((p) => {
        const state = p.status === 'passed' ? (isAr ? 'نجح' : 'passed') : p.status === 'failed' ? (isAr ? 'فشل' : 'failed') : (isAr ? 'تخطّي' : 'skipped');
        return isAr
            ? `${p.label}: ${state} (${p.measured} مقاس/عنصر، ${p.findingIds.length} ملاحظة)`
            : `${p.label}: ${state} (${p.measured} measured, ${p.findingIds.length} finding(s))`;
    }).join(isAr ? ' · ' : ' · ');
    const suite = passes
        ? (isAr ? `\n🧪 حزمة اختبارات المتصفح: ${passes}` : `\n🧪 Browser QA suite: ${passes}`)
        : '';
    //  Named in the same breath as the score, never in a footnote.
    const where = a.visible
        ? (isAr ? 'في لوحة المتصفّح أمامك' : 'in the Browser panel, in front of you')
        : (isAr ? 'في متصفّح خاصّ لم تره' : 'in a private browser you could not see');
    if (!a.findings.length) {
        return isAr
            ? `🔎 فحص الجودة الذاتي ${where} ${scope}: 100/100 — صفر أخطاء، كل الصور مرسومة، وكل زر ضُغط استجاب.${suite}`
            : `🔎 Self-QA ${where} ${scope}: 100/100 — clean.${suite}`;
    }
    const lines = a.findings.map(f => `   • ${findingText(f, isAr)}`).join('\n');
    return isAr
        ? `🔎 فحص الجودة الذاتي ${where} ${scope}: ${a.score}/100 — وجدت:\n${lines}${suite}`
        : `🔎 Self-QA ${where} ${scope}: ${a.score}/100:\n${lines}${suite}`;
}
