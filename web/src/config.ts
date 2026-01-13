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

const apiEnv = cleanUrl(runtimeConfig.API_URL || (import.meta as any).env?.VITE_API_URL);
const wsEnv = cleanUrl(runtimeConfig.WS_URL || (import.meta as any).env?.VITE_WS_URL);

const API_URL = apiEnv || inferApiUrl();
const WS_URL = wsEnv || inferWsUrl(API_URL);

export { API_URL, WS_URL };
