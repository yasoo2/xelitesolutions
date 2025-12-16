const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://localhost:8080' : 'https://api.xelitesolutions.com');

// Determine WebSocket URL
// Priority:
// 1. VITE_WS_URL env var
// 2. Dedicated subdomain in production (wss://ws.xelitesolutions.com/ws)
// 3. Localhost in development
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl;

// Safety check: if the env var points to the API domain for WS, force it to the dedicated WS domain
// because Cloudflare Workers on the API domain might block/interfere with WS upgrades.
if (wsUrl && wsUrl.includes('api.xelitesolutions.com')) {
  wsUrl = 'wss://ws.xelitesolutions.com/ws';
}

if (!wsUrl) {
  if (isLocal) {
    wsUrl = 'ws://localhost:8080/ws';
  } else {
    // Production default: Use dedicated WebSocket subdomain
    wsUrl = 'wss://ws.xelitesolutions.com/ws';
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
