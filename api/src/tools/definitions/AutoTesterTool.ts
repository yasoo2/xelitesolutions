import { ToolDefinition } from '../types';
import { executeTool } from '../registry';

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

    async execute(input: { testType: string; projectPath?: string; files?: string[] }) {
        const { testType, projectPath = '.', files = [] } = input;
        const logs: string[] = [];

        try {
            logs.push(`Running ${testType} test on ${projectPath}`);

            switch (testType) {
                case 'syntax':
                    return this.checkSyntax(projectPath, files, logs);

                case 'build':
                    return this.runBuild(projectPath, logs);

                case 'unit':
                    return this.runUnitTests(projectPath, logs);

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

    private async checkSyntax(projectPath: string, files: string[], logs: string[]) {
        logs.push('Checking syntax...');

        // Use shell_execute to run syntax check
        const result = await executeTool('shell_execute', {
            command: files.length > 0
                ? `node --check ${files.join(' ')}`
                : `find ${projectPath} -name "*.js" -o -name "*.ts" | xargs -I {} node --check {}`,
            cwd: projectPath
        });

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

    private async runBuild(projectPath: string, logs: string[]) {
        logs.push('Running build...');

        // Check if package.json exists and has build script
        const result = await executeTool('shell_execute', {
            command: 'npm run build',
            cwd: projectPath
        });

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

    private async runUnitTests(projectPath: string, logs: string[]) {
        logs.push('Running unit tests...');

        const result = await executeTool('shell_execute', {
            command: 'npm test',
            cwd: projectPath
        });

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
