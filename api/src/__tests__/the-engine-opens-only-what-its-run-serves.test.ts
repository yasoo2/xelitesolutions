/**
 * THE ENGINE OPENS ONLY WHAT ITS RUN SERVES, OR WHAT THE USER GAVE.
 *
 * browser_open is the engine's eye, and an eye pointed anywhere is a fetcher
 * for anything: another user's app on the same machine, a server's metadata
 * endpoint, a file on disk. The adapter decides before anything opens: a
 * loopback address on a port a process of THIS run serves, or an address the
 * request contains verbatim. Everything else is refused with the way forward.
 *
 * Also pinned here, without a browser: how the model's browser_act arguments
 * are read (a ref can never smuggle a selector), and how the accessibility
 * snapshot becomes the element list, measured on snapshot text Playwright 1.63
 * really produced, a password field included.
 */
jest.mock('../modules/services/ToolService', () => ({ executeTool: jest.fn() }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import { executeTool } from '../modules/services/ToolService';
import {
    browserActTool, browserOpenTool, browserScreenshotTool, createBrowserSession, openPolicy, pagePolicy, parseBrowserAction,
} from '../core/engine/tools/browser';
import { EngineBrowserActTool, EngineBrowserOpenTool, elementsFromSnapshot } from '../modules/tools/definitions/EngineBrowserTools';
import type { BrowserAction, BrowserSession, PageState, ProcessInfo, ProcessRegistry, ToolContext } from '../core/engine/types';

const gateway = executeTool as unknown as jest.Mock;

function processes(list: Partial<ProcessInfo>[]): ProcessRegistry {
    const full = list.map(p => ({ name: 'web', command: 'npm run dev', cwd: '.', running: true, startedAt: 0, ...p })) as ProcessInfo[];
    return {
        async start() { throw new Error('not used'); },
        logs() { return undefined; },
        async stop() { return true; },
        list() { return full; },
        async stopAll() { /* nothing runs */ },
    };
}

const PAGE: PageState = {
    url: 'http://127.0.0.1:5173/', status: 200, title: 'Shop', textLength: 4, text: 'Shop',
    elements: ['[e2] button "Buy"'], consoleErrors: [], failedRequests: [],
};

function context(opts: { request?: string; served?: Partial<ProcessInfo>[] } = {}) {
    const opened: string[] = [];
    const acted: BrowserAction[] = [];
    const session: BrowserSession = {
        async open(url) { opened.push(url); return { ...PAGE, url }; },
        async act(a) { acted.push(a); return PAGE; },
        async screenshot() { return '/tmp/x.jpg'; },
        async close() { /* nothing to release */ },
    };
    const ctx = {
        runId: 'run-policy', projectDir: '/tmp/project', stateDir: '/tmp/project/.joe',
        signal: new AbortController().signal, cancelled: new Promise<void>(() => { /* never */ }),
        deadlineAt: Date.now() + 60_000, language: 'en', request: opts.request ?? 'Build a small shop.',
        processes: processes(opts.served ?? []), browser: () => session,
        state: {} as any, emit: () => { /* not observed */ }, joe: {},
    } as unknown as ToolContext;
    return { ctx, opened, acted };
}

describe('browser_open opens a loopback address only on a port this run serves', () => {
    it('refuses an unserved loopback port, says how to get one, and opens nothing', async () => {
        const { ctx, opened } = context({ served: [{ name: 'web', url: 'http://localhost:5173/', port: 5173 }] });
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:3000/' }, ctx);
        expect(out.ok).toBe(false);
        expect(out.output).toMatch(/Not opened: http:\/\/127\.0\.0\.1:3000\/ is not an address this run is serving/);
        expect(out.output).toMatch(/Start the server with shell_start and open the address it returned/);
        expect(out.output).toMatch(/This run is serving: http:\/\/localhost:5173\/ \(web\)/);
        expect(opened).toEqual([]);
    });

    it('opens a served port, by the process url or its port, under any loopback name', async () => {
        const byUrl = context({ served: [{ name: 'web', url: 'http://localhost:5173/' }] });
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/cart' }, byUrl.ctx);
        expect(out.ok).toBe(true);
        expect(byUrl.opened).toEqual(['http://127.0.0.1:5173/cart']);

        const byPort = context({ served: [{ name: 'api', port: 8080 }] });
        expect((await browserOpenTool.run({ url: 'http://localhost:8080' }, byPort.ctx)).ok).toBe(true);
        expect(byPort.opened).toEqual(['http://localhost:8080/']);
    });

    it('a process that has stopped serves nothing', async () => {
        const { ctx, opened } = context({ served: [{ name: 'web', port: 5173, running: false }] });
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, ctx);
        expect(out.ok).toBe(false);
        expect(out.output).toMatch(/No server of this run is running now/);
        expect(opened).toEqual([]);
    });

    it('0.0.0.0 is refused with the address to use instead', () => {
        const d = openPolicy('http://0.0.0.0:5173/', context({ served: [{ port: 5173 }] }).ctx);
        expect(d.ok).toBe(false);
        expect((d as any).reason).toMatch(/use http:\/\/127\.0\.0\.1:5173\//);
    });
});

describe('any other address must appear in the request itself', () => {
    it('an address the user wrote is opened, even beside Arabic punctuation', async () => {
        const { ctx, opened } = context({ request: 'افتح https://example.com/docs، ثم لخّص الصفحة' });
        expect((await browserOpenTool.run({ url: 'https://example.com/docs' }, ctx)).ok).toBe(true);
        expect(opened).toEqual(['https://example.com/docs']);
    });

    it('a different path on the same host was not given, and is refused', () => {
        const { ctx } = context({ request: 'Read https://example.com/docs and summarise it.' });
        expect(openPolicy('https://example.com/admin', ctx).ok).toBe(false);
        expect(openPolicy('https://example.com/docs', ctx).ok).toBe(true);
    });

    it('a loopback address the user gave is opened although no process of this run serves it', () => {
        const { ctx } = context({ request: 'My app already runs at http://localhost:4000/ — test its login.' });
        expect(openPolicy('http://localhost:4000/', ctx)).toEqual({ ok: true, url: 'http://localhost:4000/' });
    });

    it('schemes other than http(s), credentials and link-local metadata are refused even when given', () => {
        const { ctx } = context({ request: 'see file:///C:/Windows/win.ini and http://169.254.169.254/latest/meta-data and http://u:p@example.com/' });
        expect(openPolicy('file:///C:/Windows/win.ini', ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/Only http and https/) });
        expect(openPolicy('http://169.254.169.254/latest/meta-data', ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/link-local/) });
        expect(openPolicy('http://u:p@example.com/', ctx)).toMatchObject({ ok: false, reason: expect.stringMatching(/user name or password/) });
        expect(openPolicy('localhost:5173', ctx).ok).toBe(false);
    });
});

