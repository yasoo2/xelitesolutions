/**
 * THE ACTIVITY PANEL SHOWS EVERY STEP THE ENGINE TAKES.
 *
 * «أريد أن أرى ماذا يفعل المحرّك خطوةً خطوة». The engine announces its plan,
 * each tool call and its result, its notes, the final checks and its end; the
 * panel folds those events into one state with a pure reducer
 * (web/src/lib/activity-feed.ts). It is real logic, so it is tested as logic:
 * events go in, and what the owner will see comes out.
 *
 * The last block feeds the reducer the events the engine's own emitter
 * (core/engine/run.ts) broadcasts, so the two halves of the contract cannot
 * drift apart without this file going red.
 */
jest.mock('../api/ws', () => ({ broadcast: jest.fn(), broadcastThinkingDetail: jest.fn() }));
import { broadcast } from '../api/ws';
import { uiEmitter } from '../core/engine/run';
import { newPlan, seededRequirements } from '../core/engine/plan';
import {
    emptyActivity, formatStepDuration, inputSummary, isEngineStepEvent, latestRunId, reduceActivity,
    restoreActivity, safeScreenshotHref, toolLabel, type ActivityState,
} from '../../../web/src/lib/activity-feed';

const RUN = 'run-1793271234567';
let n = 0;
let clock = 1_700_000_000_000;
beforeEach(() => { n = 0; clock = 1_700_000_000_000; (broadcast as jest.Mock).mockReset(); });

/** An event as the socket delivers it: the engine's numbered id, its session and run, the server's time. */
function engine(type: string, data: Record<string, unknown>, run = RUN) {
    n += 1;
    clock += 1000;
    return { type, id: `engine-${run}-${n}`, sessionId: 'chat-1', runId: run, ts: clock, data: { ...data, sessionId: 'chat-1', runId: run } };
}
const start = (callId: string, tool: string, input: unknown = {}) =>
    engine('step_started', { name: `engine:${tool}`, callId, input: typeof input === 'string' ? input : JSON.stringify(input) });
const done = (callId: string, tool: string, output = 'ok', extra: Record<string, unknown> = {}) =>
    engine('step_done', { name: `engine:${tool}`, callId, durationMs: 10, result: { ok: true, output }, ...extra });
const failed = (callId: string, tool: string, output = 'failed') =>
    engine('step_failed', { name: `engine:${tool}`, callId, durationMs: 10, result: { ok: false, output } });
const fold = (events: unknown[], s: ActivityState = emptyActivity()) => events.reduce<ActivityState>(reduceActivity, s);

