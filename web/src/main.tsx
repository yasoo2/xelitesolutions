import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const Joe = lazy(() => import('./pages/Joe'));
import './theme.css';
import './global.css';
import './i18n';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Home /></Suspense>} />
          <Route path="login" element={<Suspense fallback={<div className="route-loading">Loading…</div>}><Login /></Suspense>} />
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
  </React.StrictMode>
);
