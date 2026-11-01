/**
 * WHAT THE MODEL CALLS TO LOOK AT WHAT IT BUILT.
 *
 *     browser_open        open an address and read the page
 *     browser_act         click, type, select, press, scroll, go back, reload
 *     browser_screenshot  capture the viewport or the whole page
 *
 * Each is a thin adapter over a registered ToolService tool
 * (engine_browser_open / _act / _screenshot), reached through the run's
 * BrowserSession (`ctx.browser()`), so the loop releases the browser when the
 * run ends. The registered names are not `browser_*` on purpose: ToolService
 * rewrites `browser_open` into browser_run, and it puts every `browser_*` name
 * in the one global heavy lane it shares with model calls.
 *
 * THE URL POLICY IS ENFORCED HERE, before anything is opened. The model may
 * open only:
 *
 *   (a) a loopback address on a port that a process of THIS run is serving
 *       (ctx.processes: running, with a url or a port), or
 *   (b) an address the request itself contains, verbatim.
 *
 * Anything else is refused with the way forward: start the server with
 * shell_start and open the address it returned. The system prompt states the
 * rule («Never open an address no server of this run printed, unless the user
 * gave it»); this makes it a check instead of a hope. Images come back as
 * files ({path, mime}) so a model that can see is shown the page itself.
 *
 * WHAT A PAGE LANDS ON IS JUDGED TOO. The run drives the owner's own panel
 * page, which carries his sign-ins, and its tab history holds whatever he
 * looked at before the run. A redirect, a link, a script or `back` can take
 * that page anywhere, so every view, after open, after each action and for
 * each screenshot, is shown only when the page is still on the run's own
 * ports or on a site the request names (pagePolicy). Otherwise the model
 * learns only where the page went, and the view's screenshot is deleted.
 *
 * A view cut for the model (more elements than it lists, more text than it
 * shows) is kept whole in `.joe/pages/`, and the view names the file, so
 * every ref stays reachable with file_read.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
    ENGINE_BROWSER_REF, effectivePort, isLoopbackHost, releaseEngineBrowserRun, type EnginePageView,
} from '../../../modules/tools/definitions/EngineBrowserTools';
import { resolveInProject } from '../workspace';
import type {
    BrowserAction, BrowserSession, EngineTool, PageFact, PageState, ParseResult, ProcessInfo, ToolContext, ToolOutcome,
} from '../types';

type Gateway = (name: string, input: any, context?: any) => Promise<any>;

/**
 * ToolService.executeTool, read when a call is made. ToolService loads the
 * whole registry, and a registered tool (the integrator's agent_engine) loads
 * the engine; reading it at call time keeps that circle from closing while
 * modules load. The shell tools do the same.
 */
function gateway(): Gateway {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../../modules/services/ToolService').executeTool;
}

/* ───────────────────────── the run's browser ───────────────────────── */

export interface EnginePageState extends PageState {
    statusText?: string;
    textCut: number;
    elementCount: number;
    elementSource: 'aria' | 'indexed';
    elementProblem?: string;
    consoleWarnings: string[];
    pageErrors: string[];
    dialogs: string[];
    popups: string[];
    omitted: EnginePageView['omitted'];
    screenshotProblem?: string;
    /** The whole view, when `elements` or `text` was cut. */
    full?: EnginePageView['full'];
    /** False when the document answered 400 or more, or the action failed. */
    ok: boolean;
    /** What was done, or why it failed, in one sentence. */
    message: string;
    /** browser_act: whether the address or the visible text changed. */
    changed?: { url: boolean; text: boolean };
}

export interface EngineScreenshot {
    path: string;
    url?: string;
    width?: number;
    height?: number;
    fullPage: boolean;
    note?: string;
    shownInPanel?: boolean;
    panelProblem?: string;
}

/**
 * What a call knows about the engine's run that Joe's tool context may not:
 * the run id, the project folder and the run's cancellation. Joe's context
 * wins where it names them; the cancellations are joined, so either one stops
 * the call (the shell tools join them the same way).
 */
export interface RunLink {
    runId?: string;
    projectDir?: string;
    cancelled?: Promise<void>;
    isCancelled?: () => boolean;
}