describe('a tool call is one step', () => {
    it('a start and its result pair by callId into one step, with what it was given and what came back', () => {
        const s = fold([
            start('c1', 'shell_run', { command: 'npm run build' }),
            engine('step_done', { name: 'engine:shell_run', callId: 'c1', durationMs: 1234, result: { ok: true, output: 'built in 2s' } }),
        ]);
        expect(s.steps).toHaveLength(1);
        expect(s.steps[0]).toMatchObject({
            callId: 'c1', tool: 'shell_run', source: 'engine', input: '{"command":"npm run build"}',
            ok: true, output: 'built in 2s', durationMs: 1234, startedAt: 1_700_000_001_000, endedAt: 1_700_000_002_000,
        });
    });

    it('a failed call is a step that failed, and its error is kept', () => {
        const s = fold([start('c1', 'shell_run', { command: 'npm test' }), failed('c1', 'shell_run', 'exit 1\nTypeError: x is undefined')]);
        expect(s.steps).toHaveLength(1);
        expect(s.steps[0]).toMatchObject({ ok: false, output: 'exit 1\nTypeError: x is undefined' });
    });

    it('a call refused before it could start still appears, as a failure with no input', () => {
        const s = fold([failed('c9', 'file_wirte', 'There is no tool "file_wirte".')]);
        expect(s.steps).toHaveLength(1);
        expect(s.steps[0]).toMatchObject({ callId: 'c9', tool: 'file_wirte', input: '', ok: false, started: false });
    });

    it('a result read back before its start is still one step', () => {
        const a = start('c1', 'file_read', { path: 'index.html' });
        const b = done('c1', 'file_read', '<html>');
        const s = restoreActivity(emptyActivity(), RUN, [b, a]);
        expect(s.steps).toHaveLength(1);
        expect(s.steps[0]).toMatchObject({ input: '{"path":"index.html"}', ok: true, output: '<html>', started: true });
    });

    it('an id a provider reuses in a later turn opens a new step instead of rewriting the finished one', () => {
        const s = fold([
            start('call_0', 'file_write', { path: 'a.txt' }), done('call_0', 'file_write', 'one'),
            start('call_0', 'file_write', { path: 'b.txt' }), done('call_0', 'file_write', 'two'),
        ]);
        expect(s.steps.map(x => [x.input, x.output])).toEqual([['{"path":"a.txt"}', 'one'], ['{"path":"b.txt"}', 'two']]);
        expect(new Set(s.steps.map(x => x.key)).size).toBe(2);
    });

    it('the history’s pairs, which carry no id, pair by tool in the order they ran', () => {
        const row = (type: string, name: string, ts: number, data: Record<string, unknown> = {}) => ({ type, runId: RUN, ts, data: { name, ...data } });
        const s = restoreActivity(emptyActivity(), RUN, [
            row('step_started', 'execute:write_file', 100, { input: { path: 'a' } }),
            row('step_started', 'execute:write_file', 105, { input: { path: 'b' } }),
            row('step_done', 'execute:write_file', 110, { result: { ok: true, output: { saved: 'a' } } }),
            row('step_failed', 'execute:write_file', 115, { result: { ok: false, error: 'disk full' } }),
            row('step_started', 'execute:shell_execute', 200, { input: { command: 'ls' } }),
            row('step_done', 'execute:shell_execute', 210, { result: { ok: true, output: 'a b' } }),
        ]);
        expect(s.steps.map(x => [x.tool, x.source, x.ok, x.output])).toEqual([
            ['write_file', 'pipeline', true, '{\n  "saved": "a"\n}'],
            ['write_file', 'pipeline', false, 'disk full'],
            ['shell_execute', 'pipeline', true, 'a b'],
        ]);
    });
});

describe('the same event twice is one event', () => {
    it('drops a repeated event by its id, whichever way it arrives', () => {
        const a = start('c1', 'shell_run', { command: 'ls' });
        const once = fold([a]);
        expect(reduceActivity(once, a)).toBe(once);
        expect(restoreActivity(once, RUN, [a])).toBe(once);
        //  An event without an engine id is told apart by its own id, or by the server's number.
        const shot = { type: 'screenshot', sessionId: 'chat-1', runId: RUN, seq: 77, ts: clock, data: { status: 'success', capture: { id: 'x' } } };
        const one = reduceActivity(once, shot);
        expect(reduceActivity(one, shot)).toBe(one);
        //  The history's rows have neither: their time and name tell them apart.
        const row = { type: 'step_started', runId: RUN, ts: 5, data: { name: 'execute:ls', input: {} } };
        const h = restoreActivity(emptyActivity(), RUN, [row, row]);
        expect(h.steps).toHaveLength(1);
    });
});