describe('browser_act reads the model\'s arguments strictly', () => {
    it('a ref is a ref: nothing else reaches a selector', () => {
        expect(parseBrowserAction({ action: 'click', ref: 'e12' })).toEqual({ ok: true, value: { action: 'click', ref: 'e12' } });
        expect(parseBrowserAction({ action: 'click', ref: '[f1e3]' })).toEqual({ ok: true, value: { action: 'click', ref: 'f1e3' } });
        expect(parseBrowserAction({ action: 'click', ref: 'e1 >> css=body' }).ok).toBe(false);
        expect(parseBrowserAction({ action: 'click', ref: 'button' }).ok).toBe(false);
        expect(parseBrowserAction({ action: 'click' })).toMatchObject({ ok: false, error: expect.stringMatching(/needs "ref"/) });
    });

    it('type needs its text, keeps submit, and a common synonym is understood', () => {
        expect(parseBrowserAction({ action: 'fill', ref: 'e5', text: 'Younes', submit: true }))
            .toEqual({ ok: true, value: { action: 'type', ref: 'e5', text: 'Younes', submit: true } });
        expect(parseBrowserAction({ action: 'type', ref: 'e5' }).ok).toBe(false);
        expect(parseBrowserAction({ action: 'select', ref: 'e6', value: 'Large' })).toEqual({ ok: true, value: { action: 'select', ref: 'e6', value: 'Large' } });
        expect(parseBrowserAction({ action: 'scroll' })).toEqual({ ok: true, value: { action: 'scroll', direction: 'down' } });
        expect(parseBrowserAction({ action: 'dance' })).toMatchObject({ ok: false, error: expect.stringMatching(/click, type, select, press, scroll, back, reload/) });
    });

    it('the parsed action is what reaches the browser session', async () => {
        const { ctx, acted } = context();
        const parsed = browserActTool.parse({ action: 'press', key: 'Enter' });
        expect(parsed.ok).toBe(true);
        await browserActTool.run((parsed as any).value, ctx);
        expect(acted).toEqual([{ action: 'press', key: 'Enter' }]);
    });

    it('a page that answered 500 is a failure, whichever browser session reported it', async () => {
        const { ctx } = context({ served: [{ port: 5173 }] });
        const plain: BrowserSession = {
            async open(url) { return { ...PAGE, url, status: 500 }; },
            async act() { return PAGE; },
            async screenshot() { return '/tmp/x.jpg'; },
            async close() { /* nothing */ },
        };
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, { ...ctx, browser: () => plain } as ToolContext);
        expect(out.ok).toBe(false);
        expect(out.facts?.page?.status).toBe(500);
    });

    it('the registered tools refuse what is not a ref or not an http address before any browser is touched', async () => {
        const runContext = { sessionId: 'chat-x', userId: 'u', workspaceId: 'w', runId: 'r', projectRoot: '/nowhere' };
        expect(await new EngineBrowserActTool().execute({ action: 'click', ref: 'e1 >> css=body' }, runContext))
            .toMatchObject({ ok: false, error: 'invalid_ref' });
        expect(await new EngineBrowserOpenTool().execute({ url: 'file:///C:/Windows/win.ini' }, runContext))
            .toMatchObject({ ok: false, error: 'invalid_url' });
        expect(await new EngineBrowserOpenTool().execute({ url: 'localhost:5173' }, runContext))
            .toMatchObject({ ok: false, error: 'invalid_url', output: { message: expect.stringMatching(/write it with its scheme, such as http:\/\/localhost:5173/) } });
    });

    it('browser_screenshot returns the image as a file the loop can show a seeing model', async () => {
        const { ctx } = context();
        const out = await browserScreenshotTool.run({ full_page: false }, ctx);
        expect(out.ok).toBe(true);
        expect(out.images).toEqual([{ path: '/tmp/x.jpg', mime: 'image/jpeg' }]);
    });
});

