/**
 * THE ACTIVITY TAB OPENS ITSELF WHEN THE ENGINE STARTS, AND STAYS ON SCREEN.
 *
 * Three layers, each driven the way it runs:
 *   - AutoOpenManager is logic, so it is driven with events: the first
 *     engine_step of a run opens Activity once, and the engine's own tool
 *     names and notes no longer pull the workspace to another tab.
 *   - The layout and the workspace are mounted for real in a DOM, with their
 *     children and transports as stand-ins: the layout opens the tab for the
 *     conversation on screen only, keeps it when the run ends, lets no
 *     streamed file or engine browser step take it away, and gives the next
 *     run a clean slate; the workspace offers the tab and keeps its panel
 *     mounted, one per conversation.
 *   - The dictionary is read as text, because that is what it is: every word
 *     the panel shows exists in every language the interface offers.
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

describe('AutoOpenManager opens Activity on the engine’s first step', () => {
    it('opens it once per run, naming the conversation and the run, as a stated intent', () => {
        expect(opened([step('run-a1', 1), step('run-a1', 2), step('run-a1', 3)])).toEqual([
            ['activity', expect.objectContaining({ reason: 'engine_run', sessionId: 'chat-1', runId: 'run-a1', step: 1 })],
        ]);
        //  The next run opens it again, even after he chose another tab in between.
        expect(opened([step('run-a2', 1)]).map(([p]) => p)).toEqual(['activity']);
        //  A step with no run cannot be told apart from the next one, so it opens nothing.
        expect(opened([{ type: 'engine_step', sessionId: 'chat-1', data: { step: 1 } }])).toEqual([]);
    });

    it('lets the server name the Activity tab like any other panel', () => {
        expect(opened([{ type: 'panel_focus', sessionId: 'chat-1', data: { panel: 'activity', reason: 'engine_run', sessionId: 'chat-1' } }]))
            .toEqual([['activity', expect.objectContaining({ reason: 'engine_run' })]]);
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

describe('the layout opens Activity for the conversation on screen, and keeps it', () => {
    it('opens it on the engine’s first step of this conversation, and never for another one', async () => {
        const layout = await mountLayout('chat-1');
        try {
            expect(layout.tab()).toBe('logs');
            expect(layout.canvasOpen()).toBe(false);
            //  A run in another conversation, and a step that names no conversation, take nothing.
            await layout.step(step('run-other', 1, 'chat-2'));
            await layout.step({ type: 'engine_step', id: 'engine-run-x-1', runId: 'run-x', data: { step: 1, runId: 'run-x' } });
            expect(layout.tab()).toBe('logs');
            expect(layout.canvasOpen()).toBe(false);
            //  This conversation's run opens the tab and the canvas.
            await layout.step(step('run-mine', 1, 'chat-1'));
            expect(layout.tab()).toBe('activity');
            expect(layout.canvasOpen()).toBe(true);
        } finally { await layout.close(); }
    }, MOUNT_TIMEOUT);

    it('keeps Activity when the run ends, lets no streamed file take it, and gives the next run a clean slate', async () => {
        const layout = await mountLayout('chat-1');
        const streamed = (runId: string, file: string) =>
            ({ type: 'file_stream', sessionId: 'chat-1', runId, data: { file, chunk: 'x', done: true, sessionId: 'chat-1', runId } });
        try {
            await layout.send({ type: 'run_started', sessionId: 'chat-1', runId: 'run-1', data: { sessionId: 'chat-1', runId: 'run-1' } });
            await layout.step(step('run-1', 1, 'chat-1'));
            expect(layout.tab()).toBe('activity');
            //  A file the engine wrote streams in: the stated intent outranks it.
            await layout.send(streamed('run-1', 'src/App.tsx'));
            expect(layout.tab()).toBe('activity');
            //  The run ends. Activity now holds the verdict, so it stays on screen.
            await layout.setBusy(false);
            await layout.graceElapses();
            expect(layout.tab()).toBe('activity');
            expect(layout.canvasOpen()).toBe(true);

            //  The next run states its own intent; until it does, a streamed file
            //  may show its Logs, and that transient view folds away when the run ends.
            await layout.setBusy(true);
            await layout.send({ type: 'run_started', sessionId: 'chat-1', runId: 'run-2', data: { sessionId: 'chat-1', runId: 'run-2' } });
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

async function mountWorkspace(sessionId: string) {
    const { dom, restore } = installDom();
    const panels: Array<{ props: any; mounted: boolean }> = [];
    function ActivityStub(props: any) {
        const self = React.useRef(null);
        if (!self.current) { self.current = { props, mounted: true }; panels.push(self.current); }
        self.current.props = props;
        React.useEffect(() => () => { self.current.mounted = false; }, []);
        return React.createElement('div', { 'data-activity': props.sessionId });
    }
    const Workspace = evaluate(web('components', 'WorkspacePanel.tsx'), {
        react: React, 'react-i18next': i18n, 'lucide-react': icon, '../lib/plainText': plainText,
        './ErrorBoundary': { ErrorBoundary: pass },
        './terminal/EnterpriseTerminalPanel': { __esModule: true, default: Null },
        './EmbeddedBrowser': { __esModule: true, default: Null },
        './PreviewPanel': { __esModule: true, default: Null },
        './RunActivityPanel': { __esModule: true, default: ActivityStub },
    }).default;
    function Host({ sid }: { sid: string }) {
        const [tab, setTab] = React.useState('logs');
        return React.createElement(Workspace, { sessionId: sid, activeTab: tab, onTabChange: setTab, mobileCollapsed: false });
    }
    const { createRoot } = loadWeb('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root'));
    const act = React.act;
    const render = async (sid: string) => { await act(async () => { root.render(React.createElement(Host, { sid })); await settle(); await settle(); }); };
    await render(sessionId);
    const tabButton = (label: string) => dom.window.document.querySelector(`button.joe-workspace-tab[aria-label="${label}"]`);
    return {
        panels, tabButton, render,
        async click(el: Element) { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle(); }); },
        async close() {
            try { await act(async () => { root.unmount(); }); } finally { restore(); }
        },
    };
}

describe('the workspace offers Activity and keeps its panel', () => {
    it('offers the tab, mounts the panel before it is shown, keeps it while hidden, and gives each conversation its own', async () => {
        const ws = await mountWorkspace('chat-1');
        try {
            const tab = ws.tabButton('act_title');
            expect(tab).not.toBeNull();
            //  Mounted from the start, behind the Logs tab, so no live step is lost.
            expect(ws.panels.map(p => [p.props.sessionId, p.props.active, p.mounted])).toEqual([['chat-1', false, true]]);

            await ws.click(tab!);
            expect(ws.tabButton('act_title')?.getAttribute('aria-pressed')).toBe('true');
            expect(ws.panels.map(p => [p.props.sessionId, p.props.active, p.mounted])).toEqual([['chat-1', true, true]]);

            //  Another tab hides it; it is the same panel, still mounted, when it comes back.
            await ws.click(ws.tabButton('Logs')!);
            await ws.click(ws.tabButton('act_title')!);
            expect(ws.panels).toHaveLength(1);
            expect(ws.panels[0]).toMatchObject({ mounted: true, props: { active: true } });

            //  Another conversation is another panel.
            await ws.render('chat-2');
            expect(ws.panels.map(p => [p.props.sessionId, p.mounted])).toEqual([['chat-1', false], ['chat-2', true]]);
        } finally { await ws.close(); }
    }, MOUNT_TIMEOUT);
});

describe('every word of the panel is in every language', () => {
    it('says every word of the panel in every language the interface offers', () => {
        const dictionary = read('i18n.ts');
        const marks = ['en', 'ar', 'fr', 'de', 'ru', 'es'].map(l => ({ l, at: dictionary.indexOf(`\n  ${l}: {`) }));
        expect(marks.every(m => m.at > 0)).toBe(true);
        const blocks = marks.map((m, i) => ({ l: m.l, text: dictionary.slice(m.at, i + 1 < marks.length ? marks[i + 1].at : undefined) }));
        const source = read('components', 'RunActivityPanel.tsx') + read('components', 'WorkspacePanel.tsx');
        const keys = new Set<string>([...source.matchAll(/t\('(act_[A-Za-z_]+)'/g)].map(m => m[1]));
        for (const m of source.matchAll(/'(act_note_[a-z]+)'/g)) keys.add(m[1]);
        //  The keys the panel builds from a value: one per value the reducer can hold.
        for (const v of ['created', 'modified', 'deleted', 'written']) keys.add(`act_change_${v}`);
        for (const v of ['delivered', 'failed', 'cancelled']) keys.add(`act_status_${v}`);
        for (const v of ['passed', 'failed', 'skipped']) keys.add(`act_check_${v}`);
        expect(keys.size).toBeGreaterThan(40);
        const missing: string[] = [];
        for (const key of keys) {
            for (const b of blocks) if (!new RegExp(`\\n\\s+${key}: ['"]`).test(b.text)) missing.push(`${b.l}.${key}`);
        }
        expect(missing).toEqual([]);
    });
});
