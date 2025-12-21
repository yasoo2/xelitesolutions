const hostname = window.location.hostname;
const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
const isPrivateNetHost =
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
const isLocal = isLocalHost || isPrivateNetHost;
const apiEnv = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;

// IMPORTANT: Set this to your actual Backend URL on Render
// If your frontend is infinity-x-platform.onrender.com, your backend is likely DIFFERENT (e.g. joe-api.onrender.com)
// UNLESS you are serving the frontend FROM the backend (monolith).
// Assuming separate backend for now based on 'api.xelitesolutions.com' errors.

const defaultLocalApiUrl = `${window.location.protocol}//${hostname}:8080`;
const isProbablyApiHost =
  hostname.includes('joe-api') ||
  hostname.startsWith('api.') ||
  hostname === 'joe-api.onrender.com';

const fallbackApiUrl = isLocal
  ? defaultLocalApiUrl
  : (isProbablyApiHost ? window.location.origin : 'https://joe-api.onrender.com');
export const API_URL = String(apiEnv || fallbackApiUrl).replace(/\/+$/, '');

// Determine WebSocket URL
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl ? String(rawWsUrl).trim() : '';

if (!wsUrl) {
  wsUrl = `${API_URL.replace(/^http/, 'ws')}/ws`;
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