/**
 * Snapshot text exactly as page.ariaSnapshot({ mode: 'ai' }) returned it for a
 * fixture page on Playwright 1.63 (probe run of 2026-10-29), with a password
 * typed into the password field.
 */
const MEASURED = [
    '- generic [active] [ref=e1]:',
    '  - heading "Fixture Shop" [level=1] [ref=e2]',
    '  - paragraph [ref=e3]: Welcome to the fixture. مرحبا بكم',
    '  - generic [ref=e4]:',
    '    - text: Name',
    '    - textbox "Name" [active] [ref=e5]:',
    '      - /placeholder: Your name',
    '      - text: Younes',
    '    - textbox "Password" [ref=e19]: hunter2 secret',
    '    - combobox "Size" [ref=e6]:',
    '      - option "Small"',
    '      - option "Large" [selected]',
    '    - generic [ref=e7]:',
    '      - checkbox "I agree" [checked] [ref=e8]',
    '      - text: I agree',
    '    - button "Save" [disabled] [ref=e10]',
    '  - button "Add item" [ref=e11]',
    '  - list [ref=e15]:',
    '    - listitem [ref=e16]: Item 1',
    '  - link "Second page" [ref=e12] [cursor=pointer]:',
    '    - /url: /second',
    '  - generic [ref=e13] [cursor=pointer]: Clickable div',
    '  - group [ref=e20]:',
    '    - generic "More" [ref=e21]',
    '  - spinbutton "Qty" [ref=e22]: "3"',
    '  - \'button "Save: draft" [ref=e23]\'',
    '  - iframe [ref=e14]:',
    '    - button "In frame" [ref=f1e2]',
].join('\n');