export function runLink(ctx: Pick<ToolContext, 'runId' | 'projectDir' | 'cancelled' | 'signal'>): RunLink {
    return { runId: ctx.runId, projectDir: ctx.projectDir, cancelled: ctx.cancelled, isCancelled: () => ctx.signal?.aborted === true };
}

/** The BrowserSession the engine gets, with the screenshot's details kept. */
export interface EngineBrowserSession extends BrowserSession {
    open(url: string, link?: RunLink): Promise<EnginePageState>;
    act(action: BrowserAction, link?: RunLink): Promise<EnginePageState>;
    capture(fullPage?: boolean, link?: RunLink): Promise<EngineScreenshot>;
    screenshot(fullPage?: boolean, link?: RunLink): Promise<string>;
}

export class BrowserCallError extends Error {
    constructor(message: string, readonly code: string) {
        super(message);
        this.name = 'BrowserCallError';
    }
}

function clip(value: unknown, max = 200): string {
    const s = String(value ?? '');
    return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/** A ToolService refusal or failure, as a sentence the model can act on. */
function failureText(res: any): string {
    const message = res?.output?.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    const code = String(res?.error || '').split('\n')[0];
    if (code === 'rate_limited') return `Joe's browser is busy (rate limit); try again in ${Math.max(1, Math.ceil(Number(res?.output?.retryAfterMs || 0) / 1000))} s.`;
    if (code === 'approval_required') return `This browser action needs the owner's approval first (risk: ${res?.output?.risk || 'unknown'}).`;
    if (code === 'policy_blocked') return `Joe's policy blocked this browser action: ${res?.output?.reason || 'no reason was given'}.`;
    if (code === 'unauthorized' || code === 'session_forbidden') return 'This run has no signed-in owner who may use this browser.';
    if (code === 'workspace_required') return 'This run has no workspace, so Joe\'s browser cannot be used.';
    if (code.startsWith('unknown_tool')) return `The engine browser tools are not registered in this build of Joe (${clip(code, 120)}).`;
    return code ? `The browser call failed: ${clip(code, 300)}` : 'The browser call failed without saying why.';
}

function stateOf(res: any): EnginePageState {
    const view: EnginePageView | undefined = res?.output?.view;
    if (!view || typeof view.url !== 'string') throw new BrowserCallError(failureText(res), String(res?.error || 'failed').split('\n')[0]);
    return {
        url: view.url,
        status: view.status,
        statusText: view.statusText,
        title: view.title,
        text: view.text,
        textLength: view.textLength,
        textCut: view.textCut,
        elements: view.elements,
        elementCount: view.elementCount,
        elementSource: view.elementSource,
        elementProblem: view.elementProblem,
        consoleErrors: view.consoleErrors,
        consoleWarnings: view.consoleWarnings,
        pageErrors: view.pageErrors,
        failedRequests: view.failedRequests,
        dialogs: Array.isArray(view.dialogs) ? view.dialogs : [],
        popups: Array.isArray(view.popups) ? view.popups : [],
        omitted: view.omitted,
        screenshotPath: view.screenshotPath,
        screenshotProblem: view.screenshotProblem,
        ...(view.full ? { full: view.full } : {}),
        ok: res?.ok === true,
        message: String(res?.output?.message || ''),
        changed: res?.output?.changed,
    };
}

/** Joe's tool context for one call, with what the engine knows of its run joined in. */
function contextFor(base: any, link?: RunLink): any {
    const joe = base && typeof base === 'object' ? base : {};
    if (!link) return joe;
    //  ToolService takes a cancellation as a promise or as a handle
    //  ({cancelled, whenCancelled, cancel}); either way it is joined here.
    const parent = joe.cancellation;
    const parentSettles: Promise<unknown> | undefined = parent && typeof parent.then === 'function' ? parent
        : parent && parent.whenCancelled && typeof parent.whenCancelled.then === 'function' ? parent.whenCancelled : undefined;
    const settles = [parentSettles, link.cancelled].filter((p): p is Promise<unknown> => !!p);
    const parentCancelled = joe.isCancelled;
    return {
        ...joe,
        runId: joe.runId || link.runId,
        projectRoot: joe.projectRoot || link.projectDir,
        ...(settles.length ? { cancellation: settles.length === 1 ? settles[0] : Promise.race(settles) } : {}),
        isCancelled: () => link.isCancelled?.() === true
            || (parent && typeof parent === 'object' && parent.cancelled === true)
            || (typeof parentCancelled === 'function' && parentCancelled() === true),
    };
}

/**
 * The run's browser: every call goes through ToolService with the run's own
 * context, which names the chat, the user, the workspace, the project folder
 * and the run. close() removes the listeners a cut-short call left on the
 * page and stops a stream the run started; the owner's panel page stays open.
 */
export function createBrowserSession(toolContext: any): EngineBrowserSession {
    let closed = false;
    //  The run this session releases: Joe's context names it, or the first call's link does.
    let runId = String(toolContext?.runId || '').trim();
    const call = async (name: string, args: Record<string, unknown>, link?: RunLink): Promise<any> => {
        if (closed) throw new BrowserCallError('The run\'s browser session is already closed.', 'closed');
        const context = contextFor(toolContext, link);
        if (!runId && context.runId) runId = String(context.runId).trim();
        return gateway()(name, args, context);
    };
    const session: EngineBrowserSession = {
        async open(url, link) {
            return stateOf(await call('engine_browser_open', { url }, link));
        },
        async act(action, link) {
            return stateOf(await call('engine_browser_act', { ...action }, link));
        },
        async capture(fullPage = false, link) {
            const res = await call('engine_browser_screenshot', { full_page: fullPage === true }, link);
            const out = res?.output;
            if (!res?.ok || typeof out?.path !== 'string') throw new BrowserCallError(failureText(res), String(res?.error || 'capture_failed').split('\n')[0]);
            return {
                path: out.path, url: out.url, width: out.width, height: out.height, fullPage: out.fullPage === true,
                note: out.note, shownInPanel: out.shownInPanel, panelProblem: out.panelProblem,
            };
        },
        async screenshot(fullPage, link) {
            return (await session.capture(fullPage, link)).path;
        },
        async close() {
            if (closed) return;
            closed = true;
            if (runId) releaseEngineBrowserRun(runId);
        },
    };
    return session;
}

/* ───────────────────────── the URL policy ───────────────────────── */

function portOf(p: ProcessInfo): number | undefined {
    if (typeof p.port === 'number' && p.port > 0) return p.port;
    if (p.url) {
        try { return effectivePort(new URL(p.url)); } catch { return undefined; }
    }
    return undefined;
}

function runningProcesses(ctx: Pick<ToolContext, 'processes'>): ProcessInfo[] {
    try { return ctx.processes.list().filter(p => p.running); } catch { return []; }
}

/**
 * Every http(s) address written in the request, as a browser would read it.
 * Trailing punctuation of the sentence around it is not part of it, Arabic
 * punctuation included («افتح https://example.com،»).
 */
function addressesInRequest(request: string): string[] {
    const out: string[] = [];
    for (const m of String(request || '').matchAll(/https?:\/\/[^\s<>"'`«»“”‘’]+/giu)) {
        const raw = m[0].replace(/[.,;:!?)\]}،؛؟…]+$/u, '');
        try { out.push(new URL(raw).href); } catch { /* not an address after all */ }
    }
    return out;
}

