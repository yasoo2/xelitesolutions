const hostname = window.location.hostname;
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
const isPrivateNetHost =
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
const isLocal = isLocalHost || isPrivateNetHost;
const apiEnv = (window as any).JOE_CONFIG?.API_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

const defaultLocalApiUrl = `${window.location.protocol}//127.0.0.1:3000`;
const fallbackApiUrl = isLocal
  ? defaultLocalApiUrl
  : 'https://api.xelitesolutions.com';
export const API_URL = String(apiEnv || fallbackApiUrl).replace(/\/+$/, '');

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
