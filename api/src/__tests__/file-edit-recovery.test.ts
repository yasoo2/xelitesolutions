import fs from 'fs';
import os from 'os';
import path from 'path';
import { workspaceService } from '../modules/services/WorkspaceService';
import { AdvancedFileEditTool } from '../modules/tools/definitions/UtilityTools';
import { SelfFixService } from '../modules/services/SelfFixService';

describe('evidence-aware file edit recovery', () => {
  let root = '';
  let activeRootSpy: jest.SpyInstance;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-file-edit-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
  });

  afterEach(() => {
    activeRootSpy.mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('recovers a formatting-only mismatch without weakening path safety', async () => {
    const file = path.join(root, 'src', 'app.ts');
    fs.writeFileSync(file, 'export function app() {\n  const value = 1;\n  return value;\n}\n');

    const result: any = await new AdvancedFileEditTool().execute({
      filePath: 'src/app.ts',
      edits: [{ find: 'const value=1;', replace: 'const value = 2;' }],
    });

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toContain('const value = 2;');
  });

  it('does not persist a partial multi-edit when one evidence block misses', async () => {
    const file = path.join(root, 'src', 'app.ts');
    const original = 'const first = 1;\nconst second = 2;\n';
    fs.writeFileSync(file, original);

    const result: any = await new AdvancedFileEditTool().execute({
      filePath: 'src/app.ts',
      edits: [
        { find: 'const first = 1;', replace: 'const first = 10;' },
        { find: 'const absent = true;', replace: 'const absent = false;' },
      ],
    });

    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('builds a bounded ESLint config recovery from lint evidence', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'NEXUS',
      phaseNumber: 1,
      phaseName: 'Architecture & Foundation',
      status: 'partial',
      severity: 'low',
      primaryError: "Failed to read JSON file at /workspace/NEXUS/.eslintrc.json: Unexpected token 'i', import is not valid JSON",
      failedTasks: [{
        task: 'Install dependencies and run lint',
        tool: 'shell_execute',
        error: "ESLint: 8.57.1\\nFailed to read JSON file at /workspace/NEXUS/.eslintrc.json: Unexpected token 'i', import is not valid JSON",
        command: 'npm install && npm run lint',
        cwd: '/workspace/NEXUS',
      }],
      suggestedNextAction: 'repair the lint configuration and rerun',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.strategy).toBe('build_fix');
    expect(plan.suggestedTool).toBe('ai_write_file');
    expect(plan.maxAttempts).toBe(1);
    expect(plan.suggestedInput).toEqual(expect.objectContaining({
      path: '.eslintrc.json',
      description: expect.stringContaining('configuration format supported by the installed ESLint version'),
    }));
    expect(String(plan.suggestedInput?.description)).not.toContain('src/index.ts');
  });

  it('builds one bounded advanced-edit recovery from preserved file evidence', () => {
    const plan = SelfFixService.plan({
      type: 'phase_repair_ticket',
      projectName: 'NEXUS',
      phaseNumber: 5,
      phaseName: 'Foundation',
      status: 'partial',
      severity: 'low',
      primaryError: 'Text to replace not found',
      failedTasks: [{
        task: 'Update workflowEngine.js',
        tool: 'file_edit',
        error: 'Text to replace not found',
        file: 'NEXUS/agents/workflowEngine.js',
        find: 'const oldValue = true;',
        replace: 'const newValue = true;',
      }],
      suggestedNextAction: 'inspect and retry',
      retryPolicy: { maxRepairAttempts: 1, continueOnlyIfPhaseStatusBecomes: 'completed' },
      context: { workspaceId: 'workspace-test' },
      createdAt: new Date().toISOString(),
    });

    expect(plan.allowed).toBe(true);
    expect(plan.suggestedTool).toBe('file_edit_advanced');
    expect(plan.maxAttempts).toBe(1);
    expect(plan.suggestedInput).toEqual({
      filePath: 'NEXUS/agents/workflowEngine.js',
      edits: [{ find: 'const oldValue = true;', replace: 'const newValue = true;' }],
    });
  });
});
