export {};
describe('read-only autonomous workspace capability lookup', () => {
    const original = process.env;
    afterEach(() => { process.env = original; jest.resetModules(); jest.restoreAllMocks(); });
    function fixture(db: boolean, members: any[] = [], status = 'active') {
        jest.resetModules(); process.env = { NODE_ENV: 'test', ...(db ? {} : { PERSISTENCE_MODE: 'JSON' }) };
        const query = jest.fn((_filter: any) => ({ select: () => ({ limit: () => ({ lean: async () => members }) }) }));
        const workspace = jest.fn(() => ({ select: () => ({ lean: async () => ({ status }) }) }));
        jest.doMock('mongoose', () => ({ __esModule: true, default: { connection: { readyState: db ? 1 : 0 } } }));
        jest.doMock('../shared/models/workspace', () => ({ Workspace: { findById: workspace } }));
        jest.doMock('../shared/models/workspaceMember', () => ({ WorkspaceMember: { find: query } }));
        jest.doMock('../shared/models/user', () => ({ User: {} }));
        jest.doMock('../modules/services/secrets', () => ({ getUserSecret: () => { throw new Error('No secrets'); } }));
        const actual = jest.requireActual('../modules/services/WorkspaceService');
        return { service: new actual.WorkspaceService(), query, workspace };
    }
    test('restored personal owner is accepted without minting or database access', async () => {
        const f = fixture(false), crypto = jest.requireActual('crypto');
        const uid = crypto.createHash('sha1').update('synthetic-owner').digest('hex').slice(0, 24);
        const ws = crypto.createHash('sha1').update('ws:' + uid).digest('hex').slice(0, 24);
        expect(await f.service.canAccessAutonomousFiles(ws, 'synthetic-owner', true)).toBe(true);
        expect(await f.service.canAccessAutonomousFiles(ws, 'foreign-owner', true)).toBe(false);
        expect(f.query).not.toHaveBeenCalled(); expect(f.workspace).not.toHaveBeenCalled();
    });
    test.each(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER', 'AGENT', 'UNKNOWN'])('%s capability is bounded', async role => {
        const f = fixture(true, [{ role }]);
        expect(await f.service.canAccessAutonomousFiles('ws', 'owner', false)).toBe(['OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER'].includes(role));
        expect(await f.service.canAccessAutonomousFiles('ws', 'owner', true)).toBe(['OWNER', 'ADMIN', 'DEVELOPER'].includes(role));
        expect(f.query.mock.calls[0][0]).toEqual({ workspaceId: 'ws', userId: 'owner' });
    });
    test.each([{ members: [] }, { members: [{ role: 'OWNER' }, { role: 'VIEWER' }] }, { members: [null] }, { members: null }])('absent, malformed or duplicate membership is denied', async row => {
        const f = fixture(true, row.members as any); expect(await f.service.canAccessAutonomousFiles('ws', 'owner', true)).toBe(false);
        expect(f.workspace).not.toHaveBeenCalled();
    });
    test.each(['suspended', 'archived', 'deleted'])('%s workspace has no file capability', async status => {
        const f = fixture(true, [{ role: 'OWNER' }], status); expect(await f.service.canAccessAutonomousFiles('ws', 'owner', true)).toBe(false);
    });
    test('missing identity is denied without looking up members', async () => {
        const f = fixture(true, [{ role: 'OWNER' }]); expect(await f.service.canAccessAutonomousFiles('', 'owner', true)).toBe(false);
        expect(await f.service.canAccessAutonomousFiles('ws', '', true)).toBe(false); expect(f.query).not.toHaveBeenCalled();
    });
});
