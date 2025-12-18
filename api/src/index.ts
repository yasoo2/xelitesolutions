import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import pino from 'pino';
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
import databaseRoutes from './routes/database';
import systemRoutes from './routes/system';
import healingRoutes, { logError } from './routes/healing';
import docsRoutes from './routes/docs';
import analyticsRoutes from './routes/analytics';
import testRoutes from './routes/tests';
import { authenticate } from './middleware/auth';
import { broadcast } from './ws';
import http from 'http';
import { attachWebSocket } from './ws';
import path from 'path';
import fs from 'fs';

const logger =
  process.env.NODE_ENV === 'production'
    ? pino()
    : pino({
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'SYS:standard', colorize: true },
        },
      });

async function main() {
  const app = express();

  app.use(cors({
    origin: true, // Allow all origins for now to fix connectivity issues
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  
  // Network Inspector Middleware
  app.use((req, res, next) => {
      const start = Date.now();
      const requestId = Math.random().toString(36).substring(7);
      
      // Hook into response finish to calculate duration
      res.on('finish', () => {
          const duration = Date.now() - start;
          const logEntry = {
              id: requestId,
              method: req.method,
              url: req.originalUrl,
              status: res.statusCode,
              duration,
              timestamp: new Date().toISOString(),
              query: req.query,
              body: req.method === 'POST' || req.method === 'PUT' ? req.body : undefined
          };
          // Broadcast to Network Inspector
          broadcast({ type: 'network:request', data: logEntry });
      });
      next();
  });

  app.use(morgan('dev'));

  app.get('/health', (_req, res) => res.json({ status: 'OK' }));
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
  app.use('/database', databaseRoutes);
  app.use('/system', systemRoutes);
  app.use('/healing', healingRoutes);
  app.use('/docs', docsRoutes);
  app.use('/analytics', analyticsRoutes);
  app.use('/tests', testRoutes);

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
  } catch (e) {
    logger.error(e, 'MongoDB connection failed (continuing without DB)');
  }

  const server = http.createServer(app);
  attachWebSocket(server);

  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'API listening');
  });

  // Global Error Handler for Healing
  process.on('uncaughtException', (err) => {
      logger.error(err, 'Uncaught Exception');
      logError(err, 'Uncaught Exception');
  });

  process.on('unhandledRejection', (reason: any) => {
      logger.error(reason, 'Unhandled Rejection');
      logError(reason instanceof Error ? reason : new Error(String(reason)), 'Unhandled Rejection');
  });
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