/**
 * Link-local addresses are where cloud servers keep instance metadata and
 * credentials (169.254.169.254). No app this engine builds lives there, and on
 * a shared server opening it would read the machine's secrets. Refused even
 * when the request names it. A host NAME that resolves there is not caught
 * here; that needs a check at resolution time.
 */
function isLinkLocal(hostname: string): boolean {
    const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

function refusal(u: URL, running: ProcessInfo[]): string {
    const parts = [`Not opened: ${u.href} is not an address this run is serving, and the request does not give it. Start the server with shell_start and open the address it returned.`];
    if (u.hostname === '0.0.0.0' || u.hostname === '[::]') {
        parts.push(`(0.0.0.0 is where a server listens, not an address to open: use http://127.0.0.1:${effectivePort(u)}/ once this run serves that port.)`);
    }
    const served = running.map(p => {
        const port = portOf(p);
        let where = '';
        try { if (p.url && isLoopbackHost(new URL(p.url).hostname)) where = p.url; } catch { where = ''; }
        if (!where && port) where = `http://127.0.0.1:${port}/`;
        return where ? `${where} (${p.name})` : '';
    }).filter(Boolean);
    parts.push(served.length ? `This run is serving: ${served.join(', ')}.` : 'No server of this run is running now.');
    return parts.join(' ');
}

export type OpenDecision = { ok: true; url: string } | { ok: false; reason: string };

/** The address without its query and fragment: where a page is, without what may be a token. */
function placeOf(u: URL): string {
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname}` : `${u.protocol}…`;
}

/** `www.` is the same site; a subdomain of a named site belongs to it. */
function sameSite(host: string, named: string): boolean {
    const h = host.toLowerCase().replace(/^www\./, '');
    const n = named.toLowerCase().replace(/^www\./, '');
    return !!n && (h === n || h.endsWith(`.${n}`));
}

function hiddenReason(where: string): string {
    return `The page is now at ${where}, which is not an address this run serves or the request gives, so Joe does not show what it holds. Go back with browser_act {"action": "back"}, or open this run's own address with browser_open.`;
}

