import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { BrowserWsEvent } from './types';

type Client = { ws: WebSocket; sessionId: string };

const clientsBySession = new Map<string, Set<Client>>();

export function attachBrowserWss(wss: WebSocketServer) {
  wss.on('connection', (ws, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      try { ws.close(1008, 'missing_sessionId'); } catch {}
      return;
    }
    const client: Client = { ws, sessionId };
    let set = clientsBySession.get(sessionId);
    if (!set) {
      set = new Set();
      clientsBySession.set(sessionId, set);
    }
    set.add(client);

    ws.on('close', () => {
      const cur = clientsBySession.get(sessionId);
      if (!cur) return;
      cur.delete(client);
      if (cur.size === 0) clientsBySession.delete(sessionId);
    });
  });
}

export function broadcastBrowserEvent(sessionId: string, ev: BrowserWsEvent) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  const set = clientsBySession.get(sid);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(ev);
  for (const c of set) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    try { c.ws.send(payload); } catch {}
  }
}

