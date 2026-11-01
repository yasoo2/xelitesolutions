/**
 * THE ACTIVITY PANEL DRAWS WHAT THE ENGINE DID, FOR ITS OWN CONVERSATION ONLY.
 *
 * The reducer has its own tests; this one mounts the real component in a DOM
 * and reads what a person would read. Only the transports are stand-ins: the
 * socket is a list of listeners this test calls, the API answers from a
 * table, and icons are empty elements. The reducer and the screenshot
 * validators are the real ones.
 *
 * What it proves, in the Arabic interface the owner uses:
 *   - a tool call shows its Arabic label beside the tool's own name, with the
 *     command it ran, and opens to its output in a left-to-right block;
 *   - the model's English note is drawn, left to right, inside a
 *     right-to-left panel (the rest of the Arabic interface hides it);
 *   - an event of another conversation, or a displaced run's late frame, is
 *     never drawn;
 *   - a reopened panel restores the session's latest run from its history
 *     and the run's record, and refills events it missed, reading each at
 *     most once;
 *   - a new run, and a new conversation, start an empty panel.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';

const repository = path.resolve(__dirname, '../../..');
const apiModules = fs.realpathSync(path.join(repository, 'api/node_modules'));
const webModules = path.join(path.dirname(path.dirname(apiModules)), 'web/node_modules');
//  As in joe-run-history-recovery: Node's own loader for the installed UI
//  packages, so React and the DOM run as they do in a browser build.
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
    const required = [...new Set(Array.from(compiled.matchAll(/\brequire\(["']([^"']+)["']\)/g), m => m[1]))];
    const missing = required.filter(id => !Object.prototype.hasOwnProperty.call(imports, id));
    if (missing.length) throw new Error(`Missing test imports for ${path.basename(file)}: ${missing.join(', ')}`);
    const exports: any = {};
    const context = {
        exports, require: (id: string) => imports[id], console,
        window: (global as any).window, document: (global as any).document, navigator: (global as any).navigator,
        setTimeout, clearTimeout, AbortController,
    };
    vm.runInNewContext(compiled, context, { filename: file });
    return exports;
}

const web = (...p: string[]) => path.join(repository, 'web', 'src', ...p);
//  Compiling three modules and mounting React takes seconds on a busy laptop;
//  the default 10 s budget measured the machine, not the panel.
const RENDER_TIMEOUT = 120_000;
const RUN = 'run-new';
const ev = (n: number, type: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ type, id: `engine-${RUN}-${n}`, sessionId: 'chat-1', runId: RUN, ts: 1_700_000_000_000 + n * 1000, data: { ...data, sessionId: 'chat-1', runId: RUN }, ...extra });

interface MountOptions {
    /** Whether the Activity tab is on screen when the panel mounts. */
    active?: boolean;
    /** The run the session-running registry names, as a live run does. */
    runningRunId?: string;
}

