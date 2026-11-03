/** Actual existing pipeline overview branch; every nonread effect is forbidden. */
const mockUnexpected = jest.fn(() => { throw new Error('Unexpected planning/execution/IO'); });
const mockExecute = jest.fn();
const mockRoot = jest.fn((id: string) => { if (id !== 'owned-workspace') throw new Error('Wrong workspace'); return 'D:/owned/workspace'; });
jest.mock('../modules/services/ToolService', () => ({ executeTool: (...args: any[]) => mockExecute(...args) }));
jest.mock('../modules/services/WorkspaceService', () => ({ workspaceService: { getActiveRoot: (id: string) => mockRoot(id) } }));
jest.mock('../core/llm/intelligent-router', () => ({ verifyProviderDirect: mockUnexpected }));
jest.mock('../modules/tools/definitions/ProjectRunTool', () => ({ detectStart: mockUnexpected, missingRuntimeDependencies: mockUnexpected,
    reconcileMissingRuntimeTarget: mockUnexpected, resolveRunnableProject: mockUnexpected }));
jest.mock('../core/quality/app-audit', () => ({ auditBuiltApp: mockUnexpected, findingText: mockUnexpected }));
jest.mock('../api/page-store', () => ({ readJoeProjectForRun: mockUnexpected }));
jest.mock('fs', () => ({ existsSync: mockUnexpected, readFileSync: mockUnexpected, readdirSync: mockUnexpected, writeFileSync: mockUnexpected }));
import path from 'path';
import { ProjectPipelineTool } from '../modules/tools/definitions/ProjectPipelineTool';

describe('actual bounded overview pipeline integration', () => {
    beforeEach(() => { mockUnexpected.mockClear(); mockRoot.mockClear(); mockExecute.mockReset(); });
    const context = { workspaceId: 'owned-workspace', sessionId: 'owned-session', userId: 'owner', language: 'en' };
    const request = 'Inspect the workspace and list its top-level files without making changes.';
    test.each(['en', 'ar'])('reports actual entries and missing README truthfully in %s', async language => {
        mockExecute.mockResolvedValue({ ok: true, output: { tree: [{ name: 'actual.txt', type: 'file' }], truncated: false }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, { ...context, language });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed', verified: true, overview: { topLevelEntries: ['actual.txt'], readme: null } } });
        expect((result.output as any).summary).toContain('- actual.txt');
        expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockExecute.mock.calls[0][0]).toBe('inspect_directory');
        expect(mockRoot).toHaveBeenCalledWith('owned-workspace'); expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test.each(['en', 'ar'])('names remain literal in the visible %s result without depending on UI logs', async language => {
        mockExecute.mockResolvedValue({ ok: true, output: { tree: [{ name: 'report_[x]`.txt', type: 'file' }], truncated: false }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, { ...context, language });
        expect((result.output as any).summary).toContain('- report\\_\\[x\\]\\`.txt');
        expect((result.output as any).overview.topLevelEntries).toEqual(['report_[x]`.txt']);
        expect((result.output as any).summary).not.toContain('details are available in Logs');
        expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test.each(['en', 'ar'])('empty root has an observable %s empty state', async language => {
        mockExecute.mockResolvedValue({ ok: true, output: { tree: [], truncated: false }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, { ...context, language });
        expect(result).toMatchObject({ ok: true, output: { status: 'completed', overview: { topLevelEntries: [] } } });
        expect((result.output as any).summary).toContain(language === 'en' ? 'The root is empty.' : 'الجذر فارغ.');
        expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test('reads README at the selected subroot instead of the workspace parent', async () => {
        const root = path.resolve('D:/owned/workspace/project');
        mockExecute.mockImplementation(async name => name === 'inspect_directory'
            ? { ok: true, output: { tree: [{ name: 'README.md', type: 'file' }] }, logs: [] }
            : { ok: true, output: { content: '# Actual notes\nA concrete project contract.' }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request, path: root }, context);
        expect(result.ok).toBe(true);
        expect(mockExecute.mock.calls[1]).toEqual(['read_file', { path: path.join(root, 'README.md') }, context]);
        expect((result.output as any).overview.readmeSummary).toContain('A concrete project contract.');
        expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test.each(['sensitive_or_binary_file', 'cancelled'])('README %s failure cannot produce verified success', async reason => {
        mockExecute.mockImplementation(async name => name === 'inspect_directory'
            ? { ok: true, output: { tree: [{ name: 'README.md', type: 'file' }] }, logs: [] }
            : { ok: false, error: 'policy_blocked', output: { reason }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, context);
        expect(result).toMatchObject({ ok: false, output: { status: 'failed', verified: false, pipelineFinal: true } });
        expect(result.error).toBe(reason); expect(mockExecute).toHaveBeenCalledTimes(2); expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test('directory truncation blocks delivery without continuing to discovery or a model', async () => {
        mockExecute.mockResolvedValue({ ok: true, output: { tree: [], truncated: true }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, context);
        expect(result).toMatchObject({ ok: false, error: 'directory_entry_limit', output: { verified: false, pipelineFinal: true } });
        expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
    });
    test('directory authorization failure blocks without planning or a provider', async () => {
        mockExecute.mockResolvedValue({ ok: false, error: 'policy_blocked', output: { reason: 'workspace_permission_denied' }, logs: [] });
        const result = await new ProjectPipelineTool().execute({ request }, context);
        expect(result).toMatchObject({ ok: false, output: { verified: false, pipelineFinal: true } });
        expect(mockExecute).toHaveBeenCalledTimes(1); expect(mockUnexpected).not.toHaveBeenCalled();
    });
});
