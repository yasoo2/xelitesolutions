import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { LiveBackground } from './components/LiveBackground';
import './rtl-overrides.css';
import { useEffect } from 'react';

export default function App() {
  const location = useLocation();
  const nav = useNavigate();

  useEffect(() => {
    const onUnauthorized = () => {
      try {
        localStorage.removeItem('token');
      } catch { }
      if (location.pathname !== '/login') {
        nav('/login', { replace: true });
      }
    };
    window.addEventListener('auth:unauthorized', onUnauthorized as any);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized as any);
  }, [location.pathname, nav]);

  return (
    <div className="app">
      <LiveBackground />
      {/* TopBar removed for Premium Layout */}
      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
