import { API_URL, WS_URL } from '../config';
import { AutoOpenManager } from './AutoOpenManager';
import { saveTrace, type NeuralTrace, type TraceStep } from '../lib/neuralTrace';

const __DEV__ = import.meta.env.DEV;

let socket: WebSocket | null = null;
const listeners: Set<SessionListener<(data: any) => void>> = new Set();
const sessionSubscriptionRefs = new Map<string, number>();
const statusListeners: Set<(status: { state: string; detail?: string }) => void> = new Set();
let pendingQueue: any[] = []; // Changed to any[] to support structured data for deduplication
let connectTimer: any = null;
let isConnecting = false;
let connectingTimeoutTimer: any = null;
const CONNECTING_TIMEOUT = 8000;
const seenMessageIds = new Set<string>(); // Deduplication cache
const MAX_SEEN_IDS = 1000;
type SessionRuntimeState = {
  terminalHistory: string;
  thinkingPhase: 'analyzing' | 'synthesizing' | 'executing' | 'idle';
  thinkingDetails: string[];
  thinkingSteps: TraceStep[];
  runStartedAt: number;
  runSessionId: string;
  thinkingStatus: string;
  taskTrackerData: any[];
  quietMode: boolean;
  lastPreviewUrl: string;
  /**
   * The run currently in flight for THIS session, or ''. Switching chats
   * unmounts the composer and wipes its local state; without this the app
   * forgot that the chat it came back to still had work running, showed an
   * idle composer with no Stop button, and left the run invisible until it
   * happened to emit its next event.
   */
  activeRunId: string;
  /** Ignore late tool/builder events after a cancelled or finished run. */
  closedAt: number;
};

const DEFAULT_SCOPE = '__unscoped__';
const sessionRuntime = new Map<string, SessionRuntimeState>();

function normalizeSessionId(value: any): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function eventSessionId(event: any): string {
  return normalizeSessionId(
    event?.sessionId
      || event?.data?.sessionId
      || event?.data?.data?.sessionId,
  );
}

/** Event kinds that prove a run is still in flight (not its closing word). */
function msgTypeIsLive(type: string): boolean {
  return type !== 'run_finished'
    && type !== 'run_cancelled'
    && type !== 'run_failed'
    && type !== 'run_completed'
    && type !== 'text'
    && type !== 'error';
}

function getSessionRuntime(sessionId?: string): SessionRuntimeState {
  const key = normalizeSessionId(sessionId) || DEFAULT_SCOPE;
  let state = sessionRuntime.get(key);
  if (!state) {
    state = {
      terminalHistory: '',
      thinkingPhase: 'idle',
      thinkingDetails: [],
      thinkingSteps: [],
      runStartedAt: 0,
      runSessionId: '',
      thinkingStatus: '',
      taskTrackerData: [],
      quietMode: false,
      lastPreviewUrl: '',
      activeRunId: '',
      closedAt: 0,
    };
    sessionRuntime.set(key, state);
  }
  return state;
}

type SessionListener<T> = { cb: T; sessionId?: string };

// [Wakil 5.1] Quiet Mode & Source Deduplication
let lastSentPayload: string | null = null;
let connectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20; // Stop reconnecting after 20 attempts
let lastUrl = '';
let triedFallback = false;
let cachedIsShim: boolean | null = null;
let lastShimCheckAt = 0;

// Terminal is conditionally unmounted when the user changes workspace tabs.
// Keep a bounded scrollback per session so a build that starts before the
// Terminal opens can still be inspected by its owner without crossing sessions.
const TERMINAL_HISTORY_CAP = 512_000;
let authProbePromise: Promise<'ok' | 'unauthorized' | 'error'> | null = null;
let lastAuthProbeAt = 0;

