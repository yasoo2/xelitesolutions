import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { BrowserWsEvent } from './types';
import mongoose from 'mongoose';
import { Session } from '../models/session';

type Client = { ws: WebSocket; sessionId: string };
type BrowserWssHooks = {
  onFirstClient?: (sessionId: string) => void;
  onLastClient?: (sessionId: string) => void;
};

const clientsBySession = new Map<string, Set<Client>>();

async function canAccessSession(userId: string, sessionId: string) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!uid || !sid) return false;
  if (!mongoose.Types.ObjectId.isValid(sid)) return false;
  if (mongoose.connection.readyState !== 1) return true;
  const found = await Session.findOne({ _id: sid, userId: uid }).select('_id').lean();
  return !!found;
}

export function attachBrowserWss(wss: WebSocketServer, hooks?: BrowserWssHooks) {
  wss.on('connection', async (ws, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      try { ws.close(1008, 'missing_sessionId'); } catch {}
      return;
    }

    const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
    const userId = String(((req as any)?.auth?.sub || '')).trim();
    if (!authBypass) {
      if (!userId) {
        try { ws.close(1008, 'unauthorized'); } catch {}
        return;
      }
      try {
        const ok = await canAccessSession(userId, sessionId);
        if (!ok) {
          try { ws.close(1008, 'forbidden'); } catch {}
          return;
        }
      } catch {
        try { ws.close(1011, 'internal_error'); } catch {}
        return;
      }
    }

    const client: Client = { ws, sessionId };
    let set = clientsBySession.get(sessionId);
    if (!set) {
      set = new Set();
      clientsBySession.set(sessionId, set);
    }
    set.add(client);
    if (set.size === 1) {
      try {
        hooks?.onFirstClient?.(sessionId);
      } catch { }
    }

    ws.on('close', () => {
      const cur = clientsBySession.get(sessionId);
      if (!cur) return;
      cur.delete(client);
      if (cur.size === 0) {
        clientsBySession.delete(sessionId);
        try {
          hooks?.onLastClient?.(sessionId);
        } catch { }
      }
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
