const hostname = window.location.hostname;
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
const isPrivateNetHost =
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
const isLocal = isLocalHost || isPrivateNetHost;
const apiEnv = (window as any).JOE_CONFIG?.API_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

let fallbackApiUrl = 'https://api.xelitesolutions.com';

if (isLocal) {
  fallbackApiUrl = `${window.location.protocol}//${hostname}:3000`;
} else {
  // If we are on a numeric IP (public IP), assume the API is on port 3000 of the same IP
  const isNumericIp = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  if (isNumericIp) {
    fallbackApiUrl = `${window.location.protocol}//${hostname}:3000`;
  }
}

// Explicit override for the known remote server to ensure it works even if env vars are stale
if (hostname === '46.224.187.142') {
  fallbackApiUrl = `${window.location.protocol}//${hostname}:3000`;
  // We will force this URL by ignoring conflicting env vars in the export below if needed,
  // but usually fallbackApiUrl is used when apiEnv is empty. 
  // If apiEnv IS set (e.g. to localhost), we must override it.
  // We'll handle this in the export logic.
}

export const API_URL = (hostname === '46.224.187.142') 
  ? fallbackApiUrl.replace(/\/+$/, '') 
  : String(apiEnv || fallbackApiUrl).replace(/\/+$/, '');

// Determine WebSocket URL
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl ? String(rawWsUrl).trim() : '';

if (!wsUrl) {
  try {
    const api = new URL(API_URL);
    api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
    if (api.hostname === 'api.xelitesolutions.com' || (api.hostname.startsWith('api.') && api.hostname.endsWith('.xelitesolutions.com'))) {
      api.hostname = `ws.${api.hostname.slice('api.'.length)}`;
    }
    api.pathname = `${api.pathname.replace(/\/+$/, '')}/ws`;
    api.search = '';
    api.hash = '';
    wsUrl = api.toString();
  } catch {
    wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws`;
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
