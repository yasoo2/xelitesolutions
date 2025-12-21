import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

let wssRef: WebSocketServer | null = null;

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
  wssRef = new WebSocketServer({ server });

  wssRef.on('connection', (ws) => {
    ws.on('message', () => {});
  });
}

export function broadcast(event: LiveEvent | { type: string; data: any; id?: string }) {
  if (!wssRef) return;
  const payload = JSON.stringify(event);
  wssRef.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
    }
  });
}
