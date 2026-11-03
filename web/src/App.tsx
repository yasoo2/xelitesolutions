import { Outlet, useLocation, useNavigate } from 'react-router-dom';


import './rtl-overrides.css';
import { useEffect, Component, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiDir } from './components/NeuralTraceView';

/** What the boundary shows when the app crashed: in the interface language,
 *  in that language's direction. The error message itself is shown as thrown. */
function CrashScreen({ message, onReload }: { message?: string; onReload: () => void }) {
  const { t } = useTranslation();
  const dir = useUiDir();
  return (
    <div dir={dir} style={{ padding: '2rem', textAlign: 'center' }}>
      <h2>{t('app_crashTitle')}</h2>
      <p style={{ color: '#888' }}>{message}</p>
      <button
        onClick={onReload}
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
        {t('app_reload')}
      </button>
    </div>
  );
}

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
        <CrashScreen
          message={this.state.error?.message}
          onReload={() => {
            this.setState({ hasError: false, error: null });
            window.location.reload();
          }}
        />
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
