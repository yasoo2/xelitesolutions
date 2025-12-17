const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const apiEnv = import.meta.env.VITE_API_URL;
export const API_URL = apiEnv || (isLocal ? 'http://localhost:8080' : 'https://infinity-x-platform.onrender.com');

// Determine WebSocket URL
// Priority:
// 1. VITE_WS_URL env var
// 2. Dedicated subdomain in production (wss://ws.xelitesolutions.com/ws)
// 3. Localhost in development
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl;

if (!wsUrl) {
  if (isLocal) {
    wsUrl = 'ws://localhost:8080/ws';
  } else {
    wsUrl = (API_URL.replace(/^http/, 'ws') + '/ws');
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
