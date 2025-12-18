import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { LogIn, UserPlus, Mail, Lock, Eye, EyeOff, Sparkles, Cpu, X } from 'lucide-react';

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
      <div className="login-card" style={{ position: 'relative' }}>
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
            <Sparkles size={14} style={{ display: 'inline', marginInlineEnd: 6, color: 'var(--accent-primary)' }} />
            {t('login_subtitle', 'Welcome back to your workspace')}
            <Sparkles size={14} style={{ display: 'inline', marginInlineStart: 6, color: 'var(--accent-primary)' }} />
          </div>
        </div>

        <div className="login-form">
          {error && <div className="login-error">{error}</div>}
          
          <div className="login-input-group">
            <label className="login-label">{t('email')}</label>
            <div style={{ position: 'relative' }}>
              <input 
                className="login-input" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="you@example.com"
              />
              <Mail size={18} style={{ position: 'absolute', top: 16, left: 16, color: 'var(--text-muted)' }} className="input-icon-start" />
            </div>
          </div>

          <div className="login-input-group">
            <label className="login-label">{t('password')}</label>
            <div style={{ position: 'relative' }}>
              <input 
                className="login-input" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                type={showPassword ? 'text' : 'password'} 
                placeholder="••••••••"
                onKeyDown={e => e.key === 'Enter' && login()}
              />
              <Lock size={18} style={{ position: 'absolute', top: 16, left: 16, color: 'var(--text-muted)' }} className="input-icon-start" />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ 
                  position: 'absolute', 
                  top: 14, 
                  right: 16, 
                  background: 'none', 
                  border: 'none', 
                  cursor: 'pointer',
                  color: 'var(--text-muted)'
                }}
                className="input-icon-end"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="login-actions">
            <button className="login-submit-btn" onClick={login} disabled={loading}>
              {loading ? '...' : (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <LogIn size={20} /> {t('login')}
                </span>
              )}
            </button>
            <button className="login-register-btn" onClick={register} disabled={loading}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <UserPlus size={18} /> {t('register')}
              </span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Decorative Background Elements */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '10%',
        width: '300px',
        height: '300px',
        background: 'radial-gradient(circle, rgba(255, 215, 0, 0.1) 0%, transparent 70%)',
        filter: 'blur(40px)',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '10%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(96, 165, 250, 0.1) 0%, transparent 70%)',
        filter: 'blur(60px)',
        zIndex: 0
      }} />
    </div>
  );
}
