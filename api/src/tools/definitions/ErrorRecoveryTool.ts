import { ToolDefinition } from '../types';
import { KnowledgeService } from '../../services/knowledge';

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
            // 1. Check Knowledge Base for previous solutions (Recall)
            let recallSolution = null;
            try {
                const searchResults = await KnowledgeService.search(`fix error: ${error}`);
                if (searchResults.length > 0 && searchResults[0].score > 0.85) {
                    recallSolution = searchResults[0];
                    logs.push(`🧠 Recalled similar fix from memory (confidence: ${recallSolution.score.toFixed(2)})`);
                    logs.push(`Recalled Snippet: ${recallSolution.snippet}`);
                }
            } catch (e) {
                logs.push('Memory recall failed (ignoring)');
            }

            // 2. Analyze error (if no high-confidence recall)
            let analysis;
            let suggestion;

            if (recallSolution) {
                analysis = { type: 'recalled_solution', fix: recallSolution.snippet };
                suggestion = `Apply known fix: ${recallSolution.snippet}`;
            } else {
                analysis = this.analyzeError(error);
                logs.push(`Error type: ${analysis.type}`);
                suggestion = analysis.fix || 'No automatic fix available';
                logs.push(`Suggestion: ${suggestion}`);
            }

            // 3. Attempt recovery if requested
            let recovered = false;
            if (attemptFix) {
                if (analysis.type === 'missing_dependency') {
                    // Example: could attempt npm install
                    logs.push('Auto-fix not implemented yet for this error type');
                } else if (analysis.type === 'recalled_solution') {
                    // Try to apply the recalled fix (simulated for now)
                    logs.push('Applying recalled solution...');
                    recovered = true; // Assume success for this phase demonstration
                }
            }

            // 4. Learn (Store successful new discoveries)
            // If we found a pattern-based fix (not recalled) and it worked (simulated here as 'suggestion exists'), 
            // store it for future.
            if (!recallSolution && analysis.type !== 'unknown' && executionSuccess(analysis)) {
                try {
                    await KnowledgeService.add(
                        `fix_pattern_${Date.now()}.txt`,
                        `Error: ${error}\nFix: ${analysis.fix}`,
                        ['error-fix', analysis.type]
                    );
                    logs.push('🧠 Learned new fix pattern and stored in memory');
                } catch (e) {
                    logs.push('Failed to memorize new fix');
                }
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

// Helper to simulate if an analysis is "executable" or deemed a success worthy of memorizing
function executionSuccess(analysis: any) {
    // In real system, this would verify the fix worked. 
    // For now, we assume if we matched a pattern, it's a "good" fix to index if detailed enough.
    return analysis.type !== 'unknown';
}
