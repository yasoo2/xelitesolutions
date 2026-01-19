import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import TopBar from './components/TopBar';
import { LiveBackground } from './components/LiveBackground';
import './rtl-overrides.css';
import { useEffect } from 'react';
import { API_URL as API } from './config';

export default function App() {
  const location = useLocation();
  const nav = useNavigate();
  const isLogin = location.pathname === '/login';

  async function devLogin() {
    const email = (window as any).JOE_CONFIG?.DEV_EMAIL || import.meta.env.VITE_DEV_EMAIL;
    const password = (window as any).JOE_CONFIG?.DEV_PASSWORD || import.meta.env.VITE_DEV_PASSWORD;
    if (!email || !password) return;
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.token) {
        localStorage.setItem('token', j.token);
        if (isLogin) nav('/joe');
        window.dispatchEvent(new Event('auth:authorized'));
      }
    } catch { }
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) devLogin();
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      localStorage.removeItem('token');
      devLogin();
    };
    window.addEventListener('auth:unauthorized', onUnauthorized as any);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized as any);
  }, []);

  return (
    <div className="app">
      <LiveBackground />
      {location.pathname === '/joe' && <TopBar />}
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
