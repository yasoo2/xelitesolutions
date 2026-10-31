import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

// Execute the actual Joe component/effects. Only UI children and external
// transports are inert; no socket, API, browser process, or model is started.
const repository = path.resolve(__dirname, '../../..');
const apiModules = fs.realpathSync(path.join(repository, 'api/node_modules'));
const webModules = path.join(path.dirname(path.dirname(apiModules)), 'web/node_modules');
// Jest virtualizes imported module.createRequire. Use Node's actual builtin
// loader for installed synchronous ESM dependencies; preload guards stay active.
const { createRequire } = process.getBuiltinModule('module') as typeof import('module');
const nativeGlobal = (process.getBuiltinModule('vm') as typeof import('vm')).runInThisContext('globalThis');
const loadApi = createRequire(path.join(apiModules, 'jsdom/package.json'));
const loadWeb = createRequire(path.join(webModules, 'react/package.json'));
const React = loadWeb('react');
const { JSDOM } = loadApi('jsdom');

function evaluate(file: string, imports: Record<string, any>) {
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: file,
    }).outputText;
    const requiredImports = [...new Set(Array.from(compiled.matchAll(/\brequire\(["']([^"']+)["']\)/g), match => match[1]))];
    const missingImports = requiredImports.filter(id => !Object.prototype.hasOwnProperty.call(imports, id));
    if (missingImports.length) throw new Error(`Missing Joe test imports: ${missingImports.join(', ')}`);
    const exports: any = {};
    const context = {
        exports, require: (id: string) => {
            if (!(id in imports)) throw new Error(`Unexpected Joe test import: ${id}`);
            return imports[id];
        }, console, window: (global as any).window, document: (global as any).document,
        localStorage: (global as any).localStorage, CustomEvent: (global as any).CustomEvent,
        setTimeout, clearTimeout,
    };
    vm.runInNewContext(compiled, context, { filename: file });
    return exports;
}

const helperPath = path.join(repository, 'web/src/lib/run-history-recovery.ts');
const pagePath = path.join(repository, 'web/src/pages/Joe.tsx');
const helper = () => evaluate(helperPath, {});
const prompt = (id: string) => ({ id: `user-${id}`, type: 'user_input', data: { text: `Prompt ${id}` }, ts: 1 });
const answer = (id: string) => ({ id: `answer-${id}`, type: 'text', runId: `run-${id}`, data: { text: `Saved reply ${id}` }, ts: 2 });

