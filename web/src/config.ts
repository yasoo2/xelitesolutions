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

// Fallback logic:
export const API_URL = isLocal 
  ? `${window.location.protocol}//${hostname}:3000`
  : (apiEnv || 'https://api.xelitesolutions.com'); // Defaulting to the custom domain if env not set

// Determine WebSocket URL
const rawWsUrl = import.meta.env.VITE_WS_URL;
let wsUrl = rawWsUrl;

if (!wsUrl) {
  if (isLocal) {
    const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    wsUrl = `${wsProto}://${hostname}:3000/ws`;
  } else {
    // Check if API_URL is used and replace protocol
    if (API_URL.includes('api.xelitesolutions.com')) {
      wsUrl = 'wss://api.xelitesolutions.com/ws';
    } else {
       // Derive from API_URL
       wsUrl = API_URL.replace(/^http/, 'ws') + '/ws';
    }
  }
}

// Protocol safety: Ensure ws/wss instead of http/https
if (wsUrl.startsWith('http')) {
  wsUrl = wsUrl.replace(/^http/, 'ws');
}

export const WS_URL = wsUrl;
