import { ToolDefinition, ToolExecutionResult } from '../types';
import fs from 'fs';
import path from 'path';

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
    execute: async (input) => {
        const files = input.files;
        const cwd = input.cwd || process.cwd();
        const created: string[] = [];
        const errors: string[] = [];
        const logs: string[] = [];

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

                    // Security check: Ensure we are not writing outside allowed dirs
                    // For "God Mode" we assume trusted agent for now, but in prod we restrict.

                    const dir = path.dirname(targetPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(targetPath, file.content, 'utf-8');
                    created.push(targetPath);
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
