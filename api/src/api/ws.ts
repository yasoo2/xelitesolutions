import { WebSocketServer, WebSocket } from 'ws';
import type { Server, IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../shared/config';
import { attachBrowserWss } from '../modules/browser/wsHub';
import { attachExtensionWss } from '../modules/extension/gateway';
import { startStreaming, stopStreaming } from '../modules/browser/manager';
import { ServerConfigModel } from '../shared/models/ServerConfigModel';

let liveWssRef: WebSocketServer | null = null;
let browserWssRef: WebSocketServer | null = null;
let liveSeq = 0;
let thinkingEventSeq = 0; // Unique counter for thinking events to avoid dedup collisions

type OwnerEntry = { userId: string; at: number };
const runOwnerByRunId = new Map<string, OwnerEntry>();
const sessionOwnerBySessionId = new Map<string, OwnerEntry>();
const terminalOwnerById = new Map<string, OwnerEntry>();
const terminalSessionById = new Map<string, { sessionId: string; at: number }>();

const OWNER_TTL_MS = 24 * 60 * 60 * 1000;
const OWNER_MAX_ENTRIES = 5000;

function trimId(v: any) {
  const s = String(v ?? '').trim();
  return s || '';
}

function pruneOwners(map: Map<string, OwnerEntry>) {
  if (map.size <= OWNER_MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of map) {
    if (now - v.at > OWNER_TTL_MS) map.delete(k);
  }
  if (map.size <= OWNER_MAX_ENTRIES) return;
  let removed = 0;
  for (const k of map.keys()) {
    map.delete(k);
    removed += 1;
    if (removed >= Math.ceil(OWNER_MAX_ENTRIES / 3)) break;
  }
}

export function registerRunOwner(runId: string, userId: string) {
  const rid = trimId(runId);
  const uid = trimId(userId);
  if (!rid || !uid) return;
  runOwnerByRunId.set(rid, { userId: uid, at: Date.now() });
  pruneOwners(runOwnerByRunId);
}

export function registerSessionOwner(sessionId: string, userId: string) {
  const sid = trimId(sessionId);
  const uid = trimId(userId);
  if (!sid || !uid) return;
  sessionOwnerBySessionId.set(sid, { userId: uid, at: Date.now() });
  pruneOwners(sessionOwnerBySessionId);
}

/**
 * FIRST OWNER WINS. This used to overwrite, and overwriting IS the hijack:
 * a second signed-in user sends one `terminal_input` carrying someone else's
 * terminal id, becomes its owner, and from that moment reads the output of a
 * live shell on the owner's machine. Measured, before this line existed, in
 * verify_browser_terminal_wiring.ts.
 */
export function registerTerminalOwner(terminalId: string, userId: string) {
  const tid = trimId(terminalId);
  const uid = trimId(userId);
  if (!tid || !uid) return;
  const existing = terminalOwnerById.get(tid);
  if (existing && existing.userId !== uid) return;      // never changes hands
  terminalOwnerById.set(tid, { userId: uid, at: Date.now() });
  pruneOwners(terminalOwnerById);
}

/** Who owns this terminal, if anyone. */
export function terminalOwnerOf(terminalId: string): string {
  return terminalOwnerById.get(trimId(terminalId))?.userId || '';
}

/** First-owner registry for same-user multi-session terminal isolation. */
export function registerTerminalSessionOwner(terminalId: string, sessionId: string) {
  const tid = trimId(terminalId);
  const sid = trimId(sessionId);
  if (!tid || !sid) return;
  const existing = terminalSessionById.get(tid);
  if (existing && existing.sessionId !== sid) return;
  terminalSessionById.set(tid, { sessionId: sid, at: Date.now() });
  if (terminalSessionById.size > OWNER_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, value] of terminalSessionById) {
      if (now - value.at > OWNER_TTL_MS) terminalSessionById.delete(key);
    }
  }
}

export function terminalSessionOwnerOf(terminalId: string): string {
  return terminalSessionById.get(trimId(terminalId))?.sessionId || '';
}

