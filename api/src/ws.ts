import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from './config';

let liveWssRef: WebSocketServer | null = null;
let browserProxyWssRef: WebSocketServer | null = null;

export interface LiveEvent {
  type:
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
    | 'text';
  data: any;
  id?: string;
}

export function attachWebSocket(server: Server) {
  liveWssRef = new WebSocketServer({ noServer: true });
  browserProxyWssRef = new WebSocketServer({ noServer: true });

  liveWssRef.on('connection', (ws) => {
    ws.on('message', () => {});
  });

  browserProxyWssRef.on('connection', (clientWs, req) => {
    const sessionId = String((req as any).browserSessionId || '').trim();
    if (!sessionId) {
      try { clientWs.close(1008, 'missing_session_id'); } catch {}
      return;
    }

    const upstreamUrl = new URL(`/ws/${encodeURIComponent(sessionId)}`, config.browserWorkerUrl);
    upstreamUrl.searchParams.set('key', config.browserWorkerKey);
    upstreamUrl.protocol = upstreamUrl.protocol === 'https:' ? 'wss:' : 'ws:';

    const upstreamWs = new WebSocket(upstreamUrl.toString());

    const closeBoth = (code?: number, reason?: string) => {
      try { if (clientWs.readyState === WebSocket.OPEN) clientWs.close(code, reason); } catch {}
      try { if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.close(code, reason); } catch {}
      try { clientWs.terminate(); } catch {}
      try { upstreamWs.terminate(); } catch {}
    };

    clientWs.on('message', (data) => {
      if (upstreamWs.readyState === WebSocket.OPEN) {
        try { upstreamWs.send(data); } catch {}
      }
    });

    upstreamWs.on('message', (data) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try { clientWs.send(data); } catch {}
      }
    });

    upstreamWs.on('close', () => closeBoth(1011, 'upstream_closed'));
    upstreamWs.on('error', () => closeBoth(1011, 'upstream_error'));
    clientWs.on('close', () => closeBoth(1000, 'client_closed'));
    clientWs.on('error', () => closeBoth(1011, 'client_error'));
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

    if (url.pathname === '/ws') {
      liveWssRef?.handleUpgrade(req, socket, head, (ws) => {
        liveWssRef?.emit('connection', ws, req);
      });
      return;
    }

    if (url.pathname.startsWith('/browser/ws/')) {
      const sessionId = url.pathname.split('/').filter(Boolean).pop();
      const token = url.searchParams.get('token');
      if (!token) return reject(401, 'Unauthorized');

      try {
        jwt.verify(token, config.jwtSecret);
      } catch {
        return reject(401, 'Unauthorized');
      }

      (req as any).browserSessionId = sessionId;
      browserProxyWssRef?.handleUpgrade(req, socket, head, (ws) => {
        browserProxyWssRef?.emit('connection', ws, req);
      });
      return;
    }

    return reject(404, 'Not Found');
  });
}

export function broadcast(event: LiveEvent | { type: string; data: any; id?: string }) {
  if (!liveWssRef) return;
  const payload = JSON.stringify(event);
  liveWssRef.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
    }
  });
}
