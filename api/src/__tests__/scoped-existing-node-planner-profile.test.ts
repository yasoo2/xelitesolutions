const mockCallLLM = jest.fn(), mockExecute = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));
jest.mock('../core/llm/intelligent-router', () => ({ isProviderFailure: () => false, retryAfterMsFrom: () => 0 }));
jest.mock('../modules/services/ToolService', () => ({ TOOL_ALIASES: {}, executeTool: mockExecute }));
jest.mock('../modules/tools/registry', () => ({ tools: [
    { name: 'read_file', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
    { name: 'file_edit', inputSchema: { type: 'object', properties: { path: { type: 'string' }, filename: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } }, required: ['find', 'replace'], requiredAny: [['path', 'filename']] } },
    { name: 'shell_execute', inputSchema: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] } },
] }));
import path from 'path';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { issueEngineeringContext, sealEngineeringEvidence, issueEngineeringExecution, engineeringExecution } from '../modules/services/AutonomousEngineeringPolicy';

const root = path.resolve('D:/owned-node-profile');
const planner: any = new ProjectPlannerTool();
const source = 'export function sum(a, b) { return a - b; }\n// COMPLETE_SOURCE_TAIL';
function fixture(request: string, mutation?: (evidence: any) => void) {
    const context = issueEngineeringContext({ modelConfig: { provider: 'local', model: process.env.LOCAL_LLM_MODEL || 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } },
        { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root, request }, () => false);
    const files = [ { path: 'package.json', content: '{"name":"owned-node","scripts":{"test":"node --test"}}' },
        { path: 'sum.mjs', content: source }, { path: 'sum.test.mjs', content: "import {sum} from './sum.mjs';\n// EXISTING_TEST_TAIL" } ];
    const evidence: any = { version: 1, mode: 'existing_workspace', workspaceRoot: root,
        selectedProject: { root, projectKinds: ['node'], git: { isRepository: false }, manifests: [{ path: 'package.json', kind: 'node', scripts: { test: 'node --test' } }],
            likelyEntrypoints: ['sum.mjs'], sourceFiles: ['sum.mjs'], testFiles: ['sum.test.mjs'], candidateChecks: [{ kind: 'test', command: 'npm run test', source: 'package.json' }] },
        constraints: { localOnly: true, forbidDeploy: true, userRequestedExistingProject: true, createsNewProject: false },
        sourceEvidence: { files: files.map(file => ({ ...file, lineCount: file.content.split('\n').length })) },
        requiredSpecification: { content: files.map(file => `COMPLETE SOURCE: ${file.path}\n${file.content}`).join('\n\n'), sources: files.map(file => ({ path: file.path, lineCount: file.content.split('\n').length })) },
        referenceProjects: [], instructionFiles: [], facts: [], blockers: [] };
    mutation?.(evidence);
    return { context, evidence: sealEngineeringEvidence(context, evidence) };
}
function response(request: string) {
    return JSON.stringify({ projectName: 'Owned repair', projectVibe: 'Existing Node repair', totalPhases: 1, estimatedDuration: 'short', dependencies: [], phases: [{
        phaseNumber: 1, name: 'Repair existing sum', description: 'Repair the existing addition function and preserve the tests.',
        requirementsCovered: planner.requirementScope(request).targets.map((_target: string, i: number) => `R${i + 1}`),
        tasks: [ { task: 'Read the existing sum source', tool: 'read_file', args: { path: 'sum.mjs' }, priority: 'high', realisticMinutes: 1 },
            { task: 'Fix addition using the exact existing fragment', tool: 'file_edit', args: { path: 'sum.mjs', find: 'return a - b;', replace: 'return a + b;' }, priority: 'high', realisticMinutes: 1 },
            { task: 'Run the declared existing Node tests', tool: 'shell_execute', args: { command: 'npm run test' }, priority: 'high', realisticMinutes: 1 } ],
        verificationTask: { task: 'Run the same declared final test', tool: 'shell_execute', args: { command: 'npm run test' } }, deliverables: ['sum.mjs'], estimatedTime: 'short' }] });
}
beforeEach(() => { mockCallLLM.mockReset(); mockExecute.mockClear(); });
afterEach(() => expect(mockExecute).not.toHaveBeenCalled());