function resolveEventUserId(ev: LiveEvent) {
  const t = trimId(ev.type);
  if (t === 'terminal_output') {
    // A terminal line is addressed by its own id, by any of the tab ids it was
    // fanned out to, or — for the shared «panel-terminal» stream that carries a
    // build's logs — by the session it belongs to. Before this, that stream
    // resolved to nobody and went to EVERY connected client: one user's build
    // logs on another user's screen.
    const ids = [trimId((ev as any).id), ...(Array.isArray((ev as any).ids) ? (ev as any).ids.map(trimId) : [])];
    for (const tid of ids) {
      const entry = tid ? terminalOwnerById.get(tid) : undefined;
      if (entry?.userId) return entry.userId;
    }
    const sid = trimId((ev as any).sessionId || (ev as any)?.data?.sessionId);
    const owner = sid ? sessionOwnerBySessionId.get(sid) : undefined;
    // Not «unknown, give up» — a shell line emitted by a tool during a run
    // carries no terminal id and no session, and returning here left it
    // ownerless (and therefore dropped). Fall through to the run it came from.
    if (owner?.userId) return owner.userId;
  }

  // An event names its run or its session in one of several places, and Joe
  // uses the run id AS a session id in others. Checking only `runId` and
  // `data.sessionId` left step_started, tool_started, tool_done and
  // department_status resolving to «nobody» — which means EVERY connected
  // client, so a second signed-in user watched someone else's tools run.
  const candidates = [
    trimId(ev.runId),
    trimId((ev as any)?.sessionId),
    trimId((ev as any)?.data?.runId),
    trimId((ev as any)?.data?.sessionId),
  ].filter(Boolean);
  for (const key of candidates) {
    const owner = runOwnerByRunId.get(key)?.userId || sessionOwnerBySessionId.get(key)?.userId;
    if (owner) return owner;
  }

  if (t.startsWith('admin:')) return 'SUPER_ADMIN_ROLE';

  // LAST RESORT: the run this event was emitted from. Fourteen call sites name
  // no session at all — a file diff, a screenshot, a shell line, a task update,
  // a notification, and «Joe needs your input» among them — and an event that
  // belongs to nobody is delivered to everybody. The execution context knows
  // whose work is running, so every one of them (and every one written later)
  // is addressed without its author having to remember.
  try {
    const { executionFirewall } = require('../orchestration/AgentExecutionFirewall');
    const owner = executionFirewall.currentOwner?.();
    if (owner?.userId) return owner.userId;
  } catch { /* outside a run there is nothing to inherit */ }

  return '';
}

export type LiveEventType =
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
  | 'diff'          // NEW: File diff for viewer
  | 'preview_ready' // NEW: Preview URL available
  | 'screenshot'    // NEW: Screenshot captured
  | (string & {});

export interface LiveEvent {
  type: LiveEventType;
  data: any;
  id?: string;
  runId?: string;
  sessionId?: string;
  seq?: number;
  ts?: number;
}

