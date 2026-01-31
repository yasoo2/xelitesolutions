
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { handleShellCommand } from '../handlers';
import fs from 'fs';
import path from 'path';

function getWorkspaceRoot() {
    try {
        const { workspaceService } = require('../../services/WorkspaceService');
        return workspaceService.getActiveRoot();
    } catch {
        return process.cwd();
    }
}

function resolveToolPath(p: string) {
    const root = getWorkspaceRoot();
    const val = String(p ?? '').trim();
    if (!val || val === '.') return root;
    const rootReal = (() => {
        try { return fs.realpathSync(root); } catch { return root; }
    })();
    const abs = path.isAbsolute(val) ? path.resolve(val) : path.resolve(rootReal, val);
    const absReal = (() => {
        try { return fs.realpathSync(abs); } catch { return abs; }
    })();
    const rel = path.relative(rootReal, absReal);
    const inside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (!inside) throw new Error('path_outside_workspace');
    return absReal;
}

export class SonarAnalysisTool extends BaseTool {
    name = 'sonar_analysis';
    description = 'Run Static Code Analysis using SonarScanner (or mock if missing).';
    version = '1.0.0';
    tags = ['quality', 'security', 'static-analysis'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            projectKey: { type: 'string' },
            sources: { type: 'string', default: '.' }
        },
        required: ['projectKey']
    };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        try {
            const key = String(input.projectKey || '').trim();
            const sources = String(input.sources || '.').trim();
            const args = ['sonar-scanner', `-Dsonar.projectKey=${key}`, `-Dsonar.sources=${sources}`];
            const r = await handleShellCommand('npx', args, process.cwd(), 300000, false);
            if (!r.ok) {
                const msg = r.error || 'sonar_failed';
                if (msg.includes('command not found') || msg.includes('ENOENT')) {
                    return { ok: false, error: 'sonar-scanner/npx not available. Please install dependencies.', logs: [] };
                }
                return { ok: false, error: `Sonar failed: ${msg}`, logs: [] };
            }
            const summary = String(r.output || '').slice(0, 2000);
            return { ok: true, output: { summary }, logs: ['sonar scan complete'] };
        } catch (e: any) {
            return { ok: false, error: `Sonar failed: ${e.message}`, logs: [] };
        }
    }
}

export class DependencyAuditorTool extends BaseTool {
    name = 'dependency_auditor';
    description = 'Check project dependencies for known security vulnerabilities.';
    version = '1.0.0';
    tags = ['security', 'dependencies'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            packageManager: { type: 'string', enum: ['npm', 'yarn', 'pnpm'], default: 'npm' }
        }
    };
    outputSchema = { type: 'object' as const, properties: { report: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const logs: string[] = [];
        const p = typeof input?.path === 'string' && input.path.trim() ? resolveToolPath(input.path) : process.cwd();
        const pm = input.packageManager || (fs.existsSync(path.join(p, 'pnpm-lock.yaml')) ? 'pnpm' : fs.existsSync(path.join(p, 'yarn.lock')) ? 'yarn' : 'npm');
        const cmd = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm';
        const args = pm === 'yarn' ? ['audit', '--json'] : pm === 'pnpm' ? ['audit', '--json'] : ['audit', '--json'];

        const r = await handleShellCommand(cmd, args, p, 5 * 60_000, false);
        if (r.ok) {
            const out = String(r.output || '').trim();
            return { ok: true, output: { report: out || 'No vulnerabilities found!' }, logs: ['audit passed', ...logs] };
        }
        const err = String(r.error || '').trim();
        return { ok: false, output: { report: err || String(r.output || '') }, logs: ['audit found issues', ...logs] };
    }
}

export class DependencyAuditTool extends BaseTool {
    name = 'dependency_audit';
    description = 'Run dependency vulnerability audit for a project directory.';
    version = '1.0.0';
    tags = ['security', 'dependencies', 'audit'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            packageManager: { type: 'string', enum: ['npm', 'yarn', 'pnpm'] }
        },
        required: ['path']
    };
    outputSchema = { type: 'object' as const, properties: { report: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const auditor = new DependencyAuditorTool();
        return auditor.execute({ path: input?.path, packageManager: input?.packageManager });
    }
}

