import { ToolDefinition } from '../types';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import * as path from 'path';
import * as fs from 'fs';

/**
 * ArchiveFilesTool — File compression and archive management.
 *
 * Provides a clean interface for creating and extracting archives
 * (zip, tar.gz, tar) without the agent needing to remember shell flags.
 */
export class ArchiveFilesTool implements ToolDefinition {
    name = 'archive_files';
    description =
        'Create or extract file archives (zip, tar.gz, tar). ' +
        'Use action "create" to compress files/directories into an archive. ' +
        'Use action "extract" to decompress an archive. ' +
        'Use action "list" to view contents of an archive without extracting.';
    version = '1.0.0';
    tags = ['files', 'archive', 'compression', 'zip', 'tar'];
    permissions: any = ['read', 'write', 'execute'];
    sideEffects: any = ['write'];
    rateLimitPerMinute = 20;
    auditFields = ['action', 'archivePath'];
    mockSupported = false;
    outputSchema = {
        type: 'object',
        properties: {
            archivePath: { type: 'string' },
            files: { type: 'array', items: { type: 'string' } },
            size: { type: 'string' },
        },
    };
    inputSchema = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['create', 'extract', 'list'],
                description: 'Action to perform: create, extract, or list archive contents.',
            },
            archivePath: {
                type: 'string',
                description: 'Path to the archive file (for create: output path; for extract/list: input path).',
            },
            sourcePaths: {
                type: 'array',
                items: { type: 'string' },
                description: 'Files/directories to include (only for "create" action).',
            },
            extractTo: {
                type: 'string',
                description: 'Directory to extract to (only for "extract" action). Defaults to current directory.',
            },
            format: {
                type: 'string',
                enum: ['zip', 'tar.gz', 'tar'],
                description: 'Archive format. Auto-detected from file extension if not specified.',
            },
        },
        required: ['action', 'archivePath'],
    };

    async execute(input: any) {
        const action = String(input.action || '');
        const archivePath = String(input.archivePath || '');
        const logs: string[] = [];

        if (!archivePath) {
            return { ok: false, error: 'archivePath is required', logs: [] };
        }

        // Detect format from extension
        let format = input.format || '';
        if (!format) {
            if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) format = 'tar.gz';
            else if (archivePath.endsWith('.tar')) format = 'tar';
            else if (archivePath.endsWith('.zip')) format = 'zip';
            else format = 'zip'; // default
        }

        try {
            if (action === 'create') {
                const sources = input.sourcePaths || [];
                if (!sources.length) {
                    return { ok: false, error: 'sourcePaths required for create action', logs: [] };
                }
                const sourceStr = sources.map((s: string) => `"${s}"`).join(' ');

                let cmd: string;
                if (format === 'zip') {
                    cmd = `zip -r --symlinks "${archivePath}" ${sourceStr} 2>/dev/null || true`;
                } else if (format === 'tar.gz') {
                    cmd = `tar -czf "${archivePath}" ${sourceStr}`;
                } else {
                    cmd = `tar -cf "${archivePath}" ${sourceStr}`;
                }

                const result = await ExecutionGateway.execute(cmd, [], { timeout: 60000, shell: true });
                if (!result.ok && format !== 'zip') throw new Error(result.error || 'Archive creation failed');
                const stat = fs.statSync(archivePath);
                const sizeKB = (stat.size / 1024).toFixed(1);
                logs.push(`Archive created: ${archivePath} (${sizeKB} KB)`);

                return {
                    ok: true,
                    output: { archivePath, size: `${sizeKB} KB`, files: sources },
                    logs,
                };
            }

            if (action === 'extract') {
                const extractTo = input.extractTo || path.dirname(archivePath);
                fs.mkdirSync(extractTo, { recursive: true });

                let cmd: string;
                if (format === 'zip') {
                    cmd = `unzip -o "${archivePath}" -d "${extractTo}"`;
                } else if (format === 'tar.gz') {
                    cmd = `tar -xzf "${archivePath}" -C "${extractTo}"`;
                } else {
                    cmd = `tar -xf "${archivePath}" -C "${extractTo}"`;
                }

                const result = await ExecutionGateway.execute(cmd, [], { timeout: 60000, shell: true });
                if (!result.ok) throw new Error(result.error || 'Extraction failed');
                const output = result.output || '';
                logs.push(`Extracted to: ${extractTo}`);

                return {
                    ok: true,
                    output: { archivePath, extractedTo: extractTo, details: output.trim() },
                    logs,
                };
            }

            if (action === 'list') {
                let cmd: string;
                if (format === 'zip') {
                    cmd = `unzip -l "${archivePath}"`;
                } else {
                    cmd = `tar -tf "${archivePath}"`;
                }

                const result = await ExecutionGateway.execute(cmd, [], { timeout: 30000, shell: true });
                if (!result.ok) throw new Error(result.error || 'Listing failed');
                const output = result.output || '';
                const files = output.trim().split('\n').slice(0, 100);
                logs.push(`Listed ${files.length} entries`);

                return {
                    ok: true,
                    output: { archivePath, files, count: files.length },
                    logs,
                };
            }

            return { ok: false, error: `Unknown action: ${action}`, logs: [] };
        } catch (error: any) {
            return {
                ok: false,
                error: `Archive operation failed: ${error.message}`,
                logs: [`Error: ${error.message}`],
            };
        }
    }
}
