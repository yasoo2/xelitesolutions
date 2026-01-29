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

function computeFallbackWsUrl(primaryUrl: string) {
  const candidates = [
    API_URL ? `${API_URL.replace(/^http/i, 'ws')}/ws` : '',
    `${window.location.origin.replace(/^http/i, 'ws')}/ws`,
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

function connect() {
  if (!WS_URL) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const token = localStorage.getItem('token');
  if (!token || !isValidToken(token)) {
    // If no valid token, we cannot connect to the secure WebSocket.
    // We do NOT necessarily clear the token here (TopBar does that), but we abort connection.
    if (connectTimer) {
      clearTimeout(connectTimer);
      connectTimer = null;
    }
    return;
  }

  if (connectTimer != null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }

  const primaryUrl = WS_URL;
  const fallbackUrl = computeFallbackWsUrl(primaryUrl);
  let urlToUse = (triedFallback || !fallbackUrl) ? primaryUrl : (connectAttempts > 0 ? fallbackUrl : primaryUrl);

  // Append Token
  const u = new URL(urlToUse);
  u.searchParams.set('token', token);
  urlToUse = u.toString();

  lastUrl = urlToUse;

  let opened = false;
  const startedAt = Date.now();
  setStatus(connectAttempts > 0 ? 'reconnecting' : 'connecting', urlToUse);

  socket = new WebSocket(urlToUse);

  socket.onopen = () => {
    opened = true;
    connectAttempts = 0;
    triedFallback = false;
    setStatus('connected', lastUrl);
    // Flush pending
    while (pendingQueue.length > 0) {
      const msg = pendingQueue.shift();
      if (msg) socket?.send(msg);
    }
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach(l => l(data));
    } catch (e) {
    }
  };

  socket.onclose = (ev) => {
    socket = null;
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
      connectTimer = window.setTimeout(connect, 250);
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
        void probeAuth(tokenNow).then((r) => {
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
          connectTimer = window.setTimeout(connect, baseDelay + jitter);
        });
        return;
      }
    }

    connectAttempts += 1;
    const baseDelay = Math.min(8000, 500 * Math.pow(2, Math.max(0, connectAttempts - 1)));
    const jitter = Math.floor(Math.random() * 250);
    connectTimer = window.setTimeout(connect, baseDelay + jitter);
  };

  socket.onerror = () => {
    setStatus('error', lastUrl);
  };
}

export const SocketService = {
  connect,
  send(data: any) {
    const msg = JSON.stringify(data);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    } else {
      pendingQueue.push(msg);
      if (!socket) connect();
    }
  },
  subscribe(cb: (data: any) => void) {
    listeners.add(cb);
    if (!socket) connect();
    return () => listeners.delete(cb);
  },
  subscribeStatus(cb: (status: { state: string; detail?: string }) => void) {
    statusListeners.add(cb);
    if (!socket) connect();
    return () => statusListeners.delete(cb);
  },
};
