import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
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

function splitCommandLine(cmd: string): string[] {
    const parts = cmd.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g);
    if (!parts) return [];
    return parts.map(p => {
        if (p.startsWith('"') && p.endsWith('"')) return p.slice(1, -1);
        if (p.startsWith("'") && p.endsWith("'")) return p.slice(1, -1);
        return p;
    });
}

async function spawnWithTimeout(cmd: string, args: string[], cwd: string, timeoutMs: number) {
    const result = await ExecutionGateway.execute(cmd, args, { cwd, timeout: timeoutMs, shell: true });
    return {
        code: result.exitCode ?? (result.ok ? 0 : 1),
        stdout: result.output || '',
        stderr: result.error || ''
    };
}

export class TerraformManagerTool extends BaseTool {
    name = 'terraform_manager';
    description = 'Manage Infrastructure as Code using Terraform (init, plan, apply, destroy).';
    version = '1.0.0';
    tags = ['infrastructure', 'terraform', 'cloud'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string', enum: ['init', 'plan', 'apply', 'destroy', 'validate'] },
            directory: { type: 'string', description: 'Directory containing main.tf' },
            vars: { type: 'object', description: 'Optional variables to pass to terraform' },
            autoApprove: { type: 'boolean', description: 'Auto approve apply/destroy? Default false' }
        },
        required: ['action', 'directory']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            output: { type: 'string' },
            planSummary: { type: 'string' }
        }
    };
    permissions: ToolPermission[] = ['execute', 'read', 'write']; // Needs shell to run binary
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const action = String(input.action).toLowerCase();
        const dirRaw = String(input.directory).trim();
        const dir = resolveToolPath(dirRaw);
        if (!dir) return { ok: false, error: 'directory required', logs: [] };

        const args: string[] = [`-chdir=${dir}`, action];

        // Add variables
        if (input.vars) {
            for (const [k, v] of Object.entries(input.vars)) {
                args.push('-var', `${k}=${v}`);
            }
        }

        // Safety flags
        if ((action === 'apply' || action === 'destroy') && input.autoApprove) {
            args.push('-auto-approve');
        } else if (action === 'apply' || action === 'destroy') {
            // By default, terraform waits for input. We must prevent that in automation unless autoApprove is explicit.
            // Actually, for automation, we usually want -auto-approve OR we run 'plan' first.
            // If prompt is needed, this will hang.
            // We will default to adding -no-color and maybe fail if interactive.
            // For now, let's assume the agent knows what it's doing or uses plan first.
            // But we must add -input=false to prevent hanging.
        }
        args.push('-input=false', '-no-color');

        try {
            const r = await spawnWithTimeout('terraform', args, getWorkspaceRoot(), 10 * 60_000);
            const combined = (r.stdout || '') + '\n' + (r.stderr || '');
            return {
                ok: r.code === 0,
                output: {
                    output: combined.slice(0, 5000),
                    planSummary: action === 'plan' ? this.extractSummary(combined) : undefined
                },
                logs: [`terraform ${action} executed in ${dir}`]
            };
        } catch (e: any) {
            return { ok: false, error: `Terraform failed: ${e.message}\nStderr: ${e.stderr}`, logs: [] };
        }
    }

    private extractSummary(output: string): string {
        const match = output.match(/Plan: (\d+) to add, (\d+) to change, (\d+) to destroy./);
        if (match) return match[0];
        return 'No summary found';
    }
}

export class KubernetesOpsTool extends BaseTool {
    name = 'kubernetes_ops';
    description = 'Manage Kubernetes clusters via kubectl.';
    version = '1.0.0';
    tags = ['infrastructure', 'kubernetes', 'k8s'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            command: { type: 'string', description: 'kubectl command (e.g. "get pods", "apply -f file.yaml")' },
            namespace: { type: 'string' }
        },
        required: ['command']
    };
    outputSchema = {
        type: 'object' as const,
        properties: {
            output: { type: 'string' }
        }
    };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const cmdRaw = String(input.command).trim();
        const parts = splitCommandLine(cmdRaw);
        if (!parts) return { ok: false, error: 'invalid_command', logs: [] };

        const args = parts[0] === 'kubectl' ? parts.slice(1) : parts;
        if (!args.length) return { ok: false, error: 'invalid_command', logs: [] };

        const ns = String(input.namespace || '').trim();
        const fullArgs = [...(ns ? ['-n', ns] : []), ...args];
        try {
            const r = await spawnWithTimeout('kubectl', fullArgs, getWorkspaceRoot(), 60_000);
            return {
                ok: r.code === 0,
                output: { output: ((r.stdout || '') + (r.stderr || '')).slice(0, 5000) },
                logs: [`executed: kubectl ${fullArgs.join(' ')}`]
            };
        } catch (e: any) {
            return { ok: false, error: `kubectl failed: ${e.message}`, logs: [] };
        }
    }
}

export class DockerSwarmOpsTool extends BaseTool {
    name = 'docker_swarm_ops';
    description = 'Manage Docker Swarm services and stacks.';
    version = '1.0.0';
    tags = ['infrastructure', 'docker', 'swarm'];
    inputSchema = {
        type: 'object' as const,
        properties: {
            action: { type: 'string', enum: ['deploy_stack', 'list_services', 'service_logs', 'remove_stack'] },
            stackName: { type: 'string' },
            composeFile: { type: 'string', description: 'Path to compose file for deploy' },
        },
        required: ['action']
    };
    outputSchema = { type: 'object' as const, properties: { output: { type: 'string' } } };
    permissions: ToolPermission[] = ['execute'];
    sideEffects: ToolPermission[] = ['execute'];

    async execute(input: any) {
        const action = input.action;
        const cwd = getWorkspaceRoot();
        let args: string[] = [];

        if (action === 'deploy_stack') {
            if (!input.stackName || !input.composeFile) return { ok: false, error: 'stackName and composeFile required', logs: [] };
            const stackName = String(input.stackName || '').trim();
            const composeFile = resolveToolPath(String(input.composeFile || '').trim());
            args = ['stack', 'deploy', '-c', composeFile, stackName];
        } else if (action === 'list_services') {
            args = ['service', 'ls'];
        } else if (action === 'service_logs') {
            if (!input.stackName) return { ok: false, error: 'stackName (or service name) required', logs: [] };
            const stackName = String(input.stackName || '').trim();
            args = ['service', 'logs', '--tail', '100', stackName];
        } else if (action === 'remove_stack') {
            if (!input.stackName) return { ok: false, error: 'stackName required', logs: [] };
            const stackName = String(input.stackName || '').trim();
            args = ['stack', 'rm', stackName];
        }

        try {
            const r = await spawnWithTimeout('docker', args, cwd, 2 * 60_000);
            return { ok: r.code === 0, output: { output: (r.stdout || '') + (r.stderr || '') }, logs: [`swarm action ${action} executed`] };
        } catch (e: any) {
            return { ok: false, error: `Swarm action failed: ${e.message}`, logs: [] };
        }
    }
}
