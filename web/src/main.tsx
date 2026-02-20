import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { GOOGLE_CLIENT_ID } from './config';
import App from './App';
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));


const Joe = lazy(() => import('./pages/Joe'));
const WorkspaceSettings = lazy(() => import('./pages/WorkspaceSettings'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
import './theme.css';
import './global.css';
import './i18n';

const shouldIgnoreNoiseError = (val: any) => {
  const s = String(val?.stack || val?.message || val?.filename || val || '');
  return s.includes('solanaActionsContentScript.js');
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

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {(() => {
      const appTree = (
        <BrowserRouter>
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
