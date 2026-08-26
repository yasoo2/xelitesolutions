import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SafeReadFileTool } from '../modules/tools/definitions/TaskInteractionTools';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('read_file workspace context', () => {
  let defaultRoot: string;
  let contextualRoot: string;

  beforeEach(() => {
    defaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-read-default-'));
    contextualRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-read-context-'));
    fs.mkdirSync(path.join(contextualRoot, 'NEXUS/backend/src'), { recursive: true });
    fs.writeFileSync(
      path.join(contextualRoot, 'NEXUS/backend/src/index.js'),
      'module.exports = { contextual: true };\n',
      'utf8',
    );

    jest.spyOn(workspaceService, 'getActiveRoot').mockImplementation((workspaceId?: string) =>
      workspaceId === 'workspace-context' ? contextualRoot : defaultRoot,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(defaultRoot, { recursive: true, force: true });
    fs.rmSync(contextualRoot, { recursive: true, force: true });
  });

  it('resolves a relative file under the execution workspace, not the default workspace', async () => {
    const result = await new SafeReadFileTool().execute(
      { path: 'NEXUS/backend/src/index.js' },
      { workspaceId: 'workspace-context' },
    );

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    if (result.output === undefined) {
      throw new Error('read_file succeeded without output');
    }
    expect(result.output.content).toContain('contextual: true');
  });
});