describe('the accessibility snapshot becomes the element list', () => {
    const lines = elementsFromSnapshot(MEASURED, ['hunter2  secret']);

    it('lists every interactive element by its ref, with what a user would see of it', () => {
        expect(lines).toEqual([
            '[e5] textbox "Name" value "Younes" placeholder "Your name"',
            '[e19] textbox "Password" value (hidden: a password is filled in)',
            '[e6] combobox "Size" options: "Small", "Large" (selected)',
            '[e8] checkbox "I agree" (checked)',
            '[e10] button "Save" (disabled)',
            '[e11] button "Add item"',
            '[e12] link "Second page" → /second',
            '[e13] generic "Clickable div"',
            '[e21] generic "More"',
            '[e22] spinbutton "Qty" value "3"',
            '[e23] button "Save: draft"',
            '[f1e2] button "In frame"',
        ]);
    });

    it('never shows a password, however the snapshot folded its spaces', () => {
        expect(lines.join('\n')).not.toMatch(/hunter2/);
        expect(elementsFromSnapshot(MEASURED, []).join('\n')).toMatch(/hunter2/);
    });

    it('headings, paragraphs and list items are text, not elements', () => {
        expect(lines.join('\n')).not.toMatch(/heading|paragraph|listitem/);
    });
});

/**
 * The panel page carries the owner's own sign-ins, and its tab history holds
 * whatever he looked at before the run. What a redirect, a link, a script or
 * `back` lands on is judged by the same rule as what may be opened, by site:
 * a loopback port this run serves, or a site the request names.
 */