describe('the list is bounded, and says what it left out', () => {
    it('keeps the newest calls and counts the older ones', () => {
        const events: unknown[] = [];
        for (let i = 1; i <= 5; i++) events.push(start(`c${i}`, 'file_read', { path: `${i}.txt` }), done(`c${i}`, 'file_read'));
        const s = fold(events, emptyActivity({ steps: 3 }));
        expect(s.steps.map(x => x.callId)).toEqual(['c3', 'c4', 'c5']);
        expect(s.olderSteps).toBe(2);
    });

    it('never removes a call that is still running', () => {
        const events: unknown[] = [start('slow', 'shell_run', { command: 'npm install' })];
        for (let i = 1; i <= 3; i++) events.push(start(`c${i}`, 'file_read'), done(`c${i}`, 'file_read'));
        const s = fold(events, emptyActivity({ steps: 2 }));
        expect(s.steps.map(x => x.callId)).toEqual(['slow', 'c3']);
        expect(s.olderSteps).toBe(2);
        const finished = reduceActivity(s, done('slow', 'shell_run', 'added 120 packages'));
        expect(finished.steps.find(x => x.callId === 'slow')?.output).toBe('added 120 packages');
    });

    it('a record replaying a call it removed does not bring the call back or count it twice', () => {
        const first = [start('c1', 'file_read'), done('c1', 'file_read')];
        const s = fold([...first, start('c2', 'file_read'), done('c2', 'file_read'), start('c3', 'file_read'), done('c3', 'file_read')],
            emptyActivity({ steps: 2 }));
        expect(s.olderSteps).toBe(1);
        const replay = first.map(e => ({ ...e, id: `${e.id}-copy-without-the-engine-number` }));
        const again = restoreActivity(s, RUN, replay);
        expect(again.steps.map(x => x.callId)).toEqual(['c2', 'c3']);
        expect(again.olderSteps).toBe(1);
    });

    it('notes and files are bounded the same way, and a file that changes again is not counted twice', () => {
        const notes = fold([1, 2, 3].map(i => engine('engine_note', { kind: 'thought', text: `note ${i}` })), emptyActivity({ notes: 2 }));
        expect(notes.notes.map(x => x.text)).toEqual(['note 2', 'note 3']);
        expect(notes.olderNotes).toBe(1);

        const file = (path: string) => engine('file_stream', { file: path, chunk: 'x', done: true, bytes: 1 });
        const three = fold([file('a'), file('b'), file('c')], emptyActivity({ files: 2 }));
        expect(three.files.map(f => f.path)).toEqual(['c', 'b']);
        expect(three.olderFiles).toBe(1);
        const back = reduceActivity(three, file('a'));
        expect(back.files.map(f => f.path)).toEqual(['a', 'c']);
        expect(back.olderFiles).toBe(1);   // b now, not a and b
    });
});

describe('every tool has a name in the owner’s language', () => {
    it('gives each of the engine’s tools its Arabic label', () => {
        const ar: Record<string, string> = {
            shell_run: 'تشغيل أمر', shell_start: 'تشغيل خادم', shell_logs: 'سجل الخادم', shell_stop: 'إيقاف خادم',
            file_read: 'قراءة ملف', file_write: 'كتابة ملف', file_edit: 'تعديل ملف', file_list: 'استعراض الملفات',
            file_search: 'بحث في الملفات', browser_open: 'فتح الصفحة', browser_act: 'تجربة في الصفحة',
            browser_screenshot: 'لقطة شاشة', plan_update: 'تحديث الخطة', task_finish: 'طلب الفحص النهائي',
        };
        for (const [tool, label] of Object.entries(ar)) expect(`${tool}=${toolLabel(tool, 'ar')}`).toBe(`${tool}=${label}`);
        expect(toolLabel('shell_run', 'ar-EG')).toBe('تشغيل أمر');
    });

    it('gives the English interface English, and no label to a tool it does not know', () => {
        expect(toolLabel('shell_run', 'en')).toBe('Run a command');
        expect(toolLabel('task_finish', 'en')).toBe('Ask for the final checks');
        expect(toolLabel('browser_act', 'en-US')).toBe('Try it in the page');
        expect(toolLabel('shell_run', 'xx')).toBe('Run a command');
        expect(toolLabel('write_file', 'ar')).toBeNull();
    });

    it('summarises a call by its command, its path or its address, even when the input was clipped', () => {
        expect(inputSummary('shell_run', '{"command":"npm install --no-audit","cwd":"."}')).toBe('npm install --no-audit');
        expect(inputSummary('file_write', '{"path":"src/App.tsx","content":"export default 1"}')).toBe('src/App.tsx');
        expect(inputSummary('browser_open', '{"url":"http://127.0.0.1:5173/"}')).toBe('http://127.0.0.1:5173/');
        expect(inputSummary('browser_act', '{"action":"type","ref":"e12","text":"Ali"}')).toBe('type e12 "Ali"');
        expect(inputSummary('shell_start', '{"name":"web","command":"npm run dev"}')).toBe('web: npm run dev');
        expect(inputSummary('file_search', '{"path":"src","pattern":"useState"}')).toBe('useState');
        expect(inputSummary('task_finish', '{"summary":"بنيت صفحة الحجز"}')).toBe('بنيت صفحة الحجز');
        expect(inputSummary('plan_update', '{"steps":[{"title":"Write","status":"done"},{"title":"Test the form","status":"in_progress"}]}'))
            .toBe('Test the form');
        //  The engine clips a long input, and clipped JSON no longer parses.
        expect(inputSummary('file_write', '{"path":"src/pages/Booking.tsx","content":"import React from \\"react\\";\\n… [9000 more characters in the run record]'))
            .toBe('src/pages/Booking.tsx');
        expect(inputSummary('browser_screenshot', '{}')).toBe('');
        expect(inputSummary('shell_run', `{"command":"${'x'.repeat(400)}"}`).length).toBeLessThanOrEqual(160);
    });

    it('says how long a call took, in tenths when it was short', () => {
        expect(formatStepDuration(40)).toBe('<0.1s');
        expect(formatStepDuration(900, 'ث')).toBe('0.9ث');
        expect(formatStepDuration(12_345)).toBe('12s');
        expect(formatStepDuration(65_000)).toBe('1:05');
    });
});

