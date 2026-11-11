/**
 * THE ENGINE SHOWS ITS WORK AS IT GOES, AND KEEPS IT IN ITS OWN FOLDER.
 *
 * What the owner sees live:
 *   - the plan, as the todo list;
 *   - each tool call, as a step pair in the shape a reloaded session returns;
 *   - the model's words and the checks' verdicts.
 * Where the project lives: a folder of its own inside the workspace, or the
 * folder of the project he asked to change, never anywhere else.
 */
jest.mock('../api/ws', () => ({ broadcast: jest.fn(), broadcastThinkingDetail: jest.fn() }));
import fs from 'fs';
import os from 'os';
import path from 'path';
import { broadcast, broadcastThinkingDetail } from '../api/ws';
import { projectFolderFor, uiEmitter, UI_TEXT_LIMIT } from '../core/engine/run';
import { newPlan, seededRequirements } from '../core/engine/plan';

let base: string;
beforeAll(() => { base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-run-')); });
afterAll(() => fs.rmSync(base, { recursive: true, force: true }));
afterEach(() => { (broadcast as jest.Mock).mockReset(); (broadcastThinkingDetail as jest.Mock).mockReset(); });

const sent = () => (broadcast as jest.Mock).mock.calls.map(c => c[0]);

describe('the live events', () => {
    it('the plan becomes the todo list, steps first, then the requirements', () => {
        const emit = uiEmitter('chat-1', 'run-1');
        const plan = newPlan(seededRequirements([{ text: 'a booking form' }, { text: 'customer reviews' }]));
        plan.steps = [{ title: 'Write the page', status: 'done' }, { title: 'Test the form', status: 'in_progress' }];
        plan.requirements[0].status = 'done';
        emit({ type: 'plan', plan });
        const [e] = sent();
        expect(e.type).toBe('todo_update');
        expect(e.sessionId).toBe('chat-1');
        expect(e.runId).toBe('run-1');
        expect(e.data.todos).toEqual([
            { id: 'step-1', content: 'Write the page', status: 'completed' },
            { id: 'step-2', content: 'Test the form', status: 'in_progress' },
            { id: 'R1', content: 'R1: a booking form', status: 'completed' },
            { id: 'R2', content: 'R2: customer reviews', status: 'pending' },
        ]);
    });

    it('a tool call is a step pair, its output clipped, with the facts the panel shows', () => {
        const emit = uiEmitter('chat-1', 'run-1');
        emit({ type: 'tool_call', id: 'c1', name: 'shell_start', args: { name: 'web', command: 'npm run dev' } });
        emit({ type: 'tool_result', id: 'c1', name: 'shell_start', ok: true, output: 'x'.repeat(UI_TEXT_LIMIT + 50), durationMs: 1200,
            facts: { served: { name: 'web', command: 'npm run dev', cwd: '.', running: true, startedAt: 0, url: 'http://127.0.0.1:5173/' } } });
        emit({ type: 'tool_result', id: 'c2', name: 'shell_run', ok: false, output: 'exit 1', durationMs: 5 });
        const [start, done, failed] = sent();
        expect(start).toMatchObject({ type: 'step_started', data: { name: 'engine:shell_start', callId: 'c1', input: '{"name":"web","command":"npm run dev"}' } });
        expect(done.type).toBe('step_done');
        expect(done.data.result.ok).toBe(true);
        expect(done.data.result.output.length).toBeLessThan(UI_TEXT_LIMIT + 100);
        expect(done.data.result.output).toMatch(/50 more characters in the run record/);
        expect(done.data.served).toEqual({ name: 'web', url: 'http://127.0.0.1:5173/' });
        expect(failed).toMatchObject({ type: 'step_failed', data: { name: 'engine:shell_run', result: { ok: false, output: 'exit 1' } } });
    });

    it('the model\'s words reach both the trace and the activity panel', () => {
        const emit = uiEmitter('chat-1', 'run-1');
        emit({ type: 'thought', text: 'The form posts nowhere; I will add a handler.' });
        expect((broadcastThinkingDetail as jest.Mock).mock.calls[0]).toEqual(['chat-1', 'The form posts nowhere; I will add a handler.']);
        expect(sent()[0]).toMatchObject({ type: 'engine_note', data: { kind: 'thought', text: 'The form posts nowhere; I will add a handler.' } });
    });

    it('without a session nothing is sent', () => {
        uiEmitter(undefined, 'run-1')({ type: 'thought', text: 'x' });
        expect(sent()).toEqual([]);
    });
});

describe('the project folder', () => {
    it('a new project gets its own folder inside the workspace', async () => {
        const r = await projectFolderFor(base, 'run-1793271234567');
        expect('dir' in r && r.resumed).toBe(false);
        const dir = (r as any).dir as string;
        expect(path.dirname(dir)).toBe(path.resolve(base));
        expect(fs.statSync(dir).isDirectory()).toBe(true);
    });

    it('a project to change keeps its folder, if it is inside the workspace and exists', async () => {
        const existing = path.join(base, 'clinic-site');
        fs.mkdirSync(existing, { recursive: true });
        expect(await projectFolderFor(base, 'run-2', existing)).toEqual({ dir: path.resolve(existing), resumed: true });
        expect(await projectFolderFor(base, 'run-3', path.join(base, 'missing'))).toEqual({ error: 'The project to change does not exist.' });
        expect(await projectFolderFor(base, 'run-4', os.tmpdir())).toEqual({ error: 'The project folder is not inside this workspace.' });
    });
});
