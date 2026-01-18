
import { BaseTool } from '../base';
import { executeTool } from '../../services/ToolService';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { Builder } from '../../system/Builder';

// Helper to resolve paths (reused logic)
function resolveToolPath(p: string) {
    const cwd = process.cwd();
    const root = path.basename(cwd) === 'api' ? path.resolve(cwd, '..') : cwd;
    const val = String(p ?? '').trim();
    if (!val || val === '.') return root;
    if (path.isAbsolute(val)) return val;
    const fromCwd = path.resolve(cwd, val);
    if (fs.existsSync(fromCwd)) return fromCwd;
    return path.resolve(root, val);
}

export class WebPipelineTool extends BaseTool {
    name = 'website_full_pipeline';
    description = 'Scaffold, build, test, and preview a full-stack website project.';
    version = '2.0.0';
    tags = ['pipeline', 'web', 'scaffold', 'build', 'test'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['ecommerce', 'saas', 'blog'] },
            features: { type: 'array', items: { type: 'string' } },
            baseDir: { type: 'string' },
            skipDev: { type: 'boolean' },
            qualityTasks: { type: 'array', items: { type: 'string', enum: ['lint', 'typecheck', 'test', 'build'] } },
            securityChecks: { type: 'boolean' },
            autoFix: { type: 'boolean' }
        },
        required: ['name']
    };

    outputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            steps: { type: 'array' }
        }
    };

    permissions: ToolPermission[] = ['write', 'execute'];
    sideEffects: ToolPermission[] = ['write', 'execute'];
    rateLimitPerMinute = 3;
    auditFields = ['name'];

    async execute(input: any) {
        const logs: string[] = [];
        const steps: any[] = [];
        const name = String(input?.name || 'mega-web').trim();
        const type = String(input?.type || 'ecommerce').trim();
        const features = Array.isArray(input?.features) ? input.features : [];
        const baseDir = String(input?.baseDir || '').trim();
        const skipDev = input?.skipDev === true;
        const autoFix = input?.autoFix !== false;
        const securityChecks = input?.securityChecks !== false;
        const qualityTasks = Array.isArray(input?.qualityTasks) && input.qualityTasks.length
            ? input.qualityTasks
            : ['lint', 'typecheck', 'test', 'build'];

        logs.push(`pipeline.name=${name} type=${type} features=${features.join(',')}`);

        // 1. Scaffold
        const scRes = await executeTool('scaffold_full_stack', { name, type, features, baseDir });
        if (!scRes?.ok) {
            steps.push({ step: 'scaffold_full_stack', ok: false, error: scRes?.error });
            return { ok: false, output: { path: '', steps }, logs };
        }
        const projectPath = String(scRes.output?.path || '').trim();
        steps.push({ step: 'scaffold_full_stack', ok: true, output: scRes.output });

        // 2. Detect & Install
        const detectRes = await executeTool('project_detect', { path: projectPath });
        steps.push({ step: 'project_detect', ok: detectRes.ok, output: detectRes.output });
        const detectedNodeProjects: string[] = Array.isArray(detectRes.output?.nodeProjects) ? detectRes.output.nodeProjects : [];
        const allNodeProjects = Array.from(new Set([projectPath, ...detectedNodeProjects].map(p => String(p).trim()).filter(Boolean)));

        // Check for workspace root
        const rootPkgPath = path.join(projectPath, 'package.json');
        let rootHasWorkspaces = false;
        if (fs.existsSync(rootPkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
                rootHasWorkspaces = !!pkg?.workspaces;
            } catch { }
        }

        const runInstall = async (p: string) => {
            let r = await executeTool('shell_execute', {
                command: `cd "${p}" && npm install --include=dev --legacy-peer-deps --no-audit --no-fund --quiet`,
                timeout: 10 * 60 * 1000
            });
            if (!r.ok) {
                // Formatting fix in fallback command
                r = await executeTool('shell_execute', {
                    command: `cd "${p}" && npm ci --legacy-peer-deps --no-audit --no-fund --quiet`,
                    timeout: 10 * 60 * 1000
                });
            }
            return r;
        };

        if (rootHasWorkspaces) {
            const installRes = await runInstall(projectPath);
            steps.push({ step: 'npm_install', ok: installRes.ok, output: installRes.output });
        } else {
            for (const proj of allNodeProjects) {
                const installRes = await runInstall(proj);
                steps.push({ step: 'npm_install', ok: installRes.ok, output: { project: proj, ...installRes.output } });
                if (!installRes.ok) break;
            }
        }

        // 3. Quality & Fix
        const readScripts = (proj: string) => {
            const pkgPath = path.join(proj, 'package.json');
            if (!fs.existsSync(pkgPath)) return {};
            try { return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts || {}; } catch { return {}; }
        };

        for (const proj of allNodeProjects) {
            const qualityRes = await executeTool('quality_run', { path: proj, tasks: qualityTasks });
            steps.push({ step: 'quality_run', ok: qualityRes.ok, output: { project: proj, ...qualityRes.output } });

            if (!qualityRes.ok && autoFix) {
                const results = Array.isArray(qualityRes.output?.results) ? qualityRes.output.results : [];
                const lintFailed = results.some((r: any) => r && r.task === 'lint' && r.ok === false && !r.skipped);
                const scripts = readScripts(proj);
                if (lintFailed && typeof (scripts as any)?.lint === 'string') {
                    const fixRes = await executeTool('shell_execute', { command: `cd "${proj}" && npm run lint -- --fix`, timeout: 10 * 60 * 1000 });
                    steps.push({ step: 'lint_fix', ok: fixRes.ok, output: { project: proj, ...fixRes.output } });
                    // Retry
                    const lintRetry = await executeTool('quality_run', { path: proj, tasks: ['lint'] });
                    steps.push({ step: 'quality_run_retry', ok: lintRetry.ok, output: { project: proj, ...lintRetry.output } });
                }
            }
        }

        // 4. Security
        if (securityChecks) {
            const secretsRes = await executeTool('secrets_scan_repo', { path: projectPath });
            steps.push({ step: 'secrets_scan_repo', ok: secretsRes.ok, output: secretsRes.output });
            const depRes = await executeTool('dependency_audit', { path: projectPath });
            steps.push({ step: 'dependency_audit', ok: depRes.ok, output: depRes.output });
        }

        // 5. CI & Analyze
        try {
            const ciRes = await executeTool('ci_generate_pipeline', { path: projectPath, kind: 'node' });
            steps.push({ step: 'ci_generate_pipeline', ok: ciRes.ok, output: ciRes.output });
        } catch { } // optional

        try {
            const analyzeRes = await executeTool('analyze_codebase', { path: projectPath });
            steps.push({ step: 'analyze_codebase', ok: analyzeRes.ok, output: analyzeRes.output });
        } catch { }

        try {
            const projectAnalyzeRes = await executeTool('analyze_project', { path: projectPath });
            steps.push({ step: 'analyze_project', ok: projectAnalyzeRes.ok, output: projectAnalyzeRes.output });
        } catch { }

        // 6. Preview
        if (!skipDev) {
            const devRes = await executeTool('dev_server_start', { cwd: projectPath });
            steps.push({ step: 'dev_server_start', ok: devRes.ok, output: devRes.output });
            if (devRes.ok) {
                const previewUrl = String((devRes.output as any)?.previewUrl || 'http://localhost:5173/').trim();
                steps.push({ step: 'dev_server_preview_ready', ok: true, output: { previewUrl } });
            }
        }

        logs.push(`pipeline.complete path=${projectPath}`);
        const allOk = steps.every(s => s.ok);
        return { ok: allOk, output: { path: projectPath, steps }, logs };
    }
}

