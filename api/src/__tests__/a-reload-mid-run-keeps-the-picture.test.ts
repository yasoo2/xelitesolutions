/**
 * A page opened while Joe works shows what Joe has done so far: the live card,
 * the plan and the terminal, rebuilt from the run's own record. Measured on
 * 2026-11-05: forty-eight steps into the clinic's Build stage, a reload showed
 * «Joe is working · Understand» and nothing else.
 */
import fs from 'fs';
import path from 'path';
import { replayRunState } from '../../../web/src/lib/run-replay';

const WEB = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'web', 'src', ...p), 'utf8');

// The shape GET /runs/:id/receipt returns (run-1793904577852, abridged).
const events = [
    { type: 'user_input', ts: 1000, data: { text: 'Build a complete clinic management system' } },
    { type: 'thinking_phase', ts: 1100, data: { phase: 'analyzing', detail: 'Reading your request and working out exactly what you want' } },
    { type: 'todo_update', ts: 1200, data: { todos: [{ content: 'Seed data, server entry point', status: 'completed' }, { content: 'Scaffold React + Vite frontend', status: 'in_progress' }] } },
    { type: 'step_started', ts: 1300, data: { name: 'engine:shell_run', input: '{"command":"npm install"}' } },
    { type: 'tool_started', ts: 1310, data: { tool: 'engine_shell_run' } },
    { type: 'terminal_output', ts: 1320, data: 'joe-app-3904577852 $ npm install\r\n' },
    { type: 'terminal_output', ts: 1330, data: 'added 65 packages in 17s\r\n' },
    { type: 'thinking_detail', ts: 1400, data: { detail: 'The backend passes all 41 API tests. Next, the React frontend.' } },
    { type: 'thinking_detail', ts: 1401, data: { detail: 'The backend passes all 41 API tests. Next, the React frontend.' } },
    { type: 'step_done', ts: 1500, data: {} },
    { type: 'thinking_phase', ts: 1600, data: { phase: 'executing', detail: 'Running: engine shell run' } },
];

describe('a reload mid-run keeps the picture', () => {
    it('rebuilds the steps, the phase, the current action, the plan and the terminal', () => {
        const r = replayRunState(events);
        expect(r.steps.map(s => s.text)).toEqual([
            'Reading your request and working out exactly what you want',
            'The backend passes all 41 API tests. Next, the React frontend.',
            'Running: engine shell run',
        ]);
        expect(r.steps[1].at).toBe(1400);
        expect(r.phase).toBe('executing');
        expect(r.status).toBe('Running: engine shell run');
        expect(r.tasks.map(t => t.label)).toEqual(['Seed data, server entry point', 'Scaffold React + Vite frontend']);
        expect(r.terminal).toContain('npm install');
        expect(r.terminal).toContain('added 65 packages');
        expect(r.startedAt).toBe(1000);
    });

    it('follows the live handler\'s automatic phases', () => {
        expect(replayRunState([{ type: 'user_input', ts: 1 }, { type: 'tool_started', ts: 2 }]).phase).toBe('executing');
        expect(replayRunState([{ type: 'user_input', ts: 1 }, { type: 'step_done', ts: 2 }]).phase).toBe('synthesizing');
        expect(replayRunState([]).steps).toEqual([]);
    });

    it('the socket seeds a session from it, without dispatching chat events', () => {
        const socket = WEB('services', 'socket.ts');
        const seed = socket.slice(socket.indexOf('seedRun('), socket.indexOf('seedRun(') + 2600);
        expect(seed).toMatch(/replayRunState\(/);
        expect(seed).not.toMatch(/forSession\(listeners,/);
        expect(seed).toMatch(/thinkingStepsListeners/);
        expect(seed).toMatch(/taskTrackerListeners/);
    });

    it('the page asks the run\'s record when it opens a running conversation', () => {
        const joe = WEB('pages', 'Joe.tsx');
        expect(joe).toMatch(/\/runs\/\$\{[^}]+\}\/receipt[\s\S]{0,600}SocketService\.seedRun\(/);
    });

    it('the live card subscribes after it resets, so a cached picture is not wiped', () => {
        const card = WEB('components', 'NeuralThinkingIndicator.tsx');
        const reset = card.indexOf('setSteps([]);');
        const subscribe = card.indexOf('SocketService.subscribeThinkingSteps(');
        expect(reset).toBeGreaterThan(-1);
        expect(subscribe).toBeGreaterThan(reset);
    });
});
