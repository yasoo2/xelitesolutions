/**
 * WHAT THE ENGINE DOES IS DRAWN INSIDE JOE'S REPLY, NOT IN A TAB.
 *
 * The owner, 2026-11-02: «احنا اتفقنا انه يكون داخله جوا وليس في قائمة
 * عائمة». The Activity tab used to open itself beside the chat on the
 * engine's first step; the same panel now lives in the conversation
 * (RunActivityPanel, inline): live under the plan while Joe works, and under
 * each reply for its own run. Its behaviour inline is proven where the panel
 * is mounted (the-activity-panel-draws-what-the-engine-did).
 *
 * Here, each layer driven the way it runs:
 *   - AutoOpenManager is logic, driven with events: the engine's steps open
 *     no panel, and its own tool names and notes still never pull the
 *     workspace to another tab.
 *   - The layout and the workspace are mounted for real in a DOM, with their
 *     children and transports as stand-ins: the engine's steps leave the
 *     workspace where it was, the workspace offers no Activity tab, and a
 *     streamed file's transient Logs still folds away when the run ends.
 *   - The chat's wiring is read as text: the live line and the reply's line.
 *   - The dictionary is read as text: every word the panel shows exists in
 *     every language the interface offers.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import { AutoOpenManager } from '../../../web/src/services/AutoOpenManager';

const repository = path.resolve(__dirname, '../../..');
const WEB = path.join(repository, 'web', 'src');
const web = (...p: string[]) => path.join(WEB, ...p);
const read = (...p: string[]) => fs.readFileSync(web(...p), 'utf-8');

//  As in joe-run-history-recovery: Node's own loader for the installed UI
//  packages, so React and the DOM run as they do in a browser build.
const apiModules = fs.realpathSync(path.join(repository, 'api/node_modules'));
const webModules = path.join(path.dirname(path.dirname(apiModules)), 'web/node_modules');
const { createRequire } = process.getBuiltinModule('module') as typeof import('module');
const nativeGlobal = (process.getBuiltinModule('vm') as typeof import('vm')).runInThisContext('globalThis');
const loadApi = createRequire(path.join(apiModules, 'jsdom/package.json'));
const loadWeb = createRequire(path.join(webModules, 'react/package.json'));

//  Compiling the layout and mounting React takes seconds on a busy laptop;
//  the default 10 s budget measured the machine, not the tab.
const MOUNT_TIMEOUT = 120_000;

let quiet: jest.SpyInstance;
beforeAll(() => { quiet = jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => quiet.mockRestore());

/** Every panel AutoOpenManager asks the layout to open while these events pass. */
function opened(events: any[]): Array<[string, any]> {
    const seen: Array<[string, any]> = [];
    const off = AutoOpenManager.subscribe((panel, data) => { seen.push([panel, data]); });
    try { for (const e of events) AutoOpenManager.processStepEvent(e); } finally { off(); }
    return seen;
}

const step = (runId: string, n: number, sessionId = 'chat-1') =>
    ({ type: 'engine_step', id: `engine-${runId}-${n}`, sessionId, runId, data: { step: n, sessionId, runId } });

describe('AutoOpenManager opens no panel for the engine', () => {
    it('opens nothing on the engine’s steps: they are drawn in the chat', () => {
        expect(opened([step('run-a1', 1), step('run-a1', 2), step('run-a1', 3)])).toEqual([]);
        expect(opened([step('run-a2', 1)])).toEqual([]);
        //  There is no Activity panel to name, even by the server.
        expect(opened([{ type: 'panel_focus', sessionId: 'chat-1', data: { panel: 'activity', reason: 'engine_run', sessionId: 'chat-1' } }]))
            .toEqual([]);
    });

    it('never lets the engine’s own tools or notes pull the tab to the browser, while everyone else’s still do', () => {
        opened([step('run-e', 1)]);
        const engineEvents = [
            //  ToolService announces every engine action under its registered name.
            { type: 'tool_started', sessionId: 'chat-1', runId: 'run-e', data: { tool: 'engine_browser_open', input: { url: 'http://127.0.0.1:5173/' } } },
            { type: 'tool_started', sessionId: 'chat-1', runId: 'run-e', data: { tool: 'engine_shell_run' } },
            //  The engine's model writes «browser» in its notes all the time.
            { type: 'thinking_detail', sessionId: 'chat-1', runId: 'run-e', data: { detail: 'Opening the page in the browser to check the form.' } },
        ];
        expect(opened(engineEvents)).toEqual([]);
        const pipelineEvents = [
            { type: 'tool_started', sessionId: 'chat-1', runId: 'run-p', data: { tool: 'browser_navigate' } },
            { type: 'thinking_detail', sessionId: 'chat-1', runId: 'run-p', data: { detail: 'Checking the result using the browser' } },
        ];
        expect(opened(pipelineEvents).map(([p]) => p)).toEqual(['browser', 'browser']);
    });
});

