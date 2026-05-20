import { NodeSSH } from 'node-ssh';
import { SentinelActionRunModel } from '../../../shared/models/SentinelActionRun';
import { SentinelAuditService } from './SentinelAuditService';
import { ServerConfigModel } from '../../../shared/models/ServerConfigModel';
import fs from 'fs';

export class SentinelActionRunner {
    private static sshConnections = new Map<string, NodeSSH>();

    private static async getSSHConnection(serverId: any): Promise<NodeSSH> {
        if (this.sshConnections.has(serverId.toString())) {
            return this.sshConnections.get(serverId.toString())!;
        }

        const server = await ServerConfigModel.findById(serverId).select('+password');
        if (!server) throw new Error('Server not found');

        const ssh = new NodeSSH();
        
        const connectOpts: any = {
            host: server.host,
            username: server.username,
            port: server.port
        };
        
        if (server.authMethod === 'key') {
            connectOpts.privateKey = fs.readFileSync(server.keyPath!, 'utf8');
        } else {
            connectOpts.password = server.password;
        }

        await ssh.connect(connectOpts);
        this.sshConnections.set(serverId.toString(), ssh);
        return ssh;
    }

    /**
     * Executes a playbook action explicitly.
     */
    static async executeAction(
        incidentId: string, 
        serverId: any, 
        actionType: string, 
        payload: any, 
        dryRun: boolean = false,
        actorId: string = 'system'
    ): Promise<string> {
        if (dryRun) {
            return `[DRY-RUN] Would execute playbook: ${actionType} on target: ${payload.target}`;
        }

        const runRecord = await SentinelActionRunModel.create({
            incidentId,
            actionType,
            initiatedBySystem: actorId === 'system',
            initiatedByUserId: actorId !== 'system' ? actorId : undefined,
            status: 'running',
        });

        try {
            const ssh = await this.getSSHConnection(serverId);
            let command = '';
            let rollbackCmd = '';

            switch (actionType) {
                case 'kill_process_tree':
                    command = `pkill -9 -P ${payload.target} || true; kill -9 ${payload.target} || true`;
                    rollbackCmd = `# Cannot rollback process kill (${payload.target})`;
                    break;
                case 'quarantine_file':
                    command = `mkdir -p /root/sentinel_quarantine && mv ${payload.target} /root/sentinel_quarantine/$(basename ${payload.target}).$(date +%s).q && chmod 000 /root/sentinel_quarantine/*`;
                    rollbackCmd = `# Rollback for quarantine requires manual intervention for ${payload.target}`;
                    break;
                case 'block_ip':
                    command = `ufw deny from ${payload.target} || iptables -A INPUT -s ${payload.target} -j DROP`;
                    rollbackCmd = `ufw delete deny from ${payload.target} || iptables -D INPUT -s ${payload.target} -j DROP`;
                    break;
                default:
                    throw new Error(`Unknown Playbook Action: ${actionType}`);
            }

            const execResult = await ssh.execCommand(command);
            
            runRecord.status = execResult.code === 0 ? 'success' : 'failed';
            runRecord.logs = execResult.stdout || execResult.stderr;
            runRecord.rollbackLogs = rollbackCmd;
            await runRecord.save();

            await SentinelAuditService.logAction(
                actorId,
                actionType.toUpperCase(),
                payload.target,
                runRecord.status
            );

            return runRecord.logs;
        } catch (e: any) {
            runRecord.status = 'failed';
            runRecord.logs = e.message;
            await runRecord.save();
            throw e;
        }
    }
}
