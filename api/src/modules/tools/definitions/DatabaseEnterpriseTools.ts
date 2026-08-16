
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import fs from 'fs';
import path from 'path';
import { handleShellCommand } from '../handlers';
import { resolveToolPath } from '../utils';

function nearestPackageRoot(startPath: string): string {
    let current = fs.statSync(startPath).isDirectory() ? startPath : path.dirname(startPath);
    while (true) {
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return path.dirname(startPath);
        current = parent;
    }
}

function sqliteDatabasePath(schemaFile: string, input: any, context?: any): string {
    const raw = String(input?.databasePath || input?.dbPath || '').trim();
    if (raw) return resolveToolPath(raw, { workspaceId: context?.workspaceId });
    if (!schemaFile) return resolveToolPath('nexus.db', { workspaceId: context?.workspaceId });
    // A migration under backend/src/migrations belongs to the nearest package
    // root. This is discovery-based: it follows the project's package.json
    // rather than assuming a product name or a fixed repository layout.
    return path.join(nearestPackageRoot(schemaFile), 'nexus.db');
}

function runSqliteMigration(schemaFile: string, input: any, context?: any) {
    let DatabaseSync: any;
    try {
        // node:sqlite is available in the supported Node runtime. Keep this a
        // dynamic require so the API still compiles on older development nodes;
        // the tool returns a truthful capability error there instead of sending
        // a .sql file to Prisma as if it were a Prisma schema.
        ({ DatabaseSync } = require('node:sqlite'));
    } catch (error: any) {
        return { ok: false, error: `SQLite runtime unavailable: ${error?.message || error}`, logs: [] };
    }

    const databasePath = sqliteDatabasePath(schemaFile, input, context);
    const action = String(input?.action || '').trim().toLowerCase();
    try {
        if (action === 'reset' && fs.existsSync(databasePath)) fs.rmSync(databasePath, { force: true });
        const db = new DatabaseSync(databasePath);
        try {
            let output = '';
            if (action === 'migrate' || action === 'push' || action === 'reset') {
                const sql = fs.readFileSync(schemaFile, 'utf8');
                if (!sql.trim()) return { ok: false, error: `Migration file is empty: ${schemaFile}`, logs: [] };
                db.exec(sql);
                output = `Applied SQL migration ${schemaFile} to ${databasePath}`;
            } else if (action === 'status') {
                const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all();
                output = JSON.stringify({ databasePath, tables });
            } else {
                return { ok: false, error: `Unsupported SQLite action: ${action}`, logs: [] };
            }
            return {
                ok: true,
                output: { output, databasePath, schemaPath: schemaFile, engine: 'sqlite', action },
                logs: [`db_migrator sqlite ${action} success database=${databasePath}`]
            };
        } finally {
            db.close();
        }
    } catch (error: any) {
        return { ok: false, error: `SQLite migration failed: ${error?.message || error}`, logs: [] };
    }
}