// Session listeners are filtered at the transport boundary. A component that
// subscribes with a sessionId never receives another session's live cache.
const thinkingPhaseListeners: Set<SessionListener<(phase: string, sessionId?: string) => void>> = new Set();
const thinkingDetailsListeners: Set<SessionListener<(details: string[], sessionId?: string) => void>> = new Set();
const thinkingStepsListeners: Set<SessionListener<(steps: TraceStep[], sessionId?: string) => void>> = new Set();
const thinkingStatusListeners: Set<SessionListener<(status: string, sessionId?: string) => void>> = new Set();
const taskTrackerListeners: Set<SessionListener<(tasks: any[], sessionId?: string) => void>> = new Set();
/** Fires when a run ends and its trace has been written to the session's history. */
const traceSealedListeners: Set<SessionListener<(trace: NeuralTrace) => void>> = new Set();

function forSession<T>(listeners: Set<SessionListener<T>>, sessionId: string, invoke: (cb: T) => void) {
  const sid = normalizeSessionId(sessionId);
  listeners.forEach(listener => {
    if (!listener.sessionId || listener.sessionId === sid) {
      try { invoke(listener.cb); } catch { }
    }
  });
}

function pushStep(text: string, kind: 'status' | 'detail', sessionId: string) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const state = getSessionRuntime(sessionId);
    const last = state.thinkingSteps[state.thinkingSteps.length - 1];
    if (last && last.text === clean) return;
    if (!state.runStartedAt) {
      state.runStartedAt = Date.now();
      state.runSessionId = normalizeSessionId(sessionId);
    }
    state.thinkingSteps.push({ text: clean, at: Date.now(), phase: state.thinkingPhase, kind });
    forSession(thinkingStepsListeners, sessionId, cb => cb([...state.thinkingSteps], normalizeSessionId(sessionId)));
}

/** Seal only the trace owned by the supplied session. */
function sealTrace(sessionId = '') {
    const sid = normalizeSessionId(sessionId);
    const state = getSessionRuntime(sid);
    const steps = state.thinkingSteps;
    state.thinkingSteps = [];
    const startedAt = state.runStartedAt;
    const traceSid = state.runSessionId || sid;
    state.runStartedAt = 0;
    state.runSessionId = '';
    forSession(thinkingStepsListeners, sid, cb => cb([], sid));
    if (!steps.length || !traceSid) return;
    const trace: NeuralTrace = {
        id: `tr_${traceSid}_${startedAt || steps[0].at}`,
        sessionId: traceSid,
        startedAt: startedAt || steps[0].at,
        endedAt: Date.now(),
        steps,
    };
    saveTrace(trace);
    forSession(traceSealedListeners, traceSid, cb => cb(trace));
}


function computeFallbackWsUrl(primaryUrl: string) {
  const wsFromHttpBase = (httpUrl: string) => {
    let base = httpUrl;
    if (!base.startsWith('http')) {
      // Resolve against current origin if relative
      base = new URL(base, window.location.origin).href;
    }
    base = base.replace(/\/api\/?$/, '');
    return `${base.replace(/^http/i, 'ws')}/api/ws`;
  };
  const candidates = [
    API_URL ? wsFromHttpBase(API_URL) : '',
    wsFromHttpBase(window.location.origin),
  ].filter(Boolean);

  const unique = Array.from(new Set(candidates));
  const filtered = unique.filter((u) => u !== primaryUrl);
  return filtered[0] || '';
}

function syncSessionSubscriptions() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const sessionIds = Array.from(sessionSubscriptionRefs.keys()).filter(Boolean);
  try { socket.send(JSON.stringify({ type: 'session_subscribe', sessionIds })); } catch { }
}

function retainSessionSubscription(sessionId?: string) {
  const sid = normalizeSessionId(sessionId);
  if (!sid) return () => { };
  sessionSubscriptionRefs.set(sid, (sessionSubscriptionRefs.get(sid) || 0) + 1);
  syncSessionSubscriptions();
  return () => {
    const count = sessionSubscriptionRefs.get(sid) || 0;
    if (count <= 1) sessionSubscriptionRefs.delete(sid);
    else sessionSubscriptionRefs.set(sid, count - 1);
    syncSessionSubscriptions();
  };
}

