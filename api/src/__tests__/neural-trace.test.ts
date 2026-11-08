/**
 * THE NEURAL TRACE IS KEPT.
 *
 * «لمذا لا يحفظ التفاعل العصبي في الدردشة بطريقه جميله وانيقه وعصرية» — three
 * measured defects sat behind that question, and each one is pinned here:
 *
 *   1. the steps lived in `useState<string[]>`, so they were destroyed when the
 *      run ended and the card unmounted — the chat kept the answer and threw
 *      away the work;
 *   2. they were rendered inside `max-height: 140px` behind a 3px scrollbar;
 *   3. and each line inherited the card's direction instead of resolving its
 *      own, so «جاري تنفيذ: react project [pipeline]» threw its bracket to the
 *      wrong margin.
 *
 * A fourth was found while proving the fix in a real browser: returning to the
 * idle phase was conditional on `quietMode`, which only `user_input` and
 * `step_started` ever set — so a run driven purely by `thinking_phase` events
 * left «جو ينفّذ» on screen after the answer had already arrived.
 *
 * The pairing logic below is real logic, so it is tested as logic, not as text.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import ts from 'typescript';
import {
    attachTraces,
    formatDuration,
    groupByPhase,
    stepDurations,
    traceDuration,
    traceToText,
    traceDisplayKey,
    type NeuralTrace,
    type TraceStep,
} from '../../../web/src/lib/neuralTrace';

const WEB = path.join(__dirname, '..', '..', '..', 'web', 'src');
const read = (...p: string[]) => fs.readFileSync(path.join(WEB, ...p), 'utf-8');

const step = (text: string, at: number, phase: any = 'executing', kind: any = 'detail'): TraceStep =>
    ({ text, at, phase, kind });

const trace = (id: string, startedAt: number, endedAt: number, steps: TraceStep[]): NeuralTrace =>
    ({ id, sessionId: 's1', startedAt, endedAt, steps });

describe('a reply is paired with the run that produced it', () => {
    const t0 = 1_700_000_000_000;

    it('hangs a trace on the assistant reply that followed it', () => {
        const traces = [trace('a', t0, t0 + 10_000, [step('x', t0 + 1000)])];
        const messages = [
            { id: 'u1', role: 'user', timestamp: new Date(t0 - 1000) },
            { id: 'a1', role: 'assistant', timestamp: new Date(t0 + 11_000) },
        ];
        const map = attachTraces(messages, traces);
        expect(map.get('a1')?.id).toBe('a');
        expect(map.has('u1')).toBe(false);
    });

    it('gives five runs five receipts, in order — not all of them to the last message', () => {
        const traces = [
            trace('a', t0, t0 + 5_000, [step('1', t0)]),
            trace('b', t0 + 20_000, t0 + 25_000, [step('2', t0 + 20_000)]),
            trace('c', t0 + 40_000, t0 + 45_000, [step('3', t0 + 40_000)]),
        ];
        const messages = [
            { id: 'a1', role: 'assistant', timestamp: new Date(t0 + 6_000) },
            { id: 'a2', role: 'assistant', timestamp: new Date(t0 + 26_000) },
            { id: 'a3', role: 'assistant', timestamp: new Date(t0 + 46_000) },
        ];
        const map = attachTraces(messages, traces);
        expect([map.get('a1')?.id, map.get('a2')?.id, map.get('a3')?.id]).toEqual(['a', 'b', 'c']);
    });

    it('never gives one trace to two messages', () => {
        const traces = [trace('a', t0, t0 + 1_000, [step('1', t0)])];
        const messages = [
            { id: 'a1', role: 'assistant', timestamp: new Date(t0 + 2_000) },
            { id: 'a2', role: 'assistant', timestamp: new Date(t0 + 3_000) },
        ];
        const map = attachTraces(messages, traces);
        expect(map.size).toBe(1);
        expect(map.get('a1')?.id).toBe('a');
    });

    it('refuses a trace that ended long before the reply, or after it', () => {
        const stale = trace('old', t0 - 3_600_000, t0 - 3_500_000, [step('1', t0 - 3_600_000)]);
        const future = trace('later', t0 + 60_000, t0 + 70_000, [step('1', t0 + 60_000)]);
        const messages = [{ id: 'a1', role: 'assistant', timestamp: new Date(t0) }];
        expect(attachTraces(messages, [stale]).size).toBe(0);
        expect(attachTraces(messages, [future]).size).toBe(0);
    });

    it('tolerates the small clock gap between the seal and the rendered reply', () => {
        // The socket seals on the SAME event that paints the message, so the two
        // stamps land within milliseconds of each other in either order.
        const t = trace('a', t0, t0 + 5_000, [step('1', t0)]);
        const messages = [{ id: 'a1', role: 'assistant', timestamp: new Date(t0 + 4_997) }];
        expect(attachTraces(messages, [t]).get('a1')?.id).toBe('a');
    });

    it('needs a timestamp to pair anything at all', () => {
        const t = trace('a', t0, t0 + 5_000, [step('1', t0)]);
        expect(attachTraces([{ id: 'a1', role: 'assistant' } as any], [t]).size).toBe(0);
    });
});

describe('the durations shown are measured, not invented', () => {
    const t0 = 1_700_000_000_000;

    it('each step is timed from the one that replaced it', () => {
        const t = trace('a', t0, t0 + 9_000, [step('1', t0), step('2', t0 + 2_000), step('3', t0 + 5_000)]);
        expect(stepDurations(t)).toEqual([2_000, 3_000, 4_000]);
        expect(traceDuration(t)).toBe(9_000);
    });

    it('reads as seconds under a minute and as m:ss above it', () => {
        expect(formatDuration(4_400)).toBe('4s');
        expect(formatDuration(72_000)).toBe('1:12');
        expect(formatDuration(724_000)).toBe('12:04');
        expect(formatDuration(72_000, 'ث')).toBe('1:12');
        expect(formatDuration(4_400, 'ث')).toBe('4ث');
    });
});

describe('the timeline groups consecutive steps by their phase', () => {
    const t0 = 1_700_000_000_000;

    it('one group per run of the same phase, keeping the original indices', () => {
        const t = trace('a', t0, t0 + 8_000, [
            step('analyse', t0, 'analyzing'),
            step('plan', t0 + 1_000, 'synthesizing'),
            step('build', t0 + 3_000, 'executing'),
            step('still building', t0 + 5_000, 'executing'),
        ]);
        const groups = groupByPhase(t);
        expect(groups.map(g => g.phase)).toEqual(['analyzing', 'synthesizing', 'executing']);
        expect(groups[2].steps).toHaveLength(2);
        expect(groups[2].indices).toEqual([2, 3]);
        // A group ends where the next one starts; the last runs to the end.
        expect(groups[0].endedAt).toBe(t0 + 1_000);
        expect(groups[2].endedAt).toBe(t0 + 8_000);
    });

    it('a phase that comes back gets its own group rather than merging backwards', () => {
        const t = trace('a', t0, t0 + 4_000, [
            step('build', t0, 'executing'),
            step('rethink', t0 + 1_000, 'synthesizing'),
            step('build again', t0 + 2_000, 'executing'),
        ]);
        expect(groupByPhase(t).map(g => g.phase)).toEqual(['executing', 'synthesizing', 'executing']);
    });

    it('copies out as text a human can paste into a bug report', () => {
        const t = trace('a', t0, t0 + 3_000, [step('npm install', t0, 'executing')]);
        expect(traceToText(t)).toContain('1. [executing] npm install (3s)');
    });
});

describe('the three defects behind the complaint are closed in the UI', () => {
    it('turns internal activity into safe user-facing descriptions', () => {
        expect(traceDisplayKey('Running: browser_summarize')).toBe('neuralDetailBrowserAction');
        expect(traceDisplayKey('Running: import_project')).toBe('neuralDetailWorkspace');
        expect(traceDisplayKey('Cloning https://github.com/user/repo.git')).toBe('neuralDetailWorkspace');
        expect(traceDisplayKey('Running: unknown_internal_tool')).toBe('neuralDetailAction');
        expect(traceDisplayKey('Improvement loop: 97/100')).toBe('neuralDetailVerify');
        expect(traceDisplayKey('Putting the steps in order before starting')).toBe('neuralDetailOrchestration');
    });

    it('the steps are no longer component state that dies with the run', () => {
        const ind = read('components', 'NeuralThinkingIndicator.tsx');
        expect(ind).not.toMatch(/useState<string\[\]>\(\[\]\)/);
        expect(ind).toMatch(/SocketService\.subscribeThinkingSteps/);
        const socket = read('services', 'socket.ts');
        expect(socket).toMatch(/function sealTrace\(sessionId = ''\)/);
        expect(socket).toMatch(/saveTrace\(trace\)/);
        // Sealed on the way out of a run, before the live state is cleared.
        expect(socket).toMatch(/msgType === 'run_finished'/);
        expect(socket).toMatch(/msgType === 'run_cancelled'/);
        expect(socket).toMatch(/sealTrace\(evSid\)/);
    });

    it('the log is not caged in 140px behind a 3px scrollbar', () => {
        const ind = read('components', 'NeuralThinkingIndicator.tsx');
        const view = read('components', 'NeuralTraceView.tsx');
        expect(ind).not.toMatch(/max-height:\s*140px/);
        expect(ind).not.toMatch(/scrollbar\s*\{\s*width:\s*3px/);
        // …and it is CHAT-sized, not page-sized: 44vh made the card taller than
        // the conversation it sits in — «حجمها غير ملائم لدردشة جو».
        expect(view).toMatch(/max-height:\s*min\(34vh,\s*300px\)/);
    });

    it('every trace line resolves its own direction', () => {
        const view = read('components', 'NeuralTraceView.tsx');
        expect(view).toMatch(/className="jt-text" dir="auto"/);
        const ind = read('components', 'NeuralThinkingIndicator.tsx');
        expect(ind).toMatch(/className="nc-line-content" dir="auto"/);
    });

    it('and a finished run always returns to idle, quiet mode or not', () => {
        const socket = read('services', 'socket.ts');
        const at = socket.indexOf("msgType === 'run_finished'");
        expect(at).toBeGreaterThan(0);

        /**
         * The `if (quietMode) { … emitPhase('idle') }` guard is what left the
         * card on screen after the answer arrived — so what this pin defends is
         * that NOTHING guards the return to idle.
         *
         * It used to say that by demanding the three statements be adjacent,
         * which is a proxy, not the property: adding one more field to the same
         * reset turned it red while the behaviour it guards was untouched. The
         * bound is the reset itself now, and the assertion is the real one.
         */
        const from = socket.indexOf('runtime.quietMode = false;', at);
        const to = socket.indexOf("emitPhase('idle');", from);
        expect(from).toBeGreaterThan(at);
        expect(to).toBeGreaterThan(from);
        const reset = socket.slice(from, to + "emitPhase('idle');".length);

        expect(reset).toMatch(/runtime\.thinkingStatus = '';/);
        expect(reset).not.toMatch(/\bif\s*\(/);      // no guard between the reset and idle
        expect(reset).not.toMatch(/\breturn\b/);     // and no early exit before it
    });
});

