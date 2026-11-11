/**
 * THE AGENT ENGINE'S BROWSER: ONE REAL PAGE, LOOKED AT HONESTLY.
 *
 * Three registered tools the engine reaches through ToolService:
 *
 *   engine_browser_open        go to an address and read the page
 *   engine_browser_act         act on the page by the refs its last view gave
 *   engine_browser_screenshot  capture the viewport or the whole page
 *
 * They drive the chat's own panel page (`browser:<chatId>`), so the owner
 * watches the run in the browser panel. Every answer is a view MEASURED on
 * that page: the final URL, the HTTP status of the document, the title, the
 * visible text, the interactive elements with the refs browser_act takes, the
 * console errors and failed requests seen during the call, and a JPEG of the
 * viewport saved in the project's `.joe/screenshots/`.
 *
 * The first browser layer taught what to avoid, each for a measured reason:
 *
 *  - It took the session id from the model's input with no ownership check,
 *    so a model or an injected page could drive another user's logged-in
 *    page. Here the id comes only from the run's context, and
 *    canAccessBrowserSession must accept it on every call.
 *  - No navigation checked the HTTP status, so a 404 or a 500 page counted as
 *    success. Here the status is in every view, and 400 or more is a failure.
 *  - `fill` by locator typed an empty string and reported ok. Here typing is
 *    Playwright's own fill on the element, and the value is read back.
 *  - Every tool queued on process-global semaphores, and a tool that held one
 *    while calling another deadlocked. Nothing here takes a global lock: the
 *    Playwright page is driven directly.
 *  - Tools started a 10 fps capture loop whether anyone watched or not, and
 *    nothing stopped it. Here the stream starts only for a watching panel, and
 *    the run releases what it started.
 *  - Element lists came from four hand-written DOM walkers. Here they come from
 *    Playwright's accessibility snapshot (`ariaSnapshot({mode: 'ai'})`), which
 *    was measured on this machine before it was adopted (law 6): its refs
 *    survive re-snapshots of the same element, get a new prefix on every new
 *    document (`e5`, then `f1e3`), and resolve through the `aria-ref=` engine.
 *    A list built in the page is the fallback, used only when the snapshot
 *    fails.
 *
 * Measured costs that shaped the bounds below (Playwright 1.63, this laptop):
 * a snapshot takes 0.2 s for 100 interactive elements and 8.9 s for 6,000; a
 * full-page JPEG of a 63,000 px page is 4 MB and takes 7 s. So the snapshot has
 * a time budget, the element list and the text are bounded and say how much
 * they left out, and a full-page capture stops at 8,000 px and says so.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import type { ConsoleMessage, Dialog, Locator, Page, Request, Response } from 'playwright';
import type { ToolDefinition, ToolExecutionResult, ToolPermission } from '../types';
import {
    getBrowserSession, hasLiveBrowserPage, pauseBrowserCaptureForPage, screenshotSessionJpeg,
    startStreaming, stopSession, stopStreaming,
} from '../../browser/manager';
import { canAccessBrowserSession, panelWatcherCount } from '../../browser/wsHub';
import { DEFAULT_BROWSER_CONFIG } from '../../browser/config';
import { isPortOpen } from '../../../shared/utils/network';
import { imageSize } from '../../../shared/image-size';
import { workspaceService } from '../../services/WorkspaceService';
import { projectRootProblem, resolveInProject } from '../../../core/engine/workspace';

/** A dev server that is still booting gets this long to open its port. */
const PORT_WAIT_MS = 10_000;
/** After a navigation: network idle, at most this long (reactLoop's settle). */
const NETWORK_IDLE_MS = 2_500;
const DOM_READY_MS = 3_000;
/** After an action: the page's own requests must stay quiet this long. */
const QUIET_MS = 400;
const QUIET_BUDGET_MS = 2_500;
/** A click or a fill that cannot happen in this time is reported, with the reason. */
const ACTION_TIMEOUT_MS = 8_000;
/** Reading the page (text, title, password fields) is bounded: a page whose script hangs must not hang the run. */
const PAGE_READ_MS = 5_000;
const TEXT_LIMIT = 4_000;
const ELEMENT_LIMIT = 150;
/**
 * What a view cut for the model still carries whole, so the engine can keep it
 * in the run's folder (core/engine/tools/browser.ts) and nothing is lost for
 * good: every element's ref stays reachable. These bound one answer's memory;
 * past them the saved view says how much it left out.
 */
const FULL_ELEMENT_LIMIT = 5_000;
const FULL_TEXT_LIMIT = 500_000;
/** A new tab the action opened gets this long to show its address before it is closed. */
const POPUP_ADDRESS_MS = 2_000;
/** Console errors, warnings, page errors and failed requests kept per call; the rest are counted. */
const LIST_LIMIT = 20;
const VIEW_JPEG_QUALITY = 60;
const SHOT_JPEG_QUALITY = 70;
const FULL_PAGE_MAX_HEIGHT = 8_000;
const FULL_PAGE_MAX_WIDTH = 3_840;
const SNAPSHOT_BUDGET_MS = 5_000;
/** A run that never released its browser (its caller died) is forgotten after this long idle. */
const FORGOTTEN_RUN_MS = 6 * 60 * 60 * 1000;
/** The screenshot panel's own reader refuses more than this (ScreenshotArtifactService). */
const GALLERY_MAX_BYTES = 8 * 1024 * 1024;
const GALLERY_MAX_PIXELS = 16 * 1024 * 1024;

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

function firstLine(value: unknown): string {
    return String((value as any)?.message ?? value ?? '').split('\n').find(l => l.trim())?.trim() ?? '';
}

/** The first `max` UTF-16 units, never ending inside a surrogate pair. */
function head(s: string, max: number): string {
    if (s.length <= max) return s;
    const code = s.charCodeAt(max - 1);
    return s.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

/** Cut a string for display, marking the cut. */
function clip(value: string, max: number): string {
    const s = String(value ?? '');
    return s.length <= max ? s : `${head(s, max)}…`;
}

function bounded<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${what} did not finish within ${Math.round(ms / 1000)} s`)), ms);
    });
    return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

/* ───────────────────────── what a view is ───────────────────────── */

export interface EnginePageView {
    url: string;
    /** HTTP status of the document this call loaded; absent when no document loaded. */
    status?: number;
    statusText?: string;
    title: string;
    /** Visible text, bounded: `textCut` characters were left out of the middle. */
    text: string;
    textLength: number;
    textCut: number;
    /** `[e12] button "Save"`: the refs engine_browser_act takes. */
    elements: string[];
    /** How many interactive elements the page has; `elements` shows the first ones. */
    elementCount: number;
    /** 'aria': Playwright's snapshot. 'indexed': the in-page list, because the snapshot failed. */
    elementSource: 'aria' | 'indexed';
    elementProblem?: string;
    consoleErrors: string[];
    consoleWarnings: string[];
    /** Uncaught exceptions thrown by the page's scripts. */
    pageErrors: string[];
    /** `404 GET http://…/logo.png`, `net::ERR_CONNECTION_REFUSED GET http://…/api`. */
    failedRequests: string[];
    /** `confirm "Delete this row?" → accepted`: the dialogs the page opened during the call, each answered as a user going ahead would. */
    dialogs: string[];
    /** Addresses of the new tabs the call opened; each was closed. */
    popups: string[];
    /** How many of each did not fit in the lists above. */
    omitted: { consoleErrors: number; consoleWarnings: number; pageErrors: number; failedRequests: number; dialogs: number };
    /** Absolute path of the viewport JPEG. */
    screenshotPath?: string;
    screenshotProblem?: string;
    /**
     * Present only when `elements` or `text` was cut for the model: everything
     * the page had, up to FULL_ELEMENT_LIMIT elements and FULL_TEXT_LIMIT
     * characters, with how much even that left out.
     */
    full?: { elements: string[]; elementsLeftOut: number; text: string; textLeftOut: number };
}

type Refusal = { ok: false; error: string; message: string };

function refuse(error: string, message: string): Refusal {
    return { ok: false, error, message };
}

function refused(r: Refusal, logs: string[] = []): ToolExecutionResult {
    return { ok: false, error: r.error, output: { message: r.message }, logs };
}

/* ───────────────────────── the run's own state ───────────────────────── */

/**
 * What a run has done to the shared panel page and must undo when it ends:
 * listeners an interrupted call left attached, and a stream it started. Keyed
 * by run, removed by releaseEngineBrowserRun. Nothing here is learned or
 * shared between runs.
 */
