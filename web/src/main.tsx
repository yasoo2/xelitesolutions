import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Showcase = lazy(() => import('./pages/Showcase'));
const BankV2 = lazy(() => import('./pages/BankV2'));
const Joe = lazy(() => import('./pages/Joe'));
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
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {(() => {
      const appTree = (
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />}>
              <Route index element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Home /></Suspense>} />
              <Route path="login" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Login /></Suspense>} />
              <Route path="showcase" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Showcase /></Suspense>} />
              <Route path="showcase/bank-v2" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><BankV2 /></Suspense>} />
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