describe('the receipt is reachable, not just pretty', () => {
    it('is a real button that announces whether it is open', () => {
        const view = read('components', 'NeuralTraceView.tsx');
        expect(view).toMatch(/type="button"/);
        expect(view).toMatch(/aria-expanded=\{open\}/);
        expect(view).toMatch(/aria-controls=\{bodyId\}/);
        expect(view).toMatch(/:focus-visible/);
        expect(view).toMatch(/prefers-reduced-motion/);
    });

    it('and the chat actually renders one per assistant message that has a trace', () => {
        const chat = read('components', 'ChatPanel.tsx');
        expect(chat).toMatch(/attachTraces\(messages, traces\)/);
        expect(chat).toMatch(/subscribeTraceSealed/);
        expect(chat).toMatch(/<NeuralTraceReceipt trace=\{traceFor\.get\(msg\.id\)!\} \/>/);
    });

    it('and every label it shows is translated, in all six languages', () => {
        const i18n = read('i18n.ts');
        for (const key of ['traceDid', 'traceCopy', 'traceCopied', 'traceSecond',
            'tracePhaseAnalysis', 'tracePhasePlanning', 'tracePhaseExecution', 'tracePhaseWrapUp']) {
            expect((i18n.match(new RegExp(`\\b${key}:`, 'g')) || []).length).toBe(6);
        }
    });

    it('and every stage and line of the live card is named in all six languages', () => {
        // The card builds these keys from a value (t(`neuralStage${…}`), a
        // detail chosen by kind), so no sweep of t('…') calls can see them:
        // twenty of them reached en and ar only, and a French owner read
        // «Understand», «Build», «Verify» on his card (2026-11-08).
        const i18n = read('i18n.ts');
        const en = i18n.slice(i18n.indexOf('\n  en: {'), i18n.indexOf('\n  ar: {'));
        const keys = [...new Set([...en.matchAll(/\n\s+(neural[A-Z][A-Za-z]*): /g)].map(m => m[1]))];
        expect(keys.length).toBeGreaterThan(30);
        const lacking = keys.filter(k => (i18n.match(new RegExp(`\\n\\s+${k}: `, 'g')) || []).length !== 6);
        expect(lacking).toEqual([]);
    });

    it('and the step count is pluralised properly — «8 خطوة» is not Arabic', () => {
        const i18n = read('i18n.ts');
        // Every language needs the fallback form…
        expect((i18n.match(/\btraceSteps_other:/g) || []).length).toBe(6);
        // …and Arabic needs all six CLDR categories, dual included.
        for (const cat of ['zero', 'one', 'two', 'few', 'many']) {
            expect(i18n).toMatch(new RegExp(`traceSteps_${cat}:`));
        }
        expect(i18n).toMatch(/traceSteps_two: 'خطوتان'/);
        expect(i18n).toMatch(/traceSteps_few: '\{\{count\}\} خطوات'/);
        // The un-suffixed key must be gone, or i18next resolves it and the
        // plural rules never run.
        expect(i18n).not.toMatch(/\btraceSteps: /);
    });
});