export class QualityRunTool extends BaseTool {
    name = 'quality_run';
    description = 'Run project quality tasks: lint, typecheck, test, build.';
    version = '1.0.0';
    tags = ['quality', 'lint', 'typecheck', 'test', 'build'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            tasks: { type: 'array', items: { type: 'string', enum: ['lint', 'typecheck', 'test', 'build'] } }
        },
        required: ['path']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            results: { type: 'array' }
        }
    };
    permissions: ToolPermission[] = ['execute', 'read'];
    sideEffects: ToolPermission[] = ['execute'];

    private readPackageScripts(projectDir: string): Record<string, string> {
        const pkgPath = path.join(projectDir, 'package.json');
        if (!fs.existsSync(pkgPath)) return {};
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            return (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object') ? pkg.scripts : {};
        } catch {
            return {};
        }
    }

    async execute(input: any) {
        const projectDir = resolveToolPath(String(input?.path || '').trim());
        const tasks: string[] = Array.isArray(input?.tasks) && input.tasks.length ? input.tasks : ['lint', 'typecheck', 'test', 'build'];
        const scripts = this.readPackageScripts(projectDir);

        const results: any[] = [];

        const runNpmScript = async (script: string, extraArgs: string[] = [], timeoutMs = 10 * 60_000) => {
            const args = ['run', script, ...extraArgs];
            return handleShellCommand('npm', args, projectDir, timeoutMs, false);
        };

        for (const t of tasks) {
            const task = String(t || '').trim();
            if (!task) continue;

            if (task === 'lint') {
                if (!scripts.lint) {
                    results.push({ task, ok: true, skipped: true });
                    continue;
                }
                const r = await runNpmScript('lint', [], 10 * 60_000);
                if (r.ok) results.push({ task, ok: true, skipped: false, output: String(r.output || '').slice(0, 4000) });
                else results.push({ task, ok: false, skipped: false, error: String(r.error || '').slice(0, 4000) });
                continue;
            }

            if (task === 'typecheck') {
                if (scripts.typecheck) {
                    const r = await runNpmScript('typecheck', [], 10 * 60_000);
                    if (r.ok) results.push({ task, ok: true, skipped: false, output: String(r.output || '').slice(0, 4000) });
                    else results.push({ task, ok: false, skipped: false, error: String(r.error || '').slice(0, 4000) });
                    continue;
                }

                const tsconfigPath = path.join(projectDir, 'tsconfig.json');
                if (fs.existsSync(tsconfigPath)) {
                    const r = await handleShellCommand('npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], projectDir, 10 * 60_000, false);
                    if (r.ok) results.push({ task, ok: true, skipped: false, output: String(r.output || '').slice(0, 4000) });
                    else results.push({ task, ok: false, skipped: false, error: String(r.error || '').slice(0, 4000) });
                    continue;
                }

                results.push({ task, ok: true, skipped: true });
                continue;
            }

            if (task === 'test') {
                if (!scripts.test) {
                    results.push({ task, ok: true, skipped: true });
                    continue;
                }
                const r = await runNpmScript('test', [], 15 * 60_000);
                if (r.ok) results.push({ task, ok: true, skipped: false, output: String(r.output || '').slice(0, 4000) });
                else results.push({ task, ok: false, skipped: false, error: String(r.error || '').slice(0, 4000) });
                continue;
            }

            if (task === 'build') {
                if (!scripts.build) {
                    results.push({ task, ok: true, skipped: true });
                    continue;
                }
                const r = await runNpmScript('build', [], 20 * 60_000);
                if (r.ok) results.push({ task, ok: true, skipped: false, output: String(r.output || '').slice(0, 4000) });
                else results.push({ task, ok: false, skipped: false, error: String(r.error || '').slice(0, 4000) });
                continue;
            }

            results.push({ task, ok: true, skipped: true });
        }

        const allOk = results.every(r => r && r.ok === true);
        return { ok: allOk, output: { results }, logs: [`quality_run path=${projectDir}`] };
    }
}

