import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { attachBrowserWss } from './browser/wsHub';

let liveWssRef: WebSocketServer | null = null;
let browserWssRef: WebSocketServer | null = null;
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
  | 'thought'       // NEW: AI reasoning step
  | 'diff'          // NEW: File diff for viewer
  | 'preview_ready' // NEW: Preview URL available
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
  attachBrowserWss(browserWssRef);

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
        try { ws.terminate(); } catch { }
        return;
      }
      (ws as any).isAlive = false;
      try { ws.ping(); } catch { }
    }, 30000);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        console.log('[WS] Received message:', msg);
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));

        // Terminal Streaming Handlers
        if (msg.type === 'terminal_input') {
          const { id, data, serverId } = msg;
          if (serverId) {
            Promise.resolve(require('./terminal/ssh-manager')).then(({ sshManager }) => {
              if (!sshManager.isConnected(serverId)) {
                // Trigger shell creation if not connected? 
                // Usually connected via REST call first, but we ensure shell exists
              }
              sshManager.requestShell(serverId, id).then(() => {
                sshManager.sendInput(id, data);
              });
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
          if (serverId) {
            Promise.resolve(require('./terminal/ssh-manager')).then(({ sshManager }) => {
              sshManager.resizeShell(id, cols, rows);
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

    if (url.pathname === '/ws' || url.pathname === '/ws/') {
      console.log('[WS] Upgrading /ws connection');
      if (!liveWssRef) return reject(503, 'Service Unavailable');
      liveWssRef.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Connection established');
        liveWssRef?.emit('connection', ws, req);
      });
      return;
    }
    if (url.pathname === '/ws/browser') {
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
