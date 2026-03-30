import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import { config } from '../shared/config';

// Routes
import authRoutes from './routes/auth';
import toolsRoutes from './routes/tools';
import runRoutes from './routes/run';
import sessionsRoutes from './routes/sessions';
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
import githubRoutes from './routes/github';
import browserRoutes from './routes/browser';
import serverRoutes from './routes/servers';
import workspacesRoutes from './routes/workspaces';
import adminRoutes from './routes/admin';
import webhooksRoutes from './routes/webhooks';
import pingDeployRoutes from './routes/ping-deploy';
import buildRoutes from './routes/build';
import sentinelRoutes from './routes/sentinel';

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

export const createApp = () => {
  const app = express();
  const apiRouter = express.Router();

  // [EMERGENCY] Early Health Check
  app.get('/health', (_req, res) => res.json({ status: 'OK', uptime: process.uptime(), source: 'app' }));

  const allowedOrigins = new Set<string>([
    'https://xelitesolutions.com',
    'https://www.xelitesolutions.com',
    'https://api.xelitesolutions.com',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://localhost:5001',
    'http://localhost:8080',
  ]);

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for recovery
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Worker-Key', 'x-worker-key'],
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

  // Mount Central API Router
  app.use('/api', apiRouter);

  // Diagnostic Dashboard
  const debugPath = process.cwd();
  app.use('/debug', express.static(debugPath));
  app.get('/debug', (req, res) => {
    res.sendFile(path.join(debugPath, 'index.html'));
  });

  apiRouter.get('/health', async (_req, res) => {
    let dbStatus = 'DOWN';
    try {
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.db?.admin().ping();
        dbStatus = 'OK';
      }
    } catch (e) {
      dbStatus = 'ERROR';
    }
    res.status(200).json({
      status: 'OK',
      database: dbStatus,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // Sub-routes
  apiRouter.use('/auth', authRoutes);
  apiRouter.use('/tools', toolsRoutes);
  apiRouter.use('/runs', runRoutes);
  apiRouter.use('/run', runRoutes);
  apiRouter.use('/sessions', sessionsRoutes);
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
  apiRouter.use('/github', githubRoutes);
  apiRouter.use('/browser', browserRoutes);
  apiRouter.use('/servers', authenticate, serverRoutes);
  apiRouter.use('/workspaces', workspacesRoutes);
  apiRouter.use('/admin/sentinel', sentinelRoutes);
  apiRouter.use('/admin', adminRoutes);
  apiRouter.use('/webhooks', webhooksRoutes);
  apiRouter.use('/ping-deploy', pingDeployRoutes);
  apiRouter.use('/build', buildRoutes);

  // Specific deployment endpoint
  apiRouter.post('/deploy-now', async (req, res) => {
    try {
      const { deployManager } = await import('../modules/services/DeployManager');
      const id = await deployManager.startDeploy('manual');
      res.json({ id, message: 'Deployment started' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Artifacts exposure
  const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
  app.use('/artifacts', express.static(ARTIFACT_DIR));

  // Static frontend
  const webDistPath = path.join(__dirname, '../../../web/dist');
  if (fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get(/(.*)/, (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/artifacts')) return next();
      res.sendFile(path.join(webDistPath, 'index.html'));
    });
  }

  return app;
};