export function attachWebSocket(server: Server) {
  liveWssRef = new WebSocketServer({ noServer: true });
  browserWssRef = new WebSocketServer({ noServer: true });
  const extensionWss = attachExtensionWss();
  attachBrowserWss(browserWssRef, { onFirstClient: startStreaming, onLastClient: stopStreaming });

  liveWssRef.on('connection', (ws, req: IncomingMessage) => {
    let url: URL | null = null;
    try {
      url = new URL(req.url || '/', 'http://localhost');
    } catch {
      url = null;
    }

    const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
    const token = url?.searchParams.get('token') || '';
    if (!authBypass && token && token !== 'null') {
      try {
        const payload = jwt.verify(token, config.jwtSecret);
        (req as any).auth = payload;
      } catch {
        try { ws.close(1008, 'unauthorized_invalid_token'); } catch { }
        return;
      }
    }

    const userId = trimId((req as any)?.auth?.sub);
    const role = (req as any)?.auth?.role;
    // A live socket may serve several Joe tabs, but it must explicitly declare
    // which session streams it is currently rendering. Same-user sessions are
    // not a security boundary by themselves, yet they are a strict UI/runtime
    // ownership boundary.
    (ws as any).sessionSubscriptions = new Set<string>();
    if (userId) (ws as any).userId = userId;
    if (role) (ws as any).role = role;

    console.log('[WS] Client connected to liveWss');
    (ws as any).isAlive = true;
    ws.on('pong', () => {
      (ws as any).isAlive = true;
    });
    const pingTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(pingTimer);
        return;
      }
      if ((ws as any).isAlive === false) {
        clearInterval(pingTimer);
        try { ws.terminate(); } catch { }
        return;
      }
      (ws as any).isAlive = false;
      try { ws.ping(); } catch { }
    }, 30000);
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        if (msg.type === 'session_subscribe') {
          const next = Array.isArray(msg.sessionIds) ? msg.sessionIds : [msg.sessionId];
          const subscriptions = (ws as any).sessionSubscriptions as Set<string>;
          subscriptions.clear();
          for (const sid of next) {
            const normalizedSid = trimId(sid);
            if (normalizedSid) subscriptions.add(normalizedSid);
          }
          return;
        }

        // Terminal Streaming Handlers
        if (msg.type === 'terminal_input') {
          const { id, data, serverId } = msg;
          const messageSessionId = trimId(msg.sessionId);
          const ts = Date.now();
          console.log(`[websocket.forward.received] sessionId=${messageSessionId || id} ts=${ts} type=terminal_input`);
          const terminalSession = terminalSessionOwnerOf(id);
          if (terminalSession && (!messageSessionId || terminalSession !== messageSessionId)) {
            console.warn(`[WS] refused terminal_input on ${id}: owned by session ${terminalSession}`);
            return;
          }
          // Writing into a terminal that belongs to someone else runs commands
          // in THEIR shell. Refused, not merely unreported.
          const owner = terminalOwnerOf(id);
          if (owner && userId && owner !== userId) {
            console.warn(`[WS] refused terminal_input on ${id}: owned by another user`);
            return;
          }
          if (userId) registerTerminalOwner(id, userId);
          if (messageSessionId) registerTerminalSessionOwner(id, messageSessionId);
          Promise.resolve(require('../modules/terminal/terminal-kernel')).then(({ terminalKernel }) => {
            console.log(`[websocket.forward.sent] sessionId=${messageSessionId || id} ts=${Date.now()} target=kernel`);
            terminalKernel.sendInput(id, data, serverId);
          });
        }
        if (msg.type === 'terminal_resize') {
          const { id, cols, rows, serverId } = msg;
          const messageSessionId = trimId(msg.sessionId);
          const terminalSession = terminalSessionOwnerOf(id);
          if (terminalSession && (!messageSessionId || terminalSession !== messageSessionId)) return;
          const rowner = terminalOwnerOf(id);
          if (rowner && userId && rowner !== userId) return;
          if (userId) registerTerminalOwner(id, userId);
          if (messageSessionId) registerTerminalSessionOwner(id, messageSessionId);
          Promise.resolve(require('../modules/terminal/terminal-kernel')).then(({ terminalKernel }) => {
            terminalKernel.resizeTerminal(id, cols, rows, serverId);
          });
        }
      } catch (e) {
        // ignore non-json
      }
    });
    ws.on('close', () => {
      clearInterval(pingTimer);
    });
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
      } catch { }
      try { socket.destroy(); } catch { }
    };

    let url: URL;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      return reject(400, 'Bad Request');
    }

    if (url.pathname === '/ws' || url.pathname === '/ws/' || url.pathname === '/api/ws' || url.pathname === '/api/ws/') {
      console.log('[WS] Upgrading ws connection at:', url.pathname);
      if (!liveWssRef) return reject(503, 'Service Unavailable');
      liveWssRef.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Connection established');
        liveWssRef?.emit('connection', ws, req);
      });
      return;
    }
    if (url.pathname === '/ws/browser') {
      console.log('[WS] Upgrading browser connection');
      const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
      const token = url.searchParams.get('token') || '';
      if (!authBypass) {
        if (!token) {
          console.warn('[WS] Browser upgrade rejected: Missing token');
          return reject(401, 'Unauthorized: Missing token');
        }
        try {
          const payload = jwt.verify(token, config.jwtSecret);
          (req as any).auth = payload;
        } catch (e: any) {
          console.warn(`[WS] Browser upgrade rejected: Invalid token - ${e.message}`);
          return reject(401, 'Unauthorized: Invalid token');
        }
      }

      if (!browserWssRef) {
        console.error('[WS] Browser upgrade failed: browserWssRef is null');
        return reject(503, 'Service Unavailable');
      }
      browserWssRef.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Browser connection upgraded');
        browserWssRef?.emit('connection', ws, req);
      });
      return;
    }
    if (url.pathname === '/ws/extension' || url.pathname === '/api/ws/extension') {
      // The user's installed browser extension connecting to drive their real
      // browser. Authenticated by the user's Joe JWT (token query param).
      const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
      const token = url.searchParams.get('token') || '';
      if (token) {
        try { (req as any).auth = jwt.verify(token, config.jwtSecret); }
        catch (e: any) { if (!authBypass) return reject(401, 'Unauthorized: Invalid token'); }
      } else if (!authBypass) {
        return reject(401, 'Unauthorized: Missing token');
      }
      // In local single-user (bypass) mode with no token, pin the extension socket
      // to the SAME canonical id the HTTP panel resolves to, so /api/extension/status
      // and /action find this socket instead of reporting "not connected".
      if (!(req as any).auth && authBypass) {
        (req as any).auth = { sub: config.localUserId, role: 'OWNER' };
      }
      if (!extensionWss) return reject(503, 'Service Unavailable');
      extensionWss.handleUpgrade(req, socket, head, (ws) => {
        console.log('[WS] Extension connection upgraded');
        extensionWss.emit('connection', ws, req);
      });
      return;
    }

    return reject(404, 'Not Found');
  });
}

