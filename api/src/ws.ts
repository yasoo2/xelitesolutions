import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { terminalManager } from './services/terminal';

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
    | 'text'
    | 'terminal:data';
  data: any;
  id?: string;
}

let wssRef: WebSocketServer | null = null;

export function attachWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wssRef = wss;

  // Subscribe to terminal output and broadcast to relevant clients
  // In a real app, we should map terminal ID to specific sockets.
  // For now, we broadcast to all, or filtering by ID if client subscribes?
  // Let's broadcast for simplicity as it's a single-user local app.
  terminalManager.on('data', ({ id, data }) => {
    broadcast({ type: 'terminal:data', id, data });
  });

  wss.on('connection', (socket: WebSocket) => {
    socket.send(JSON.stringify({ type: 'hello', data: { ts: Date.now() } }));
    
    socket.on('message', (msg) => {
      try {
        const payload = JSON.parse(msg.toString());
        
        if (payload.type === 'terminal:create') {
            terminalManager.create(payload.id, payload.cwd);
        } else if (payload.type === 'terminal:input') {
            terminalManager.write(payload.id, payload.data);
        } else if (payload.type === 'terminal:resize') {
            terminalManager.resize(payload.id, payload.cols, payload.rows);
        } else if (payload.type === 'terminal:kill') {
            terminalManager.kill(payload.id);
        } else {
            // Echo back for now to verify streaming path
            // socket.send(JSON.stringify({ type: 'step_progress', data: { echo: payload, ts: Date.now() } }));
        }
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
    if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
    }
  });
}