interface RunBrowser {
    detach: Set<() => void>;
    /** Browser sessions whose live stream this run started. */
    streams: Set<string>;
    lastUsedAt: number;
}

const runs = new Map<string, RunBrowser>();

function runFor(runId: string): RunBrowser {
    const now = Date.now();
    //  A run whose caller died never releases. Its entry is tiny, but a server
    //  that runs for months must not keep one per run it ever served.
    for (const [id, r] of runs) {
        if (id !== runId && r.detach.size === 0 && now - r.lastUsedAt > FORGOTTEN_RUN_MS) runs.delete(id);
    }
    let run = runs.get(runId);
    if (!run) {
        run = { detach: new Set(), streams: new Set(), lastUsedAt: now };
        runs.set(runId, run);
    }
    run.lastUsedAt = now;
    return run;
}

/**
 * The run is over: remove the listeners it left on the page and stop the
 * stream it started. A panel that is still watching keeps its stream: it is
 * the owner's now, and the panel's own disconnect (wsHub onLastClient) stops
 * it. Stopping it here would freeze the view he is looking at. The owner's
 * panel session itself is never closed.
 */
export function releaseEngineBrowserRun(runId: string): void {
    const id = String(runId || '').trim();
    const run = runs.get(id);
    if (!run) return;
    runs.delete(id);
    for (const off of [...run.detach]) {
        try { off(); } catch { /* the page is already gone */ }
    }
    run.detach.clear();
    for (const sid of run.streams) {
        if (panelWatcherCount(sid) === 0) stopStreaming(sid);
    }
}

/** How many runs hold browser state right now (what a test or a health line can count). */
export function engineBrowserRunCount(): number {
    return runs.size;
}

/* ───────────────────────── who, where, which page ───────────────────────── */

interface Target { sid: string; userId: string; runId: string }

/** The browser session is the run's, never the model's: input is not read here. */
function targetOf(context: any): Target | Refusal {
    const userId = String(context?.userId || '').trim();
    const chat = String(context?.sessionId || '').trim();
    const sid = String(context?.browserSessionId || '').trim() || (chat ? `browser:${chat}` : '');
    const runId = String(context?.runId || '').trim();
    if (!userId) return refuse('unauthorized', 'No signed-in user is bound to this run, so its browser cannot be used.');
    if (!sid) return refuse('browser_session_required', 'This run belongs to no chat session, so there is no browser panel page to use.');
    if (!runId) return refuse('run_required', 'The engine browser tools need the run id (context.runId), so that the run can release the browser when it ends.');
    return { sid, userId, runId };
}

async function ownedTarget(context: any): Promise<Target | Refusal> {
    const t = targetOf(context);
    if ('ok' in t) return t;
    let allowed = false;
    try { allowed = await canAccessBrowserSession(t.userId, t.sid); } catch { allowed = false; }
    if (!allowed) return refuse('forbidden', 'This browser session belongs to another user, so this run may not drive it.');
    return t;
}

/** The project folder comes from the run's context, checked against the workspace (workspace.ts). */
async function projectRootOf(context: any): Promise<{ root: string } | Refusal> {
    let active: string;
    try { active = workspaceService.getActiveRoot(context?.workspaceId); }
    catch { return refuse('project_root_invalid', 'The workspace of this run could not be resolved.'); }
    const problem = projectRootProblem(context?.projectRoot, active);
    if (problem) return refuse('project_root_invalid', problem);
    try { return { root: await fsp.realpath(String(context.projectRoot)) }; }
    catch { return refuse('project_root_invalid', 'The project folder of this run does not exist.'); }
}

function cancelled(context: any): boolean {
    try { return !!(context?.signal?.aborted || context?.isCancelled?.()); } catch { return true; }
}

const CANCELLED = (): Refusal => refuse('cancelled', 'The run was cancelled.');

type BrowserState = Awaited<ReturnType<typeof getBrowserSession>>;

/** The panel's page. A page that was closed under the session is replaced once. */
async function sessionFor(sid: string): Promise<BrowserState> {
    let s = await getBrowserSession(sid);
    if (s.page.isClosed()) {
        //  getBrowserSession's own liveness probe cannot see a closed page
        //  (context.pages() never throws), so it is asked here.
        await stopSession(sid);
        s = await getBrowserSession(sid);
        if (s.page.isClosed()) throw new Error('browser_page_closed: the browser page closed again right after it was reopened');
    }
    return s;
}

/** Stream only to a panel that is watching; remember it, so the run can stop it. */
function streamForWatchers(sid: string, s: BrowserState, run: RunBrowser): void {
    if (panelWatcherCount(sid) > 0 && !s.streaming) {
        startStreaming(sid);
        run.streams.add(sid);
    }
}

function browserProblem(e: unknown): Refusal {
    const msg = String((e as any)?.message ?? e ?? '');
    if (/executable doesn't exist|playwright install|browser_launch_failed/i.test(msg)) {
        return refuse('chromium_missing', 'Joe\'s browser (Chromium) could not start. Install it once with "npx playwright install chromium" in the api folder.');
    }
    if (/has been closed|browser_page_closed/i.test(msg)) return refuse('browser_closed', 'The browser page was closed while this call ran.');
    return refuse('browser_failed', `The browser failed: ${clip(firstLine(msg), 300)}`);
}

/* ───────────────────────── addresses ───────────────────────── */

export function isLoopbackHost(hostname: string): boolean {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || /^127(?:\.\d{1,3}){3}$/.test(h);
}

export function effectivePort(u: URL): number {
    return Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
}

function checkUrl(raw: unknown): { href: string; url: URL } | Refusal {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return refuse('url_required', 'Give the address to open, for example http://127.0.0.1:5173/.');
    if (s.length > 4096 || /[\u0000-\u001f\u007f]/.test(s)) return refuse('invalid_url', 'That address is too long or contains control characters.');
    //  «localhost:5173» parses as a URL whose SCHEME is «localhost:», so the
    //  missing scheme is caught before the parser can misread it.
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return refuse('invalid_url', `"${clip(s, 200)}" is not a full address: write it with its scheme, such as http://${clip(s, 200)}`);
    let u: URL;
    try { u = new URL(s); } catch { return refuse('invalid_url', `"${clip(s, 200)}" is not a full address; give one like http://127.0.0.1:5173/.`); }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return refuse('invalid_url', `Only http and https pages can be opened, not ${u.protocol}`);
    if (u.username || u.password) return refuse('invalid_url', 'An address with a user name or password in it is not opened.');
    return { href: u.href, url: u };
}

/** True when something accepts connections on the port: polled, because a dev server may still be booting. */
async function portAnswers(hostname: string, port: number, budgetMs: number, stop: () => boolean): Promise<boolean> {
    const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    //  «localhost» may be served on either family; *.localhost is loopback by
    //  definition, though the OS resolver may not know the name.
    const hosts = h === 'localhost' || h.endsWith('.localhost') ? ['127.0.0.1', '::1'] : [h];
    const deadline = Date.now() + budgetMs;
    for (;;) {
        for (const host of hosts) if (await isPortOpen(host, port, 1_000)) return true;
        if (stop() || Date.now() >= deadline) return false;
        await sleep(250);
    }
}

/** How long a goto may keep being cut short by a navigation that is still landing. */
const INTERRUPTED_RETRY_MS = 3_000;

/**
 * Measured on Playwright 1.63: a goto started while the tab's previous
 * navigation is still landing fails as «interrupted by another navigation».
 * The commonest case is a refused address: the tab commits its
 * chrome-error://chromewebdata page a moment AFTER goto has thrown (355 ms
 * measured), and cuts short the next goto. That names no fault of THIS
 * address, and the same goto succeeds once the tab has settled, so it is
 * tried again for a few seconds. (Waiting for the error page after a refusal
 * was a second fix for the same case; the mutation run of 2026-11-01 showed
 * either one alone was enough, so only this one, which also covers the
 * owner's own navigation landing late, is kept.)
 */
export async function gotoPage(page: Page, url: string, timeoutMs: number): Promise<Response | null> {
    const until = Date.now() + INTERRUPTED_RETRY_MS;
    for (let attempt = 0; ; attempt++) {
        try {
            return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        } catch (e) {
            if (Date.now() < until && /interrupted by another navigation/i.test(String((e as any)?.message ?? e))) {
                await sleep(Math.min(250 * (attempt + 1), 1_000));
                continue;
            }
            throw e;
        }
    }
}