function addSessionListener<T>(collection: Set<SessionListener<T>>, cb: T, sessionId?: string) {
  const sid = normalizeSessionId(sessionId);
  const listener: SessionListener<T> = { cb, sessionId: sid || undefined };
  collection.add(listener);
  const release = retainSessionSubscription(sid);
  return () => { collection.delete(listener); release(); };
}

function setStatus(state: string, detail?: string) {
  statusListeners.forEach((l) => {
    try {
      l({ state, detail });
    } catch { }
  });
}

import { isValidToken } from '../utils/auth';

async function isApiShimActive(): Promise<boolean> {
  const now = Date.now();
  if (cachedIsShim != null && now - lastShimCheckAt < 3000) return cachedIsShim;
  lastShimCheckAt = now;
  try {
    const res = await fetch(`${API_URL}/health`, { cache: 'no-store' });
    cachedIsShim = res.headers.get('x-joe-api-shim') === '1';
    return cachedIsShim;
  } catch {
    cachedIsShim = false;
    return false;
  }
}

async function probeAuth(token: string): Promise<'ok' | 'unauthorized' | 'error'> {
  const now = Date.now();
  if (authProbePromise && now - lastAuthProbeAt < 5000) return authProbePromise;
  lastAuthProbeAt = now;
  authProbePromise = (async () => {
    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return 'unauthorized';
      if (!res.ok) return 'error';
      return 'ok';
    } catch {
      return 'error';
    } finally {
      window.setTimeout(() => {
        authProbePromise = null;
      }, 0);
    }
  })();
  return authProbePromise;
}

