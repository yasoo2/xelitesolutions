function cleanUrl(raw: unknown) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '').replace(/\/+$/, '');
}

function inferApiUrl() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');

  if (hostname === 'xelitesolutions.com' || hostname === 'www.xelitesolutions.com') {
    return `${window.location.origin}/api`;
  }

  // For local development, use relative path to leverage Vite proxy
  if (isLocal) {
    return '/api';
  }

  return `${window.location.origin}/api`;
}

function inferWsUrl(apiUrl: string) {
  // If we are on production, derive WS from the API URL to match the domain
  // This avoids issues where 'ws.xelitesolutions.com' might not be set up
  // or 'www' vs non-www mismatches occur.

  if (apiUrl && apiUrl.startsWith('http')) {
    const base = apiUrl.replace(/\/api\/?$/, '');
    // Replace http->ws, https->wss
    // ELITE FIX: Use /api/ws so Nginx routes it to the backend correctly
    return base.replace(/^http/i, 'ws') + '/api/ws';
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/ws`;
}

const runtimeConfig: any = (window as any).JOE_CONFIG || {};

const apiEnvRaw = cleanUrl(runtimeConfig.API_URL || (import.meta as any).env?.VITE_API_URL);
const wsEnvRaw = cleanUrl(runtimeConfig.WS_URL || (import.meta as any).env?.VITE_WS_URL);
const googleClientIdRaw = cleanUrl(runtimeConfig.GOOGLE_CLIENT_ID || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID);

const hostname = window.location.hostname;
const isLocalHost =
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname === '0.0.0.0' ||
  hostname.endsWith('.local');

const pointsToLocalhost = (u: string) => {
  const s = String(u || '').trim().toLowerCase();
  if (!s) return false;
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/.test(s);
};

const wsToHttpForLocalhostCheck = (u: string) => String(u || '').replace(/^ws/i, 'http');

const apiEnv = !isLocalHost && pointsToLocalhost(apiEnvRaw) ? '' : apiEnvRaw;
const wsEnv = !isLocalHost && pointsToLocalhost(wsToHttpForLocalhostCheck(wsEnvRaw)) ? '' : wsEnvRaw;

const API_URL = '/api';
const WS_URL = inferWsUrl(API_URL);
console.log('[JOE] Final Config:', { API_URL, WS_URL });
const GOOGLE_CLIENT_ID = googleClientIdRaw;

// FEATURE_BROWSER_CHROME and getBrowserChromeEnabled() were removed with the
// BrowserChrome component they gated. The flag could be set three ways — build
// env, a ?chrome=1 query parameter and a localStorage key — and read by nothing
// at all: no component ever consulted it, and BrowserChrome.tsx was never
// mounted. A switch that turns nothing on is worse than no switch, because
// somebody eventually flips it and reports that it does not work.

export { API_URL, WS_URL, GOOGLE_CLIENT_ID };
