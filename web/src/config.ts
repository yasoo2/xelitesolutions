function cleanUrl(raw: unknown) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v.replace(/^[\s"'`]+/, '').replace(/[\s"'`]+$/, '').replace(/\/+$/, '');
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
  const host = window.location.hostname || 'localhost';
  // In the local split-process setup Vite serves the UI on 5001 while the
  // authenticated WebSocket server lives on the API port 5002. Vite can
  // accept an upgrade on /ws/browser without forwarding it to the backend,
  // leaving BrowserStream "Connected" while wsHub never sees the panel.
  // Bypass that ambiguity locally; keep same-origin routing for production.
  if (window.location.port === '5001' && (host === 'localhost' || host === '127.0.0.1' || host === '::1')) {
    return `${protocol}//${host}:5002/api/ws`;
  }
  return `${protocol}//${window.location.host}/api/ws`;
}

const runtimeConfig: any = (window as any).JOE_CONFIG || {};
const googleClientIdRaw = cleanUrl(runtimeConfig.GOOGLE_CLIENT_ID || (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID);

/**
 * THE API BASE IS SAME-ORIGIN, ON PURPOSE — and everything that pretended to
 * negotiate it was dead.
 *
 * This file used to compute an API base from JOE_CONFIG.API_URL, VITE_API_URL,
 * the hostname, and a localhost-in-production guard — eight consts and a whole
 * inferApiUrl() function — and then ended with a flat `const API_URL = '/api'`
 * that ignored every one of them. Configuring VITE_API_URL did exactly nothing,
 * while .env.example still advertised it (pointing at port 8080, which is not
 * even the port Joe listens on).
 *
 * Same-origin is the RIGHT answer: Vite proxies /api in development, Nginx
 * proxies it in production, and the browser needs no CORS either way. So the
 * answer stays — the machinery that pretended to produce it is gone, and
 * .env.example no longer promises a switch that is not wired to anything.
 */
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

/**
 * `API_URL` IS RELATIVE, AND `new URL()` REFUSES A RELATIVE STRING ALONE.
 *
 * Measured from the field: clicking «تسجيل الدخول بواسطة جوجل» threw
 *
 *   Uncaught TypeError: Failed to construct 'URL': Invalid URL
 *
 * because the page built `new URL('/api/auth/google')`. Same-origin is the
 * right answer for the base (see above) — but a same-origin base is a PATH,
 * and the URL constructor needs an origin to resolve one. `apiClient` already
 * knew this and absolutised before constructing; the login page reached for
 * the raw constant instead, and nothing stopped it.
 *
 * So the knowledge stops being private to one file. Anything that needs a real
 * URL for an API endpoint asks here, and an absolute API_URL keeps working —
 * `new URL(absolute, base)` ignores the base.
 */
const apiUrl = (path: string): string => {
    const p = String(path || '');
    return new URL(`${API_URL}${p.startsWith('/') ? p : `/${p}`}`, window.location.origin).toString();
};

export { API_URL, WS_URL, GOOGLE_CLIENT_ID, apiUrl };