async function connect() {
  if (!WS_URL) {
    if (__DEV__) console.warn('[Socket] WS_URL is missing or empty');
    return;
  }

  // [Wakil 4.7] Strict Singleton Guard
  if (isConnecting) {
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    return;
  }

  isConnecting = true;
  if (connectingTimeoutTimer) clearTimeout(connectingTimeoutTimer);
  connectingTimeoutTimer = setTimeout(() => {
    if (isConnecting) {
      if (__DEV__) console.warn('[Socket] Connection attempt timed out, resetting');
      isConnecting = false;
      connect();
    }
  }, CONNECTING_TIMEOUT);

  const token = localStorage.getItem('token');

  if (connectTimer != null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }

  if (await isApiShimActive()) {
    setStatus('error', 'api_shim');
    isConnecting = false; // UNLOCK on bail
    connectTimer = window.setTimeout(() => void connect(), 15000);
    return;
  }

  const primaryUrl = WS_URL;
  const fallbackUrl = computeFallbackWsUrl(primaryUrl);
  let urlToUse = (triedFallback || !fallbackUrl) ? primaryUrl : (connectAttempts > 0 ? fallbackUrl : primaryUrl);

  // Check max reconnection attempts
  if (connectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    if (__DEV__) console.warn(`[Socket] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached.`);
    setStatus('error', 'max_reconnect_attempts_exceeded');
    isConnecting = false;
    return;
  }

  // Append Token via subprotocol header instead of URL query parameter for security
  const u = new URL(urlToUse);
  if (token) {
    u.searchParams.set('token', token);
  }
  urlToUse = u.toString();

  lastUrl = urlToUse;

  let opened = false;
  const startedAt = Date.now();
  setStatus(connectAttempts > 0 ? 'reconnecting' : 'connecting', urlToUse);

  try {
    if (socket) {
      try { socket.close(); } catch { }
      socket = null;
    }
    socket = new WebSocket(urlToUse);
  } catch (err) {
    if (__DEV__) console.warn('[Socket] new WebSocket() threw:', err);
    isConnecting = false; // UNLOCK
    return;
  }

  socket.onopen = (event) => {
    const ws = event.target as WebSocket;
    opened = true;
    isConnecting = false;
    if (connectingTimeoutTimer) clearTimeout(connectingTimeoutTimer);
    connectAttempts = 0;
    triedFallback = false;
    setStatus('connected', lastUrl);

    // Initial heartbeat and an explicit server-side session subscription. The
    // socket is shared by tabs, but event ownership is not.
    SocketService.send({ type: 'heartbeat', ts: Date.now() });
    syncSessionSubscriptions();

    // Flush pending safely using the socket instance that just opened
    const toFlush = [...pendingQueue];
    pendingQueue = [];

    for (const item of toFlush) {
      const payload = typeof item === 'string' ? item : JSON.stringify(item);
      try {
        ws.send(payload);
      } catch (err) {
        if (__DEV__) console.warn('[Socket] Flush error:', err);
      }
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // [Wakil 4.7] Deduplication Logic
      // Terminal streams carry the SESSION id in `id` — the same value on every
      // chunk — so deduping by it swallowed all output after the first chunk
      // and made the manual terminal look dead. Streams are never deduped.
      const isStream = data.type === 'terminal_output' || data.type === 'terminal_input' || data.type === 'terminal_resize';
      const id = isStream ? null : (data.id || data.seq || (data.ts && data.type ? `${data.type}:${data.ts}` : null));
      if (id) {
        const key = String(id);
        if (seenMessageIds.has(key)) {
          // Silently skip duplicate (reduced from verbose logging)
          return;
        }
        seenMessageIds.add(key);
        if (seenMessageIds.size > MAX_SEEN_IDS) {
          // Simple prune
          const it = seenMessageIds.values();
          for (let i = 0; i < 200; i++) {
            const res = it.next();
            if (res.done) break;
            seenMessageIds.delete(res.value);
          }
        }
      }

      // [Wakil 5.5] Auto Quiet Mode & Thinking Phase Management
      const msgType = String(data?.type || '');
      // Every runtime cache is owned by the event's session. Events without a
      // session id remain in the legacy unscoped bucket and are never promoted
      // into a named session by the frontend.
      const evSid = eventSessionId(data);
      const runtime = getSessionRuntime(evSid);
      // A cancelled tool may finish its current child process and emit a few
      // late lines. Those lines are evidence for Logs, not a new live run. If
      // they re-enter the live state here, the Stop button and neural row can
      // resurrect seconds after the user stopped the task. A new run_started
      // explicitly opens the session again.
      if (runtime.closedAt > 0 && msgType !== 'run_started') {
        const lateRunId = normalizeSessionId(data?.runId || data?.data?.runId);
        const closedRunId = runtime.activeRunId;
        const isClosingEvent = msgType === 'run_finished'
          || msgType === 'run_cancelled'
          || msgType === 'run_failed'
          || msgType === 'run_completed';
        if (!isClosingEvent || (lateRunId && closedRunId && lateRunId !== closedRunId)) return;
      }
      // Any event of a live run names it; the first one that does adopts the id
      // for the session, so a chat switched away from and back to still knows
      // which run to stop.
      const evRunId = normalizeSessionId(data?.runId || data?.data?.runId);
      if (evRunId && msgTypeIsLive(String(data?.type || ''))) runtime.activeRunId = evRunId;
      if (msgType === 'terminal_output' && typeof data?.data === 'string') {
        runtime.terminalHistory += data.data;
        if (runtime.terminalHistory.length > TERMINAL_HISTORY_CAP) {
          runtime.terminalHistory = runtime.terminalHistory.slice(-TERMINAL_HISTORY_CAP);
        }
      }
      const emitPhase = (p: any) => {
        runtime.thinkingPhase = p;
        forSession(thinkingPhaseListeners, evSid, cb => cb(p, evSid));
      };

      // [Wakil 6.0] Handle explicit thinking_phase messages
      if (msgType === 'thinking_phase') {
        const phase = data?.data?.phase;
        const detail = data?.data?.detail;
        if (phase && ['analyzing', 'synthesizing', 'executing', 'idle'].includes(phase)) {
          emitPhase(phase);

          if (detail !== undefined) {
            runtime.thinkingStatus = detail || ''; // Allow empty string to clear
            forSession(thinkingStatusListeners, evSid, cb => cb(runtime.thinkingStatus, evSid));
            // The headline is the ONLY thing many runs ever show — his own
            // screenshot is one line, «جاري تنفيذ: react project». A trace that
            // recorded details alone would be empty for exactly those runs.
            if (runtime.thinkingStatus) pushStep(runtime.thinkingStatus, 'status', evSid);
          }
        }
      } else if (msgType === 'thinking_detail') {
        const detail = data?.data?.detail;
        if (detail && typeof detail === 'string') {
          runtime.thinkingDetails.push(detail);
          forSession(thinkingDetailsListeners, evSid, cb => cb([...runtime.thinkingDetails], evSid));
          pushStep(detail, 'detail', evSid);
        }
      }

      // Auto phase management based on events
      if (msgType === 'step_started' || msgType === 'user_input') {
        // `step_started` is emitted only for BROWSER nodes, so a page build —
        // the commonest run there is — never entered quiet mode and none of the
        // transitions below could fire. `user_input` is broadcast at the start
        // of every run, whatever it turns out to be.
        if (!runtime.quietMode) {
          runtime.quietMode = true;
          emitPhase('analyzing');
        }
      } else if (msgType === 'step_done' || msgType === 'step_failed') {
        if (runtime.quietMode) {
          emitPhase('synthesizing');
        }
      } else if (msgType === 'tool_started') {   // the server's only name for it
        // BOTH names. The backend emits `tool_started`; this listened only for
        // `tool_start`, so it never matched once — the phase never reached
        // 'executing' and the live thinking panel had nothing to turn on for.
        // A silent name mismatch between two halves of the same feature.
        if (runtime.quietMode) {
          emitPhase('executing');
        }
      } else if (
        msgType === 'run_finished'
        || msgType === 'run_cancelled'
        || msgType === 'run_failed'
        || msgType === 'run_completed'
        || msgType === 'text'
      ) {
        // A finished run is not a thinking run — whether or not quiet mode was
        // ever entered. Returning to idle used to be conditional on `quietMode`,
        // which is only set by `user_input` / `step_started`; a run driven purely
        // by `thinking_phase` events therefore never came back, and the card sat
        // on screen saying «جو ينفّذ» after the answer had already arrived.
        runtime.quietMode = false;
        runtime.thinkingStatus = '';
        runtime.closedAt = Date.now();
        runtime.activeRunId = '';
        emitPhase('idle');
        forSession(thinkingStatusListeners, evSid, cb => cb('', evSid));
        // Sealed on the way out, whatever ended the run. The steps were about to
        // be dropped on the floor here — that is precisely why the chat kept the
        // answer and lost the work that produced it.
        sealTrace(evSid);
      } else if (msgType === 'thought') {
        // [Wakil 6.0] Matrix-style thought logs
        const text = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
        if (text) {
          runtime.thinkingDetails.push(text);
          forSession(thinkingDetailsListeners, evSid, cb => cb([...runtime.thinkingDetails], evSid));
          pushStep(text, 'detail', evSid);
        }
      } else if (msgType === 'run_started') {
        // Reset only the runtime owned by this run. A concurrent run in another
        // session has its own trace, phase, task list, and history.
        sealTrace(evSid);
        runtime.runStartedAt = Date.now();
        runtime.runSessionId = evSid;
        runtime.closedAt = 0;
        if (evRunId) runtime.activeRunId = evRunId;
        runtime.thinkingDetails = [];
        runtime.thinkingStatus = '';
        runtime.taskTrackerData = [];
        forSession(thinkingDetailsListeners, evSid, cb => cb([], evSid));
        forSession(thinkingStatusListeners, evSid, cb => cb('', evSid));
        emitPhase('analyzing');
        forSession(taskTrackerListeners, evSid, cb => cb([], evSid));
      } else if (msgType === 'todo_update') {   // 'task_tracker' was never a server event
        // [New] Receive task lists from the API (Unifying task_tracker and todo_update)
        const rawData = data?.data || [];
        const tasks = Array.isArray(rawData) ? rawData : (rawData.todos || []);

        // Map 'content' to 'label' for backward compatibility with TaskTracker.tsx component
        const mappedTasks = tasks.map((t: any) => ({
          ...t,
          label: t.label || t.content || t.text
        }));

        runtime.taskTrackerData = mappedTasks;
        forSession(taskTrackerListeners, evSid, cb => cb([...mappedTasks], evSid));

        // Also dispatch to TodosPanel-specific handlers if needed (already handled by general listeners)
      } else if (msgType === 'workspace_updated') {
        // [Pipeline Fix] When a new project is built, refresh File Explorer
        const wsData = data?.data || {};
        window.dispatchEvent(new CustomEvent('workspace:updated', { detail: wsData }));
      } else if (msgType === 'build_progress') {
        // [Flow Agent] Live build progress events for PreviewPanel overlay
        const progressData = { ...(data?.data || {}), sessionId: evSid };
        window.dispatchEvent(new CustomEvent('preview:build_progress', { detail: progressData }));
      } else if (msgType === 'preview_ready') {   // 'preview_url' was never sent by anyone
        // [Preview Pipeline] When the API sends a preview URL, dispatch it to PreviewPanel
        const url = data?.data?.url || data?.url;
        if (url) {
          runtime.lastPreviewUrl = url;
          window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url, sessionId: evSid } }));
        } else if (data?.data?.type === 'refresh' && runtime.lastPreviewUrl) {
          // A refresh with no new url only re-dispatches this session's URL.
          window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url: runtime.lastPreviewUrl, sessionId: evSid } }));
        }
      } else if (msgType === 'diff') {
        // [Code Preview] When a file is created or modified, notify the PreviewPanel
        const path = data?.data?.path;
        const content = data?.data?.content;
        if (path && content !== undefined) {
          // An explicit surgical edit DOES deserve the screen — the user asked
          // for that change and wants to see it.
          window.dispatchEvent(new CustomEvent('preview:code_diff', { detail: { path, content, focus: true, sessionId: evSid } }));
        }
      } else if (msgType === 'file_stream') {
        /**
         * THE «<>» VIEW LISTENED FOR AN EVENT NO BUILD EVER SENDS.
         *
         * It only ever woke on `diff`, which is broadcast by exactly two
         * surgical-edit paths in SystemTools. Every BUILD — the React
         * scaffolder, the API scaffolder, the page builder — writes its files
         * with `file_stream`. So after a normal build the code tab sat empty
         * forever: «الرمز الذي بجنبه لا يعمل ابدا». He was right, and it had
         * never worked, not once.
         *
         * A finished file is a file worth showing; a half-streamed chunk is
         * not, so only `done` frames land here.
         */
        const d = data?.data || {};
        const file = d.file || d.path;
        const content = d.chunk ?? d.content;
        if (file && content !== undefined && d.done) {
          // …but a build writing twenty files must NOT yank him to the code
          // view twenty times. The content is loaded; «<>» is his to press.
          window.dispatchEvent(new CustomEvent('preview:code_diff', { detail: { path: file, content: String(content), focus: false, sessionId: evSid } }));
        }
      }

      try {
        AutoOpenManager.processStepEvent(data);
      } catch { }

      forSession(listeners, evSid, cb => cb(data));
    } catch (e) {
    }
  };

  socket.onclose = (ev) => {
    if (socket === ev.target) {
      socket = null;
    }
    isConnecting = false; // UNLOCK just in case

    const reason = String((ev as any)?.reason || '');
    if (ev?.code === 1008 || reason.startsWith('unauthorized')) {
      try {
        localStorage.removeItem('token');
      } catch { }
      try {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      } catch { }
      if (connectTimer) {
        window.clearTimeout(connectTimer);
        connectTimer = null;
      }
      setStatus('unauthorized', reason || `code:${String(ev?.code || '')}`);
      return;
    }
    const closedEarly = !opened && Date.now() - startedAt < 2000;
    if (closedEarly && !triedFallback) {
      triedFallback = true;
      connectAttempts = 1;
      setStatus('error', `closed_early:${String(ev?.code || '')}`);
      connectTimer = window.setTimeout(() => void connect(), 250);
      return;
    }

    if (closedEarly && triedFallback) {
      const tokenNow = (() => {
        try {
          return localStorage.getItem('token');
        } catch {
          return null;
        }
      })();
      if (tokenNow && isValidToken(tokenNow)) {
        setStatus('checking_auth', lastUrl);
        void probeAuth(String(tokenNow)).then((r) => {
          if (r === 'unauthorized') {
            try {
              localStorage.removeItem('token');
            } catch { }
            try {
              window.dispatchEvent(new CustomEvent('auth:unauthorized'));
            } catch { }
            if (connectTimer) {
              window.clearTimeout(connectTimer);
              connectTimer = null;
            }
            setStatus('unauthorized', 'probe_401');
            return;
          }

          connectAttempts += 1;
          const baseDelay = Math.min(8000, 500 * Math.pow(2, Math.max(0, connectAttempts - 1)));
          const jitter = Math.floor(Math.random() * 250);
          connectTimer = window.setTimeout(() => void connect(), baseDelay + jitter);
        });
        return;
      }
    }

    connectAttempts += 1;
    const baseDelay = Math.min(8000, 500 * Math.pow(2, Math.max(0, connectAttempts - 1)));
    const jitter = Math.floor(Math.random() * 250);
    connectTimer = window.setTimeout(() => void connect(), baseDelay + jitter);
  };

  socket.onerror = (e) => {
    isConnecting = false; // UNLOCK
    setStatus('error', lastUrl);
  };
}

