import { spawn } from 'child_process';
import { Deployment } from '../models/deployment';
import { logger } from '../utils/logger';
import { broadcast } from '../ws';
import axios from 'axios';
import { execSync } from 'child_process';
import { alertService } from './AlertService';
import shadow from 'fs';
const fs = shadow.promises;
const STABLE_COMMIT_FILE = './last_stable_commit';

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

    async startDeploy(triggeredBy: 'webhook' | 'manual', expectedCommit?: string): Promise<string> {
        if (this.currentDeploymentId) {
            throw new Error('A deployment is already in progress');
        }

        const currentCommit = await this.getCurrentCommit();
        const deployment = await Deployment.create({
            commit: expectedCommit || currentCommit,
            status: 'BUILDING',
            triggeredBy,
            logs: [`[${new Date().toISOString()}] Starting deployment...`]
        });

        this.currentDeploymentId = deployment._id.toString();

        // Run in background
        this.runDeployProcess(deployment._id.toString(), false, expectedCommit).catch(err => {
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

    private async runDeployProcess(id: string, isRollback = false, expectedCommit?: string) {
        const deployment = await Deployment.findById(id);
        if (!deployment) return;

        try {
            // 1. Git Prep
            if (isRollback) {
                await this.runCommand('git', ['reset', '--hard', deployment.commit, '--'], id, 60000);
            } else {
                await this.runCommand('git', ['pull', 'origin', 'main'], id, 60000);
            }

            // 2. Race Condition Check
            if (expectedCommit) {
                await this.verifyCommitMatch(id, expectedCommit);
            }

            // 3. Docker Build/Up
            await this.runCommand('docker', ['compose', '-f', 'docker-compose.production.yml', 'up', '-d', '--build', '--progress=plain'], id, 600000);

            deployment.duration = (deployment.endTime.getTime() - deployment.startTime.getTime()) / 1000;
            await deployment.save();

            // 4. Post-Build Verifications
            this.broadcastLog(id, `\n[VERIFY] Starting Post-Deployment Checks...`);

            await this.verifyContainersHealthy(id, 60000);
            await this.verifyHttpHealth(id, 60000);
            await this.runSelfTest(id, 60000);

            deployment.status = isRollback ? 'ROLLBACK' : 'SUCCESS';
            deployment.endTime = new Date();
            await deployment.save();

            // Store as last stable commit
            shadow.writeFileSync(STABLE_COMMIT_FILE, deployment.commit);

            this.broadcastLog(id, `\n[SUCCESS] [${new Date().toISOString()}] All verification checks passed. Deployment live.`);
            await alertService.notifySuccess(id, deployment.commit);

        } catch (err: any) {
            logger.error(`[DeployManager] Deployment ${id} failed: ${err.message}`);
            deployment.status = 'FAILED';
            deployment.error = err.message;
            deployment.endTime = new Date();
            await deployment.save();
            this.broadcastLog(id, `[ERROR] [${new Date().toISOString()}] Deployment failed: ${err.message}`);

            await alertService.notifyFailure(id, err.message);

            // Auto-Rollback if not already rolling back
            if (!isRollback) {
                try {
                    const lastStable = shadow.readFileSync(STABLE_COMMIT_FILE, 'utf8').trim();
                    if (lastStable && lastStable !== deployment.commit) {
                        this.broadcastLog(id, `\n[VERIFY] FAILED. Initiating automatic rollback to: ${lastStable}`);
                        await alertService.notifyRollback(id, lastStable, err.message);
                        // Trigger a new rollback deployment
                        await this.rollbackToCommit(lastStable, `Auto-Rollback for failed deployment ${id}`);
                    }
                } catch (e) {
                    this.broadcastLog(id, `[VERIFY] Auto-rollback skipped: No stable commit record found.`);
                }
            }
        } finally {
            this.currentDeploymentId = null;
        }
    }

    private async rollbackToCommit(commit: string, reason: string) {
        const deployment = await Deployment.create({
            commit,
            status: 'BUILDING',
            triggeredBy: 'manual',
            logs: [`[${new Date().toISOString()}] Starting automatic rollback. Reason: ${reason}`]
        });
        this.currentDeploymentId = deployment._id.toString();
        this.runDeployProcess(deployment._id.toString(), true).catch(e => {
            logger.error(`[DeployManager] Recursive rollback failure: ${e.message}`);
        });
    }

    private runCommand(cmd: string, args: string[], deploymentId: string, timeoutMs = 300000): Promise<void> {
        return new Promise((resolve, reject) => {
            this.broadcastLog(deploymentId, `\n[RUN] ${cmd} ${args.join(' ')}\n`);
            const child = spawn(cmd, args, { cwd: process.cwd(), shell: true });

            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Command ${cmd} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            let stdoutBuf = '';
            child.stdout.on('data', (data) => {
                stdoutBuf += data.toString();
                let i;
                while ((i = stdoutBuf.indexOf('\n')) !== -1) {
                    const line = stdoutBuf.slice(0, i).trimEnd();
                    if (line) this.appendLog(deploymentId, line);
                    stdoutBuf = stdoutBuf.slice(i + 1);
                }
            });

            let stderrBuf = '';
            child.stderr.on('data', (data) => {
                stderrBuf += data.toString();
                let i;
                while ((i = stderrBuf.indexOf('\n')) !== -1) {
                    const line = stderrBuf.slice(0, i).trimEnd();
                    if (line) this.appendLog(deploymentId, line);
                    stderrBuf = stderrBuf.slice(i + 1);
                }
            });

            child.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) resolve();
                else reject(new Error(`Command ${cmd} failed with code ${code}`));
            });

            child.on('error', (err) => {
                clearTimeout(timeout);
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

    private async verifyCommitMatch(id: string, expected: string) {
        this.broadcastLog(id, `[VERIFY] Checking commit match...`);
        const actual = await this.getCurrentCommit();
        if (actual !== expected) {
            throw new Error(`Commit mismatch! Expected ${expected}, found ${actual}`);
        }
        this.broadcastLog(id, `[VERIFY] Commit match OK: ${actual.slice(0, 7)}`);
    }

    private async verifyContainersHealthy(id: string, timeoutMs = 60000) {
        this.broadcastLog(id, `[VERIFY] Checking container health...`);
        const start = Date.now();
        const critical = ['joe_api', 'joe_web', 'joe_mongo', 'joe_nginx'];

        while (Date.now() - start < timeoutMs) {
            try {
                const output = execSync('docker ps --format "{{.Names}}: {{.Status}}"').toString();
                const allHealthy = critical.every(name => {
                    if (!output.includes(name)) return false;
                    const line = output.split('\n').find(l => l.includes(name)) || '';
                    return line.includes('Up') || line.includes('healthy');
                });

                if (allHealthy) {
                    this.broadcastLog(id, `[VERIFY] All critical containers are Up/Healthy.`);
                    return;
                }
            } catch (e) { }
            await new Promise(r => setTimeout(r, 5000));
        }
        throw new Error(`Container health check timed out after ${timeoutMs}ms.`);
    }

    private async verifyHttpHealth(id: string, timeoutMs = 60000) {
        this.broadcastLog(id, `[VERIFY] Checking HTTP health (loopback)...`);
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            try {
                const res = await axios.get(`http://localhost:${process.env.PORT || 3000}/api/health`, { timeout: 5000 });
                if (res.data?.status === 'OK') {
                    this.broadcastLog(id, `[VERIFY] HTTP Health OK.`);
                    return;
                }
            } catch (e: any) {
                this.broadcastLog(id, `[VERIFY] Health check attempt failed... retrying...`);
            }
            await new Promise(r => setTimeout(r, 5000));
        }
        throw new Error(`HTTP Health check timed out after ${timeoutMs}ms.`);
    }

    private async runSelfTest(id: string, timeoutMs = 60000) {
        this.broadcastLog(id, `[VERIFY] Running system self-test...`);
        try {
            // Run a lightweight verification script if it exists
            await this.runCommand('npm', ['run', 'test:system'], id, timeoutMs);
            this.broadcastLog(id, `[VERIFY] Self-test passed.`);
        } catch (e: any) {
            throw new Error(`Self-test failed: ${e.message}`);
        }
    }

    async getStatus() {
        return {
            currentDeploymentId: this.currentDeploymentId,
            isBuilding: !!this.currentDeploymentId
        };
    }
}

export const deployManager = DeployManager.getInstance();
