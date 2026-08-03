import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';
import { config } from '../shared/config';

// Routes
import authRoutes from './routes/auth';
import toolsRoutes from './routes/tools';
import runRoutes from './routes/run';
import sessionsRoutes from './routes/sessions';
import foldersRoutes from './routes/folders';
import queueRoutes from './routes/queue';
import filesRoutes from './routes/files';
import { loadChatStores } from './chat-store';
import { loadJoePages, loadJoeProjects } from './page-store';
import approvalsRoutes from './routes/approvals';
import formsPublicRoutes from './routes/formsPublic';
import projectRoutes from './routes/project';
import assetsRoutes from './routes/assets';
import memoryRoutes from './routes/memory';
import knowledgeRoutes from './routes/knowledge';
import systemRoutes from './routes/system';
import providersRoutes from './routes/providers';
import packagesRoutes from './routes/packages';
import gitRoutes from './routes/git';
import githubRoutes from './routes/github';
import browserRoutes from './routes/browser';
import oauthRoutes from './routes/oauth';
import extensionRoutes from './routes/extension';
import browserAgentRoutes from './routes/browserAgent';
import statusRoutes from './routes/status';
import serverRoutes from './routes/servers';
import workspacesRoutes from './routes/workspaces';
import adminRoutes from './routes/admin';
import webhooksRoutes from './routes/webhooks';
import pingDeployRoutes from './routes/ping-deploy';
import buildRoutes from './routes/build';
import sentinelRoutes from './routes/sentinel';
import agentRoutes from './routes/agent';

import { authenticate } from './middleware/auth';

const logger =
  process.env.NODE_ENV === 'production'
    ? pino()
    : pino({
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', colorize: true },
      },
    });

function normalizeOrigin(origin: string) {
  return String(origin || '').trim().replace(/\/+$/, '');
}