async function mountPanel(records: Record<string, any>, options: MountOptions = {}) {
    const previous: Array<{ target: any; key: string; descriptor?: PropertyDescriptor }> = [];
    const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:5002/' });
    for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
        IS_REACT_ACT_ENVIRONMENT: true })) {
        for (const target of new Set([global, nativeGlobal])) {
            previous.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
            Object.defineProperty(target, key, { configurable: true, writable: true, value });
        }
    }
    const listeners = new Set<(event: any) => void>();
    //  The session-running registry: which sessions run, and with which run.
    const running = new Set<string>(['chat-1']);
    const runningListeners = new Set<() => void>();
    const reads: string[] = [];
    const api = { get: jest.fn(async (endpoint: string) => {
        reads.push(endpoint);
        if (endpoint in records) return records[endpoint];
        throw new Error('HTTP 404');
    }) };
    const icon = new Proxy({}, { get: (_t, name) => (props: any) => React.createElement('i', { 'data-icon': String(name), className: props?.className }) });
    const screenshots = evaluate(web('components', 'ScreenshotResults.tsx'), {
        react: React, '../services/apiClient': { api }, '../lib/raster-download': { createRasterBlobUrl: () => '', revokeRasterBlobUrl() {} },
    });
    const Panel = evaluate(web('components', 'RunActivityPanel.tsx'), {
        react: React,
        'react-i18next': { useTranslation: () => ({ t: (key: string, o?: any) => (o ? `${key}${JSON.stringify(o)}` : key), i18n: { language: 'ar' } }) },
        'lucide-react': icon,
        '../services/socket': { SocketService: {
            subscribe(cb: (event: any) => void) { listeners.add(cb); return () => { listeners.delete(cb); }; },
            getActiveRunId: () => '',
        } },
        '../services/apiClient': { api },
        '../services/runningSessions': {
            getRunningRunId: (sid: string) => (running.has(sid) ? options.runningRunId || '' : ''),
            isSessionRunning: (sid: string) => running.has(sid),
            subscribeRunningSessions: (cb: any) => {
                const notify = () => cb(new Set(running), new Map());
                runningListeners.add(notify);
                notify();
                return () => { runningListeners.delete(notify); };
            },
        },
        './NeuralTraceView': { useUiDir: () => 'rtl' },
        '../lib/plainText': { stripPictographs: (s: unknown) => String(s ?? '') },
        './ScreenshotResults': screenshots,
        '../lib/activity-feed': evaluate(web('lib', 'activity-feed.ts'), {}),
    }).default;
    const { createRoot } = loadWeb('react-dom/client');
    const root = createRoot(dom.window.document.getElementById('root'));
    const act = React.act;
    const settle = () => new Promise(resolve => setTimeout(resolve, 20));
    const render = async (sessionId: string, active = true) => {
        await act(async () => { root.render(React.createElement(Panel, { sessionId, active })); await settle(); await settle(); });
    };
    await render('chat-1', options.active ?? true);
    return {
        reads,
        doc: dom.window.document,
        text: () => dom.window.document.body.textContent || '',
        render,
        /** The session stops (or starts) running, as the registry announces it. */
        async setRunning(sessionId: string, on: boolean) {
            await act(async () => {
                if (on) running.add(sessionId); else running.delete(sessionId);
                runningListeners.forEach(notify => notify());
                await settle();
            });
        },
        async send(...events: any[]) { await act(async () => { for (const e of events) listeners.forEach(cb => cb(e)); await settle(); }); },
        async wait(ms: number) { await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); await settle(); }); },
        async click(el: Element) { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); await settle(); }); },
        async close() {
            try { await act(async () => { root.unmount(); }); }
            finally {
                dom.window.close();
                previous.reverse().forEach(({ target, key, descriptor }) => {
                    if (descriptor) Object.defineProperty(target, key, descriptor); else delete target[key];
                });
            }
        },
    };
}

const history = {
    '/sessions/chat-1/history': { events: [
        { type: 'user_input', id: 'm1', ts: 5, data: 'build it' },
        { type: 'step_started', runId: 'run-old', ts: 10, data: { name: 'execute:write_file', input: { path: 'old.txt' } } },
        { type: 'step_done', runId: 'run-old', ts: 20, data: { name: 'execute:write_file', result: { ok: true, output: 'saved old.txt' } } },
        { type: 'text', id: 'm2', runId: 'run-old', ts: 50, data: { text: 'done' } },
    ] },
    '/runs/run-old/receipt': { events: [
        { type: 'engine_note', id: 'engine-run-old-1', runId: 'run-old', sessionId: 'chat-1', ts: 30, data: { kind: 'thought', text: 'The old run wrote one file.' } },
    ] },
};