function navigationProblem(e: unknown, url: URL, timeoutMs: number): Refusal {
    const msg = String((e as any)?.message ?? e ?? '');
    const net = /net::(ERR_[A-Z_]+)/.exec(msg)?.[1];
    if (net === 'ERR_CONNECTION_REFUSED') return refuse('nothing_serving', `Nothing is serving ${url.href}.`);
    if (net === 'ERR_NAME_NOT_RESOLVED') return refuse('dns_failed', `The host name ${url.hostname} does not resolve, so ${url.href} cannot be opened.`);
    if (net === 'ERR_CONNECTION_TIMED_OUT' || net === 'ERR_TIMED_OUT' || /Timeout \d+ms exceeded/i.test(msg)) {
        return refuse('timeout', `${url.href} did not finish loading within ${Math.round(timeoutMs / 1000)} s.`);
    }
    if (net === 'ERR_UNSAFE_PORT') return refuse('unsafe_port', `Chromium refuses to open port ${effectivePort(url)}: it is on its list of unsafe ports. Serve the app on another port.`);
    if (net === 'ERR_ABORTED') return refuse('navigation_aborted', `Opening ${url.href} was aborted; the address may be a file download rather than a page.`);
    if (net && net.startsWith('ERR_CERT')) return refuse('tls_failed', `${url.href} has a TLS certificate the browser does not trust (${net}).`);
    if (net) return refuse('navigation_failed', `Opening ${url.href} failed: ${net}.`);
    return refuse('navigation_failed', `Opening ${url.href} failed: ${clip(firstLine(msg).replace(/^page\.goto:\s*/i, ''), 300)}`);
}

/* ───────────────────────── what the page says during a call ───────────────────────── */

interface Watch {
    consoleErrors: { text: string; url: string }[];
    consoleWarnings: string[];
    pageErrors: string[];
    failedRequests: { line: string; url: string }[];
    dialogs: string[];
    dropped: { consoleErrors: number; consoleWarnings: number; pageErrors: number; failedRequests: number; dialogs: number };
    /** The last response to a main-frame document request seen during the call. */
    document?: { status: number; statusText: string };
    /** A new document started loading in the main frame. */
    navigated: boolean;
    /** Resolve once the requests this call saw start have ended and stayed quiet for `ms`, or after `budgetMs`. */
    quiet(ms: number, budgetMs: number): Promise<void>;
    /** Close the new tabs the call opened, and give the address each had reached. */
    closePopups(): Promise<string[]>;
    stop(): void;
}

function locationOf(m: ConsoleMessage): { url: string; line: number } {
    try { const l = m.location(); return { url: String(l?.url || ''), line: Number(l?.lineNumber || 0) }; }
    catch { return { url: '', line: 0 }; }
}

/**
 * Listen to the page for the length of one call, the way browser_console_scan
 * did (BrowserSmartTools), and leave nothing attached afterwards. The run keeps
 * a handle on the detach, so a call cut short still gets cleaned up.
 *
 * Requests are tracked by identity, not counted: a request the page started
 * before the call (a poll, a stream) may end during it, and a counter would
 * take that end for the end of the call's own request and answer early.
 *
 * A dialog (alert, confirm, prompt, beforeunload) is answered as a user going
 * ahead would: accepted, a prompt with its default text. With no listener
 * Playwright dismisses every dialog, so a delete behind a confirm() never
 * happened and the view said only that nothing changed. A new tab the call
 * opens is closed once its address is known: the run drives one page, and a
 * tab left open in the owner's browser would live as long as his session.
 */
function watchPage(page: Page, run: RunBrowser): Watch {
    const pending = new Set<Request>();
    const popups: Page[] = [];
    let lastActivity = Date.now();
    const main = (() => { try { return page.mainFrame(); } catch { return null; } })();
    const closeTab = (p: Page) => { p.close().catch(() => { /* already gone */ }); };
    const w: Watch = {
        consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [], dialogs: [],
        dropped: { consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, failedRequests: 0, dialogs: 0 },
        navigated: false,
        async quiet(ms, budgetMs) {
            const since = Date.now();
            const deadline = since + budgetMs;
            while (Date.now() < deadline) {
                if (pending.size === 0 && Date.now() - Math.max(lastActivity, since) >= ms) return;
                await sleep(50);
            }
        },
        async closePopups() {
            const out: string[] = [];
            for (const p of popups.splice(0)) {
                const address = () => { try { return p.url(); } catch { return ''; } };
                if (!address() || address() === 'about:blank') {
                    await p.waitForURL(u => u.href !== 'about:blank', { timeout: POPUP_ADDRESS_MS, waitUntil: 'commit' }).catch(() => { /* it never left the blank page */ });
                }
                out.push(address() || 'about:blank');
                closeTab(p);
            }
            return out;
        },
        stop: () => { /* replaced below */ },
    };
    const keep = <T>(list: T[], item: T, key: keyof Watch['dropped']) => {
        if (list.length < LIST_LIMIT) list.push(item); else w.dropped[key]++;
    };
    const onConsole = (m: ConsoleMessage) => {
        try {
            const type = m.type();
            if (type !== 'error' && type !== 'warning') return;
            const { url, line } = locationOf(m);
            const text = clip(m.text().replace(/\s+/g, ' ').trim(), 300);
            if (type === 'error') keep(w.consoleErrors, { text: url ? `${text} (${clip(url, 160)}${line ? `:${line}` : ''})` : text, url }, 'consoleErrors');
            else keep(w.consoleWarnings, url ? `${text} (${clip(url, 160)}${line ? `:${line}` : ''})` : text, 'consoleWarnings');
        } catch { /* a message that cannot be read is not evidence */ }
    };
    const onPageError = (e: Error) => {
        try { keep(w.pageErrors, clip(firstLine(e) || String(e), 300), 'pageErrors'); } catch { /* unreadable */ }
    };
    const onRequest = (r: Request) => {
        pending.add(r);
        lastActivity = Date.now();
        try { if (r.isNavigationRequest() && r.frame() === main) w.navigated = true; } catch { /* a worker request has no frame */ }
    };
    const settled = (r: Request) => { pending.delete(r); lastActivity = Date.now(); };
    const onRequestFailed = (r: Request) => {
        settled(r);
        try {
            const why = r.failure()?.errorText || 'failed';
            //  An aborted request is a cancellation (the page navigated away, or
            //  cancelled its own fetch), not a server that failed to answer.
            if (/ERR_ABORTED/.test(why)) return;
            keep(w.failedRequests, { line: `${why} ${r.method()} ${clip(r.url(), 200)}`, url: r.url() }, 'failedRequests');
        } catch { /* unreadable */ }
    };
    const onResponse = (r: Response) => {
        try {
            const status = r.status();
            const req = r.request();
            let isDocument = false;
            try { isDocument = req.isNavigationRequest() && req.frame() === main; } catch { isDocument = false; }
            if (isDocument) w.document = { status, statusText: r.statusText() };
            if (status >= 400) keep(w.failedRequests, { line: `${status} ${req.method()} ${clip(r.url(), 200)}`, url: r.url() }, 'failedRequests');
        } catch { /* unreadable */ }
    };
    const onDialog = (d: Dialog) => {
        let type = 'dialog';
        try {
            type = d.type();
            const text = clip(d.message().replace(/\s+/g, ' ').trim(), 200);
            const answer = type === 'prompt' ? `accepted with ${d.defaultValue() ? JSON.stringify(clip(d.defaultValue(), 80)) : 'an empty answer'}` : 'accepted';
            keep(w.dialogs, `${type} ${JSON.stringify(text)} → ${answer}`, 'dialogs');
        } catch { /* unreadable: it is still answered below */ }
        //  Another listener (a second call on the same page) may have answered it first.
        (type === 'prompt' ? d.accept(d.defaultValue()) : d.accept()).catch(() => { /* already answered */ });
    };
    const onPopup = (p: Page) => { popups.push(p); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('request', onRequest);
    page.on('requestfinished', settled);
    page.on('requestfailed', onRequestFailed);
    page.on('response', onResponse);
    page.on('dialog', onDialog);
    page.on('popup', onPopup);
    const detach = () => {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('request', onRequest);
        page.off('requestfinished', settled);
        page.off('requestfailed', onRequestFailed);
        page.off('response', onResponse);
        page.off('dialog', onDialog);
        page.off('popup', onPopup);
        //  A call cut short still closes the tabs it opened.
        for (const p of popups.splice(0)) closeTab(p);
        run.detach.delete(detach);
    };
    run.detach.add(detach);
    w.stop = detach;
    return w;
}

/* ───────────────────────── the interactive elements ───────────────────────── */

const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox', 'listbox', 'option',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'tab', 'switch', 'slider', 'spinbutton', 'treeitem',
]);
const VALUE_ROLES = new Set(['textbox', 'searchbox', 'spinbutton', 'combobox', 'slider']);
const SHOWN_STATES = new Set(['checked', 'checked=mixed', 'disabled', 'expanded', 'pressed', 'pressed=mixed', 'selected', 'invalid']);