describe('the model’s notes are kept, whatever script they are written in', () => {
    it('keeps an English note word for word, with its kind', () => {
        //  The Arabic interface hides narration with a Latin letter in it; this panel must not.
        const s = fold([
            engine('engine_note', { kind: 'thought', text: 'The form posts nowhere; I will add a submit handler.' }),
            engine('engine_note', { kind: 'compacted', text: '… folded 14 earlier messages into a summary' }),
            engine('engine_note', { kind: 'something-new', text: 'Still a note.' }),
        ]);
        expect(s.notes.map(x => [x.kind, x.text])).toEqual([
            ['thought', 'The form posts nowhere; I will add a submit handler.'],
            ['compacted', '… folded 14 earlier messages into a summary'],
            ['thought', 'Still a note.'],
        ]);
    });
});

describe('the verdict and the end of the run are kept as the engine sent them', () => {
    const report = (passed: boolean) => engine('engine_verification', {
        passed,
        checks: [
            { id: 'build', status: 'passed', detail: 'npm run build exited 0' },
            { id: 'requirements', status: passed ? 'passed' : 'failed', detail: passed ? 'every requirement proven' : 'R2 not proven' },
        ],
        unproven: passed ? [] : [{ id: 'R2', text: 'customer reviews', reason: 'no review form was found on the page' }],
    });

    it('keeps every check, and every unproven requirement with its reason', () => {
        const first = fold([report(false)]);
        expect(first.verification).toMatchObject({
            passed: false,
            checks: [{ id: 'build', status: 'passed' }, { id: 'requirements', status: 'failed', detail: 'R2 not proven' }],
            unproven: [{ id: 'R2', text: 'customer reviews', reason: 'no review form was found on the page' }],
        });
        expect(first.checkRounds).toBe(1);
        const second = reduceActivity(first, report(true));
        expect(second.verification?.passed).toBe(true);
        expect(second.checkRounds).toBe(2);
        //  A verdict read back from the record is older than the one on screen.
        const older = { ...report(false), ts: 1 };
        expect(restoreActivity(second, RUN, [older]).verification?.passed).toBe(true);
    });

    it('keeps how the run ended, its steps, its model and its reason', () => {
        const s = fold([engine('engine_final', { status: 'failed', steps: 12, model: 'ollama/qwen3.5:9b', reason: 'the deadline arrived before the checks passed' })]);
        expect(s.final).toMatchObject({ status: 'failed', steps: 12, model: 'ollama/qwen3.5:9b', reason: 'the deadline arrived before the checks passed' });
        const delivered = fold([engine('engine_final', { status: 'delivered', steps: 7, model: 'm', reason: null })]);
        expect(delivered.final).toMatchObject({ status: 'delivered', steps: 7, reason: null });
    });
});