/**
 * THE SOCKET, RUN AS WRITTEN — NOT READ.
 *
 * The pin above reads the reset block; this runs web/src/services/socket.ts
 * itself, with a stand-in WebSocket the test drives frame by frame. Nothing
 * else is replaced: no server, no browser, no model. Only Vite's build-time
 * `import.meta.env.DEV` flag is set to false, because it means nothing
 * outside Vite.
 *
 * 2026-11-08: the run_finished-only fields moved out of the middle of the
 * reset (they read as a guard on the return to idle). What they do is what
 * the first two cases prove: a finished run is closed exactly once.
 */
function loadSocket() {
    const file = path.join(WEB, 'services', 'socket.ts');
    const source = fs.readFileSync(file, 'utf-8').replace(/import\.meta\.env\.DEV/g, 'false');
    const compiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        fileName: file,
    }).outputText;
    const imports: Record<string, any> = {
        '../config': { API_URL: 'http://localhost:5002/api', WS_URL: 'ws://localhost:5002/api/ws' },
        '../lib/planCredits': { normalizePlan: () => [] },
        './AutoOpenManager': { AutoOpenManager: { processStepEvent() { /* no auto-open here */ } } },
        '../lib/neuralTrace': { saveTrace() { /* the trace store is tested above */ } },
        '../lib/run-replay': { replayRunState: () => ({}) },
        '../utils/auth': { isValidToken: () => true },
    };
    const required = [...new Set(Array.from(compiled.matchAll(/\brequire\(["']([^"']+)["']\)/g), m => m[1]))];
    const missing = required.filter(id => !Object.prototype.hasOwnProperty.call(imports, id));
    if (missing.length) throw new Error(`socket.ts imports what this test does not give it: ${missing.join(', ')}`);
    const sockets: any[] = [];
    class StandInSocket {
        static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
        readyState = 0;
        sent: string[] = [];
        onopen: any; onmessage: any; onclose: any; onerror: any;
        constructor(public url: string) { sockets.push(this); }
        send(text: string) { this.sent.push(text); }
        close() { this.readyState = 3; }
    }
    //  Every timer the module starts is the test's to cancel: nothing outlives a case.
    const timers = new Set<any>();
    const later = (fn: () => void, ms?: number) => { const h = setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); return h; };
    const cancel = (h: any) => { timers.delete(h); clearTimeout(h); };
    const exports: any = {};
    vm.runInNewContext(compiled, {
        exports, require: (id: string) => imports[id], console, URL,
        WebSocket: StandInSocket, setTimeout: later, clearTimeout: cancel,
        window: { location: { origin: 'http://localhost:5002' }, setTimeout: later, clearTimeout: cancel,
            dispatchEvent: () => true, addEventListener() { /* inert */ }, removeEventListener() { /* inert */ } },
        localStorage: { getItem: () => 'test-only', setItem() { /* inert */ }, removeItem() { /* inert */ } },
        fetch: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) }),
        CustomEvent: class { constructor(public type: string, public detail?: any) {} },
    }, { filename: file });
    const SocketService = exports.SocketService;
    return {
        SocketService,
        /** Waits for the module's own connect() to open its socket, then opens it. */
        async open() {
            for (let i = 0; i < 100 && !sockets.length; i++) await new Promise(resolve => setImmediate(resolve));
            const ws = sockets[sockets.length - 1];
            if (!ws) throw new Error('socket.ts never opened a socket');
            ws.readyState = 1;
            ws.onopen({ target: ws });
        },
        deliver(frame: any) { sockets[sockets.length - 1].onmessage({ data: JSON.stringify(frame) }); },
        dispose() { timers.forEach(h => clearTimeout(h)); timers.clear(); },
    };
}

