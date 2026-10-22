const mockCallLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...args: any[]) => mockCallLLM(...args) }));
import path from 'path';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';
import { issueEngineeringContext } from '../modules/services/AutonomousEngineeringPolicy';
import type { EngineeringEvidence } from '../modules/tools/definitions/EngineeringDiscoveryTool';

const tool = new ProjectPlannerTool() as any;
const scoped = (req: string, ev?: any) => tool.createScopedInitialPlanningPrompt(req, undefined, ev);
const ev = (): EngineeringEvidence => ({ version: 1, mode: 'existing_workspace', workspaceRoot: '.', selectedProject: { root: '.', projectKinds: ['node'], git: { isRepository: false }, manifests: [{ path: 'package.json', kind: 'node', scripts: { test: 'node --test' } }], likelyEntrypoints: ['src/index.ts'], sourceFiles: ['src/index.ts'], testFiles: ['tests/a.test.ts'], candidateChecks: [{ kind: 'test', command: 'npm test', source: 'package.json' }] }, constraints: { localOnly: true, forbidDeploy: true, userRequestedExistingProject: true, createsNewProject: false }, referenceProjects: [], instructionFiles: [], facts: [], blockers: [] });

describe('scoped compact initial prompt', () => {
    test('preserves the complete original request tail verbatim', () => {
        const tail = 'TAIL-need-offline-sqlite-sync-xyz-123';
        const p = scoped(`Build a Node API. ${'x'.repeat(2000)} ${tail}`, ev());
        expect(p).toContain(tail);
    });
    test('preserves Unicode and multiple unrelated requests', () => {
        const p = scoped('Build الفوترة billing. Also add warehouse sync and عالج expenses.', ev());
        expect(p).toContain('الفوترة');
        expect(p).toContain('warehouse sync');
    });
    test('invents no earlier failure and reuses no FAILED/repair framing', () => {
        const p = scoped('Build a Node API with login and billing.', ev()).toLowerCase();
        expect(p).not.toMatch(/previous (response|attempt|plan)/);
        expect(p).not.toMatch(/could not be (safely )?used/);
        expect(p).not.toMatch(/failure evidence/);
        expect(p).toContain('no earlier planner attempt');
    });
    test('carries requirement register, evidence paths, and file-level codegen contracts', () => {
        const p = scoped('1. login\n2. billing\n3. sync\n4. audit\n5. reports', ev());
        expect(p).toContain('R1');
        expect(p).toContain('package.json');
        expect(p).toContain('ai_write_file');
        expect(p).toContain('args.description');
        expect(p).not.toMatch(/golden plan/i);
        expect(p).toContain('Never copy a fixed template');
    });
    test('is compact: strictly shorter than the full first-pass prompt', () => {
        const req = 'Build a Node API with login and billing.';
        expect(scoped(req, ev()).length).toBeLessThan(tool.createPlanningPrompt(req, undefined, tool.planningEvidence(ev())).length);
    });
    test('legacy general and recovery paths are unchanged', () => {
        const full = tool.createPlanningPrompt('Build a Node API.', undefined, tool.planningEvidence(ev()));
        expect(full).toContain('PROJECT:');
        expect(typeof tool.createCompactRecoveryPlanningPrompt).toBe('function');
        const rec = tool.createCompactRecoveryPlanningPrompt('Build a Node API.', 'boom', undefined, false, false, [], ev());
        expect(rec.toLowerCase()).toMatch(/failure evidence|recovery/);
    });
});

describe('actual private scope chooses the initial prompt at the real planner boundary', () => {
    const context = () => ({ userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run',
        modelConfig: { provider: 'local', model: 'qwen2.5-coder:7b', baseUrl: 'http://127.0.0.1:11434/v1' } });
    const owned = (request: string) => issueEngineeringContext(context(), { userId: 'owner', sessionId: 'session', workspaceId: 'workspace', runId: 'run', root: path.resolve('D:/owned-project'), request }, () => false);
    beforeEach(() => mockCallLLM.mockReset().mockRejectedValue(new Error('INERT_PROMPT_CAPTURE_ONLY')));
    test.each(['Build a local Node command-line task agent with resume and cancellation.', 'Build a local JSON inventory service with validation and tests.'])('the real initial model boundary preserves request and exact local route: %s', async request => {
        const ctx = owned(request); const r = await new ProjectPlannerTool().execute({ projectDescription: request, evidence: ev() }, ctx);
        expect(r.ok).toBe(false); expect(mockCallLLM).toHaveBeenCalledTimes(1);
        expect(mockCallLLM.mock.calls[0][0]).toContain('COMPACT SCOPED INITIAL PLAN'); expect(mockCallLLM.mock.calls[0][0]).toContain(request);
        expect(mockCallLLM.mock.calls[0][2]).toMatchObject({ modelConfig: ctx.modelConfig, sessionId: 'session', runId: 'run', workspaceId: 'workspace', maxCompletionTokens: 12000 });
    });
    test('user flags cannot choose the private-token profile', async () => {
        await new ProjectPlannerTool().execute({ projectDescription: 'Build a local Node CLI.', evidence: ev() }, { ...context(), scopedPlanning: true, engineeringPlanning: true });
        expect(mockCallLLM).toHaveBeenCalledTimes(1); expect(mockCallLLM.mock.calls[0][0]).not.toContain('COMPACT SCOPED INITIAL PLAN');
    });
    test.each(['repairMode', 'scopeRepairMode'])('existing %s routing is preserved even for a valid private token', async key => {
        const request = 'Build a local Node CLI.'; await new ProjectPlannerTool().execute({ projectDescription: request, evidence: ev() }, { ...owned(request), [key]: true });
        expect(mockCallLLM).toHaveBeenCalledTimes(1); expect(mockCallLLM.mock.calls[0][0]).not.toContain('COMPACT SCOPED INITIAL PLAN');
    });
    test('the complete register beyond 32 requirements appears in the coverage ledger', () => {
        const request = 'Build the following project.\n' + Array.from({ length: 48 }, (_, i) => `${i + 1}. Requirement area ${i + 1}`).join('\n');
        const prompt = scoped(request, ev()); const ledger = prompt.split('COVERAGE LEDGER')[1].split('\n\nRules:')[0];
        expect(prompt).toContain(request);
        const covered = ledger.match(/\bR\d+\b/g) || [];
        expect(covered).toEqual(Array.from({ length: 48 }, (_, i) => `R${i + 1}`));
    });
    test('large Unicode request is preserved without shortening the user contract', () => {
        const request = 'Build a local project. ' + '😀'.repeat(30_000) + '\nTAIL_FULL_CONTRACT';
        expect(scoped(request, ev())).toContain(request);
    });
    test('ambiguous top-level discovery keeps its actual facts/blockers and requested newfolder', () => {
        const evidence = { mode: 'ambiguous', workspaceRoot: 'D:/owned-project', instructionFiles: [], referenceProjects: [], facts: [{ id: 'observed', source: 'tool', statement: 'Observed screenshots directory only' }], blockers: [{ code: 'execution_capability_unavailable', message: 'Execution is not verified' }] };
        const prompt = scoped('Build a new Node project in a folder named requested-agent; preserve unrelated files.', evidence);
        expect(prompt).toContain('Observed screenshots directory only'); expect(prompt).toContain('execution_capability_unavailable');
        expect(prompt).toContain('No existing runnable project is proved'); expect(prompt).toContain('requested-agent'); expect(prompt).not.toContain('D:/owned-project');
    });
});
