
import { ToolDefinition } from '../types';
import { KnowledgeService } from '../../services/knowledge';
import { executionEngine } from '../../../kernel/ExecutionEngine';
import fs from 'fs';
import path from 'path';

/**
 * ErrorRecoveryTool V2 - "Wolverine" Self-Healing Engine
 */
export class ErrorRecoveryTool implements ToolDefinition {
    name = 'error_recovery';
    version = '2.0.0';
    description = 'Wolverine-style self-healing: Detects errors, AI-analyzes them, auto-fixes, and retries until success.';
    tags = ['error', 'recovery', 'resilience', 'self-healing', 'wolverine', 'god-mode'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            error: { type: 'string' as const },
            context: { type: 'object' as const },
            sourceCode: { type: 'string' as const },
            filePath: { type: 'string' as const },
            attemptFix: { type: 'boolean' as const },
            maxRetries: { type: 'number' as const }
        },
        required: ['error']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            recovered: { type: 'boolean' as const },
            suggestion: { type: 'string' as const },
            fixApplied: { type: 'string' as const },
            suggestedArgs: { type: 'object' as const },
            retryCount: { type: 'number' as const }
        }
    };

    permissions = ['execute' as const, 'write' as const, 'read' as const];
    sideEffects = ['write' as const, 'execute' as const];
    rateLimitPerMinute = 20;
    auditFields = ['error', 'filePath'];
    mockSupported = false;

    private static errorPatterns = [
        { pattern: /module not found|cannot find module/i, type: 'missing_dependency', fix: 'npm install <module>' },
        { pattern: /syntax error|unexpected token/i, type: 'syntax_error', fix: 'Check syntax at line mentioned' },
        { pattern: /EADDRINUSE|port.*already in use/i, type: 'port_conflict', fix: 'Change port or kill process using the port' },
        { pattern: /ENOENT|no such file or directory/i, type: 'file_not_found', fix: 'Create missing file or check path' },
        { pattern: /permission denied|EACCES/i, type: 'permission_error', fix: 'Check file permissions or run with sudo' },
        { pattern: /dns_failed|no_such_host|NXDOMAIN/i, type: 'connectivity_error', fix: 'Check URL spelling or network connectivity' }
    ];

    async execute(input: { error: string; context?: any; attemptFix?: boolean }) {
        const { error, context, attemptFix = false } = input;
        const logs: string[] = [];

        try {
            let recallSolution = null;
            try {
                const searchResults = await KnowledgeService.search(`fix error: ${error}`);
                if (searchResults.length > 0 && searchResults[0].score > 0.85) {
                    recallSolution = searchResults[0];
                    logs.push(`🧠 Recalled similar fix from memory (confidence: ${recallSolution.score.toFixed(2)})`);
                }
            } catch (e) { }

            let analysis;
            let suggestion;

            if (recallSolution) {
                analysis = { type: 'recalled_solution', fix: recallSolution.snippet };
                suggestion = `Apply known fix: ${recallSolution.snippet}`;
            } else {
                analysis = this.analyzeError(error);
                logs.push(`Error type: ${analysis.type}`);
                suggestion = analysis.fix || 'No automatic fix available';
            }

            let recovered = false;
            let fixApplied = '';

            if (attemptFix && analysis.autoFixable) {
                logs.push(`🦸 Wolverine Mode: Attempting auto-fix for "${analysis.type}"...`);

                if (analysis.type === 'missing_dependency' && analysis.module) {
                    recovered = await this.autoInstallDependency(analysis.module, logs);
                    if (recovered) fixApplied = `npm install ${analysis.module}`;
                } else if (analysis.type === 'file_not_found') {
                    const fileMatch = error.match(/['"]([^'"]+\.(?:ts|js|tsx|jsx|json|css|scss))['"]/) ||
                        error.match(/ENOENT.*?['"]([^'"]+)['"]/);
                    if (fileMatch) {
                        recovered = await this.createMissingFile(fileMatch[1], logs);
                        if (recovered) fixApplied = `Created file: ${fileMatch[1]}`;
                    }
                }

                if (recovered) {
                    logs.push(`✅ Wolverine successfully healed the error!`);
                }
            }

            return {
                ok: true,
                output: {
                    recovered,
                    errorType: analysis.type,
                    suggestion,
                    suggestedArgs: (input as any).suggestedArgs,
                    context: context || {}
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Recovery failed: ${error.message}`);
            return { ok: false, error: error.message, logs };
        }
    }

    private analyzeError(error: string): { type: string; fix: string; autoFixable: boolean; module?: string } {
        for (const pattern of ErrorRecoveryTool.errorPatterns) {
            if (pattern.pattern.test(error)) {
                let module: string | undefined;
                if (pattern.type === 'missing_dependency') {
                    const match = error.match(/Cannot find module ['"]([^'"]+)['"]/i) ||
                        error.match(/Module not found.*['"]([^'"]+)['"]/i);
                    if (match) module = match[1];
                }
                return {
                    type: pattern.type,
                    fix: pattern.fix,
                    autoFixable: ['missing_dependency', 'file_not_found'].includes(pattern.type),
                    module
                };
            }
        }
        return { type: 'unknown', fix: 'Manual intervention required', autoFixable: false };
    }

    private async autoInstallDependency(moduleName: string, logs: string[]): Promise<boolean> {
        if (moduleName.startsWith('.') || moduleName.startsWith('/')) return false;
        logs.push(`🔧 Wolverine: Installing "${moduleName}" via ExecutionEngine...`);
        const result = await executionEngine.run(`npm install ${moduleName}`, { cwd: this.getWorkspaceRoot() });
        if (result.ok) {
            logs.push(`✅ Successfully installed "${moduleName}"`);
            return true;
        } else {
            logs.push(`❌ Failed to install "${moduleName}": ${result.error || result.output}`);
            return false;
        }
    }

    private async createMissingFile(filePath: string, logs: string[]): Promise<boolean> {
        logs.push(`🔧 Wolverine: Creating missing file "${filePath}"...`);
        try {
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.getWorkspaceRoot(), filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            let content = '// Auto-generated by Wolverine Engine\n';
            const ext = path.extname(filePath);
            if (ext === '.ts' || ext === '.tsx') content += 'export {};\n';
            else if (ext === '.json') content = '{}';
            fs.writeFileSync(fullPath, content);
            logs.push(`✅ Created file: ${filePath}`);
            return true;
        } catch (e: any) {
            logs.push(`❌ Failed to create file: ${e.message}`);
            return false;
        }
    }

    private getWorkspaceRoot(): string {
        try {
            const { workspaceService } = require('../../services/WorkspaceService');
            return workspaceService.getActiveRoot();
        } catch {
            return process.cwd();
        }
    }
}
