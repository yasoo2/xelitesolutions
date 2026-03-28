import { ToolDefinition, ToolPermission } from '../types';
import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export class DockerManagerTool implements ToolDefinition {
    name = 'docker_manager';
    version = '1.0.0';
    tags = ['docker', 'devops', 'containers', 'system'];
    description = 'Manage Docker containers, images, and volumes. Use this to start/stop services, build images, or check logs.';

    inputSchema: any = {
        type: 'object',
        properties: {
            action: { type: 'string', enum: ['ps', 'start', 'stop', 'rm', 'images', 'rmi', 'logs', 'build', 'compose_up', 'compose_down'], description: 'The Docker action to perform.' },
            target: { type: 'string', description: 'The container ID/name, image ID/name, or docker-compose path depending on the action.' },
            options: { type: 'string', description: 'Additional flags or options (e.g. "-d", "--build", "-f").' }
        },
        required: ['action']
    };

    outputSchema: any = {
        type: 'object',
        properties: {
            success: { type: 'boolean' },
            stdout: { type: 'string' },
            stderr: { type: 'string' }
        }
    };

    permissions: ToolPermission[] = ['execute', 'write'];
    sideEffects: ToolPermission[] = ['execute', 'write'];
    rateLimitPerMinute = 15;
    auditFields = ['action', 'target'];
    mockSupported = false;

    async execute(input: { action: string; target?: string; options?: string; workspaceId?: string }) {
        let command = 'docker';
        const target = input.target || '';
        const options = input.options || '';

        switch(input.action) {
            case 'ps': command = `docker ps -a ${options}`; break;
            case 'start': command = `docker start ${target}`; break;
            case 'stop': command = `docker stop ${target}`; break;
            case 'rm': command = `docker rm -f ${target}`; break;
            case 'images': command = `docker images ${options}`; break;
            case 'rmi': command = `docker rmi -f ${target}`; break;
            case 'logs': command = `docker logs --tail 200 ${target}`; break;
            case 'build': command = `docker build ${options} -t ${target} .`; break;
            case 'compose_up': command = `docker-compose ${options} up -d`; break;
            case 'compose_down': command = `docker-compose ${options} down`; break;
            default: return { ok: false, error: 'Unknown action', logs: [] };
        }

        try {
            const { stdout, stderr } = await execAsync(command.trim());
            return {
                ok: true,
                output: { success: true, stdout, stderr },
                logs: [`Executed: ${command}`]
            };
        } catch (e: any) {
            return {
                ok: false,
                error: e.message,
                output: { success: false, stdout: e.stdout, stderr: e.stderr },
                logs: [`Failed: ${command} -> ${e.message}`]
            };
        }
    }
}