test.each(['Fix addition in sum.mjs; preserve existing sum.test.mjs.', 'أصلح الجمع في sum.mjs واحفظ الاختبارات الموجودة في sum.test.mjs.'])('real planner output is admitted by the actual isolated execution policy: %s', async request => {
    const { context, evidence } = fixture(request); mockCallLLM.mockResolvedValue(response(request));
    const result: any = await planner.execute({ projectDescription: request, evidence }, context);
    expect(result.ok).toBe(true); expect(mockCallLLM).toHaveBeenCalledTimes(1);
    const prompt = mockCallLLM.mock.calls[0][0];
    expect(prompt).toContain('ISOLATED EXISTING NODE PLAN'); expect(prompt).toContain(request);
    expect(prompt).toContain('COMPLETE_SOURCE_TAIL'); expect(prompt).toContain('EXISTING_TEST_TAIL');
    expect(prompt).not.toMatch(/ai_write_file|auto_tester|PLANNER TOOL|scaffold_project/);
    expect(prompt.length).toBeLessThanOrEqual(12000);
    console.info(`[isolated-profile prompt] measuredCharacters=${prompt.length}; character bound only, not tokenizer proof`);
    const lease = issueEngineeringExecution(context, evidence, result.output);
    const accepted = engineeringExecution(lease)!;
    expect(accepted.phases).toHaveLength(1);
    expect(accepted.phases[0].tasks.map((task: any) => task.tool)).toEqual(['read_file', 'file_edit', 'shell_execute']);
    expect(accepted.phases[0].tasks[2].input).toEqual({ command: 'npm run test' });
});
test('actual parse recovery retains the same supported contracts and complete source', async () => {
    const request = 'Fix addition in existing sum.mjs; preserve the tests.';
    const { context, evidence } = fixture(request);
    mockCallLLM.mockResolvedValueOnce('not JSON').mockResolvedValueOnce(response(request));
    const result: any = await planner.execute({ projectDescription: request, evidence }, context);
    expect(result.ok).toBe(true); expect(mockCallLLM).toHaveBeenCalledTimes(2);
    for (const [prompt] of mockCallLLM.mock.calls) {
        expect(prompt).toContain('ISOLATED EXISTING NODE PLAN'); expect(prompt).toContain(request);
        expect(prompt).toContain('COMPLETE_SOURCE_TAIL'); expect(prompt).not.toMatch(/ai_write_file|auto_tester|scaffold_project/);
    }
    expect(() => issueEngineeringExecution(context, evidence, result.output)).not.toThrow();
});
test.each([
    (ev: any) => { ev.constraints.createsNewProject = true; },
    (ev: any) => { ev.sourceEvidence.files[0].content = '{"scripts":{"test":"node --test"},"dependencies":{"dep":"1"}}'; },
    (ev: any) => { ev.sourceEvidence.files = ev.sourceEvidence.files.filter((file: any) => file.path !== 'sum.test.mjs'); },
])('unsupported source profile retains ordinary planner behavior', async mutation => {
    const request = 'Repair existing sum.mjs.'; const { context, evidence } = fixture(request, mutation);
    mockCallLLM.mockRejectedValue(new Error('INERT_PROMPT_ONLY'));
    await planner.execute({ projectDescription: request, evidence }, context);
    expect(mockCallLLM.mock.calls[0][0]).not.toContain('ISOLATED EXISTING NODE PLAN');
});
test('copied caller evidence and user flags cannot impersonate the server seal', async () => {
    const request = 'Repair sum.mjs.'; const { context, evidence } = fixture(request);
    mockCallLLM.mockRejectedValue(new Error('INERT_PROMPT_ONLY'));
    await planner.execute({ projectDescription: request, evidence: { ...evidence } }, { ...context, isolatedExistingNode: true });
    expect(mockCallLLM.mock.calls[0][0]).not.toContain('ISOLATED EXISTING NODE PLAN');
});
test('over-budget original request is rejected before inference without truncating the request', async () => {
    const request = 'Repair existing sum.mjs. ' + 'x'.repeat(12500) + ' ORIGINAL_REQUEST_TAIL';
    const { context, evidence } = fixture(request); const result: any = await planner.execute({ projectDescription: request, evidence }, context);
    expect(result.ok).toBe(false); expect(mockCallLLM).not.toHaveBeenCalled();
    expect(result.error).toContain('isolated_planner_prompt_budget_exceeded');
});