export class DevServerTool extends BaseTool {
    name = 'dev_server_start';
    description = 'Start a development server for a project.';
    version = '2.0.0';
    tags = ['dev', 'server', 'preview'];
    inputSchema = { type: 'object' as const, properties: { cwd: { type: 'string' }, command: { type: 'string' } }, required: ['cwd'] };
    outputSchema = { type: 'object' as const, properties: { previewUrl: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute']; // it starts a process
    rateLimitPerMinute = 5;
    auditFields = ['cwd'];

    async execute(input: any) {
        const logs: string[] = [];
        const cwd = resolveToolPath(String(input?.cwd || '').trim());
        const command = String(input?.command || 'npm run dev').trim();
        try {
            const parts = command.split(' ');
            const child = spawn(parts[0], parts.slice(1), {
                cwd,
                env: process.env,
                stdio: 'ignore',
                detached: true,
            });
            child.unref(); // Fire and forget (keep running)
            logs.push(`dev_started cwd=${cwd} cmd=${command}`);
            // In a real scenario, we might scrape stdout to find the port.
            // For now, assuming standard Vite/Next port or hoping the log reveals it.
            // But immediate return assumes 5173 or 3000.
            return { ok: true, output: { previewUrl: 'http://localhost:5173/' }, logs };
        } catch (e: any) {
            const msg = e?.message || String(e);
            logs.push(`dev_error=${msg}`);
            return { ok: false, error: msg, logs };
        }
    }
}

export class ScaffoldTool extends BaseTool {
    name = 'scaffold_full_stack';
    description = 'Generate a new full-stack project using 3-Tier architecture and best practices.';
    version = '2.0.0';
    tags = ['scaffold', 'generate', 'architect'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['ecommerce', 'saas', 'blog'] },
            features: { type: 'array', items: { type: 'string' } },
            baseDir: { type: 'string' }
        },
        required: ['name']
    };
    outputSchema = { type: 'object' as const, properties: { path: { type: 'string' }, summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 5;
    auditFields = ['name', 'type'];

    async execute(input: any) {
        const projectName = String(input?.name || 'my-app').trim();
        const type = String(input?.type || 'ecommerce') as any;
        const features = Array.isArray(input?.features) ? input.features : [];
        const preferredBase = String(input?.baseDir || '').trim();

        // Resolve base directory
        const cwd = process.cwd();
        const root = path.basename(cwd) === 'api' ? path.resolve(cwd, '..') : cwd;
        let baseDir = root;

        if (preferredBase) {
            baseDir = resolveToolPath(preferredBase);
        } else {
            // Heuristic: if project name mentioned alongside 'vivos' repository, create inside that folder
            const vivosDir = path.join(root, 'vivos');
            try { if (fs.existsSync(vivosDir) && fs.lstatSync(vivosDir).isDirectory()) baseDir = vivosDir; } catch { }
        }

        try {
            // Call the shared Builder logic
            const result = Builder.scaffold(projectName, type, features, baseDir);
            return { ok: true, output: result, logs: [`scaffold.success=${projectName}`] };
        } catch (e: any) {
            return { ok: false, error: e.message, logs: [`scaffold.error=${e.message}`] };
        }
    }
}
