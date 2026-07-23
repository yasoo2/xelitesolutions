
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import mongoose from 'mongoose';
import os from 'os';
import { Deployment } from '../../shared/models/deployment';
import { logger } from '../../shared/utils/logger';
import { broadcast } from '../../api/ws';
import axios from 'axios';
import { alertService } from './AlertService';
import shadow from 'fs';
import path from 'path';
import { executionEngine } from '../../kernel/ExecutionEngine';
import { executionFirewall } from '../../orchestration/AgentExecutionFirewall';

const fs = shadow.promises;
const STABLE_COMMIT_FILE = './last_stable_commit';

const defaultRoot = process.cwd().endsWith('/api') ? path.resolve(process.cwd(), '..') : process.cwd();
const PROJECT_ROOT = process.env.PROJECT_ROOT || defaultRoot;
const API_DIR = process.env.API_DIR || path.join(PROJECT_ROOT, 'api');
const WEB_DIR = process.env.WEB_DIR || path.join(PROJECT_ROOT, 'web');
const POLL_INTERVAL_MS = Math.max(10000, Number(process.env.DEPLOY_POLL_INTERVAL_MS) || 60000);

export class DeployManager {
    private static instance: DeployManager;
    private pollerInterval: NodeJS.Timeout | null = null;
    private currentDeploymentId: string | null = null;
    private pollerEnabled: boolean = true;
    private pollerActive: boolean = false;
    private pollCount: number = 0;
    private lastPollTime: Date | null = null;
    private lastPollError: string | null = null;
    private lastLocalCommit: string | null = null;
    private lastRemoteCommit: string | null = null;
    private logQueue: { id: string, logs: string[] }[] = [];
    private lastDeployFinishTime: number | null = null;

    private constructor() {
        this.setupSafeDirectory().catch(err => {
            logger.error(`[DeployManager] Failed to setup safe.directory: ${err.message}`);
        });
        this.startAutoDeployPollerInternal();
    }

    private async setupSafeDirectory() {
        try {
            // Clean up duplicates and set wildcard safely using quotes to prevent shell expansion
            await this.runCommand('git', ['config', '--global', '--replace-all', 'safe.directory', "'*'"], PROJECT_ROOT);
            // Also explicitly add the project root paths as backups
            await this.runCommand('git', ['config', '--global', '--add', 'safe.directory', PROJECT_ROOT], PROJECT_ROOT);
            await this.runCommand('git', ['config', '--global', '--add', 'safe.directory', '/root/xelitesolutions'], PROJECT_ROOT);
            logger.info('[DeployManager] Added safe.directory exceptions for git successfully.');
        } catch (e: any) {
            logger.warn(`[DeployManager] safe.directory setup warning: ${e.message}`);
        }
    }

    public static getInstance(): DeployManager {
        if (!DeployManager.instance) {
            DeployManager.instance = new DeployManager();
        }
        return DeployManager.instance;
    }

    private async runCommand(command: string, args: string[], cwd: string, timeoutMs = 120000, deploymentId?: string): Promise<string> {
        const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
        if (deploymentId) this.queueLog(deploymentId, `[EXEC] ${fullCommand}`);

        const result = await executionFirewall.runAsSystem(async () => {
            return await ExecutionGateway.execute({
                id: deploymentId || 'deploy_' + Date.now(),
                type: 'shell',
                payload: {
                    command: fullCommand,
                    options: {
                        cwd,
                        timeout: timeoutMs,
                        shell: true,
                        env: {
                            ...process.env,
                            GIT_TERMINAL_PROMPT: '0',
                            PATH: [
                                process.env.PATH,
                                path.join(API_DIR, 'node_modules', '.bin'),
                                path.join(WEB_DIR, 'node_modules', '.bin'),
                                path.join(PROJECT_ROOT, 'node_modules', '.bin'),
                                '/usr/local/bin',
                                '/usr/bin',
                                '/bin'
                            ].join(path.delimiter)
                        }
                    }
                },
                priority: 'high'
            });
        });

        if (result.success && result.data?.ok !== false) {
            const output = (result.data?.output || '') + (result.data?.error ? '\n' + result.data.error : '');
            if (deploymentId && output) {
                output.split('\n').forEach(line => {
                    if (line.trim()) this.queueLog(deploymentId, `    > ${line.trim()}`, true);
                });
            }
            return output;
        } else {
            const error = result.error || result.data?.error || 'Unknown error';
            if (deploymentId) this.queueLog(deploymentId, `    [ERROR] ${error.trim()}`, true);
            throw new Error(`Command failed: ${error}`);
        }
    }

