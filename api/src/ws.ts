import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from './config';
import { attachBrowserWss } from './browser/wsHub';
import { startStreaming, stopStreaming } from './browser/manager';
import { ServerConfigModel } from './models/ServerConfigModel';

let liveWssRef: WebSocketServer | null = null;
let browserWssRef: WebSocketServer | null = null;
let liveSeq = 0;

type OwnerEntry = { userId: string; at: number };
const runOwnerByRunId = new Map<string, OwnerEntry>();
const sessionOwnerBySessionId = new Map<string, OwnerEntry>();
const terminalOwnerById = new Map<string, OwnerEntry>();

const OWNER_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_MAX_ENTRIES = 5000;

function trimId(v: any) {
  const s = String(v ?? '').trim();
  return s || '';
}

function pruneOwners(map: Map<string, OwnerEntry>) {
  if (map.size <= OWNER_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of map) {
    if (now - v.at > OWNER_TTL_MS) map.delete(k);
  }
  if (map.size <= OWNER_MAX_ENTRIES) return;
  let removed = 0;
  for (const k of map.keys()) {
    map.delete(k);
    removed += 1;
    if (removed >= Math.ceil(OWNER_MAX_ENTRIES / 3)) break;
  }
}

export function registerRunOwner(runId: string, userId: string) {
  const rid = trimId(runId);
  const uid = trimId(userId);
  if (!rid || !uid) return;
  runOwnerByRunId.set(rid, { userId: uid, at: Date.now() });
  pruneOwners(runOwnerByRunId);
}

export function registerSessionOwner(sessionId: string, userId: string) {
  const sid = trimId(sessionId);
  const uid = trimId(userId);
  if (!sid || !uid) return;
  sessionOwnerBySessionId.set(sid, { userId: uid, at: Date.now() });
  pruneOwners(sessionOwnerBySessionId);
}

export function registerTerminalOwner(terminalId: string, userId: string) {
  const tid = trimId(terminalId);
  const uid = trimId(userId);
  if (!tid || !uid) return;
  terminalOwnerById.set(tid, { userId: uid, at: Date.now() });
  pruneOwners(terminalOwnerById);
}

function resolveEventUserId(ev: LiveEvent) {
  const t = trimId(ev.type);
  if (t === 'terminal_output') {
    const tid = trimId((ev as any).id);
    const entry = tid ? terminalOwnerById.get(tid) : undefined;
    return entry?.userId || '';
  }

  const rid = trimId(ev.runId);
  const runEntry = rid ? runOwnerByRunId.get(rid) : undefined;
  if (runEntry?.userId) return runEntry.userId;

  const sid = trimId((ev as any)?.data?.sessionId);
  const sessionEntry = sid ? sessionOwnerBySessionId.get(sid) : undefined;
  if (sessionEntry?.userId) return sessionEntry.userId;

  return '';
}

export type LiveEventType =
  | 'step_started'
  | 'step_progress'
  | 'step_done'
  | 'step_failed'
  | 'evidence_added'
  | 'artifact_created'
  | 'approval_required'
  | 'approval_result'
  | 'run_finished'
  | 'run_completed'
  | 'text'
  | 'diff'          // NEW: File diff for viewer
  | 'preview_ready' // NEW: Preview URL available
  | 'screenshot'    // NEW: Screenshot captured
  | (string & {});

export interface LiveEvent {
  type: LiveEventType;
  data: any;
  id?: string;
  runId?: string;
  seq?: number;
  ts?: number;
}

