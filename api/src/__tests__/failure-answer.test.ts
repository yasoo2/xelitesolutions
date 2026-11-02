import { failureAnswerOf } from '../core/orchestrator/failure-answer';
import { AgentLoopService } from '../modules/services/AgentLoopService';
import { composeFailure } from '../core/orchestrator/answerComposer';

const deadline = { status: 'failed', reason: 'engineering_planning_failed', executed: false,
    plannerResult: { status: 'failed', blocker: { code: 'planner_deadline_exceeded', message: 'Planner run exceeded its total finite deadline.' } }, pipelineFinal: true };

test('real AgentLoop extraction and final composer preserve the measured planner failure', () => {
    const result = { ok: false, result: deadline, steps: [{ id: 'plan', task: 'Plan the requested agent', status: 'failed', result: deadline }] };
    const detail = AgentLoopService.extractAnswer(result, 'en');
    expect(detail).toBe('Planner run exceeded its total finite deadline.');
    const visible = composeFailure(result.steps, detail, 'en');
    expect(visible).toContain('Stopped at step'); expect(visible).toContain(detail); expect(visible).not.toMatch(/— (?:true|false)/u);
});
test('partial execution blocker keeps its honest explanation', () => {
    expect(failureAnswerOf({ status: 'partial', executed: false, message: 'The plan is available; execution has not started.', plannerResult: { projectName: 'agent' }, pipelineFinal: true })).toBe('The plan is available; execution has not started.');
});
test.each([true, false, 0, 42, null, undefined, { pipelineFinal: true }, { success: true }, { status: 'failed', executed: false }])('metadata cannot become failure prose: %p', value => {
    expect(failureAnswerOf(value)).toBe(''); expect(AgentLoopService.extractAnswer({ ok: false, result: value })).toBe('');
});
test('reason and measured error remain available without narrative text', () => {
    expect(failureAnswerOf({ status: 'failed', reason: 'permission_denied', pipelineFinal: true })).toBe('permission_denied');
    expect(failureAnswerOf({ error: 'File not found', status: 'failed' })).toBe('File not found');
});
test('failure maps preserve the last speaking step but ignore boolean receipts', () => {
    expect(failureAnswerOf({ read: { message: 'Read the selected file' }, final: { success: true } })).toBe('Read the selected file');
});
test('accessors and Proxy traps never execute while selecting the failure', () => {
    const getter = jest.fn(() => 'private'); const trap = jest.fn();
    expect(failureAnswerOf(Object.defineProperty({ pipelineFinal: true }, 'message', { get: getter }))).toBe('');
    expect(failureAnswerOf(new Proxy(deadline, { getOwnPropertyDescriptor: trap, get: trap }))).toBe('');
    expect(getter).not.toHaveBeenCalled(); expect(trap).not.toHaveBeenCalled();
});
test('cyclic and excessively deep metadata is bounded', () => {
    const cycle: any = {}; cycle.self = cycle; expect(failureAnswerOf(cycle)).toBe('');
    let deep: any = { message: 'unbounded leaf' }; for (let i = 0; i < 20; i++) deep = { output: deep };
    expect(failureAnswerOf(deep)).toBe('');
});
test('identity fields and private configuration are not speaking steps', () => {
    expect(failureAnswerOf({ userId: 'private-user', workspaceId: 'private-workspace', apiKey: 'private-key', token: 'private-token' })).toBe('');
});
test('successful scalar and explicit prose extraction stays unchanged', () => {
    expect(AgentLoopService.extractAnswer({ ok: true, result: { echo: 42 } })).toBe('42');
    expect(AgentLoopService.extractAnswer({ ok: true, result: { answer: { summary: 'Useful answer', message: 'Done' } } })).toBe('Useful answer');
    expect(AgentLoopService.extractAnswer({ ok: true, result: { echo: 'true' } })).toBe('true');
});
test('failed user-facing text is bounded and remains a string', () => {
    expect(failureAnswerOf({ message: 'x'.repeat(5000) }).length).toBe(1200);
});
test('synthetic provider credentials in a measured error are redacted', () => {
    const synthetic = 'sk-' + 'x'.repeat(40);
    const detail = failureAnswerOf({ blocker: { message: 'Provider refused ' + synthetic } });
    expect(detail).toContain('[REDACTED]'); expect(detail).not.toContain(synthetic);
});
test('the actual failure composer does not speak a primitive control receipt', () => {
    const text = composeFailure([{ id: 'plan', task: 'Plan project', status: 'failed', result: true }], failureAnswerOf(true), 'en');
    expect(text).toContain('Stopped at step'); expect(text).not.toMatch(/\b(?:true|false)\b/u);
});


test('native Error and TypeError retain their own measured message', () => {
    expect(failureAnswerOf(new Error('Planner exceeded deadline'))).toBe('Planner exceeded deadline');
    expect(failureAnswerOf({ blocker: new TypeError('Invalid task type') })).toBe('Invalid task type');
});
test('custom native error subclasses retain own prose without evaluating accessors', () => {
    class PlanningError extends Error { }
    const getter = jest.fn(() => 'private');
    const error = new PlanningError('Measured planning failure');
    Object.defineProperty(error, 'summary', { get: getter });
    expect(failureAnswerOf(error)).toBe('Measured planning failure');
    expect(getter).not.toHaveBeenCalled();
    Object.defineProperty(error, 'message', { get: getter });
    expect(failureAnswerOf(error)).toBe(''); expect(getter).not.toHaveBeenCalled();
});
