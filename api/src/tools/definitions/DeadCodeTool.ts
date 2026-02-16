/**
 * Dead Code Detection Tool - Uses Knip for intelligent dead code analysis
 * Part of the "God Mode" upgrade for Joe system
 */

import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot();
    } catch {
        return process.cwd();
    }
}

export class DeadCodeTool extends BaseTool {
    name = 'dead_code_detector';
    description = 'Analyzes the codebase using Knip to find unused files, dependencies, exports, and types. Returns actionable cleanup recommendations.';
    version = '1.0.0';
    tags = ['analysis', 'cleanup', 'dead-code', 'maintenance', 'god-mode'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            mode: {
                type: 'string',
                enum: ['scan', 'types', 'dependencies', 'files', 'exports'],
                description: 'What to scan for. Default is "scan" (full analysis).'
            },
            autoFix: {
                type: 'boolean',
                description: 'If true, attempts to auto-remove detected dead code (USE WITH CAUTION).'
            },
            projectPath: {
                type: 'string',
                description: 'Path to the project to analyze. Defaults to workspace root.'
            }
        }
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            issues: { type: 'array' },
            summary: { type: 'object' },
            recommendations: { type: 'array' }
        }
    };
    permissions: ToolPermission[] = ['read', 'execute'];
    sideEffects: ToolPermission[] = ['execute'];
    rateLimitPerMinute = 10;
    auditFields = ['mode', 'projectPath'];

    async execute(input: any) {
        const logs: string[] = [];
        const mode = String(input?.mode || 'scan');
        const autoFix = !!input?.autoFix;
        const projectPathInput = String(input?.projectPath || '');

        const workDir = projectPathInput ? path.resolve(getWorkspaceRoot(), projectPathInput) : getWorkspaceRoot();

        if (!fs.existsSync(workDir)) {
            return { ok: false, error: 'Project path does not exist', logs };
        }

        logs.push(`dead_code.mode=${mode}`);
        logs.push(`dead_code.path=${workDir}`);

        try {
            // Build knip command arguments based on mode
            const args: string[] = ['knip', '--reporter', 'json'];

            switch (mode) {
                case 'dependencies':
                    args.push('--include', 'dependencies,devDependencies,unlisted,unresolved');
                    break;
                case 'files':
                    args.push('--include', 'files,duplicates');
                    break;
                case 'exports':
                    args.push('--include', 'exports,nsExports,classMembers');
                    break;
                case 'types':
                    args.push('--include', 'types,nsTypes,enumMembers');
                    break;
                default: // 'scan' - full analysis
                    break;
            }

            const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
                const child = spawn('npx', args, {
                    cwd: workDir,
                    shell: true,
                    env: { ...process.env, FORCE_COLOR: '0' }
                });

                let stdout = '';
                let stderr = '';
                child.stdout.on('data', (d: any) => { stdout += d.toString(); });
                child.stderr.on('data', (d: any) => { stderr += d.toString(); });
                child.on('close', (code: number) => resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr }));
                child.on('error', (e: any) => resolve({ code: 1, stdout, stderr: String(e?.message || e) }));
            });

            // Parse Knip output
            let issues: any[] = [];
            let summary = {
                unusedFiles: 0,
                unusedDependencies: 0,
                unusedExports: 0,
                unusedTypes: 0,
                totalIssues: 0
            };

            try {
                // Knip outputs JSON when successful
                const parsed = JSON.parse(result.stdout);

                // Process different issue types
                if (parsed.files) {
                    summary.unusedFiles = parsed.files.length;
                    issues.push(...parsed.files.map((f: string) => ({
                        type: 'unused_file',
                        path: f,
                        recommendation: `Delete file: ${f}`
                    })));
                }

                if (parsed.dependencies) {
                    summary.unusedDependencies = parsed.dependencies.length;
                    issues.push(...parsed.dependencies.map((d: string) => ({
                        type: 'unused_dependency',
                        name: d,
                        recommendation: `npm uninstall ${d}`
                    })));
                }

                if (parsed.devDependencies) {
                    summary.unusedDependencies += parsed.devDependencies.length;
                    issues.push(...parsed.devDependencies.map((d: string) => ({
                        type: 'unused_dev_dependency',
                        name: d,
                        recommendation: `npm uninstall -D ${d}`
                    })));
                }

                if (parsed.exports) {
                    const exportIssues = Object.entries(parsed.exports).flatMap(([file, exps]: [string, any]) =>
                        (Array.isArray(exps) ? exps : []).map(e => ({
                            type: 'unused_export',
                            path: file,
                            name: e,
                            recommendation: `Remove unused export "${e}" from ${file}`
                        }))
                    );
                    summary.unusedExports = exportIssues.length;
                    issues.push(...exportIssues);
                }

                summary.totalIssues = issues.length;
            } catch {
                // If JSON parsing fails, return raw output
                logs.push('dead_code.parse_failed=true');
                return {
                    ok: true,
                    output: {
                        raw: result.stdout,
                        stderr: result.stderr,
                        issues: [],
                        summary: { totalIssues: 0, parseError: true }
                    },
                    logs
                };
            }

            // Generate recommendations
            const recommendations: string[] = [];
            if (summary.unusedDependencies > 0) {
                recommendations.push(`🧹 Found ${summary.unusedDependencies} unused dependencies. Run suggested npm uninstall commands.`);
            }
            if (summary.unusedFiles > 0) {
                recommendations.push(`📁 Found ${summary.unusedFiles} unused files. Review and delete if not needed.`);
            }
            if (summary.unusedExports > 0) {
                recommendations.push(`📤 Found ${summary.unusedExports} unused exports. Clean up to reduce bundle size.`);
            }
            if (summary.totalIssues === 0) {
                recommendations.push(`✅ Codebase is clean! No dead code detected.`);
            }

            logs.push(`dead_code.total_issues=${summary.totalIssues}`);

            return {
                ok: true,
                output: {
                    issues: issues.slice(0, 50), // Limit to 50 for readability
                    summary,
                    recommendations,
                    truncated: issues.length > 50
                },
                logs
            };

        } catch (e: any) {
            logs.push(`dead_code.error=${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }
}
