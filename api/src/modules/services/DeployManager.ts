import { spawn } from 'child_process';
import mongoose from 'mongoose';
import os from 'os';
import { Deployment } from '../../shared/models/deployment';
import { logger } from '../../shared/utils/logger';
import { broadcast } from '../../api/ws';
import axios from 'axios';
import { alertService } from './AlertService';
import shadow from 'fs';
const fs = shadow.promises;
const STABLE_COMMIT_FILE = './last_stable_commit';

// Configurable project root - no more hardcoded /root/xelitesolutions
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();
const API_DIR = process.env.API_DIR || `${PROJECT_ROOT}/api`;
const WEB_DIR = process.env.WEB_DIR || `${PROJECT_ROOT}/web`;
const POLL_INTERVAL_MS = Math.max(10000, Number(process.env.DEPLOY_POLL_INTERVAL_MS) || 60000); // Default 60s, min 10s

export class DeployManager {
    private static instance: DeployManager;
    private currentDeploymentId: string | null = null;
    private logQueue: { id: string, logs: string[] }[] = [];
    private flushInterval: NodeJS.Timeout | null = null;
    private pollerInterval: NodeJS.Timeout | null = null;
    private lastKnownCommit: string | null = null;

    // Auto-deploy poller health tracking
    private pollerActive = false;
    private pollerEnabled = true;  // Can be toggled via API
    private pollCount = 0;
    private lastPollTime: Date | null = null;
    private lastPollError: string | null = null;
    private lastLocalCommit: string | null = null;
    private lastRemoteCommit: string | null = null;

    private constructor() {
        // Start flush interval
        this.flushInterval = setInterval(() => this.flushLogs(), 2000);
        this.repairZombieDeployments().catch(e => logger.error(`[DeployManager] Failed to repair zombie deployments: ${e.message}`));
        // Start auto-deploy poller (configurable interval, default 60s)
        this.startAutoDeployPollerInternal();
        logger.info(`[DeployManager] Instance created. Auto-deploy poller initializing...`);
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
            await this.runCommand('git', ['config', '--global', '--add', 'safe.directory', PROJECT_ROOT], PROJECT_ROOT);

            // 1. Sync code
            this.queueLog(id, '[SYSTEM] Syncing code from GitHub...');
            const currentCommit = await this.getCurrentCommit();
            const remoteCommit = await this.getRemoteCommit();

            this.lastLocalCommit = currentCommit;
            this.lastRemoteCommit = remoteCommit;

            if (expectedCommit && expectedCommit !== remoteCommit) {
                this.queueLog(id, `[WARN] Expected commit ${expectedCommit} but remote has ${remoteCommit}`);
            }

            if (currentCommit === remoteCommit) {
                this.queueLog(id, '[SYSTEM] Already up to date.');
            } else {
                await this.runCommand('git', ['fetch', 'origin', 'main'], PROJECT_ROOT);
                await this.runCommand('git', ['reset', '--hard', `origin/main`], PROJECT_ROOT);
                this.queueLog(id, `[SYSTEM] Code synced to ${remoteCommit}`);
            }

            // 2. Build web frontend
            this.queueLog(id, '[BUILD] Building web frontend...');
            try {
                await this.runCommand('npm', ['install', '--legacy-peer-deps'], WEB_DIR, 300000);
                await this.runCommand('npm', ['run', 'build'], WEB_DIR, 300000);
                this.queueLog(id, '[BUILD] Web frontend built successfully');
            } catch (error: any) {
                this.queueLog(id, `[WARN] Web frontend build failed: ${error.message} — continuing with API rebuild...`);
            }

            // 3. Build API
            this.queueLog(id, '[BUILD] Building API...');
            await this.runCommand('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], API_DIR, 300000);

            try {
                await this.runCommand('npm', ['run', 'build'], API_DIR, 300000);
            } catch (error: any) {
                this.queueLog(id, `[WARN] npm run build failed, trying tsc directly: ${error.message}`);
                await this.runCommand('npx', ['tsc', '--skipLibCheck'], API_DIR, 300000);
            }
            this.queueLog(id, '[BUILD] API built successfully');

            // 4. Restart API server
            this.queueLog(id, '[SYSTEM] Restarting API server...');
            await this.restartAPIServer();
            this.queueLog(id, '[SYSTEM] API server restarted');

            // 5. Verify health
            this.queueLog(id, '[SYSTEM] Verifying deployment health...');
            await this.verifyHealth();
            this.queueLog(id, '[SYSTEM] Health check passed');

            // Success
            deployment.status = 'SUCCESS';
            deployment.endTime = new Date();
            deployment.duration = (deployment.endTime.getTime() - deployment.startTime.getTime()) / 1000;
            deployment.logs.push(`[${new Date().toISOString()}] [SUCCESS] Deployment completed in ${deployment.duration}s`);
            await deployment.save();

            // Store as last stable commit
            shadow.writeFileSync(STABLE_COMMIT_FILE, deployment.commit);

            // Broadcast success
            broadcast({
                type: 'deployment_completed',
                data: { deploymentId: id, status: 'success', duration: deployment.duration }
            });

            // Send alert
            await alertService.sendAlert({
                level: 'info',
                title: 'Deployment Successful',
                message: `Deployment ${id} completed successfully in ${deployment.duration}s`,
                category: 'deployment'
            });

        } catch (error: any) {
            logger.error(`[DeployManager] Deployment ${id} failed: ${error.message}`);

            deployment.status = 'FAILED';
            deployment.error = error.message;
            deployment.endTime = new Date();
            deployment.duration = (deployment.endTime.getTime() - deployment.startTime.getTime()) / 1000;
            deployment.logs.push(`[${new Date().toISOString()}] [ERROR] ${error.message}`);
            await deployment.save();

            // Broadcast failure
            broadcast({
                type: 'deployment_failed',
                data: { deploymentId: id, error: error.message }
            });

            // Send alert
            await alertService.sendAlert({
                level: 'error',
                title: 'Deployment Failed',
                message: `Deployment ${id} failed: ${error.message}`,
                category: 'deployment'
            });

            // Attempt rollback to last stable commit
            await this.attemptRollback();

        } finally {
            this.currentDeploymentId = null;
            await this.flushLogs();
        }
    }

