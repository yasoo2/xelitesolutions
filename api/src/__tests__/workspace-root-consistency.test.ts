import { workspaceService } from '../modules/services/WorkspaceService';

describe('local workspace root consistency', () => {
  const originalPersistenceMode = process.env.PERSISTENCE_MODE;
  const originalMockDb = process.env.MOCK_DB;

  beforeAll(() => {
    process.env.PERSISTENCE_MODE = 'JSON';
    process.env.MOCK_DB = 'true';
  });

  afterAll(() => {
    if (originalPersistenceMode === undefined) delete process.env.PERSISTENCE_MODE;
    else process.env.PERSISTENCE_MODE = originalPersistenceMode;
    if (originalMockDb === undefined) delete process.env.MOCK_DB;
    else process.env.MOCK_DB = originalMockDb;
  });

  it('maps an unbound logical run workspace to the Explorer root in local mode', () => {
    const logicalWorkspaceId = `run-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const explorerRoot = workspaceService.getExplorerRoot();
    const executionRoot = workspaceService.getActiveRoot(logicalWorkspaceId);

    expect(executionRoot).toBe(explorerRoot);
  });
});
