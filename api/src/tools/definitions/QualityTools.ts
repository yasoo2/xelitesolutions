
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    permissions: ToolPermission[] = ['shell', 'internet'];
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        // Check if sonar-scanner exists
        try {
            const key = input.projectKey;
            // Assume sonar-scanner is in path or use npx sonar-scanner
            // For now, we'll try to run it, if it fails, we report that it needs installation
            const cmd = `npx sonar-scanner -Dsonar.projectKey=${key} -Dsonar.sources=${input.sources}`;
            const { stdout } = await execAsync(cmd);
            return { ok: true, output: { summary: stdout.slice(0, 2000) }, logs: ['sonar scan complete'] };
        } catch (e: any) {
            if (String(e.message).includes('command not found') || String(e.message).includes('ENOENT')) {
                return { ok: false, error: 'sonar-scanner/npx not available. Please install dependencies.', logs: [] };
            }
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
    permissions: ToolPermission[] = ['shell', 'internet'];
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        const pm = input.packageManager || 'npm';
        let cmd = 'npm audit';
        if (pm === 'yarn') cmd = 'yarn audit';
        if (pm === 'pnpm') cmd = 'pnpm audit';

        try {
            await execAsync(cmd);
            return { ok: true, output: { report: 'No vulnerabilities found!' }, logs: ['audit passed'] };
        } catch (e: any) {
            // npm audit returns exit code 1 if vulns found
            return { ok: true, output: { report: e.stdout || e.message }, logs: ['audit found issues'] };
        }
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
    permissions: ToolPermission[] = ['unknown']; // shell/internet
    sideEffects: ToolPermission[] = ['shell'];

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
