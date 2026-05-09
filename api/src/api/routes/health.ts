/**
 * Health Check Routes
 * Provides health, readiness, and liveness endpoints for monitoring
 */

import express from 'express';

const router = express.Router();

// Simple in-memory rate limiter for health checks
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute

function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let record = rateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitMap.set(ip, record);
  }

  record.count++;

  if (record.count > RATE_LIMIT_MAX) {
    return res.status(429).json({
      status: 'error',
      message: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  next();
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

/**
 * Basic health check - always returns 200 if server is running
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    cpu: process.cpuUsage(),
    version: (() => {
        try {
            const fs = require('fs');
            const path = require('path');
            const stableFile = path.join(process.cwd(), '..', 'last_stable_commit');
            if (fs.existsSync(stableFile)) {
                return fs.readFileSync(stableFile, 'utf8').trim();
            }
            return 'unknown';
        } catch {
            return 'error';
        }
    })()
});

/**
 * Readiness check - checks if app is ready to serve traffic
 * Checks dependencies like database, external APIs, etc.
 * 
 * Note: Filesystem access is intentional for health check validation.
 * Rate limiting is applied to prevent abuse (60 req/min).
 */
router.get('/ready', rateLimit, async (req, res) => {
  const checks: any = {
    server: 'ok',
    timestamp: new Date().toISOString()
  };

  let isReady = true;

  // Check database connection (if MongoDB is used)
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) {
      checks.database = 'connected';
    } else {
      checks.database = 'disconnected';
      // In offline/local mode, DB is not strictly required.
      if (process.env.OFFLINE_MODE !== 'true' && process.env.PERSISTENCE_MODE !== 'JSON') {
        isReady = false;
      }
    }
  } catch (error) {
    checks.database = 'not configured';
  }

  // Check file system access
  try {
    const fs = require('fs');
    const path = require('path');
    const testPath = path.join(process.cwd(), '.health-check');
    fs.writeFileSync(testPath, Date.now().toString());
    fs.unlinkSync(testPath);
    checks.filesystem = 'ok';
  } catch (error: any) {
    checks.filesystem = `error: ${error.message}`;
    isReady = false;
  }

  if (isReady) {
    res.status(200).json({ status: 'ready', checks });
  } else {
    res.status(503).json({ status: 'not ready', checks });
  }
});

/**
 * Liveness check - checks if app is alive (for Kubernetes probes)
 */
router.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString()
  });
});

/**
 * Startup check - checks if app has completed initialization
 */
router.get('/startup', (req, res) => {
  // Can add more sophisticated startup checks here
  const startupTime = process.uptime();
  const isStarted = startupTime > 5; // Consider started after 5 seconds

  if (isStarted) {
    res.status(200).json({
      status: 'started',
      uptime: startupTime,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(503).json({
      status: 'starting',
      uptime: startupTime,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