export class SecretsScanRepoTool extends BaseTool {
    name = 'secrets_scan_repo';
    description = 'Scan a repository for common secret patterns.';
    version = '1.0.0';
    tags = ['security', 'secrets', 'scanner'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            maxFindings: { type: 'number' }
        },
        required: ['path']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            findings: { type: 'array' },
            scannedFiles: { type: 'number' }
        }
    };
    permissions: ToolPermission[] = ['read'];
    sideEffects: ToolPermission[] = [];

    private isIgnoredDir(name: string) {
        return ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache'].includes(name);
    }

    private isTextFile(filePath: string) {
        const ext = path.extname(filePath).toLowerCase();
        return [
            '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
            '.json', '.yml', '.yaml', '.env', '.env.local', '.env.production',
            '.py', '.go', '.java', '.kt', '.rb', '.php', '.sh',
            '.txt', '.toml', '.ini', '.conf',
        ].includes(ext) || path.basename(filePath).startsWith('.env');
    }

    async execute(input: any) {
        const root = resolveToolPath(String(input?.path || '').trim());
        const maxFindings = Number(input?.maxFindings) > 0 ? Number(input.maxFindings) : 200;

        const patterns: Array<{ type: string; re: RegExp }> = [
            { type: 'openai_key', re: /\bsk-[A-Za-z0-9_-]{32,}\b/g },
            { type: 'github_pat', re: /\bgithub_pat_[A-Za-z0-9_]{10,}\b/g },
            { type: 'github_token', re: /\bghp_[A-Za-z0-9_]{10,}\b/g },
            { type: 'aws_access_key', re: /\bAKIA[0-9A-Z]{16}\b/g },
            { type: 'private_key', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
            { type: 'generic_secret_assignment', re: /\b(?:password|passwd|secret|api[_-]?key|token|jwt[_-]?secret)\b\s*[:=]\s*['"][^'"]{16,}['"]/gi },
        ];

        const findings: any[] = [];
        let scannedFiles = 0;

        const walk = (dir: string) => {
            if (findings.length >= maxFindings) return;
            let entries: fs.Dirent[] = [];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
            for (const ent of entries) {
                if (findings.length >= maxFindings) return;
                const full = path.join(dir, ent.name);
                if (ent.isDirectory()) {
                    if (this.isIgnoredDir(ent.name)) continue;
                    walk(full);
                    continue;
                }
                if (!ent.isFile()) continue;
                if (!this.isTextFile(full)) continue;
                let content = '';
                try {
                    const st = fs.statSync(full);
                    if (st.size > 1024 * 1024) continue;
                    content = fs.readFileSync(full, 'utf-8');
                } catch {
                    continue;
                }
                scannedFiles += 1;
                const lines = content.split(/\r?\n/);
                for (let i = 0; i < lines.length; i += 1) {
                    const line = lines[i];
                    for (const ptn of patterns) {
                        ptn.re.lastIndex = 0;
                        if (ptn.re.test(line)) {
                            findings.push({
                                type: ptn.type,
                                file: path.relative(root, full),
                                line: i + 1
                            });
                            if (findings.length >= maxFindings) return;
                        }
                    }
                }
            }
        };

        walk(root);
        return { ok: findings.length === 0, output: { findings, scannedFiles }, logs: [`secrets_scan_repo path=${root} findings=${findings.length}`] };
    }
}

export class CiGeneratePipelineTool extends BaseTool {
    name = 'ci_generate_pipeline';
    description = 'Generate a basic CI workflow for a project if missing.';
    version = '1.0.0';
    tags = ['ci', 'github', 'actions'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            path: { type: 'string' },
            kind: { type: 'string', enum: ['node'] }
        },
        required: ['path']
    };
    outputSchema = { type: 'object' as const, properties: { workflowPath: { type: 'string' }, skipped: { type: 'boolean' } } };
    permissions: ToolPermission[] = ['write', 'read'];
    sideEffects: ToolPermission[] = ['write'];

    async execute(input: any) {
        const proj = resolveToolPath(String(input?.path || '').trim());
        const workflowsDir = path.join(proj, '.github', 'workflows');
        const workflowPath = path.join(workflowsDir, 'node-ci.yml');

        if (fs.existsSync(workflowPath)) {
            return { ok: true, output: { workflowPath, skipped: true }, logs: ['ci_generate_pipeline skipped (exists)'] };
        }

        fs.mkdirSync(workflowsDir, { recursive: true });

        const content = `name: Node.js CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
    - uses: actions/checkout@v4
    - name: Use Node.js \${{ matrix.node-version }}
      uses: actions/setup-node@v4
      with:
        node-version: \${{ matrix.node-version }}
        cache: 'npm'
    - name: Install dependencies
      run: npm ci
    - name: Run tests
      run: npm test --if-present
    - name: Build
      run: npm run build --if-present
`;

        fs.writeFileSync(workflowPath, content, 'utf-8');
        return { ok: true, output: { workflowPath, skipped: false }, logs: ['ci_generate_pipeline created'] };
    }
}

export class LoadTesterTool extends BaseTool {
    name = 'load_tester';
    description = 'Run performance stress tests (using k6 logic wrapper).';
    version = '1.0.0';
    tags = ['testing', 'performance', 'load'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' },
            vus: { type: 'number', description: 'Virtual Users' },
            duration: { type: 'string', description: 'e.g. 30s' }
        },
        required: ['url']
    };
    outputSchema = { type: 'object' as const, properties: { summary: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet']; // shell/internet
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        // Since we can't easily install k6 inside the container dynamically without root, 
        // we will implement a simple concurrent fetcher in Node as a "Lite" load tester.
        const url = input.url;
        const vus = Math.min(input.vus || 10, 50); // Cap for safety
        const durationSec = parseInt(input.duration || '10');

        let requests = 0;
        let errors = 0;
        const start = Date.now();
        const end = start + (durationSec * 1000);

        const worker = async () => {
            while (Date.now() < end) {
                try {
                    await fetch(url);
                    requests++;
                } catch {
                    errors++;
                }
            }
        };

        const promises = [];
        for (let i = 0; i < vus; i++) promises.push(worker());
        await Promise.all(promises);

        const rps = requests / durationSec;
        return {
            ok: true,
            output: { summary: `Load Test Results for ${url}:\nVUs: ${vus}\nDuration: ${durationSec}s\nTotal Requests: ${requests}\nRPS: ${rps.toFixed(2)}\nErrors: ${errors}` },
            logs: [`load test finished rps=${rps}`]
        };
    }
}