async function mountJoe() {
    const previous: Array<{ target: any; key: string; descriptor?: PropertyDescriptor }> = [];
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5002/' });
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
        navigator: dom.window.navigator, localStorage: dom.window.localStorage,
        CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true })) {
        // Native ReactDOM executes in Node's realm, while the component/test
        // executes in Jest's realm. Both must see this same inert DOM.
        for (const target of new Set([global, nativeGlobal])) {
            previous.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
            Object.defineProperty(target, key, { configurable: true, writable: true, value });
        }
    }
    dom.window.matchMedia = () => ({ matches: false } as any);
    dom.window.localStorage.setItem('token', 'test-only');
    const { createRoot } = loadWeb('react-dom/client');
    const subscribers = new Set<() => void>();
    const socketListeners = new Set<(event: any) => void>();
    const snapshotListeners = new Set<(sessions: Set<string>, ids: Map<string, string>) => void>();
    let snapshot = { sessions: new Set<string>(), ids: new Map<string, string>() };
    const persisted: Record<string, any[]> = { A: [prompt('A')], B: [prompt('B'), answer('B')] };
    let state: any;
    const update = (partial: any) => {
        state = { ...state, ...(typeof partial === 'function' ? partial(state) : partial) };
        subscribers.forEach(callback => callback());
    };
    state = { sessions: [], agentSessions: [{ id: 'A', title: 'A' }, { id: 'B', title: 'B' }], selected: null, agentSelected: 'A',
        setSelected: (id: any) => update({ selected: id }), setAgentSelected: (id: any) => update({ agentSelected: id }),
        loadAllSessions: async () => {}, loadFolders: async () => {}, deleteSession: async () => {}, deleteAllSessions: async () => {} };
    const store: any = () => React.useSyncExternalStore((callback: () => void) => {
        subscribers.add(callback); return () => subscribers.delete(callback);
    }, () => state);
    store.getState = () => state;
    store.setState = update;
    const historyReads: string[] = [];
    const deferred: Array<{ sid: string; resolve: (value: any) => void; reject: (error: Error) => void }> = [];
    let holdHistory = false;
    let failNextHistory = false;
    const api = { get: jest.fn(async (endpoint: string) => {
        const match = /^\/sessions\/([^/]+)\/messages$/.exec(endpoint);
        if (match) {
            const sid = match[1]; historyReads.push(sid);
            if (failNextHistory) { failNextHistory = false; throw new Error('controlled_history_read_failure'); }
            if (holdHistory) return new Promise((resolve, reject) => deferred.push({ sid, resolve, reject }));
            return { events: [...persisted[sid]] };
        }
        if (endpoint === '/workspaces') return [{ id: 'test-workspace' }];
        return {};
    }) };
    let layoutProps: any;
    const Null = () => null;
    const imports: Record<string, any> = {
        react: React, 'react-router-dom': { useNavigate: () => () => {} }, 'jwt-decode': { jwtDecode: () => ({ role: 'OWNER' }) },
        '../components/JoeIDELayout': { default: (props: any) => {
            layoutProps = props;
            return React.createElement('div', { 'data-session': props.sessionId }, props.messages.map((m: any) =>
                React.createElement('p', { key: m.id }, m.content)));
        }, __esModule: true },
        '../components/ErrorBoundary': { ErrorBoundary: (props: any) => props.children },
        '../store/sessionStore': { useSessionStore: store }, '../hooks/useSessionActions': { useSessionActions: () => ({ createSession: async () => {} }) },
        '../services/socket': { SocketService: { connect() {}, subscribe(callback: (event: any) => void) {
            socketListeners.add(callback); return () => socketListeners.delete(callback);
        } } },
        '../services/runningSessions': { startTrackingRuns() {}, subscribeRunningSessions(callback: any) {
            snapshotListeners.add(callback); callback(snapshot.sessions, snapshot.ids); return () => snapshotListeners.delete(callback);
        } },
        '../services/apiClient': { api },
        // Joe's mount reads connection readiness; no GitHub transport is loaded.
        '../services/githubService': { githubService: {
            getStatus: async () => ({ connected: false }),
            listRepos: async () => [], getCommits: async () => [],
            disconnect: async () => ({ ok: true, connected: false }),
            connectRepo: async () => ({ ok: false, error: 'inert_history_fixture' }),
        } },
        'react-i18next': { useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }) },
        '../lib/userIdentity': { resolveIdentity: () => ({ name: 'Test' }), isPrivileged: () => false, loadGoogleProfile: async () => null },
        '../config': { API_URL: 'http://unused.invalid/api' }, '../accents': { applyAccent() {} },
        '../lib/preview-routing': { belongsToActiveSession: () => false, shouldOpenPreviewOnReady: () => false },
        '../lib/engineeringReportSummary': { isEngineeringReport: () => false, summarizeEngineeringReport: (text: string) => text },
        '../lib/run-history-recovery': helper(),
    };
    for (const child of ['CommandComposer', 'SettingsDialog', 'GitHubConnectDialog', 'DepartmentStatusCard']) {
        imports[`../components/${child}`] = { default: Null, __esModule: true };
    }
    let root: any;
    const act = React.act;
    const close = async () => {
        try { if (root) await act(async () => { root.unmount(); }); }
        finally {
            dom.window.close();
            previous.reverse().forEach(({ target, key, descriptor }) => {
                if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key];
            });
        }
    };
    try {
        const Joe = evaluate(pagePath, imports).default;
        root = createRoot(dom.window.document.getElementById('root'));
        await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Joe))); });
    }
    catch (error) { await close(); throw error; }
    return {
        persisted, historyReads, deferred,
        text: () => dom.window.document.body.textContent,
        props: () => layoutProps,
        department: () => layoutProps.chatChildren.props.children[0].props.status,
        hold: () => { holdHistory = true; },
        failRead: () => { failNextHistory = true; },
        async poll(rows: Array<[string, string]>) {
            await act(async () => {
                snapshot = { sessions: new Set(rows.map(row => row[0])), ids: new Map(rows) };
                snapshotListeners.forEach(callback => callback(snapshot.sessions, snapshot.ids));
            });
        },
        async event(event: any) { await act(async () => socketListeners.forEach(callback => callback(event))); },
        async select(sid: string) { await act(async () => { update({ agentSelected: sid }); }); },
        async resolveHistory(index: number) {
            await act(async () => { const pending = deferred[index]; pending.resolve({ events: [...persisted[pending.sid]] }); });
        },
        async rejectHistory(index: number) { await act(async () => { deferred[index].reject(new Error('controlled_history_read_failure')); }); },
        close,
    };
}

