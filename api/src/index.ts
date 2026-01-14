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
import audioRoutes from './routes/audio';
import assetsRoutes from './routes/assets';
import memoryRoutes from './routes/memory';
import knowledgeRoutes from './routes/knowledge';
import systemRoutes from './routes/system';
import instaRoutes from './routes/insta';
import providersRoutes from './routes/providers';
import browserRoutes from './routes/browser';
import { healthcheckBrowser } from './browser/manager';

import { authenticate } from './middleware/auth';
import http from 'http';
import { attachWebSocket } from './ws';
import path from 'path';
import fs from 'fs';
import { User } from './models/user';

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

async function main() {
  const app = express();

  const allowedOrigins = new Set<string>([
    'https://xelitesolutions.com',
    'https://www.xelitesolutions.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
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
  app.use(express.json({ limit: '10mb' }));

  app.all('/api/webviewClick', (_req, res) => res.status(204).end());

  app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'OK' }));
  app.get('/health/browser', async (_req, res) => {
    try {
      const r = await healthcheckBrowser();
      return res.json({ status: 'OK', browser: 'OK', ms: r.ms, url: (r as any).url, screenshotHref: (r as any).screenshotHref });
    } catch (e: any) {
      return res.status(503).json({ status: 'FAIL', browser: 'FAIL', error: String(e?.message || e || 'browser_health_failed') });
    }
  });
  app.get('/', (_req, res) => res.send('Joe API is running'));

  // Auth
  app.use('/auth', authRoutes);
  app.use('/tools', toolsRoutes);
  app.use('/runs', runRoutes);
  app.use('/run', runDetailsRoutes);
  app.use('/sessions', sessionsRoutes);
  app.use('/folders', foldersRoutes);
  app.use('/files', filesRoutes);
  app.use('/approvals', approvalsRoutes);
  app.use('/project', projectRoutes);
  app.use('/audio', audioRoutes);
  app.use('/assets', assetsRoutes);
  app.use('/memory', memoryRoutes);
  app.use('/knowledge', knowledgeRoutes);

  app.use('/system', systemRoutes);
  app.use('/insta', instaRoutes);
  app.use('/providers', providersRoutes);
  app.use('/api/browser', browserRoutes);
  
  // Example protected route
  app.get('/me', authenticate, async (req, res) => {
    const auth = (req as any).auth;
    res.json({ userId: auth.sub, role: auth.role });
  });

  const ARTIFACT_DIR = process.env.ARTIFACT_DIR || '/tmp/joe-artifacts';
  if (!fs.existsSync(ARTIFACT_DIR)) {
    try { fs.mkdirSync(ARTIFACT_DIR, { recursive: true }); } catch {}
  }
  app.use('/artifacts', express.static(ARTIFACT_DIR));

  // DB connect (graceful if unavailable locally)
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    logger.info('MongoDB connected');
    try {
      await ensureOwnerFromEnv();
    } catch (e) {
      logger.error(e, 'Owner bootstrap failed');
    }
  } catch (e) {
    logger.error(e, 'MongoDB connection failed (continuing without DB)');
  }

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.port, '0.0.0.0', () => {
    logger.info({ port: config.port }, 'API listening');
  });

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
