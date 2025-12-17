import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

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
    | 'text';
  data: any;
}

let wssRef: WebSocketServer | null = null;

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssRef = wss;

  wss.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'hello', data: { ts: Date.now() } }));
    socket.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        // Echo back for now to verify streaming path
        socket.send(JSON.stringify({ type: 'step_progress', data: { echo: data, ts: Date.now() } }));
      } catch {
        socket.send(JSON.stringify({ type: 'step_failed', data: { reason: 'invalid_json' } }));
      }
    });
  });

  return wss;
}

export function broadcast(event: LiveEvent) {
  if (!wssRef) return;
  const payload = JSON.stringify(event);
  wssRef.clients.forEach((client) => {
    try {
      client.send(payload);
    } catch {}
  });
}
