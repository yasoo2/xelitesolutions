import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { terminalManager } from './services/terminal';

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
    | 'text'
    | 'terminal:data'
    | 'network:request'
    | 'healing:error';
  data: any;
  id?: string;
}

export function attachWebSocket(server: Server) {
  wssRef = new WebSocketServer({ server });

  wssRef.on('connection', (ws) => {
    // console.info('Client connected to WebSocket');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Handle terminal input
        if (data.type === 'terminal:input' && data.data) {
           terminalManager.write(data.id || 'default', data.data);
        }
        // Handle terminal resize
        if (data.type === 'terminal:resize' && data.cols && data.rows) {
           terminalManager.resize(data.id || 'default', data.cols, data.rows);
        }
      } catch (e) {
        console.error('Failed to parse WS message:', e);
      }
    });

    // Send initial terminal state or history if needed
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
