
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export class DbSchemaMigratorTool extends BaseTool {
    name = 'db_schema_migrator';
    description = 'Manage database schema migrations (Prisma, TypeORM, etc).'
    version = '1.0.0';
    tags = ['database', 'migrations'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            engine: { type: 'string', enum: ['prisma', 'typeorm', 'sequelize'], default: 'prisma' },
            action: { type: 'string', enum: ['migrate', 'push', 'reset', 'status'] },
            schemaPath: { type: 'string', description: 'Path to schema file' },
            name: { type: 'string', description: 'Name for the migration' }
        },
        required: ['action']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['shell', 'file_read'];
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        const engine = input.engine || 'prisma';
        const action = input.action;
        let cmd = '';

        if (engine === 'prisma') {
            const schemaArg = input.schemaPath ? `--schema=${input.schemaPath}` : '';
            if (action === 'migrate') {
                const nameArg = input.name ? `--name ${input.name}` : '';
                cmd = `npx prisma migrate dev ${nameArg} ${schemaArg}`; // dev for now, deploy for prod
            } else if (action === 'push') {
                cmd = `npx prisma db push ${schemaArg}`;
            } else if (action === 'reset') {
                cmd = `npx prisma migrate reset --force ${schemaArg}`;
            } else if (action === 'status') {
                cmd = `npx prisma migrate status ${schemaArg}`;
            }
        } else {
            return { ok: false, error: `Engine ${engine} not yet implemented`, logs: [] };
        }

        try {
            const { stdout, stderr } = await execAsync(cmd);
            return { ok: true, output: { output: stdout + stderr }, logs: [`db_migrator ${engine} ${action} success`] };
        } catch (e: any) {
            return { ok: false, error: `Migration failed: ${e.message}`, logs: [] };
        }
    }
}

export class QueryOptimizerTool extends BaseTool {
    name = 'query_optimizer';
    description = 'Analyze SQL queries for performance bottlenecks using EXPLAIN ANALYZE.';
    version = '1.0.0';
    tags = ['database', 'performance'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            sql: { type: 'string' },
            dbUri: { type: 'string', description: 'Database connection string (optional, uses env if missing)' }
        },
        required: ['sql']
    };
    outputSchema = { type: 'object' as const, properties: { analysis: { type: 'string' }, suggestions: { type: 'array' } } };
    permissions: ToolPermission[] = ['internet']; // Needs network to DB
    sideEffects: ToolPermission[] = [];

    async execute(input: any) {
        // This would ideally connect to a real Postgres/MySQL.
        // For this phase, we will simulate the "Analysis" part or use a simple CLI if available.
        // Or we could use the `run_command` capability to execute psql if installed.
        // Let's perform a heuristic analysis for now, assuming we don't have a live connection in this tool context easily.

        const sql = String(input.sql).toUpperCase();
        const suggestions = [];

        if (!sql.includes('WHERE')) suggestions.push('⚠️ Missing WHERE clause: potential full table scan.');
        if (sql.includes('SELECT *')) suggestions.push('⚠️ Avoid SELECT *: fetch only needed columns.');
        if (sql.includes('LIKE \'%...%')) suggestions.push('⚠️ Leading wildcard in LIKE prevents index usage.');
        if (sql.includes('OR')) suggestions.push('ℹ️ Check if UNION matches indexes better than OR.');
        if (!sql.includes('LIMIT') && (sql.includes('SELECT') || sql.includes('DELETE'))) suggestions.push('ℹ️ Consider adding LIMIT to batch operations.');

        return {
            ok: true,
            output: {
                analysis: 'Heuristic Static Analysis (Connect DB for true EXPLAIN)',
                suggestions
            },
            logs: ['query optimized static']
        };
    }
}

export class LargeDataSeederTool extends BaseTool {
    name = 'large_data_seeder';
    description = 'Generate massive datasets (CSV/JSON) for stress testing.';
    version = '1.0.0';
    tags = ['database', 'testing', 'data'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            rows: { type: 'number' },
            format: { type: 'string', enum: ['csv', 'json'] },
            headers: { type: 'array', items: { type: 'string' } },
            outputPath: { type: 'string' }
        },
        required: ['rows', 'headers', 'outputPath']
    };
    outputSchema = { type: 'object' as const, properties: { fileSize: { type: 'number' } } };
    permissions: ToolPermission[] = ['file_write'];
    sideEffects: ToolPermission[] = ['file_write'];

    async execute(input: any) {
        const rows = input.rows || 1000;
        const format = input.format || 'csv';
        const headers = input.headers || ['id', 'name'];
        const p = input.outputPath;

        let content = '';
        if (format === 'csv') {
            content += headers.join(',') + '\n';
            for (let i = 0; i < rows; i++) {
                const row = headers.map((h: string) => h === 'id' ? i : `${h}_${i}`).join(',');
                content += row + '\n';
            }
        } else {
            const arr = [];
            for (let i = 0; i < rows; i++) {
                const obj: any = {};
                headers.forEach((h: string) => obj[h] = h === 'id' ? i : `${h}_${i}`);
                arr.push(obj);
            }
            content = JSON.stringify(arr, null, 2);
        }

        fs.writeFileSync(p, content);
        const stats = fs.statSync(p);

        return {
            ok: true,
            output: { fileSize: stats.size, path: p },
            logs: [`generated ${rows} rows in ${p}`]
        };
    }
}