/* ───────────────────────── the real layout and workspace ───────────────────────── */

const React = loadWeb('react');
const { JSDOM } = loadApi('jsdom');

function evaluate(file: string, imports: Record<string, any>, globals: Record<string, any> = {}) {
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: file,
    }).outputText;
    const required = [...new Set(Array.from(compiled.matchAll(/\brequire\(["']([^"']+)["']\)/g), m => m[1]))];
    const missing = required.filter(id => !Object.prototype.hasOwnProperty.call(imports, id));
    if (missing.length) throw new Error(`Missing test imports for ${path.basename(file)}: ${missing.join(', ')}`);
    const exports: any = {};
    const context = {
        exports, require: (id: string) => imports[id], console,
        window: (global as any).window, document: (global as any).document, navigator: (global as any).navigator,
        localStorage: (global as any).localStorage, Event: (global as any).window?.Event, CustomEvent: (global as any).window?.CustomEvent,
        setTimeout, clearTimeout, AbortController, Promise,
        ...globals,
    };
    vm.runInNewContext(compiled, context, { filename: file });
    return exports;
}

/**
 * The layout's policy timers (the 2.5 s settle window before a canvas may
 * open itself, the 8 s grace before a transient tab folds away) run a
 * hundred times faster here. Nothing else about time changes: shorter
 * delays, and React's own scheduling, keep their real clock.
 */
const FAST = 100;
const fastTimeout = (fn: (...a: any[]) => void, ms = 0, ...args: any[]) => setTimeout(fn, ms >= 1000 ? Math.ceil(ms / FAST) : ms, ...args);

function installDom() {
    const previous: Array<{ target: any; key: string; descriptor?: PropertyDescriptor }> = [];
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5002/' });
    //  The window's timers are this clock's, so a timer the layout cancels is cancelled.
    (dom.window as any).setTimeout = fastTimeout;
    (dom.window as any).clearTimeout = clearTimeout;
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true })) {
        for (const target of new Set([global, nativeGlobal])) {
            previous.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
            Object.defineProperty(target, key, { configurable: true, writable: true, value });
        }
    }
    const restore = () => {
        dom.window.close();
        previous.reverse().forEach(({ target, key, descriptor }) => {
            if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key];
        });
    };
    return { dom, restore };
}

const icon = new Proxy({}, { get: (_t, name) => (props: any) => React.createElement('i', { 'data-icon': String(name), className: props?.className }) });
const i18n = { useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'ar' } }) };
const Null = () => null;
const pass = (props: any) => props.children ?? null;
const plainText = { logStamp: () => '00:00:00', logTextFor: () => [], stripPictographs: (s: unknown) => String(s ?? ''), uiTime: () => '' };
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