interface AriaNode {
    depth: number;
    role: string;
    name?: string;
    attrs: string[];
    ref?: string;
    text?: string;
    props: Record<string, string>;
    children: AriaNode[];
}

/** A value as renderAriaSnapshotAsYaml writes it: plain, or double-quoted with JSON-style escapes. */
function yamlValue(raw: string): string {
    const s = raw.trim();
    if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
        try { return JSON.parse(s.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')); } catch { return s.slice(1, -1); }
    }
    return s;
}

/** `role "name" [attr] [ref=e5]` → its parts. The name is JSON.stringify'd by the renderer. */
function parseKey(key: string): { role: string; name?: string; attrs: string[] } {
    const m = /^([a-zA-Z]+)/.exec(key);
    const role = m ? m[1] : key;
    let rest = key.slice(role.length);
    let name: string | undefined;
    if (rest.startsWith(' "')) {
        let i = 2;
        while (i < rest.length && rest[i] !== '"') i += rest[i] === '\\' ? 2 : 1;
        try { name = JSON.parse(rest.slice(1, i + 1)); } catch { name = rest.slice(2, i); }
        rest = rest.slice(i + 1);
    }
    const attrs = [...rest.matchAll(/\[([^\]]*)\]/g)].map(a => a[1]);
    return { role, name, attrs };
}

function parseSnapshot(snapshot: string): AriaNode[] {
    const roots: AriaNode[] = [];
    const stack: AriaNode[] = [];
    for (const line of String(snapshot || '').split('\n')) {
        const m = /^( *)- (.*)$/.exec(line.replace(/\r$/, ''));
        if (!m) continue;
        const depth = m[1].length / 2;
        const rest = m[2];
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const parent = stack[stack.length - 1];
        if (rest.startsWith('text: ')) {
            if (parent) parent.children.push({ depth, role: 'text', attrs: [], text: yamlValue(rest.slice(6)), props: {}, children: [] });
            continue;
        }
        const prop = /^\/([a-zA-Z]+): (.*)$/.exec(rest);
        if (prop) {
            if (parent) parent.props[prop[1]] = yamlValue(prop[2]);
            continue;
        }
        let key: string;
        let after: string;
        if (rest.startsWith('\'')) {
            //  The renderer single-quotes a key that YAML would misread, doubling
            //  any quote inside it.
            let i = 1;
            while (i < rest.length && !(rest[i] === '\'' && rest[i + 1] !== '\'')) i += rest[i] === '\'' ? 2 : 1;
            key = rest.slice(1, i).replace(/''/g, '\'');
            after = rest.slice(i + 1);
        } else if (rest.endsWith(':') && !rest.includes(': ')) {
            key = rest.slice(0, -1);
            after = ':';
        } else {
            const at = rest.indexOf(': ');
            key = at >= 0 ? rest.slice(0, at) : rest;
            after = at >= 0 ? rest.slice(at) : '';
        }
        const { role, name, attrs } = parseKey(key);
        const ref = attrs.find(a => a.startsWith('ref='))?.slice(4);
        const node: AriaNode = { depth, role, name, attrs, ref, props: {}, children: [] };
        if (after.startsWith(': ')) node.text = yamlValue(after.slice(2));
        if (parent) parent.children.push(node); else roots.push(node);
        stack.push(node);
    }
    return roots;
}

function textOfChildren(node: AriaNode): string {
    return node.children.filter(c => c.role === 'text' && c.text).map(c => c.text).join(' ').trim();
}

const folded = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * The accessibility snapshot shows a password field's value in clear
 * (measured), with its whitespace folded. The model never reads a password,
 * and on a server it would leave the machine with the prompt. A value is
 * hidden when it is, or is part of, a password filled in on the page.
 */
function isSecretValue(value: string, secrets: string[]): boolean {
    const v = folded(value);
    if (!v) return false;
    return secrets.some(s => s === v || (v.length >= 4 && s.includes(v)) || (s.length >= 4 && v.includes(s)));
}

function describeNode(n: AriaNode, secrets: string[]): string {
    const parts = [`[${n.ref}] ${n.role}`];
    const label = n.name || (!VALUE_ROLES.has(n.role) ? (n.text ?? textOfChildren(n)) : '');
    if (label) parts.push(JSON.stringify(clip(label, 100)));
    const states = n.attrs.filter(a => SHOWN_STATES.has(a));
    if (VALUE_ROLES.has(n.role) && n.role !== 'combobox') {
        const value = n.text ?? textOfChildren(n);
        if (value && isSecretValue(value, secrets)) parts.push('value (hidden: a password is filled in)');
        else if (value) parts.push(`value ${JSON.stringify(clip(value, 120))}`);
        if (n.props.placeholder) parts.push(`placeholder ${JSON.stringify(clip(n.props.placeholder, 80))}`);
    }
    if (n.role === 'combobox' || n.role === 'listbox') {
        const options = n.children.filter(c => c.role === 'option');
        if (options.length) {
            const shown = options.slice(0, 12).map(o => `${JSON.stringify(clip(o.name ?? o.text ?? '', 60))}${o.attrs.includes('selected') ? ' (selected)' : ''}`);
            parts.push(`options: ${shown.join(', ')}${options.length > 12 ? `, … ${options.length - 12} more` : ''}`);
        } else if (n.text) {
            parts.push(`value ${JSON.stringify(clip(n.text, 120))}`);
        }
    }
    if (n.props.url) parts.push(`→ ${clip(n.props.url, 160)}`);
    if (states.length) parts.push(`(${states.join(', ')})`);
    return parts.join(' ');
}

/**
 * The interactive elements of an ai-mode aria snapshot, one line each:
 * `[e12] button "Save"`, `[e5] textbox "Name" value "Younes"`. The options
 * of a native select carry no ref (Chromium gives them no box), so they are
 * listed on the select; an option that has a ref is clickable and gets its
 * own line. Values filled into password fields (`secrets`) are never shown.
 */
export function elementsFromSnapshot(snapshot: string, secrets: Iterable<string> = []): string[] {
    const hidden = [...secrets].map(folded).filter(Boolean);
    const out: string[] = [];
    const visit = (n: AriaNode) => {
        const pointer = n.attrs.includes('cursor=pointer');
        //  A <summary> or an aria-labelled clickable shows as a NAMED generic.
        const interactive = INTERACTIVE_ROLES.has(n.role) || pointer || (n.role === 'generic' && !!n.name);
        if (n.ref && interactive) out.push(describeNode(n, hidden));
        for (const c of n.children) visit(c);
    };
    for (const root of parseSnapshot(snapshot)) visit(root);
    return out;
}

function snapshotBudgetMs(): number {
    const n = Number(process.env.JOE_ENGINE_SNAPSHOT_TIMEOUT_MS);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : SNAPSHOT_BUDGET_MS;
}

/**
 * The fallback list, built in the page. Each listed element gets a
 * `data-joe-ref="jN"` attribute, which is how engine_browser_act finds it
 * again; the attributes of an earlier list are removed first.
 */
