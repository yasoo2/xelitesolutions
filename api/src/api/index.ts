import { ExecutionEnforcer } from '../kernel/ExecutionEnforcer';
import { ExecutionGuard } from '../kernel/ExecutionGuard';

// Phase 1.8: Hard Architecture Enforcement
ExecutionEnforcer.validateIntegrity();
ExecutionGuard.install();

// Polyfill for libraries that expect browser globals (like pdfjs-dist used by pdf-parse)
if (typeof (global as any).DOMMatrix === 'undefined') {
  (global as any).DOMMatrix = class DOMMatrix {
    constructor() {}
    static fromMatrix() { return new DOMMatrix(); }
    static fromFloat32Array() { return new DOMMatrix(); }
    static fromFloat64Array() { return new DOMMatrix(); }
    get is2D() { return true; }
    get isIdentity() { return true; }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    rotate() { return new DOMMatrix(); }
    multiply() { return new DOMMatrix(); }
  };
}
if (typeof (global as any).ImageData === 'undefined') {
  (global as any).ImageData = class ImageData {
    constructor(width: number, height: number) { (this as any).width = width; (this as any).height = height; (this as any).data = new Uint8ClampedArray(width * height * 4); }
  };
}
if (typeof (global as any).Path2D === 'undefined') {
  (global as any).Path2D = class Path2D { constructor() {} addPath() {} closePath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} ellipse() {} rect() {} };
}

import http from 'http';
import mongoose from 'mongoose';
import pino from 'pino';
import bcrypt from 'bcrypt';
import { config } from '../shared/config';
import { createApp } from './app';
import { attachWebSocket } from './ws';
import { User } from '../shared/models/user';
import { executeTool } from '../modules/services/ToolService';
import { initLocalBrain } from '../core/llm/local-brain';
import { buildIdentity } from '../shared/build-info';
import path from 'path';
import fs from 'fs';

const logger = process.env.NODE_ENV === 'production' 
  ? pino() 
  : pino({ transport: { target: 'pino-pretty', options: { translateTime: 'SYS:standard', colorize: true } } });

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureOwnerFromEnv() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  if (mongoose.connection.readyState !== 1 && process.env.PERSISTENCE_MODE !== 'JSON') return;

  let user = await User.findOne({ email: adminEmail });
  if (!user) {
    user = await User.findOne({ email: { $regex: new RegExp(`^${escapeRegExp(adminEmail)}$`, 'i') } });
  }

  if (!user) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await User.create({ email: adminEmail, passwordHash, role: 'SUPER_ADMIN' });
    return;
  }

  let ok = false;
  if (user.passwordHash) {
    ok = await bcrypt.compare(adminPassword, user.passwordHash);
  }
  if (!ok || user.role !== 'SUPER_ADMIN' || user.email !== adminEmail) {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    user.email = adminEmail;
    user.passwordHash = passwordHash;
    user.role = 'SUPER_ADMIN';
    await user.save();
  }
}

async function main() {
  // BEFORE anything else can throw: nine restarts in his terminal and not one
  // line saying why. Every death is written to data/crash.log from here on,
  // and a rejected promise inside one tool no longer takes the server with it.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { installCrashRecorder, crashLogPath, noteActivity } = require('../shared/crash-log');
  installCrashRecorder(logger);
  noteActivity('startup');

  /**
   *  SAY WHAT IS RUNNING, NOT WHAT WAS CLAIMED.
   *
   *  This printed resolveBuildSha() alone, which reads JOE_BUILD_SHA,
   *  then GIT_COMMIT_SHA, then the git HEAD of the working directory —
   *  three descriptions of the ENVIRONMENT and none of the code. A live
   *  runtime announced a commit it was not running, and the round it
   *  produced was believed until somebody checked the bytes.
   *
   *  The fingerprint is the digest of the file actually executing. It
   *  cannot be set by an environment variable, so a claim and a
   *  measurement now appear side by side and can disagree in public.
   */
  const identity = buildIdentity();
  logger.info({ buildSha: identity.claimedSha, bundleFingerprint: identity.bundleFingerprint, entry: identity.entry }, 'JOE_BUILD_SHA');
  logger.info('🚀 JOE API STARTUP INITIATED...');

  const app = createApp();
  const server = http.createServer(app);
  attachWebSocket(server);

  // Ensure projects data directory exists
  const isApiDir = path.basename(process.cwd()) === 'api';
  const projectRoot = isApiDir ? path.join(process.cwd(), '..') : process.cwd();
  const projectsDir = path.join(projectRoot, 'data', 'projects');
  if (!fs.existsSync(projectsDir)) {
    try { fs.mkdirSync(projectsDir, { recursive: true }); } catch { }
  }

  // Before the door opens: if this process is configured as if strangers can
  // reach it while the single-user switches are still on, say so — and refuse
  // rather than serve everyone with every permission.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../shared/go-live').assertSafeToServe();

  server.listen(config.port, '0.0.0.0', () => {
    noteActivity('serving');
    logger.info({ port: config.port, crashLog: crashLogPath() }, 'API server listening and WebSocket attached');

    // Local Brain: detect installed Ollama models, choose a fast chat model +
    // the strongest coding model, and warm them up so the first request is fast.
    // Best-effort — degrades quietly to the keyless free mesh if Ollama is absent.
    initLocalBrain()
      .then((summary) => logger.info(`🧠 ${summary}`))
      .catch(() => { /* non-fatal */ });

    // Optional Startup Indexing
    if (process.env.ENABLE_STARTUP_AUTO_INDEXING === 'true') {
      setTimeout(() => {
        logger.info('[DeepMemory] Starting Startup Auto-Indexing...');
        executeTool('memorize_codebase', {
          directory: process.cwd(),
          extensions: ['ts', 'tsx', 'js', 'json', 'md', 'css', 'html', 'py']
        }).catch(() => { });
      }, Number(process.env.STARTUP_AUTO_INDEXING_DELAY_MS || '0'));
    }
  });

  const connectWithRetry = async () => {
    // Offline mode is an explicit local-storage deployment mode too. It must
    // not enter the Mongo retry loop and later kill an otherwise healthy API.
    if (process.env.OFFLINE_MODE === 'true' || process.env.MOCK_DB === '1' || process.env.MOCK_DB === 'true' || process.env.PERSISTENCE_MODE === 'JSON') {
      logger.info('⚠️  JSON Persistence mode enabled: Data will be saved to api/data/db');
      mongoose.set('bufferCommands', false);
      await ensureOwnerFromEnv();
      return;
    }
    mongoose.set('bufferCommands', false);
    for (let i = 0; i < 30; i++) {
      try {
        await mongoose.connect(config.mongoUri);
        logger.info('✅ MongoDB connected successfully');
        await ensureOwnerFromEnv();
        return;
      } catch (e: any) {
        logger.warn(`MongoDB connection failed (Attempt ${i+1}), retrying in 2s...: ${e.message}`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    logger.error('Fatal: Could not connect to MongoDB. Exiting.');
    process.exit(1);
  };

  void connectWithRetry();
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error');
  process.exit(1);
});
