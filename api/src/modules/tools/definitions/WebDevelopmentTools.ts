import { BaseTool } from '../base';
import { executeTool } from '../../services/ToolService';
import { ToolPermission } from '../types';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import path from 'path';
import fs from 'fs';
import { Builder } from '../../../system/Builder';
import { broadcastThinkingDetail, broadcast } from '../../../api/ws';

import { resolveToolPath } from '../utils';

// Flow Agent: Broadcast structured build progress events
function broadcastBuildProgress(sessionId: string | undefined, phase: string, message: string, progress: number) {
    if (!sessionId) return;
    broadcast({
        type: 'build_progress',
        data: { phase, message, progress, timestamp: new Date().toISOString() },
        sessionId
    });
}


async function findAvailablePort(start: number, host: string = '0.0.0.0'): Promise<number> {
    const { isPortOpen } = require('../../../shared/utils/network');
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
        broadcastBuildProgress(sessionId, 'initializing', `Starting pipeline for "${name}"`, 0);

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
        broadcastBuildProgress(sessionId, 'scaffolding', '🏗️ Scaffolding project structure...', 10);
        if (sessionId) broadcastThinkingDetail(sessionId, `🏗️ Scaffolding project structure...`);
        const port = await findAvailablePort(5180);
        
        // [FIX] تحديد المسار الصحيح للمشروع
        const { workspaceService } = require('../../services/WorkspaceService');
        let effectiveBaseDir = baseDir;
        if (!effectiveBaseDir && workspaceId) {
            effectiveBaseDir = workspaceService.getActiveRoot(workspaceId);
        }
        
        const scRes = await executeTool('scaffold_full_stack', {
            name, type, features, 
            baseDir: effectiveBaseDir,
            aestheticMode: input?.aestheticMode,
            language: input?.language,
            port,
            overwrite: input?.overwrite !== false
        }, { sessionId, workspaceId });
        
        if (!scRes?.ok) {
            const err = scRes?.error || 'No error message from scaffold tool';
            steps.push({ step: 'scaffold_full_stack', ok: false, error: err });
            return { ok: false, error: `Scaffolding failed: ${err}`, output: { path: '', steps }, logs };
        }
        const projectPath = String(scRes.output?.path || '').trim();
        steps.push({ step: 'scaffold_full_stack', ok: true, output: scRes.output });
        if (sessionId) broadcastThinkingDetail(sessionId, `✅ Scaffold complete at ${projectPath}`);

        let isGitHubWorkspace = false;
        let activeRepo = undefined;
        let wsOwnerId = undefined;
        let repoRoot = undefined;
        if (workspaceId) {
            try {
                const ws = await workspaceService.getWorkspace(workspaceId, input?.__userId);
                repoRoot = workspaceService.getActiveRoot(workspaceId);
                if (ws?.kind === 'github' && ws?.integrations?.github?.activeRepo) {
                    isGitHubWorkspace = true;
                    activeRepo = ws.integrations.github.activeRepo;
                    wsOwnerId = ws.ownerId?.toString();
                }
            } catch {}
        }

        // CRITICAL FIX: Update workspace root to the new project path ONLY if it's not a GitHub workspace.
        // If it's a GitHub workspace, we want to maintain the repo container as the root.
        if (projectPath && workspaceId && !isGitHubWorkspace) {
            try {
                await workspaceService.setActiveRoot(projectPath, workspaceId);
                console.log(`[Pipeline] Workspace root updated to: ${projectPath}`);
            } catch (wsErr: any) {
                console.warn(`[Pipeline] Could not update workspace root: ${wsErr?.message}`);
            }
        }

        // Broadcast workspace_updated so frontend File Explorer refreshes
        if (sessionId && (projectPath || repoRoot)) {
            broadcast({
                type: 'workspace_updated',
                data: { path: isGitHubWorkspace ? repoRoot : projectPath, name: path.basename(isGitHubWorkspace ? repoRoot || projectPath : projectPath), timestamp: new Date().toISOString() },
                sessionId
            });
        }

        // 2. Detect & Install
        broadcastBuildProgress(sessionId, 'dependencies', '📦 Installing dependencies...', 30);
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
            // Tier 1: npm install (standard)
            let r = await executeTool('shell_execute', {
                command: `npm install --include=dev --legacy-peer-deps --no-audit --no-fund`,
                cwd: p,
                timeout: 10 * 60 * 1000
            }, { sessionId, workspaceId });
            if (r.ok) return r;

            // Tier 2: npm install --force
            if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ npm install failed, retrying with --force...`);
            r = await executeTool('shell_execute', {
                command: `npm install --force --legacy-peer-deps --no-audit --no-fund`,
                cwd: p,
                timeout: 10 * 60 * 1000
            }, { sessionId, workspaceId });
            if (r.ok) return r;

            // Tier 3: yarn install (fallback)
            if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ npm failed, trying yarn...`);
            r = await executeTool('shell_execute', {
                command: `yarn install --no-lockfile`,
                cwd: p,
                timeout: 10 * 60 * 1000
            }, { sessionId, workspaceId });
            return r;
        };

        let installOk = true;
        if (rootHasWorkspaces) {
            if (sessionId) broadcastThinkingDetail(sessionId, `📦 Installing dependencies (Monorepo)...`);
            const installRes = await runInstall(projectPath);
            steps.push({ step: 'npm_install', ok: installRes.ok, output: installRes.output });
            if (!installRes.ok) {
                if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ Dependencies install had issues — continuing anyway...`);
                installOk = false;
                // Do NOT return — continue to dev_server_start so preview loads
            }
        } else {
            for (const proj of allNodeProjects) {
                if (sessionId) broadcastThinkingDetail(sessionId, `📦 Installing dependencies for ${path.basename(proj)}...`);
                const installRes = await runInstall(proj);
                steps.push({ step: 'npm_install', ok: installRes.ok, output: { project: proj, ...installRes.output } });
                if (!installRes.ok) {
                    if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ Install issue for ${proj} — continuing...`);
                    installOk = false;
                    // Do NOT return — continue to next project and dev_server
                }
            }
        }
        if (installOk && sessionId) broadcastThinkingDetail(sessionId, `✅ Dependencies installed successfully`);

        broadcastBuildProgress(sessionId, 'building', '🛡️ Running quality checks and building...', 55);
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
            broadcastBuildProgress(sessionId, 'security', '🔐 Running security audit...', 70);
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

        // 5.5 Auto-Git Sync
        if (isGitHubWorkspace && activeRepo && repoRoot) {
            try {
                if (sessionId) broadcastThinkingDetail(sessionId, `🐙 Securing and pushing code to GitHub (${activeRepo})...`);
                broadcastBuildProgress(sessionId, 'github', '🐙 Syncing to GitHub...', 85);
                
                // Helper to execute
                const runGitOp = async (op: string, args: string[] = []) => {
                    const res = await executeTool('git_ops', { operation: op, args, cwd: repoRoot, sessionId, userId: wsOwnerId }, { sessionId, workspaceId });
                    return res;
                };

                // Because it's already a cloned github repo, we just add, commit, and push from repo root.
                await runGitOp('add', ['.']);
                await runGitOp('commit', ['-m', `Scaffolded project ${name} by Joe AI`]);
                
                // Securely push using GitOpsTool
                const pushRes = await executeTool('git_ops', {
                    operation: 'push',
                    args: ['origin', 'main'], 
                    cwd: repoRoot,
                    sessionId,
                    userId: wsOwnerId
                }, { sessionId, workspaceId });
                
                if (pushRes.ok) {
                    if (sessionId) broadcastThinkingDetail(sessionId, `✅ Successfully pushed to GitHub`);
                    steps.push({ step: 'github_sync', ok: true, output: { repo: activeRepo } });
                } else {
                    if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ GitHub push failed: ${pushRes.error}`);
                    steps.push({ step: 'github_sync', ok: false, error: pushRes.error });
                }
            } catch (err: any) {
                if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ GitHub sync error: ${err.message}`);
                steps.push({ step: 'github_sync', ok: false, error: err.message });
            }
        } else if (workspaceId) {
            try {
                if (sessionId) broadcastThinkingDetail(sessionId, `🐙 Initializing local git repository...`);
                // Original local-only git init
                const runGitOp = async (op: string, args: string[] = []) => {
                    const res = await executeTool('git_ops', { operation: op, args, cwd: projectPath, sessionId }, { sessionId, workspaceId });
                    if (!res.ok) throw new Error(`Git ${op} failed: ${res.error}`);
                    return res;
                };
                
                await runGitOp('init');
                await runGitOp('add', ['.']);
                await runGitOp('commit', ['-m', `Initial commit by Joe AI for ${name}`]);
            } catch (err: any) {
                console.warn(`Local git init failed: ${err.message}`);
                if (sessionId) broadcastThinkingDetail(sessionId, `⚠️ Local Git Init error: ${err.message}`);
            }
        }

        // 6. Preview
        if (!skipDev) {
            broadcastBuildProgress(sessionId, 'preview', '🌐 Starting dev server...', 90);
            if (sessionId) broadcastThinkingDetail(sessionId, `🌐 Starting dev server...`);
            const devRes = await executeTool('dev_server_start', { cwd: projectPath }, { sessionId, workspaceId });
            steps.push({ step: 'dev_server_start', ok: devRes.ok, output: devRes.output });
            if (devRes.ok) {
                const previewUrl = String((devRes.output as any)?.userPreviewUrl || (devRes.output as any)?.previewUrl || `http://localhost:${port}/`).trim();
                steps.push({ step: 'dev_server_preview_ready', ok: true, output: { previewUrl } });

                // Final confirmation broadcast
                broadcastBuildProgress(sessionId, 'complete', `✨ Project ready at ${previewUrl}`, 100);
                if (sessionId) broadcastThinkingDetail(sessionId, `✨ Project is ready at ${previewUrl}`);

                // Crucial: emit preview_ready again to ensure frontend catches it if it was flaking
                const { broadcast } = require('../../../api/ws');
                broadcast({
                    type: 'preview_ready',
                    data: { url: previewUrl, cwd: projectPath, timestamp: new Date().toISOString() },
                    sessionId
                });
            }
        }

        logs.push(`pipeline.complete path = ${projectPath}`);
        // Only CRITICAL step failures should kill the pipeline.
        // Quality checks (lint, typecheck, test), security scans, and CI generation are NON-FATAL.
        const criticalSteps = ['scaffold_full_stack'];
        const criticalFailure = steps.find(s => !s.ok && criticalSteps.includes(s.step));
        if (criticalFailure) {
            return {
                ok: false,
                error: `Pipeline failed at critical step '${criticalFailure.step}': ${criticalFailure.error || 'No error message provided'}`,
                output: { path: projectPath, steps },
                logs
            };
        }
        // Pipeline succeeded — even if quality checks had warnings
        const warnings = steps.filter(s => !s.ok).map(s => s.step);
        if (warnings.length > 0) {
            logs.push(`pipeline.warnings: ${warnings.join(', ')} (non-fatal)`);
        }
        return { ok: true, output: { path: projectPath, steps, warnings }, logs };
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
        const baseCwd = resolveToolPath(String(input?.cwd || '').trim(), { sandbox: true });
        let port = Number(input?.port);
        if (!port) port = await findAvailablePort(5180);

        // 1. IMPROVED: Robustly detect the actual web project root
        // Strategy: check for monorepo (workspaces in package.json), then index.html, then subdirs
        let actualCwd = baseCwd;

        // First: check if root package.json has "workspaces" (monorepo pattern)
        const rootPkgPath = path.join(baseCwd, 'package.json');
        let isMonorepo = false;
        if (fs.existsSync(rootPkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'));
                if (pkg?.workspaces) isMonorepo = true;
            } catch { }
        }

        if (isMonorepo) {
            // Monorepo: look for apps/web, packages/web, web/
            const webCandidates = ['apps/web', 'packages/web', 'web', 'apps/frontend', 'frontend'];
            for (const candidate of webCandidates) {
                const candidatePath = path.join(baseCwd, candidate);
                if (fs.existsSync(path.join(candidatePath, 'index.html')) || fs.existsSync(path.join(candidatePath, 'package.json'))) {
                    actualCwd = candidatePath;
                    logs.push(`monorepo_web_detected: switching to ${candidatePath}`);
                    break;
                }
            }
            // If monorepo but no web dir found, check for dist/index.html to serve built assets
            if (actualCwd === baseCwd) {
                for (const candidate of webCandidates) {
                    const distPath = path.join(baseCwd, candidate, 'dist', 'index.html');
                    if (fs.existsSync(distPath)) {
                        actualCwd = path.join(baseCwd, candidate, 'dist');
                        logs.push(`monorepo_dist_detected: serving built assets from ${actualCwd}`);
                        break;
                    }
                }
            }
        } else if (!fs.existsSync(path.join(baseCwd, 'index.html'))) {
            // Not monorepo, no index.html at root — search subdirectories
            try {
                const entries = fs.readdirSync(baseCwd).filter(d => !d.startsWith('.') && d !== 'node_modules' && fs.statSync(path.join(baseCwd, d)).isDirectory());
                for (const entry of entries) {
                    const projectPath = path.join(baseCwd, entry);
                    const webPath = path.join(projectPath, 'apps', 'web');
                    if (fs.existsSync(path.join(webPath, 'index.html'))) {
                        actualCwd = webPath;
                        logs.push(`nested_monorepo_detected: switching to ${webPath}`);
                        break;
                    }
                    if (fs.existsSync(path.join(projectPath, 'index.html'))) {
                        actualCwd = projectPath;
                        logs.push(`nested_project_detected: switching to ${projectPath}`);
                        break;
                    }
                }
            } catch (e: any) {
                logs.push(`web_root_lookup_error: ${e.message}`);
            }
        }

        // 2. Determine command based on actualCwd
        let command = String(input?.command || '').trim();
        if (!command) {
            if (fs.existsSync(path.join(actualCwd, 'package.json'))) {
                // Use Vite for projects with a package.json
                command = `npx --yes vite --host 0.0.0.0 --port ${port} --base /preview/${port}/`;
            } else if (fs.existsSync(path.join(actualCwd, 'index.html'))) {
                // Use serve for simple HTML files
                command = `npx -y serve -l ${port} -s . --no-clipboard`;
            } else {
                // Fallback: create an ad-hoc vite config to allow access
                const configPath = path.join(actualCwd, 'vite.config.js');
                if (!fs.existsSync(configPath)) {
                    fs.writeFileSync(configPath, `export default { server: { host: '0.0.0.0', allowedHosts: true }, base: '/preview/${port}/' };`);
                }
                command = `npx --yes vite --host 0.0.0.0 --port ${port} --base /preview/${port}/`;
            }
        }

        logs.push(`using_cwd: ${actualCwd}`);

        try {
            // Use ExecutionGateway for detached server start
            const result = await ExecutionGateway.execute(command, [], {
                cwd: actualCwd,
                env: { ...process.env, PORT: String(port), HOST: '0.0.0.0', BROWSER: 'none' },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true,
                shell: true
            });

            if (!result.ok && result.exitCode !== null) {
                logs.push(`dev_server_failed_to_start exitCode=${result.exitCode} error=${result.error}`);
                return { ok: false, error: `Dev server failed to start: ${result.error}`, logs };
            }

            // Wait for server to actually start (up to 30 seconds)
            const maxWait = 30000;
            const interval = 500;
            let elapsed = 0;
            let serverReady = false;

            while (elapsed < maxWait) {
                await new Promise(r => setTimeout(r, interval));
                elapsed += interval;

                // Check if server responds
                try {
                    const http = require('http');
                    await new Promise<void>((resolve, reject) => {
                        const req = http.get(`http://127.0.0.1:${port}/preview/${port}/`, (res: any) => {
                            res.resume();
                            resolve();
                        });
                        req.on('error', reject);
                        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
                    });
                    serverReady = true;
                    break;
                } catch {
                    // Not ready yet, keep waiting
                }
            }

            logs.push(`dev_server_wait elapsed=${elapsed}ms ready=${serverReady}`);

            // [FIX] استخدام localhost بدلاً من api في بيئة التطوير
            const isProd = process.env.NODE_ENV === 'production' ||
                process.env.JWT_SECRET?.includes('persistent') ||
                fs.existsSync('/etc/letsencrypt') ||
                fs.existsSync('/.dockerenv');

            let previewUrl: string;
            let userPreviewUrl: string;
            
            if (isProd) {
                previewUrl = `http://api:${port}/`;
                userPreviewUrl = `https://www.xelitesolutions.com/preview/${port}/`;
            } else {
                // في بيئة التطوير، استخدم localhost
                previewUrl = `http://localhost:${port}/`;
                userPreviewUrl = `http://localhost:${port}/`;
            }
            
            logs.push(`dev_started cwd=${actualCwd} cmd=${command} port=${port} isProd=${isProd} ready=${serverReady}`);

            // Broadcast preview_ready event for JoeStudio LivePreview
            const { broadcast } = require('../../ws');
            broadcast({
                type: 'preview_ready',
                data: {
                    url: userPreviewUrl,
                    cwd: actualCwd,
                    timestamp: new Date().toISOString()
                },
                sessionId: context?.sessionId
            });

            return { ok: true, output: { previewUrl, userPreviewUrl, serverReady, startupTime: elapsed }, logs };
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
        const { workspaceService } = require('../../services/WorkspaceService');
        const activeRoot = workspaceService.getActiveRoot();
        
        // [FIX] تحديد المسار الصحيح للمشروع
        let baseDir: string;
        if (preferredBase) {
            baseDir = preferredBase;
        } else if (activeRoot) {
            baseDir = activeRoot;
        } else {
            // Fallback إلى مجلد data/projects
            const isApiDir = path.basename(process.cwd()) === 'api';
            const projectRoot = isApiDir ? path.join(process.cwd(), '..') : process.cwd();
            baseDir = path.join(projectRoot, 'data', 'projects');
        }
        
        // تأكد من وجود المجلد
        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        
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
                    overwrite: input?.overwrite !== false
                }
            );
            return { ok: true, output: res, logs: [`scaffold.success=${projectName}`] };
        } catch (e: any) {
            const errStr = e instanceof Error ? e.message : String(e);
            return { ok: false, error: errStr, logs: [`scaffold.error=${errStr}`] };
        }
    }
}