/**
 * May the model see the page the browser is on now? The page got there by a
 * redirect, a link, a script or `back`, so the rule is by site rather than
 * by the exact address open takes: a loopback port this run serves (any
 * loopback name), or a site the request names (its `www.` form and its
 * subdomains included; a loopback address the request names, by its port).
 * The blank page and Chromium's own error page hold nothing of anyone's.
 * Link-local addresses never.
 */
export function pagePolicy(raw: string, ctx: Pick<ToolContext, 'processes' | 'request'>): OpenDecision {
    let u: URL;
    try { u = new URL(String(raw ?? '')); } catch { return { ok: false, reason: hiddenReason(clip(raw, 200)) }; }
    if (u.protocol === 'about:' || u.protocol === 'chrome-error:') return { ok: true, url: u.href };
    let site = u;
    if (u.protocol === 'blob:') {
        try { site = new URL(u.origin); } catch { return { ok: false, reason: hiddenReason(placeOf(u)) }; }
    }
    const hidden = { ok: false as const, reason: hiddenReason(placeOf(site)) };
    if (site.protocol !== 'http:' && site.protocol !== 'https:') return hidden;
    if (site.username || site.password || isLinkLocal(site.hostname)) return hidden;
    const port = effectivePort(site);
    if (isLoopbackHost(site.hostname) && runningProcesses(ctx).some(p => portOf(p) === port)) return { ok: true, url: u.href };
    for (const given of addressesInRequest(ctx.request)) {
        let g: URL;
        try { g = new URL(given); } catch { continue; }
        if (isLoopbackHost(g.hostname)) {
            if (isLoopbackHost(site.hostname) && effectivePort(g) === port) return { ok: true, url: u.href };
        } else if (!isLoopbackHost(site.hostname) && sameSite(site.hostname, g.hostname)) {
            return { ok: true, url: u.href };
        }
    }
    return hidden;
}

export function openPolicy(raw: string, ctx: Pick<ToolContext, 'processes' | 'request'>): OpenDecision {
    const given = String(raw ?? '').trim();
    let u: URL;
    try { u = new URL(given); } catch { return { ok: false, reason: `"${clip(given)}" is not a full address. Open the address shell_start returned, such as http://127.0.0.1:5173/.` }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, reason: `Only http and https pages can be opened, not ${u.protocol} addresses.` };
    if (u.username || u.password) return { ok: false, reason: 'An address with a user name or password in it is not opened.' };
    if (isLinkLocal(u.hostname)) return { ok: false, reason: `Not opened: ${u.hostname} is a link-local address (where a server keeps its own metadata), not an app.` };
    const running = runningProcesses(ctx);
    if (isLoopbackHost(u.hostname)) {
        const port = effectivePort(u);
        if (running.some(p => portOf(p) === port)) return { ok: true, url: u.href };
    }
    if (addressesInRequest(ctx.request).includes(u.href)) return { ok: true, url: u.href };
    return { ok: false, reason: refusal(u, running) };
}

/* ───────────────────────── what the model reads ───────────────────────── */

