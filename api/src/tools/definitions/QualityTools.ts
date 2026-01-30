
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { handleShellCommand } from '../handlers';

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
            packageManager: { type: 'string', enum: ['npm', 'yarn', 'pnpm'], default: 'npm' }
        }
    };
    outputSchema = { type: 'object' as const, properties: { report: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute', 'internet'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const pm = input.packageManager || 'npm';
        const cmd = pm === 'yarn' ? 'yarn' : pm === 'pnpm' ? 'pnpm' : 'npm';
        const args = ['audit'];
        const r = await handleShellCommand(cmd, args, process.cwd(), 300000, false);
        if (r.ok) {
            return { ok: true, output: { report: 'No vulnerabilities found!' }, logs: ['audit passed'] };
        }
        return { ok: true, output: { report: r.error || String(r.output || '') }, logs: ['audit found issues'] };
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