async function mountLayout(sessionId: string) {
    const { dom, restore } = installDom();
    const socketListeners = new Set<(event: any) => void>();
    let busy = true;
    const busyListeners = new Set<(b: boolean) => void>();
    let workspace: any = null;
    const autoOpen = evaluate(web('services', 'AutoOpenManager.ts'), { react: React });
    const imports: Record<string, any> = {
        react: React, 'react-i18next': i18n, 'lucide-react': icon,
        '../lib/plainText': plainText,
        '../services/apiClient': { api: { get: async () => ({}) } },
        '../services/socket': { SocketService: {
            subscribe(cb: (event: any) => void) { socketListeners.add(cb); return () => { socketListeners.delete(cb); }; },
        } },
        '../lib/run-activity': { subscribeRunBusy: (l: (b: boolean) => void) => { busyListeners.add(l); l(busy); return () => { busyListeners.delete(l); }; } },
        '../services/AutoOpenManager': autoOpen,
        '../lib/panel-event-ownership': evaluate(web('lib', 'panel-event-ownership.ts'), {}),
        '../lib/log-restore': evaluate(web('lib', 'log-restore.ts'), {}),
        './ErrorBoundary': { ErrorBoundary: pass },
        './WorkspacePanel': { __esModule: true, default: (props: any) => { workspace = props; return null; } },
        '../styles/joe-premium.css': {}, '../styles/accents.css': {},
    };
    for (const child of ['JoeHeader', 'TodosPanel', 'ChatPanel', 'FileExplorerPanel', 'GitHubPanel', 'SessionsBar', 'CommandPalette']) {
        imports[`./${child}`] = { __esModule: true, default: Null };
    }
    const Layout = evaluate(web('components', 'JoeIDELayout.tsx'), imports, { setTimeout: fastTimeout }).default;
    //  Controlled, as Joe.tsx drives it: the page owns the tab.
    function Host({ sid }: { sid: string }) {
        const [tab, setTab] = React.useState('logs');
        return React.createElement(Layout, { messages: [], inputValue: '', onInputChange() {}, onSend() {}, sessionId: sid, workspaceTab: tab, onWorkspaceTabChange: setTab });
    }
    const { createRoot } = loadWeb('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root'));
    const act = React.act;
    await act(async () => { root.render(React.createElement(Host, { sid: sessionId })); await settle(); });
    //  Past the settle window: from here on a canvas may open itself.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 60)); });
    const browserTabRequests: number[] = [];
    dom.window.addEventListener('joe:open-browser-tab', () => browserTabRequests.push(Date.now()));
    let n = 0;
    return {
        tab: () => workspace?.activeTab,
        canvasOpen: () => workspace?.mobileCollapsed === false,
        browserTabRequests,
        async step(event: any) { await act(async () => { autoOpen.AutoOpenManager.processStepEvent(event); await settle(); }); },
        async send(event: any) {
            n += 1;
            await act(async () => { socketListeners.forEach(cb => cb({ ts: 1_700_000_000_000 + n, ...event })); await settle(); });
        },
        async setBusy(on: boolean) { await act(async () => { busy = on; busyListeners.forEach(l => l(on)); await settle(); }); },
        /** Longer than the layout's (fast) eight-second grace period. */
        async graceElapses() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 8000 / FAST + 120)); }); },
        async close() {
            try { await act(async () => { root.unmount(); }); } finally { restore(); }
        },
    };
}

describe('the layout leaves the workspace where it was when the engine works', () => {
    it('the engine’s steps, of this conversation or another, open no tab and no canvas', async () => {
        const layout = await mountLayout('chat-1');
        try {
            expect(layout.tab()).toBe('logs');
            expect(layout.canvasOpen()).toBe(false);
            await layout.step(step('run-other', 1, 'chat-2'));
            await layout.step(step('run-mine', 1, 'chat-1'));
            await layout.step(step('run-mine', 2, 'chat-1'));
            expect(layout.tab()).toBe('logs');
            expect(layout.canvasOpen()).toBe(false);
        } finally { await layout.close(); }
    }, MOUNT_TIMEOUT);

    it('a streamed file still shows its Logs for a moment, and that view folds away when the run ends', async () => {
        const layout = await mountLayout('chat-1');
        const streamed = (runId: string, file: string) =>
            ({ type: 'file_stream', sessionId: 'chat-1', runId, data: { file, chunk: 'x', done: true, sessionId: 'chat-1', runId } });
        try {
            await layout.send({ type: 'run_started', sessionId: 'chat-1', runId: 'run-2', data: { sessionId: 'chat-1', runId: 'run-2' } });
            await layout.step(step('run-2', 1, 'chat-1'));
            await layout.send(streamed('run-2', 'index.html'));
            expect(layout.tab()).toBe('logs');
            await layout.setBusy(false);
            await layout.graceElapses();
            expect(layout.canvasOpen()).toBe(false);
        } finally { await layout.close(); }
    }, MOUNT_TIMEOUT);

    it('lets no engine browser step pull the tab to the Browser, while a pipeline browser step still does', async () => {
        const layout = await mountLayout('chat-1');
        try {
            await layout.send({ type: 'step_started', id: 'engine-run-1-5', sessionId: 'chat-1', runId: 'run-1',
                data: { name: 'engine:browser_open', callId: 'c1', input: '{"url":"http://127.0.0.1:5173/"}', sessionId: 'chat-1', runId: 'run-1' } });
            expect(layout.browserTabRequests).toHaveLength(0);
            await layout.send({ type: 'step_started', sessionId: 'chat-1', runId: 'run-2', data: { name: 'execute:browser_navigate', sessionId: 'chat-1', runId: 'run-2' } });
            expect(layout.browserTabRequests).toHaveLength(1);
        } finally { await layout.close(); }
    }, MOUNT_TIMEOUT);
});

