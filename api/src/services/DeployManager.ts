import { spawn } from 'child_process';
import mongoose from 'mongoose';
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
    private logQueue: { id: string, logs: string[] }[] = [];
    private flushInterval: NodeJS.Timeout | null = null;

    private constructor() {
        // Start flush interval
        this.flushInterval = setInterval(() => this.flushLogs(), 2000);
        this.repairZombieDeployments().catch(e => logger.error(`[DeployManager] Failed to repair zombie deployments: ${e.message}`));
    }

    private async repairZombieDeployments() {
        try {
            // Wait for DB connection if not ready
            let retries = 0;
            while (mongoose.connection.readyState !== 1 && retries < 30) {
                await new Promise(r => setTimeout(r, 1000));
                retries++;
            }

            if (mongoose.connection.readyState !== 1) {
                logger.error(`[DeployManager] DB not ready after 30s. Skipping repair.`);
                return;
            }

            const zombies = await Deployment.find({ status: 'BUILDING' });
            for (const zombie of zombies) {
                const logs = zombie.logs || [];
                const isRestarting = logs.some((l: string) =>
                    l.includes('[SYSTEM] Container recreation initiated') ||
                    l.includes('Container') && l.includes('Recreate')
                );

                if (isRestarting) {
                    logger.info(`[DeployManager] Recovered successful deployment ${zombie._id}. Marking as SUCCESS.`);
                    zombie.status = 'SUCCESS';
                    zombie.endTime = new Date();
                    zombie.duration = (zombie.endTime.getTime() - zombie.startTime.getTime()) / 1000;
                    zombie.logs.push(`[${new Date().toISOString()}] [SUCCESS] Deployment recovered after container restart.`);
                    await zombie.save();

                    // Store as last stable commit
                    shadow.writeFileSync(STABLE_COMMIT_FILE, zombie.commit);
                } else {
                    logger.info(`[DeployManager] Found zombie deployment ${zombie._id}. Marking as FAILED.`);
                    zombie.status = 'FAILED';
                    zombie.error = 'Server restarted during building process';
                    zombie.endTime = new Date();
                    zombie.logs.push(`[${new Date().toISOString()}] [ERROR] Deployment interrupted by server restart.`);
                    await zombie.save();
                }
            }
        } catch (e: any) {
            logger.error(`[DeployManager] Maintenance error: ${e.message}`);
        }
    }

    static getInstance() {
        if (!DeployManager.instance) {
            DeployManager.instance = new DeployManager();
        }
        return DeployManager.instance;
    }

    async startDeploy(triggeredBy: 'webhook' | 'manual', expectedCommit?: string): Promise<string> {
        if (this.currentDeploymentId) {
            // Check if it's really stuck or if we can Force clear it
            const active = await Deployment.findById(this.currentDeploymentId);
            if (active && (Date.now() - active.startTime.getTime() > 3600000)) { // 1 hour safety
                logger.warn(`[DeployManager] Force clearing deployment ${this.currentDeploymentId} due to age (1h+)`);
                this.currentDeploymentId = null;
            } else {
                throw new Error('A deployment is already in progress');
            }
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
            // 0. Ensure git safety (dubious ownership fix)
            await this.runCommand('git', ['config', '--global', '--add', 'safe.directory', '/root/xelitesolutions'], id, 30000);

            // 1. Git Prep
            if (isRollback) {
                await this.runCommand('git', ['reset', '--hard', deployment.commit, '--'], id, 60000);
            } else {
                // Ensure no local modifications block the pull
                await this.runCommand('git', ['checkout', '.'], id, 30000);
                await this.runCommand('git', ['pull', 'origin', 'main'], id, 60000);
            }

            // 2. Race Condition Check
            if (expectedCommit) {
                await this.verifyCommitMatch(id, expectedCommit);
            }

            // 3. Docker Build/Up
            this.appendLog(id, `\n[SYSTEM] Local build verified. Initiating container recreation...`);

            deployment.status = isRollback ? 'ROLLBACK' : 'SUCCESS';
            deployment.endTime = new Date();
            deployment.duration = (deployment.endTime.getTime() - deployment.startTime.getTime()) / 1000;
            await deployment.save();
            await this.flushLogs(); // Ensure everything is in DB

            // Critical: Wait 5 seconds to ensure DB persistence across the network before restart
            await new Promise(r => setTimeout(r, 5000));

            // Fire and forget: This command typically kills the current process
            // Using "docker-compose" (legacy/container-compatible) 
            this.runCommand('docker-compose', ['-f', 'docker-compose.production.yml', 'up', '-d', '--build'], id, 1200000).catch(e => {
                logger.error(`[DeployManager] Post-success restart error: ${e.message}`);
                // If it fails immediately, we might still be able to catch it before process kill
                this.appendLog(id, `\n[ERROR] Restart command failed: ${e.message}`);
            });

            this.broadcastLog(id, `\n[SUCCESS] [${new Date().toISOString()}] Build complete. Deployment finishing in background.`);

            // Post-Build Verifications (Optional/Best effort)
            // Note: These likely won't finish if the API restarts
            this.verifyContainersHealthy(id, 60000).catch(() => { });
            this.verifyHttpHealth(id, 60000).catch(() => { });

            return;

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
                    if (shadow.existsSync(STABLE_COMMIT_FILE)) {
                        const lastStable = shadow.readFileSync(STABLE_COMMIT_FILE, 'utf8').trim();
                        if (lastStable && lastStable !== deployment.commit) {
                            this.broadcastLog(id, `\n[VERIFY] FAILED. Initiating automatic rollback to: ${lastStable}`);
                            await alertService.notifyRollback(id, lastStable, err.message);
                            // Trigger a new rollback deployment
                            await this.rollbackToCommit(lastStable, `Auto-Rollback for failed deployment ${id}`);
                        }
                    }
                } catch (e) {
                    this.broadcastLog(id, `[VERIFY] Auto-rollback skipped: No stable commit record found.`);
                }
            }
        } finally {
            this.currentDeploymentId = null;
            await this.flushLogs(); // Final flush to ensure no logs are left behind
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
            const fullCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd;

            const child = spawn(fullCmd, {
                cwd: '/root/xelitesolutions',
                shell: true,
                detached: true
            });

            const timeout = setTimeout(() => {
                try {
                    if (child.pid) process.kill(-child.pid, 'SIGKILL');
                } catch (e) { }
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

    private appendLog(id: string, log: string) {
        let existing = this.logQueue.find(q => q.id === id);
        if (!existing) {
            existing = { id, logs: [] };
            this.logQueue.push(existing);
        }
        existing.logs.push(log);
        this.broadcastLog(id, log);
    }

    private async flushLogs() {
        if (this.logQueue.length === 0) return;
        const queueToFlush = [...this.logQueue];
        this.logQueue = [];

        for (const item of queueToFlush) {
            if (item.logs.length === 0) continue;
            try {
                await Deployment.findByIdAndUpdate(item.id, { $push: { logs: { $each: item.logs } } });
            } catch (err: any) {
                logger.error(`[DeployManager] Failed to flush logs for deployment ${item.id}: ${err.message}`);
                const existing = this.logQueue.find(q => q.id === item.id);
                if (existing) {
                    existing.logs = [...item.logs, ...existing.logs];
                } else {
                    this.logQueue.push(item);
                }
            }
        }
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
            const child = spawn('git', ['ls-remote', 'https://github.com/yasoo2/xelitesolutions.git', 'HEAD'], { shell: true });
            let output = '';
            let errOutput = '';
            child.stdout.on('data', (data) => output += data.toString());
            child.stderr.on('data', (data) => errOutput += data.toString());
            child.on('close', (code) => {
                if (code !== 0) {
                    logger.error(`[DeployManager] git ls-remote failed (code ${code}): ${errOutput}`);
                    resolve('unknown');
                    return;
                }
                const commit = output.split(/\s+/)[0];
                resolve(commit || 'unknown');
            });
            child.on('error', (err) => {
                logger.error(`[DeployManager] git ls-remote process error: ${err.message}`);
                resolve('unknown');
            });
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
