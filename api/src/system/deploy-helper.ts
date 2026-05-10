
import express from 'express';
import { logger } from '../shared/utils/logger';
import { executionEngine } from '../kernel/ExecutionEngine';
import path from 'path';

const app = express();
const PORT = process.env.DEPLOY_PORT || 9090;
const PROJECT_PATH = process.env.PROJECT_ROOT || '/root/xelitesolutions';
const API_PATH = path.join(PROJECT_PATH, 'api');

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'deploy-helper' });
});

app.post('/deploy', async (req, res) => {
    logger.info('[DeployHelper] Deployment triggered');
    res.json({ message: 'Deployment started', timestamp: new Date().toISOString() });
    setTimeout(() => runDeployment(), 100);
});

async function runDeployment() {
    try {
        logger.info('[DeployHelper] Starting deployment flow...');

        // 1. Update code
        await executionEngine.run('git fetch origin main', { cwd: PROJECT_PATH });
        await executionEngine.run('git reset --hard origin/main', { cwd: PROJECT_PATH });
        logger.info('[DeployHelper] Code updated');

        // 2. Build API
        await executionEngine.run('npm install --legacy-peer-deps --no-audit --no-fund', { cwd: API_PATH });
        await executionEngine.run('npm run build', { cwd: API_PATH });
        logger.info('[DeployHelper] API built');

        // 3. Restart main API
        if (process.platform === 'linux') {
            try {
                await executionEngine.run('sudo systemctl restart joe-api.service', { cwd: PROJECT_PATH });
                logger.info('[DeployHelper] Main API restarted via systemctl');
                return;
            } catch (e: any) {
                logger.error(`[DeployHelper] systemctl restart failed: ${e.message}`);
            }
        }

        await executionEngine.run('pkill -f "node.*dist/index.js"', { cwd: PROJECT_PATH });
        await new Promise(r => setTimeout(r, 3000));

        await executionEngine.run('node dist/index.js', {
            cwd: API_PATH,
            env: { ...process.env, NODE_ENV: 'production' },
            detached: true,
            stdio: 'ignore'
        });

        logger.info('[DeployHelper] Main API restarted via ExecutionEngine');

    } catch (error: any) {
        logger.error(`[DeployHelper] Deployment failed: ${error.message}`);
    }
}

app.listen(PORT, () => {
    logger.info(`[DeployHelper] Running on port ${PORT}`);
});
