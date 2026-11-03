/**
 * THE ENGINE'S WORKING MEMORY: THE TURN IT READS, THE PLAN IT KEEPS, THE
 * HISTORY IT FOLDS.
 *
 *  - A tool call a small model writes as TEXT is still a call.
 *  - The requested items cannot be dropped from the plan.
 *  - A long observation is cut, and the full text is saved where the model can
 *    read it.
 *  - Compaction keeps the request and the newest turns verbatim, never
 *    separates a tool result from its call, and summarises only what was
 *    measured, including the latest errors.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readModelTurn } from '../core/engine/toolcalls';
import { applyPlanUpdate, newPlan, parsePlanArgs, seededRequirements } from '../core/engine/plan';
import { Conversation, budgetFor, bound } from '../core/engine/context';
import type { ChatMessage, RunState } from '../core/engine/types';

const roots: string[] = [];
function dir(): string {
    const d = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-engine-memory-'));
    roots.push(d);
    return d;
}
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true }); });

const KNOWN = new Set(['file_write', 'shell_run', 'task_finish']);

describe('reading the model\'s turn', () => {
    it('native tool calls come back from the router as a JSON envelope', () => {
        const raw = JSON.stringify({ type: 'tool_calls', tool_calls: [{ id: 'a1', function: { name: 'shell_run', arguments: '{"command":"npm test"}' } }] });
        const turn = readModelTurn(raw, KNOWN, 1, 5);
        expect(turn.toolCalls).toEqual([{ id: 'a1', name: 'shell_run', arguments: '{"command":"npm test"}' }]);
        expect(turn.text).toBe('');
    });

    it('a Qwen <tool_call> written into the text is a call, and the rest of the text is kept', () => {
        const raw = 'I will run the tests.\n<tool_call>\n{"name": "shell_run", "arguments": {"command": "npm test"}}\n</tool_call>';
        const turn = readModelTurn(raw, KNOWN, 3, 5);
        expect(turn.toolCallsFromText).toBe(true);
        expect(turn.toolCalls).toEqual([{ id: 'call_3_0', name: 'shell_run', arguments: '{"command":"npm test"}' }]);
        expect(turn.text).toBe('I will run the tests.');
    });

    it('a fenced JSON call is read; a fenced block naming no known tool stays text', () => {
        const call = readModelTurn('```json\n{"tool": "file_write", "args": {"path": "a.txt", "content": "x"}}\n```', KNOWN, 1, 1);
        expect(call.toolCalls.map(c => c.name)).toEqual(['file_write']);
        const prose = readModelTurn('```json\n{"name": "Ahmad", "age": 4}\n```', KNOWN, 1, 1);
        expect(prose.toolCalls).toEqual([]);
        expect(prose.text).toContain('"Ahmad"');
    });

    it('arguments that are not a JSON object are not a call', () => {
        const turn = readModelTurn('<tool_call>{"name": "shell_run", "arguments": "npm test"}</tool_call>', KNOWN, 1, 1);
        expect(turn.toolCalls).toEqual([]);
    });

    it('a reasoning block is not shown as text', () => {
        expect(readModelTurn('<think>hmm</think>Done.', KNOWN, 1, 1).text).toBe('Done.');
    });
});

describe('the plan cannot lose what was asked', () => {
    it('items are numbered in reading order and duplicates are read once', () => {
        const reqs = seededRequirements([
            { text: 'a list of patients', key: 'k1' }, { text: 'A list of  patients' }, { text: 'a chart of visits', key: 'k2' }, { text: 'x', key: 'k1' },
        ]);
        expect(reqs.map(r => `${r.id}:${r.text}`)).toEqual(['R1:a list of patients', 'R2:a chart of visits']);
        expect(reqs.every(r => r.fromRequest && r.status === 'open')).toBe(true);
    });

    it('progress is recorded, an unknown id is named, and nothing can be removed', () => {
        const plan = newPlan(seededRequirements([{ text: 'a list of patients' }, { text: 'a chart' }]));
        const parsed = parsePlanArgs({ requirements: [{ id: 'r1', status: 'done', evidence: 'seen in browser' }, { id: 'R7', status: 'done' }] });
        expect(parsed.ok).toBe(true);
        const problems = applyPlanUpdate(plan, (parsed as any).value);
        expect(problems).toEqual(['There is no requirement R7; the ids are R1, R2.']);
        expect(plan.requirements.map(r => `${r.id}:${r.status}`)).toEqual(['R1:done', 'R2:open']);
        // A step list replaces the steps; it has no way to touch requirements.
        applyPlanUpdate(plan, { steps: [{ title: 'only this', status: 'in_progress' }] });
        expect(plan.requirements.length).toBe(2);
    });

    it('only one step stays in progress', () => {
        const plan = newPlan([]);
        const problems = applyPlanUpdate(plan, { steps: [{ title: 'a', status: 'in_progress' }, { title: 'b', status: 'in_progress' }] });
        expect(problems[0]).toMatch(/2 steps were marked in_progress/);
        expect(plan.steps.map(s => s.status)).toEqual(['in_progress', 'pending']);
    });

    it('the model may add items, numbered after the request\'s own', () => {
        const plan = newPlan(seededRequirements([{ text: 'a form' }]));
        applyPlanUpdate(plan, { add_requirements: [{ text: 'form validation' }, { text: 'a form' }] });
        expect(plan.requirements.map(r => `${r.id}:${r.text}:${r.fromRequest}`)).toEqual(['R1:a form:true', 'R2:form validation:false']);
    });

    it('arguments it cannot use are refused with what to send instead', () => {
        expect(parsePlanArgs({ steps: 'do it' })).toEqual({ ok: false, error: expect.stringMatching(/"steps" must be a list/) });
        expect(parsePlanArgs({ steps: [{ title: 'a', status: 'started' }] })).toEqual({ ok: false, error: expect.stringMatching(/not one of pending, in_progress, done/) });
        expect(parsePlanArgs({})).toEqual({ ok: false, error: expect.stringMatching(/needs at least one/) });
    });
});

describe('long observations are cut, never lost', () => {
    it('head and tail survive, and the message names the file that holds everything', async () => {
        const d = dir();
        const conv = new Conversation(path.join(d, '.joe'), budgetFor(8_192));
        const long = 'HEAD-LINE\n' + 'x'.repeat(50_000) + '\nTAIL-LINE';
        const shown = await conv.observation('shell_run', 7, long, d);
        expect(shown.length).toBeLessThan(long.length);
        expect(shown.startsWith('HEAD-LINE')).toBe(true);
        expect(shown.endsWith('TAIL-LINE')).toBe(true);
        const m = /The full text is in (\S+) \(read it with file_read\)/.exec(shown);
        expect(m).not.toBeNull();
        expect(fs.readFileSync(path.join(d, m![1]), 'utf8')).toBe(long);
    });

    it('a short observation is passed through unchanged', async () => {
        const d = dir();
        const conv = new Conversation(path.join(d, '.joe'), budgetFor(8_192));
        expect(await conv.observation('shell_run', 1, 'ok', d)).toBe('ok');
        expect(bound('abc', 10)).toBe('abc');
    });

    it('a bigger window gives an observation more room', () => {
        expect(budgetFor(131_072).observationChars).toBeGreaterThan(budgetFor(16_384).observationChars);
        expect(budgetFor(16_384).compactAtTokens).toBeLessThan(16_384);
    });
});

describe('compaction keeps the request, the newest turns and the last errors', () => {
    function state(): RunState {
        return {
            plan: newPlan(seededRequirements([{ text: 'a booking form' }])),
            files: new Map([['index.html', { path: 'index.html', change: 'created', bytes: 120 }]]),
            commands: [{ command: 'npm run build', cwd: '.', exitCode: 1, durationMs: 900 }],
            served: [], pages: [], verifications: [], steps: 9, modelMs: 0, toolMs: 0,
        };
    }

    it('folds the middle into a measured summary and keeps every tool result with its call', () => {
        const d = dir();
        const conv = new Conversation(path.join(d, '.joe'), budgetFor(8_192));
        conv.push({ role: 'system', content: 'SYSTEM' });
        conv.push({ role: 'user', content: 'REQUEST' });
        for (let i = 0; i < 30; i++) {
            conv.push({ role: 'assistant', content: '', tool_calls: [{ id: `t${i}`, type: 'function', function: { name: 'shell_run', arguments: `{"command":"step ${i}"}` } }] });
            conv.push({ role: 'tool', tool_call_id: `t${i}`, content: `output ${i} ` + 'y'.repeat(900) });
        }
        expect(conv.needsCompaction()).toBe(true);
        const before = conv.length;
        const c = conv.compact(state(), ['shell_run: exit 1: npm run build: Missing script "build"']);
        expect(c.removed).toBeGreaterThan(0);
        const h = conv.history() as ChatMessage[];
        expect(h[0]).toEqual({ role: 'system', content: 'SYSTEM' });
        expect(h[1]).toEqual({ role: 'user', content: 'REQUEST' });
        const summary = String((h[2] as any).content);
        expect(summary).toContain('created index.html (120 bytes)');
        expect(summary).toContain('exit 1 · npm run build');
        expect(summary).toContain('Missing script "build"');
        // The kept tail starts on an assistant turn, and every tool result's call is kept.
        expect(h[3].role).toBe('assistant');
        const callIds = new Set(h.flatMap(m => m.role === 'assistant' ? (m.tool_calls ?? []).map(t => t.id) : []));
        for (const m of h) if (m.role === 'tool') expect(callIds.has(m.tool_call_id)).toBe(true);
        // The newest turn is kept verbatim.
        expect((h[h.length - 1] as any).content).toContain('output 29');
        expect(conv.length).toBeLessThan(before);
        expect(conv.needsCompaction()).toBe(false);
    });

    it('too many messages is a reason to compact, even when they are short', () => {
        const d = dir();
        const conv = new Conversation(path.join(d, '.joe'), budgetFor(262_144, 0, 20));
        conv.push({ role: 'system', content: 's' });
        conv.push({ role: 'user', content: 'r' });
        for (let i = 0; i < 12; i++) {
            conv.push({ role: 'assistant', content: '', tool_calls: [{ id: `t${i}`, type: 'function', function: { name: 'shell_run', arguments: '{}' } }] });
            conv.push({ role: 'tool', tool_call_id: `t${i}`, content: 'ok' });
        }
        expect(conv.needsCompaction()).toBe(true);
        conv.compact(state(), []);
        expect(conv.length).toBeLessThanOrEqual(20);
    });
});