async function indexedElements(page: Page): Promise<{ lines: string[]; count: number }> {
    return bounded(page.evaluate((limit: number) => {
        const SELECTOR = [
            'a[href]', 'button', 'input:not([type=hidden])', 'select', 'textarea', 'summary',
            '[role=button]', '[role=link]', '[role=checkbox]', '[role=radio]', '[role=tab]', '[role=menuitem]',
            '[role=switch]', '[role=combobox]', '[role=textbox]', '[contenteditable=""]', '[contenteditable="true"]', '[onclick]',
        ].join(',');
        for (const el of Array.from(document.querySelectorAll('[data-joe-ref]'))) el.removeAttribute('data-joe-ref');
        const lines: string[] = [];
        let count = 0;
        for (const el of Array.from(document.querySelectorAll(SELECTOR)) as HTMLElement[]) {
            const box = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (box.width <= 0 || box.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
            count++;
            const ref = `j${count}`;
            el.setAttribute('data-joe-ref', ref);
            if (lines.length >= limit) continue;
            const tag = el.tagName.toLowerCase();
            const input = el as HTMLInputElement;
            const type = tag === 'input' ? (input.type || 'text') : '';
            const role = el.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'select' ? 'combobox'
                : tag === 'textarea' ? 'textbox' : type === 'checkbox' || type === 'radio' ? type
                    : tag === 'input' && ['button', 'submit', 'reset'].includes(type) ? 'button' : tag === 'input' ? 'textbox' : tag);
            const labelled = el.getAttribute('aria-label') || (input.labels && input.labels[0] ? input.labels[0].innerText : '')
                || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || '';
            const text = (tag === 'input' || tag === 'select' || tag === 'textarea') ? '' : (el.innerText || '');
            const name = (labelled || text).replace(/\s+/g, ' ').trim().slice(0, 100);
            let line = `[${ref}] ${role}${name ? ` ${JSON.stringify(name)}` : ''}`;
            if (type === 'password') line += input.value ? ' value (hidden: a password is filled in)' : '';
            else if (tag === 'input' && type !== 'checkbox' && type !== 'radio' && input.value) line += ` value ${JSON.stringify(input.value.slice(0, 120))}`;
            else if (tag === 'textarea' && (el as HTMLTextAreaElement).value) line += ` value ${JSON.stringify((el as HTMLTextAreaElement).value.slice(0, 120))}`;
            if (tag === 'select') {
                const options = Array.from((el as HTMLSelectElement).options);
                line += ` options: ${options.slice(0, 12).map(o => `${JSON.stringify(o.label.slice(0, 60))}${o.selected ? ' (selected)' : ''}`).join(', ')}${options.length > 12 ? `, … ${options.length - 12} more` : ''}`;
            }
            if (tag === 'a') line += ` → ${(el as HTMLAnchorElement).getAttribute('href') || ''}`;
            const states: string[] = [];
            if ((type === 'checkbox' || type === 'radio') && input.checked) states.push('checked');
            if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') states.push('disabled');
            if (states.length) line += ` (${states.join(', ')})`;
            lines.push(line);
        }
        return { lines, count };
    }, FULL_ELEMENT_LIMIT), PAGE_READ_MS, 'Listing the page elements');
}

/** Values typed into password fields right now: what the element list must not show. */
async function passwordValues(page: Page): Promise<string[]> {
    try {
        return await bounded(page.evaluate(() => Array.from(document.querySelectorAll('input[type=password]'))
            .map(el => (el as HTMLInputElement).value).filter(v => v.length > 0)), PAGE_READ_MS, 'Reading the password fields');
    } catch { return []; }
}

/** Every interactive element (up to FULL_ELEMENT_LIMIT lines) and how many the page has. */
interface ElementList {
    lines: string[];
    count: number;
    source: EnginePageView['elementSource'];
    problem?: string;
}

async function elementsOf(page: Page): Promise<ElementList> {
    let snapshotProblem: string;
    try {
        const snapshot = await page.ariaSnapshot({ mode: 'ai', timeout: snapshotBudgetMs() });
        const all = elementsFromSnapshot(snapshot, await passwordValues(page));
        return { lines: all.slice(0, FULL_ELEMENT_LIMIT), count: all.length, source: 'aria' };
    } catch (e) {
        snapshotProblem = clip(firstLine(e), 200);
    }
    try {
        const list = await indexedElements(page);
        return { lines: list.lines, count: list.count, source: 'indexed', problem: `the accessibility snapshot failed (${snapshotProblem})` };
    } catch (e) {
        return { lines: [], count: 0, source: 'indexed', problem: `no element list could be read: ${snapshotProblem}; then ${clip(firstLine(e), 200)}` };
    }
}

/* ───────────────────────── text, screenshots, the whole view ───────────────────────── */

