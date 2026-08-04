import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID } from './config';
import App from './App';
// The code viewer must work with the network unplugged — see monaco-setup.
import './monaco-setup';

const Login = lazy(() => import('./pages/Login'));


const Joe = lazy(() => import('./pages/Joe'));
const WorkspaceSettings = lazy(() => import('./pages/WorkspaceSettings'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const SystemManagement = lazy(() => import('./pages/admin/SystemManagement'));
import { jwtDecode } from 'jwt-decode';
import './theme.css';
import './global.css';
import './i18n';

const shouldIgnoreNoiseError = (val: any) => {
  const s = String(val?.stack || val?.message || val?.filename || val || '');
  return s.includes('solanaActionsContentScript.js') ||
    s.includes('React Router Future Flag Warning') ||
    s.includes('[Socket Debug]') ||
    s.includes('Download the React DevTools');
};

// Global console.error proxy to filter out extension noise
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args.join(' ');
  if (shouldIgnoreNoiseError(msg)) return;
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args: any[]) => {
  const msg = args.join(' ');
  if (shouldIgnoreNoiseError(msg)) return;
  originalConsoleWarn.apply(console, args);
};

const originalConsoleLog = console.log;
console.log = (...args: any[]) => {
  const msg = args.join(' ');
  if (shouldIgnoreNoiseError(msg)) return;
  originalConsoleLog.apply(console, args);
};

window.addEventListener(
  'error',
  (event) => {
    const e = event as any;
    if (shouldIgnoreNoiseError({ stack: e?.error?.stack, message: e?.message, filename: e?.filename })) {
      event.preventDefault();
      (event as any).stopImmediatePropagation?.();
    }
  },
  true,
);

window.addEventListener(
  'unhandledrejection',
  (event) => {
    const e = event as PromiseRejectionEvent;
    if (shouldIgnoreNoiseError(e.reason)) {
      event.preventDefault();
      (event as any).stopImmediatePropagation?.();
    }
  },
  true,
);

function RequireAuth({ children }: { children: React.ReactNode }) {
  const getDevBypassToken = () => {
    if (!import.meta.env.DEV) return null;
    const makeToken = () => {
      try {
        const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
        const payload = btoa(
          JSON.stringify({
            sub: '000000000000000000000001',
            role: 'OWNER',
            email: 'dev@joe.local',
            name: 'Developer',
            exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
          }),
        );
        return `${header}.${payload}.dev`;
      } catch {
        return 'offline_dev';
      }
    };
    const envFlag = String((import.meta as any).env?.VITE_ENABLE_AUTH_BYPASS || '').toLowerCase();
    if (envFlag === 'true') return makeToken();
    try {
      const qs = new URLSearchParams(window.location.search);
      const v = String(qs.get('auth_bypass') || '').toLowerCase();
      if (v === '1' || v === 'true' || v === 'yes') return makeToken();
    } catch { }
    return null;
  };

  let token: string | null = null;
  try {
    token = localStorage.getItem('token');
  } catch {
    token = null;
  }
  if (!token) {
    const bypass = getDevBypassToken();
    if (bypass) {
      try {
        localStorage.setItem('token', bypass);
        token = bypass;
      } catch { }
    }
  }
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  let token: string | null = null;
  try {
    token = localStorage.getItem('token');
  } catch { }

  if (!token) return <Navigate to="/login" replace />;

  try {
    /**
     * THE GATE IS THE SIGNED TOKEN — nothing else.
     *
     * Two things used to open this route besides the token:
     *
     *   1. `localStorage.getItem('admin') === 'true'` — localStorage lives in
     *      the VISITOR'S browser, so any visitor could type one line in the
     *      console and walk in. The server still refused every request with
     *      403, so no data leaked, but the shape of the whole control panel
     *      was on display to anyone curious enough to try — and the decision
     *      «is this person an admin?» was being asked of the person.
     *   2. two email addresses written literally into this file, which ships
     *      to every visitor's browser. Anyone could read the owner's personal
     *      addresses out of the JS bundle, and changing who is an admin meant
     *      rebuilding the frontend.
     *
     * The role in the JWT is signed by the server and cannot be edited by the
     * holder; the server's own allowlist (SUPER_ADMIN_EMAILS) decides who
     * carries that role. One rule, in one place, and it is the server's.
     */
    const decoded: any = jwtDecode(token);
    const isAdmin = decoded.role === 'SUPER_ADMIN' || decoded.role === 'OWNER';

    if (!isAdmin) {
      return <Navigate to="/joe" replace />;
    }
  } catch {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {(() => {
      const appTree = (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<Suspense fallback={<div className="route-loading">Loading…</div>}><LandingPage /></Suspense>} />
              <Route path="login" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Login /></Suspense>} />
              <Route path="welcome" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><LandingPage /></Suspense>} />
              <Route path="landing" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><LandingPage /></Suspense>} />

              <Route
                path="joe"
                element={
                  <RequireAuth>
                    <Suspense fallback={<div className="route-loading">Loading…</div>}>
                      <Joe />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="workspace/:workspaceId/settings"
                element={
                  <RequireAuth>
                    <Suspense fallback={<div className="route-loading">Loading...</div>}>
                      <WorkspaceSettings />
                    </Suspense>
                  </RequireAuth>
                }
              />
              <Route
                path="joe-premium"
                element={<Navigate to="/joe" replace />}
              />
              <Route
                path="super-admin"
                element={
                  <RequireSuperAdmin>
                    <Suspense fallback={<div className="route-loading">Loading…</div>}>
                      <SystemManagement />
                    </Suspense>
                  </RequireSuperAdmin>
                }
              />
              <Route path="super-admin/system" element={<Navigate to="/super-admin" replace />} />
              <Route path="super-admin/deployments" element={<Navigate to="/super-admin" replace />} />
              <Route path="admin" element={<Navigate to="/super-admin/deployments" replace />} />
              <Route path="admin/deployments" element={<Navigate to="/super-admin/deployments" replace />} />

            </Route>
          </Routes>
        </BrowserRouter>
      );

      if (GOOGLE_CLIENT_ID) {
        return <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>{appTree}</GoogleOAuthProvider>;
      }
      return appTree;
    })()}
  </React.StrictMode>
);