    /**
     * FIXED: Use spawn instead of exec to avoid ENOENT error
     */
    private async runCommand(command: string, args: string[], cwd: string, timeoutMs = 120000): Promise<string> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            // Use spawn with explicit shell and PATH
            const child = spawn(command, args, {
                cwd,
                env: { 
                    ...process.env, 
                    PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v20/bin'
                },
                shell: true,
            });

            let stdout = '';
            let stderr = '';
            let killed = false;

            const timeout = setTimeout(() => {
                killed = true;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 5000);
                reject(new Error(`Command timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            child.stdout?.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr?.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('error', (error) => {
                clearTimeout(timeout);
                if (!killed) {
                    reject(new Error(`Failed to spawn command: ${error.message}`));
                }
            });

            child.on('close', (code) => {
                clearTimeout(timeout);
                if (killed) return;

                if (code === 0) {
                    resolve(stdout);
                } else {
                    reject(new Error(`Command failed with code ${code}: ${stderr || stdout}`));
                }
            });
        });
    }

    private async restartAPIServer() {
        // Try graceful restart first
        try {
            // Find and kill existing API process
            await this.runCommand('pkill', ['-f', 'node.*dist/index.js'], PROJECT_ROOT, 10000);
        } catch (e) {
            // Process might not be running, that's ok
        }

        // Start new API server
        const child = spawn('node', ['dist/index.js'], {
            cwd: API_DIR,
            env: { ...process.env, NODE_ENV: 'production' },
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    private async verifyHealth(retries = 5): Promise<void> {
        const API_URL = process.env.API_URL || 'http://localhost:8080';

        for (let i = 0; i < retries; i++) {
            try {
                const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
                if (response.status === 200) {
                    return;
                }
            } catch (e) {
                // Retry
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error('Health check failed after ' + retries + ' attempts');
    }

    private async attemptRollback() {
        try {
            if (shadow.existsSync(STABLE_COMMIT_FILE)) {
                const stableCommit = shadow.readFileSync(STABLE_COMMIT_FILE, 'utf8').trim();
                logger.info(`[DeployManager] Attempting rollback to stable commit: ${stableCommit}`);

                await this.runCommand('git', ['reset', '--hard', stableCommit], PROJECT_ROOT);
                await this.runCommand('npm', ['install', '--legacy-peer-deps'], API_DIR, 300000);
                await this.runCommand('npm', ['run', 'build'], API_DIR, 300000);
                await this.restartAPIServer();

                logger.info(`[DeployManager] Rollback to ${stableCommit} completed`);
            }
        } catch (e: any) {
            logger.error(`[DeployManager] Rollback failed: ${e.message}`);
        }
    }

    private async getCurrentCommit(): Promise<string> {
        try {
            const result = await this.runCommand('git', ['rev-parse', 'HEAD'], PROJECT_ROOT, 10000);
            return result.trim();
        } catch (e) {
            return 'unknown';
        }
    }

    private async getRemoteCommit(): Promise<string> {
        try {
            await this.runCommand('git', ['fetch', 'origin', 'main'], PROJECT_ROOT, 30000);
            const result = await this.runCommand('git', ['rev-parse', 'origin/main'], PROJECT_ROOT, 10000);
            return result.trim();
        } catch (e) {
            return 'unknown';
        }
    }

    private queueLog(deploymentId: string, log: string) {
        const entry = this.logQueue.find(q => q.id === deploymentId);
        if (entry) {
            entry.logs.push(log);
        } else {
            this.logQueue.push({ id: deploymentId, logs: [log] });
        }
        logger.info(`[Deploy ${deploymentId}] ${log}`);
    }

    private async flushLogs() {
        if (this.logQueue.length === 0) return;

        const batch = [...this.logQueue];
        this.logQueue = [];

        for (const entry of batch) {
            try {
                await Deployment.findByIdAndUpdate(entry.id, {
                    $push: { logs: { $each: entry.logs } }
                });
            } catch (e) {
                logger.error(`[DeployManager] Failed to flush logs for ${entry.id}: ${e}`);
            }
        }
    }

    // Auto-deploy poller methods
    private startAutoDeployPollerInternal() {
        if (this.pollerInterval) {
            clearInterval(this.pollerInterval);
        }

        this.pollerInterval = setInterval(() => {
            this.checkAndDeploy().catch(e => {
                this.lastPollError = e.message;
                logger.error(`[DeployManager] Auto-deploy check failed: ${e.message}`);
            });
        }, POLL_INTERVAL_MS);

        logger.info(`[DeployManager] Auto-deploy poller started (${POLL_INTERVAL_MS}ms interval)`);
    }

    private async checkAndDeploy() {
        if (!this.pollerEnabled) return;

        this.pollCount++;
        this.lastPollTime = new Date();
        this.pollerActive = true;

        // NEW: Check if there are local unpushed/uncommited changes
        try {
            const status = await this.runCommand('git', ['status', '--short'], PROJECT_ROOT, 10000);
            if (status.trim()) {
                logger.warn(`[DeployManager] Detected local changes. Skipping auto-deploy to avoid data loss from git fetch/reset.`);
                this.pollerActive = false;
                return;
            }
        } catch (e: any) {
            logger.error(`[DeployManager] Git status check failed: ${e.message}`);
        }

        const localCommit = await this.getCurrentCommit();
        const remoteCommit = await this.getRemoteCommit();

        this.lastLocalCommit = localCommit;
        this.lastRemoteCommit = remoteCommit;

        if (localCommit !== remoteCommit && remoteCommit !== 'unknown') {
            logger.info(`[DeployManager] New commits detected: ${localCommit} -> ${remoteCommit}`);

            if (this.currentDeploymentId) {
                logger.warn(`[DeployManager] Deployment already in progress, skipping auto-deploy`);
                return;
            }

            await this.startDeploy('webhook', remoteCommit);
        }

        this.pollerActive = false;
    }

    stopAutoDeployPoller() {
        this.pollerEnabled = false;
        if (this.pollerInterval) {
            clearInterval(this.pollerInterval);
            this.pollerInterval = null;
        }
        logger.info('[DeployManager] Auto-deploy poller stopped');
    }

    enableAutoDeployPoller() {
        this.pollerEnabled = true;
        if (!this.pollerInterval) {
            this.startAutoDeployPollerInternal();
        }
    }

    getPollerStatus() {
        return {
            enabled: this.pollerEnabled,
            active: this.pollerActive,
            pollCount: this.pollCount,
            lastPollTime: this.lastPollTime,
            lastPollError: this.lastPollError,
            intervalMs: POLL_INTERVAL_MS,
            lastLocalCommit: this.lastLocalCommit,
            lastRemoteCommit: this.lastRemoteCommit
        };
    }

    // Public API methods
    async getDeployments(limit = 20) {
        return Deployment.find().sort({ startTime: -1 }).limit(limit);
    }

    async getDeployment(id: string) {
        return Deployment.findById(id);
    }

    getCurrentDeploymentId() {
        return this.currentDeploymentId;
    }

    isDeploying() {
        return !!this.currentDeploymentId;
    }
}

export const deployManager = DeployManager.getInstance();