describe('a run is one panel', () => {
    it('a new run starts an empty panel, and the same run announced twice does not', () => {
        const a = fold([start('c1', 'file_read'), engine('engine_note', { kind: 'thought', text: 'x' })]);
        const opened = reduceActivity(a, { type: 'run_started', sessionId: 'chat-1', runId: 'run-B', ts: clock + 1, id: 'run-1', data: { runId: 'run-B' } });
        expect(opened.runId).toBe('run-B');
        expect(opened.steps).toEqual([]);
        expect(opened.notes).toEqual([]);
        const echo = { type: 'user_input', sessionId: 'chat-1', runId: 'run-B', ts: clock + 2, id: 'uin-1', data: { text: 'again' } };
        expect(reduceActivity(opened, echo)).toBe(opened);
        //  The composer's own echo of a new prompt carries no run yet: it clears the panel too.
        const local = reduceActivity(a, { type: 'user_input', sessionId: 'chat-1', id: 'local-1', data: { text: 'next' } });
        expect(local.steps).toEqual([]);
    });

    it('a live event of a run whose start this panel missed replaces the old run', () => {
        const a = fold([start('c1', 'file_read'), done('c1', 'file_read')]);
        const b = reduceActivity(a, engine('step_started', { name: 'engine:shell_run', callId: 'k1', input: '{}' }, 'run-B'));
        expect(b.runId).toBe('run-B');
        expect(b.steps.map(x => x.callId)).toEqual(['k1']);
    });

    it('a record read back never resets the panel, and never paints another run', () => {
        const a = fold([start('c1', 'file_read')]);
        const other = [engine('step_started', { name: 'engine:shell_run', callId: 'z', input: '{}' }, 'run-OLD')];
        expect(restoreActivity(a, 'run-OLD', other)).toBe(a);
        const opener = { type: 'run_started', runId: RUN, ts: 1, id: 'run-x', data: {} };
        expect(restoreActivity(a, RUN, [opener]).steps).toHaveLength(1);
    });

    it('a history row that names no run is not painted into the run being restored', () => {
        const s = restoreActivity(emptyActivity(), RUN, [
            //  Written by some run of the session; which one, the row does not say.
            { type: 'step_started', ts: 10, data: { name: 'execute:write_file', input: { path: 'old.txt' } } },
            { type: 'step_done', ts: 20, data: { name: 'execute:write_file', result: { ok: true, output: 'saved old.txt' } } },
            { type: 'step_started', runId: RUN, ts: 30, data: { name: 'execute:read_file', input: { path: 'new.txt' } } },
        ]);
        expect(s.steps.map(x => [x.tool, x.input])).toEqual([['read_file', '{\n  "path": "new.txt"\n}']]);
    });

    it('names the newest run a history list mentions', () => {
        expect(latestRunId([
            { type: 'user_input', ts: 1, data: 'hi' },
            { type: 'text', runId: 'run-1', ts: 10, data: { text: 'a' } },
            { type: 'step_started', runId: 'run-2', ts: 30, data: { name: 'execute:x' } },
            { type: 'text', runId: 'run-2', ts: 40, data: { text: 'b' } },
        ])).toBe('run-2');
        expect(latestRunId([{ type: 'user_input', ts: 1, data: 'hi' }])).toBe('');
    });
});

describe('the plan lists its steps first, then the requirements', () => {
    it('splits the todo list into steps and requirements, and merges an update by id', () => {
        const s = fold([engine('todo_update', {
            merge: false,
            todos: [
                { id: 'step-1', content: 'Write the page', status: 'completed' },
                { id: 'step-2', content: 'Test the form', status: 'in_progress' },
                { id: 'R1', content: 'R1: a booking form', status: 'completed' },
                { id: 'R2', content: 'R2: customer reviews', status: 'pending' },
            ],
        })]);
        expect(s.plan.steps.map(x => [x.id, x.status])).toEqual([['step-1', 'completed'], ['step-2', 'in_progress']]);
        expect(s.plan.requirements.map(x => [x.id, x.status])).toEqual([['R1', 'completed'], ['R2', 'pending']]);
        const merged = reduceActivity(s, engine('todo_update', { merge: true, todos: [{ id: 'R2', content: 'R2: customer reviews', status: 'completed' }] }));
        expect(merged.plan.requirements.map(x => x.status)).toEqual(['completed', 'completed']);
        expect(merged.plan.steps).toHaveLength(2);
    });
});

describe('events that never arrived are counted, and the run’s record fills them in', () => {
    it('counts the engine’s numbered events this panel did not receive', () => {
        const e1 = start('c1', 'file_read');
        const e2 = done('c1', 'file_read');
        const e3 = start('c2', 'shell_run', { command: 'npm test' });
        const e4 = failed('c2', 'shell_run', 'exit 1');
        const e5 = engine('engine_note', { kind: 'thought', text: 'Tests fail; reading the error.' });
        const live = fold([e1, e2, e5]);
        expect(live.missedEvents).toBe(2);
        expect(live.steps).toHaveLength(1);
        const filled = restoreActivity(live, RUN, [e1, e2, e3, e4, e5]);
        expect(filled.missedEvents).toBe(0);
        expect(filled.steps.map(x => [x.callId, x.ok])).toEqual([['c1', true], ['c2', false]]);
        expect(filled.notes).toHaveLength(1);
    });
});