export const SocketService = {
  connect,
  // [Wakil 4.7] Force Reset (for logout)
  disconnect() {
    if (socket) {
      socket.close();
      socket = null;
    }
    if (connectTimer) {
      window.clearTimeout(connectTimer);
      connectTimer = null;
    }
    isConnecting = false;
    pendingQueue = [];
    seenMessageIds.clear();
    lastSentPayload = null;
  },
  // [Wakil 5.1] Quiet Mode controls
  setQuietMode(enabled: boolean, sessionId?: string) {
    getSessionRuntime(sessionId).quietMode = enabled;
  },
  isQuietMode(sessionId?: string) {
    return getSessionRuntime(sessionId).quietMode;
  },
  send(data: any) {
    // [Wakil 5.2] Quiet mode is owned by the message's session. A run in one
    // session must never suppress commands emitted by another session.
    const criticalSignals = ['run', 'stop', 'join_session', 'heartbeat', 'terminal_input', 'terminal_resize'];
    const isCritical = data && criticalSignals.includes(data.type);
    const sendSessionId = normalizeSessionId(data?.sessionId);

    if (getSessionRuntime(sendSessionId).quietMode && !isCritical) {
      return; // NO SEND. NO QUEUE. ZERO TRAFFIC for this session only.
    }

    const msg = JSON.stringify(data);

    // [Wakil 5.1] Source-level deduplication
    // EXEMPT terminal_input from deduplication (must allow "aa")
    const isTerminalInput = data && data.type === 'terminal_input';
    if (!isTerminalInput && msg === lastSentPayload) {
      return;
    }
    if (!isTerminalInput) {
      lastSentPayload = msg;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      if (isTerminalInput) {
        console.debug('terminal_socket_send_open', data.data);
      }
      socket.send(msg);
    } else {
      // SMART QUEUEING & DEDUPLICATION
      if (isTerminalInput) {
        console.debug('terminal_socket_queued', data.data);
      }
      if (data && data.type === 'terminal_resize') {
        const existingIdx = pendingQueue.findIndex(q => q && typeof q !== 'string' && q.type === 'terminal_resize' && q.id === data.id);
        if (existingIdx !== -1) {
          pendingQueue[existingIdx] = data;
          return;
        }
      }

      pendingQueue.push(data); // Store as object for better deduplication in future if needed
      if (!socket && !isConnecting) connect();
      else if (socket && socket.readyState === WebSocket.CLOSED && !isConnecting) connect();
    }
  },
  sendMessage(sessionId: string, text: string) {
    this.send({
      type: 'text',
      sessionId,
      text,
      ts: Date.now()
    });
  },
  /** Bounded scrollback used when the visible Terminal panel remounts. */
  getTerminalHistory(sessionId?: string) {
    return getSessionRuntime(sessionId).terminalHistory;
  },
  clearTerminalHistory(sessionId?: string) {
    getSessionRuntime(sessionId).terminalHistory = '';
  },
  subscribe(cb: (data: any) => void, sessionId?: string) {
    const release = addSessionListener(listeners, cb, sessionId);
    if (!socket && !isConnecting) connect();
    return release;
  },
  /**
   * Deliver a locally-born event to the message subscribers as if the server
   * had sent it. The user's own prompt must appear in the chat the instant
   * Enter is pressed; the server's echo lands seconds later, once the run has
   * actually initialized, and the chat list only ever listened to that echo.
   */
  injectLocal(event: any) {
    const sid = String(event?.sessionId || event?.data?.sessionId || '');
    forSession(listeners, sid, (cb: any) => cb(event));
  },
  subscribeStatus(cb: (status: { state: string; detail?: string }) => void) {
    statusListeners.add(cb);
    if (!socket && !isConnecting) connect();
    return () => { statusListeners.delete(cb); };
  },
  // [Wakil 5.3] Thinking Phase State
  setThinkingPhase(phase: 'analyzing' | 'synthesizing' | 'executing' | 'idle', sessionId?: string) {
    const state = getSessionRuntime(sessionId);
    const sid = normalizeSessionId(sessionId);
    state.thinkingPhase = phase;
    forSession(thinkingPhaseListeners, sid, cb => cb(phase, sid));
  },
  getThinkingPhase(sessionId?: string) {
    return getSessionRuntime(sessionId).thinkingPhase;
  },
  subscribeThinkingPhase(cb: (phase: string, sessionId?: string) => void, sessionId?: string) {
    cb(getSessionRuntime(sessionId).thinkingPhase, normalizeSessionId(sessionId));
    return addSessionListener(thinkingPhaseListeners, cb, sessionId);
  },
  subscribeThinkingDetails(cb: (details: string[], sessionId?: string) => void, sessionId?: string) {
    cb([...getSessionRuntime(sessionId).thinkingDetails], normalizeSessionId(sessionId));
    return addSessionListener(thinkingDetailsListeners, cb, sessionId);
  },
  /** The same stream with timestamps and phases — what the timeline renders. */
  subscribeThinkingSteps(cb: (steps: TraceStep[], sessionId?: string) => void, sessionId?: string) {
    cb([...getSessionRuntime(sessionId).thinkingSteps], normalizeSessionId(sessionId));
    return addSessionListener(thinkingStepsListeners, cb, sessionId);
  },
  /** Fires once per finished run, after the trace is written to the session. */
  subscribeTraceSealed(cb: (trace: NeuralTrace) => void, sessionId?: string) {
    return addSessionListener(traceSealedListeners, cb, sessionId);
  },
  getRunStartedAt(sessionId?: string) {
    return getSessionRuntime(sessionId).runStartedAt;
  },
  /** The run still in flight for this session, or '' when it is idle. */
  getActiveRunId(sessionId?: string) {
    return getSessionRuntime(sessionId).activeRunId;
  },
  /** True while this session has a run the server has not finished yet. */
  isSessionRunning(sessionId?: string) {
    const state = getSessionRuntime(sessionId);
    return state.runStartedAt > 0 && state.thinkingPhase !== 'idle';
  },
  subscribeThinkingStatus(cb: (status: string, sessionId?: string) => void, sessionId?: string) {
    cb(getSessionRuntime(sessionId).thinkingStatus, normalizeSessionId(sessionId));
    return addSessionListener(thinkingStatusListeners, cb, sessionId);
  },
  // [New] Task Tracker Subscription
  subscribeTaskTracker(cb: (tasks: any[], sessionId?: string) => void, sessionId?: string) {
    cb([...getSessionRuntime(sessionId).taskTrackerData], normalizeSessionId(sessionId));
    return addSessionListener(taskTrackerListeners, cb, sessionId);
  },
  // [Wakil 6.1] Get last preview URL (for mount-time read)
  getLastPreviewUrl(sessionId?: string) {
    return getSessionRuntime(sessionId).lastPreviewUrl;
  }
};
