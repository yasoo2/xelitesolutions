const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const apiEnv = import.meta.env.VITE_API_URL;
// If local, prefer localhost:8080. If remote, use the window origin or env.
export const API_URL = isLocal 
  ? 'http://localhost:8080' 
  : (apiEnv || 'https://infinity-x-platform.onrender.com');

// Determine WebSocket URL
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl;

if (!wsUrl || isLocal) {
  if (isLocal) {
    wsUrl = 'ws://localhost:8080/ws';
  } else {
    wsUrl = API_URL.replace(/^http/, 'ws') + '/ws';
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
