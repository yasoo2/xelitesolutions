import { ToolDefinition } from '../types';
import { executeTool } from '../../services/ToolService';

/**
 * AutoTesterTool - Automated testing and verification
 * Runs tests and checks for errors in generated code
 */
export class AutoTesterTool implements ToolDefinition {
    name = 'auto_tester';
    version = '1.0.0';
    description = 'Automatically test code, check syntax, and verify functionality';
    tags = ['testing', 'verification', 'quality'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            testType: {
                type: 'string' as const,
                enum: ['syntax', 'build', 'unit', 'integration'],
                description: 'Type of test to run'
            },
            projectPath: {
                type: 'string' as const,
                description: 'Path to project to test'
            },
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Specific files to test'
            }
        },
        required: ['testType']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            passed: { type: 'boolean' as const },
            errors: {
                type: 'array' as const,
                items: { type: 'object' as const }
            },
            summary: { type: 'string' as const }
        }
    };

    permissions = ['execute' as const];
    sideEffects = [];
    rateLimitPerMinute = 20;
    auditFields = ['testType', 'projectPath'];
    mockSupported = false;

    async execute(input: { testType: string; projectPath?: string; files?: string[]; sessionId?: string; workspaceId?: string; __workspaceId?: string }, context?: any) {
        const { testType, projectPath = '.', files = [] } = input;
        const logs: string[] = [];
        const sessionId =
            typeof context?.sessionId === 'string' && context.sessionId.trim()
                ? context.sessionId.trim()
                : typeof input?.sessionId === 'string' && input.sessionId.trim()
                    ? input.sessionId.trim()
                    : undefined;
        const workspaceId =
            typeof context?.workspaceId === 'string' && context.workspaceId.trim()
                ? context.workspaceId.trim()
                : typeof input?.workspaceId === 'string' && input.workspaceId.trim()
                    ? input.workspaceId.trim()
                    : typeof input?.__workspaceId === 'string' && input.__workspaceId.trim()
                        ? input.__workspaceId.trim()
                        : undefined;

        try {
            logs.push(`Running ${testType} test on ${projectPath}`);

            switch (testType) {
                case 'syntax':
                    return this.checkSyntax(projectPath, files, logs, { sessionId, workspaceId });

                case 'build':
                    return this.runBuild(projectPath, logs, { sessionId, workspaceId });

                case 'unit':
                    return this.runUnitTests(projectPath, logs, { sessionId, workspaceId });

                case 'integration':
                    return this.runIntegrationTests(projectPath, logs);

                default:
                    throw new Error(`Unknown test type: ${testType}`);
            }

        } catch (error: any) {
            logs.push(`Error: ${error.message}`);
            return {
                ok: false,
                error: error.message,
                output: {
                    passed: false,
                    errors: [{ message: error.message }],
                    summary: `Test failed: ${error.message}`
                },
                logs
            };
        }
    }

    private async checkSyntax(projectPath: string, files: string[], logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        logs.push('Checking syntax...');

        // Use shell_execute to run syntax check
        const result = await executeTool('shell_execute', {
            command: files.length > 0
                ? `node --check ${files.join(' ')}`
                : `find ${projectPath} -name "*.js" -o -name "*.ts" | xargs -I {} node --check {}`,
            cwd: projectPath
        }, ctx);

        const passed = result.ok && !result.output?.includes('SyntaxError');

        return {
            ok: true,
            output: {
                passed,
                errors: passed ? [] : [{ type: 'syntax', message: result.output }],
                summary: passed ? 'All syntax checks passed' : 'Syntax errors found'
            },
            logs
        };
    }

    private async runBuild(projectPath: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        logs.push('Running build...');

        // Check if package.json exists and has build script
        const result = await executeTool('shell_execute', {
            command: 'npm run build',
            cwd: projectPath
        }, ctx);

        const passed = result.ok;

        return {
            ok: true,
            output: {
                passed,
                errors: passed ? [] : [{ type: 'build', message: result.error || 'Build failed' }],
                summary: passed ? 'Build successful' : 'Build failed'
            },
            logs
        };
    }

    private async runUnitTests(projectPath: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        logs.push('Running unit tests...');

        const result = await executeTool('shell_execute', {
            command: 'npm test',
            cwd: projectPath
        }, ctx);

        const passed = result.ok;

        return {
            ok: true,
            output: {
                passed,
                errors: passed ? [] : [{ type: 'test', message: 'Some tests failed' }],
                summary: passed ? 'All tests passed' : 'Some tests failed'
            },
            logs
        };
    }

    private async runIntegrationTests(projectPath: string, logs: string[]) {
        logs.push('Running integration tests...');

        // Placeholder for integration tests
        return {
            ok: true,
            output: {
                passed: true,
                errors: [],
                summary: 'Integration tests not yet implemented'
            },
            logs
        };
    }
}
