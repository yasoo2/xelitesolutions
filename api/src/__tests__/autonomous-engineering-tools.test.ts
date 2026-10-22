/** Actual discovery and pipeline classes; filesystem and gateway edges are inert here. */
const mockUnexpected = jest.fn(() => { throw Error('Unexpected legacy filesystem/execution'); });
const mockExecute = jest.fn();
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecute(...args) }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: mockUnexpected } }));
jest.mock('../core/llm/intelligent-router', () => ({ verifyProviderDirect: mockUnexpected }));
jest.mock('../modules/tools/definitions/ProjectRunTool', () => ({ detectStart: mockUnexpected, missingRuntimeDependencies: mockUnexpected, reconcileMissingRuntimeTarget: mockUnexpected, resolveRunnableProject: mockUnexpected }));
jest.mock('../core/quality/app-audit', () => ({ auditBuiltApp: mockUnexpected, findingText: mockUnexpected }));
jest.mock('../api/page-store', () => ({ readJoeProjectForRun: mockUnexpected }));
jest.mock('../modules/services/AgentLoopService', () => ({ AgentLoopService: { runPlannedPhasesIfPresent: mockUnexpected } }));
jest.mock('fs', () => ({ existsSync: mockUnexpected, readFileSync: mockUnexpected, readdirSync: mockUnexpected, writeFileSync: mockUnexpected, lstatSync: mockUnexpected }));
import path from 'path';
import { issueEngineeringContext, sealEngineeringEvidence } from '../modules/services/AutonomousEngineeringPolicy';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';
import { ProjectPipelineTool } from '../modules/tools/definitions/ProjectPipelineTool';
const request = 'Build a local Node task agent in a new folder with source and tests.';
const root = path.resolve('D:/owned/workspace');
function context(cancelled: () => boolean = () => false, now = Date.now(), scopeRequest = request) {
    const c = { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' }, onProgress: jest.fn() };
    return issueEngineeringContext(c, { userId: c.userId, sessionId: c.sessionId, workspaceId: c.workspaceId, runId: c.runId, root, request: scopeRequest }, cancelled, now);
}
beforeEach(() => { mockExecute.mockReset(); mockUnexpected.mockClear(); });

const existingRequest = 'Build a local Node task agent in the existing selected folder with source and tests.';
const sources: Record<string, string> = {
    'package.json': '{"name":"owned-node-fixture","scripts":{"test":"node --test"}}',
    'agent.js': 'export const taskLimit = 10;',
    'agent.test.js': 'import { taskLimit } from "./agent.js";',
};
const sourceCalls = ['engineering_discovery', 'read_file', 'read_file', 'read_file', 'read_file', 'read_file', 'read_file', 'project_planner'];
function existingNodeFixture(cancelled: () => boolean = () => false, facts: any[] = []) {
    const ctx = context(cancelled, Date.now(), existingRequest);
    const evidence = sealEngineeringEvidence(ctx, { version: 1, workspaceRoot: root, mode: 'existing_workspace',
        constraints: { createsNewProject: false, readOnly: false },
        selectedProject: { root, projectKinds: ['node'], sourceFiles: ['agent.js'], testFiles: ['agent.test.js'] }, facts });
    const install = (planner: () => any) => mockExecute.mockImplementation(async (name, input) => {
        if (name === 'engineering_discovery') return { ok: true, output: { evidence }, logs: [] };
        if (name === 'read_file') {
            const relative = path.relative(root, input.path).replace(/\\/g, '/');
            if (!Object.prototype.hasOwnProperty.call(sources, relative) || input.startLine !== 1 || input.endLine !== 10000)
                return mockUnexpected();
            const content = sources[relative];
            return { ok: true, output: { content, truncated: false, totalLines: content.split('\n').length }, logs: [] };
        }
        if (name === 'project_planner') return planner();
        return mockUnexpected();
    });
    return { ctx, evidence, install, input: { request: existingRequest, path: root } };
}
function expectCompleteSourceSnapshots() {
    expect(mockExecute.mock.calls.map(call => call[0])).toEqual(sourceCalls);
    for (const [index, name] of Object.keys(sources).entries()) {
        const expected = { path: path.join(root, name), startLine: 1, endLine: 10000 };
        expect(mockExecute.mock.calls[1 + index * 2][1]).toEqual(expected);
        expect(mockExecute.mock.calls[2 + index * 2][1]).toEqual(expected);
    }
}
test('actual scoped discovery reads bounded root data only through gateway', async () => {
    const ctx = context(); mockExecute.mockImplementation(async (name, input) => name === 'inspect_directory'
        ? { ok: true, output: { tree: [{ name: 'README.md', type: 'file', size: 12 }, { name: 'private.txt', type: 'file', size: 9 }], truncated: false }, logs: [] }
        : { ok: true, output: { content: '# Workspace' }, logs: [] });
    const r: any = await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx);
    expect(r.ok).toBe(true); expect((r.output as any).evidence.facts.some((f: any) => f.statement === '# Workspace')).toBe(true);
    expect(mockExecute.mock.calls.map(c => c[0])).toEqual(['inspect_directory', 'read_file']); expect(mockExecute.mock.calls[1][1].path).toBe(path.join(root, 'README.md')); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('oversize manifest is reported without reading it', async () => {
    const ctx = context(); mockExecute.mockResolvedValue({ ok: true, output: { tree: [{ name: 'package.json', type: 'file', size: 16_385 }], truncated: false }, logs: [] });
    const r: any = await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx);
    expect((r.output as any).evidence.blockers.some((b: any) => b.code === 'discovery_file_limit')).toBe(true); expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('secret-like content never becomes model evidence', async () => {
    const ctx = context(); mockExecute.mockImplementation(async name => name === 'inspect_directory'
        ? { ok: true, output: { tree: [{ name: 'README.md', type: 'file', size: 50 }], truncated: false }, logs: [] }
        : { ok: true, output: 'api_key=sk-abcdefghijklmnopqrstuvwxyz1234567890', logs: [] });
    const r: any = await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx);
    expect(JSON.stringify(r.output)).not.toContain('abcdefghijklmnopqrstuvwxyz'); expect((r.output as any).evidence.blockers.some((b: any) => b.code === 'discovery_sensitive_content')).toBe(true); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('discovery failure stops without guessing evidence', async () => {
    mockExecute.mockResolvedValue({ ok: false, output: { reason: 'workspace_permission_denied' }, logs: [] });
    const r = await new EngineeringDiscoveryTool().execute({ request, path: root }, context()); expect(r.ok).toBe(false); expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('expired scoped discovery cannot fall through to legacy filesystem path', async () => {
    const r = await new EngineeringDiscoveryTool().execute({ request, path: root }, context(() => false, Date.now() - 300_001)); expect(r).toMatchObject({ ok: false, error: 'engineering_scope_invalid' }); expect(mockExecute).not.toHaveBeenCalled(); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('cancellation between listing and read stops the read', async () => {
    let cancelled = false; const ctx = context(() => cancelled); mockExecute.mockImplementation(async () => { cancelled = true; return { ok: true, output: { tree: [{ name: 'README.md', type: 'file', size: 12 }] }, logs: [] }; });
    const r = await new EngineeringDiscoveryTool().execute({ request, path: root }, ctx); expect(r.ok).toBe(false); expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('actual pipeline reads complete signed existing-node evidence before planning and rejects an untrusted phase before execution', async () => {
    const f = existingNodeFixture(() => false, [{ statement: 'actual observed data' }]);
    f.install(() => ({ ok: true, output: { phases: [{ phaseNumber: 1, name: 'Untrusted delete',
        tasks: [{ tool: 'delete_file', input: { path: 'agent.js' } }] }], autoExecuted: false }, logs: [] }));
    const r = await new ProjectPipelineTool().execute(f.input, f.ctx);
    expectCompleteSourceSnapshots();
    const plannerInput = mockExecute.mock.calls[7][1];
    expect(plannerInput.projectDescription).toBe(existingRequest);
    expect(plannerInput.evidence).toMatchObject({ ...f.evidence,
        sourceEvidence: { files: Object.entries(sources).map(([name, content]) => ({ path: name, content, lineCount: 1 })) } });
    for (const content of Object.values(sources)) expect(plannerInput.evidence.requiredSpecification.content).toContain(content);
    expect(mockExecute.mock.calls[7][2]).toMatchObject({ engineeringPipeline: false,
        modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } });
    expect(r).toMatchObject({ ok: false, error: 'isolated_tool_not_admitted',
        output: { pipelineFinal: true, status: 'failed', executed: false, reason: 'isolated_tool_not_admitted' } });
    expect(mockUnexpected).not.toHaveBeenCalled();
});

test('missing source evidence retains the explicit source-budget HOLD before planner or execution', async () => {
    const ctx = context(); const evidence = sealEngineeringEvidence(ctx, { version: 1, facts: [] });
    mockExecute.mockResolvedValue({ ok: true, output: { evidence }, logs: [] });
    const r = await new ProjectPipelineTool().execute({ request, path: root }, ctx);
    expect(r).toMatchObject({ ok: false, error: 'isolated_source_context_budget',
        output: { pipelineFinal: true, status: 'failed', reason: 'isolated_source_context_budget', executed: false } });
    expect(mockExecute.mock.calls.map(call => call[0])).toEqual(['engineering_discovery']);
    expect(mockUnexpected).not.toHaveBeenCalled();
});
test('failed discovery prevents planner invocation in actual pipeline', async () => {
    mockExecute.mockResolvedValue({ ok: false, error: 'policy_blocked', logs: [] }); const r = await new ProjectPipelineTool().execute({ request, path: root }, context()); expect(r.ok).toBe(false); expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('planner failure does not invent a completed project or run phases', async () => {
    const f = existingNodeFixture(); f.install(() => ({ ok: false, error: 'provider_failure', logs: [] }));
    const r = await new ProjectPipelineTool().execute(f.input, f.ctx);
    expect(r).toMatchObject({ ok: false, error: 'engineering_planning_failed', output: {pipelineFinal: true, status: 'failed', reason: 'engineering_planning_failed', executed: false} });
    expectCompleteSourceSnapshots(); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('expired pipeline cannot invoke the legacy engineering executor', async () => {
    const r = await new ProjectPipelineTool().execute({ request, path: root }, context(() => false, Date.now() - 300_001)); expect(r).toMatchObject({ ok: false, error: 'engineering_scope_invalid', output: {pipelineFinal: true, status: 'failed', executed: false} }); expect(mockExecute).not.toHaveBeenCalled(); expect(mockUnexpected).not.toHaveBeenCalled();
});

test('failed discovery payload cannot overwrite the canonical terminal verdict', async () => {
    mockExecute.mockResolvedValue({ ok: false, output: { pipelineFinal: false, status: 'completed', diagnostic: 'measured failure' }, logs: ['actual failed discovery'] });
    const r = await new ProjectPipelineTool().execute({ request, path: root }, context());
    expect(r).toMatchObject({ ok: false, error: 'engineering_discovery_failed', output: { pipelineFinal: true, status: 'failed', reason: 'engineering_discovery_failed', executed: false, discoveryResult: { diagnostic: 'measured failure' } }, logs: ['actual failed discovery'] });
    expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('scope mismatch is terminal before any child call', async () => {
    const r = await new ProjectPipelineTool().execute({ request: request + ' altered', path: root }, context());
    expect(r).toMatchObject({ ok: false, error: 'engineering_scope_mismatch', output: { pipelineFinal: true, status: 'failed', executed: false } });
    expect(mockExecute).not.toHaveBeenCalled(); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('empty phases remain a final measured failure with original evidence', async () => {
    const f = existingNodeFixture(); f.install(() => ({ ok: true, output: { phases: [], diagnostic: 'empty plan' }, logs: ['planner empty'] }));
    const r = await new ProjectPipelineTool().execute(f.input, f.ctx);
    expect(r).toMatchObject({ ok: false, output: { pipelineFinal: true, status: 'failed', executed: false,
        evidence: f.evidence, plannerResult: { diagnostic: 'empty plan' } }, logs: ['planner empty'] });
    expectCompleteSourceSnapshots(); expect(mockUnexpected).not.toHaveBeenCalled();
});
test('cancellation after planning cannot turn a plan into execution or recovery', async () => {
    let cancelled = false; const f = existingNodeFixture(() => cancelled);
    f.install(() => { cancelled = true; return { ok: true, output: { phases: [{ phaseNumber: 1,
        name: 'Otherwise admissible test', tasks: [{ tool: 'shell_execute', input: { command: 'npm test' } }] }] }, logs: [] }; });
    const r = await new ProjectPipelineTool().execute(f.input, f.ctx);
    expect(r).toMatchObject({ ok: false, error: 'engineering_planning_failed', output: { pipelineFinal: true, status: 'failed', executed: false } });
    expectCompleteSourceSnapshots(); expect(mockUnexpected).not.toHaveBeenCalled();
});
