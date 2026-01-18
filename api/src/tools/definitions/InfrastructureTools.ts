
import { BaseTool } from '../base';
import { ToolPermission } from '../types';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    permissions: ToolPermission[] = ['shell', 'file_read', 'file_write']; // Needs shell to run binary
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        const action = String(input.action).toLowerCase();
        const dir = String(input.directory).trim();
        if (!dir) return { ok: false, error: 'directory required', logs: [] };

        let cmd = `terraform -chdir=${dir} ${action}`;

        // Add variables
        if (input.vars) {
            for (const [k, v] of Object.entries(input.vars)) {
                cmd += ` -var="${k}=${v}"`;
            }
        }

        // Safety flags
        if ((action === 'apply' || action === 'destroy') && input.autoApprove) {
            cmd += ' -auto-approve';
        } else if (action === 'apply' || action === 'destroy') {
            // By default, terraform waits for input. We must prevent that in automation unless autoApprove is explicit.
            // Actually, for automation, we usually want -auto-approve OR we run 'plan' first.
            // If prompt is needed, this will hang.
            // We will default to adding -no-color and maybe fail if interactive.
            // For now, let's assume the agent knows what it's doing or uses plan first.
            // But we must add -input=false to prevent hanging.
        }
        cmd += ' -input=false -no-color';

        try {
            const { stdout, stderr } = await execAsync(cmd);
            const combined = stdout + '\n' + stderr;
            return {
                ok: true,
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
    permissions: ToolPermission[] = ['shell'];
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        let cmd = String(input.command).trim();
        const ns = input.namespace ? `-n ${input.namespace}` : '';

        // Sanitize basic injection risks (very basic)
        if (cmd.includes(';') || cmd.includes('|')) {
            return { ok: false, error: 'Chained commands not allowed in kubectl tool', logs: [] };
        }

        const fullCmd = `kubectl ${ns} ${cmd}`;
        try {
            const { stdout, stderr } = await execAsync(fullCmd);
            return {
                ok: true,
                output: { output: (stdout + stderr).slice(0, 5000) },
                logs: [`executed: ${fullCmd}`]
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
    permissions: ToolPermission[] = ['shell'];
    sideEffects: ToolPermission[] = ['shell'];

    async execute(input: any) {
        const action = input.action;
        let cmd = '';

        if (action === 'deploy_stack') {
            if (!input.stackName || !input.composeFile) return { ok: false, error: 'stackName and composeFile required', logs: [] };
            cmd = `docker stack deploy -c ${input.composeFile} ${input.stackName}`;
        } else if (action === 'list_services') {
            cmd = `docker service ls`;
        } else if (action === 'service_logs') {
            if (!input.stackName) return { ok: false, error: 'stackName (or service name) required', logs: [] };
            cmd = `docker service logs --tail 100 ${input.stackName}`;
        } else if (action === 'remove_stack') {
            if (!input.stackName) return { ok: false, error: 'stackName required', logs: [] };
            cmd = `docker stack rm ${input.stackName}`;
        }

        try {
            const { stdout, stderr } = await execAsync(cmd);
            return { ok: true, output: { output: stdout + stderr }, logs: [`swarm action ${action} executed`] };
        } catch (e: any) {
            return { ok: false, error: `Swarm action failed: ${e.message}`, logs: [] };
        }
    }
}
