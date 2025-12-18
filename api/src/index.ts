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
import { authenticate } from './middleware/auth';
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
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