    private async restartAPIServer() {
        if (process.platform === 'linux') {
            try {
                logger.info('[DeployManager] Restarting joe-api.service via sudo systemctl...');
                await this.runCommand('sudo', ['systemctl', 'restart', 'joe-api.service'], PROJECT_ROOT, 30000);
                return;
            } catch (e: any) {
                logger.error(`[DeployManager] systemctl restart failed: ${e.message}. Trying self-exit fallback...`);
                setTimeout(() => {
                    logger.info('[DeployManager] Self-exiting for automatic PM2/Docker restart...');
                    process.exit(0);
                }, 1000);
                return;
            }
        }

        try { await this.runCommand('pkill', ['-f', 'node.*dist/index.js'], PROJECT_ROOT, 10000); } catch (e) { }

        // Use Unified Execution Engine Contract
        await executionEngine.execute({
            id: 'api_restart',
            type: 'shell',
            payload: {
                command: 'node dist/index.js',
                options: {
                    cwd: API_DIR,
                    env: { ...process.env, NODE_ENV: 'production' },
                    detached: true,
                    stdio: 'ignore'
                }
            },
            priority: 'high'
        });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    private async verifyHealth(retries = 5): Promise<void> {
        const port = process.env.PORT || 8080;
        const API_URL = process.env.API_URL || `http://127.0.0.1:${port}`;
        for (let i = 0; i < retries; i++) {
            try {
                const response = await axios.get(`${API_URL}/api/health`, { timeout: 5000 });
                if (response.status !== 200) throw new Error(`API health returned ${response.status}`);
                return;
            } catch (e: any) {
                logger.warn(`[DeployManager] Health check attempt ${i + 1} failed: ${e.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        throw new Error('Health check failed after ' + retries + ' attempts.');
    }

    private async getDiskInfo(): Promise<{ free: number }> {
        return { free: 1024 * 1024 * 1024 };
    }

    private async attemptRollback() {
        try {
            if (shadow.existsSync(STABLE_COMMIT_FILE)) {
                const stableCommit = shadow.readFileSync(STABLE_COMMIT_FILE, 'utf8').trim();
                logger.info(`[DeployManager] Rolling back to: ${stableCommit}`);
                await this.runCommand('git', ['reset', '--hard', stableCommit], PROJECT_ROOT);
                await this.runCommand('npm', ['install', '--legacy-peer-deps'], API_DIR, 300000);
                await this.runCommand('npm', ['run', 'build'], API_DIR, 300000);
                await this.restartAPIServer();
            }
        } catch (e: any) {
            logger.error(`[DeployManager] Rollback failed: ${e.message}`);
        }
    }

    /**
     * Public rollback: redeploy the commit of a previous deployment.
     * @param deploymentId The _id of the past deployment to roll back to.
     * @returns The id of the new (rollback) deployment.
     */
    public async rollback(deploymentId: string): Promise<string> {
        const target: any = await Deployment.findById(deploymentId).lean();
        if (!target || !target.commit) {
            throw new Error(`Deployment ${deploymentId} not found or has no commit to roll back to`);
        }
        logger.info(`[DeployManager] Manual rollback requested to commit ${target.commit} (from deployment ${deploymentId})`);
        return await this.startDeploy('rollback', target.commit);
    }

    public async getCurrentCommit(): Promise<string> {
        return new Promise((resolve) => {
            executionFirewall.runAsSystem(async () => {
                try {
                    const result = await this.runCommand('git', ['rev-parse', 'HEAD'], PROJECT_ROOT, 10000);
                    resolve(result.trim());
                } catch (e) { resolve('unknown'); }
            });
        });
    }

    private async getRemoteCommit(): Promise<string> {
        try {
            await this.runCommand('git', ['fetch', 'origin', 'main'], PROJECT_ROOT, 30000);
            const result = await this.runCommand('git', ['rev-parse', 'origin/main'], PROJECT_ROOT, 10000);
            return result.trim();
        } catch (e) { return 'unknown'; }
    }

    private broadcastStatus(id: string, status: string) {
        broadcast({
            type: 'admin:deploy_status',
            data: { _id: id, status }
        });
    }

    private queueLog(deploymentId: string, log: string, silentTerminal = false) {
        const entry = this.logQueue.find(q => q.id === deploymentId);
        if (entry) entry.logs.push(log);
        else this.logQueue.push({ id: deploymentId, logs: [log] });

        if (!silentTerminal) {
            const shortId = deploymentId.substring(0, 8);
            logger.info(`[Deploy ${shortId}] ${log}`);
            broadcast({
                type: 'admin:deploy_log',
                data: { deploymentId: deploymentId, log, ts: Date.now() }
            });
        }
        
        // Immediately persist log to DB to prevent loss if process crashes or restarts
        Deployment.findByIdAndUpdate(deploymentId, { $push: { logs: log } }).catch(() => {});
    }

    private async flushLogs() {
        if (this.logQueue.length === 0) return;
        const batch = [...this.logQueue];
        this.logQueue = [];
        for (const entry of batch) {
            try {
                await Deployment.findByIdAndUpdate(entry.id, { $push: { logs: { $each: entry.logs } } });
            } catch (e) { logger.error(`[DeployManager] Log flush failed: ${e}`); }
        }
    }

    private startAutoDeployPollerInternal() {
        const offline = process.env.MOCK_DB === "1" || process.env.MOCK_DB === "true" || process.env.PERSISTENCE_MODE === "JSON" || process.env.ENABLE_AUTH_BYPASS === "true" || process.env.DISABLE_AUTO_DEPLOY === "1" || process.env.NODE_ENV !== "production";
        if (offline) { logger.info("[DeployManager] Auto-deploy poller disabled (local/offline mode)."); return; }
        if (this.pollerInterval) clearInterval(this.pollerInterval);
        this.pollerInterval = setInterval(() => {
            executionFirewall.runAsSystem(() => {
                this.checkAndDeploy().catch(e => {
                    this.lastPollError = e.message;
                    logger.error(`[DeployManager] Auto-deploy failed: ${e.message}`);
                });
            });
        }, POLL_INTERVAL_MS);
    }

    private async checkAndDeploy() {
        if (!this.pollerEnabled) return;
        const cooldownMs = 180_000;
        if (this.lastDeployFinishTime && (Date.now() - this.lastDeployFinishTime < cooldownMs)) return;

        this.pollCount++;
        this.lastPollTime = new Date();
        this.pollerActive = true;

        try {
            // Force reset any local changes and wipe untracked files so auto-deploy never gets stuck
            await this.runCommand('git', ['reset', '--hard'], PROJECT_ROOT, 10000);
            await this.runCommand('git', ['clean', '-fd'], PROJECT_ROOT, 10000);
        } catch (e: any) { }

        const localCommit = await this.getCurrentCommit();
        const remoteCommit = await this.getRemoteCommit();
        this.lastLocalCommit = localCommit;
        this.lastRemoteCommit = remoteCommit;

        if (localCommit !== remoteCommit && remoteCommit !== 'unknown') {
            if (this.currentDeploymentId) return;
            await this.startDeploy('webhook', remoteCommit);
        }
        this.pollerActive = false;
    }

    async startDeploy(trigger: string, commitHash: string): Promise<string> {
        const deployment = new Deployment({ 
            triggeredBy: trigger === 'webhook' ? 'webhook' : 'manual', 
            commit: commitHash, 
            status: 'STARTED', 
            startTime: new Date() 
        });
        await deployment.save();
        const id = deployment._id.toString();
        this.currentDeploymentId = id;
        
        // Non-blocking deployment start
        executionFirewall.runAsSystem(() => {
            this.executeDeploymentFlow(id, commitHash).catch(e => {
                logger.error(`[DeployManager] Critical deployment error: ${e.message}`);
            });
        });

        return id;
    }

    private async executeDeploymentFlow(id: string, commitHash: string) {
        try {
            this.queueLog(id, `[SYSTEM] Initiating deployment flow...`);
            
            // 1. Pull latest code (force and abort merge if any issue to prevent hangs)
            await this.runCommand('git', ['pull', 'origin', 'main', '--no-edit', '--ff-only'], PROJECT_ROOT, 60000, id);
            
            // Resolve real commit hash
            const actualCommit = await this.getCurrentCommit();
            await Deployment.findByIdAndUpdate(id, { commit: actualCommit, status: 'BUILDING' });
            this.broadcastStatus(id, 'BUILDING');
            this.queueLog(id, `[SYSTEM] Current commit resolved: ${actualCommit}`);
            
            // 2. Build API
            this.queueLog(id, `[BUILD] Building API...`);
            await this.runCommand('npm', ['install', '--legacy-peer-deps'], API_DIR, 300000, id);
            await this.runCommand('npm', ['run', 'build'], API_DIR, 300000, id);
            
            // 3. Build Web
            this.queueLog(id, `[BUILD] Building Web Frontend...`);
            await this.runCommand('npm', ['install', '--legacy-peer-deps'], WEB_DIR, 300000, id);
            await this.runCommand('npm', ['run', 'build'], WEB_DIR, 300000, id);
            
            // 4. Docker Rebuild (if on Linux/Server)
            if (process.platform === 'linux') {
                this.queueLog(id, `[DOCKER] Rebuilding joe-web image...`);
                try {
                    await this.runCommand('docker', ['build', '-t', 'joe-web', '.'], WEB_DIR, 600000, id);
                    await this.runCommand('docker', ['stop', 'joe_web'], PROJECT_ROOT, 30000, id).catch(() => {});
                    await this.runCommand('docker', ['rm', 'joe_web'], PROJECT_ROOT, 30000, id).catch(() => {});
                    await this.runCommand('docker', ['run', '-d', '--name', 'joe_web', '--network', 'joe-network', '--restart', 'always', 'joe-web'], PROJECT_ROOT, 60000, id);
                } catch (dockerErr: any) {
                    this.queueLog(id, `[WARNING] Docker rebuild failed: ${dockerErr.message}. Web may not be updated.`);
                }
            }

            // 5. Restart API
            this.queueLog(id, `[SYSTEM] Saving stable commit and preparing to restart API...`);
            const finalCommit = await this.getCurrentCommit();
            shadow.writeFileSync(path.join(PROJECT_ROOT, 'last_stable_commit'), finalCommit);
            
            // Mark as SUCCESS and flush logs BEFORE restarting since the restart will kill this process
            await Deployment.findByIdAndUpdate(id, { status: 'SUCCESS', endTime: new Date() });
            broadcast({ type: 'admin:deploy_status', data: { _id: id, status: 'SUCCESS' } });
            this.queueLog(id, `[SUCCESS] Deployment ${id} completed successfully`);
            await this.flushLogs();
            
            this.queueLog(id, `[SYSTEM] Restarting API now...`);
            await this.restartAPIServer();
            // Code below may not execute if the process is killed by systemctl
            await this.verifyHealth();
        } catch (e: any) {
            await Deployment.findByIdAndUpdate(id, { status: 'FAILED', endTime: new Date(), error: e.message });
            broadcast({ type: 'admin:deploy_status', data: { _id: id, status: 'FAILED', error: e.message } });
            this.queueLog(id, `[ERROR] Deployment ${id} failed: ${e.message}`);
            await this.attemptRollback();
        } finally {
            this.currentDeploymentId = null;
            this.lastDeployFinishTime = Date.now();
            await this.flushLogs();
        }
    }

    stopAutoDeployPoller() {
        this.pollerEnabled = false;
        if (this.pollerInterval) { clearInterval(this.pollerInterval); this.pollerInterval = null; }
    }

    enableAutoDeployPoller() {
        this.pollerEnabled = true;
        if (!this.pollerInterval) this.startAutoDeployPollerInternal();
    }

    getPollerStatus() {
        return {
            pollerEnabled: this.pollerEnabled,
            pollerActive: this.pollerActive,
            pollCount: this.pollCount,
            lastPollTime: this.lastPollTime,
            lastPollError: this.lastPollError,
            intervalMs: POLL_INTERVAL_MS,
            lastLocalCommit: this.lastLocalCommit,
            lastRemoteCommit: this.lastRemoteCommit,
            isDeploying: !!this.currentDeploymentId
        };
    }

    async getDeployments(limit = 20) { return Deployment.find().sort({ startTime: -1 }).limit(limit); }
    async getDeployment(id: string) { return Deployment.findById(id); }
    getCurrentDeploymentId() { return this.currentDeploymentId; }
    isDeploying() { return !!this.currentDeploymentId; }
}

export const deployManager = DeployManager.getInstance();
