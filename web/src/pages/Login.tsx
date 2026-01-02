import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { LogIn, UserPlus, Mail, Lock, Eye, EyeOff, Sparkles, X } from 'lucide-react';

export default function Login() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function register() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: 'OWNER' }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text);
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
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Login failed');
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
    <div className="login-page">
      <div className="login-bg-glow-1" />
      <div className="login-bg-glow-2" />

      <div className="login-card">
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
          <div className="login-title">JOE AI</div>
          <div className="login-subtitle">
            <Sparkles size={14} className="text-accent-primary" />
            {t('login_subtitle', 'Welcome back to your workspace')}
            <Sparkles size={14} className="text-accent-primary" />
          </div>
        </div>

        <div className="login-form">
          {error && <div className="login-error">{error}</div>}
          
          <div className="login-input-group">
            <label className="login-label">{t('email')}</label>
            <div className="login-input-wrapper">
              <input 
                className="login-input" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
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
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && login()}
              />
              <Lock size={18} className="input-icon-start" />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="input-icon-end"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-actions">
            <button className="login-submit-btn" onClick={login} disabled={loading}>
              {loading ? '...' : (
                <>
                  <LogIn size={20} style={{ marginInlineEnd: 8 }} /> {t('login')}
                </>
              )}
            </button>
            <button className="login-register-btn" onClick={register} disabled={loading}>
              <UserPlus size={18} style={{ marginInlineEnd: 8 }} /> {t('register')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
