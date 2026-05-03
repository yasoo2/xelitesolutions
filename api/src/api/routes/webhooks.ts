import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { logger } from '../../shared/utils/logger';
import { broadcast } from '../ws';

const router = Router();
const PROJECT_PATH = '/root/xelitesolutions';
const API_PATH = `${PROJECT_PATH}/api`;

// Track deployment status
let isDeploying = false;

/**
 * FIXED Webhook Handler - Uses spawn directly, no exec()
 */
router.post('/deploy', async (req: Request, res: Response) => {
    try {
        const commit = req.body.after || req.body.head_commit?.id || 'unknown';
        const ref = req.body.ref || 'unknown';

        logger.info(`[Webhook] Received push for ${ref}, commit: ${commit}`);

        // Only deploy main branch
        if (!ref.includes('main')) {
            return res.status(200).json({ message: 'Ignored - not main branch', ref });
        }

        // Check if already deploying
        if (isDeploying) {
            return res.status(202).json({ message: 'Deployment already in progress', commit });
        }

        // Respond immediately
        res.status(202).json({ 
            message: 'Deployment started', 
            commit,
            timestamp: new Date().toISOString()
        });

        // Run deployment in background
        isDeploying = true;
        runDeployment(commit).finally(() => {
            isDeploying = false;
        });

    } catch (error: any) {
        logger.error(`[Webhook] Error: ${error.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        }
    }
});

async function runDeployment(commit: string) {
    const deploymentId = Date.now().toString();

    try {
        logger.info(`[Deploy ${deploymentId}] Starting deployment for ${commit}`);
        broadcast({ type: 'deployment_started', data: { deploymentId, commit } });

        // Step 1: Update code
        logger.info(`[Deploy ${deploymentId}] Updating code...`);
        await runSpawn('git', ['config', '--global', '--add', 'safe.directory', PROJECT_PATH], PROJECT_PATH);
        await runSpawn('git', ['fetch', 'origin', 'main'], PROJECT_PATH);
        await runSpawn('git', ['reset', '--hard', 'origin/main'], PROJECT_PATH);
        logger.info(`[Deploy ${deploymentId}] Code updated`);

        // Step 2: Build web (optional)
        logger.info(`[Deploy ${deploymentId}] Building web...`);
        try {
            await runSpawn('npm', ['install', '--legacy-peer-deps'], `${PROJECT_PATH}/web`, 300000);
            await runSpawn('npm', ['run', 'build'], `${PROJECT_PATH}/web`, 300000);
            logger.info(`[Deploy ${deploymentId}] Web built`);
        } catch (e: any) {
            logger.warn(`[Deploy ${deploymentId}] Web build failed: ${e.message}`);
        }

        // Step 3: Build API
        logger.info(`[Deploy ${deploymentId}] Building API...`);
        await runSpawn('rm', ['-rf', 'node_modules', 'package-lock.json'], API_PATH);
        await runSpawn('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], API_PATH, 300000);

        try {
            await runSpawn('npm', ['run', 'build'], API_PATH, 300000);
        } catch (e: any) {
            logger.warn(`[Deploy ${deploymentId}] npm build failed, trying tsc...`);
            await runSpawn('npx', ['tsc', '--skipLibCheck'], API_PATH, 300000);
        }
        logger.info(`[Deploy ${deploymentId}] API built`);

        // Step 4: Restart server
        logger.info(`[Deploy ${deploymentId}] Restarting server...`);
        if (process.platform === 'linux') {
            try {
                await runSpawn('systemctl', ['restart', 'joe-api.service'], PROJECT_PATH, 30000);
                logger.info(`[Deploy ${deploymentId}] Server restarted via systemctl`);
            } catch (e: any) {
                logger.error(`[Deploy ${deploymentId}] systemctl restart failed: ${e.message}. Falling back to manual.`);
                
                try {
                    await runSpawn('pkill', ['-f', 'node.*dist/index.js'], PROJECT_PATH, 10000);
                } catch (e) { }
                await new Promise(r => setTimeout(r, 3000));

                const child = spawn('node', ['dist/index.js'], {
                    cwd: API_PATH,
                    env: { ...process.env, NODE_ENV: 'production', PORT: '8080' },
                    detached: true,
                    stdio: 'ignore'
                });
                child.unref();
                logger.info(`[Deploy ${deploymentId}] Server restarted via spawn with PID: ${child.pid}`);
            }
        } else {
            try {
                await runSpawn('pkill', ['-f', 'node.*dist/index.js'], PROJECT_PATH, 10000);
            } catch (e) { }
            await new Promise(r => setTimeout(r, 3000));

            const child = spawn('node', ['dist/index.js'], {
                cwd: API_PATH,
                env: { ...process.env, NODE_ENV: 'production', PORT: '8080' },
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            logger.info(`[Deploy ${deploymentId}] Server restarted via spawn with PID: ${child.pid}`);
        }

        // Step 5: Health check
        await new Promise(r => setTimeout(r, 5000));
        let healthy = false;
        for (let i = 0; i < 5; i++) {
            try {
                const response = await fetch('http://localhost:8080/api/health');
                if (response.ok) {
                    healthy = true;
                    break;
                }
            } catch (e) {
                // Retry
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        if (healthy) {
            logger.info(`[Deploy ${deploymentId}] ✅ Deployment successful!`);
            broadcast({ type: 'deployment_completed', data: { deploymentId, commit, status: 'success' } });
        } else {
            throw new Error('Health check failed');
        }

    } catch (error: any) {
        logger.error(`[Deploy ${deploymentId}] ❌ Deployment failed: ${error.message}`);
        broadcast({ type: 'deployment_failed', data: { deploymentId, commit, error: error.message } });
    }
}

function runSpawn(command: string, args: string[], cwd: string, timeoutMs = 120000): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            env: { 
                ...process.env, 
                PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v20/bin'
            }
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

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        child.on('error', (error) => {
            clearTimeout(timeout);
            if (!killed) {
                reject(new Error(`Spawn error: ${error.message}`));
            }
        });

        child.on('close', (code) => {
            clearTimeout(timeout);
            if (killed) return;

            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
            }
        });
    });
}

// Status endpoint
router.get('/deploy/status', (req, res) => {
    res.json({
        isDeploying,
        timestamp: new Date().toISOString()
    });
});

// Manual trigger
router.post('/deploy/trigger', async (req, res) => {
    if (isDeploying) {
        return res.status(409).json({ error: 'Deployment already in progress' });
    }

    res.json({ message: 'Manual deployment started' });

    isDeploying = true;
    runDeployment('manual').finally(() => {
        isDeploying = false;
    });
});

export default router;
