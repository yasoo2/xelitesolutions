
/**
 * Dead Code Detection Tool - Uses Knip for intelligent dead code analysis
 */
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { executionEngine } from '../../../kernel/ExecutionEngine';
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
    description = 'Analyzes the codebase using Knip to find unused files, dependencies, exports, and types.';
    version = '1.0.0';
    tags = ['analysis', 'cleanup', 'dead-code', 'maintenance'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            mode: { type: 'string', enum: ['scan', 'types', 'dependencies', 'files', 'exports'] },
            autoFix: { type: 'boolean' },
            projectPath: { type: 'string' }
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
        const projectPathInput = String(input?.projectPath || '');
        const workDir = projectPathInput ? path.resolve(getWorkspaceRoot(), projectPathInput) : getWorkspaceRoot();

        if (!fs.existsSync(workDir)) return { ok: false, error: 'Project path does not exist', logs };

        logs.push(`dead_code.mode=${mode}`);

        try {
            const args: string[] = ['knip', '--reporter', 'json'];
            switch (mode) {
                case 'dependencies': args.push('--include', 'dependencies,devDependencies,unlisted,unresolved'); break;
                case 'files': args.push('--include', 'files,duplicates'); break;
                case 'exports': args.push('--include', 'exports,nsExports,classMembers'); break;
                case 'types': args.push('--include', 'types,nsTypes,enumMembers'); break;
            }

            const result = await executionEngine.run(`npx ${args.join(' ')}`, {
                cwd: workDir,
                env: { ...process.env, FORCE_COLOR: '0' }
            });

            let issues: any[] = [];
            let summary = { unusedFiles: 0, unusedDependencies: 0, unusedExports: 0, unusedTypes: 0, totalIssues: 0 };

            try {
                const parsed = JSON.parse(result.output);
                if (parsed.files) {
                    summary.unusedFiles = parsed.files.length;
                    issues.push(...parsed.files.map((f: string) => ({ type: 'unused_file', path: f, recommendation: `Delete file: ${f}` })));
                }
                if (parsed.dependencies) {
                    summary.unusedDependencies = parsed.dependencies.length;
                    issues.push(...parsed.dependencies.map((d: string) => ({ type: 'unused_dependency', name: d, recommendation: `npm uninstall ${d}` })));
                }
                if (parsed.devDependencies) {
                    summary.unusedDependencies += parsed.devDependencies.length;
                    issues.push(...parsed.devDependencies.map((d: string) => ({ type: 'unused_dev_dependency', name: d, recommendation: `npm uninstall -D ${d}` })));
                }
                if (parsed.exports) {
                    const exportIssues = Object.entries(parsed.exports).flatMap(([file, exps]: [string, any]) =>
                        (Array.isArray(exps) ? exps : []).map(e => ({ type: 'unused_export', path: file, name: e, recommendation: `Remove unused export "${e}" from ${file}` }))
                    );
                    summary.unusedExports = exportIssues.length;
                    issues.push(...exportIssues);
                }
                summary.totalIssues = issues.length;
            } catch {
                return { ok: true, output: { raw: result.output, stderr: result.error, issues: [], summary: { totalIssues: 0, parseError: true } }, logs };
            }

            const recommendations: string[] = [];
            if (summary.unusedDependencies > 0) recommendations.push(`🧹 Found ${summary.unusedDependencies} unused dependencies.`);
            if (summary.unusedFiles > 0) recommendations.push(`📁 Found ${summary.unusedFiles} unused files.`);
            if (summary.unusedExports > 0) recommendations.push(`📤 Found ${summary.unusedExports} unused exports.`);
            if (summary.totalIssues === 0) recommendations.push(`✅ Codebase is clean!`);

            return { ok: true, output: { issues: issues.slice(0, 50), summary, recommendations, truncated: issues.length > 50 }, logs };
        } catch (e: any) {
            logs.push(`dead_code.error=${e.message}`);
            return { ok: false, error: e.message, logs };
        }
    }
}