export class DbSchemaMigratorTool extends BaseTool {
    name = 'db_schema_migrator';
    description = 'Execute an existing database schema or SQL migration. For .sql files use engine sqlite; for .prisma files use engine prisma. This tool does not design schemas.';
    version = '1.1.0';
    tags = ['database', 'migrations'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            engine: { type: 'string', enum: ['prisma', 'sqlite', 'typeorm', 'sequelize'], default: 'prisma' },
            action: { type: 'string', enum: ['migrate', 'push', 'reset', 'status'] },
            schemaPath: { type: 'string', description: 'Existing .prisma schema or .sql migration path; .sql is executed by SQLite, never passed to Prisma' },
            databasePath: { type: 'string', description: 'Optional SQLite database path; defaults to the nearest package root database file' },
            name: { type: 'string', description: 'Name for a Prisma migration' }
        },
        required: ['action']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'read'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any, context?: any) {
        const requestedEngine = String(input?.engine || 'prisma').trim().toLowerCase();
        const action = String(input?.action || '').trim().toLowerCase();
        const schemaPath = String(input?.schemaPath || '').trim();
        let engine = requestedEngine;
        // A live planner can carry a stale/default prisma engine while naming a
        // concrete SQL migration. The file type is stronger evidence than that
        // default, so route it to the SQLite executor instead of invoking
        // `prisma --schema=<migration.sql>`.
        if (schemaPath.toLowerCase().endsWith('.sql')) engine = 'sqlite';

        if (engine === 'sqlite') {
            if (!schemaPath && action !== 'status') return { ok: false, error: 'SQLite migration requires schemaPath pointing to an existing .sql file', logs: [] };
            let resolvedSchema = '';
            if (schemaPath) {
                try { resolvedSchema = resolveToolPath(schemaPath, { workspaceId: context?.workspaceId }); }
                catch (error: any) { return { ok: false, error: `SQLite migration path rejected: ${error?.message || error}`, logs: [] }; }
                if (!fs.existsSync(resolvedSchema) || !fs.statSync(resolvedSchema).isFile()) {
                    return { ok: false, error: `SQLite migration file not found: ${resolvedSchema}`, logs: [] };
                }
            }
            return runSqliteMigration(resolvedSchema, input, context);
        }

        if (!['prisma', 'typeorm', 'sequelize'].includes(engine)) {
            return { ok: false, error: `Engine ${engine} not implemented`, logs: [] };
        }

        let args: string[] = [];
        if (engine === 'prisma') {
            const schemaArg = schemaPath ? [`--schema=${schemaPath}`] : [];
            if (action === 'migrate') {
                const name = input.name ? String(input.name) : '';
                const nameArgs = name ? ['--name', name] : [];
                args = ['prisma', 'migrate', 'dev', ...nameArgs, ...schemaArg];
            } else if (action === 'push') args = ['prisma', 'db', 'push', ...schemaArg];
            else if (action === 'reset') args = ['prisma', 'migrate', 'reset', '--force', ...schemaArg];
            else if (action === 'status') args = ['prisma', 'migrate', 'status', ...schemaArg];
        }
        if (!args.length) return { ok: false, error: 'Unsupported action', logs: [] };

        try {
            const r = await handleShellCommand('npx', args, process.cwd(), 600000, false, context?.sessionId);
            if (!r.ok) return { ok: false, error: `Migration failed: ${r.error}`, logs: [] };
            return { ok: true, output: { output: String(r.output || '') }, logs: [`db_migrator ${engine} ${action} success`] };
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
        if (sql.includes('LIKE \'%_wildcard_%')) suggestions.push('⚠️ Leading wildcard in LIKE prevents index usage.');
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
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        // This tool wrote `fs.writeFileSync(input.outputPath, …)` with the raw
        // string it was handed: no containment and no validation. The sandboxed
        // audit proved it — asked for `../../../../tmp/joe-escape.txt`, it
        // CREATED that file outside the workspace, and with no path at all it
        // died on a TypeError from inside node. Both are fixed here: the path
        // goes through the one resolver every other tool uses, and a missing
        // argument earns a sentence.
        const raw = String(input?.outputPath ?? '').trim();
        if (!raw) {
            return { ok: false, error: 'large_data_seeder needs an outputPath (e.g. "data/seed.csv") — nothing was written.' };
        }
        const headers = Array.isArray(input?.headers) && input.headers.length
            ? input.headers.map((h: any) => String(h)) : ['id', 'name'];
        // A seeder is a stress tool; it must not be a way to fill the disk.
        const rows = Math.max(1, Math.min(Number(input?.rows) || 1000, 1_000_000));
        const format = input?.format === 'json' ? 'json' : 'csv';

        let p: string;
        try {
            p = resolveToolPath(raw, { sandbox: true });
        } catch (e: any) {
            return { ok: false, error: `refused: ${raw} is outside the workspace — nothing was written.` };
        }
        try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { }

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

        try {
            fs.writeFileSync(p, content);
        } catch (e: any) {
            return { ok: false, error: `could not write ${raw}: ${String(e?.message || e)}` };
        }
        const stats = fs.statSync(p);

        return {
            ok: true,
            output: { fileSize: stats.size, path: p },
            logs: [`generated ${rows} rows in ${p}`]
        };
    }
}
