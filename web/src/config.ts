const hostname = window.location.hostname;
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
const isPrivateNetHost =
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
const isLocal = isLocalHost || isPrivateNetHost;
const apiEnv = (window as any).JOE_CONFIG?.API_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

let fallbackApiUrl = 'https://api.xelitesolutions.com';

if (!isLocal && (hostname === 'xelitesolutions.com' || hostname === 'www.xelitesolutions.com')) {
  fallbackApiUrl = window.location.origin;
}

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

const API_URL_RAW = (hostname === '46.224.187.142') 
  ? fallbackApiUrl.replace(/\/+$/, '') 
  : String(apiEnv || fallbackApiUrl).replace(/\/+$/, '');

const API_URL_RAW_FIXED = (() => {
  if (isLocal) return API_URL_RAW;
  const canUseSameOriginApi =
    hostname === 'xelitesolutions.com' || hostname === 'www.xelitesolutions.com';
  if (!canUseSameOriginApi) return API_URL_RAW;
  try {
    const u = new URL(API_URL_RAW);
    if (u.hostname === 'api.xelitesolutions.com') return window.location.origin.replace(/\/+$/, '');
  } catch {}
  return API_URL_RAW;
})();

const API_URL_SAFE = (() => {
  const raw = API_URL_RAW_FIXED;
  if (window.location.protocol !== 'https:') return raw;
  try {
    const u = new URL(raw);
    if (u.protocol === 'http:' && (u.hostname === 'api.xelitesolutions.com' || u.hostname.endsWith('.xelitesolutions.com'))) {
      u.protocol = 'https:';
      return u.toString().replace(/\/+$/, '');
    }
  } catch {}
  return raw;
})();

// Determine WebSocket URL
const wsEnv = (window as any).JOE_CONFIG?.WS_URL;
const rawWsUrl = wsEnv || import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl ? String(rawWsUrl).trim() : '';

const canUseSameOriginWs =
  !isLocal && (hostname === 'xelitesolutions.com' || hostname === 'www.xelitesolutions.com');

if (canUseSameOriginWs && !wsUrl) {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  wsUrl = `${proto}://${window.location.host}/ws`;
}

if (!wsUrl) {
  try {
    const api = new URL(API_URL_SAFE);
    api.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:';
    api.pathname = '/ws';
    api.search = '';
    api.hash = '';
    wsUrl = api.toString();
  } catch {
    wsUrl = `${API_URL_SAFE.replace(/^http/, 'ws')}/ws`;
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

if (window.location.protocol === 'https:' && wsUrl.startsWith('ws:')) {
  wsUrl = wsUrl.replace(/^ws:/, 'wss:');
}

export const WS_URL = wsUrl;

export { API_URL_SAFE as API_URL };
