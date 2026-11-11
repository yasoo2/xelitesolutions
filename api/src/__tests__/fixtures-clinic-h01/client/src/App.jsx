import { useEffect, useState } from 'react';
import { api } from './api.js';
import { useI18n } from './i18n.jsx';
import Patients from './pages/Patients.jsx';
import Appointments from './pages/Appointments.jsx';
import Hours from './pages/Hours.jsx';
import Invoices from './pages/Invoices.jsx';
import Reports from './pages/Reports.jsx';
import Users from './pages/Users.jsx';
import Audit from './pages/Audit.jsx';

const PAGES = [
  { id: 'patients', perm: 'patients:read', Component: Patients },
  { id: 'appointments', perm: 'appointments:read', Component: Appointments },
  { id: 'hours', perm: null, Component: Hours },
  { id: 'invoices', perm: 'invoices:read', Component: Invoices },
  { id: 'reports', perm: 'reports:read', Component: Reports },
  { id: 'users', perm: 'users:manage', Component: Users },
  { id: 'audit', perm: 'audit:read', Component: Audit },
];

function Login({ onLogin }) {
  const { t, setLang, lang, errorText } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { username, password } });
      localStorage.setItem('token', r.token);
      const me = await api('/auth/me', { token: r.token });
      onLogin({ token: r.token, user: me.user, permissions: me.permissions });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-top">
          <h1>{t('appName')}</h1>
          <button type="button" className="ghost" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('language')}</button>
        </div>
        <form onSubmit={submit} className="stack">
          <label>{t('username')}
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </label>
          <label>{t('password')}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button type="submit" className="primary" disabled={busy}>{t('signIn')}</button>
        </form>
        <p className="hint">{t('loginHint')}</p>
      </div>
    </div>
  );
}

export default function App() {
  const { t, setLang, lang } = useI18n();
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [page, setPageState] = useState(() => window.location.hash.slice(1) || 'patients');
  const setPage = (id) => {
    window.history.pushState(null, '', `#${id}`);
    setPageState(id);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setBooting(false);
      return;
    }
    api('/auth/me', { token })
      .then((me) => setSession({ token, user: me.user, permissions: me.permissions }))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setBooting(false));
  }, []);

  if (booting) return <div className="center">…</div>;
  if (!session) return <Login onLogin={setSession} />;

  const { user, permissions, token } = session;
  const can = (p) => permissions.includes(p);
  const visible = PAGES.filter((p) => {
    if (p.id === 'hours') return can('schedules:own') || can('schedules:manage') || can('appointments:read');
    return !p.perm || can(p.perm);
  });
  const current = visible.find((p) => p.id === page) || visible[0];
  const Page = current.Component;

  // Every page gets a call() bound to this session's token.
  const call = (path, opts = {}) => api(path, { ...opts, token });

  async function signOut() {
    try {
      await call('/auth/logout', { method: 'POST' });
    } catch {
      // the session may already be gone; sign out locally anyway
    }
    localStorage.removeItem('token');
    setSession(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">{t('appName')}</h1>
        <nav className="nav">
          {visible.map((p) => (
            <button key={p.id} className={p.id === current.id ? 'nav-item active' : 'nav-item'} onClick={() => setPage(p.id)}>
              {t(`nav.${p.id}`)}
            </button>
          ))}
        </nav>
        <div className="userbox">
          <span className="muted">{t('signedInAs')} </span>
          <strong>{user.full_name}</strong>
          <span className="badge role">{t(`roles.${user.role}`)}</span>
          <button className="ghost" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{t('language')}</button>
          <button className="ghost" onClick={signOut}>{t('signOut')}</button>
        </div>
      </header>
      <main className="content">
        <Page key={current.id} session={session} call={call} can={can} />
      </main>
    </div>
  );
}