function relativeTo(file: string, projectDir: string): string {
    const rel = path.relative(projectDir, file);
    return (rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : file).split(path.sep).join('/');
}

function listBlock(title: string, items: string[], omitted: number): string[] {
    if (!items.length && !omitted) return [];
    return [`${title} (${items.length + omitted}):`, ...items.map(i => `  ${i}`), ...(omitted ? [`  … and ${omitted} more`] : [])];
}

/** The page view as text: what happened, the address and status, problems first, then elements, text and the screenshot. */
export function pageText(state: PageState, heading: string, projectDir: string, since: string, fullPath?: string): string {
    const s = state as Partial<EnginePageState> & PageState;
    const lines: string[] = [heading];
    if (s.changed) {
        lines.push(s.changed.url
            ? `The address changed${s.changed.text ? ', and so did the page text' : ''}.`
            : s.changed.text ? 'The page text changed; the address did not.' : 'Nothing visible changed: same address, same text.');
    }
    for (const tab of s.popups ?? []) {
        lines.push(`The action opened a new tab at ${tab}. Joe's browser keeps one tab, so that tab was closed: open the address with browser_open to look at it.`);
    }
    lines.push(`URL: ${s.url}`);
    if (s.status !== undefined) lines.push(`HTTP status: ${s.status}${s.statusText ? ` ${s.statusText}` : ''}`);
    lines.push(`Title: ${s.title ? JSON.stringify(s.title) : '(none)'}`);
    if (fullPath && s.full) {
        const count = s.elementCount ?? s.full.elements.length;
        const elements = s.full.elementsLeftOut ? `the first ${s.full.elements.length} of ${count} elements` : `all ${count} elements`;
        const text = s.full.textLeftOut ? `the first ${s.full.text.length} characters of the text` : 'the full text';
        lines.push(`The whole view, ${elements} and ${text}, is in ${fullPath}: read it with file_read.`);
    }
    const om = { consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, failedRequests: 0, dialogs: 0, ...(s.omitted ?? {}) };
    const problems = [
        ...listBlock(`Console errors ${since}`, s.consoleErrors, om.consoleErrors),
        ...listBlock(`Uncaught page errors ${since}`, s.pageErrors ?? [], om.pageErrors),
        ...listBlock(`Failed requests ${since}`, s.failedRequests, om.failedRequests),
        ...listBlock(`Console warnings ${since}`, s.consoleWarnings ?? [], om.consoleWarnings),
    ];
    lines.push(...(problems.length ? problems : [`No console errors, page errors or failed requests ${since}.`]));
    lines.push(...listBlock(`Dialogs the page opened ${since}`, s.dialogs ?? [], om.dialogs));
    lines.push('');
    const count = s.elementCount ?? s.elements.length;
    lines.push(count
        ? `Interactive elements (${count}${count > s.elements.length ? `; the first ${s.elements.length} are listed` : ''}). Act on them by ref with browser_act:`
        : 'Interactive elements: none were found.');
    if (s.elementProblem) lines.push(`(Listed by Joe itself, because ${s.elementProblem}.)`);
    lines.push(...s.elements);
    lines.push('');
    lines.push(`Visible text (${s.textLength} characters${s.textCut ? `; ${s.textCut} cut from the middle` : ''}):`);
    lines.push(s.text || '(the page shows no text)');
    lines.push('');
    lines.push(s.screenshotPath ? `Screenshot: ${relativeTo(s.screenshotPath, projectDir)}` : `No screenshot${s.screenshotProblem ? `: ${s.screenshotProblem}` : ''}.`);
    return lines.join('\n');
}

/** Text of the whole view, as the model will read it from the file. */
function fullViewText(s: Partial<EnginePageState> & PageState): string {
    const full = s.full!;
    const count = s.elementCount ?? full.elements.length;
    return [
        `The whole page view of ${s.url}${s.title ? ` (${JSON.stringify(s.title)})` : ''}.`,
        ...(s.status !== undefined ? [`HTTP status: ${s.status}${s.statusText ? ` ${s.statusText}` : ''}`] : []),
        '',
        `Interactive elements (${count}). Act on them by ref with browser_act while the page is unchanged:`,
        ...full.elements,
        ...(full.elementsLeftOut ? [`… and ${full.elementsLeftOut} more elements, not kept.`] : []),
        '',
        `Visible text (${s.textLength} characters):`,
        full.text,
        ...(full.textLeftOut ? [`… and ${full.textLeftOut} more characters, not kept.`] : []),
        '',
    ].join('\n');
}

