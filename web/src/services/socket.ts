import { API_URL, WS_URL } from '../config';
import { AutoOpenManager } from './AutoOpenManager';
import { saveTrace, type NeuralTrace, type TraceStep } from '../lib/neuralTrace';

const __DEV__ = import.meta.env.DEV;

let socket: WebSocket | null = null;
const listeners: Set<(data: any) => void> = new Set();
const statusListeners: Set<(status: { state: string; detail?: string }) => void> = new Set();
let pendingQueue: any[] = []; // Changed to any[] to support structured data for deduplication
let connectTimer: any = null;
let isConnecting = false;
let connectingTimeoutTimer: any = null;
const CONNECTING_TIMEOUT = 8000;
const seenMessageIds = new Set<string>(); // Deduplication cache
const MAX_SEEN_IDS = 1000;
let _lastPreviewUrl = '';

// [Wakil 5.1] Quiet Mode & Source Deduplication
let quietMode = false;
let lastSentPayload: string | null = null;
let connectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 20; // Stop reconnecting after 20 attempts
let lastUrl = '';
let triedFallback = false;
let cachedIsShim: boolean | null = null;
let lastShimCheckAt = 0;

// Terminal is conditionally unmounted when the user changes workspace tabs.
// Keep a bounded, connection-local scrollback so a build that starts before
// the Terminal opens can still be inspected by its owner.
const TERMINAL_HISTORY_CAP = 512_000;
let terminalHistory = '';
let authProbePromise: Promise<'ok' | 'unauthorized' | 'error'> | null = null;
let lastAuthProbeAt = 0;

// [Wakil 5.3] Neural Thinking Indicator State
let thinkingPhase: 'analyzing' | 'synthesizing' | 'executing' | 'idle' = 'idle';
const thinkingPhaseListeners: Set<(phase: string, sessionId?: string) => void> = new Set();

// [Wakil 6.0] Deep Reasoning State
let thinkingDetails: string[] = [];
const thinkingDetailsListeners: Set<(details: string[]) => void> = new Set();

// The same reasoning, kept as STRUCTURE rather than strings: every line carries
// the moment it arrived and the phase that was running, so the indicator can
// show measured durations and the trace can outlive the run. `thinkingDetails`
// above stays exactly as it was — nothing that already reads it changes.
let thinkingSteps: TraceStep[] = [];
const thinkingStepsListeners: Set<(steps: TraceStep[]) => void> = new Set();
let runStartedAt = 0;
let runSessionId = '';
/** Fires when a run ends and its trace has been written to the session's history. */
const traceSealedListeners: Set<(trace: NeuralTrace) => void> = new Set();

function pushStep(text: string, kind: 'status' | 'detail', sessionId: string) {
    const clean = String(text || '').trim();
    if (!clean) return;
    const last = thinkingSteps[thinkingSteps.length - 1];
    // A status headline is REPLACED in place while it is on screen, so the same
    // text arriving twice is one event, not two steps.
    if (last && last.text === clean) return;
    if (!runStartedAt) { runStartedAt = Date.now(); runSessionId = sessionId; }
    if (sessionId && !runSessionId) runSessionId = sessionId;
    thinkingSteps.push({ text: clean, at: Date.now(), phase: thinkingPhase, kind });
    thinkingStepsListeners.forEach(cb => { try { cb([...thinkingSteps]); } catch { } });
}

/**
 * The run is over: write what Joe did into the session's history so the chat
 * can show a receipt for it forever, then clear the live state.
 */
function sealTrace() {
    const steps = thinkingSteps;
    thinkingSteps = [];
    const startedAt = runStartedAt;
    const sid = runSessionId;
    runStartedAt = 0;
    runSessionId = '';
    thinkingStepsListeners.forEach(cb => { try { cb([]); } catch { } });
    if (!steps.length || !sid) return;
    const trace: NeuralTrace = {
        id: `tr_${sid}_${startedAt || steps[0].at}`,
        sessionId: sid,
        startedAt: startedAt || steps[0].at,
        endedAt: Date.now(),
        steps,
    };
    saveTrace(trace);
    traceSealedListeners.forEach(cb => { try { cb(trace); } catch { } });
}

// [ELITE SPEC] Thinking Status (Short human-friendly status like "Navigating...")
let thinkingStatus = '';
const thinkingStatusListeners: Set<(status: string) => void> = new Set();

