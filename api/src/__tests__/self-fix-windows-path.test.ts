import os from 'os';
import path from 'path';
import * as ToolService from '../modules/services/ToolService';
import { SelfFixExecutionService } from '../modules/services/SelfFixExecutionService';
import { SelfFixService } from '../modules/services/SelfFixService';

describe('Windows self-fix paths', () => {
    let executeToolSpy: jest.SpyInstance;

    beforeEach(() => {
        executeToolSpy = jest.spyOn(ToolService, 'executeTool').mockImplementation(async (name: string) => {
            if (name === 'ai_write_file') return { ok: true, output: { path: 'repaired' }, logs: [] } as any;
            return { ok: true, output: { status: 'completed' }, logs: [] } as any;
        });
    });

    afterEach(() => executeToolSpy.mockRestore());

    it('keeps a drive-qualified TS2304 target absolute through repair binding', async () => {
        const root = path.resolve(os.tmpdir(), 'joe-self-fix-windows-path');
        const target = path.join(root, 'src', 'components', 'RecordsView.jsx');
        const failure = `source_reference_mismatch: ${target}: 31:60 TS2304 Cannot find name 'todayISO'.`;
        const plan: any = SelfFixService.plan({
            primaryError: failure,
            failedTasks: [{ task: 'Author records view', tool: 'react_project', error: failure, file: target }],
            context: {},
        } as any);

        const result = await SelfFixExecutionService.executeOnce({
            phase: { name: 'Interface', tasks: [{ task: 'Author records view', tool: 'react_project', args: {} }] },
            projectContext: { projectName: 'Storage Center', projectRoot: root, projectRootRuntimeBound: true },
            selfFixPlan: plan,
            executionContext: { sessionId: 'session', workspaceId: 'workspace', userId: 'user' },
        });

        expect(result.ok).toBe(true);
        expect(plan.suggestedInput.path).toBe(target.replace(/\\/g, '/'));
        expect(executeToolSpy.mock.calls[0][1].path).toBe(path.resolve(target));
        expect(executeToolSpy.mock.calls[0][1].path).not.toContain(`${path.basename(root)}${path.sep}${path.basename(root)}`);
    });
});