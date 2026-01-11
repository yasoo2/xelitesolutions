import { API_URL, WS_URL } from '../config';

let socket: WebSocket | null = null;
const listeners: Set<(data: any) => void> = new Set();
const statusListeners: Set<(status: { state: string; detail?: string }) => void> = new Set();
let pendingQueue: string[] = [];
let connectTimer: number | null = null;
let connectAttempts = 0;
let triedFallback = false;
let lastUrl = '';

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
    } catch {}
  });
}

function connect() {
  if (!WS_URL) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (connectTimer != null) {
    window.clearTimeout(connectTimer);
    connectTimer = null;
  }

  const primaryUrl = WS_URL;
  const fallbackUrl = computeFallbackWsUrl(primaryUrl);
  const urlToUse = (triedFallback || !fallbackUrl) ? primaryUrl : (connectAttempts > 0 ? fallbackUrl : primaryUrl);
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
    const closedEarly = !opened && Date.now() - startedAt < 2000;
    if (closedEarly && !triedFallback) {
      triedFallback = true;
      connectAttempts = 1;
      setStatus('error', `closed_early:${String(ev?.code || '')}`);
      connectTimer = window.setTimeout(connect, 250);
      return;
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
