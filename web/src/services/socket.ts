import { API_URL, WS_URL } from '../config';

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

// [Wakil 5.3] Neural Thinking Indicator State
let thinkingPhase: 'analyzing' | 'synthesizing' | 'executing' | 'idle' = 'idle';
const thinkingPhaseListeners: Set<(phase: string) => void> = new Set();

// [Wakil 6.0] Deep Reasoning State
let thinkingDetails: string[] = [];
const thinkingDetailsListeners: Set<(details: string[]) => void> = new Set();


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
  console.log('[Socket Debug] connect() called');
  if (!WS_URL) {
    console.error('[Socket Debug] WS_URL is missing or empty');
    return;
  }

  // [Wakil 4.7] Strict Singleton Guard
  if (isConnecting) {
    console.log('[Socket Debug] Already connecting... skipping.');
    return;
  }

  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('[Socket Debug] Socket already open');
    return;
  }

  isConnecting = true;
  if (connectingTimeoutTimer) clearTimeout(connectingTimeoutTimer);
  connectingTimeoutTimer = setTimeout(() => {
    if (isConnecting) {
      console.warn('[Socket Debug] Connection attempt timed out, resetting isConnecting');
      isConnecting = false;
      connect();
    }
  }, CONNECTING_TIMEOUT);

  const token = localStorage.getItem('token');
  console.log('[Socket Debug] Token found:', token ? token.slice(0, 10) + '...' : 'null');

  if (connectTimer != null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }

  if (await isApiShimActive()) {
    console.log('[Socket Debug] API Shim Active, backing off');
    setStatus('error', 'api_shim');
    isConnecting = false; // UNLOCK on bail
    connectTimer = window.setTimeout(() => void connect(), 15000);
    return;
  }

  const primaryUrl = WS_URL;
  const fallbackUrl = computeFallbackWsUrl(primaryUrl);
  let urlToUse = (triedFallback || !fallbackUrl) ? primaryUrl : (connectAttempts > 0 ? fallbackUrl : primaryUrl);
  console.log('[Socket Debug] Initial URL:', urlToUse);

  // Append Token
  const u = new URL(urlToUse);
  if (token) {
    u.searchParams.set('token', token);
  }
  urlToUse = u.toString();
  console.log('[Socket Debug] Connecting to:', urlToUse);

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
    console.error('[Socket Debug] new WebSocket() threw:', err);
    isConnecting = false; // UNLOCK
    return;
  }

  socket.onopen = (event) => {
    console.log('[Socket Debug] onopen fired');
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
    // Flush pending safely using the socket instance that just opened
    console.log(`[Socket Debug] Flushing ${pendingQueue.length} items from queue.`);
    const toFlush = [...pendingQueue];
    pendingQueue = [];

    for (const item of toFlush) {
      const payload = typeof item === 'string' ? item : JSON.stringify(item);
      try {
        ws.send(payload);
      } catch (err) {
        console.error('[Socket Debug] Flush error:', err);
      }
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      // [Wakil 4.7] Deduplication Logic
      const id = data.id || data.seq || (data.ts && data.type ? `${data.type}:${data.ts}` : null);
      if (id) {
        const key = String(id);
        if (seenMessageIds.has(key)) {
          console.log('[Socket Debug] Ignored duplicate message:', key);
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

      // [Wakil 6.0] Handle explicit thinking_phase messages
      if (msgType === 'thinking_phase') {
        const phase = data?.data?.phase;
        if (phase && ['analyzing', 'synthesizing', 'executing', 'idle'].includes(phase)) {
          thinkingPhase = phase;
          thinkingPhaseListeners.forEach(cb => { try { cb(phase); } catch { } });
        }
      } else if (msgType === 'thinking_detail') {
        const detail = data?.data?.detail;
        if (detail && typeof detail === 'string') {
          thinkingDetails.push(detail);
          thinkingDetailsListeners.forEach(cb => { try { cb([...thinkingDetails]); } catch { } });
        }
      }

      // Auto phase management based on events
      if (msgType === 'step_started') {
        if (!quietMode) {
          console.log('[Socket] Auto-activating Quiet Mode (step_started)');
          quietMode = true;
          thinkingPhase = 'analyzing';
          thinkingPhaseListeners.forEach(cb => { try { cb('analyzing'); } catch { } });
        }
      } else if (msgType === 'step_done' || msgType === 'step_failed') {
        if (quietMode) {
          thinkingPhase = 'synthesizing';
          thinkingPhaseListeners.forEach(cb => { try { cb('synthesizing'); } catch { } });
        }
      } else if (msgType === 'tool_start') {
        if (quietMode) {
          thinkingPhase = 'executing';
          thinkingPhaseListeners.forEach(cb => { try { cb('executing'); } catch { } });
        }
      } else if (msgType === 'run_finished' || msgType === 'text') {
        if (quietMode) {
          console.log('[Socket] Auto-deactivating Quiet Mode (run_finished/text)');
          quietMode = false;
          thinkingPhase = 'idle';
          thinkingPhaseListeners.forEach(cb => { try { cb('idle'); } catch { } });
        }
      } else if (msgType === 'thought') {
        // [Wakil 6.0] Matrix-style thought logs
        const text = typeof data.data === 'string' ? data.data : JSON.stringify(data.data);
        if (text) {
          thinkingDetails.push(text);
          thinkingDetailsListeners.forEach(cb => { try { cb([...thinkingDetails]); } catch { } });
        }
      } else if (msgType === 'run_started') {
        thinkingDetails = [];
        thinkingDetailsListeners.forEach(cb => { try { cb([]); } catch { } });
      } else if (msgType === 'build_progress') {
        // [Flow Agent] Live build progress events for PreviewPanel overlay
        const progressData = data?.data || {};
        console.log(`[Socket] Build progress: ${progressData.phase} (${progressData.progress}%)`);
        window.dispatchEvent(new CustomEvent('preview:build_progress', { detail: progressData }));
      } else if (msgType === 'preview_ready' || msgType === 'preview_url') {
        // [Preview Pipeline] When the API sends a preview URL, dispatch it to PreviewPanel
        const url = data?.data?.url || data?.url;
        if (url) {
          console.log(`[Socket] Preview URL received (${msgType}):`, url);
          _lastPreviewUrl = url;
          window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url } }));
        } else if (msgType === 'preview_url' && data?.data?.type === 'refresh') {
          // If a refresh is requested but no new URL is provided, simply re-dispatch the last known URL
          // so the Preview Panel triggers an auto-switch at the end of long builds
          if (_lastPreviewUrl) {
            console.log(`[Socket] Preview refresh requested, re-triggering auto-switch`);
            window.dispatchEvent(new CustomEvent('preview:ready', { detail: { url: _lastPreviewUrl } }));
          }
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
    console.log('[Socket Debug] onclose:', ev.code, ev.reason);
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
    console.error('[Socket Debug] onerror:', e);
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
    console.log('[Socket] Quiet Mode:', enabled ? 'ON' : 'OFF');
    quietMode = enabled;
  },
  isQuietMode() {
    return quietMode;
  },
  send(data: any) {
    // [Wakil 5.2] HARD Quiet Mode: Block ALL outgoing traffic EXCEPT critical signals
    const criticalSignals = ['run', 'stop', 'join_session', 'heartbeat'];
    const isCritical = data && criticalSignals.includes(data.type);

    if (quietMode && !isCritical) {
      console.log('[Socket] HARD Quiet Mode: Blocked non-critical traffic:', data.type);
      return; // NO SEND. NO QUEUE. ZERO TRAFFIC.
    }

    const msg = JSON.stringify(data);

    // [Wakil 5.1] Source-level deduplication
    if (msg === lastSentPayload) {
      console.log('[Socket] Blocked duplicate payload');
      return;
    }
    lastSentPayload = msg;

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('[Socket] Sending:', msg);
      socket.send(msg);
    } else {
      // SMART QUEUEING & DEDUPLICATION
      if (data && data.type === 'terminal_resize') {
        const existingIdx = pendingQueue.findIndex(q => q && typeof q !== 'string' && q.type === 'terminal_resize' && q.id === data.id);
        if (existingIdx !== -1) {
          console.log('[Socket] Internal Queue: Updating existing terminal_resize for', data.id);
          pendingQueue[existingIdx] = data;
          return;
        }
      }

      console.warn('[Socket] Not connected. Queuing message type:', data.type);
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
    console.log('[Socket] Thinking Phase:', phase);
    thinkingPhase = phase;
    thinkingPhaseListeners.forEach(cb => {
      try { cb(phase); } catch { }
    });
  },
  getThinkingPhase() {
    return thinkingPhase;
  },
  subscribeThinkingPhase(cb: (phase: string) => void) {
    thinkingPhaseListeners.add(cb);
    return () => { thinkingPhaseListeners.delete(cb); };
  },
  // [Wakil 6.0] Deep Reasoning Subscription
  subscribeThinkingDetails(cb: (details: string[]) => void) {
    cb([...thinkingDetails]);
    thinkingDetailsListeners.add(cb);
    return () => { thinkingDetailsListeners.delete(cb); };
  },
  // [Wakil 6.1] Get last preview URL (for mount-time read)
  getLastPreviewUrl() {
    return _lastPreviewUrl;
  },

};