export const createApp = () => {
  const app = express();
  const apiRouter = express.Router();

  // [EMERGENCY] Early Health Check
  app.get('/health', (_req, res) => res.json({ status: 'OK', uptime: process.uptime(), source: 'app' }));

  const isProd = process.env.NODE_ENV === 'production';
  const allowedOrigins = new Set<string>((config.allowedOrigins || []).map(normalizeOrigin).filter(Boolean));

  // Conversations must survive restarts — restore the JSON-mode chat
  // stores before any route can touch them.
  try { loadChatStores(); } catch { /* best-effort */ }
  // …and the built-page memory too, so «عدّل …» after an update still edits
  // the page that was on screen instead of starting a tool circus.
  try { loadJoePages(); } catch { /* best-effort */ }
  try { loadJoeProjects(); } catch { /* best-effort */ }

  // Per-request logging is morgan's job (one concise line below). The old
  // old raw-header debug line printed EVERY header of EVERY request — including
  // the user's full JWT, which then landed in every log they shared. Full
  // headers are opt-in (JOE_HTTP_DEBUG=1) and credentials are redacted
  // even then.
  if (String(process.env.JOE_HTTP_DEBUG || '') === '1') {
    app.use((req, _res, next) => {
      const h: any = { ...req.headers };
      if (h.authorization) h.authorization = '[REDACTED]';
      if (h.cookie) h.cookie = '[REDACTED]';
      console.log(`[HTTP] ${req.method} ${req.path} - Headers: ${JSON.stringify(h)}`);
      next();
    });
  }

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalized = normalizeOrigin(origin);
      if (!isProd || allowedOrigins.has(normalized)) return callback(null, true);
      logger.warn({ origin: normalized }, '[CORS] Rejected production origin');
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Worker-Key', 'x-worker-key', 'X-Workspace-Id', 'x-workspace-id'],
  }));

  // Middleware: Block API requests until DB is ready
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.path.startsWith('/api') && req.path !== '/api/health' && mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database initializing...',
        retryAfter: 5
      });
    }
    next();
  });

  app.use(express.json({ limit: '50mb' }));
  app.use(morgan('dev'));

  // [HARDENING] Global Sanitization Middleware

  // [HARDENING] Rate Limiting
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: { success: false, error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api', globalLimiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 login/guest requests per windowMs
    message: { success: false, error: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/guest', authLimiter);

  // Mount Central API Router
  app.use('/api', apiRouter);

  // Diagnostic Dashboard: never expose process.cwd() in production unless explicitly enabled.
  if (!isProd || process.env.ENABLE_DEBUG_STATIC === 'true') {
    const debugPath = process.cwd();
    app.use('/debug', express.static(debugPath));
    app.get('/debug', (_req, res) => {
      res.sendFile(path.join(debugPath, 'index.html'));
    });
  }

  apiRouter.get('/health', async (_req, res) => {
    const isMock = process.env.MOCK_DB === '1' || process.env.PERSISTENCE_MODE === 'JSON';
    let dbStatus = isMock ? 'LOCAL' : 'DOWN';
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db?.admin().ping();
        dbStatus = 'OK';
      }
    } catch (e) {
      if (!isMock) dbStatus = 'ERROR';
    }
    res.status(200).json({
      status: 'OK',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: (() => {
        try {
          const fs = require('fs');
          const path = require('path');
          const stableFile = path.join(process.cwd(), '..', 'last_stable_commit');
          if (fs.existsSync(stableFile)) {
            return fs.readFileSync(stableFile, 'utf8').trim();
          }
          return 'no-commit-file';
        } catch {
          return 'unknown';
        }
      })()
    });
  });

  apiRouter.get('/debug-deploy-logs', async (_req, res) => {
    try {
      const logFile = '/tmp/joe-self-heal.log';
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').slice(-100).join('\n');
        res.type('text/plain').send(lines);
      } else {
        res.status(404).send('Log file /tmp/joe-self-heal.log not found');
      }
    } catch (e: any) {
      res.status(500).send(`Error reading logs: ${e.message}`);
    }
  });

  // Sub-routes
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/tools', toolsRoutes);
  apiRouter.use('/runs', runRoutes);
  apiRouter.use('/run', runRoutes);
  apiRouter.use('/sessions', sessionsRoutes);
  apiRouter.use('/folders', foldersRoutes);
  apiRouter.use('/queue', queueRoutes);
  apiRouter.use('/files', filesRoutes);
  apiRouter.use('/approvals', approvalsRoutes);
  // Built pages POST their form submissions here (visitor-facing, no auth).
  apiRouter.use('/public/forms', formsPublicRoutes);
  apiRouter.use('/project', projectRoutes);
  apiRouter.use('/assets', assetsRoutes);
  apiRouter.use('/memory', memoryRoutes);
  apiRouter.use('/knowledge', knowledgeRoutes);
  apiRouter.use('/system', systemRoutes);
  apiRouter.use('/providers', providersRoutes);
  apiRouter.use('/packages', packagesRoutes);
  apiRouter.use('/git', gitRoutes);
  apiRouter.use('/github', githubRoutes);
  apiRouter.use('/browser', browserRoutes);
  apiRouter.use('/oauth', oauthRoutes);
  apiRouter.use('/extension', extensionRoutes);
  apiRouter.use('/browser-agent', browserAgentRoutes);
  apiRouter.use('/status', statusRoutes);
  apiRouter.use('/servers', authenticate, serverRoutes);
  apiRouter.use('/workspaces', workspacesRoutes);
  apiRouter.use('/admin/sentinel', sentinelRoutes);
  apiRouter.use('/admin', adminRoutes);
  apiRouter.use('/webhooks', webhooksRoutes);
  apiRouter.use('/ping-deploy', pingDeployRoutes);
  apiRouter.use('/build', buildRoutes);
  apiRouter.use('/agent', agentRoutes);

  // Specific deployment endpoint
  apiRouter.post('/deploy-now', async (_req, res) => {
    try {
      const { deployManager } = await import('../modules/services/DeployManager');
      const commitHash = await deployManager.getCurrentCommit().catch(() => 'HEAD');
      const id = await deployManager.startDeploy('manual', commitHash);
      res.json({ id, message: 'Deployment started' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Artifacts exposure
  const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
  app.use('/artifacts', express.static(ARTIFACT_DIR));

  // Static frontend
  const candidates = [
    path.resolve(process.cwd(), '../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(__dirname, '../../web/dist')
  ];
  const webDistPath = candidates.find(p => fs.existsSync(p)) || candidates[0];
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get(/(.*)/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/artifacts')) return next();
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  // [HARDENING] Global Error Handler
  // Standardizes all errors into { success: false, error: "..." }
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[GlobalError] ${req.method} ${req.path} - Error:`, err);
    logger.error({ err, path: req.path }, '[GlobalError] Unhandled error caught');
    
    // Clean error message (don't leak stack traces in production)
    const message = process.env.NODE_ENV === 'production' 
      ? 'An internal server error occurred' 
      : err.message || 'Unknown error';

    res.status(err.status || 500).json({
      success: false,
      error: message
    });
  });

  return app;
};