describe('the files, the address and the screenshot come from what the run reported', () => {
    it('collects the files a call changed, a streamed file, an edit and the addresses served', () => {
        const s = fold([
            start('c1', 'file_write', { path: 'index.html' }),
            done('c1', 'file_write', 'wrote index.html', { filesChanged: [{ path: 'index.html', change: 'created', bytes: 120 }] }),
            start('c2', 'shell_start', { name: 'web', command: 'npx vite' }),
            done('c2', 'shell_start', 'ready', { served: { name: 'web', url: 'http://127.0.0.1:5173/' } }),
            engine('file_stream', { file: 'index.html', chunk: '<html>', done: true, bytes: 200 }),
            engine('file_stream', { file: 'draft.html', chunk: '<ht', done: false }),
            engine('diff', { path: 'src/App.tsx', content: 'x', additions: 3, deletions: 1 }),
            engine('preview_ready', { url: '/project-preview/chat-1/index.html' }),
        ]);
        expect(s.files.map(f => [f.path, f.change, f.bytes ?? null])).toEqual([
            ['src/App.tsx', 'modified', null],
            ['index.html', 'created', 200],
        ]);
        expect(s.files[0]).toMatchObject({ additions: 3, deletions: 1 });
        expect(s.steps[0].filesChanged).toEqual([{ path: 'index.html', change: 'created', bytes: 120 }]);
        expect(s.served.map(x => [x.kind, x.name, x.url])).toEqual([
            ['server', 'web', 'http://127.0.0.1:5173/'],
            ['preview', 'preview', '/project-preview/chat-1/index.html'],
        ]);
    });

    it('shows a screenshot it can load over a file it cannot, and only images this origin serves', () => {
        const capture = engine('screenshot', { status: 'success', pageName: 'Home', capture: { id: '0b9c3f6e-6c1d-4b7a-9d1e-2f3a4b5c6d7e' } });
        const file = done('c1', 'browser_screenshot', 'saved', { screenshotPath: 'D:\\Joe\\ws\\joe-app-1\\.joe\\shots\\step-3.png' });
        const s = fold([start('c1', 'browser_screenshot'), capture, file]);
        expect(s.latestScreenshot).toMatchObject({ kind: 'capture', captureId: '0b9c3f6e-6c1d-4b7a-9d1e-2f3a4b5c6d7e' });
        expect(s.steps[0].screenshotFile).toBe('step-3.png');
        const onlyFile = fold([start('c1', 'browser_screenshot'), file]);
        expect(onlyFile.latestScreenshot).toMatchObject({ kind: 'file', name: 'step-3.png' });

        const shown = reduceActivity(s, engine('browser_screenshot', { href: '/artifacts/browser-1793.jpg', url: 'http://127.0.0.1:5173/' }));
        expect(shown.latestScreenshot).toMatchObject({ kind: 'href', href: '/artifacts/browser-1793.jpg', pageUrl: 'http://127.0.0.1:5173/' });
        for (const href of ['https://elsewhere.example/a.png', '//elsewhere.example/a.png', '/artifacts/../secrets/a.png', '/artifacts/a.svg', 'javascript:alert(1)']) {
            expect(safeScreenshotHref(href)).toBeNull();
            expect(reduceActivity(shown, engine('browser_screenshot', { href })).latestScreenshot).toEqual(shown.latestScreenshot);
        }
    });
});

describe('a failed engine call is told apart from the end of a run', () => {
    it('recognises the engine’s own step events, and nothing else', () => {
        expect(isEngineStepEvent(failed('c1', 'shell_run'))).toBe(true);
        expect(isEngineStepEvent(start('c1', 'shell_run'))).toBe(true);
        expect(isEngineStepEvent({ type: 'step_failed', data: { name: 'execute:shell_execute' } })).toBe(false);
        expect(isEngineStepEvent({ type: 'step_failed', data: {} })).toBe(false);
        expect(isEngineStepEvent(engine('engine_note', { name: 'engine:x', text: 'y' }))).toBe(false);
        expect(isEngineStepEvent(null)).toBe(false);
    });
});