/**
 * Return the canonical session address carried by a live event.
 * Session-specific producers may put it at the top level or in data because
 * older tool adapters used the latter shape. The wire must treat both forms
 * identically; otherwise a session can be filtered in one path and broadcast
 * globally in another.
 */
export function liveEventSessionId(event: Partial<LiveEvent> | any): string {
  return trimId(event?.sessionId || event?.data?.sessionId || event?.data?.data?.sessionId);
}

/**
 * Events that render a run or mutate a session-owned resource are never safe
 * to deliver without an explicit session address. Unknown/status events remain
 * global by design, while these events fail closed instead of leaking.
 */
const SESSION_SCOPED_EVENT_TYPES = new Set([
  'run_started', 'run_finished', 'run_completed', 'step_started', 'step_progress',
  'step_done', 'step_failed', 'tool_started', 'tool_done', 'department_status',
  'text', 'diff', 'preview_ready', 'screenshot', 'browser_screenshot',
  'browser_event', 'browser_action', 'browser_action_sent', 'browser_action_done',
  'terminal_output', 'terminal_line', 'todo_update', 'task_update', 'task',
  'thinking_phase', 'thinking_detail', 'thinking_steps', 'thinking_status',
  'neural_trace', 'secret_required', 'approval_required', 'approval_result',
  'artifact_created', 'file_stream', 'code_update', 'workspace_update',
]);

export function eventRequiresSession(event: Partial<LiveEvent> | any): boolean {
  return SESSION_SCOPED_EVENT_TYPES.has(trimId(event?.type));
}

/**
 * Pure delivery predicate used by the live socket and by regression tests.
 * A client subscribed to one session must never receive another session's
 * event. A scoped event without an address is dropped (fail closed).
 */
export function canDeliverLiveEventToSession(
  event: Partial<LiveEvent> | any,
  subscriptions?: Iterable<string>,
): boolean {
  const sid = liveEventSessionId(event);
  if (!sid) return !eventRequiresSession(event);
  const subscribed = new Set(Array.from(subscriptions || [], value => trimId(value)).filter(Boolean));
  return subscribed.has(sid);
}

