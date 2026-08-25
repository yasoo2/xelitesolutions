import fs from 'fs';
import path from 'path';
import { DbSchemaMigratorTool } from '../modules/tools/definitions/DatabaseEnterpriseTools';
import { workspaceService } from '../modules/services/WorkspaceService';

describe('DbSchemaMigratorTool SQLite SQL migrations', () => {
    const root = path.resolve(process.cwd(), '../data/builds/sqlite-migrator-regression');
    const sqlPath = path.join(root, '001_schema.sql');
    const databasePath = path.join(root, 'test.db');

    beforeEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(sqlPath, [
            'CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY, name TEXT NOT NULL);',
            'CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL, name TEXT NOT NULL);',
        ].join('\n'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        workspaceService.resetToSystem();
    });

    it('discovers the only existing schema.sql when a live plan omits schemaPath', async () => {
        const workspaceRoot = path.join(root, 'workspace');
        const discoveredSchema = path.join(workspaceRoot, 'schema.sql');
        fs.mkdirSync(workspaceRoot, { recursive: true });
        fs.writeFileSync(discoveredSchema, 'CREATE TABLE IF NOT EXISTS discovered (id INTEGER PRIMARY KEY);');
        await workspaceService.setActiveRoot(workspaceRoot);

        const result = await new DbSchemaMigratorTool().execute({
            engine: 'sqlite',
            action: 'migrate',
            databasePath: path.join(workspaceRoot, 'discovered.db'),
        });

        expect(result.ok).toBe(true);
        expect(result.output).toBeDefined();
        if (result.output === undefined) {
            throw new Error('SQLite migration succeeded without output');
        }
        expect('schemaPath' in result.output).toBe(true);
        if (!('schemaPath' in result.output)) {
            throw new Error('SQLite migration returned the short output shape without schemaPath');
        }
        expect(result.output.schemaPath).toBe(discoveredSchema);
        expect(result.output.databasePath).toBe(path.join(workspaceRoot, 'discovered.db'));
    });

    it('routes a concrete .sql migration away from Prisma and applies it with SQLite', async () => {
        const tool = new DbSchemaMigratorTool();
        const result = await tool.execute({
            engine: 'prisma',
            action: 'migrate',
            schemaPath: sqlPath,
            databasePath,
        });

        expect(result.ok).toBe(true);
        expect(result.output).toBeDefined();
        if (result.output === undefined) {
            throw new Error('SQLite migration succeeded without output');
        }
        expect('engine' in result.output).toBe(true);
        if (!('engine' in result.output)) {
            throw new Error('SQLite migration returned the short output shape without engine');
        }
        expect(result.output.engine).toBe('sqlite');
        expect(result.output.databasePath).toBe(databasePath);

        const status = await tool.execute({
            engine: 'sqlite',
            action: 'status',
            databasePath,
        });
        expect(status.ok).toBe(true);
        expect(status.output).toBeDefined();
        if (status.output === undefined) {
            throw new Error('SQLite status succeeded without output');
        }
        expect(status.output.output).toContain('tenants');
        expect(status.output.output).toContain('roles');
    });
});
