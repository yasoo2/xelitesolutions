/**
 * THE ENGINE SEES THE PAGE ITS RUN SERVES, AND DRIVES IT BY REF.
 *
 * Real Chromium, a real loopback server started here, and the real gateway:
 * every call goes adapter → ToolService.executeTool → the registered
 * engine_browser_* tool → the chat's panel page. What is pinned is what the
 * old browser layer got wrong, each against the page itself:
 *
 *  - the view reports the HTTP status (a 404 or a 500 page is a failure),
 *    the title, the text, refs, the console error and the image that 404s;
 *  - a click by ref adds the item; typing REPLACES the field's value (the old
 *    executor typed an empty string and said ok); a password never shows;
 *  - the browser session comes from the run, never from the input, and
 *    another user's session is refused;
 *  - nothing waits on the global browser semaphore;
 *  - the stream starts only for a watching panel, and the run stops what it
 *    started;
 *  - the listeners of a call are gone after it, and close() removes those of
 *    a call that was cut short.
 *
 * The jest config keeps browser checks out of the suite unless a browser is
 * there. When Chromium is not installed this file SKIPS and says why: a check
 * that cannot run must never pass.
 */
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { runEngine } from '../core/engine/loop';
import { finishTool } from '../core/engine/finish';
import type { BrowserSession, ChatMessage, EngineModel, ProcessInfo, ProcessRegistry, ToolContext, ToolOutcome } from '../core/engine/types';

const chromiumPath = (() => {
    try { return String(require('playwright').chromium.executablePath() || ''); } catch { return ''; }
})();
const HAVE_CHROMIUM = !!chromiumPath && fs.existsSync(chromiumPath);
if (!HAVE_CHROMIUM) {
    // eslint-disable-next-line no-console
    console.warn(`SKIPPED: Chromium is not installed (expected at "${chromiumPath || 'unknown'}"), so the engine browser checks cannot run here. Install it once with "npx playwright install chromium" in api.`);
}
const describeWithChromium = HAVE_CHROMIUM ? describe : describe.skip;

jest.setTimeout(120_000);

const CHAT = 'chat-eng-browser-1';
const USER = 'user-eng-browser';
const WS = 'ws-eng-browser';
const SID = `browser:${CHAT}`;

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture Shop</title></head>
<body>
<h1>Fixture Shop</h1>
<p>Welcome to the fixture. مرحبا بكم</p>
<form id="f" onsubmit="event.preventDefault(); document.getElementById('out').textContent = 'Saved ' + document.getElementById('name').value;">
  <label for="name">Name</label><input id="name" name="name" value="old value">
  <label for="pw">Password</label><input id="pw" type="password">
  <label for="size">Size</label><select id="size"><option value="s">Small</option><option value="l">Large</option></select>
  <button type="submit">Save</button>
</form>
<p id="out"></p>
<button id="add" onclick="const li = document.createElement('li'); li.textContent = 'Item ' + (document.querySelectorAll('#list li').length + 1); document.getElementById('list').appendChild(li);">Add item</button>
<ul id="list"></ul>
<button id="load" onclick="fetch('/api/slow').then(r => r.json()).then(d => { document.getElementById('loaded').textContent = 'Loaded ' + d.count + ' items'; })">Load</button>
<p id="loaded"></p>
<a href="/second">Second page</a>
<img src="/missing.png" alt="missing picture">
<script>console.error('fixture boom');</script>
</body></html>`;

/** A confirm() before a delete, and a link that opens a new tab. */
const EXTRAS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Extras</title></head>
<body>
<ul id="things"><li>Thing A</li></ul>
<button id="del" onclick="if (confirm('Delete Thing A?')) { document.querySelector('#things li').remove(); document.getElementById('said').textContent = 'Deleted'; }">Delete Thing A</button>
<p id="said"></p>
<a href="/second" target="_blank">Second in a new tab</a>
</body></html>`;

