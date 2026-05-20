import { Outlet, useLocation, useNavigate } from 'react-router-dom';


import './rtl-overrides.css';
import { useEffect, Component, type ReactNode } from 'react';

// Error Boundary to prevent full app crashes from component errors
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', textAlign: 'center', direction: 'rtl' }}>
          <h2>حدث خطأ غير متوقع</h2>
          <p style={{ color: '#888' }}>{this.state.error?.message}</p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1.5rem',
              borderRadius: '8px',
              border: 'none',
              background: '#6366f1',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            إعادة تحميل
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    <ErrorBoundary>
      <div className="app">

        {/* TopBar removed for Premium Layout */}
        <div className="content">
          <Outlet />
        </div>
      </div>
    </ErrorBoundary>
  );
}