const frame = (type: string, runId: string, extra: any = {}) =>
    ({ type, sessionId: 'chat-1', runId, data: { sessionId: 'chat-1', runId, ...extra } });

describe('socket.ts, run: a finished run is closed once, and Joe\'s notice is never a run event', () => {
    it('a run that never entered quiet mode returns to idle, and a repeated final frame finalizes nothing', async () => {
        const s = loadSocket();
        try {
            const seen: string[] = [];
            const phases: string[] = [];
            s.SocketService.subscribe((e: any) => seen.push(String(e?.type)), 'chat-1');
            s.SocketService.subscribeThinkingPhase((p: string) => phases.push(p), 'chat-1');
            await s.open();
            //  The page shows this run (its HTTP admission named it).
            expect(s.SocketService.registerRunPresentation('chat-1', 'run-1')).toBe(true);
            s.deliver(frame('thinking_phase', 'run-1', { phase: 'executing', detail: 'جاري تنفيذ: react project' }));
            expect(s.SocketService.isQuietMode('chat-1')).toBe(false);     // thinking_phase alone: never quiet
            expect(s.SocketService.getThinkingPhase('chat-1')).toBe('executing');

            s.deliver(frame('run_finished', 'run-1'));
            expect(s.SocketService.getThinkingPhase('chat-1')).toBe('idle');
            expect(phases[phases.length - 1]).toBe('idle');
            const idles = phases.filter(p => p === 'idle').length;

            //  The same final frame again (a reconnect replays it): no second
            //  idle, and no «run_finalized» — that would re-read the history a
            //  second time. It is what run_finished settles before the reset.
            s.deliver(frame('run_finished', 'run-1'));
            expect(phases.filter(p => p === 'idle').length).toBe(idles);
            expect(seen.filter(t => t === 'run_finalized')).toEqual([]);
        } finally { s.dispose(); }
    });

    it('a cancelled run takes its saved answer once, when its final frame arrives after the cancel', async () => {
        const s = loadSocket();
        try {
            const seen: string[] = [];
            s.SocketService.subscribe((e: any) => seen.push(String(e?.type)), 'chat-1');
            await s.open();
            s.deliver(frame('run_started', 'run-2'));
            s.deliver(frame('run_cancelled', 'run-2'));
            expect(s.SocketService.getThinkingPhase('chat-1')).toBe('idle');
            s.deliver(frame('run_finished', 'run-2'));
            s.deliver(frame('run_finished', 'run-2'));
            expect(seen.filter(t => t === 'run_finalized')).toEqual(['run_finalized']);
        } finally { s.dispose(); }
    });

    it('Joe\'s notice reaches every notice listener past a finished chat, once, and no run listener', async () => {
        const s = loadSocket();
        try {
            const notices: Array<{ kind: string; chatId: string; who: string; subject: string }> = [];
            const anyRun: string[] = [];
            const chatRun: string[] = [];
            s.SocketService.subscribeNotices(() => { throw new Error('a broken listener'); });
            s.SocketService.subscribeNotices((n: any) => notices.push({ kind: n.kind, chatId: n.chatId, who: n.who, subject: n.subject }));
            s.SocketService.subscribe((e: any) => anyRun.push(String(e?.type)));
            s.SocketService.subscribe((e: any) => chatRun.push(String(e?.type)), 'chat-1');
            await s.open();
            s.deliver(frame('run_started', 'run-1'));
            s.deliver(frame('run_finished', 'run-1'));
            //  The chat's run is over: a late line for it is dropped by the run
            //  gates — the very frame MailWatchService sends into that chat.
            const before = chatRun.length;
            s.deliver({ type: 'text', sessionId: 'chat-1', data: { text: 'رد من شروق', sessionId: 'chat-1' } });
            expect(chatRun.length).toBe(before);
            //  The notice, exactly as MailWatchService sends it: an id, an owner, no session.
            const notice = { type: 'joe_notice', id: 'mail_reply:gm:k1:1', userId: 'owner-1',
                data: { kind: 'mail_reply', chatId: 'chat-1', who: 'Shurooq', subject: 'Re: the offer', at: 1 } };
            s.deliver(notice);
            s.deliver(notice);                      // the next poll reports the same mail: told once
            expect(notices).toEqual([{ kind: 'mail_reply', chatId: 'chat-1', who: 'Shurooq', subject: 'Re: the offer' }]);
            expect(anyRun).not.toContain('joe_notice');
            expect(chatRun).not.toContain('joe_notice');
        } finally { s.dispose(); }
    });
});
