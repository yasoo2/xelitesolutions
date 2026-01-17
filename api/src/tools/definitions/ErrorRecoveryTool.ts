import { ToolDefinition } from '../types';

/**
 * ErrorRecoveryTool - Intelligent error recovery and auto-fix
 * Detects errors and attempts automatic recovery
 */
export class ErrorRecoveryTool implements ToolDefinition {
    name = 'error_recovery';
    version = '1.0.0';
    description = 'Detect and recover from errors automatically';
    tags = ['error', 'recovery', 'resilience'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            error: {
                type: 'string' as const,
                description: 'Error message or description'
            },
            context: {
                type: 'object' as const,
                description: 'Error context (file, line, etc.)'
            },
            attemptFix: {
                type: 'boolean' as const,
                description: 'Attempt automatic fix'
            }
        },
        required: ['error']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            recovered: { type: 'boolean' as const },
            suggestion: { type: 'string' as const }
        }
    };

    permissions = ['execute' as const];
    sideEffects = ['write' as const];
    rateLimitPerMinute = 30;
    auditFields = ['error'];
    mockSupported = false;

    private static errorPatterns = [
        {
            pattern: /module not found|cannot find module/i,
            type: 'missing_dependency',
            fix: 'npm install <module>'
        },
        {
            pattern: /syntax error|unexpected token/i,
            type: 'syntax_error',
            fix: 'Check syntax at line mentioned'
        },
        {
            pattern: /EADDRINUSE|port.*already in use/i,
            type: 'port_conflict',
            fix: 'Change port or kill process using the port'
        },
        {
            pattern: /ENOENT|no such file or directory/i,
            type: 'file_not_found',
            fix: 'Create missing file or check path'
        },
        {
            pattern: /permission denied|EACCES/i,
            type: 'permission_error',
            fix: 'Check file permissions or run with sudo'
        }
    ];

    async execute(input: { error: string; context?: any; attemptFix?: boolean }) {
        const { error, context, attemptFix = false } = input;
        const logs: string[] = [];

        try {
            // Analyze error
            const analysis = this.analyzeError(error);
            logs.push(`Error type: ${analysis.type}`);

            // Suggest fix
            const suggestion = analysis.fix || 'No automatic fix available';
            logs.push(`Suggestion: ${suggestion}`);

            // Attempt recovery if requested
            let recovered = false;
            if (attemptFix && analysis.type === 'missing_dependency') {
                // Example: could attempt npm install
                logs.push('Auto-fix not implemented yet for this error type');
            }

            return {
                ok: true,
                output: {
                    recovered,
                    errorType: analysis.type,
                    suggestion,
                    context: context || {}
                },
                logs
            };

        } catch (error: any) {
            logs.push(`Recovery failed: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                logs
            };
        }
    }

    private analyzeError(error: string): { type: string; fix: string } {
        for (const pattern of ErrorRecoveryTool.errorPatterns) {
            if (pattern.pattern.test(error)) {
                return { type: pattern.type, fix: pattern.fix };
            }
        }

        return { type: 'unknown', fix: 'Manual intervention required' };
    }
}