/** A terminal is usable only by its recorded session, if one exists. */
export function canUseTerminalForSession(terminalId: string, sessionId: string): boolean {
  const owner = terminalSessionOwnerOf(terminalId);
  const sid = trimId(sessionId);
  return !!sid && (!owner || owner === sid);
}

export function broadcast(
  event: LiveEvent | { type: string; data: any; id?: string; runId?: string; seq?: number; ts?: number }
) {
  // Observers see EVERY event, including the ones sent before a socket exists
  // — a proof that measures a build must not depend on a client being there.
  for (const o of broadcastObservers) { try { o(event); } catch { /* an observer never breaks the wire */ } }
  if (!liveWssRef) {
    console.warn('[WS] broadcast called but liveWssRef is null');
    return;
  }
  const authBypass = process.env.ENABLE_AUTH_BYPASS === 'true';
  const normalized: LiveEvent = {
    ...(event as any),
    ts: typeof (event as any)?.ts === 'number' ? (event as any).ts : Date.now(),
    seq: typeof (event as any)?.seq === 'number' ? (event as any).seq : (liveSeq += 1),
    runId:
      typeof (event as any)?.runId === 'string'
        ? (event as any).runId
        : typeof (event as any)?.data?.runId === 'string'
          ? (event as any).data.runId
          : undefined,
  };
  const payload = JSON.stringify(normalized);
  const eventSessionId = liveEventSessionId(normalized);

  // Fix: Ensure "undefined" string is treated as empty
  let targetUserId = authBypass ? '' : resolveEventUserId(normalized);
  if (targetUserId === 'undefined') targetUserId = '';
  // An unaddressed event reaches everyone — acceptable for status chatter, never
  // for a shell. A terminal line whose owner cannot be resolved is dropped
  // rather than shown to whoever happens to be connected.
  if (!authBypass && !targetUserId && normalized.type === 'terminal_output') {
    console.warn(`[WS] dropped terminal_output with no resolvable owner (id=${(normalized as any).id})`);
    return;
  }

  console.log(`[WS] Broadcast type=${normalized.type} target=${targetUserId || 'ALL'} clients=${liveWssRef.clients.size}`);
  
  if (normalized.type === 'terminal_output') {
    console.log(`[websocket.outbound.sent] sessionId=${(normalized as any).id} ts=${normalized.ts} bytes=${(normalized as any).data?.length}`);
  }

  liveWssRef.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      const sessionSubscriptions = (client as any).sessionSubscriptions as Set<string> | undefined;
      if (!canDeliverLiveEventToSession(normalized, sessionSubscriptions)) return;
      if (!authBypass) {
        if (targetUserId === 'SUPER_ADMIN_ROLE') {
          const clientRole = (client as any).role;
          if (clientRole !== 'SUPER_ADMIN') return;
        } else if (targetUserId) {
          const clientUserId = trimId((client as any).userId);
          if (!clientUserId || clientUserId !== targetUserId) {
            return;
          }
        }
      }
      client.send(payload);
    }
  });
}

// [Wakil 6.0] Helper to broadcast thinking phase updates
/**
 * THE CREDENTIAL PROMPT — the feature the wiring audit found disconnected.
 *
 * The browser agent hits `missing_secret:<KEY>` when a step needs a password
 * or an API key it does not have. The web UI carries a complete prompt for
 * exactly that — sessionId, key, provider, label, reason, a form and a submit
 * — waiting on an event called `secret_required`. Nothing in the server ever
 * sent one. So the run reported a step error, the prompt never appeared, and
 * a capability that was fully built on both sides simply never met.
 */
export function broadcastSecretRequired(sessionId: string, key: string, opts?: {
  runId?: string; provider?: string; label?: string; reason?: string;
}): void {
  broadcast({
    type: 'secret_required',
    id: `secret_${sessionId}_${key}`,
    sessionId,
    data: {
      sessionId, key,
      runId: opts?.runId,
      provider: opts?.provider,
      label: opts?.label || key,
      reason: opts?.reason || 'A step needs this credential to continue.',
    },
  } as any);
}