export function attachWebSocket(server: Server) {
  liveWssRef = new WebSocketServer({ noServer: true });
  browserWssRef = new WebSocketServer({ noServer: true });
  attachBrowserWss(browserWssRef, { onFirstClient: startStreaming, onLastClient: stopStreaming });

  liveWssRef.on('connection', (ws, req: IncomingMessage) => {
    let url: URL | null = null;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      url = null;
    }

    const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
    const token = url?.searchParams.get('token') || '';
    if (!authBypass && token && token !== 'null') {
      try {
        const payload = jwt.verify(token, config.jwtSecret);
        (req as any).auth = payload;
      } catch {
        try { ws.close(1008, 'unauthorized_invalid_token'); } catch { }
        return;
      }
    }

    const userId = trimId((req as any)?.auth?.sub);
    if (userId) (ws as any).userId = userId;

    console.log('[WS] Client connected to liveWss');
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
    const pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(pingTimer);
        return;
      }
      if ((ws as any).isAlive === false) {
        clearInterval(pingTimer);
        try { ws.terminate(); } catch { }
        return;
      }
      (ws as any).isAlive = false;
      try { ws.ping(); } catch { }
    }, 30000);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));

        // Terminal Streaming Handlers
        if (msg.type === 'terminal_input') {
          const { id, data, serverId } = msg;
          if (userId) registerTerminalOwner(id, userId);
          if (serverId) {
            const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
            if (!authBypass && (!userId || !mongoose.Types.ObjectId.isValid(String(serverId || '')))) return;
            Promise.resolve(require('./terminal/ssh-manager')).then(({ sshManager }) => {
              (async () => {
                if (!authBypass) {
                  const ok = await ServerConfigModel.findOne({ _id: serverId, userId, isActive: true }).select('_id').lean();
                  if (!ok) return;
                }
                if (!sshManager.isConnected(serverId)) return;
                await sshManager.requestShell(serverId, id);
                sshManager.sendInput(id, data);
              })().catch(() => { });
            });
          } else {
            Promise.resolve(require('./tools/definitions/TaskInteractionTools')).then(({ terminals }) => {
              const term = terminals.get(id);
              if (term) term.pty.write(data);
            });
          }
        }
        if (msg.type === 'terminal_resize') {
          const { id, cols, rows, serverId } = msg;
          if (userId) registerTerminalOwner(id, userId);
          if (serverId) {
            const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
            if (!authBypass && (!userId || !mongoose.Types.ObjectId.isValid(String(serverId || '')))) return;
            Promise.resolve(require('./terminal/ssh-manager')).then(({ sshManager }) => {
              (async () => {
                if (!authBypass) {
                  const ok = await ServerConfigModel.findOne({ _id: serverId, userId, isActive: true }).select('_id').lean();
                  if (!ok) return;
                }
                sshManager.resizeShell(id, cols, rows);
              })().catch(() => { });
            });
          } else {
            Promise.resolve(require('./tools/definitions/TaskInteractionTools')).then(({ terminals }) => {
              const term = terminals.get(id);
              if (term) term.pty.resize(cols, rows);
            });
          }
        }
      } catch (e) {
        // ignore non-json
      }
    });
    ws.on('close', () => {
      clearInterval(pingTimer);
    });
  });

  server.on('upgrade', (req: any, socket: any, head: any) => {
    const reject = (status: number, message: string) => {
      try {
        socket.write(
          `HTTP/1.1 ${status} ${message}\r\n` +
          'Connection: close\r\n' +
          'Content-Type: text/plain\r\n' +
          `Content-Length: ${Buffer.byteLength(message)}\r\n` +
          '\r\n' +
          message
        );
      } catch { }
      try { socket.destroy(); } catch { }
    };

    let url: URL;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      return reject(400, 'Bad Request');
    }

    if (url.pathname === '/ws' || url.pathname === '/ws/' || url.pathname === '/api/ws' || url.pathname === '/api/ws/') {
      console.log('[WS] Upgrading ws connection at:', url.pathname);
      if (!liveWssRef) return reject(503, 'Service Unavailable');
      liveWssRef.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Connection established');
        liveWssRef?.emit('connection', ws, req);
      });
      return;
    }
    if (url.pathname === '/ws/browser') {
      const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
      const token = url.searchParams.get('token') || '';
      if (!authBypass) {
        if (!token) return reject(401, 'Unauthorized: Missing token');
        try {
          const payload = jwt.verify(token, config.jwtSecret);
          (req as any).auth = payload;
        } catch {
          return reject(401, 'Unauthorized: Invalid token');
        }
      }

      if (!browserWssRef) return reject(503, 'Service Unavailable');
      browserWssRef.handleUpgrade(req, socket, head, (ws) => {
        browserWssRef?.emit('connection', ws, req);
      });
      return;
    }

    return reject(404, 'Not Found');
  });
}

export function broadcast(
  event: LiveEvent | { type: string; data: any; id?: string; runId?: string; seq?: number; ts?: number }
) {
  if (!liveWssRef) {
    console.warn('[WS] broadcast called but liveWssRef is null');
    return;
  }
  const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
  const normalized: LiveEvent = {
    ...(event as any),
    ts: typeof (event as any)?.ts === 'number' ? (event as any).ts : Date.now(),
    seq: typeof (event as any)?.seq === 'number' ? (event as any).seq : (liveSeq += 1),
    runId:
      typeof (event as any)?.runId === 'string'
        ? (event as any).runId
        : typeof (event as any)?.data?.runId === 'string'
          ? (event as any).data.runId
          : undefined,
  };
  const payload = JSON.stringify(normalized);

  // Fix: Ensure "undefined" string is treated as empty
  let targetUserId = authBypass ? '' : resolveEventUserId(normalized);
  if (targetUserId === 'undefined') targetUserId = '';

  console.log(`[WS] Broadcast type=${normalized.type} target=${targetUserId || 'ALL'} clients=${liveWssRef.clients.size}`);

  liveWssRef.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      if (!authBypass && targetUserId) {
        const clientUserId = trimId((client as any).userId);
        if (!clientUserId || clientUserId !== targetUserId) {
          // console.log('[WS] Skipping client', clientUserId, 'target', targetUserId);
          return;
        }
      }
      // console.log('[WS] Sending to client', (client as any).userId || 'anon');
      client.send(payload);
    }
  });
}