/**
 * Keep a cut view whole in `.joe/pages/`, named by its content, so a page
 * looked at many times is stored once. Every step of the way is checked by
 * resolveInProject (no link anywhere). Returns the path relative to the
 * project folder, or undefined when it could not be kept.
 */
async function keepFullView(s: Partial<EnginePageState> & PageState, projectDir: string): Promise<string | undefined> {
    if (!s.full) return undefined;
    try {
        const body = fullViewText(s);
        const rel = `.joe/pages/${createHash('sha256').update(body).digest('hex').slice(0, 20)}.txt`;
        let dir = await resolveInProject(projectDir, '.joe/pages', 'list');
        if (dir.ok && !dir.exists) {
            await fsp.mkdir(dir.abs, { recursive: true });
            dir = await resolveInProject(projectDir, '.joe/pages', 'list');
        }
        if (!dir.ok || !dir.exists || !dir.isDir) return undefined;
        const file = await resolveInProject(projectDir, rel, 'list');
        if (!file.ok) return undefined;
        if (!file.exists) {
            try { await fsp.writeFile(file.abs, body, { encoding: 'utf8', flag: 'wx' }); }
            catch (e: any) { if (e?.code !== 'EEXIST') return undefined; }
        } else if (file.isDir) return undefined;
        return rel;
    } catch { return undefined; }
}

/** A view's screenshot of a page the model may not see does not stay in the project either. */
async function dropScreenshot(file: string | undefined, projectDir: string): Promise<void> {
    if (!file) return;
    const real = await fsp.realpath(projectDir).catch(() => projectDir);
    for (const root of new Set([projectDir, real])) {
        const rel = path.relative(path.join(root, '.joe', 'screenshots'), file);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) continue;
        await fsp.unlink(file).catch(() => { /* already gone */ });
        return;
    }
}

async function hiddenOutcome(s: Partial<EnginePageState> & PageState, reason: string, ctx: ToolContext): Promise<ToolOutcome> {
    await dropScreenshot(s.screenshotPath, ctx.projectDir);
    let place = s.url;
    try { place = placeOf(new URL(s.url)); } catch { /* not a URL: said as it is */ }
    return {
        ok: false,
        output: reason,
        facts: { page: { url: place, ...(s.status !== undefined ? { status: s.status } : {}), textLength: 0, consoleErrors: [], failedRequests: [] } },
    };
}

async function pageOutcome(state: PageState, heading: string, ctx: ToolContext, since: string): Promise<ToolOutcome> {
    const s = state as Partial<EnginePageState> & PageState;
    const shown = pagePolicy(s.url, ctx);
    if (!shown.ok) return hiddenOutcome(s, shown.reason, ctx);
    const httpOk = s.status === undefined || s.status < 400;
    const fact: PageFact = {
        url: s.url,
        ...(s.status !== undefined ? { status: s.status } : {}),
        ...(s.title ? { title: s.title } : {}),
        textLength: s.textLength,
        //  An uncaught exception is a console error to anyone who opens DevTools.
        consoleErrors: [...s.consoleErrors, ...(s.pageErrors ?? [])],
        failedRequests: [...s.failedRequests],
        ...(s.screenshotPath ? { screenshotPath: s.screenshotPath } : {}),
    };
    const fullPath = await keepFullView(s, ctx.projectDir);
    return {
        ok: (s.ok ?? true) && httpOk,
        output: pageText(s, heading, ctx.projectDir, since, fullPath),
        ...(s.screenshotPath ? { images: [{ path: s.screenshotPath, mime: 'image/jpeg' }] } : {}),
        facts: { page: fact },
    };
}

/** The gateway stops waiting the moment the run is stopped; that is a stop, not a broken browser. */
const STOPPED = new Set(['run_cancelled_by_owner', 'cancelled']);

