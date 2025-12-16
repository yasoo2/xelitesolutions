import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Login from './pages/Login';
import Joe from './pages/Joe';
import './theme.css';
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
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
          <Route
            path="joe"
            element={
              <RequireAuth>
                <Joe />
              </RequireAuth>
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
