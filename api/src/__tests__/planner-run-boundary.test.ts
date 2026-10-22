const mockCallLLM = jest.fn();
const mockUnexpected = jest.fn(() => { throw new Error('Unexpected planner execution effect'); });
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));
jest.mock('../core/llm/intelligent-router', () => ({
    isProviderFailure: (value: unknown) => typeof value === 'string' && value.startsWith('PROVIDER_FAILURE:'),
    retryAfterMsFrom: () => 1000,
}));
jest.mock('../modules/services/ToolService', () => ({ TOOL_ALIASES: {}, executeTool: mockUnexpected }));
jest.mock('../modules/tools/registry', () => ({ tools: ['write_file', 'ai_write_file', 'read_file', 'file_edit', 'react_project', 'quality_run'].map(name => ({ name, inputSchema: { type: 'object', properties: {} }, execute: mockUnexpected })) }));

import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { createPlannerRunBoundary } from '../core/orchestrator/planner-run-boundary';

const request = 'Repair the existing counter module after a launchability failure. Preserve working behavior.';
const evidence: any = { version: 1, mode: 'existing_workspace', workspaceRoot: '/owned/project', instructionFiles: [], facts: [], blockers: [], constraints: {localOnly: true, forbidDeploy: true, userRequestedExistingProject: true, createsNewProject: false}, selectedProject: { root: '/owned/project', projectKinds: ['node'], manifests: [{path: '/owned/project/package.json', kind: 'package.json'}], git: {isRepository: false}, likelyEntrypoints: ['/owned/project/src/counter.ts'], sourceFiles: ['/owned/project/src/counter.ts'], testFiles: ['/owned/project/tests/counter.test.ts'], candidateChecks: [] } };
const plan = JSON.stringify({ projectName: 'Counter repair', projectVibe: 'Bounded runnable-contract repair', totalPhases: 1, estimatedDuration: 'short', dependencies: [], phases: [{ phaseNumber: 1, name: 'Fix runnable contract', description: 'Repair the existing counter module entrypoint.', requirementsCovered: ['R1'], tasks: [ {task: 'Fix counter entrypoint', tool: 'write_file', args: {path: 'src/counter.ts', content: 'export const counter = 0;'}, priority: 'high', realisticMinutes: 1}, {task: 'Repair existing counter test', tool: 'write_file', args: {path: 'tests/counter.test.ts', content: 'export const contract = true;'}, priority: 'high', realisticMinutes: 1} ], verificationTask: {task: 'Read repaired counter entrypoint', tool: 'read_file', args: {path: 'src/counter.ts'}}, deliverables: ['src/counter.ts', 'tests/counter.test.ts'], estimatedTime: 'short' }] });
const context = () => ({ sessionId: 'owned-session', runId: 'owned-run', workspaceId: 'owned-workspace', userId: 'owned-user', modelConfig: {provider: 'local', model: 'explicit-local-model'}, repairMode: true, plannerTimeoutMs: 1000 });
const run = (extra: any = {}, description = request) => new ProjectPlannerTool().execute({ projectDescription: description, evidence }, {...context(), ...extra});
const deferred = () => { let resolve!: (value: string) => void, reject!: (error: Error) => void; const promise = new Promise<string>((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function stopped(result: any, code = 'planner_cancelled') {
    expect(result).toMatchObject({ok: false, error: code, output: {totalPhases: 0, phases: [], autoExecuted: false, executionPolicy: 'planner_only', executionStatus: 'not_started', verificationStatus: 'not_run'}});
}

describe('real planner owner cancellation and total deadline', () => {
    beforeEach(() => {jest.useFakeTimers(); mockCallLLM.mockReset(); mockUnexpected.mockClear();});
    afterEach(() => {expect(mockUnexpected).not.toHaveBeenCalled(); jest.restoreAllMocks(); jest.useRealTimers();});
    test('already aborted owner causes zero provider dispatch', async () => {
        const owner = new AbortController(); owner.abort();
        stopped(await run({signal: owner.signal}));
        expect(mockCallLLM).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
    });
    test.each([false, 'false', 0, {}, () => 0, () => 'false', () => {throw new Error('private synthetic failure');}])('malformed cancellation fails closed before provider: %p', async value => {
        stopped(await run({isCancelled: value})); expect(mockCallLLM).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
    });
    test.each(['resolve', 'reject'])('owner abort settles an ignoring provider and observes late %s', async mode => {
        const owner = new AbortController(), provider = deferred(); mockCallLLM.mockReturnValue(provider.promise);
        const result = run({signal: owner.signal}); await flush();
        expect(mockCallLLM).toHaveBeenCalledTimes(1); const ownedSignal = mockCallLLM.mock.calls[0][2].signal;
        expect(ownedSignal).not.toBe(owner.signal); owner.abort(); stopped(await result); expect(ownedSignal.aborted).toBe(true);
        mode === 'resolve' ? provider.resolve(plan) : provider.reject(new Error('synthetic late provider rejection'));
        await flush(); expect(mockCallLLM).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
    });
    test('callback changes before a provider resolves; cancellation wins without a timer tick', async () => {
        let cancel = false; mockCallLLM.mockImplementation(() => {cancel = true; return Promise.resolve(plan);});
        stopped(await run({isCancelled: () => cancel})); expect(mockCallLLM).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
    });
    test('callback cancellation during a pending provider settles and frees its interval', async () => {
        let cancel = false; const provider = deferred(); mockCallLLM.mockReturnValue(provider.promise);
        const result = run({isCancelled: () => cancel}); await flush(); cancel = true;
        await jest.advanceTimersByTimeAsync(10); stopped(await result); provider.resolve(plan); await flush(); expect(jest.getTimerCount()).toBe(0);
    });
    test('owner cancellation Promise rejection cancels, without exposing its private reason', async () => {
        let reject!: (reason: Error) => void;
        const cancellation = new Promise<void>((_resolve, no) => {reject = no;});
        const provider = deferred(); mockCallLLM.mockReturnValue(provider.promise);
        const result = run({cancellation}); await flush(); reject(new Error('private owner detail'));
        const value = await result; stopped(value); expect(JSON.stringify(value)).not.toContain('private owner detail'); provider.resolve(plan); await flush();
    });
    test('malformed async callback rejection is observed and cannot dispatch a provider', async () => {
        const callback = jest.fn(() => Promise.reject(new Error('private async callback')));
        stopped(await run({isCancelled: callback})); await flush();
        expect(callback).toHaveBeenCalledTimes(1);
        expect(mockCallLLM).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
    test('throwing thenable shape in owner callback fails closed before provider', async () => {
        stopped(await run({isCancelled: () => Object.defineProperty({}, 'then', {get() {throw new Error('private getter');}})}));
        expect(mockCallLLM).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
    test('one finite total deadline settles an ignoring provider without a retry', async () => {
        const provider = deferred(); mockCallLLM.mockReturnValue(provider.promise);
        const result = run({plannerTimeoutMs: 20}); await flush(); await jest.advanceTimersByTimeAsync(20);
        stopped(await result, 'planner_deadline_exceeded'); expect(mockCallLLM).toHaveBeenCalledTimes(1); expect(mockCallLLM.mock.calls[0][2].signal.aborted).toBe(true);
        provider.reject(new Error('late deadline rejection')); await flush(); expect(jest.getTimerCount()).toBe(0);
    });
    test('cancellation after first malformed response prevents recovery provider dispatch', async () => {
        const owner = new AbortController(); mockCallLLM.mockImplementation(() => {owner.abort(); return Promise.resolve('{}');});
        stopped(await run({signal: owner.signal})); expect(mockCallLLM).toHaveBeenCalledTimes(1);
    });
    test('recovery inherits the same owned signal, identity, explicit model and decreasing total budget', async () => {
        const settings = context(); mockCallLLM.mockImplementationOnce(async () => {jest.advanceTimersByTime(400); return '{}';}).mockResolvedValueOnce(plan);
        const result: any = await run(); expect(result.error).not.toBe('planner_cancelled');
        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        const first = mockCallLLM.mock.calls[0][2], second = mockCallLLM.mock.calls[1][2];
        expect(first.signal).toBe(second.signal); expect(second).toMatchObject({sessionId: settings.sessionId, workspaceId: settings.workspaceId, runId: settings.runId, modelConfig: settings.modelConfig, engineeringPipeline: false});
        expect(first.providerTimeoutMs).toBeLessThanOrEqual(1000); expect(second.providerTimeoutMs).toBeLessThanOrEqual(600); expect(jest.getTimerCount()).toBe(0);
    });
    test('a successful normal plan stays planner-only and allocates no callback interval', async () => {
        const interval = jest.spyOn(global, 'setInterval'); mockCallLLM.mockResolvedValue(plan);
        const result: any = await run(); expect(result.ok).toBe(true); expect(result.output.autoExecuted).toBe(false); expect(result.output.phases.length).toBeGreaterThan(0);
        expect(interval).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
    });
    test('an invalid normal plan remains a failure, distinct from cancellation', async () => {
        mockCallLLM.mockResolvedValue('{}'); const result: any = await run(); expect(result.ok).toBe(false); expect(result.error).not.toBe('planner_cancelled'); expect(result.output.autoExecuted).toBe(false); expect(jest.getTimerCount()).toBe(0);
    });
    test('the complete large brief tail reaches the cancellable canonical provider boundary', async () => {
        const brief = request + '\n' + 'counter background detail '.repeat(250) + '\nTAIL-LONG-REQUEST-SENTINEL-20261011';
        const owner = new AbortController(), provider = deferred(); mockCallLLM.mockReturnValue(provider.promise);
        const result = run({signal: owner.signal}, brief); await flush(); expect(mockCallLLM.mock.calls[0][0]).toContain(brief); owner.abort(); stopped(await result); provider.resolve(plan); await flush();
    });
    test('capped backoff aborts immediately and removes its listener and timer', async () => {
        const owner = new AbortController(), boundary = createPlannerRunBoundary({signal: owner.signal, plannerTimeoutMs: 100});
        const waiting = boundary.sleep(1000); owner.abort(); expect(await waiting).toBe(false); boundary.cleanup(); expect(jest.getTimerCount()).toBe(0);
    });
    test('compact provider recovery preserves its existing engineering route marker', async () => {
        mockCallLLM.mockResolvedValueOnce('PROVIDER_FAILURE: temporary outage').mockResolvedValueOnce(plan);
        await run({engineeringPipeline:true});
        expect(mockCallLLM).toHaveBeenCalledTimes(2);
        expect(mockCallLLM.mock.calls[1][2].engineeringPipeline).toBe(true);
    });
    test('deadline expiring during routing option preparation prevents provider launch', async () => {
        mockCallLLM.mockResolvedValue(plan);
        let accesses=0;
        const opts:any={...context()};
        Object.defineProperty(opts,'modelConfig',{get(){if (++accesses===2) jest.setSystemTime(Date.now()+1001); return {provider:'local',model:'explicit-local-model'};}});
        const result=await new ProjectPlannerTool().execute({projectDescription:request,evidence},opts);
        stopped(result,'planner_deadline_exceeded');
        expect(mockCallLLM).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });
    test('provider starts after deadline installation and a synchronous provider throw cleans the boundary', async () => {
        mockCallLLM.mockImplementation(() => {expect(jest.getTimerCount()).toBe(1); return Promise.resolve(plan);});
        expect((await run()).ok).toBe(true);
        expect(jest.getTimerCount()).toBe(0);
        const boundary=createPlannerRunBoundary({plannerTimeoutMs:100});
        await expect(boundary.wrap<string>(()=> {throw new Error('synthetic start failure');})).rejects.toThrow('synthetic start failure');
        boundary.cleanup();
        expect(jest.getTimerCount()).toBe(0);
    });
    test('source signal listener is removed after successful completion', async () => {
        const owner = new AbortController(), add = jest.spyOn(owner.signal, 'addEventListener'), remove = jest.spyOn(owner.signal, 'removeEventListener');
        mockCallLLM.mockResolvedValue(plan); expect((await run({signal: owner.signal})).ok).toBe(true); expect(add).toHaveBeenCalledTimes(1); expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
});