/** More interactive elements than one view lists. */
const MANY = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Many rows</title></head>
<body><p id="picked">Nothing picked</p>
${Array.from({ length: 200 }, (_, i) => `<button onclick="document.getElementById('picked').textContent = 'Picked row ${i + 1}'">Row ${i + 1}</button>`).join('\n')}
</body></html>`;

/** A request that is already waiting when the action starts, and ends while the action's own request is still running. */
const POLL = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Poll</title></head>
<body><p id="later"></p>
<button id="later-btn" onclick="fetch('/api/slow2').then(r => r.json()).then(d => { document.getElementById('later').textContent = 'Loaded later ' + d.count; })">Load later</button>
<script>fetch('/api/poll').then(r => r.text()).then(t => { document.title = 'Poll ' + t; });</script>
</body></html>`;

let root = '';
let server: http.Server;
let base = '';
let port = 0;
/** A second server on the same machine that this run does NOT serve: another user's app, or the owner's own mail. */
let foreign: http.Server;
let foreignBase = '';
let releasePoll: (() => void) | null = null;
const outerEnv: Record<string, string | undefined> = {};
let outerSessions: unknown;

// Loaded after the environment points at this test's folders: manager.ts
// fixes its session-state directory when it is first imported.
let executeTool: typeof import('../modules/services/ToolService').executeTool;
let firewall: typeof import('../orchestration/AgentExecutionFirewall').executionFirewall;
let manager: typeof import('../modules/browser/manager');
let wsHub: typeof import('../modules/browser/wsHub');
let engineTools: typeof import('../modules/tools/definitions/EngineBrowserTools');
let adapter: typeof import('../core/engine/tools/browser');
let artifacts: typeof import('../modules/services/ScreenshotArtifactService');
let workspace: typeof import('../modules/services/WorkspaceService').workspaceService;
let projectRoot = '';