async function mountWorkspace(sessionId: string, options: { tab?: string; liveSource?: string | null } = {}) {
    const { dom, restore } = installDom();
    /**
     * The live view of a device (2026-11-08) is the real LiveDevicePanel, not
     * a stand-in: the Preview shows the phone or this computer while Joe works
     * it. Its only outside call is the screen route, answered here as «no
     * phone plugged in», so the case also sees what it tells the owner then.
     */
    const screenAsks: string[] = [];
    const screenFetch = async (url: unknown) => {
        screenAsks.push(String(url));
        return { ok: false, json: async () => ({ code: 'no_phone' }) };
    };
    const liveDevice = evaluate(web('components', 'LiveDevicePanel.tsx'), {
        react: React, 'react-i18next': i18n, 'lucide-react': icon, '../config': { API_URL: '/api' },
    }, { React, fetch: screenFetch, setInterval, clearInterval });
    const Workspace = evaluate(web('components', 'WorkspacePanel.tsx'), {
        react: React, 'react-i18next': i18n, 'lucide-react': icon, '../lib/plainText': plainText,
        './ErrorBoundary': { ErrorBoundary: pass },
        './NeuralTraceView': { useUiDir: () => 'ltr' },
        './terminal/EnterpriseTerminalPanel': { __esModule: true, default: Null },
        './EmbeddedBrowser': { __esModule: true, default: Null },
        './PreviewPanel': { __esModule: true, default: Null },
        './LiveDevicePanel': liveDevice,
    }).default;
    function Host({ sid, liveSource }: { sid: string; liveSource: string | null }) {
        const [tab, setTab] = React.useState(options.tab || 'logs');
        return React.createElement(Workspace, { sessionId: sid, activeTab: tab, onTabChange: setTab, mobileCollapsed: false, liveSource, onLiveClose() { /* the page owns it */ } });
    }
    const { createRoot } = loadWeb('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root'));
    const act = React.act;
    const render = async (sid: string, liveSource: string | null = options.liveSource ?? null) => {
        await act(async () => { root.render(React.createElement(Host, { sid, liveSource })); await settle(); await settle(); });
    };
    await render(sessionId);
    const tabButton = (label: string) => dom.window.document.querySelector(`button.joe-workspace-tab[aria-label="${label}"]`);
    return {
        tabButton, render, screenAsks,
        tabLabels: () => Array.from(dom.window.document.querySelectorAll('button.joe-workspace-tab')).map((b: any) => b.getAttribute('aria-label')),
        text: () => String(dom.window.document.body.textContent || ''),
        async click(el: Element) { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle(); }); },
        async close() {
            try { await act(async () => { root.unmount(); }); } finally { restore(); }
        },
    };
}

