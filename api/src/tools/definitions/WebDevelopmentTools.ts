
import { BaseTool } from '../base';
import { executeTool } from '../../services/ToolService';
import { ToolPermission } from '../types';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { Builder } from '../../system/Builder';
import { broadcastThinkingDetail } from '../../ws';

import { resolveToolPath } from '../utils';


async function findAvailablePort(start: number, host: string = '0.0.0.0'): Promise<number> {
    const { isPortOpen } = require('../../utils/network');
    let port = start;
    while (port < start + 100) {
        const open = await isPortOpen(host, port);
        if (!open) return port;
        port++;
    }
    return start;
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
            autoFix: { type: 'boolean' },
            aestheticMode: { type: 'string', enum: ['glass', 'neon', 'minimal', 'corporate'] },
            language: { type: 'string', enum: ['ar', 'en', 'dual'] }
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
    rateLimitPerMinute = 10;
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
        const sessionId = typeof input?.sessionId === 'string' && input.sessionId.trim() ? input.sessionId.trim() : undefined;
        const workspaceId =
            typeof input?.workspaceId === 'string' && input.workspaceId.trim()
                ? input.workspaceId.trim()
                : typeof input?.__workspaceId === 'string' && input.__workspaceId.trim()
                    ? input.__workspaceId.trim()
                    : undefined;

        logs.push(`pipeline.name=${name} type=${type} features=${features.join(',')}`);

        if (sessionId) broadcastThinkingDetail(sessionId, `🚀 Starting Pipeline for "${name}" (${type})`);

        // 0. System Check
        if (sessionId) broadcastThinkingDetail(sessionId, `🔍 Performing environment architecture check...`);
        const { BinaryService } = require('../../services/BinaryService');
        const crucialBinaries = ['node', 'npm', 'npx'];
        for (const b of crucialBinaries) {
            const check = BinaryService.checkBinary(b);
            if (!check.exists || check.error === 'warning_rosetta_required') {
                const hint = BinaryService.getHint(b, check);
                if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ Environment Issue: ${hint}`);
                // If it's just a Rosetta warning, we proceed but log it. 
                // If it's missing entirely, we fail.
                if (!check.exists) {
                    return { ok: false, error: `Crucial binary '${b}' missing. ${hint}`, logs, output: { path: '', steps } };
                }
            }
        }
        if (sessionId) broadcastThinkingDetail(sessionId, `✅ Environment check passed`);

        // 1. Scaffold
        if (sessionId) broadcastThinkingDetail(sessionId, `🏗️ Scaffolding project structure...`);
        const port = await findAvailablePort(5180);
        const scRes = await executeTool('scaffold_full_stack', {
            name, type, features, baseDir,
            aestheticMode: input?.aestheticMode,
            language: input?.language,
            port,
            overwrite: input?.overwrite === true
        }, { sessionId, workspaceId });
        if (!scRes?.ok) {
            const err = scRes?.error || 'No error message from scaffold tool';
            steps.push({ step: 'scaffold_full_stack', ok: false, error: err });
            return { ok: false, error: `Scaffolding failed: ${err}`, output: { path: '', steps }, logs };
        }
        const projectPath = String(scRes.output?.path || '').trim();
        steps.push({ step: 'scaffold_full_stack', ok: true, output: scRes.output });
        if (sessionId) broadcastThinkingDetail(sessionId, `✅ Scaffold complete at ${projectPath}`);

        // 2. Detect & Install
        if (sessionId) broadcastThinkingDetail(sessionId, `🔍 Detecting project types and dependencies...`);
        const detectRes = await executeTool('project_detect', { path: projectPath }, { sessionId, workspaceId });
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
                command: `npm install --include=dev --legacy-peer-deps --no-audit --no-fund --quiet`,
                cwd: p,
                timeout: 10 * 60 * 1000
            }, { sessionId, workspaceId });
            if (!r.ok) {
                // Formatting fix in fallback command
                r = await executeTool('shell_execute', {
                    command: `npm ci --legacy-peer-deps --no-audit --no-fund --quiet`,
                    cwd: p,
                    timeout: 10 * 60 * 1000
                }, { sessionId, workspaceId });
            }
            return r;
        };

        if (rootHasWorkspaces) {
            if (sessionId) broadcastThinkingDetail(sessionId, `📦 Installing dependencies (Monorepo)...`);
            const installRes = await runInstall(projectPath);
            steps.push({ step: 'npm_install', ok: installRes.ok, output: installRes.output });
            if (!installRes.ok) {
                if (sessionId) broadcastThinkingDetail(sessionId, `❌ npm install failed`);
                return { ok: false, error: `npm install failed: ${installRes.error || 'Unknown error'}`, logs, output: { path: projectPath, steps } };
            }
        } else {
            for (const proj of allNodeProjects) {
                if (sessionId) broadcastThinkingDetail(sessionId, `📦 Installing dependencies for ${path.basename(proj)}...`);
                const installRes = await runInstall(proj);
                steps.push({ step: 'npm_install', ok: installRes.ok, output: { project: proj, ...installRes.output } });
                if (!installRes.ok) {
                    if (sessionId) broadcastThinkingDetail(sessionId, `❌ npm install failed for ${proj}`);
                    const err = installRes.error || 'npm install returned failure without error';
                    return { ok: false, error: `npm install failed for ${proj}: ${err}`, logs, output: { path: projectPath, steps } };
                }
            }
        }
        if (sessionId) broadcastThinkingDetail(sessionId, `✅ Dependencies installed successfully`);

        // 3. Quality & Fix
        const readScripts = (proj: string) => {
            const pkgPath = path.join(proj, 'package.json');
            if (!fs.existsSync(pkgPath)) return {};
            try { return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).scripts || {}; } catch { return {}; }
        };

        for (const proj of allNodeProjects) {
            if (sessionId) broadcastThinkingDetail(sessionId, `🛡️ Running quality checks for ${path.basename(proj)}...`);
            const qualityRes = await executeTool('quality_run', { path: proj, tasks: qualityTasks }, { sessionId, workspaceId });
            steps.push({ step: 'quality_run', ok: qualityRes.ok, output: { project: proj, ...qualityRes.output } });

            if (!qualityRes.ok && autoFix) {
                const results = Array.isArray(qualityRes.output?.results) ? qualityRes.output.results : [];
                const lintFailed = results.some((r: any) => r && r.task === 'lint' && r.ok === false && !r.skipped);
                const scripts = readScripts(proj);
                if (lintFailed && typeof (scripts as any)?.lint === 'string') {
                    if (sessionId) broadcastThinkingDetail(sessionId, `🔧 Auto-fixing lint issues...`);
                    const fixRes = await executeTool('shell_execute', { command: `npm run lint -- --fix`, cwd: proj, timeout: 10 * 60 * 1000 }, { sessionId, workspaceId });
                    steps.push({ step: 'lint_fix', ok: fixRes.ok, output: { project: proj, ...fixRes.output } });
                    // Retry
                    const lintRetry = await executeTool('quality_run', { path: proj, tasks: ['lint'] }, { sessionId, workspaceId });
                    steps.push({ step: 'quality_run_retry', ok: lintRetry.ok, output: { project: proj, ...lintRetry.output } });
                }
            }
        }

        // 4. Security
        if (securityChecks) {
            if (sessionId) broadcastThinkingDetail(sessionId, `🔐 Running security audit...`);
            const secretsRes = await executeTool('secrets_scan_repo', { path: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'secrets_scan_repo', ok: secretsRes.ok, output: secretsRes.output });
            const depRes = await executeTool('dependency_audit', { path: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'dependency_audit', ok: depRes.ok, output: depRes.output });
        }

        // 5. CI & Analyze
        try {
            const ciRes = await executeTool('ci_generate_pipeline', { path: projectPath, kind: 'node' }, { sessionId, workspaceId });
            steps.push({ step: 'ci_generate_pipeline', ok: ciRes.ok, output: ciRes.output });
        } catch { } // optional

        try {
            const analyzeRes = await executeTool('analyze_codebase', { path: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'analyze_codebase', ok: analyzeRes.ok, output: analyzeRes.output });
        } catch { }

        try {
            const projectAnalyzeRes = await executeTool('analyze_project', { path: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'analyze_project', ok: projectAnalyzeRes.ok, output: projectAnalyzeRes.output });
        } catch { }

        // 6. Preview
        if (!skipDev) {
            if (sessionId) broadcastThinkingDetail(sessionId, `🌐 Starting dev server...`);
            const devRes = await executeTool('dev_server_start', { cwd: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'dev_server_start', ok: devRes.ok, output: devRes.output });
            if (devRes.ok) {
                const previewUrl = String((devRes.output as any)?.previewUrl || `http://localhost:${port}/`).trim();
                steps.push({ step: 'dev_server_preview_ready', ok: true, output: { previewUrl } });
                if (sessionId) broadcastThinkingDetail(sessionId, `✨ Project is ready at ${previewUrl}`);
            }
        }

        logs.push(`pipeline.complete path = ${projectPath}`);
        const failedStep = steps.find(s => !s.ok);
        if (failedStep) {
            return {
                ok: false,
                error: `Pipeline failed at step '${failedStep.step}': ${failedStep.error || 'No error message provided'}`,
                output: { path: projectPath, steps },
                logs
            };
        }
        return { ok: true, output: { path: projectPath, steps }, logs };
    }
}

