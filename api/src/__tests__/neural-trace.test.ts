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