// [New] Task Tracker State
let taskTrackerData: any[] = [];
const taskTrackerListeners: Set<(tasks: any[]) => void> = new Set();

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

    // Initial heartbeat
    SocketService.send({ type: 'heartbeat', ts: Date.now() });

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
      if (msgType === 'terminal_output' && typeof data?.data === 'string') {
        terminalHistory += data.data;
        if (terminalHistory.length > TERMINAL_HISTORY_CAP) {
          terminalHistory = terminalHistory.slice(-TERMINAL_HISTORY_CAP);
        }
      }
      // Which session this event belongs to — so the neural indicator only shows
      // in the session that is actually running (no cross-session leak).
      const evSid = String(data?.sessionId || data?.data?.sessionId || '');
      const emitPhase = (p: any) => {
        thinkingPhase = p;
        thinkingPhaseListeners.forEach(cb => { try { cb(p, evSid); } catch { } });
      };

      // [Wakil 6.0] Handle explicit thinking_phase messages
      if (msgType === 'thinking_phase') {
        const phase = data?.data?.phase;
        const detail = data?.data?.detail;
        if (phase && ['analyzing', 'synthesizing', 'executing', 'idle'].includes(phase)) {
          emitPhase(phase);

          if (detail !== undefined) {
            thinkingStatus = detail || ''; // Allow empty string to clear
            thinkingStatusListeners.forEach(cb => { try { cb(thinkingStatus); } catch { } });
            // The headline is the ONLY thing many runs ever show — his own
            // screenshot is one line, «جاري تنفيذ: react project». A trace that
            // recorded details alone would be empty for exactly those runs.
            if (thinkingStatus) pushStep(thinkingStatus, 'status', evSid);
          }
        }
      } else if (msgType === 'thinking_detail') {
        const detail = data?.data?.detail;
        if (detail && typeof detail === 'string') {
          thinkingDetails.push(detail);
          thinkingDetailsListeners.forEach(cb => { try { cb([...thinkingDetails]); } catch { } });
          pushStep(detail, 'detail', evSid);
        }
      }

      // Auto phase management based on events
      if (msgType === 'step_started' || msgType === 'user_input') {
        // `step_started` is emitted only for BROWSER nodes, so a page build —
        // the commonest run there is — never entered quiet mode and none of the
        // transitions below could fire. `user_input` is broadcast at the start
        // of every run, whatever it turns out to be.
        if (!quietMode) {
          quietMode = true;
          emitPhase('analyzing');
        }
      } else if (msgType === 'step_done' || msgType === 'step_failed') {
        if (quietMode) {
          emitPhase('synthesizing');
        }
      } else if (msgType === 'tool_started') {   // the server's only name for it
        // BOTH names. The backend emits `tool_started`; this listened only for
        // `tool_start`, so it never matched once — the phase never reached
        // 'executing' and the live thinking panel had nothing to turn on for.
        // A silent name mismatch between two halves of the same feature.
        if (quietMode) {
          emitPhase('executing');
        }
      } else if (msgType === 'run_finished' || msgType === 'text') {
        // A finished run is not a thinking run — whether or not quiet mode was
        // ever entered. Returning to idle used to be conditional on `quietMode`,
        // which is only set by `user_input` / `step_started`; a run driven purely
        // by `thinking_phase` events therefore never came back, and the card sat
        // on screen saying «جو ينفّذ» after the answer had already arrived.
        quietMode = false;
        thinkingStatus = '';
        emitPhase('idle');
        thinkingStatusListeners.forEach(cb => { try { cb(''); } catch { } });
        // Sealed on the way out, whatever ended the run. The steps were about to
        // be dropped on the floor here — that is precisely why the chat kept the
        // answer and lost the work that produced it.
        sealTrace();
      } else if (msgType === 'thought') {
        // [Wakil 6.0] Matrix-style thought logs
        const text = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
        if (text) {
          thinkingDetails.push(text);
          thinkingDetailsListeners.forEach(cb => { try { cb([...thinkingDetails]); } catch { } });
          pushStep(text, 'detail', evSid);
        }
      } else if (msgType === 'run_started') {
        // Reset state and immediately activate 'analyzing' phase for neural indicator
        // A run that starts while another is still open seals the open one first,
        // rather than letting two runs share one trace.
        sealTrace();
        runStartedAt = Date.now();
        runSessionId = evSid;
        thinkingDetails = [];
        thinkingStatus = '';
        taskTrackerData = []; // Reset tasks on new run
        thinkingDetailsListeners.forEach(cb => { try { cb([]); } catch { } });
        thinkingStatusListeners.forEach(cb => { try { cb(''); } catch { } });
        emitPhase('analyzing');
        taskTrackerListeners.forEach(cb => { try { cb([]); } catch { } });
      } else if (msgType === 'todo_update') {   // 'task_tracker' was never a server event
        // [New] Receive task lists from the API (Unifying task_tracker and todo_update)
        const rawData = data?.data || [];
        const tasks = Array.isArray(rawData) ? rawData : (rawData.todos || []);

        // Map 'content' to 'label' for backward compatibility with TaskTracker.tsx component
        const mappedTasks = tasks.map((t: any) => ({
          ...t,
          label: t.label || t.content || t.text
        }));

        taskTrackerData = mappedTasks;
        taskTrackerListeners.forEach(cb => { try { cb(mappedTasks); } catch { } });

        // Also dispatch to TodosPanel-specific handlers if needed (already handled by general listeners)
      } else if (msgType === 'workspace_updated') {
        // [Pipeline Fix] When a new project is built, refresh File Explorer
        const wsData = data?.data || {};
        window.dispatchEvent(new CustomEvent('workspace:updated', { detail: wsData }));
      } else if (msgType === 'build_progress') {
        // [Flow Agent] Live build progress events for PreviewPanel overlay
        const progressData = data?.data || {};
        window.dispatchEvent(new CustomEvent('preview:build_progress', { detail: progressData }));
      } else if (msgType === 'preview_ready') {   // 'preview_url' was never sent by anyone
        // [Preview Pipeline] When the API sends a preview URL, dispatch it to PreviewPanel
        const url = data?.data?.url || data?.url;
        if (url) {
          _lastPreviewUrl = url;
          window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url } }));
        } else if (data?.data?.type === 'refresh' && _lastPreviewUrl) {
          // A refresh with no new url: re-dispatch the last one so the panel
          // still switches at the end of a long build.
          window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url: _lastPreviewUrl } }));
        }
      } else if (msgType === 'diff') {
        // [Code Preview] When a file is created or modified, notify the PreviewPanel
        const path = data?.data?.path;
        const content = data?.data?.content;
        if (path && content !== undefined) {
          // An explicit surgical edit DOES deserve the screen — the user asked
          // for that change and wants to see it.
          window.dispatchEvent(new CustomEvent('preview:code_diff', { detail: { path, content, focus: true } }));
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
          window.dispatchEvent(new CustomEvent('preview:code_diff', { detail: { path: file, content: String(content), focus: false } }));
        }
      }

      try {
        AutoOpenManager.processStepEvent(data);
      } catch { }

      listeners.forEach(l => l(data));
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
  setQuietMode(enabled: boolean) {
    quietMode = enabled;
  },
  isQuietMode() {
    return quietMode;
  },
  send(data: any) {
    // [Wakil 5.2] HARD Quiet Mode: Block ALL outgoing traffic EXCEPT critical signals
    const criticalSignals = ['run', 'stop', 'join_session', 'heartbeat', 'terminal_input', 'terminal_resize'];
    const isCritical = data && criticalSignals.includes(data.type);

    if (quietMode && !isCritical) {
      return; // NO SEND. NO QUEUE. ZERO TRAFFIC.
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
  getTerminalHistory() {
    return terminalHistory;
  },
  clearTerminalHistory() {
    terminalHistory = '';
  },
  subscribe(cb: (data: any) => void) {
    listeners.add(cb);
    if (!socket && !isConnecting) connect();
    return () => { listeners.delete(cb); };
  },
  subscribeStatus(cb: (status: { state: string; detail?: string }) => void) {
    statusListeners.add(cb);
    if (!socket && !isConnecting) connect();
    return () => { statusListeners.delete(cb); };
  },
  // [Wakil 5.3] Thinking Phase State
  setThinkingPhase(phase: 'analyzing' | 'synthesizing' | 'executing' | 'idle') {
    thinkingPhase = phase;
    thinkingPhaseListeners.forEach(cb => {
      try { cb(phase); } catch { }
    });
  },
  getThinkingPhase() {
    return thinkingPhase;
  },
  subscribeThinkingPhase(cb: (phase: string, sessionId?: string) => void) {
    thinkingPhaseListeners.add(cb);
    return () => { thinkingPhaseListeners.delete(cb); };
  },
  subscribeThinkingDetails(cb: (details: string[]) => void) {
    cb([...thinkingDetails]);
    thinkingDetailsListeners.add(cb);
    return () => { thinkingDetailsListeners.delete(cb); };
  },
  /** The same stream with timestamps and phases — what the timeline renders. */
  subscribeThinkingSteps(cb: (steps: TraceStep[]) => void) {
    cb([...thinkingSteps]);
    thinkingStepsListeners.add(cb);
    return () => { thinkingStepsListeners.delete(cb); };
  },
  /** Fires once per finished run, after the trace is written to the session. */
  subscribeTraceSealed(cb: (trace: NeuralTrace) => void) {
    traceSealedListeners.add(cb);
    return () => { traceSealedListeners.delete(cb); };
  },
  getRunStartedAt() {
    return runStartedAt;
  },
  subscribeThinkingStatus(cb: (status: string) => void) {
    cb(thinkingStatus);
    thinkingStatusListeners.add(cb);
    return () => { thinkingStatusListeners.delete(cb); };
  },
  // [New] Task Tracker Subscription
  subscribeTaskTracker(cb: (tasks: any[]) => void) {
    cb([...taskTrackerData]);
    taskTrackerListeners.add(cb);
    return () => { taskTrackerListeners.delete(cb); };
  },
  // [Wakil 6.1] Get last preview URL (for mount-time read)
  getLastPreviewUrl() {
    return _lastPreviewUrl;
  }
};
