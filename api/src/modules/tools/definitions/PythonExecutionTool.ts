import { ToolDefinition } from '../types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * PythonExecutionTool — Isolated Python script runner.
 *
 * Allows the agent to write Python code, save it to a temp file,
 * and execute it via `python3`. This is critical for:
 * - Complex mathematical calculations (instead of "mental math")
 * - Data processing and analysis (pandas, json, csv)
 * - String manipulation and formatting
 * - Any task where LLM inference is unreliable
 *
 * Inspired by Manus / ChatGPT Code Interpreter.
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
        const timeout = Math.min(Number(input.timeout) || 30, 120) * 1000; // Cap at 120 seconds
        const cwd = input.workingDirectory || process.cwd();

        if (!code.trim()) {
            return {
                ok: false,
                error: 'No Python code provided.',
                logs: ['Error: Empty code input'],
            };
        }

        // Write code to a temporary file
        const tmpDir = os.tmpdir();
        const tmpFile = path.join(tmpDir, `joe_python_${Date.now()}.py`);

        try {
            fs.writeFileSync(tmpFile, code, 'utf-8');

            // Execute the script
            let stdout = '';
            let stderr = '';
            let exitCode = 0;

            try {
                stdout = execSync(`python3 "${tmpFile}"`, {
                    timeout,
                    cwd,
                    encoding: 'utf-8',
                    maxBuffer: 1024 * 1024 * 5, // 5MB max output
                    stdio: ['pipe', 'pipe', 'pipe'],
                });
            } catch (execError: any) {
                stdout = execError.stdout || '';
                stderr = execError.stderr || '';
                exitCode = execError.status || 1;
            }

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
                ok: exitCode === 0,
                output: { stdout: stdout.trim(), stderr: stderr.trim(), exitCode },
                error: exitCode !== 0 ? `Script exited with code ${exitCode}` : undefined,
                logs: [
                    `Python script executed (exit code: ${exitCode})`,
                    stdout ? `stdout: ${stdout.substring(0, 200)}` : 'No stdout',
                ],
            };
        } catch (error: any) {
            // Clean up temp file on error
            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

            return {
                ok: false,
                error: `Python execution failed: ${error.message}`,
                logs: [`Error: ${error.message}`],
            };
        }
    }
}
