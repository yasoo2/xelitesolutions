import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import pino from 'pino';
import bcrypt from 'bcrypt';
import { config } from './config';
import authRoutes from './routes/auth';
import toolsRoutes from './routes/tools';
import runRoutes from './routes/run';
import runDetailsRoutes from './routes/runs';
import sessionsRoutes from './routes/sessions';
import foldersRoutes from './routes/folders';
import filesRoutes from './routes/files';
import approvalsRoutes from './routes/approvals';
import projectRoutes from './routes/project';

import assetsRoutes from './routes/assets';
import memoryRoutes from './routes/memory';
import knowledgeRoutes from './routes/knowledge';
import systemRoutes from './routes/system';

import providersRoutes from './routes/providers';
import packagesRoutes from './routes/packages';
import gitRoutes from './routes/git';

import databaseRoutes from './routes/database';
import actionsRoutes from './routes/actions';
import browserRoutes from './routes/browser';
import serverRoutes from './routes/servers';
import queueRoutes from './routes/queue';
import workspacesRoutes from './routes/workspaces';
import { healthcheckBrowser } from './browser/manager';

// Create Central API Router
const apiRouter = express.Router();

import { authenticate } from './middleware/auth';
import http from 'http';
import { attachWebSocket } from './ws';
import path from 'path';
import fs from 'fs';
import { User } from './models/user';
import { executeTool } from './services/ToolService';

const logger =
  process.env.NODE_ENV === 'production'
    ? pino()
    : pino({
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'SYS:standard', colorize: true },
      },
    });

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureOwnerFromEnv() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  if (mongoose.connection.readyState !== 1) return;

  let user = await User.findOne({ email: adminEmail });
  if (!user) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${escapeRegExp(adminEmail)}$`, 'i') } });
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await User.create({ email: adminEmail, passwordHash, role: 'OWNER' });
    return;
  }

  let ok = false;
  if (user.passwordHash) {
    ok = await bcrypt.compare(adminPassword, user.passwordHash);
  }
  if (!ok || user.role !== 'OWNER' || user.email !== adminEmail) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    user.email = adminEmail;
    user.passwordHash = passwordHash;
    user.role = 'OWNER';
    await user.save();
  }
}

console.log('DEBUG: Modules imported. Calling main...');

async function main() {
  console.log('DEBUG: main() started');
  const app = express();
  console.log('DEBUG: express app created');

  const allowedOrigins = new Set<string>([
    'https://xelitesolutions.com',
    'https://www.xelitesolutions.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ]);
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      if (/^https?:\/\/(\d+\.\d+\.\d+\.\d+)(:\d+)?$/i.test(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Worker-Key', 'x-worker-key'],
  }));

  // Middleware: Block API requests until DB is ready
  app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.path.startsWith('/api') && mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Database connection initializing, please try again shortly.',
        retryAfter: 5
      });
    }
    next();
  });
  app.use(express.json({ limit: '10mb' }));

  app.all('/api/webviewClick', (_req, res) => res.status(204).end());

  app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({
    status: 'OK',
    db: mongoose.connection.readyState,
    env: process.env.NODE_ENV,
    adminSet: !!process.env.ADMIN_EMAIL,
    uptime: process.uptime()
  }));
  app.get('/health/browser', async (_req, res) => {
    try {
      const r = await healthcheckBrowser();
      return res.json({ status: 'OK', browser: 'OK', ms: r.ms, url: (r as any).url, screenshotHref: (r as any).screenshotHref });
    } catch (e: any) {
      return res.status(503).json({ status: 'FAIL', browser: 'FAIL', error: String(e?.message || e || 'browser_health_failed') });
    }
  });
  app.get('/', (_req, res) => res.send('Joe API is running'));

  // Mount Central API Router
  app.use('/api', apiRouter);

  apiRouter.get('/health', (_req, res) => res.json({
    status: 'OK',
    db: mongoose.connection.readyState,
    env: process.env.NODE_ENV,
    adminSet: !!process.env.ADMIN_EMAIL,
    uptime: process.uptime()
  }));

  // Sub-routes on apiRouter
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/tools', toolsRoutes);
  apiRouter.use('/runs', runRoutes);
  apiRouter.use('/run', runDetailsRoutes);
  apiRouter.use('/sessions', sessionsRoutes);
  apiRouter.use('/folders', foldersRoutes);
  apiRouter.use('/files', filesRoutes);
  apiRouter.use('/approvals', approvalsRoutes);
  apiRouter.use('/project', projectRoutes);

  apiRouter.use('/assets', assetsRoutes);
  apiRouter.use('/memory', memoryRoutes);
  apiRouter.use('/knowledge', knowledgeRoutes);
  apiRouter.use('/system', systemRoutes);

  apiRouter.use('/providers', providersRoutes);
  apiRouter.use('/packages', packagesRoutes);
  apiRouter.use('/git', gitRoutes);

  apiRouter.use('/database', databaseRoutes);
  apiRouter.use('/actions', actionsRoutes);
  apiRouter.use('/browser', browserRoutes);
  apiRouter.use('/servers', authenticate, serverRoutes);
  apiRouter.use('/queue', queueRoutes);
  apiRouter.use('/workspaces', workspacesRoutes);

  // Catch-all 404 for API
  apiRouter.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API Route ${req.method} ${req.originalUrl} not found`,
      availableModules: [
        'auth', 'tools', 'runs', 'sessions', 'folders', 'files', 'project', 'system'
      ]
    });
  });

  // Example protected route
  app.get('/me', authenticate, async (req, res) => {
    const auth = (req as any).auth;
    res.json({ userId: auth.sub, role: auth.role });
  });

  const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
  if (!fs.existsSync(ARTIFACT_DIR)) {
    try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch { }
  }
  app.use('/artifacts', express.static(ARTIFACT_DIR));

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'API listening (Database connecting in background...)');

    // [NEW] Deep Memory Auto-Indexing
    const autoIndexingEnabled = process.env.ENABLE_STARTUP_AUTO_INDEXING === 'true';
    const autoIndexingDelayMs = Number(process.env.STARTUP_AUTO_INDEXING_DELAY_MS || '0') || 0;
    if (autoIndexingEnabled) {
      setTimeout(() => {
        logger.info('[DeepMemory] Starting Startup Auto-Indexing...');
        executeTool('memorize_codebase', {
          directory: process.cwd(),
          extensions: ['ts', 'tsx', 'js', 'json', 'md', 'css', 'html', 'py']
        }).catch(() => { });
      }, autoIndexingDelayMs);
    }
  });

  // DB connect with Retry Loop (Background)
  const connectWithRetry = async () => {
    const isProd = process.env.NODE_ENV === 'production';
    const maxRetries = isProd ? 30 : Number.POSITIVE_INFINITY;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
        logger.info('MongoDB connected');
        try {
          await ensureOwnerFromEnv();
        } catch (e) {
          logger.error(e, 'Owner bootstrap failed');
        }
        return true; // Success
      } catch (e) {
        const label = Number.isFinite(maxRetries) ? `${i + 1}/${maxRetries}` : `${i + 1}`;
        logger.warn(`MongoDB connection failed (Attempt ${label}), retrying in 2s...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    logger.error('MongoDB connection failed after maximum retries - Exiting');
    process.exit(1);
  };

  void connectWithRetry();

  // Global Error Handler
  process.on('uncaughtException', (err) => {
    logger.error(err, 'Uncaught Exception');
  });

  process.on('unhandledRejection', (reason: any) => {
    logger.error(reason, 'Unhandled Rejection');
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