describe('what the page lands on is shown only when it is the run\'s own or the user\'s', () => {
    function landing(url: string, opts: { request?: string; served?: Partial<ProcessInfo>[] } = {}) {
        const c = context(opts);
        const session: BrowserSession = {
            async open() { return { ...PAGE, url, title: 'Owner Mail', text: 'Private inbox', elements: ['[e2] button "Reply"'], screenshotPath: '/tmp/mail.jpg' }; },
            async act() { return { ...PAGE, url, title: 'Owner Mail', text: 'Private inbox', elements: ['[e2] button "Reply"'], screenshotPath: '/tmp/mail.jpg' }; },
            async screenshot() { return '/tmp/mail.jpg'; },
            async close() { /* nothing */ },
        };
        return { ...c.ctx, browser: () => session } as ToolContext;
    }

    it('a redirect or a link to another site hides the page: no text, no elements, no image', async () => {
        const ctx = landing('https://mail.example.org/inbox?token=abc', { served: [{ port: 5173 }] });
        for (const out of [
            await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, ctx),
            await browserActTool.run({ action: 'click', ref: 'e2' }, ctx),
        ]) {
            expect(out.ok).toBe(false);
            expect(out.output).toBe('The page is now at https://mail.example.org/inbox, which is not an address this run serves or the request gives, so Joe does not show what it holds. Go back with browser_act {"action": "back"}, or open this run\'s own address with browser_open.');
            expect(out.images).toBeUndefined();
            expect(out.facts?.page).toMatchObject({ url: 'https://mail.example.org/inbox', textLength: 0, consoleErrors: [], failedRequests: [] });
        }
    });

    it('the run\'s own ports and the sites the request names are shown, a redirect to www or a subdomain included', () => {
        const ctx = context({ request: 'Summarise https://example.com/docs please', served: [{ url: 'http://localhost:5173/' }] }).ctx;
        expect(pagePolicy('http://127.0.0.1:5173/cart', ctx).ok).toBe(true);
        expect(pagePolicy('http://[::1]:5173/', ctx).ok).toBe(true);
        expect(pagePolicy('https://www.example.com/docs/', ctx).ok).toBe(true);
        expect(pagePolicy('https://docs.example.com/a', ctx).ok).toBe(true);
        expect(pagePolicy('about:blank', ctx).ok).toBe(true);
        expect(pagePolicy('chrome-error://chromewebdata/', ctx).ok).toBe(true);
        expect(pagePolicy('http://127.0.0.1:3000/', ctx).ok).toBe(false);
        expect(pagePolicy('https://example.com.evil.net/', ctx).ok).toBe(false);
        expect(pagePolicy('https://notexample.com/', ctx).ok).toBe(false);
        expect(pagePolicy('http://169.254.169.254/latest', context({ request: 'see http://169.254.169.254/latest' }).ctx).ok).toBe(false);
        expect(pagePolicy('file:///C:/Windows/win.ini', ctx).ok).toBe(false);
    });

    it('a screenshot of a page that moved away is not shown either', async () => {
        const c = context({ served: [{ port: 5173 }] });
        const session = {
            async open() { return PAGE; }, async act() { return PAGE; },
            async screenshot() { return '/tmp/mail.jpg'; },
            async capture() { return { path: '/tmp/mail.jpg', url: 'http://127.0.0.1:9999/', fullPage: false }; },
            async close() { /* nothing */ },
        };
        const out = await browserScreenshotTool.run({ full_page: false }, { ...c.ctx, browser: () => session } as unknown as ToolContext);
        expect(out.ok).toBe(false);
        expect(out.output).toMatch(/^The page is now at http:\/\/127\.0\.0\.1:9999\/, which is not an address this run serves/);
        expect(out.images).toBeUndefined();
    });
});

describe('the run\'s browser session speaks for the run', () => {
    const VIEW = {
        url: 'http://127.0.0.1:5173/', status: 200, statusText: 'OK', title: 'Shop', text: 'Shop', textLength: 4, textCut: 0,
        elements: [], elementCount: 0, elementSource: 'aria', consoleErrors: [], consoleWarnings: [], pageErrors: [], failedRequests: [],
        dialogs: [], popups: [], omitted: { consoleErrors: 0, consoleWarnings: 0, pageErrors: 0, failedRequests: 0, dialogs: 0 },
    };

    it('the run id, the project folder and the run\'s cancellation reach the registered tool', async () => {
        const seen: any[] = [];
        gateway.mockImplementation(async (_name: string, _input: any, context: any) => { seen.push(context); return { ok: true, output: { message: 'Opened.', view: VIEW } }; });
        let aborted = false;
        let cancel: () => void = () => { /* set below */ };
        const cancelled = new Promise<void>(r => { cancel = r; });
        const session = createBrowserSession({ sessionId: 'chat-1', userId: 'u1', workspaceId: 'w1' });
        await session.open('http://127.0.0.1:5173/', { runId: 'run-77', projectDir: '/work/shop', cancelled, isCancelled: () => aborted });
        expect(seen[0]).toMatchObject({ sessionId: 'chat-1', userId: 'u1', workspaceId: 'w1', runId: 'run-77', projectRoot: '/work/shop' });
        expect(seen[0].isCancelled()).toBe(false);
        aborted = true;
        expect(seen[0].isCancelled()).toBe(true);
        let settled = false;
        void seen[0].cancellation.then(() => { settled = true; });
        cancel();
        await new Promise(r => setImmediate(r));
        expect(settled).toBe(true);
    });

    it('what Joe\'s own context names wins over the engine\'s copy', async () => {
        const seen: any[] = [];
        gateway.mockImplementation(async (_n: string, _i: any, context: any) => { seen.push(context); return { ok: true, output: { message: 'Opened.', view: VIEW } }; });
        const session = createBrowserSession({ sessionId: 'chat-1', userId: 'u1', runId: 'run-joe', projectRoot: '/joe/root' });
        await session.open('http://127.0.0.1:5173/', { runId: 'run-77', projectDir: '/work/shop', cancelled: new Promise<void>(() => { /* never */ }), isCancelled: () => false });
        expect(seen[0]).toMatchObject({ runId: 'run-joe', projectRoot: '/joe/root' });
    });

    it('a call the run\'s Stop cut short is said as a stop, not as a broken browser', async () => {
        gateway.mockResolvedValue({ ok: false, error: 'run_cancelled_by_owner', logs: [] });
        const { ctx } = context({ served: [{ port: 5173 }] });
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, { ...ctx, browser: () => createBrowserSession({ runId: 'r1' }) } as ToolContext);
        expect(out).toEqual({ ok: false, output: 'browser_open was stopped: the run was cancelled.' });
    });
});

