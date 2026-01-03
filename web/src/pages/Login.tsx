import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { LogIn, UserPlus, Mail, Lock, Eye, EyeOff, Sparkles, X, Loader2 } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  async function register() {
    setError(null);
    setLoading(true);
    try {
      const emailNormalized = email.trim();
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalized, password }),
      });
      if (!res.ok) {
        const raw = await res.text();
        let data: any = null;
        try {
          data = raw ? JSON.parse(raw) : null;
        } catch {
          data = null;
        }
        setError(data?.error || raw || t('registration_failed', 'Registration failed'));
        return;
      }
      await login();
    } catch (e) {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setError(null);
    setLoading(true);
    try {
      const emailNormalized = email.trim();
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalized, password }),
      });
      const raw = await res.text();
      let data: any = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        setError(data?.error || raw || t('login_failed', 'Login failed'));
        return;
      }
      localStorage.setItem('token', data.token);
      nav('/joe');
    } catch (e) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page-wrapper">
      <div className="login-bg-glow-1" />
      <div className="login-bg-glow-2" />

      <div className="login-container">
        <button 
          className="login-close-btn" 
          onClick={() => nav('/')}
          title={t('close', 'Close')}
        >
          <X size={24} />
        </button>
        
        <div className="login-header">
          <div className="login-logo-wrapper">
            <div className="login-logo">
              <span className="login-logo-text">J</span>
            </div>
          </div>
          <div className="login-title">
            <span>
              <span>J</span>
              <span className="logo-letter-yellow">O</span>
              <span>E</span>
            </span>{' '}
            <span>AI</span>
          </div>
          <div className="login-subtitle">
            <Sparkles size={14} className="text-accent-primary" />
            {t('login_subtitle', 'Welcome back to your workspace')}
            <Sparkles size={14} className="text-accent-primary" />
          </div>
        </div>

        <form
          className="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          {error && <div className="login-error">{error}</div>}
          
          <div className="login-input-group">
            <label className="login-label">{t('email')}</label>
            <div className="login-input-wrapper">
              <input 
                className="login-input" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
              />
              <Mail size={18} className="input-icon-start" />
            </div>
          </div>

          <div className="login-input-group">
            <label className="login-label">{t('password')}</label>
            <div className="login-input-wrapper">
              <input 
                className="login-input" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                type={showPassword ? 'text' : 'password'} 
                autoComplete="current-password"
                placeholder="••••••••"
              />
              <Lock size={18} className="input-icon-start" />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="input-icon-end"
                aria-label={showPassword ? t('hide_password', 'Hide password') : t('show_password', 'Show password')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-actions">
            <button className="login-submit-btn" type="submit" disabled={!canSubmit}>
              {loading ? (
                <span className="login-loading">
                  <Loader2 size={18} className="spin" />
                  <span>{t('loading', 'Loading')}</span>
                </span>
              ) : (
                <>
                  <LogIn size={20} style={{ marginInlineEnd: 8 }} /> {t('login')}
                </>
              )}
            </button>
            <button className="login-register-btn" type="button" onClick={register} disabled={!canSubmit}>
              {loading ? (
                <span className="login-loading">
                  <Loader2 size={18} className="spin" />
                  <span>{t('loading', 'Loading')}</span>
                </span>
              ) : (
                <>
                  <UserPlus size={18} style={{ marginInlineEnd: 8 }} /> {t('register')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