function failed(e: unknown, tool: string): ToolOutcome {
    if (e instanceof BrowserCallError && STOPPED.has(e.code)) return { ok: false, output: `${tool} was stopped: the run was cancelled.` };
    return { ok: false, output: String((e as any)?.message ?? e ?? 'The browser call failed.') };
}

/* ───────────────────────── the three tools ───────────────────────── */

export const browserOpenTool: EngineTool<{ url: string }> = {
    name: 'browser_open',
    description: 'Open an address in Joe\'s browser and read the page. Open the address shell_start returned for this run\'s server, or an address the user gave in the request; any other address is refused. Returns the final URL, the HTTP status, the title, the visible text, the interactive elements with refs such as [e12] button "Save" for browser_act, the console errors and failed requests seen while loading, and a screenshot.',
    parameters: {
        type: 'object',
        properties: {
            url: { type: 'string', description: 'The full address, such as http://127.0.0.1:5173/' },
        },
        required: ['url'],
    },
    parse(raw: unknown): ParseResult<{ url: string }> {
        const url = typeof (raw as any)?.url === 'string' ? (raw as any).url.trim() : '';
        if (!url) return { ok: false, error: 'browser_open needs "url": the full address to open, such as the one shell_start returned.' };
        return { ok: true, value: { url } };
    },
    async run(args, ctx) {
        const decision = openPolicy(args.url, ctx);
        if (!decision.ok) return { ok: false, output: decision.reason };
        try {
            const state = await (ctx.browser() as EngineBrowserSession).open(decision.url, runLink(ctx));
            const s = state as Partial<EnginePageState> & PageState;
            return await pageOutcome(state, s.message || `Opened ${state.url}.`, ctx, 'while loading');
        } catch (e) {
            return failed(e, 'browser_open');
        }
    },
};

const ACTIONS = ['click', 'type', 'select', 'press', 'scroll', 'back', 'reload'] as const;
/** Names small models reach for, mapped to the action they mean. */
const SYNONYMS: Record<string, string> = {
    fill: 'type', input: 'type', choose: 'select', key: 'press', keypress: 'press',
    go_back: 'back', goback: 'back', refresh: 'reload',
};
const REF = ENGINE_BROWSER_REF;

function refOf(value: unknown): string {
    return String(value ?? '').trim().replace(/^\[|\]$/g, '').replace(/^ref\s*=\s*/i, '').trim();
}

export function parseBrowserAction(raw: unknown): ParseResult<BrowserAction> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, error: 'browser_act takes an object such as {"action": "click", "ref": "e12"}.' };
    }
    const a = raw as Record<string, unknown>;
    const named = String(a.action ?? '').trim().toLowerCase();
    const action = SYNONYMS[named] ?? named;
    const ref = refOf(a.ref);
    const needRef = (): string | null => {
        if (!ref) return `${action} needs "ref": the ref of an element in the latest page view, such as e12.`;
        if (!REF.test(ref)) return `"${clip(ref, 40)}" is not an element ref; refs look like e12 and come from the latest page view.`;
        return null;
    };
    switch (action) {
        case 'click': {
            const bad = needRef();
            return bad ? { ok: false, error: bad } : { ok: true, value: { action, ref } };
        }
        case 'type': {
            const bad = needRef();
            if (bad) return { ok: false, error: bad };
            if (typeof a.text !== 'string') return { ok: false, error: 'type needs "text": the text that replaces what the field holds.' };
            return { ok: true, value: { action, ref, text: a.text, ...(a.submit === true ? { submit: true } : {}) } };
        }
        case 'select': {
            const bad = needRef();
            if (bad) return { ok: false, error: bad };
            if (typeof a.value !== 'string' && typeof a.value !== 'number') return { ok: false, error: 'select needs "value": the option\'s value or its visible label.' };
            return { ok: true, value: { action, ref, value: String(a.value) } };
        }
        case 'press': {
            const key = typeof a.key === 'string' ? a.key.trim() : '';
            if (!key) return { ok: false, error: 'press needs "key": a key name such as Enter, Tab, Escape or ArrowDown.' };
            return { ok: true, value: { action, key } };
        }
        case 'scroll': {
            const direction = String(a.direction ?? 'down').trim().toLowerCase();
            if (direction !== 'up' && direction !== 'down') return { ok: false, error: 'scroll takes "direction": "up" or "down".' };
            return { ok: true, value: { action, direction } };
        }
        case 'back':
            return { ok: true, value: { action } };
        case 'reload':
            return { ok: true, value: { action } };
        default:
            return { ok: false, error: `"${clip(named, 40)}" is not an action. Use one of: ${ACTIONS.join(', ')}.` };
    }
}

