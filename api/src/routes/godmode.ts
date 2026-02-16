/**
 * God Mode Routes - Autonomous Building Endpoints
 * 
 * Exposes the GodModeAgent for autonomous project building
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { GodModeAgent } from '../agents/GodModeAgent';
import { broadcast } from '../ws';

const router = Router();

/**
 * POST /api/godmode/build
 * 
 * Start an autonomous build that runs until success
 * 
 * Body:
 *   - request: string (what to build)
 *   - sessionId?: string
 *   - workspaceId?: string
 *   - outputDir?: string (default: /tmp/godmode-builds/{timestamp})
 *   - maxIterations?: number (default: 100)
 */
router.post('/build', async (req: Request, res: Response) => {
    const { request, sessionId, workspaceId, outputDir, maxIterations } = req.body;

    if (!request || typeof request !== 'string') {
        return res.status(400).json({ error: 'Missing required field: request' });
    }

    // Create output directory
    const timestamp = Date.now();
    const buildDir = outputDir || path.join('/tmp', 'godmode-builds', `build-${timestamp}`);

    try {
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
    } catch (e: any) {
        return res.status(500).json({ error: `Cannot create build directory: ${e.message}` });
    }

    // Broadcast start event
    if (sessionId) {
        broadcast({
            type: 'godmode_started',
            data: {
                request,
                buildDir,
                timestamp: new Date().toISOString()
            },
            runId: sessionId
        });
    }

    // Start build (async - returns immediately with job info)
    const agent = new GodModeAgent();
    const jobId = `godmode-${timestamp}`;

    // Fire and forget - the build continues in background
    agent.buildUntilSuccess(request, buildDir, {
        maxIterations: maxIterations || 100,
        sessionId,
        workspaceId
    }).then(result => {
        console.log(`[GodMode] Job ${jobId} completed:`, result.success ? 'SUCCESS' : 'FAILED');

        if (sessionId) {
            broadcast({
                type: 'godmode_completed',
                data: {
                    jobId,
                    success: result.success,
                    iterations: result.totalIterations,
                    completedTasks: result.completedTasks,
                    failedTasks: result.failedTasks,
                    error: result.finalError
                },
                runId: sessionId
            });
        }
    }).catch(err => {
        console.error(`[GodMode] Job ${jobId} error:`, err);

        if (sessionId) {
            broadcast({
                type: 'godmode_error',
                data: {
                    jobId,
                    error: err.message
                },
                runId: sessionId
            });
        }
    });

    // Return job info immediately
    return res.json({
        ok: true,
        jobId,
        buildDir,
        status: 'started',
        message: 'God Mode build started. The build will continue autonomously until success.',
        ws: sessionId ? `Subscribe to sessionId ${sessionId} for updates` : 'No sessionId provided for live updates'
    });
});

/**
 * POST /api/godmode/build-sync
 * 
 * Synchronous version - waits for build to complete
 * WARNING: This can take a long time!
 */
router.post('/build-sync', async (req: Request, res: Response) => {
    const { request, sessionId, workspaceId, outputDir, maxIterations } = req.body;

    if (!request || typeof request !== 'string') {
        return res.status(400).json({ error: 'Missing required field: request' });
    }

    const timestamp = Date.now();
    const buildDir = outputDir || path.join('/tmp', 'godmode-builds', `build-${timestamp}`);

    try {
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
    } catch (e: any) {
        return res.status(500).json({ error: `Cannot create build directory: ${e.message}` });
    }

    console.log(`[GodMode] Starting synchronous build: "${request}"`);

    const agent = new GodModeAgent();

    try {
        const result = await agent.buildUntilSuccess(request, buildDir, {
            maxIterations: maxIterations || 100,
            sessionId,
            workspaceId
        });

        return res.json({
            ok: result.success,
            buildDir,
            iterations: result.totalIterations,
            completedTasks: result.completedTasks,
            failedTasks: result.failedTasks,
            error: result.finalError,
            logs: result.logs.slice(-50)  // Last 50 log lines
        });
    } catch (err: any) {
        return res.status(500).json({
            ok: false,
            error: err.message,
            buildDir
        });
    }
});

/**
 * POST /api/godmode/simple-build
 * 
 * Simple version using buildSystem (legacy)
 */
router.post('/simple-build', async (req: Request, res: Response) => {
    const { request, outputDir } = req.body;

    if (!request) {
        return res.status(400).json({ error: 'Missing request' });
    }

    const buildDir = outputDir || path.join('/tmp', 'godmode-builds', `simple-${Date.now()}`);

    try {
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir, { recursive: true });
        }
    } catch (e: any) {
        return res.status(500).json({ error: `Cannot create build directory: ${e.message}` });
    }

    const agent = new GodModeAgent();

    try {
        const result = await agent.buildSystem(request, buildDir);
        return res.json({ ok: true, ...result, buildDir });
    } catch (err: any) {
        return res.status(500).json({ ok: false, error: err.message, buildDir });
    }
});

/**
 * GET /api/godmode/health
 * 
 * Check if God Mode is operational
 */
router.get('/health', (req: Request, res: Response) => {
    return res.json({
        ok: true,
        status: 'operational',
        version: '1.0.0',
        capabilities: [
            'autonomous-build',
            'self-healing (wolverine)',
            'exponential-backoff',
            'checkpointing',
            'circuit-breaker'
        ],
        timestamp: new Date().toISOString()
    });
});

export default router;
