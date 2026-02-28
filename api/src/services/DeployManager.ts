import { spawn } from 'child_process';
import { Deployment } from '../models/deployment';
import { logger } from '../utils/logger';
import { broadcast } from '../ws';

export class DeployManager {
    private static instance: DeployManager;
    private currentDeploymentId: string | null = null;

    private constructor() { }

    static getInstance() {
        if (!DeployManager.instance) {
            DeployManager.instance = new DeployManager();
        }
        return DeployManager.instance;
    }

    async startDeploy(triggeredBy: 'webhook' | 'manual'): Promise<string> {
        if (this.currentDeploymentId) {
            throw new Error('A deployment is already in progress');
        }

        const commit = await this.getCurrentCommit();
        const deployment = await Deployment.create({
            commit,
            status: 'BUILDING',
            triggeredBy,
            logs: [`[${new Date().toISOString()}] Starting deployment...`]
        });

        this.currentDeploymentId = deployment._id.toString();

        // Run in background
        this.runDeployProcess(deployment._id.toString()).catch(err => {
            logger.error(`[DeployManager] Critical failure in background process: ${err.message}`);
        });

        return deployment._id.toString();
    }

    async rollback(deploymentId: string): Promise<string> {
        const target = await Deployment.findById(deploymentId);
        if (!target) throw new Error('Deployment not found');

        const deployment = await Deployment.create({
            commit: target.commit,
            status: 'BUILDING',
            triggeredBy: 'manual',
            logs: [`[${new Date().toISOString()}] Starting rollback to commit ${target.commit}...`]
        });

        this.currentDeploymentId = deployment._id.toString();
        this.runDeployProcess(deployment._id.toString(), true).catch(err => {
            logger.error(`[DeployManager] Critical failure in rollback: ${err.message}`);
        });

        return deployment._id.toString();
    }

    private async runDeployProcess(id: string, isRollback = false) {
        const deployment = await Deployment.findById(id);
        if (!deployment) return;

        try {
            if (isRollback) {
                await this.runCommand('git', ['reset', '--hard', deployment.commit, '--'], id);
            } else {
                await this.runCommand('git', ['pull', 'origin', 'main'], id);
            }

            // Update build command to be more robust
            await this.runCommand('docker', ['compose', '-f', 'docker-compose.production.yml', 'up', '-d', '--build'], id);

            deployment.status = isRollback ? 'ROLLBACK' : 'SUCCESS';
            deployment.endTime = new Date();
            deployment.duration = (deployment.endTime.getTime() - deployment.startTime.getTime()) / 1000;
            await deployment.save();

            this.broadcastLog(id, `[${new Date().toISOString()}] Deployment completed successfully.`);
        } catch (err: any) {
            logger.error(`[DeployManager] Deployment ${id} failed: ${err.message}`);
            deployment.status = 'FAILED';
            deployment.error = err.message;
            deployment.endTime = new Date();
            await deployment.save();
            this.broadcastLog(id, `[ERROR] [${new Date().toISOString()}] Deployment failed: ${err.message}`);
        } finally {
            this.currentDeploymentId = null;
        }
    }

    private runCommand(cmd: string, args: string[], deploymentId: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.broadcastLog(deploymentId, `\n[RUN] ${cmd} ${args.join(' ')}\n`);
            const child = spawn(cmd, args, { cwd: process.cwd(), shell: true });

            child.stdout.on('data', (data) => {
                const line = data.toString();
                this.appendLog(deploymentId, line);
            });

            child.stderr.on('data', (data) => {
                const line = data.toString();
                this.appendLog(deploymentId, line);
            });

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Command ${cmd} failed with code ${code}`));
            });

            child.on('error', (err) => {
                reject(err);
            });
        });
    }

    private async appendLog(id: string, log: string) {
        // We don't want to await this on every line for performance, 
        // but the user wants them in DB. 
        // For now, we update DB and broadcast.
        await Deployment.findByIdAndUpdate(id, { $push: { logs: log } });
        this.broadcastLog(id, log);
    }

    private broadcastLog(deploymentId: string, log: string) {
        broadcast({
            type: 'admin:deploy_log',
            data: { deploymentId, log },
            ts: Date.now()
        });
    }

    private getCurrentCommit(): Promise<string> {
        return new Promise((resolve) => {
            const child = spawn('git', ['rev-parse', 'HEAD'], { shell: true });
            let commit = '';
            child.stdout.on('data', (data) => commit += data.toString().trim());
            child.on('close', () => resolve(commit || 'unknown'));
            child.on('error', () => resolve('unknown'));
        });
    }

    async getStatus() {
        return {
            currentDeploymentId: this.currentDeploymentId,
            isBuilding: !!this.currentDeploymentId
        };
    }
}

export const deployManager = DeployManager.getInstance();
