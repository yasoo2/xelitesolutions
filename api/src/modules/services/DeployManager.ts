
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
        this.startAutoDeployPollerInternal();
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

        const result = await ExecutionGateway.execute(fullCommand, [], {
            cwd,
            timeout: timeoutMs,
            shell: true,
            env: {
                ...process.env,
                PATH: `${process.env.PATH}${path.delimiter}${path.join(PROJECT_ROOT, 'node_modules', '.bin')}${path.delimiter}/usr/local/bin${path.delimiter}/usr/bin${path.delimiter}/bin`
            }
        });

        if (result.ok) {
            if (deploymentId && result.output) {
                result.output.split('\n').forEach(line => {
                    if (line.trim()) this.queueLog(deploymentId, `    > ${line.trim()}`, true);
                });
            }
            return result.output || '';
        } else {
            if (deploymentId && result.error) this.queueLog(deploymentId, `    [ERROR] ${result.error.trim()}`, true);
            throw new Error(`Command failed: ${result.error || 'Unknown error'}`);
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

        // Use ExecutionEngine instead of direct spawn
        await executionEngine.run('node dist/index.js', {
            cwd: API_DIR,
            env: { ...process.env, NODE_ENV: 'production' },
            detached: true,
            stdio: 'ignore'
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

    private async getCurrentCommit(): Promise<string> {
        try {
            const result = await this.runCommand('git', ['rev-parse', 'HEAD'], PROJECT_ROOT, 10000);
            return result.trim();
        } catch (e) { return 'unknown'; }
    }

    private async getRemoteCommit(): Promise<string> {
        try {
            await this.runCommand('git', ['fetch', 'origin', 'main'], PROJECT_ROOT, 30000);
            const result = await this.runCommand('git', ['rev-parse', 'origin/main'], PROJECT_ROOT, 10000);
            return result.trim();
        } catch (e) { return 'unknown'; }
    }

    private queueLog(deploymentId: string, log: string, silentTerminal = false) {
        const entry = this.logQueue.find(q => q.id === deploymentId);
        if (entry) entry.logs.push(log);
        else this.logQueue.push({ id: deploymentId, logs: [log] });

        if (!silentTerminal) {
            const shortId = deploymentId.substring(0, 8);
            logger.info(`[Deploy ${shortId}] ${log}`);
        }
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
        if (this.pollerInterval) clearInterval(this.pollerInterval);
        this.pollerInterval = setInterval(() => {
            this.checkAndDeploy().catch(e => {
                this.lastPollError = e.message;
                logger.error(`[DeployManager] Auto-deploy failed: ${e.message}`);
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
            const status = await this.runCommand('git', ['status', '--short'], PROJECT_ROOT, 10000);
            if (status.trim()) {
                this.pollerActive = false;
                return;
            }
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
        const deployment = new Deployment({ trigger, commitHash, status: 'started', startTime: new Date() });
        await deployment.save();
        const id = deployment._id.toString();
        this.currentDeploymentId = id;
        
        // Non-blocking deployment start
        this.executeDeploymentFlow(id, commitHash).catch(e => {
            logger.error(`[DeployManager] Critical deployment error: ${e.message}`);
        });

        return id;
    }

    private async executeDeploymentFlow(id: string, commitHash: string) {
        try {
            this.queueLog(id, `[SYSTEM] Starting deployment for commit ${commitHash}`);
            await this.runCommand('git', ['pull', 'origin', 'main'], PROJECT_ROOT, 60000, id);
            await this.runCommand('npm', ['install', '--legacy-peer-deps'], API_DIR, 300000, id);
            await this.runCommand('npm', ['run', 'build'], API_DIR, 300000, id);
            await this.restartAPIServer();
            await this.verifyHealth();
            
            await Deployment.findByIdAndUpdate(id, { status: 'success', endTime: new Date() });
            this.queueLog(id, `[SUCCESS] Deployment ${id} completed successfully`);
            shadow.writeFileSync(STABLE_COMMIT_FILE, commitHash);
        } catch (e: any) {
            await Deployment.findByIdAndUpdate(id, { status: 'failed', endTime: new Date(), error: e.message });
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