describe('the Activity panel in the Arabic interface', () => {
    it('restores the latest run, draws each call and note, and keeps to its own conversation', async () => {
        const panel = await mountPanel({
            ...history,
            '/runs/run-new/receipt': { events: [ev(6, 'step_started', { name: 'engine:file_read', callId: 'c2', input: '{"path":"src/App.tsx"}' }),
                ev(7, 'step_done', { name: 'engine:file_read', callId: 'c2', durationMs: 20, result: { ok: true, output: 'export default App' } })] },
        });
        try {
            //  Reopened: the history names the latest run; the run's record adds what it said.
            expect(panel.reads).toEqual(['/sessions/chat-1/history', '/runs/run-old/receipt']);
            expect(panel.text()).toContain('write_file');
            expect(panel.text()).toContain('old.txt');
            expect(panel.text()).toContain('The old run wrote one file.');

            //  A new run starts an empty panel.
            await panel.send({ type: 'run_started', id: 'run-1', sessionId: 'chat-1', runId: RUN, ts: 1_700_000_000_000, data: { sessionId: 'chat-1', runId: RUN } });
            expect(panel.text()).not.toContain('The old run wrote one file.');
            expect(panel.text()).toContain('act_empty');

            await panel.send(
                ev(1, 'todo_update', { merge: false, todos: [
                    { id: 'step-1', content: 'Write the page', status: 'in_progress' },
                    { id: 'R1', content: 'R1: نموذج حجز', status: 'pending' },
                ] }),
                ev(2, 'engine_step', { step: 1 }),
                ev(3, 'step_started', { name: 'engine:shell_run', callId: 'c1', input: '{"command":"npm run build"}' }),
                ev(4, 'engine_note', { kind: 'thought', text: 'Build first, then open the page in the browser.' }),
                ev(5, 'step_done', { name: 'engine:shell_run', callId: 'c1', durationMs: 4200, result: { ok: true, output: 'built in 2s' } }),
                ev(6, 'file_stream', { file: 'src/App.tsx', chunk: 'x', done: true, bytes: 9000 }),
            );
            const text = panel.text();
            //  A file's size is said in the interface's language too.
            expect(text).toContain('act_sizeKB{"n":"8.8"}');
            expect(text).toContain('تشغيل أمر');
            expect(text).toContain('shell_run');
            expect(text).toContain('npm run build');
            expect(text).toContain('Write the page');
            expect(text).toContain('R1: نموذج حجز');
            expect(panel.doc.querySelector('section.ra-root')?.getAttribute('dir')).toBe('rtl');
            //  The model's English note is drawn, and it reads left to right.
            const note = [...panel.doc.querySelectorAll('p.ra-note-text')].find(p => p.textContent === 'Build first, then open the page in the browser.');
            expect(note?.getAttribute('dir')).toBe('ltr');
            //  The command is code: it keeps its own direction too.
            expect(panel.doc.querySelector('.ra-sum.code')?.getAttribute('dir')).toBe('ltr');

            //  The output opens in a left-to-right block.
            expect(text).not.toContain('built in 2s');
            await panel.click(panel.doc.querySelector('.ra-step-head')!);
            const output = [...panel.doc.querySelectorAll('pre.ra-pre')].find(p => p.textContent === 'built in 2s');
            expect(output?.getAttribute('dir')).toBe('ltr');

            //  Another conversation's call, and a displaced run's late frame, are not drawn.
            await panel.send(
                { ...ev(20, 'step_started', { name: 'engine:file_list', callId: 'x1', input: '{}' }), sessionId: 'chat-2', data: { name: 'engine:file_list', callId: 'x1', sessionId: 'chat-2' } },
                { ...ev(21, 'step_started', { name: 'engine:file_search', callId: 'x2', input: '{}' }), suppressPresentation: true },
            );
            expect(panel.text()).not.toContain('استعراض الملفات');
            expect(panel.text()).not.toContain('بحث في الملفات');
            //  A panel that saw every event of its run reads nothing more: it never polls,
            //  and showing its tab again reads no history twice.
            await panel.render('chat-1', false);
            await panel.render('chat-1', true);
            await panel.wait(400);
            expect(panel.reads).toEqual(['/sessions/chat-1/history', '/runs/run-old/receipt']);
        } finally { await panel.close(); }
    }, RENDER_TIMEOUT);

    it('fills in the events it missed from the run’s record, once, and a new conversation starts empty', async () => {
        const panel = await mountPanel({
            '/sessions/chat-1/history': { events: [] },
            '/runs/run-new/receipt': { events: [
                ev(2, 'step_started', { name: 'engine:file_read', callId: 'c2', input: '{"path":"src/App.tsx"}' }),
                ev(3, 'step_done', { name: 'engine:file_read', callId: 'c2', durationMs: 20, result: { ok: true, output: 'export default App' } }),
            ] },
            '/sessions/chat-9/history': { events: [] },
        });
        try {
            expect(panel.reads).toEqual(['/sessions/chat-1/history']);
            //  Events 2 and 3 never reached the panel.
            await panel.send(ev(1, 'engine_step', { step: 1 }), ev(4, 'step_started', { name: 'engine:shell_run', callId: 'c1', input: '{"command":"npm test"}' }));
            expect(panel.text()).toContain('act_missed{"n":2}');
            await panel.wait(400);
            expect(panel.reads.filter(r => r === '/runs/run-new/receipt')).toHaveLength(1);
            expect(panel.text()).toContain('قراءة ملف');
            expect(panel.text()).toContain('src/App.tsx');
            expect(panel.text()).not.toContain('act_missed');

            //  Another conversation is another panel: nothing of this one stays.
            await panel.render('chat-9');
            expect(panel.text()).not.toContain('قراءة ملف');
            expect(panel.text()).toContain('act_empty');
        } finally { await panel.close(); }
    }, RENDER_TIMEOUT);

    it('reads nothing while its tab is hidden, and reads once the first time it is shown', async () => {
        const panel = await mountPanel({
            '/runs/run-new/receipt': { events: [
                ev(1, 'engine_step', { step: 1 }),
                ev(2, 'step_started', { name: 'engine:file_read', callId: 'c1', input: '{"path":"index.html"}' }),
                ev(3, 'step_done', { name: 'engine:file_read', callId: 'c1', durationMs: 20, result: { ok: true, output: '<html>' } }),
            ] },
        }, { active: false, runningRunId: RUN });
        try {
            //  Mounted with the workspace, behind another tab: no read at all.
            expect(panel.reads).toEqual([]);
            //  Live events are folded in while it is hidden; a gap among them waits for the tab.
            await panel.send(ev(1, 'engine_step', { step: 1 }), ev(4, 'step_started', { name: 'engine:shell_run', callId: 'c2', input: '{"command":"npm test"}' }));
            await panel.wait(400);
            expect(panel.reads).toEqual([]);
            expect(panel.text()).toContain('npm test');

            //  Shown: the run's record fills in what it missed, in one read.
            await panel.render('chat-1', true);
            await panel.wait(400);
            expect(panel.reads).toEqual(['/runs/run-new/receipt']);
            expect(panel.text()).toContain('قراءة ملف');
            expect(panel.text()).toContain('index.html');
            expect(panel.text()).not.toContain('act_missed');

            //  Hidden and shown again, it has nothing more to read.
            await panel.render('chat-1', false);
            await panel.render('chat-1', true);
            await panel.wait(400);
            expect(panel.reads).toEqual(['/runs/run-new/receipt']);
        } finally { await panel.close(); }
    }, RENDER_TIMEOUT);

    it('reads the run’s record once more when the run stops without its final word', async () => {
        const opening = [
            ev(1, 'engine_step', { step: 1 }),
            ev(2, 'step_started', { name: 'engine:shell_run', callId: 'c1', input: '{"command":"npm run build"}' }),
        ];
        const built = ev(3, 'step_done', { name: 'engine:shell_run', callId: 'c1', durationMs: 900, result: { ok: true, output: 'built' } });
        const records: Record<string, any> = { '/runs/run-new/receipt': { events: opening } };
        const panel = await mountPanel(records, { runningRunId: RUN });
        try {
            //  Opened on a live run: its record so far.
            expect(panel.reads).toEqual(['/runs/run-new/receipt']);
            await panel.send(built);
            expect(panel.text()).toContain('act_running{"n":1}');

            //  The socket drops in the run's last seconds. Nothing that arrived
            //  says more is coming, so there is no gap to count; the record
            //  keeps what the panel never received.
            records['/runs/run-new/receipt'] = { events: [...opening, built,
                ev(4, 'step_started', { name: 'engine:task_finish', callId: 'c2', input: '{"summary":"Built the page"}' }),
                ev(5, 'step_failed', { name: 'engine:task_finish', callId: 'c2', durationMs: 50, result: { ok: false, output: 'R2 not proven' } }),
                ev(6, 'engine_final', { status: 'failed', steps: 1, model: 'm', reason: 'the deadline arrived before the checks passed' }),
            ] };
            await panel.wait(400);
            expect(panel.reads).toHaveLength(1);

            //  The session stops running: the record is read once, after it was written.
            await panel.setRunning('chat-1', false);
            await panel.wait(2300);
            expect(panel.reads).toEqual(['/runs/run-new/receipt', '/runs/run-new/receipt']);
            expect(panel.text()).toContain('act_status_failed');
            expect(panel.text()).toContain('the deadline arrived before the checks passed');
            expect(panel.text()).toContain('طلب الفحص النهائي');
            expect(panel.text()).not.toContain('act_ended');

            //  Once: the panel does not poll.
            await panel.wait(2300);
            expect(panel.reads).toHaveLength(2);
        } finally { await panel.close(); }
    }, RENDER_TIMEOUT);
});