export const browserActTool: EngineTool<BrowserAction> = {
    name: 'browser_act',
    description: 'Act on the page the way a user would, by the refs of the latest browser_open or browser_act view: click a ref; type text into a ref (it replaces what the field holds; "submit": true presses Enter afterwards); select an option of a <select> ref by its value or label; press a key (Enter, Tab, Escape, ArrowDown…) in the focused element; scroll up or down; go back; reload. A dialog the page opens (alert, confirm, prompt) is accepted, and the view lists it. Returns the new page view, the console errors seen since the action, and whether the address or the text changed. Refs change when the page changes: always use the refs of the newest view.',
    parameters: {
        type: 'object',
        properties: {
            action: { type: 'string', enum: [...ACTIONS] },
            ref: { type: 'string', description: 'The element ref from the latest page view, such as e12.' },
            text: { type: 'string', description: 'For type: the text to put in the field.' },
            value: { type: 'string', description: 'For select: the option value or its visible label.' },
            key: { type: 'string', description: 'For press: a key name such as Enter, Tab or ArrowDown.' },
            direction: { type: 'string', enum: ['up', 'down'], description: 'For scroll.' },
            submit: { type: 'boolean', description: 'For type: press Enter after typing.' },
        },
        required: ['action'],
    },
    parse: parseBrowserAction,
    async run(action, ctx) {
        try {
            const state = await (ctx.browser() as EngineBrowserSession).act(action, runLink(ctx));
            const s = state as Partial<EnginePageState> & PageState;
            return await pageOutcome(state, s.message || `${action.action} done.`, ctx, 'since the action');
        } catch (e) {
            return failed(e, 'browser_act');
        }
    },
};

export const browserScreenshotTool: EngineTool<{ full_page: boolean }> = {
    name: 'browser_screenshot',
    description: 'Take a screenshot of the page open in Joe\'s browser: the viewport, or the whole page with "full_page": true (up to 8000 px tall). Use it to check layout and visuals; the image is shown to you when your model can see images.',
    parameters: {
        type: 'object',
        properties: {
            full_page: { type: 'boolean', description: 'Capture the whole page instead of the viewport.' },
        },
    },
    parse(raw: unknown): ParseResult<{ full_page: boolean }> {
        const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const v = a.full_page ?? a.fullPage;
        return { ok: true, value: { full_page: v === true || v === 'true' } };
    },
    async run(args, ctx) {
        try {
            const browser = ctx.browser() as Partial<EngineBrowserSession> & BrowserSession;
            const shot: EngineScreenshot = typeof browser.capture === 'function'
                ? await browser.capture(args.full_page, runLink(ctx))
                : { path: await browser.screenshot(args.full_page), fullPage: args.full_page };
            //  The page may have moved since the last view (a script, a timer).
            if (shot.url) {
                const shown = pagePolicy(shot.url, ctx);
                if (!shown.ok) {
                    await dropScreenshot(shot.path, ctx.projectDir);
                    return { ok: false, output: shown.reason };
                }
            }
            const size = shot.width && shot.height ? `${shot.width}×${shot.height}, ` : '';
            const parts = [`Screenshot of ${shot.url || 'the page'} (${size}${shot.fullPage ? 'whole page' : 'viewport'}): ${relativeTo(shot.path, ctx.projectDir)}`];
            if (shot.note) parts.push(shot.note);
            if (shot.shownInPanel === false && shot.panelProblem) parts.push(`It is not in the chat's screenshot panel: ${shot.panelProblem}.`);
            return { ok: true, output: parts.join('\n'), images: [{ path: shot.path, mime: 'image/jpeg' }] };
        } catch (e) {
            return failed(e, 'browser_screenshot');
        }
    },
};

export const browserTools: EngineTool[] = [browserOpenTool, browserActTool, browserScreenshotTool];
