/* ============================================================
   BROWSER-EXTENSION GATEWAY
   ------------------------------------------------------------
   The ONLY way an online Joe server can drive a user's REAL browser (with their
   own logins, any site) is a small extension the user installs once. The extension
   holds a WebSocket to Joe; Joe sends commands ({id,cmd,args}) and the extension
   executes them in the user's actual browser and replies ({id,ok,result}).

   This module keeps the per-user socket registry and a request/response
   correlation layer so tools can call `sendCommand(userId, cmd, args)` and await
   the result, exactly as if the browser were local.
   ============================================================ */
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';

let wss: WebSocketServer | null = null;

/** userId -> set of connected extension sockets (a user may have >1 browser). */
const sockets = new Map<string, Set<WebSocket>>();
/** pending command id -> resolver. */
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void; timer: NodeJS.Timeout }>();

function addSocket(userId: string, ws: WebSocket) {
  if (!sockets.has(userId)) sockets.set(userId, new Set());
  sockets.get(userId)!.add(ws);
}
function removeSocket(userId: string, ws: WebSocket) {
  const set = sockets.get(userId);
  if (set) { set.delete(ws); if (set.size === 0) sockets.delete(userId); }
}

/** Whether the given user currently has at least one browser connected. */
export function isExtensionConnected(userId: string): boolean {
  const set = sockets.get(String(userId || '').trim());
  return !!set && set.size > 0;
}

export function connectedUserCount(): number { return sockets.size; }

let cmdSeq = 0;
/** Send a command to the user's browser extension and await its reply. */
export function sendCommand(userId: string, cmd: string, args?: any, timeoutMs = 30000): Promise<any> {
  return new Promise((resolve, reject) => {
    const uid = String(userId || '').trim();
    const set = sockets.get(uid);
    if (!set || set.size === 0) return reject(new Error('extension_not_connected'));
    // Pick the most recently added, still-open socket.
    const ws = Array.from(set).reverse().find(s => s.readyState === WebSocket.OPEN);
    if (!ws) return reject(new Error('extension_not_connected'));
    const id = `c${Date.now()}_${++cmdSeq}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('extension_command_timeout')); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { ws.send(JSON.stringify({ id, cmd, args: args || {} })); }
    catch (e) { clearTimeout(timer); pending.delete(id); reject(e); }
  });
}

/** Create (once) the extension WebSocketServer and return it for upgrade routing. */
export function attachExtensionWss(): WebSocketServer {
  if (wss) return wss;
  wss = new WebSocketServer({ noServer: true });
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const userId = String((req as any).auth?.sub || (req as any).auth?.userId || (req as any).__extUserId || 'local-user').trim();
    addSocket(userId, ws);
    try { console.log(`[Extension] Browser connected for user=${userId} (total users=${sockets.size})`); } catch { }
    try { ws.send(JSON.stringify({ type: 'hello', ok: true })); } catch { }

    ws.on('message', (raw: any) => {
      let msg: any = null;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      // Response to a command we issued.
      if (msg && msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id)!; pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.ok === false) p.reject(new Error(String(msg.error || 'extension_error')));
        else p.resolve(msg.result !== undefined ? msg.result : msg);
      }
      // (Unsolicited events like page changes could be handled here later.)
    });

    ws.on('close', () => { removeSocket(userId, ws); try { console.log(`[Extension] Browser disconnected for user=${userId}`); } catch { } });
    ws.on('error', () => { removeSocket(userId, ws); });
  });
  return wss;
}