export class DevServerTool extends BaseTool {
    name = 'dev_server_start';
    description = 'Start a development server for a project.';
    version = '2.0.0';
    tags = ['dev', 'server', 'preview'];
    inputSchema = { type: 'object' as const, properties: { cwd: { type: 'string' }, command: { type: 'string' }, port: { type: 'number' } }, required: ['cwd'] };
    outputSchema = { type: 'object' as const, properties: { previewUrl: { type: 'string' }, userPreviewUrl: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute']; // it starts a process
    rateLimitPerMinute = 15;
    auditFields = ['cwd'];

    async execute(input: any, context?: any) {
        const logs: string[] = [];
        const cwd = resolveToolPath(String(input?.cwd || '').trim(), { sandbox: true });
        let command = String(input?.command || '').trim();
        let port = Number(input?.port);

        if (!port) {
            port = await findAvailablePort(5180);
        }

        // Auto-detect command if not provided
        if (!command) {
            if (fs.existsSync(path.join(cwd, 'package.json'))) {
                command = 'npm run dev';
            } else if (fs.existsSync(path.join(cwd, 'index.html'))) {
                // Static folder - use npx serve
                command = `npx -y serve -p ${port} . >> dev-server.log 2>&1`;
            } else {
                command = 'npm run dev'; // Final fallback
            }
        }

        try {
            // Using shell:true to support redirects and better path handling
            const child = spawn(command, [], {
                cwd,
                env: { ...process.env, PORT: String(port), HOST: '0.0.0.0', BROWSER: 'none' },
                stdio: 'ignore',
                detached: true,
                shell: true
            });
            child.unref(); // Fire and forget (keep running)

            const previewUrl = `http://api:${port}/`;
            const userPreviewUrl = `http://localhost:${port}/`;
            logs.push(`dev_started cwd=${cwd} cmd=${command} port=${port} pid=${child.pid || 'unknown'}`);

            // Broadcast preview_ready event for JoeStudio LivePreview
            const { broadcast } = require('../../ws');
            broadcast({
                type: 'preview_ready',
                data: {
                    url: userPreviewUrl,
                    cwd,
                    timestamp: new Date().toISOString()
                },
                sessionId: context?.sessionId
            });

            return { ok: true, output: { previewUrl, userPreviewUrl }, logs };
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
            baseDir: { type: 'string' },
            aestheticMode: { type: 'string' },
            language: { type: 'string' },
            port: { type: 'number' },
            skipDev: { type: 'boolean' },
            autoFix: { type: 'boolean' },
            overwrite: { type: 'boolean', description: 'Overwrite existing project if it exists' }
        },
        required: ['name']
    };
    outputSchema = { type: 'object' as const, properties: { path: { type: 'string' }, summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 30;
    auditFields = ['name', 'type'];

    async execute(input: any) {
        const projectName = String(input?.name || 'my-app').trim();
        const type = String(input?.type || 'ecommerce') as any;
        const features = Array.isArray(input?.features) ? input.features : [];
        const preferredBase = String(input?.baseDir || '').trim();

        // Resolve base directory
        const baseDir = resolveToolPath(preferredBase || '.', { sandbox: true });

        try {
            // Call the shared Builder
            const res = Builder.scaffold(
                projectName,
                type,
                features,
                baseDir,
                {
                    aestheticMode: String(input?.aestheticMode || 'corporate'),
                    language: String(input?.language || 'en'),
                    port: Number(input?.port || 5180),
                    overwrite: input?.overwrite === true
                }
            );
            return { ok: true, output: res, logs: [`scaffold.success=${projectName}`] };
        } catch (e: any) {
            const errStr = e instanceof Error ? e.message : String(e);
            return { ok: false, error: errStr, logs: [`scaffold.error=${errStr}`] };
        }
    }
}
