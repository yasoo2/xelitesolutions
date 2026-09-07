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

type BrowserActionObserver = (sessionId: string, event: Extract<BrowserWsEvent, { type: 'action_sent' | 'action_ack' | 'action_done' | 'action_error' }>) => void;
let browserActionObserver: BrowserActionObserver | null = null;

export function setBrowserActionObserver(observer: BrowserActionObserver | null) {
  browserActionObserver = observer;
}

const clientsBySession = new Map<string, Set<Client>>();
export async function canAccessBrowserSession(userId: string, sessionId: string) {
  const uid = String(userId || '').trim();
  const sid = String(sessionId || '').trim();
  if (!uid || !sid) return false;

  const chatId = sid.startsWith('browser:') ? sid.slice('browser:'.length) : sid;
  if (!chatId || chatId.includes(':')) return false;
  // The stream follows persisted chat ownership, including before its first
  // viewer connects and after a restart. A client cannot claim an unknown id.
  const offline = process.env.PERSISTENCE_MODE === 'JSON'
    || process.env.OFFLINE_MODE === 'true' || mongoose.connection.readyState !== 1;
  let session: any;
  if (offline) {
    session = ((global as any).mockSessions || []).find((item: any) =>
      String(item.id ?? item._id) === chatId || String(item._id) === chatId);
  } else if (mongoose.Types.ObjectId.isValid(chatId)) {
    session = await Session.findById(chatId).select('userId').lean();
  }
  if (session) return String(session.userId || '') === uid;
  // Legacy account-scoped streams are usable only by that exact account.
  return sid === `browser:${uid}`;
}

export function attachBrowserWss(wss: WebSocketServer, hooks?: BrowserWssHooks) {
  wss.on('connection', async (ws, req: IncomingMessage) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const sessionId = String(url.searchParams.get('sessionId') || '').trim();
    if (!sessionId) {
      try { ws.close(1008, 'missing_sessionId'); } catch { }
      return;
    }

    const userId = String(((req as any)?.auth?.sub || '')).trim();
    if (!userId) {
      try { ws.close(1008, 'unauthorized'); } catch { }
      return;
    }
    try {
      if (!await canAccessBrowserSession(userId, sessionId)) {
        try { ws.close(1008, 'forbidden'); } catch { }
        return;
      }
    } catch {
      try { ws.close(1011, 'internal_error'); } catch { }
      return;
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

/** How many panels are attached to this browser stream right now. */
export function panelWatcherCount(sessionId: string): number {
  return clientsBySession.get(sessionId)?.size || 0;
}

/**
 * WAIT FOR THE EYE BEFORE STARTING THE SHOW.
 *
 * «👁️ شاهدها تحدث في لوحة المتصفّح» — and he saw almost nothing. His log,
 * in order: `panel_focus` is broadcast, the interface then LAZY-LOADS the
 * EmbeddedBrowser chunk, mounts it, and opens a websocket… while the audit,
 * started in the same tick, is already navigating and pressing controls.
 * Measured from his timestamps: the panel attached twenty-three seconds into
 * a twenty-nine-second audit. He was shown the last six seconds of it.
 *
 * So the audit waits for a watcher — briefly, and never more than the budget:
 * if nobody is looking (the panel is closed, he is on another tab) it starts
 * immediately, because a build must not hang on an audience.
 */
export async function waitForPanelWatcher(sessionId: string, budgetMs = 4000): Promise<boolean> {
  const deadline = Date.now() + Math.max(0, budgetMs);
  while (Date.now() < deadline) {
    if (panelWatcherCount(sessionId) > 0) return true;
    await new Promise(r => setTimeout(r, 120));
  }
  return panelWatcherCount(sessionId) > 0;
}

export function broadcastBrowserEvent(sessionId: string, ev: BrowserWsEvent) {
  const sid = String(sessionId || '').trim();
  if (!sid) return;
  if (ev.type === 'action_sent' || ev.type === 'action_ack' || ev.type === 'action_done' || ev.type === 'action_error') {
    try { browserActionObserver?.(sid, ev); } catch { }
  }
  const set = clientsBySession.get(sid);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify(ev);
  for (const c of set) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    try { c.ws.send(payload); } catch { }
  }
}
