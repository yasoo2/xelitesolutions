function cleanUrl(raw: unknown) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '').replace(/\/+$/, '');
}

function cleanFlag(raw: unknown) {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return v;
}

function inferApiUrl() {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');

  if (isLocal) return 'http://localhost:3000';

  if (hostname === 'xelitesolutions.com' || hostname === 'www.xelitesolutions.com') {
    return 'https://api.xelitesolutions.com';
  }

  return window.location.origin;
}

function inferWsUrl(apiUrl: string) {
  const hostname = window.location.hostname;
  const isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local');

  if (isLocal) {
    return apiUrl.replace(/^http/i, 'ws') + '/ws';
  }

  return window.location.origin.replace(/^http/i, 'ws') + '/ws';
}

const runtimeConfig: any = (window as any).JOE_CONFIG || {};

const apiEnvRaw = cleanUrl(runtimeConfig.API_URL || (import.meta as any).env?.VITE_API_URL);
const wsEnvRaw = cleanUrl(runtimeConfig.WS_URL || (import.meta as any).env?.VITE_WS_URL);
const chromeFlagRaw = cleanFlag(runtimeConfig.FEATURE_BROWSER_CHROME || (import.meta as any).env?.VITE_FEATURE_BROWSER_CHROME);

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

const apiEnv = !isLocalHost && pointsToLocalhost(apiEnvRaw) ? '' : apiEnvRaw;
const wsEnv = !isLocalHost && pointsToLocalhost(wsEnvRaw.replace(/^ws/i, 'http')) ? '' : wsEnvRaw;

const API_URL = apiEnv || inferApiUrl();
const WS_URL = wsEnv || inferWsUrl(API_URL);
const queryChrome = (() => {
  try {
    return new URLSearchParams(window.location.search).get('chrome') || '';
  } catch {
    return '';
  }
})();
const storedChrome = (() => {
  try {
    return localStorage.getItem('FEATURE_BROWSER_CHROME') || '';
  } catch {
    return '';
  }
})();
const FEATURE_BROWSER_CHROME =
  chromeFlagRaw === '1' ||
  chromeFlagRaw === 'true' ||
  queryChrome === '1' ||
  queryChrome.toLowerCase() === 'true' ||
  storedChrome === '1' ||
  storedChrome.toLowerCase() === 'true';

export { API_URL, WS_URL, FEATURE_BROWSER_CHROME };