/**
 * Watch every event that leaves this server, without owning a socket.
 *
 * A build harness used to reach in and reassign `ws.broadcast` — which the
 * compiler exposes as a getter, so the assignment threw and the whole e2e
 * proof stopped running unnoticed. An explicit observer says what was meant
 * and cannot break: it never alters an event, and a throwing observer never
 * reaches the wire.
 */
const broadcastObservers = new Set<(event: any) => void>();
export function observeBroadcasts(fn: (event: any) => void): () => void {
    broadcastObservers.add(fn);
    return () => { broadcastObservers.delete(fn); };
}

/**
 * ONE terminal line, sent ONCE.
 *
 * Every builder used to fan the same line out to four ids — the session, the
 * generic 'local' and 'default' tabs, and the shared panel — because any of
 * them might be the tab in front of the user. The field log shows the cost:
 * four `[WS] Broadcast type=terminal_output` entries and four
 * `websocket.outbound.sent` records for one 58-byte line, on every line of
 * every build.
 *
 * The addressing is now IN the message: `id` stays the panel's own stream
 * (so anything that filters on it is unchanged) and `ids` lists every tab
 * this line belongs to. One message, same reach, a quarter of the traffic.
 */
export function broadcastTerminalLine(sessionId: string | undefined, line: string): void {
    const owner = trimId(sessionId);
    // A terminal line without an owner is unsafe: never send it to a shared
    // panel or to whichever session happens to be visible. Callers must carry
    // the run's session identity all the way to this boundary.
    if (!owner) return;

    // `panel-terminal` remains only a compatibility label consumed by the
    // legacy Logs renderer. It is deliberately absent from the routing ids.
    // Delivery is addressed by the session-owned terminal namespace instead.
    const terminalId = `terminal:${owner}`;
    broadcast({
      type: 'terminal_output',
      id: 'panel-terminal',
      ids: [owner, terminalId],
      sessionId: owner,
      data: line,
    } as any);
}

export function broadcastThinkingPhase(sessionId: string, phase: 'analyzing' | 'synthesizing' | 'executing' | 'idle', detail?: string) {
  thinkingEventSeq += 1;
  broadcast({
    type: 'thinking_phase',
    data: { phase, detail, sessionId }, // Include sessionId in data for resolveEventUserId
    id: `tp_${sessionId}_${thinkingEventSeq}`, // Unique ID per event to avoid dedup
    sessionId: sessionId, // Also include at top level for LiveEvent interface
    ts: Date.now()
  });
}

export function broadcastThinkingDetail(sessionId: string, detail: string) {
  thinkingEventSeq += 1;
  broadcast({
    type: 'thinking_detail',
    data: { detail, sessionId }, // Include sessionId in data for resolveEventUserId
    id: `td_${sessionId}_${thinkingEventSeq}`, // Unique ID per event to avoid dedup
    sessionId: sessionId, // Also include at top level for LiveEvent interface
    ts: Date.now()
  });
}

/**
 * The browser agent paused and needs the user to supply a credential / 2FA code.
 * Surface it in JOE'S CHAT (not inside the browser panel) so the user answers
 * right where they are typing. `chatSessionId` routes it to the correct chat;
 * `browserSessionId` tells the chat which live browser to resume afterwards.
 */
export function broadcastBrowserNeedsUser(
  chatSessionId: string,
  payload: { message: string; secretKey: string; browserSessionId: string; url?: string }
) {
  const chatSid = String(chatSessionId || '').trim();
  if (!chatSid) return;
  thinkingEventSeq += 1;
  broadcast({
    type: 'browser_needs_user',
    data: {
      message: String(payload.message || ''),
      secretKey: String(payload.secretKey || ''),
      browserSessionId: String(payload.browserSessionId || ''),
      url: String(payload.url || ''),
      sessionId: chatSid, // for resolveEventUserId + per-session chat filter
    },
    id: `bnu_${chatSid}_${payload.secretKey}_${thinkingEventSeq}`,
    sessionId: chatSid,
    ts: Date.now()
  });
}