function setEnv(key: string, value: string | undefined) {
    if (!(key in outerEnv)) outerEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

function listen(srv: net.Server): Promise<number> {
    return new Promise(resolve => srv.listen(0, '127.0.0.1', () => resolve((srv.address() as net.AddressInfo).port)));
}

async function freePort(): Promise<number> {
    const s = net.createServer();
    const p = await listen(s);
    await new Promise<void>(r => s.close(() => r()));
    return p;
}

function toolContext(runId: string, over: Record<string, unknown> = {}) {
    return { sessionId: CHAT, browserSessionId: SID, userId: USER, workspaceId: WS, runId, projectRoot, ...over };
}

function inRun<T>(fn: () => Promise<T>): Promise<T> {
    return firewall.runInContext(undefined, fn, { userId: USER, sessionId: CHAT });
}

function registry(served: Partial<ProcessInfo>[]): ProcessRegistry {
    const list = served.map(p => ({ name: 'web', command: 'node server.js', cwd: '.', running: true, startedAt: 0, ...p })) as ProcessInfo[];
    return {
        async start() { throw new Error('not used'); },
        logs() { return undefined; },
        async stop() { return true; },
        list() { return list; },
        async stopAll() { /* the fixture server is the test's */ },
    };
}

/** The engine's own ToolContext, with the run's browser created from the ToolService context. */
function engineContext(runId: string, opts: { served?: Partial<ProcessInfo>[]; request?: string } = {}) {
    const tc = toolContext(runId);
    let browser: BrowserSession | null = null;
    const ctx = {
        runId, projectDir: projectRoot, stateDir: path.join(projectRoot, '.joe'),
        signal: new AbortController().signal, cancelled: new Promise<void>(() => { /* never */ }),
        deadlineAt: Date.now() + 600_000, language: 'en', request: opts.request ?? 'Build a small shop and test it.',
        processes: registry(opts.served ?? [{ name: 'web', url: `${base}/`, port }]),
        browser: () => (browser ??= adapter.createBrowserSession(tc)),
        state: {} as any, emit: () => { /* not observed */ }, joe: { toolContext: tc },
    } as unknown as ToolContext;
    return { ctx, close: async () => { if (browser) await browser.close(); } };
}

async function page() {
    return (await manager.getBrowserSession(SID)).page;
}

function refFor(out: ToolOutcome, pattern: RegExp): string {
    const line = String(out.output).split('\n').find(l => /^\[[a-z0-9]+\] /.test(l) && pattern.test(l));
    if (!line) throw new Error(`no element matching ${pattern} in:\n${out.output}`);
    return /^\[([a-z0-9]+)\]/.exec(line)![1];
}

function isJpeg(file: string): boolean {
    const b = fs.readFileSync(file);
    return b.length > 1000 && b[0] === 0xff && b[1] === 0xd8 && b[b.length - 2] === 0xff && b[b.length - 1] === 0xd9;
}

describeWithChromium('the engine browser on a real page', () => {
    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-browser-'));
        setEnv('EXTERNAL_PROJECTS_DIR', path.join(root, 'projects'));
        setEnv('BROWSER_SESSION_DIR', path.join(root, 'browser-sessions'));
        setEnv('BROWSER_CONSENT_DIR', path.join(root, 'browser-consent'));
        setEnv('BROWSER_PROFILE_DIR', path.join(root, 'profiles'));
        setEnv('JOE_BROWSER_ERROR_LOG', path.join(root, 'browser-errors.log'));
        setEnv('BROWSER_MAX_CONCURRENCY', '1');
        setEnv('JOE_ENGINE_SNAPSHOT_TIMEOUT_MS', undefined);
        outerSessions = (global as any).mockSessions;
        (global as any).mockSessions = [{ _id: CHAT, id: CHAT, userId: USER }];

        server = http.createServer((req, res) => {
            const url = String(req.url || '/');
            if (url === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(PAGE); return; }
            if (url === '/second') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<title>Second</title><h1>Second page</h1>'); return; }
            if (url === '/boom') { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<title>Broken</title><h1>Internal error</h1>'); return; }
            if (url === '/api/slow') { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"count":3}'); }, 700); return; }
            if (url === '/extras') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(EXTRAS); return; }
            if (url === '/many') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(MANY); return; }
            if (url === '/poll') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(POLL); return; }
            if (url === '/api/poll') {
                //  Held until the action's own request arrives, so it ends
                //  while that request is still running.
                const answer = () => { if (!res.writableEnded) { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('done'); } };
                releasePoll = answer;
                setTimeout(answer, 20_000).unref();
                return;
            }
            if (url === '/api/slow2') {
                const r = releasePoll; releasePoll = null;
                if (r) setTimeout(r, 50);
                setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"count":7}'); }, 1_500);
                return;
            }
            if (url === '/away') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<title>Away</title><h1>Our app</h1><a href="${foreignBase}/">Leave</a>`); return; }
            if (url === '/redirect-away') { res.writeHead(302, { location: `${foreignBase}/` }); res.end(); return; }
            if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
            res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
        });
        port = await listen(server);
        base = `http://127.0.0.1:${port}`;
        foreign = http.createServer((req, res) => {
            if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end('<title>Owner Mail</title><h1>Private inbox</h1><p>secret-letter-4471</p><button>Reply</button>');
        });
        foreignBase = `http://127.0.0.1:${await listen(foreign)}`;

        executeTool = require('../modules/services/ToolService').executeTool;
        firewall = require('../orchestration/AgentExecutionFirewall').executionFirewall;
        manager = require('../modules/browser/manager');
        wsHub = require('../modules/browser/wsHub');
        engineTools = require('../modules/tools/definitions/EngineBrowserTools');
        adapter = require('../core/engine/tools/browser');
        artifacts = require('../modules/services/ScreenshotArtifactService');
        workspace = require('../modules/services/WorkspaceService').workspaceService;
        projectRoot = path.join(workspace.getActiveRoot(WS), 'shop');
        fs.mkdirSync(projectRoot, { recursive: true });
    }, 240_000);

    //  Measured on this laptop: Chromium takes 21 to 64 s to exit after
    //  browser.close(), whichever build is launched. How long it takes is not
    //  this file's subject, so the wait is bounded; jest's --forceExit ends the
    //  process and Chromium follows its closed pipe (no process was left after
    //  a run whose hook had timed out).
    afterAll(async () => {
        try { manager?.stopStreaming(SID); } catch { /* not started */ }
        await Promise.race([
            manager ? manager.stopSession(SID).catch(() => { /* not opened */ }) : Promise.resolve(),
            new Promise(r => setTimeout(r, 150_000)),
        ]);
        for (const srv of [server, foreign]) {
            if (!srv) continue;
            srv.closeAllConnections();
            await new Promise<void>(r => srv.close(() => r()));
        }
        for (const [k, v] of Object.entries(outerEnv)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
        if (outerSessions === undefined) delete (global as any).mockSessions; else (global as any).mockSessions = outerSessions;
        try { if (root) fs.rmSync(root, { recursive: true, force: true }); } catch { /* the run's temporary root is removed by teardown.ts */ }
    }, 240_000);

    it('open reports the status, the title, the text, refs, the console error and the image that 404s', async () => {
        const { ctx, close } = engineContext('run-open');
        try {
            const out = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            expect(out.ok).toBe(true);
            expect(out.facts?.page).toMatchObject({ url: `${base}/`, status: 200, title: 'Fixture Shop' });
            expect(out.output).toMatch(/HTTP status: 200 OK/);
            expect(out.output).toMatch(/Welcome to the fixture\. مرحبا بكم/);
            expect(out.output).toMatch(/^\[(?:f\d+)?e\d+\] button "Add item"$/m);
            expect(out.output).toMatch(/^\[(?:f\d+)?e\d+\] textbox "Name" value "old value"$/m);
            expect(out.output).toMatch(/^\[(?:f\d+)?e\d+\] combobox "Size" options: "Small" \(selected\), "Large"$/m);
            expect(out.facts?.page?.consoleErrors.join('\n')).toMatch(/fixture boom/);
            expect(out.facts?.page?.failedRequests).toEqual([`404 GET ${base}/missing.png`]);
            //  Chromium repeats the 404 as «Failed to load resource»; it is listed once, as the request.
            expect(out.facts?.page?.consoleErrors.join('\n')).not.toMatch(/Failed to load resource/);
            const shot = out.images?.[0];
            expect(shot?.mime).toBe('image/jpeg');
            expect(path.dirname(shot!.path)).toBe(path.join(fs.realpathSync(projectRoot), '.joe', 'screenshots'));
            expect(isJpeg(shot!.path)).toBe(true);
        } finally { await close(); }
    });

    it('a click by ref adds the item; typing replaces the value; select and submit work; a password never shows', async () => {
        const { ctx, close } = engineContext('run-act');
        try {
            const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            const act = (args: any) => inRun(() => adapter.browserActTool.run(args, ctx));

            const click = await act({ action: 'click', ref: refFor(opened, /button "Add item"/) });
            expect(click.ok).toBe(true);
            expect(click.output).toMatch(/^Clicked \[(?:f\d+)?e\d+\]\.$/m);
            expect(click.output).toMatch(/The page text changed; the address did not\./);
            expect(click.output).toMatch(/^Item 1$/m);
            expect(await (await page()).locator('#list li').allTextContents()).toEqual(['Item 1']);

            const typed = await act({ action: 'type', ref: refFor(click, /textbox "Name"/), text: 'Younes' });
            expect(typed.ok).toBe(true);
            expect(typed.output).toMatch(/Typed 6 characters into \[(?:f\d+)?e\d+\]; it now holds exactly that text\./);
            expect(await (await page()).inputValue('#name')).toBe('Younes');

            const chosen = await act({ action: 'select', ref: refFor(typed, /combobox "Size"/), value: 'Large' });
            expect(chosen.ok).toBe(true);
            expect(await (await page()).inputValue('#size')).toBe('l');

            const secret = await act({ action: 'type', ref: refFor(chosen, /textbox "Password"/), text: 'hunter2-secret' });
            expect(secret.ok).toBe(true);
            expect(await (await page()).inputValue('#pw')).toBe('hunter2-secret');
            expect(secret.output).not.toMatch(/hunter2/);
            expect(secret.output).toMatch(/textbox "Password" value \(hidden: a password is filled in\)/);

            const submitted = await act({ action: 'type', ref: refFor(secret, /textbox "Name"/), text: 'Younes S', submit: true });
            expect(submitted.ok).toBe(true);
            expect(submitted.output).toMatch(/^Saved Younes S$/m);
        } finally { await close(); }
    });

    it('an action is answered after the page\'s own requests, not before them', async () => {
        const { ctx, close } = engineContext('run-quiet');
        try {
            const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            const out = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(opened, /button "Load"/) }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toMatch(/^Loaded 3 items$/m);
        } finally { await close(); }
    });

    it('a stale ref is refused at once, with the page as it is now', async () => {
        const { ctx, close } = engineContext('run-stale');
        try {
            await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            const started = Date.now();
            const out = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: 'e999' }, ctx));
            expect(out.ok).toBe(false);
            expect(out.output).toMatch(/No element has ref e999 on the page now/);
            expect(out.output).toMatch(/^\[(?:f\d+)?e\d+\] button "Add item"$/m);
            expect(Date.now() - started).toBeLessThan(8_000);
        } finally { await close(); }
    });

    it('a page that answers 500 or 404 is a failure that carries its status', async () => {
        const { ctx, close } = engineContext('run-http');
        try {
            const boom = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/boom` }, ctx));
            expect(boom.ok).toBe(false);
            expect(boom.facts?.page?.status).toBe(500);
            expect(boom.output).toMatch(/The server answered 500 Internal Server Error/);
            const missing = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/nope` }, ctx));
            expect(missing.ok).toBe(false);
            expect(missing.facts?.page?.status).toBe(404);
        } finally { await close(); }
    });

    it('back and reload report the document they loaded', async () => {
        const { ctx, close } = engineContext('run-history');
        try {
            const home = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            const second = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(home, /link "Second page"/) }, ctx));
            expect(second.ok).toBe(true);
            expect(second.output).toMatch(/The address changed, and so did the page text\./);
            expect(second.facts?.page).toMatchObject({ url: `${base}/second`, status: 200 });
            const back = await inRun(() => adapter.browserActTool.run({ action: 'back' }, ctx));
            expect(back.facts?.page).toMatchObject({ url: `${base}/`, status: 200 });
            const reload = await inRun(() => adapter.browserActTool.run({ action: 'reload' }, ctx));
            expect(reload.facts?.page).toMatchObject({ url: `${base}/`, status: 200 });
        } finally { await close(); }
    });

    it('nothing serving is said plainly, and the next open still works', async () => {
        //  This server closes on its first connection: the port check passes,
        //  then the browser's own connection is refused.
        const flaky = net.createServer(sock => { sock.destroy(); flaky.close(); });
        const flakyPort = await listen(flaky);
        const dead = await freePort();
        const { ctx, close } = engineContext('run-refused', {
            served: [{ name: 'web', url: `${base}/`, port }, { name: 'flaky', port: flakyPort }, { name: 'gone', port: dead }],
        });
        try {
            const refused = await inRun(() => adapter.browserOpenTool.run({ url: `http://127.0.0.1:${flakyPort}/` }, ctx));
            expect(refused.ok).toBe(false);
            expect(refused.output).toBe(`Nothing is serving http://127.0.0.1:${flakyPort}/.`);
            const again = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            expect(again.ok).toBe(true);
            expect(again.facts?.page?.status).toBe(200);

            const started = Date.now();
            const never = await inRun(() => adapter.browserOpenTool.run({ url: `http://127.0.0.1:${dead}/` }, ctx));
            expect(never.ok).toBe(false);
            expect(never.output).toBe(`Nothing is serving http://127.0.0.1:${dead}/: no server answered on port ${dead} for 10 s.`);
            expect(Date.now() - started).toBeGreaterThanOrEqual(9_500);
        } finally {
            await close();
            await new Promise<void>(r => flaky.close(() => r()));
        }
    });

    it('a goto started while the tab\'s last navigation is still landing is tried again, not reported as a failure', async () => {
        //  The race the open above meets by chance, set up on purpose: a
        //  refused navigation, then the next one at once, before Chromium has
        //  committed its error page for the first.
        const p = await page();
        const dead = await freePort();
        for (let i = 0; i < 3; i++) {
            await p.goto(`http://127.0.0.1:${dead}/`, { timeout: 10_000 }).catch(() => { /* refused, as intended */ });
            const response = await engineTools.gotoPage(p, `${base}/second`, 15_000);
            expect(response?.status()).toBe(200);
            expect(p.url()).toBe(`${base}/second`);
        }
    });

    it('the screenshot is saved in the project, as the viewport or the whole page, and shown in the chat\'s panel', async () => {
        const access = jest.spyOn(workspace, 'canAccessAutonomousFiles').mockResolvedValue(true);
        const { ctx, close } = engineContext('run-shot');
        try {
            await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            const view = await inRun(() => adapter.browserScreenshotTool.run({ full_page: false }, ctx));
            expect(view.ok).toBe(true);
            expect(isJpeg(view.images![0].path)).toBe(true);
            expect(view.output).toMatch(/\(1280×720, viewport\): \.joe\/screenshots\/[0-9a-f]{20}\.jpg/);
            const full = await inRun(() => adapter.browserScreenshotTool.run({ full_page: true }, ctx));
            expect(full.ok).toBe(true);
            expect(isJpeg(full.images![0].path)).toBe(true);
            expect(full.output).toMatch(/whole page/);
            //  The panel's own reader accepts what the tool stored: owner, hash and size re-checked.
            const owner = { sessionId: CHAT, workspaceId: WS, userId: USER };
            const listed = await artifacts.listScreenshots(owner);
            expect(listed.length).toBe(2);
            const read = await artifacts.readScreenshot(owner, listed[0].id);
            expect(read.capture.mimeType).toBe('image/jpeg');
            expect(read.imageDataUrl.startsWith('data:image/jpeg;base64,/9j/')).toBe(true);
            await expect(artifacts.listScreenshots({ ...owner, userId: 'someone-else' })).resolves.toEqual([]);
        } finally {
            access.mockRestore();
            await close();
        }
    });

    it('the session comes from the run, never from the input, and another user\'s session is refused', async () => {
        const call = (input: any, over: Record<string, unknown> = {}) =>
            inRun(() => executeTool('engine_browser_open', input, toolContext('run-identity', over) as any) as Promise<any>);
        try {
            const res = await call({ url: `${base}/second`, sessionId: 'browser:intruder', browserSessionId: 'browser:intruder' });
            expect(res.ok).toBe(true);
            expect(res.output.view.url).toBe(`${base}/second`);
            expect((await page()).url()).toBe(`${base}/second`);
            expect(manager.hasLiveBrowserPage('browser:intruder')).toBe(false);

            const foreign = await call({ url: `${base}/` }, { userId: 'someone-else' });
            expect(foreign.ok).toBe(false);
            expect(foreign.error).toBe('forbidden');
            expect((await page()).url()).toBe(`${base}/second`);

            //  A real folder, but outside the run's workspace.
            const elsewhere = path.join(root, 'elsewhere');
            fs.mkdirSync(elsewhere, { recursive: true });
            const rootless = await call({ url: `${base}/` }, { projectRoot: elsewhere });
            expect(rootless).toMatchObject({ ok: false, error: 'project_root_invalid', output: { message: 'The project folder is not inside this workspace.' } });
        } finally { engineTools.releaseEngineBrowserRun('run-identity'); }
    });

    it('nothing waits on the global browser semaphore', async () => {
        let release: () => void = () => { /* set below */ };
        const held = manager.withBrowserConcurrency(() => new Promise<void>(r => { release = r; }));
        const { ctx, close } = engineContext('run-semaphore');
        try {
            const out = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            expect(out.ok).toBe(true);
            const acted = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(out, /button "Add item"/) }, ctx));
            expect(acted.ok).toBe(true);
        } finally {
            release();
            await held;
            await close();
        }
    });

    it('the stream starts only for a watching panel, and the run stops what it started', async () => {
        manager.stopStreaming(SID);
        const nobody = engineContext('run-no-watcher');
        await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, nobody.ctx));
        expect((await manager.getBrowserSession(SID)).streaming).toBe(false);
        await nobody.close();

        const watchers = jest.spyOn(wsHub, 'panelWatcherCount').mockReturnValue(1);
        try {
            const watched = engineContext('run-watched');
            await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, watched.ctx));
            expect((await manager.getBrowserSession(SID)).streaming).toBe(true);
            //  The panel is still watching when the run ends: the stream is its now.
            await watched.close();
            expect((await manager.getBrowserSession(SID)).streaming).toBe(true);

            manager.stopStreaming(SID);
            const left = engineContext('run-left');
            await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, left.ctx));
            expect((await manager.getBrowserSession(SID)).streaming).toBe(true);
            //  The panel went away before the run ended: the run stops its stream.
            watchers.mockReturnValue(0);
            await left.close();
            expect((await manager.getBrowserSession(SID)).streaming).toBe(false);
        } finally {
            watchers.mockRestore();
            manager.stopStreaming(SID);
        }
    });

    it('a call leaves no listener behind, and close() removes those of a call cut short', async () => {
        //  A Playwright Page is an EventEmitter at run time; its type does not say so.
        const p = (await page()) as unknown as NodeJS.EventEmitter;
        const EVENTS = ['console', 'pageerror', 'requestfailed', 'response', 'request', 'requestfinished', 'dialog', 'popup'];
        const baseline = EVENTS.map(e => p.listenerCount(e));
        const counts = () => EVENTS.map(e => p.listenerCount(e));
        const { ctx, close } = engineContext('run-listeners');
        const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
        expect(counts()).toEqual(baseline);

        const runs = engineTools.engineBrowserRunCount();
        const pending = inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(opened, /button "Load"/) }, ctx));
        await new Promise(r => setTimeout(r, 300));
        expect(counts()).not.toEqual(baseline);
        await close();
        expect(counts()).toEqual(baseline);
        expect(engineTools.engineBrowserRunCount()).toBe(runs - 1);
        await pending;
        expect(counts()).toEqual(baseline);
    });

    it('in the real loop, a model that can see is shown the page itself, and the run releases its browser', async () => {
        const prompts: ChatMessage[][] = [];
        const turns = [
            { name: 'browser_open', args: { url: `${base}/` } },
            { name: 'task_finish', args: { summary: 'The shop page opens.' } },
        ];
        const model: EngineModel = {
            label: 'scripted:vision', vision: true, contextTokens: () => 64_000,
            async step(messages) {
                prompts.push(JSON.parse(JSON.stringify(messages)));
                const t = turns[Math.min(prompts.length - 1, turns.length - 1)];
                return { text: '', toolCalls: [{ id: `c${prompts.length}`, name: t.name, arguments: JSON.stringify(t.args) }], durationMs: 1 };
            },
        };
        const tc = toolContext('run-loop');
        const runsBefore = engineTools.engineBrowserRunCount();
        const result = await inRun(() => runEngine({
            runId: 'run-loop', request: 'Build a small shop.', language: 'en', projectDir: projectRoot,
            deadlineAt: Date.now() + 300_000, signal: new AbortController().signal, emit: () => { /* not observed */ }, joe: { toolContext: tc },
        }, {
            model,
            tools: [adapter.browserOpenTool, finishTool(async () => ({ passed: true, checks: [], unproven: [], at: Date.now() }))],
            processes: registry([{ name: 'web', url: `${base}/`, port }]),
            browser: () => adapter.createBrowserSession(tc),
            machine: { platform: process.platform, shell: 'cmd.exe' },
        }));
        expect(result.status).toBe('delivered');
        const shown = prompts[1].filter(m => m.role === 'user' && Array.isArray(m.content)).flatMap(m => m.content as any[]);
        const image = shown.find(p => p.type === 'image_url');
        expect(image?.image_url?.url).toMatch(/^data:image\/jpeg;base64,\/9j\//);
        expect(shown.find(p => p.type === 'text')?.text).toMatch(/The screenshot browser_open just took \(\.joe\/screenshots\/[0-9a-f]{20}\.jpg\)/);
        expect(engineTools.engineBrowserRunCount()).toBe(runsBefore);
    });

    it('when the snapshot fails, the list built in the page still gives refs that act takes', async () => {
        setEnv('JOE_ENGINE_SNAPSHOT_TIMEOUT_MS', '1');
        const { ctx, close } = engineContext('run-fallback');
        try {
            const out = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/` }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toMatch(/Listed by Joe itself, because the accessibility snapshot failed/);
            expect(out.output).toMatch(/^\[j\d+\] textbox "Name" value "old value"$/m);
            expect(out.output).not.toMatch(/hunter2/);
            const before = await (await page()).locator('#list li').count();
            const click = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(out, /button "Add item"/) }, ctx));
            expect(click.ok).toBe(true);
            expect(await (await page()).locator('#list li').count()).toBe(before + 1);
        } finally {
            setEnv('JOE_ENGINE_SNAPSHOT_TIMEOUT_MS', undefined);
            await close();
        }
    });

    it('a confirm() the action raises is accepted, as a user would, and the view says so', async () => {
        const { ctx, close } = engineContext('run-dialog');
        try {
            const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/extras` }, ctx));
            const out = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(opened, /button "Delete Thing A"/) }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toMatch(/^Dialogs the page opened since the action \(1\):$/m);
            expect(out.output).toMatch(/^ {2}confirm "Delete Thing A\?" → accepted$/m);
            expect(out.output).toMatch(/^Deleted$/m);
            expect(await (await page()).locator('#things li').count()).toBe(0);
        } finally { await close(); }
    });

    it('a new tab the action opens is named and closed; the run keeps one tab', async () => {
        const { ctx, close } = engineContext('run-popup');
        try {
            const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/extras` }, ctx));
            const pagesBefore = (await page()).context().pages().length;
            const out = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(opened, /link "Second in a new tab"/) }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toContain(`The action opened a new tab at ${base}/second. Joe's browser keeps one tab, so that tab was closed: open the address with browser_open to look at it.`);
            expect((await page()).url()).toBe(`${base}/extras`);
            expect((await page()).context().pages().length).toBe(pagesBefore);
        } finally { await close(); }
    });

    it('an action waits for its own request even when a request from before it ends first', async () => {
        const { ctx, close } = engineContext('run-poll');
        try {
            const opened = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/poll` }, ctx));
            expect(opened.ok).toBe(true);
            const out = await inRun(() => adapter.browserActTool.run({ action: 'click', ref: refFor(opened, /button "Load later"/) }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toMatch(/^Loaded later 7$/m);
        } finally { await close(); }
    });

    it('elements past the listed ones are kept in a file the model can read, and their refs work', async () => {
        const { ctx, close } = engineContext('run-many');
        try {
            const out = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/many` }, ctx));
            expect(out.ok).toBe(true);
            expect(out.output).toMatch(/^Interactive elements \(200; the first 150 are listed\)/m);
            const m = /The whole view, all 200 elements and the full text, is in (\.joe\/pages\/[0-9a-f]{20}\.txt): read it with file_read\./.exec(out.output);
            expect(m).not.toBeNull();
            const saved = fs.readFileSync(path.join(projectRoot, m![1]), 'utf8');
            const line = saved.split('\n').find(l => / button "Row 180"$/.test(l));
            expect(line).toBeDefined();
            expect(out.output).not.toContain('"Row 180"');
            const ref = /^\[([a-z0-9]+)\]/.exec(line!)![1];
            const click = await inRun(() => adapter.browserActTool.run({ action: 'click', ref }, ctx));
            expect(click.ok).toBe(true);
            expect(click.output).toMatch(/^Picked row 180$/m);
        } finally { await close(); }
    });

    it('a page outside the run\'s addresses is never shown: not after a redirect, a link, or going back into the tab\'s history', async () => {
        const { ctx, close } = engineContext('run-away');
        const shotsDir = path.join(fs.realpathSync(projectRoot), '.joe', 'screenshots');
        const shots = () => (fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir).sort() : []);
        //  Nothing of the hidden page reaches the model, and its picture does not stay in the project.
        const hidden = async (call: () => Promise<ToolOutcome>) => {
            const before = shots();
            const out = await inRun(call);
            expect(out.ok).toBe(false);
            expect(out.output).toContain(`The page is now at ${foreignBase}/, which is not an address this run serves or the request gives, so Joe does not show what it holds.`);
            expect(out.output).not.toMatch(/Private inbox|secret-letter-4471|Owner Mail|Reply/);
            expect(out.images).toBeUndefined();
            expect(shots()).toEqual(before);
        };
        try {
            await hidden(() => adapter.browserOpenTool.run({ url: `${base}/redirect-away` }, ctx));

            const away = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/away` }, ctx));
            expect(away.ok).toBe(true);
            await hidden(() => adapter.browserActTool.run({ action: 'click', ref: refFor(away, /link "Leave"/) }, ctx));
            await hidden(() => adapter.browserScreenshotTool.run({ full_page: false }, ctx));
            const back = await inRun(() => adapter.browserActTool.run({ action: 'back' }, ctx));
            expect(back.ok).toBe(true);
            expect(back.output).toMatch(/^Our app$/m);

            //  The owner was reading his own page in the panel before the run.
            await (await page()).goto(`${foreignBase}/`);
            const mine = await inRun(() => adapter.browserOpenTool.run({ url: `${base}/away` }, ctx));
            expect(mine.ok).toBe(true);
            await hidden(() => adapter.browserActTool.run({ action: 'back' }, ctx));
        } finally { await close(); }
    });
});