describe('the panel reads exactly what the engine sends', () => {
    it('folds the engine’s own live events into the plan, the steps, the notes, the verdict and the end', () => {
        const emit = uiEmitter('chat-1', RUN);
        const plan = newPlan(seededRequirements([{ text: 'a booking form' }, { text: 'customer reviews' }]));
        plan.steps = [{ title: 'Write the page', status: 'in_progress' }];
        emit({ type: 'plan', plan });
        emit({ type: 'step', step: 1 });
        emit({ type: 'thought', text: 'I will start the dev server first.' });
        emit({ type: 'tool_call', id: 'call_1_0', name: 'shell_start', args: { name: 'web', command: 'npm run dev' } });
        emit({ type: 'tool_result', id: 'call_1_0', name: 'shell_start', ok: true, output: 'VITE ready', durationMs: 4200,
            facts: { served: { name: 'web', command: 'npm run dev', cwd: '.', running: true, startedAt: 0, url: 'http://127.0.0.1:5173/' } } });
        emit({ type: 'step', step: 2 });
        emit({ type: 'tool_call', id: 'call_2_0', name: 'file_write', args: { path: 'src/App.tsx', content: 'x'.repeat(9000) } });
        emit({ type: 'tool_result', id: 'call_2_0', name: 'file_write', ok: true, output: 'wrote src/App.tsx', durationMs: 30,
            facts: { filesChanged: [{ path: 'src/App.tsx', change: 'modified', bytes: 9000 }] } });
        emit({ type: 'tool_result', id: 'call_2_1', name: 'file_wirte', ok: false, output: 'There is no tool "file_wirte".', durationMs: 0 });
        emit({ type: 'verification', report: {
            passed: false, at: 0,
            checks: [{ id: 'serve', status: 'passed', detail: 'the page answered 200' }, { id: 'requirements', status: 'failed', detail: 'R2 not proven' }],
            unproven: [{ id: 'R2', text: 'customer reviews', reason: 'no reviews section on the page' }],
        } });
        emit({ type: 'final', result: { status: 'failed', summary: '', reason: 'the deadline arrived before the checks passed', filesChanged: [], served: [], steps: 2, model: 'ollama/qwen3.5:9b' } });

        let t = 1_700_000_000_000;
        //  The wire stamps the time on every event; the mock stands in for the wire.
        const wire = (broadcast as jest.Mock).mock.calls.map(c => ({ ...c[0], ts: (t += 100) }));
        expect(wire.length).toBeGreaterThan(8);
        const s = fold(wire);

        expect(s.runId).toBe(RUN);
        expect(s.step).toBe(2);
        expect(s.missedEvents).toBe(0);
        expect(s.plan.steps.map(x => x.content)).toEqual(['Write the page']);
        expect(s.plan.requirements.map(x => x.content)).toEqual(['R1: a booking form', 'R2: customer reviews']);
        expect(s.steps.map(x => [x.tool, x.ok])).toEqual([['shell_start', true], ['file_write', true], ['file_wirte', false]]);
        expect(s.steps[0]).toMatchObject({ durationMs: 4200, output: 'VITE ready', served: { name: 'web', url: 'http://127.0.0.1:5173/' } });
        expect(inputSummary(s.steps[1].tool, s.steps[1].input)).toBe('src/App.tsx');
        expect(s.steps[1].input).toMatch(/more characters in the run record\]$/);
        expect(s.served).toEqual([expect.objectContaining({ kind: 'server', name: 'web', url: 'http://127.0.0.1:5173/' })]);
        expect(s.files).toEqual([expect.objectContaining({ path: 'src/App.tsx', change: 'modified', bytes: 9000 })]);
        expect(s.notes.map(x => x.kind)).toEqual(['thought', 'verification']);
        expect(s.notes[0].text).toBe('I will start the dev server first.');
        expect(s.verification).toMatchObject({ passed: false, unproven: [{ id: 'R2', reason: 'no reviews section on the page' }] });
        expect(s.final).toMatchObject({ status: 'failed', steps: 2, model: 'ollama/qwen3.5:9b', reason: 'the deadline arrived before the checks passed' });
    });
});