describe('Joe recovers its visible saved reply after deliberate final socket frame loss', () => {
    it('cancels the socket effect\'s real department timer on unmount', async () => {
        const scheduled = jest.spyOn(global, 'setTimeout');
        const cancelled = jest.spyOn(global, 'clearTimeout');
        let joe: Awaited<ReturnType<typeof mountJoe>> | undefined;
        try {
            joe = await mountJoe();
            await joe.event({ type: 'run_finished', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            const timerIndex = scheduled.mock.calls.findIndex(args => args[1] === 4000);
            expect(timerIndex).toBeGreaterThanOrEqual(0);
            const ownedTimer = scheduled.mock.results[timerIndex].value;
            await joe.close(); joe = undefined;
            expect(cancelled).toHaveBeenCalledWith(ownedTimer);
            // Real time passes after DOM restoration. A leaked callback remains
            // an uncaught failure; the fixture does not catch or suppress it.
            await new Promise(resolve => setTimeout(resolve, 4100));
        } finally {
            if (joe) await joe.close();
            scheduled.mockRestore(); cancelled.mockRestore();
        }
    });

    it.each(['notification', 'session switch'])('an older delayed clear cannot erase the card after a fresh %s', async change => {
        const joe = await mountJoe();
        try {
            await joe.event({ type: 'step_failed', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            const sid = change === 'session switch' ? 'B' : 'A';
            if (sid === 'B') await joe.select('B');
            const current = { stage: 'Dev', status: 'working', label: `Current ${sid} card` };
            await joe.event({ type: 'department_status', sessionId: sid, runId: `run-${sid}`, data: current });
            expect(joe.department()).toBe(current);
            await React.act(async () => { await new Promise(resolve => setTimeout(resolve, 4100)); });
            expect(joe.department()).toBe(current);
            expect(joe.props().sessionId).toBe(sid);
        } finally { await joe.close(); }
    });

    it('refreshes A once on authoritative removal, without reloading or showing B', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A'], ['B', 'run-B']]);
            joe.persisted.A.push(answer('A'));
            const before = joe.historyReads.length;
            // Deliberately deliver neither A text nor A run_finished.
            await joe.poll([['B', 'run-B']]);
            expect(joe.historyReads.slice(before)).toEqual(['A']);
            expect(joe.props().sessionId).toBe('A');
            expect(joe.text()).toContain('Saved reply A');
            expect(joe.text()).not.toContain('Saved reply B');
            await joe.poll([]); await joe.poll([]);
            await joe.event({ type: 'run_finished', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            expect(joe.historyReads.slice(before)).toEqual(['A']);
        } finally { await joe.close(); }
    });

    it.each(['run_cancelled', 'run_failed', 'run_completed'])('recovers after %s when final text and run_finished are both absent', async terminal => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A']]);
            joe.persisted.A.push(answer('A'));
            const before = joe.historyReads.length;
            await joe.event({ type: terminal, sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            await joe.poll([]);
            await joe.poll([]);
            expect(joe.historyReads.slice(before)).toEqual(['A']);
            expect(joe.text()).toContain('Saved reply A');
            expect(joe.text()).not.toContain('Saved reply B');
        } finally { await joe.close(); }
    });

    it('allows a later final event to retry a failed history read', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A']]); joe.persisted.A.push(answer('A'));
            const before = joe.historyReads.length; joe.failRead();
            await joe.poll([]);
            expect(joe.text()).not.toContain('Saved reply A');
            await joe.event({ type: 'run_finished', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            expect(joe.historyReads.slice(before)).toEqual(['A', 'A']);
            expect(joe.text()).toContain('Saved reply A');
            await joe.poll([]);
            expect(joe.historyReads.slice(before)).toEqual(['A', 'A']);
        } finally { await joe.close(); }
    });

    it('retries an early cancellation read that precedes this run\'s saved reply', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A']]); const before = joe.historyReads.length;
            await joe.event({ type: 'run_cancelled', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            await joe.poll([]);
            joe.persisted.A.push(answer('A'));
            await joe.event({ type: 'run_finished', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            expect(joe.historyReads.slice(before)).toEqual(['A', 'A']);
            expect(joe.text()).toContain('Saved reply A');
            expect(joe.text()).not.toContain('Saved reply B');
        } finally { await joe.close(); }
    });

    it('retains a final-event retry arriving during a pending read, without duplicate successful reads', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A']]); joe.persisted.A.push(answer('A')); joe.hold();
            const before = joe.historyReads.length;
            await joe.poll([]);
            await joe.event({ type: 'run_finished', sessionId: 'A', runId: 'run-A', data: { sessionId: 'A' } });
            expect(joe.historyReads.slice(before)).toEqual(['A']);
            await joe.rejectHistory(0);
            expect(joe.historyReads.slice(before)).toEqual(['A', 'A']);
            await joe.resolveHistory(1);
            expect(joe.text()).toContain('Saved reply A');
            expect(joe.text()).not.toContain('Saved reply B');
        } finally { await joe.close(); }
    });

    it('ignores background completion and prevents a delayed A history load overwriting B', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A'], ['B', 'run-B']]);
            const beforeBackground = joe.historyReads.length;
            await joe.poll([['A', 'run-A']]);
            expect(joe.historyReads.length).toBe(beforeBackground);
            joe.persisted.A.push(answer('A')); joe.hold();
            await joe.poll([]);
            await joe.select('B');
            await joe.resolveHistory(1); await joe.resolveHistory(0);
            expect(joe.props().sessionId).toBe('B');
            expect(joe.text()).toContain('Saved reply B');
            expect(joe.text()).not.toContain('Saved reply A');
        } finally { await joe.close(); }
    });

    it('does not overwrite a newer local prompt while the recovery read is pending', async () => {
        const joe = await mountJoe();
        try {
            await joe.poll([['A', 'run-A']]); joe.persisted.A.push(answer('A')); joe.hold();
            await joe.poll([]);
            await joe.event({ type: 'user_input', sessionId: 'A', runId: 'run-new', data: { sessionId: 'A', text: 'Newer prompt' }, id: 'newer' });
            await joe.resolveHistory(0);
            expect(joe.text()).toContain('Newer prompt');
            expect(joe.text()).not.toContain('Saved reply B');
        } finally { await joe.close(); }
    });

    it('requires an identified visible predecessor and never treats a pending/new successor as its removal', () => {
        const { RunHistoryRecovery } = helper(); const recovery = new RunHistoryRecovery();
        expect(recovery.observe('A', new Set(), new Map())).toBeNull();
        expect(recovery.observe('A', new Set(['A']), new Map([['A', 'old']]))).toBeNull();
        expect(recovery.observe('A', new Set(['A']), new Map())).toBeNull();
        expect(recovery.observe('A', new Set(), new Map())).toBeNull();
        recovery.observe('A', new Set(['A']), new Map([['A', 'new']]));
        expect(recovery.observe('B', new Set(), new Map())).toBeNull();
        expect(recovery.observe('A', new Set(), new Map())).toBeNull();
        recovery.observe('A', new Set(['A']), new Map([['A', 'successor']]));
        expect(recovery.observe('A', new Set(), new Map())).toEqual({ sessionId: 'A', runId: 'successor' });
        expect(recovery.claim('A', 'successor')).toBe(true);
        expect(recovery.claim('A', 'successor')).toBe(false);
        recovery.settle('A', 'successor', false);
        expect(recovery.claim('A', 'successor')).toBe(true);
        recovery.settle('A', 'successor', true);
        expect(recovery.claim('A', 'successor')).toBe(false);
        expect(recovery.claim('B', 'successor')).toBe(true);
    });
});
