import { ToolDefinition } from '../types';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * PythonExecutionTool — Isolated Python script runner.
 */
export class PythonExecutionTool implements ToolDefinition {
    name = 'execute_python';
    description =
        'Execute a Python 3 script in an isolated environment. ' +
        'Use this for mathematical calculations, data analysis, file processing, ' +
        'JSON/CSV manipulation, or any computation where precision is critical. ' +
        'The script is saved to a temporary file and executed via python3. ' +
        'Returns stdout and stderr. Libraries like json, math, os, csv, re are available by default.';
    version = '1.0.0';
    tags = ['python', 'compute', 'math', 'data', 'analysis', 'code-interpreter'];
    permissions: any = ['execute'];
    sideEffects: any = ['execute'];
    rateLimitPerMinute = 20;
    auditFields = ['code'];
    mockSupported = false;
    outputSchema = {
        type: 'object',
        properties: {
            stdout: { type: 'string', description: 'Standard output from the script' },
            stderr: { type: 'string', description: 'Standard error from the script' },
            exitCode: { type: 'number', description: 'Exit code of the process' },
        },
    };
    inputSchema = {
        type: 'object',
        properties: {
            code: {
                type: 'string',
                description:
                    'The Python 3 code to execute. Must be a complete, runnable script. Use print() to output results.',
            },
            timeout: {
                type: 'number',
                description: 'Max execution time in seconds. Default: 30.',
            },
            workingDirectory: {
                type: 'string',
                description: 'Optional working directory for the script execution.',
            },
        },
        required: ['code'],
    };

    async execute(input: any, context?: any) {
        const code = String(input.code || '');
        const timeout = Math.min(Number(input.timeout) || 30, 120) * 1000;
        const cwd = input.workingDirectory || process.cwd();

        if (!code.trim()) {
            return {
                ok: false,
                error: 'No Python code provided.',
                logs: ['Error: Empty code input'],
            };
        }

        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `joe_python_${Date.now()}.py`);

        try {
            fs.writeFileSync(tmpFile, code, 'utf-8');

            const result = await ExecutionGateway.execute('python3', [tmpFile], {
                timeout,
                cwd,
            });

            let stdout = result.output || '';
            let stderr = result.error || '';
            let exitCode = result.exitCode ?? (result.ok ? 0 : 1);

            // Clean up temp file
            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

            // Truncate very long outputs
            const maxLen = 8000;
            if (stdout.length > maxLen) {
                stdout = stdout.substring(0, maxLen) + '\n... [output truncated]';
            }
            if (stderr.length > maxLen) {
                stderr = stderr.substring(0, maxLen) + '\n... [stderr truncated]';
            }

            return {
                ok: result.ok,
                output: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode },
                error: !result.ok ? result.error || `Script exited with code ${exitCode}` : undefined,
                logs: [
                    `Python script executed (exit code: ${exitCode})`,
                    stdout ? `stdout: ${stdout.substring(0, 200)}` : 'No stdout',
                ],
            };
        } catch (error: any) {
            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
            return {
                ok: false,
                error: `Python execution failed: ${error.message}`,
                logs: [`Error: ${error.message}`],
            };
        }
    }
}
