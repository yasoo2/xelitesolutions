import { spawn } from 'child_process';
import express from 'express';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.DEPLOY_PORT || 9090;
const PROJECT_PATH = '/root/xelitesolutions';
const API_PATH = `${PROJECT_PATH}/api`;

// Simple health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'deploy-helper' });
});

// Deploy endpoint - uses spawn to avoid ENOENT
app.post('/deploy', async (req, res) => {
    logger.info('[DeployHelper] Deployment triggered');

    // Respond immediately
    res.json({ message: 'Deployment started', timestamp: new Date().toISOString() });

    // Run deployment in background
    setTimeout(() => runDeployment(), 100);
});

async function runDeployment() {
    try {
        logger.info('[DeployHelper] Starting deployment...');

        // 1. Update code
        await runCommand('git', ['fetch', 'origin', 'main'], PROJECT_PATH);
        await runCommand('git', ['reset', '--hard', 'origin/main'], PROJECT_PATH);
        logger.info('[DeployHelper] Code updated');

        // 2. Build API
        await runCommand('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], API_PATH);
        await runCommand('npx', ['tsc', '--skipLibCheck'], API_PATH);
        logger.info('[DeployHelper] API built');

        // 3. Restart main API
        await runCommand('pkill', ['-f', 'node.*dist/index.js'], PROJECT_PATH);
        await new Promise(r => setTimeout(r, 3000));

        const child = spawn('node', ['dist/index.js'], {
            cwd: API_PATH,
            env: { ...process.env, NODE_ENV: 'production' },
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        logger.info('[DeployHelper] Main API restarted');

    } catch (error: any) {
        logger.error(`[DeployHelper] Deployment failed: ${error.message}`);
    }
}

function runCommand(command: string, args: string[], cwd: string): Promise<string> {
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

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(stdout);
            } else {
                reject(new Error(stderr || stdout));
            }
        });

        child.on('error', (error) => {
            reject(error);
        });
    });
}

app.listen(PORT, () => {
    logger.info(`[DeployHelper] Running on port ${PORT}`);
});