function normaliseText(s: string): string {
    return String(s || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

async function bodyText(page: Page): Promise<string> {
    return normaliseText(await bounded(page.evaluate(() => (document.body ? document.body.innerText : '')), PAGE_READ_MS, 'Reading the page text'));
}

function boundText(s: string): { text: string; cut: number } {
    if (s.length <= TEXT_LIMIT) return { text: s, cut: 0 };
    const first = head(s, Math.floor(TEXT_LIMIT * 0.75));
    let from = s.length - (TEXT_LIMIT - first.length);
    const code = s.charCodeAt(from);
    if (code >= 0xdc00 && code <= 0xdfff) from++;
    const cut = from - first.length;
    return { text: `${first}\n[… ${cut} characters of page text cut here …]\n${s.slice(from)}`, cut };
}

/** A real folder inside the project, every step checked by resolveInProject (no link anywhere on the way). */
async function screenshotsDir(root: string): Promise<string> {
    const rel = '.joe/screenshots';
    let check = await resolveInProject(root, rel, 'list');
    if (check.ok && !check.exists) {
        await fsp.mkdir(check.abs, { recursive: true });
        check = await resolveInProject(root, rel, 'list');
    }
    if (!check.ok) throw new Error(check.error);
    if (!check.exists || !check.isDir) throw new Error('.joe/screenshots is not a folder.');
    return check.abs;
}

/**
 * Named by its content, so an unchanged page is stored once however often it
 * is looked at: long runs re-view the same page many times, and the laptop's
 * disk is shared with everything else.
 */
async function saveJpeg(root: string, bytes: Buffer): Promise<string> {
    const dir = await screenshotsDir(root);
    const file = path.join(dir, `${createHash('sha256').update(bytes).digest('hex').slice(0, 20)}.jpg`);
    try {
        await fsp.writeFile(file, bytes, { flag: 'wx' });
    } catch (e: any) {
        if (e?.code !== 'EEXIST') throw e;
        const st = await fsp.lstat(file);
        if (!st.isFile() || st.isSymbolicLink()) throw new Error(`${path.basename(file)} in .joe/screenshots is not a plain file.`);
    }
    return file;
}

async function readView(page: Page, sid: string, root: string, w: Watch, doc?: { status: number; statusText: string }): Promise<{ view: EnginePageView; fullText: string }> {
    const popups = await w.closePopups();
    const url = page.url();
    const title = await bounded(page.title(), PAGE_READ_MS, 'Reading the title').catch(() => '');
    const fullText = await bodyText(page).catch(() => '');
    const els = await elementsOf(page);
    const { text, cut } = boundText(fullText);
    const elements = els.lines.slice(0, ELEMENT_LIMIT);
    const full: EnginePageView['full'] = cut > 0 || els.count > elements.length ? {
        elements: els.lines,
        elementsLeftOut: Math.max(0, els.count - els.lines.length),
        text: head(fullText, FULL_TEXT_LIMIT),
        textLeftOut: Math.max(0, fullText.length - FULL_TEXT_LIMIT),
    } : undefined;
    let screenshotPath: string | undefined;
    let screenshotProblem: string | undefined;
    try {
        const bytes = await screenshotSessionJpeg(sid, { quality: VIEW_JPEG_QUALITY, timeoutMs: 10_000 });
        screenshotPath = await saveJpeg(root, bytes);
    } catch (e) {
        screenshotProblem = clip(firstLine(e), 200) || 'the capture failed';
    }
    //  Chromium repeats every failed resource as a console error («Failed to
    //  load resource: … 404»); the request itself is already listed, with its
    //  address and status, so it is listed once.
    const failedUrls = new Set(w.failedRequests.map(f => f.url));
    const consoleErrors = w.consoleErrors
        .filter(c => !(c.text.startsWith('Failed to load resource') && failedUrls.has(c.url)))
        .map(c => c.text);
    const view: EnginePageView = {
        url,
        ...(doc ? { status: doc.status, statusText: doc.statusText } : {}),
        title,
        text,
        textLength: fullText.length,
        textCut: cut,
        elements,
        elementCount: els.count,
        elementSource: els.source,
        ...(els.problem ? { elementProblem: els.problem } : {}),
        consoleErrors,
        consoleWarnings: [...w.consoleWarnings],
        pageErrors: [...w.pageErrors],
        failedRequests: w.failedRequests.map(f => f.line),
        dialogs: [...w.dialogs],
        popups,
        omitted: { ...w.dropped },
        ...(screenshotPath ? { screenshotPath } : {}),
        ...(screenshotProblem ? { screenshotProblem } : {}),
        ...(full ? { full } : {}),
    };
    return { view, fullText };
}

/** A view is a failure when the document answered 400 or more: that page is the error, not the app. */
function viewResult(view: EnginePageView, message: string, extra: Record<string, unknown>, logs: string[]): ToolExecutionResult {
    if (view.status !== undefined && view.status >= 400) {
        return {
            ok: false,
            error: `http_${view.status}`,
            output: { message: `${message} The server answered ${view.status}${view.statusText ? ` ${view.statusText}` : ''} for ${view.url}.`, view, ...extra },
            logs,
        };
    }
    return { ok: true, output: { message, view, ...extra }, logs };
}

/* ───────────────────────── acting ───────────────────────── */

export type EngineBrowserAction =
    | { action: 'click'; ref: string }
    | { action: 'type'; ref: string; text: string; submit?: boolean }
    | { action: 'select'; ref: string; value: string }
    | { action: 'press'; key: string }
    | { action: 'scroll'; direction: 'up' | 'down' }
    | { action: 'back' }
    | { action: 'reload' };

/** e12 (main document), f1e3 (a later document or a frame), j4 (the fallback list). Nothing else reaches a selector. */
export const ENGINE_BROWSER_REF = /^(?:f\d+)?e\d+$|^j\d+$/;
const REF = ENGINE_BROWSER_REF;

function parseAction(input: any): EngineBrowserAction | Refusal {
    const action = String(input?.action ?? '').trim().toLowerCase();
    const ref = String(input?.ref ?? '').trim();
    const needRef = (): Refusal | null => {
        if (!ref) return refuse('ref_required', `${action} needs "ref": an element ref from the latest page view, such as e12.`);
        if (!REF.test(ref)) return refuse('invalid_ref', `"${clip(ref, 40)}" is not an element ref; refs look like e12 and come from the latest page view.`);
        return null;
    };
    switch (action) {
        case 'click': return needRef() ?? { action, ref };
        case 'type': {
            const bad = needRef();
            if (bad) return bad;
            if (typeof input?.text !== 'string') return refuse('text_required', 'type needs "text": the text to put in the field.');
            if (input.text.length > 50_000) return refuse('text_too_long', `That text is ${input.text.length} characters; type at most 50000 at a time.`);
            return { action, ref, text: input.text, ...(input?.submit === true ? { submit: true } : {}) };
        }
        case 'select': {
            const bad = needRef();
            if (bad) return bad;
            const value = input?.value;
            if (typeof value !== 'string' && typeof value !== 'number') return refuse('value_required', 'select needs "value": the option\'s value or its visible label.');
            return { action, ref, value: String(value) };
        }
        case 'press': {
            const key = typeof input?.key === 'string' ? input.key.trim() : '';
            if (!key || key.length > 40 || /[\u0000-\u001f]/.test(key)) return refuse('key_required', 'press needs "key": a key name such as Enter, Tab, Escape or ArrowDown.');
            return { action, key };
        }
        case 'scroll': {
            const direction = String(input?.direction ?? 'down').trim().toLowerCase();
            if (direction !== 'up' && direction !== 'down') return refuse('invalid_direction', 'scroll takes "direction": "up" or "down".');
            return { action, direction };
        }
        case 'back': return { action };
        case 'reload': return { action };
        default: return refuse('invalid_action', `"${clip(action, 40)}" is not an action; use click, type, select, press, scroll, back or reload.`);
    }
}

class ActProblem extends Error {
    constructor(readonly code: string, message: string) { super(message); }
}

async function locate(page: Page, ref: string): Promise<Locator> {
    const loc = page.locator(ref.startsWith('j') ? `[data-joe-ref="${ref}"]` : `aria-ref=${ref}`);
    if (await loc.count() === 0) {
        throw new ActProblem('stale_ref', `No element has ref ${ref} on the page now. Refs change when the page changes: use one from the newest view below.`);
    }
    return loc.first();
}

/** Why an action timed out, asked of the element itself. */
async function notActionable(loc: Locator, verb: string, ref: string, e: unknown): Promise<ActProblem> {
    const msg = String((e as any)?.message ?? e ?? '');
    if (!/Timeout \d+ms exceeded/i.test(msg)) return new ActProblem('action_failed', `Could not ${verb} [${ref}]: ${clip(firstLine(msg).replace(/^locator\.\w+:\s*/i, ''), 300)}`);
    let why = 'another element covers it, or it never became ready';
    if (!await loc.isVisible().catch(() => false)) why = 'it is not visible';
    else if (await loc.isDisabled().catch(() => false)) why = 'it is disabled';
    return new ActProblem('not_actionable', `Could not ${verb} [${ref}] within ${ACTION_TIMEOUT_MS / 1000} s: ${why}.`);
}

interface Performed { detail: string; response?: Response | null }

async function perform(page: Page, a: EngineBrowserAction): Promise<Performed> {
    switch (a.action) {
        case 'click': {
            const loc = await locate(page, a.ref);
            try { await loc.click({ timeout: ACTION_TIMEOUT_MS }); } catch (e) { throw await notActionable(loc, 'click', a.ref, e); }
            return { detail: `Clicked [${a.ref}].` };
        }
        case 'type': {
            const loc = await locate(page, a.ref);
            //  fill() replaces what the field holds, as a user selecting all and
            //  typing would; the old executor's locator path typed '' instead.
            try { await loc.fill(a.text, { timeout: ACTION_TIMEOUT_MS }); } catch (e) { throw await notActionable(loc, 'type into', a.ref, e); }
            const secret = await loc.evaluate(el => (el as HTMLInputElement).type === 'password').catch(() => false);
            const now = await loc.inputValue({ timeout: 1_000 }).catch(() => undefined);
            let detail = `Typed ${a.text.length} characters into [${a.ref}]`;
            if (secret) detail += '; the password field is filled.';
            else if (now !== undefined) detail += now === a.text ? '; it now holds exactly that text.' : `; it now holds ${JSON.stringify(clip(now, 200))}.`;
            else detail += '.';
            if (a.submit) {
                try { await loc.press('Enter', { timeout: ACTION_TIMEOUT_MS }); } catch (e) { throw await notActionable(loc, 'press Enter in', a.ref, e); }
                detail += ' Pressed Enter.';
            }
            return { detail };
        }
        case 'select': {
            const loc = await locate(page, a.ref);
            const options = await loc.evaluate(el => (el instanceof HTMLSelectElement
                ? Array.from(el.options).map(o => ({ value: o.value, label: o.label })) : null)).catch(() => null);
            if (!options) throw new ActProblem('not_a_select', `[${a.ref}] is not a <select>. For a custom dropdown, click it, then click the option's ref.`);
            const wanted = a.value.trim().toLowerCase();
            const pick = options.find(o => o.value === a.value || o.label === a.value)
                ?? options.find(o => o.label.trim().toLowerCase() === wanted || o.value.trim().toLowerCase() === wanted);
            if (!pick) {
                const list = options.slice(0, 20).map(o => JSON.stringify(o.label || o.value)).join(', ');
                throw new ActProblem('no_such_option', `[${a.ref}] has no option ${JSON.stringify(a.value)}. Its options are: ${list}${options.length > 20 ? `, … ${options.length - 20} more` : ''}.`);
            }
            try { await loc.selectOption({ value: pick.value }, { timeout: ACTION_TIMEOUT_MS }); } catch (e) { throw await notActionable(loc, 'select in', a.ref, e); }
            return { detail: `Selected ${JSON.stringify(pick.label || pick.value)} in [${a.ref}].` };
        }
        case 'press': {
            try { await page.keyboard.press(a.key); }
            catch (e) { throw new ActProblem('invalid_key', `Could not press ${JSON.stringify(a.key)}: ${clip(firstLine(e).replace(/^keyboard\.press:\s*/i, ''), 200)}`); }
            return { detail: `Pressed ${a.key}.` };
        }
        case 'scroll': {
            const size = page.viewportSize() ?? { width: 1280, height: 720 };
            const read = () => bounded(page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight]), PAGE_READ_MS, 'Reading the scroll position');
            const [before] = await read();
            await page.mouse.move(Math.round(size.width / 2), Math.round(size.height / 2));
            await page.mouse.wheel(0, (a.direction === 'up' ? -1 : 1) * Math.round(size.height * 0.8));
            //  The wheel does not wait for the scroll to happen; wait until it stops.
            let [after, height] = await read();
            for (let i = 0; i < 10; i++) {
                await sleep(100);
                const [y, h] = await read();
                if (y === after) break;
                after = y; height = h;
            }
            if (after === before) {
                return { detail: `Scrolled ${a.direction}, but the window did not move: it is already at the ${a.direction === 'up' ? 'top' : 'bottom'}, or the page scrolls an inner panel.` };
            }
            return { detail: `Scrolled ${a.direction} from ${Math.round(before)} to ${Math.round(after)} px (the page is ${Math.round(height)} px tall).` };
        }
        case 'back': {
            const before = page.url();
            const response = await page.goBack({ waitUntil: 'domcontentloaded', timeout: DEFAULT_BROWSER_CONFIG.navTimeoutMs })
                .catch(e => { throw new ActProblem('navigation_failed', `Going back failed: ${clip(firstLine(e), 300)}`); });
            if (!response && page.url() === before) throw new ActProblem('no_history', 'There is no earlier page in this tab to go back to.');
            return { detail: `Went back to ${page.url()}.`, response };
        }
        case 'reload': {
            const response = await page.reload({ waitUntil: 'domcontentloaded', timeout: DEFAULT_BROWSER_CONFIG.navTimeoutMs })
                .catch(e => { throw new ActProblem('navigation_failed', `Reloading failed: ${clip(firstLine(e), 300)}`); });
            return { detail: `Reloaded ${page.url()}.`, response };
        }
    }
}

