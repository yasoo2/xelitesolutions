import fs from 'fs';
import path from 'path';
import { DbSchemaMigratorTool } from '../modules/tools/definitions/DatabaseEnterpriseTools';

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
        expect(result.output.engine).toBe('sqlite');
        expect(result.output.databasePath).toBe(databasePath);

        const status = await tool.execute({
            engine: 'sqlite',
            action: 'status',
            databasePath,
        });
        expect(status.ok).toBe(true);
        expect(status.output.output).toContain('tenants');
        expect(status.output.output).toContain('roles');
    });
});
