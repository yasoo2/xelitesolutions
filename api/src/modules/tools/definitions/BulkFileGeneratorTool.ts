import { ToolDefinition, ToolExecutionResult } from '../types';
import fs from 'fs';
import path from 'path';
import { workspaceService } from '../../services/WorkspaceService';

export const BulkFileGeneratorTool: ToolDefinition = {
    name: 'bulk_file_generator',
    version: '1.0.0',
    tags: ['filesystem', 'bulk', 'scaffold'],
    description: 'Create or overwrite multiple files at once. Essential for efficient project scaffolding.',
    inputSchema: {
        type: 'object',
        properties: {
            files: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: 'Absolute path or relative to cwd' },
                        content: { type: 'string' }
                    },
                    required: ['path', 'content']
                },
                description: 'List of files to create'
            },
            cwd: { type: 'string', description: 'Base directory for relative paths' }
        },
        required: ['files']
    },
    outputSchema: {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            created: { type: 'array', items: { type: 'string' } },
            errors: { type: 'array' }
        }
    },
    permissions: ['write'],
    sideEffects: ['write'],
    rateLimitPerMinute: 60,
    auditFields: ['cwd'],
    mockSupported: true,
    execute: async (input, context) => {
        const files = input.files;
        const cwd = input.cwd || process.cwd();
        const created: string[] = [];
        const errors: string[] = [];
        const logs: string[] = [];

        // Workspace containment: validate cwd is within workspace boundary
        const workspaceRoot = path.resolve(workspaceService.getActiveRoot(context?.workspaceId) || '');
        const resolvedCwd = path.resolve(cwd);
        if (!resolvedCwd.startsWith(workspaceRoot + path.sep) && resolvedCwd !== workspaceRoot) {
            return {
                ok: false,
                error: `cwd '${cwd}' escapes workspace boundary. Must be within workspace root: ${workspaceRoot}`,
                logs: [`[BulkGen] SECURITY: cwd '${cwd}' rejected - outside workspace boundary`]
            };
        }

        const totalFiles = files.length;
        logs.push(`[BulkGen] Processing ${totalFiles} files in ${cwd}...`);

        // PHASE 5 ENHANCEMENT: Support for large batches (50+ files)
        const BATCH_SIZE = 10;
        let processed = 0;

        for (let i = 0; i < files.length; i += BATCH_SIZE) {
            const batch = files.slice(i, i + BATCH_SIZE);

            for (const file of batch) {
                try {
                    const targetPath = path.isAbsolute(file.path) ? file.path : path.resolve(cwd, file.path);

                    // Workspace containment: validate targetPath is within workspace boundary
                    const resolvedTargetPath = path.resolve(targetPath);
                    if (!resolvedTargetPath.startsWith(workspaceRoot + path.sep) && resolvedTargetPath !== workspaceRoot) {
                        errors.push(`Path '${file.path}' escapes workspace boundary`);
                        logs.push(`[BulkGen] SECURITY: Path '${file.path}' rejected - outside workspace boundary`);
                        continue;
                    }

                    const dir = path.dirname(resolvedTargetPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(resolvedTargetPath, file.content, 'utf-8');
                    created.push(resolvedTargetPath);
                    processed++;

                    // Progress reporting every 10 files
                    if (processed % 10 === 0) {
                        logs.push(`Progress: ${processed}/${totalFiles} files (${Math.round(processed / totalFiles * 100)}%)`);
                    }
                } catch (e: any) {
                    errors.push(`Failed to write ${file.path}: ${e.message}`);
                    logs.push(`Error: ${file.path} - ${e.message}`);
                }
            }

            // Small delay between batches to avoid overwhelming the system
            if (i + BATCH_SIZE < files.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        logs.push(`[BulkGen] Complete: ${created.length} created, ${errors.length} errors`);

        return {
            ok: errors.length === 0,
            output: {
                success: errors.length === 0,
                created,
                errors,
                stats: {
                    total: totalFiles,
                    created: created.length,
                    failed: errors.length
                }
            },
            logs
        };
    }
};