/* ───────────────────────── the screenshot panel ───────────────────────── */

async function realChildDir(root: string, parts: string[]): Promise<string> {
    let current = root;
    for (const part of parts) {
        current = path.join(current, part);
        let st;
        try { st = await fsp.lstat(current); }
        catch (e: any) {
            if (e?.code !== 'ENOENT') throw e;
            await fsp.mkdir(current);   // the parent was checked: never mkdir through a link
            st = await fsp.lstat(current);
        }
        if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${part} is not a plain folder`);
    }
    return current;
}

/**
 * Show the capture in the chat's screenshot panel, the way the `screenshot`
 * tool does: the panel reads <workspace>/screenshots/<sha256(chat)>/<uuid>/
 * with its manifest, through readScreenshot, which re-checks the owner, the
 * hash and the size, and the `screenshot` event tells it to look. Returns why
 * it could not, or undefined when it did.
 */
async function showInPanel(context: any, bytes: Buffer, size: { width: number; height: number }, title: string): Promise<string | undefined> {
    const sessionId = String(context?.sessionId || '').trim();
    const workspaceId = String(context?.workspaceId || '').trim();
    const userId = String(context?.userId || '').trim();
    if (!sessionId || !workspaceId || !userId) return 'the run has no chat session to show it in';
    if (bytes.length > GALLERY_MAX_BYTES || size.width * size.height > GALLERY_MAX_PIXELS) return 'it is larger than the screenshot panel accepts';
    if (!await workspaceService.canAccessAutonomousFiles(workspaceId, userId, true)) return 'this user may not write to the workspace';
    const root = await fsp.realpath(workspaceService.getActiveRoot(workspaceId));
    const key = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
    const dir = await realChildDir(root, ['screenshots', key]);
    const id = randomUUID();
    const captureDir = path.join(dir, id);
    await fsp.mkdir(captureDir);
    const filename = 'browser.jpg';
    await fsp.writeFile(path.join(captureDir, filename), bytes, { flag: 'wx' });
    const createdAt = new Date().toISOString();
    const capture = { id, filename, mimeType: 'image/jpeg', width: size.width, height: size.height, bytes: bytes.length, createdAt };
    await fsp.writeFile(path.join(captureDir, '.joe-capture.json'), JSON.stringify({
        version: 1, ...capture, sessionId, workspaceId, userId, sha256: createHash('sha256').update(bytes).digest('hex'),
    }), { flag: 'wx' });
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { broadcast } = require('../../../api/ws');
        broadcast({
            type: 'screenshot', sessionId, userId, workspaceId,
            data: {
                id, url: `data:image/jpeg;base64,${bytes.toString('base64')}`, pageName: title || 'Screenshot',
                timestamp: createdAt, status: 'success', width: size.width, height: size.height, sessionId, capture,
            },
        });
    } catch { /* the capture is stored; the panel finds it on its next refresh */ }
    return undefined;
}

/* ───────────────────────── the three tools ───────────────────────── */

abstract class EngineBrowserTool implements ToolDefinition {
    abstract name: string;
    abstract description: string;
    abstract inputSchema: Record<string, any>;
    version = '1.0.0';
    tags = ['engine'];
    outputSchema = { type: 'object', properties: { message: { type: 'string' }, view: { type: 'object' } } };
    permissions: ToolPermission[] = ['read', 'write', 'internet'];
    sideEffects: ToolPermission[] = ['write'];
    /**
     * ToolService keys this limit by tool name alone, for every user together
     * (rateLimitBucketKey). One run makes a few browser calls a minute at most;
     * this leaves room for many runs at once.
     */
    rateLimitPerMinute = 600;
    auditFields = ['url', 'action', 'ref'];
    mockSupported = false;
    abstract execute(input: any, context?: any): Promise<ToolExecutionResult>;
}

export class EngineBrowserOpenTool extends EngineBrowserTool {
    name = 'engine_browser_open';
    description = 'Agent engine only: open an address in the run\'s browser panel page and return the measured page view: final URL, HTTP status, title, visible text, interactive elements with refs, console errors, failed requests and a viewport screenshot saved in the project\'s .joe folder.';
    inputSchema = {
        type: 'object' as const,
        properties: { url: { type: 'string', description: 'Full http(s) address to open.' } },
        required: ['url'],
    };

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const checked = checkUrl(input?.url);
        if ('ok' in checked) return refused(checked, logs);
        const t = await ownedTarget(context);
        if ('ok' in t) return refused(t, logs);
        const root = await projectRootOf(context);
        if ('ok' in root) return refused(root, logs);
        if (cancelled(context)) return refused(CANCELLED(), logs);
        const { href, url } = checked;
        if (isLoopbackHost(url.hostname)) {
            const port = effectivePort(url);
            if (!await portAnswers(url.hostname, port, PORT_WAIT_MS, () => cancelled(context))) {
                if (cancelled(context)) return refused(CANCELLED(), logs);
                return refused(refuse('nothing_serving', `Nothing is serving ${href}: no server answered on port ${port} for ${PORT_WAIT_MS / 1000} s.`), logs);
            }
        }
        const run = runFor(t.runId);
        let s: BrowserState;
        try { s = await sessionFor(t.sid); } catch (e) { return refused(browserProblem(e), logs); }
        streamForWatchers(t.sid, s, run);
        const page = s.page;
        const w = watchPage(page, run);
        try {
            let response: Response | null;
            try {
                response = await gotoPage(page, href, DEFAULT_BROWSER_CONFIG.navTimeoutMs);
            } catch (e) {
                const p = /has been closed/i.test(String((e as any)?.message ?? e)) ? browserProblem(e) : navigationProblem(e, url, DEFAULT_BROWSER_CONFIG.navTimeoutMs);
                logs.push(`engine_browser_open ${href}: ${p.error}`);
                return refused(p, logs);
            }
            await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => { /* a page that keeps talking is still a page */ });
            const doc = response ? { status: response.status(), statusText: response.statusText() } : w.document;
            const { view } = await readView(page, t.sid, root.root, w, doc);
            logs.push(`engine_browser_open ${href} → ${view.status ?? 'no document'} (${view.url})`);
            return viewResult(view, `Opened ${view.url}.`, {}, logs);
        } catch (e) {
            return refused(browserProblem(e), logs);
        } finally {
            w.stop();
        }
    }
}

export class EngineBrowserActTool extends EngineBrowserTool {
    name = 'engine_browser_act';
    description = 'Agent engine only: act on the run\'s browser page by an element ref from the latest view (click, type, select, press, scroll, back, reload) and return the new page view, the console errors seen since the action, and whether the URL or the text changed.';
    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string', enum: ['click', 'type', 'select', 'press', 'scroll', 'back', 'reload'] },
            ref: { type: 'string', description: 'Element ref from the latest page view, such as e12.' },
            text: { type: 'string', description: 'For type: the text that replaces the field\'s content.' },
            value: { type: 'string', description: 'For select: the option value or its visible label.' },
            key: { type: 'string', description: 'For press: a key name such as Enter, Tab or ArrowDown.' },
            direction: { type: 'string', enum: ['up', 'down'], description: 'For scroll.' },
            submit: { type: 'boolean', description: 'For type: press Enter afterwards.' },
        },
        required: ['action'],
    };

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const a = parseAction(input);
        if ('ok' in a) return refused(a, logs);
        const t = await ownedTarget(context);
        if ('ok' in t) return refused(t, logs);
        const root = await projectRootOf(context);
        if ('ok' in root) return refused(root, logs);
        if (cancelled(context)) return refused(CANCELLED(), logs);
        //  Acting needs a page someone opened. Asking for the session of a
        //  blank tab would LAUNCH a browser just to report that nothing is there.
        if (!hasLiveBrowserPage(t.sid)) return refused(refuse('no_page', 'Nothing is open in the browser yet: call browser_open first.'), logs);
        const run = runFor(t.runId);
        let s: BrowserState;
        try { s = await sessionFor(t.sid); } catch (e) { return refused(browserProblem(e), logs); }
        if (s.page.url() === 'about:blank') return refused(refuse('no_page', 'The browser page had been closed and was reopened empty: call browser_open again.'), logs);
        streamForWatchers(t.sid, s, run);
        const page = s.page;
        const w = watchPage(page, run);
        try {
            const beforeUrl = page.url();
            const beforeText = await bodyText(page).catch(() => '');
            let done: Performed | undefined;
            let problem: ActProblem | undefined;
            try {
                done = await perform(page, a);
            } catch (e) {
                if (e instanceof ActProblem) problem = e;
                else if (/has been closed/i.test(String((e as any)?.message ?? e))) { const p = browserProblem(e); return refused(p, logs); }
                else problem = new ActProblem('action_failed', `${a.action} failed: ${clip(firstLine(e), 300)}`);
            }
            if (!problem) {
                //  Same-document work (a click that fetches) never changes the
                //  load state, so the page's own requests are waited out first;
                //  a document that started loading then gets the usual settle.
                await w.quiet(QUIET_MS, QUIET_BUDGET_MS);
                await page.waitForLoadState('domcontentloaded', { timeout: DOM_READY_MS }).catch(() => { /* still loading */ });
                if (w.navigated || done?.response) await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => { /* still talking */ });
            }
            const response = done?.response;
            const doc = response ? { status: response.status(), statusText: response.statusText() } : (w.navigated ? w.document : undefined);
            const { view, fullText } = await readView(page, t.sid, root.root, w, doc);
            const changed = { url: view.url !== beforeUrl, text: fullText !== beforeText };
            const what = a.action + ('ref' in a ? ` ${a.ref}` : '');
            logs.push(`engine_browser_act ${what}: ${problem ? problem.code : 'done'}${changed.url ? ' (url changed)' : ''}${changed.text ? ' (text changed)' : ''}`);
            if (problem) return { ok: false, error: problem.code, output: { message: problem.message, view, changed, action: a.action }, logs };
            return viewResult(view, done!.detail, { changed, action: a.action }, logs);
        } catch (e) {
            return refused(browserProblem(e), logs);
        } finally {
            w.stop();
        }
    }
}

export class EngineBrowserScreenshotTool extends EngineBrowserTool {
    name = 'engine_browser_screenshot';
    description = 'Agent engine only: capture the run\'s browser page, the viewport or the whole page (up to 8000 px tall), at its own width or as a phone or a tablet shows it, save the JPEG in the project\'s .joe folder and show it in the chat\'s screenshot panel.';
    inputSchema = {
        type: 'object' as const,
        properties: {
            full_page: { type: 'boolean', description: 'Capture the whole page instead of the viewport.' },
            device: { type: 'string', enum: ['phone', 'tablet'], description: 'Capture the page as a phone (390×844) or a tablet (820×1180) shows it; the page goes back to its own size after.' },
        },
    };

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const t = await ownedTarget(context);
        if ('ok' in t) return refused(t, logs);
        const root = await projectRootOf(context);
        if ('ok' in root) return refused(root, logs);
        if (cancelled(context)) return refused(CANCELLED(), logs);
        if (!hasLiveBrowserPage(t.sid)) return refused(refuse('no_page', 'Nothing is open in the browser yet: call browser_open first.'), logs);
        const run = runFor(t.runId);
        let s: BrowserState;
        try { s = await sessionFor(t.sid); } catch (e) { return refused(browserProblem(e), logs); }
        const page = s.page;
        if (page.url() === 'about:blank') return refused(refuse('no_page', 'The browser page had been closed and was reopened empty: call browser_open again.'), logs);
        streamForWatchers(t.sid, s, run);
        const fullPage = input?.full_page === true;
        /**
         * AS A PHONE SHOWS IT.
         *
         * The 500 exam, 2026-11-07, P025: asked for «قائمة تعمل على الجوال», the
         * builder wrote «the browser tool can't resize the viewport, so I'll
         * look for a way to load the page at phone width», wrote three
         * Playwright scripts of its own, and ran out of time. The page is
         * shown at the device's width for one capture, then given back its
         * own size.
         */
        const device = input?.device === 'phone' ? { name: 'phone', width: 390, height: 844 }
            : input?.device === 'tablet' ? { name: 'tablet', width: 820, height: 1180 } : null;
        try {
            let bytes: Buffer;
            let note: string | undefined;
            if (device) {
                const own = page.viewportSize();
                const release = await pauseBrowserCaptureForPage(page);
                try {
                    await page.setViewportSize({ width: device.width, height: device.height });
                    await page.waitForTimeout(400);
                    const tall = fullPage
                        ? Math.max(1, Math.min(await bounded(page.evaluate(() => document.documentElement.scrollHeight), PAGE_READ_MS, 'Measuring the page'), FULL_PAGE_MAX_HEIGHT))
                        : device.height;
                    bytes = await page.screenshot({ type: 'jpeg', quality: SHOT_JPEG_QUALITY, fullPage, ...(fullPage ? { clip: { x: 0, y: 0, width: device.width, height: tall } } : {}), timeout: 30_000 });
                    const wide = await page.evaluate(() => document.documentElement.scrollWidth).catch(() => device.width);
                    if (wide > device.width + 2) note = `At ${device.name} width the page is ${wide} px wide: it scrolls sideways, something does not fit.`;
                } finally {
                    if (own) await page.setViewportSize(own).catch(() => undefined);
                    release();
                }
            } else if (!fullPage) {
                bytes = await screenshotSessionJpeg(t.sid, { quality: SHOT_JPEG_QUALITY, timeoutMs: 15_000 });
            } else {
                const [scrollWidth, scrollHeight, innerWidth] = await bounded(page.evaluate(() => [
                    document.documentElement.scrollWidth, document.documentElement.scrollHeight, window.innerWidth,
                ]), PAGE_READ_MS, 'Measuring the page');
                const width = Math.max(1, Math.min(Math.max(scrollWidth, innerWidth), FULL_PAGE_MAX_WIDTH));
                const height = Math.max(1, Math.min(scrollHeight, FULL_PAGE_MAX_HEIGHT));
                //  The live stream must not capture while the page is measured
                //  and photographed as a whole (manager.ts pauseBrowserCaptureForPage).
                const release = await pauseBrowserCaptureForPage(page);
                try {
                    bytes = await page.screenshot({ type: 'jpeg', quality: SHOT_JPEG_QUALITY, fullPage: true, clip: { x: 0, y: 0, width, height }, timeout: 30_000 });
                } finally {
                    release();
                }
                if (scrollHeight > height) note = `The page is ${scrollHeight} px tall; the image shows the top ${height} px. Scroll and take another screenshot for the rest.`;
                if (Math.max(scrollWidth, innerWidth) > width) note = `${note ? `${note} ` : ''}The page is ${scrollWidth} px wide; the image shows the left ${width} px.`;
            }
            const size = imageSize(bytes) ?? { width: 0, height: 0 };
            const file = await saveJpeg(root.root, bytes);
            const title = await bounded(page.title(), PAGE_READ_MS, 'Reading the title').catch(() => '');
            const panelProblem = await showInPanel(context, bytes, size, title).catch(e => `it could not be stored for the panel (${clip(firstLine(e), 120)})`);
            logs.push(`engine_browser_screenshot ${fullPage ? 'full page' : 'viewport'}${device ? ` as a ${device.name}` : ''} ${size.width}x${size.height}`);
            return {
                ok: true,
                output: {
                    message: `Captured the ${fullPage ? 'whole page' : 'viewport'} of ${page.url()}${device ? ` as a ${device.name} shows it` : ''} (${size.width}×${size.height}).`,
                    path: file, url: page.url(), width: size.width, height: size.height, fullPage,
                    ...(note ? { note } : {}),
                    shownInPanel: !panelProblem,
                    ...(panelProblem ? { panelProblem } : {}),
                },
                logs,
            };
        } catch (e) {
            const msg = String((e as any)?.message ?? e ?? '');
            if (/has been closed/i.test(msg)) return refused(browserProblem(e), logs);
            return refused(refuse('capture_failed', `The screenshot failed: ${clip(firstLine(msg), 300)}`), logs);
        }
    }
}

export const engineBrowserTools: ToolDefinition[] = [
    new EngineBrowserOpenTool(),
    new EngineBrowserActTool(),
    new EngineBrowserScreenshotTool(),
];