describe('a view cut for the model is kept whole in the run\'s folder', () => {
    let project = '';
    beforeAll(() => { project = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-browser-pages-')); });
    afterAll(() => { if (project) fs.rmSync(project, { recursive: true, force: true }); });

    function withFull(url: string) {
        const elements = Array.from({ length: 300 }, (_, i) => `[e${i + 1}] button "Row ${i + 1}"`);
        return {
            ...PAGE, url, elements: elements.slice(0, 150), elementCount: 300, textLength: 9000, textCut: 5000, text: 'head\n[… 5000 characters of page text cut here …]\ntail',
            full: { elements, elementsLeftOut: 0, text: `head ${'x'.repeat(8990)} tail`, textLeftOut: 0 },
        };
    }

    function ctxAt(url: string, served: Partial<ProcessInfo>[]) {
        const c = context({ served });
        const session: BrowserSession = {
            async open() { return withFull(url) as any; }, async act() { return withFull(url) as any; },
            async screenshot() { return '/tmp/x.jpg'; }, async close() { /* nothing */ },
        };
        return { ...c.ctx, projectDir: project, stateDir: path.join(project, '.joe'), browser: () => session } as ToolContext;
    }

    it('names the file, which holds every element and the whole text', async () => {
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, ctxAt('http://127.0.0.1:5173/', [{ port: 5173 }]));
        expect(out.ok).toBe(true);
        const m = /The whole view, all 300 elements and the full text, is in (\.joe\/pages\/[0-9a-f]{20}\.txt): read it with file_read\./.exec(out.output);
        expect(m).not.toBeNull();
        const saved = fs.readFileSync(path.join(project, m![1]), 'utf8');
        expect(saved).toContain('[e300] button "Row 300"');
        expect(saved).toContain(`head ${'x'.repeat(8990)} tail`);
        expect(out.output).not.toContain('"Row 300"');
    });

    it('writes nothing for a page that is not shown', async () => {
        const before = fs.existsSync(path.join(project, '.joe', 'pages')) ? fs.readdirSync(path.join(project, '.joe', 'pages')).length : 0;
        const out = await browserOpenTool.run({ url: 'http://127.0.0.1:5173/' }, ctxAt('https://mail.example.org/', [{ port: 5173 }]));
        expect(out.ok).toBe(false);
        const after = fs.existsSync(path.join(project, '.joe', 'pages')) ? fs.readdirSync(path.join(project, '.joe', 'pages')).length : 0;
        expect(after).toBe(before);
    });
});
