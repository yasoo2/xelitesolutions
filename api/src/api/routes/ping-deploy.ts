import { Router, Request, Response } from 'express';
import { ExecutionGateway } from '../../kernel/ExecutionGateway';
import { logger } from '../../shared/utils/logger';

const router = Router();
const PROJECT_PATH = '/root/xelitesolutions';
const API_PATH = `${PROJECT_PATH}/api`;

let isUpdating = false;

async function runCommand(command: string, args: string[], cwd: string): Promise<string> {
    const result = await ExecutionGateway.execute(command, args, { 
        cwd,
        env: { 
            ...process.env, 
            PATH: '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v20/bin'
        }
    });
    if (result.ok) return result.output || '';
    throw new Error(result.error || result.output || 'Command failed');
}

/**
 * Ping-trigger deployment - Can be called from external services
 * GET /ping-deploy - Check and deploy if needed
 */
router.get('/ping-deploy', async (req: Request, res: Response) => {
    try {
        // Get current commits
        const localCommit = await runCommand('git', ['rev-parse', 'HEAD'], PROJECT_PATH);
        await runCommand('git', ['fetch', 'origin', 'main'], PROJECT_PATH);
        const remoteCommit = await runCommand('git', ['rev-parse', 'origin/main'], PROJECT_PATH);

        const local = localCommit.trim();
        const remote = remoteCommit.trim();

        if (local === remote) {
            return res.json({
                status: 'up-to-date',
                commit: local,
                message: 'Already on latest version'
            });
        }

        if (isUpdating) {
            return res.json({
                status: 'updating',
                message: 'Update already in progress'
            });
        }

        // Start update in background
        isUpdating = true;
        res.json({
            status: 'started',
            from: local,
            to: remote,
            message: 'Update started'
        });

        performUpdate(remote).finally(() => {
            isUpdating = false;
        });

    } catch (error: any) {
        logger.error(`[PingDeploy] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

async function performUpdate(targetCommit: string) {
    try {
        logger.info(`[PingDeploy] Updating to ${targetCommit}`);

        // Update code
        await runCommand('git', ['reset', '--hard', 'origin/main'], PROJECT_PATH);
        logger.info('[PingDeploy] Code updated');

        // Build
        await runCommand('npm', ['install', '--legacy-peer-deps', '--no-audit', '--no-fund'], API_PATH);
        await runCommand('npx', ['tsc', '--skipLibCheck'], API_PATH);
        logger.info('[PingDeploy] Build complete');

        // Restart
        if (process.platform === 'linux') {
            try {
                await runCommand('systemctl', ['restart', 'joe-api.service'], PROJECT_PATH);
                logger.info('[PingDeploy] Server restarted via systemctl');
                return;
            } catch (e: any) {
                logger.error(`[PingDeploy] systemctl restart failed: ${e.message}. Falling back to manual.`);
            }
        }

        await runCommand('pkill', ['-f', 'node.*dist/index.js'], PROJECT_PATH);
        await new Promise(r => setTimeout(r, 3000));

        // Use Gateway for detached restart
        await ExecutionGateway.execute('node', ['dist/index.js'], {
            cwd: API_PATH,
            env: { ...process.env, NODE_ENV: 'production' },
            detached: true,
            stdio: 'ignore'
        });

        logger.info(`[PingDeploy] Server restart requested via Gateway`);

    } catch (error: any) {
        logger.error(`[PingDeploy] Update failed: ${error.message}`);
    }
}

export default router;
