import fs from 'fs';
import path from 'path';

import { syntaxFileKind } from '../../../shared/syntax-contract';
import { ToolDefinition, ToolPermission } from '../types';
import { executeTool } from '../../services/ToolService';
import { resolveToolPath } from '../utils';

/**
 * AutoTesterTool - Automated testing and verification.
 *
 * This tool is an acceptance observer: “ok” means a real declared check passed.
 * It must not treat a missing test script, an unknown test type, or an invalid
 * workspace path as a successful no-op, because PhaseExecutor uses this value to
 * decide whether a phase is verified.
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
                description: 'Workspace-relative project directory to test'
            },
            files: {
                type: 'array' as const,
                items: { type: 'string' as const },
                description: 'Specific workspace-relative files to syntax-check'
            }
        },
        required: ['testType', 'projectPath']
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

    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = [];

    rateLimitPerMinute = 20;
    auditFields = ['testType', 'projectPath'];
    mockSupported = false;

    /**
     * DECLARE WHAT YOU READ.
     *
     * This signature listed six fields and the body read two more —
     * `userId` and `browserSessionId` — as a caller-supplied fallback for
     * when the context carries neither. `tsc` refused them; the whole Jest
     * suite could not see the refusal, because ts-jest runs with
     * `diagnostics: false`. It is the third time this exact shape has landed
     * (ExecutionPlan.metadata twice before). The fields are real and useful:
     * they are the identity a test run is attributed to. Declaring them
     * makes the contract readable instead of a lie the compiler was talked
     * out of.
     */
    async execute(input: {
        testType: string; projectPath?: string; files?: string[];
        sessionId?: string; workspaceId?: string; __workspaceId?: string;
        userId?: string; browserSessionId?: string;
    }, context?: any) {
        const { testType, projectPath = '', files = [] } = input || ({} as any);
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
        const userId =
            typeof context?.userId === 'string' && context.userId.trim()
                ? context.userId.trim()
                : typeof input?.userId === 'string' && input.userId.trim()
                    ? input.userId.trim()
                    : undefined;
        const browserSessionId =
            typeof context?.browserSessionId === 'string' && context.browserSessionId.trim()
                ? context.browserSessionId.trim()
                : undefined;
        const language =
            typeof context?.language === 'string' && context.language.trim()
                ? context.language.trim()
                : undefined;
        // Nested shell_execute calls must retain the full trusted owner context.
        // Dropping userId here makes ToolService correctly reject the delegated
        // command as unauthorized even though PhaseExecutor authorized the phase.
        const ctx = { sessionId, browserSessionId, workspaceId, userId, language };
        const supported = ['syntax', 'build', 'unit', 'integration'];

        if (!supported.includes(String(testType || '').trim())) {
            const error = `auto_tester requires testType to be one of: ${supported.join(', ')}.`;
            logs.push(`Input error: ${error}`);
            return this.failure(error, logs);
        }
        if (!String(projectPath || '').trim()) {
            const error = 'auto_tester requires a workspace-relative projectPath.';
            logs.push(`Input error: ${error}`);
            return this.failure(error, logs);
        }

        try {
            const safeProjectPath = resolveToolPath(projectPath, { workspaceId });
            const safeFiles = (Array.isArray(files) ? files : []).map(file =>
                resolveToolPath(String(file || ''), { workspaceId })
            );
            logs.push(`Running ${testType} test on ${projectPath}`);

            switch (testType) {
                case 'syntax':
                    return this.checkSyntax(safeProjectPath, safeFiles, logs, ctx);
                case 'build':
                    return this.runBuild(safeProjectPath, logs, ctx);
                case 'unit':
                    return this.runUnitTests(safeProjectPath, logs, ctx);
                case 'integration':
                    return this.runIntegrationTests(safeProjectPath, logs, ctx);
                default:
                    return this.failure(`Unknown test type: ${testType}`, logs);
            }
        } catch (error: any) {
            const message = String(error?.message || error);
            logs.push(`Error: ${message}`);
            return this.failure(message, logs);
        }
    }

    private failure(error: string, logs: string[], type = 'test') {
        return {
            ok: false,
            error,
            output: {
                passed: false,
                errors: [{ type, message: error }],
                summary: `Test failed: ${error}`
            },
            logs
        };
    }

    private async checkSyntax(projectPath: string, files: string[], logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        if (files.length === 0) {
            return this.failure('Syntax testing requires one or more evidenced source files.', logs, 'syntax');
        }

        const kinds = files.map(file => ({
            file,
            kind: syntaxFileKind(file),
            extension: path.extname(file).toLowerCase(),
        }));
        const unsupported = kinds.filter(item => item.kind === null).map(item => path.relative(projectPath, item.file) || item.file);
        if (unsupported.length > 0) {
            return this.failure(
                `auto_tester syntax supports JavaScript/TypeScript and JSON only; use a format-specific checker for: ${unsupported.join(', ')}`,
                logs,
                'syntax'
            );
        }

        logs.push(`Checking syntax for ${files.length} file(s)...`);

        // JSON is an artifact format, not JavaScript. Parsing it in-process is
        // deterministic, dependency-free, and works identically on Windows and
        // POSIX. The old implementation sent every file to `node --check`, so a
        // valid schema appeared to be a broken JS module and could trigger an
        // unsafe self-fix.
        const jsonFiles = kinds.filter(item => item.kind === 'json').map(item => item.file);
        for (const file of jsonFiles) {
            try {
                JSON.parse(fs.readFileSync(file, 'utf8'));
                logs.push(`JSON.parse passed: ${path.relative(projectPath, file) || file}`);
            } catch (error: any) {
                const name = path.relative(projectPath, file) || file;
                return this.failure(`Invalid JSON in ${name}: ${String(error?.message || error)}`, logs, 'syntax');
            }
        }

        const javascriptFiles = kinds
            .filter(item => item.kind === 'javascript' && ['.js', '.mjs', '.cjs'].includes(item.extension))
            .map(item => item.file);
        if (javascriptFiles.length > 0) {
            const quote = (value: string) => `'${String(value).replace(/'/g, "'\\''")}'`;
            const command = javascriptFiles
                .map(file => `node --check ${quote(path.relative(projectPath, file) || file)}`)
                .join(' && ');
            const result = await executeTool('shell_execute', { command, cwd: projectPath }, ctx);
            const passed = Boolean(result.ok) && !String((result as any).output || '').includes('SyntaxError');
            if (!passed) {
                return this.failure(String((result as any).error || (result as any).output || 'Syntax errors found'), logs, 'syntax');
            }
        }

        // Node's parser cannot parse JSX or TypeScript and would report a false
        // runtime error such as ERR_UNKNOWN_FILE_EXTENSION for a valid React
        // source file. Parse those source families with the already-declared
        // esbuild dependency, exactly like ProjectEditTool's syntax gate.
        const transpileFiles = kinds.filter(item => item.kind === 'javascript' && !['.js', '.mjs', '.cjs'].includes(item.extension));
        if (transpileFiles.length > 0) {
            let esbuild: any;
            try {
                esbuild = require('esbuild');
            } catch (error: any) {
                return this.failure(`JSX/TypeScript syntax checker unavailable: ${String(error?.message || error)}`, logs, 'syntax');
            }
            for (const item of transpileFiles) {
                const name = path.relative(projectPath, item.file) || item.file;
                const loader = item.extension === '.jsx' ? 'jsx' : 'tsx';
                try {
                    esbuild.transformSync(fs.readFileSync(item.file, 'utf8'), {
                        loader,
                        sourcefile: item.file,
                    });
                    logs.push(`esbuild syntax passed: ${name}`);
                } catch (error: any) {
                    const detail = String(error?.errors?.[0]?.text || error?.message || error).split('\n')[0].slice(0, 300);
                    return this.failure(`Syntax error in ${name}: ${detail}`, logs, 'syntax');
                }
            }
        }

        return {
            ok: true,
            output: { passed: true, errors: [], summary: 'All requested syntax checks passed' },
            logs
        };
    }

    private declaredScript(projectPath: string, allowed: string[], logs: string[]): string | null {
        const manifestPath = path.join(projectPath, 'package.json');
        if (!fs.existsSync(manifestPath)) {
            logs.push('No package.json exists in the requested project directory.');
            return null;
        }
        try {
            const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            const scripts = pkg && typeof pkg.scripts === 'object' ? pkg.scripts : {};
            const script = allowed.find(name => typeof scripts[name] === 'string' && scripts[name].trim());
            if (!script) logs.push(`No declared script found (looked for: ${allowed.join(', ')}).`);
            return script || null;
        } catch (error: any) {
            logs.push(`Could not read package.json: ${error?.message || error}`);
            return null;
        }
    }

    /**
     * A test that fetches localhost is an integration/smoke check even when a
     * generated package labels it `test`. Running it with only `npm run test`
     * produces a misleading ECONNREFUSED failure: the artifact may be valid,
     * but Joe never started the program the test is meant to observe.
     *
     * Discover exactly one local port from the declared script and its direct
     * test files. Multiple endpoints are deliberately not guessed; those need
     * an explicit orchestration contract rather than a hidden second server.
     */
    private liveTestPort(projectPath: string, script: string): number | null {
        let declaredCommand = String(script || '');
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8')) || {};
            const candidate = manifest?.scripts?.[String(script || '')];
            if (typeof candidate === 'string' && candidate.trim()) declaredCommand = candidate.trim();
        } catch { /* the script name remains the only available evidence */ }
        const sources = [String(script || ''), declaredCommand];
        const filePattern = /([A-Za-z0-9_./\-]+\.(?:mjs|cjs|js|ts|tsx|jsx))\b/giu;
        for (const match of declaredCommand.matchAll(filePattern)) {
            const candidate = path.resolve(projectPath, match[1]);
            const relative = path.relative(projectPath, candidate);
            if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(candidate)) continue;
            try { sources.push(fs.readFileSync(candidate, 'utf8')); } catch { /* the command remains evidence */ }
        }
        const ports = new Set<number>();
        const urlPattern = /https?:\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)(?::(\d+))/giu;
        for (const source of sources) {
            for (const match of source.matchAll(urlPattern)) {
                const port = Number(match[1]);
                if (Number.isInteger(port) && port > 0 && port < 65536) ports.add(port);
            }
        }
        return ports.size === 1 ? [...ports][0] : null;
    }

    private async runDeclaredScript(projectPath: string, script: string, kind: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        logs.push(`Executing declared ${kind} script "${script}"...`);
        const livePort = this.liveTestPort(projectPath, script);
        let startedForTest = false;
        if (livePort) {
            logs.push(`Detected one local test endpoint; starting the project on port ${livePort} before ${kind}.`);
            const run = await executeTool('project_run', { cwd: projectPath, port: livePort }, ctx);
            if (!run.ok) {
                const error = String((run as any).error || (run as any).output?.message || 'Project could not be started for live test');
                logs.push(`Live test launcher failed: ${error}`);
                return this.failure(error, logs, kind);
            }
            startedForTest = true;
        }

        try {
            const result = await executeTool('shell_execute', { command: `npm run ${script}`, cwd: projectPath }, ctx);
            return result.ok
                ? {
                    ok: true,
                    output: { passed: true, errors: [], summary: `${kind} check passed (${script})` },
                    logs
                }
                : this.failure(String((result as any).error || (result as any).output || `${kind} check failed`), logs, kind);
        } finally {
            if (startedForTest) {
                const stopped = await executeTool('project_stop', {}, ctx);
                if (!stopped.ok) logs.push(`Live test cleanup warning: ${String((stopped as any).error || 'project_stop failed')}`);
                else logs.push('Stopped the project started for the live test.');
            }
        }
    }

    private async runBuild(projectPath: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        const script = this.declaredScript(projectPath, ['build'], logs);
        if (!script) return this.failure('No declared build script is available for this project.', logs, 'build');
        return this.runDeclaredScript(projectPath, script, 'build', logs, ctx);
    }

    private async runUnitTests(projectPath: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        const script = this.declaredScript(projectPath, ['test', 'test:unit', 'unit'], logs);
        if (!script) return this.failure('No declared unit-test script is available for this project.', logs, 'unit');
        return this.runDeclaredScript(projectPath, script, 'unit test', logs, ctx);
    }

    private async runIntegrationTests(projectPath: string, logs: string[], ctx: { sessionId?: string; workspaceId?: string }) {
        const script = this.declaredScript(projectPath, ['test:integration', 'test:e2e', 'integration', 'e2e', 'test:int'], logs);
        if (!script) return this.failure('No declared integration-test script is available for this project.', logs, 'integration');
        return this.runDeclaredScript(projectPath, script, 'integration test', logs, ctx);
    }
}
