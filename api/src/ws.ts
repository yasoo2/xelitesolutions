import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from './config';

let liveWssRef: WebSocketServer | null = null;
let browserProxyWssRef: WebSocketServer | null = null;
let liveSeq = 0;

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
  browserProxyWssRef = new WebSocketServer({ noServer: true });

  liveWssRef.on('connection', (ws) => {
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
        try { ws.terminate(); } catch {}
        return;
      }
      (ws as any).isAlive = false;
      try { ws.ping(); } catch {}
    }, 30000);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[WS] Received message:', msg);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch (e) {
        // ignore non-json
      }
    });
    ws.on('close', () => {
      clearInterval(pingTimer);
    });
  });

  browserProxyWssRef.on('connection', (clientWs, req) => {
    const sessionId = String((req as any).browserSessionId || '').trim();
    if (!sessionId) {
      try { clientWs.close(1008, 'missing_session_id'); } catch {}
      return;
    }

    const workerBaseHttp = String(config.browserWorkerUrl || '').replace(/\/+$/, '');
    const workerKey = String(config.browserWorkerKey || '');
    const workerWsBase = (() => {
      try {
        const u = new URL(workerBaseHttp);
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        return u.toString().replace(/\/+$/, '');
      } catch {
        return workerBaseHttp.replace(/^http/i, 'ws');
      }
    })();

    const upstreamUrl = (() => {
      try {
        const u = new URL(workerWsBase);
        const basePath = u.pathname.replace(/\/+$/, '');
        u.pathname = `${basePath}/ws/${encodeURIComponent(sessionId)}`;
        u.searchParams.set('key', workerKey);
        return u;
      } catch {
        const u = new URL(`/ws/${encodeURIComponent(sessionId)}`, workerWsBase);
        u.searchParams.set('key', workerKey);
        return u;
      }
    })();

    const upstreamWs = new WebSocket(upstreamUrl.toString());

    let closed = false;
    let lastAnyFrameAt = 0;
    let lastUpstreamFrameAt = 0;
    let polling = false;
    let sentStart = false;
    let lastUpstreamMsgAt = Date.now();
    let pollTimer: NodeJS.Timeout | null = null;
    let httpQueue: Promise<any> = Promise.resolve();

    const closeBoth = (code?: number, reason?: string) => {
      closed = true;
      polling = false;
      if (pollTimer) {
        try { clearTimeout(pollTimer); } catch {}
        pollTimer = null;
      }
      try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code, reason); } catch {}
      try { if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.close(code, reason); } catch {}
      try { clientWs.terminate(); } catch {}
      try { upstreamWs.terminate(); } catch {}
    };

    const safeSendToClient = (payload: any) => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      try {
        clientWs.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
      } catch {}
    };

    const executeActionsViaHttp = async (actions: any[]) => {
      if (!workerBaseHttp || !workerKey) return;
      if (!Array.isArray(actions) || actions.length === 0) return;

      const allowed = new Set([
        'goto',
        'goBack',
        'goForward',
        'reload',
        'mouseMove',
        'click',
        'clickText',
        'fillByLabel',
        'searchGoogle',
        'scroll',
        'scrollTo',
        'type',
        'press',
        'screenshot',
        'tab.new',
        'tab.switch',
        'tab.close',
        'tabs.list',
        'pick',
        'locate',
        'waitForRole',
        'waitForSelector',
        'waitForLoad',
        'wait',
        'textBoxes.once',
        'textBoxes.start',
        'textBoxes.stop',
        'stream.setFps',
        'stream.setQuality',
        'redaction.set',
      ]);
      const filtered = actions
        .filter((a) => a && typeof a === 'object')
        .filter((a) => {
          const t = String((a as any).type || '').trim();
          if (!t) return false;
          if (!allowed.has(t)) return false;
          if (t === 'goto') {
            const url = String((a as any).url || '').trim();
            if (!url) return false;
          }
          return true;
        });
      if (filtered.length === 0) return;

      try {
        await fetch(`${workerBaseHttp}/session/${encodeURIComponent(sessionId)}/job/run`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-worker-key': workerKey,
          },
          body: JSON.stringify({ actions: filtered }),
        });
      } catch {}
    };

    const enqueueActionsViaHttp = (actions: any[]) => {
      httpQueue = httpQueue
        .then(() => executeActionsViaHttp(actions))
        .catch(() => {});
    };

    const startPolling = () => {
      if (polling || closed) return;
      polling = true;
      let pollFailures = 0;
      let pollDelayMs = 1500;

      const loop = async () => {
        if (closed || !polling) return;
        if (clientWs.readyState !== WebSocket.OPEN) return;
        if (upstreamWs.readyState === WebSocket.OPEN && Date.now() - lastUpstreamFrameAt < 1500) {
          polling = false;
          return;
        }

        try {
          const snap = await fetch(`${workerBaseHttp}/session/${encodeURIComponent(sessionId)}/snapshot`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-worker-key': workerKey,
            },
            body: JSON.stringify({}),
          });

          if (snap.ok) {
            const j: any = await snap.json().catch(() => null);
            const screenshotPath = typeof j?.screenshot === 'string' ? j.screenshot : '';
            const viewport = j?.viewport && typeof j.viewport === 'object' ? j.viewport : null;
            const w = viewport && typeof viewport.width === 'number' ? viewport.width : undefined;
            const h = viewport && typeof viewport.height === 'number' ? viewport.height : undefined;

            if (!sentStart && w && h) {
              sentStart = true;
              safeSendToClient({ type: 'stream_start', w, h });
            }

            if (typeof j?.url === 'string' && j.url) {
              safeSendToClient({ type: 'url', url: j.url });
            }

            if (screenshotPath) {
              const img = await fetch(`${workerBaseHttp}${screenshotPath}`, { method: 'GET', headers: { 'x-worker-key': workerKey } as any });
              if (img.ok) {
                const ab = await img.arrayBuffer();
                const b64 = Buffer.from(ab).toString('base64');
                safeSendToClient({ type: 'frame', jpegBase64: b64, ts: Date.now(), w, h });
                lastAnyFrameAt = Date.now();
                pollFailures = 0;
                pollDelayMs = 1500;
              }
            }
            if (!screenshotPath) {
              pollFailures += 1;
              pollDelayMs = Math.min(6000, 1500 + pollFailures * 900);
            }
          } else {
            pollFailures += 1;
            pollDelayMs = Math.min(6000, 1500 + pollFailures * 900);
          }
        } catch {}

        pollTimer = setTimeout(loop, pollDelayMs);
      };

      void loop();
    };

    clientWs.on('message', (data) => {
      if (upstreamWs.readyState === WebSocket.OPEN) {
        try { upstreamWs.send(data); } catch {}
        return;
      }

      try {
        const txt = typeof data === 'string' ? data : data.toString();
        const msg = JSON.parse(txt);
        if (msg && msg.type === 'action' && msg.action && typeof msg.action === 'object') {
          enqueueActionsViaHttp([msg.action]);
        }
        if (msg && msg.type === 'actions' && Array.isArray(msg.actions)) {
          enqueueActionsViaHttp(msg.actions);
        }
      } catch {}
    });

    upstreamWs.on('message', (data) => {
      lastUpstreamMsgAt = Date.now();
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(data); } catch {}
      }

      try {
        const txt = typeof data === 'string' ? data : data.toString();
        if (txt.includes('"type":"frame"')) {
          const now = Date.now();
          lastAnyFrameAt = now;
          lastUpstreamFrameAt = now;
        }
      } catch {}
    });

    upstreamWs.on('close', () => {
      if (!closed) startPolling();
    });
    upstreamWs.on('error', () => {
      if (!closed) startPolling();
    });
    clientWs.on('close', () => closeBoth(1000, 'client_closed'));
    clientWs.on('error', () => closeBoth(1011, 'client_error'));

    const watchdog = setInterval(() => {
      if (closed) return;
      if (clientWs.readyState !== WebSocket.OPEN) return;
      const idleMs = Date.now() - lastUpstreamMsgAt;
      const staleFrames = Date.now() - lastAnyFrameAt >= 2500;
      if (staleFrames && idleMs >= 2000) startPolling();
    }, 800);
    clientWs.on('close', () => {
      try { clearInterval(watchdog); } catch {}
    });
    upstreamWs.on('close', () => {
      try { clearInterval(watchdog); } catch {}
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
      } catch {}
      try { socket.destroy(); } catch {}
    };

    let url: URL;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      return reject(400, 'Bad Request');
    }

    if (url.pathname === '/ws' || url.pathname === '/ws/') {
      console.log('[WS] Upgrading /ws connection');
      if (!liveWssRef) return reject(503, 'Service Unavailable');
      liveWssRef.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Connection established');
        liveWssRef?.emit('connection', ws, req);
      });
      return;
    }

    if (url.pathname === '/browser/ws' || url.pathname.startsWith('/browser/ws/')) {
      const sessionId = url.pathname.split('/').filter(Boolean).pop();
      const token = url.searchParams.get('token');
      if (!token) return reject(401, 'Unauthorized');

      try {
        jwt.verify(token, config.jwtSecret);
      } catch {
        return reject(401, 'Unauthorized');
      }

      (req as any).browserSessionId = sessionId;
      if (!browserProxyWssRef) return reject(503, 'Service Unavailable');
      browserProxyWssRef.handleUpgrade(req, socket, head, (ws) => {
        browserProxyWssRef?.emit('connection', ws, req);
      });
      return;
    }

    return reject(404, 'Not Found');
  });
}

export function broadcast(
  event: LiveEvent | { type: string; data: any; id?: string; runId?: string; seq?: number; ts?: number }
) {
  if (!liveWssRef) return;
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
  liveWssRef.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
    }
  });
}
