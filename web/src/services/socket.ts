import { API_URL, WS_URL } from '../config';

let socket: WebSocket | null = null;
const listeners: Set<(data: any) => void> = new Set();
const statusListeners: Set<(status: { state: string; detail?: string }) => void> = new Set();
let pendingQueue: string[] = [];
let connectTimer: number | null = null;
let connectAttempts = 0;
let triedFallback = false;
let lastUrl = '';
let authProbePromise: Promise<'ok' | 'unauthorized' | 'error'> | null = null;
let lastAuthProbeAt = 0;
let lastShimCheckAt = 0;
let cachedIsShim: boolean | null = null;

// [Wakil 4.7] Singleton Enforcement & Deduplication
let isConnecting = false;
const seenMessageIds = new Set<string>(); // Deduplication cache
const MAX_SEEN_IDS = 1000;

function computeFallbackWsUrl(primaryUrl: string) {
  const wsFromHttpBase = (httpUrl: string) => {
    const base = httpUrl.replace(/\/api\/?$/, '');
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
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    console.log('[Socket Debug] Socket already open/connecting', socket.readyState);
    return;
  }

  isConnecting = true; // LOCK

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
    isConnecting = false; // UNLOCK
    connectAttempts = 0;
    triedFallback = false;
    setStatus('connected', lastUrl);

    // Flush pending safely using the socket instance that just opened
    console.log(`[Socket Debug] Flushing ${pendingQueue.length} queued messages.`);
    while (pendingQueue.length > 0) {
      if (ws.readyState !== WebSocket.OPEN) break;
      const msg = pendingQueue.shift();
      if (msg) {
        try {
          ws.send(msg);
        } catch (err) {
          console.error('WebSocket send error in onopen:', err);
          // Don't put it back, avoid loops
        }
      }
    }
    // [Wakil 4.7] Ensure queue is empty after flush attempt
    if (ws.readyState === WebSocket.OPEN) {
      pendingQueue = [];
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
            const val = it.next().value;
            if (val) seenMessageIds.delete(val);
          }
        }
      }

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
  },
  send(data: any) {
    const msg = JSON.stringify(data);
    if (socket && socket.readyState === WebSocket.OPEN) {
      console.log('[Socket] Sending:', msg);
      socket.send(msg);
    } else {
      console.warn('[Socket] Not connected. Queuing message:', msg);
      pendingQueue.push(msg);
      if (!socket && !isConnecting) connect();
    }
  },
  subscribe(cb: (data: any) => void) {
    listeners.add(cb);
    if (!socket && !isConnecting) connect();
    return () => listeners.delete(cb);
  },
  subscribeStatus(cb: (status: { state: string; detail?: string }) => void) {
    statusListeners.add(cb);
    if (!socket && !isConnecting) connect();
    return () => statusListeners.delete(cb);
  },
};
