import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { BrowserWsEvent } from './types';
import mongoose from 'mongoose';
import { Session } from '../../shared/models/session';

type Client = { ws: WebSocket; sessionId: string };
type BrowserWssHooks = {
  onFirstClient?: (sessionId: string) => void;
  onLastClient?: (sessionId: string) => void;
};

const clientsBySession = new Map<string, Set<Client>>();
type OwnerEntry = { userId: string; at: number };
const ownerByBrowserSessionId = new Map<string, OwnerEntry>();
const OWNER_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_MAX_ENTRIES = 5000;

function pruneOwners() {
  if (ownerByBrowserSessionId.size <= OWNER_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of ownerByBrowserSessionId) {
    if (now - v.at > OWNER_TTL_MS) ownerByBrowserSessionId.delete(k);
  }
  if (ownerByBrowserSessionId.size <= OWNER_MAX_ENTRIES) return;
  let removed = 0;
  for (const k of ownerByBrowserSessionId.keys()) {
    ownerByBrowserSessionId.delete(k);
    removed += 1;
    if (removed >= Math.ceil(OWNER_MAX_ENTRIES / 3)) break;
  }
}

function extractOwnerHint(sessionId: string, userId: string) {
  const sid = String(sessionId || '').trim();
  const uid = String(userId || '').trim();
  if (!sid || !uid) return { type: 'none' as const, value: '' };
  if (mongoose.Types.ObjectId.isValid(sid)) return { type: 'mongoSession' as const, value: sid };
  if (!sid.startsWith('browser:')) return { type: 'none' as const, value: '' };
  const parts = sid.split(':').map((p) => p.trim()).filter(Boolean);
  const second = parts[1] || '';
  if (!second) return { type: 'none' as const, value: '' };
  if (mongoose.Types.ObjectId.isValid(second)) return { type: 'mongoSession' as const, value: second };
  if (second === uid) return { type: 'userId' as const, value: uid };
  return { type: 'none' as const, value: '' };
}

async function canAccessSession(userId: string, sessionId: string) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!uid || !sid) return false;

  const hint = extractOwnerHint(sid, uid);
  if (hint.type === 'userId') return true;
  if (hint.type !== 'mongoSession') return false;
  if (mongoose.connection.readyState !== 1) return false;
  const found = await Session.findOne({ _id: hint.value, userId: uid }).select('_id').lean();
  return !!found;
}

export async function canAccessBrowserSession(userId: string, sessionId: string) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!uid || !sid) return false;

  const hint = extractOwnerHint(sid, uid);
  if (hint.type === 'userId' || hint.type === 'mongoSession') {
    return canAccessSession(uid, sid);
  }

  const cur = ownerByBrowserSessionId.get(sid);
  if (!cur) return false;
  if (cur.userId !== uid) return false;
  cur.at = Date.now();
  return true;
}

export function attachBrowserWss(wss: WebSocketServer, hooks?: BrowserWssHooks) {
  wss.on('connection', async (ws, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      try { ws.close(1008, 'missing_sessionId'); } catch { }
      return;
    }

    const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
    const userId = String(((req as any)?.auth?.sub || '')).trim();
    if (!authBypass) {
      if (!userId) {
        try { ws.close(1008, 'unauthorized'); } catch { }
        return;
      }
      try {
        const ownerHint = extractOwnerHint(sessionId, userId);
        if (ownerHint.type === 'mongoSession' || ownerHint.type === 'userId') {
          const ok = await canAccessSession(userId, sessionId);
          if (!ok) {
            try { ws.close(1008, 'forbidden'); } catch { }
            return;
          }
        } else {
          const cur = ownerByBrowserSessionId.get(sessionId);
          if (cur && cur.userId !== userId) {
            try { ws.close(1008, 'forbidden'); } catch { }
            return;
          }
          if (!cur) {
            ownerByBrowserSessionId.set(sessionId, { userId, at: Date.now() });
            pruneOwners();
          } else {
            cur.at = Date.now();
          }
        }
      } catch {
        try { ws.close(1011, 'internal_error'); } catch { }
        return;
      }
    }

    const client: Client = { ws, sessionId };
    console.log(`[BrowserWS] Client connect. sid=${sessionId} userId=${userId}`);
    let set = clientsBySession.get(sessionId);
    if (!set) {
      set = new Set();
      clientsBySession.set(sessionId, set);
    }
    set.add(client);
    if (set.size === 1) {
      try {
        console.log(`[BrowserWS] First client for sid=${sessionId}. Calling onFirstClient.`);
        hooks?.onFirstClient?.(sessionId);
      } catch (e: any) {
        console.error(`[BrowserWS] Error in onFirstClient: ${e.message}`);
      }
    }

    ws.on('close', () => {
      console.log(`[BrowserWS] Client disconnect. sid=${sessionId}`);
      const cur = clientsBySession.get(sessionId);
      if (!cur) return;
      cur.delete(client);
      if (cur.size === 0) {
        clientsBySession.delete(sessionId);
        try {
          console.log(`[BrowserWS] Last client for sid=${sessionId}. Calling onLastClient.`);
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
    try { c.ws.send(payload); } catch { }
  }
}