describe('the workspace offers no Activity tab', () => {
    it('its tabs are the workspace’s own: the activity is in the chat', async () => {
        const ws = await mountWorkspace('chat-1');
        try {
            expect(ws.tabButton('wsp_tabLogs')).not.toBeNull();
            expect(ws.tabButton('act_title')).toBeNull();
            //  The workspace loads no Activity panel at all (its imports are given above, and it asks for none).
            expect(read('components', 'WorkspacePanel.tsx')).not.toMatch(/import\(['"]\.\/RunActivityPanel['"]\)|from ['"]\.\/RunActivityPanel['"]/);
        } finally { await ws.close(); }
    }, MOUNT_TIMEOUT);

    /**
     * The owner, 2026-11-08: «on the same preview, no more menus». A device
     * Joe works is shown live INSIDE the Preview, asked at its own route —
     * never a tab of its own, and nothing asked once the device is let go.
     */
    it('a device Joe works is shown live in the Preview, at its own route, with no tab of its own', async () => {
        const ws = await mountWorkspace('chat-1', { tab: 'preview', liveSource: 'phone' });
        try {
            expect(ws.tabLabels()).toEqual(['panelBrowser', 'panelTerminal', 'panelPreview', 'wsp_tabLogs']);
            expect(ws.screenAsks[0]).toBe('/api/devices/phone/screen');
            expect(ws.text()).toContain('dev_noPhone');              // said plainly: no phone is plugged in
            await ws.render('chat-1', 'computer');
            expect(ws.screenAsks[ws.screenAsks.length - 1]).toBe('/api/devices/computer/screen');
            expect(ws.screenAsks.every(u => u === '/api/devices/phone/screen' || u === '/api/devices/computer/screen')).toBe(true);
            expect(ws.tabLabels()).toEqual(['panelBrowser', 'panelTerminal', 'panelPreview', 'wsp_tabLogs']);
            await ws.render('chat-1', null);
            const asked = ws.screenAsks.length;
            await new Promise(resolve => setTimeout(resolve, 80));
            expect(ws.screenAsks.length).toBe(asked);
            expect(ws.text()).not.toContain('dev_noPhone');
        } finally { await ws.close(); }
    }, MOUNT_TIMEOUT);
});

describe('the chat draws the activity inside Joe’s reply', () => {
    it('live under the plan while Joe works, and under each reply for its own run, each in its own boundary', () => {
        const chat = read('components', 'ChatPanel.tsx');
        //  Live: in the dock, right after the plan credits.
        expect(chat).toMatch(/<PlanCredits sessionId=\{sessionId\} \/>[\s\S]{0,400}<RunActivityPanel variant="inline" sessionId=\{sessionId\} \/>/);
        //  Finished: the last reply of each run carries that run's line.
        expect(chat).toContain('<RunActivityPanel variant="inline" sessionId={sessionId} runId={msg.runId} />');
        expect(chat).toMatch(/for \(const m of messages\) if \(m\.role === 'assistant' && m\.runId\) last\.set\(m\.runId, m\.id\)/);
        //  A failure of the line never takes the conversation with it.
        expect((chat.match(/<ErrorBoundary key=\{`activity/g) || []).length).toBe(2);
        //  The reply knows its run: the history names it.
        expect(read('pages', 'Joe.tsx')).toContain("...(typeof e.runId === 'string' && e.runId ? { runId: e.runId } : {}),");
        //  And nothing opens a tab for it any more.
        expect(read('components', 'JoeIDELayout.tsx')).not.toMatch(/'activity'/);
    });
});

describe('every word of the panel is in every language', () => {
    it('says every word of the panel in every language the interface offers', () => {
        const dictionary = read('i18n.ts');
        const marks = ['en', 'ar', 'fr', 'de', 'ru', 'es'].map(l => ({ l, at: dictionary.indexOf(`\n  ${l}: {`) }));
        expect(marks.every(m => m.at > 0)).toBe(true);
        const blocks = marks.map((m, i) => ({ l: m.l, text: dictionary.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : undefined) }));
        const source = read('components', 'RunActivityPanel.tsx') + read('components', 'ChatPanel.tsx');
        const keys = new Set<string>([...source.matchAll(/t\('(act_[A-Za-z_]+)'/g)].map(m => m[1]));
        for (const m of source.matchAll(/'(act_note_[a-z]+)'/g)) keys.add(m[1]);
        //  The keys the panel builds from a value: one per value the reducer can hold.
        for (const v of ['created', 'modified', 'deleted', 'written']) keys.add(`act_change_${v}`);
        for (const v of ['delivered', 'failed', 'cancelled']) keys.add(`act_status_${v}`);
        for (const v of ['passed', 'failed', 'skipped']) keys.add(`act_check_${v}`);
        //  A check's name is built from the engine's own id (t(`act_inst_${c.id}`)): every
        //  instrument English names, every language names. They reached en and ar only,
        //  so a French owner read «live» and «acceptance» in his verdict (2026-11-08).
        const english = blocks.find(b => b.l === 'en')!.text;
        const instruments = [...english.matchAll(/\n\s+(act_inst_[a-z]+): ['"]/g)].map(m => m[1]);
        expect(instruments.length).toBeGreaterThanOrEqual(12);
        for (const key of instruments) keys.add(key);
        expect(keys.size).toBeGreaterThan(40);
        const missing: string[] = [];
        for (const key of keys) {
            for (const b of blocks) if (!new RegExp(`\\n\\s+${key}: ['"]`).test(b.text)) missing.push(`${b.l}.${key}`);
        }
        expect(missing).toEqual([]);
    });
});
