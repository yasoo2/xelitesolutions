import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
  LogIn, Mail, Lock, Eye, EyeOff, Sparkles, X, Loader2,
  Smartphone, ArrowRight, User, AlertCircle
} from 'lucide-react';

export default function Login() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isRTL = i18n.language === 'ar';

  // DEBUG: Tracking Deployment Version - v4 (Split Layout)
  console.log('JOE System: Login Page Gold-v4-Split Loaded');

  // State Machine: 'login' | 'register-email' | 'register-phone'
  const [view, setView] = useState<'login' | 'register-email' | 'register-phone'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+966');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Country Codes Mock
  const countryCodes = [
    { code: '+966', flag: '🇸🇦', name: 'KSA' },
    { code: '+971', flag: '🇦🇪', name: 'UAE' },
    { code: '+20', flag: '🇪🇬', name: 'Egypt' },
    { code: '+1', flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
  ];

  /* =========================================
     Auth Handlers
     ========================================= */
  async function handleLogin() {
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
      try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

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

  const handleRegister = (type: 'email' | 'phone') => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      // Mock Success
      alert(`Registration via ${type} Successful (Mock). Redirecting to Login...`);
      setView('login');
    }, 1500);
  }

  const handleSocialLogin = (provider: 'google') => {
    setLoading(true);
    // Mock Redirect
    setTimeout(() => {
      setLoading(false);
      alert(`Redirecting to ${provider} OAuth...`);
    }, 1000);
  };

  /* =========================================
     Sub-Components
     ========================================= */

  /* 1. Login Form (Default) */
  const LoginForm = () => (
    <div className="flex flex-col gap-5 animate-fade-in-up w-full">
      <h2 className="text-xl font-bold text-center text-[var(--text-primary)] mb-2">
        {t('login_subtitle', 'Welcome back')}
      </h2>

      {/* Email Input */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{t('email')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)] group-hover:bg-[var(--bg-hover)]"
            value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="you@example.com"
          />
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
        </div>
      </div>

      {/* Password Input */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{t('password')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 pr-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)] group-hover:bg-[var(--bg-hover)]"
            value={password} onChange={e => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'} placeholder="••••••••"
          />
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleLogin}
        disabled={loading || !email || !password}
        className="w-full h-12 mt-2 rounded-xl bg-accent-primary text-[var(--bg-dark)] font-bold text-sm tracking-wide shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
        <span>{t('login')}</span>
      </button>

      {/* Footer: Register Options */}
      <div className="mt-6 pt-6 border-t border-[var(--border-color)] text-center">
        <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold mb-4">
          {isRTL ? 'مستخدم جديد؟ سجل عبر' : 'New User? Register Via'}
        </p>

        <div className="flex justify-center items-center gap-4">
          {/* 1. Google Button */}
          <button
            onClick={() => handleSocialLogin('google')}
            className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-red-500 hover:bg-[var(--bg-hover)] flex items-center justify-center shadow-md hover:shadow-red-500/20 transition-all group"
            title="Google"
          >
            <svg className="w-5 h-5 text-[var(--text-primary)] group-hover:text-red-500 transition-colors" viewBox="0 0 24 24">
              <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
            </svg>
          </button>

          {/* 2. Email Button */}
          <button
            onClick={() => setView('register-email')}
            className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-accent-primary hover:bg-[var(--bg-hover)] flex items-center justify-center shadow-md hover:shadow-[0_0_15px_rgba(var(--accent-rgb),0.2)] transition-all group"
            title="Email"
          >
            <Mail size={20} className="text-[var(--text-muted)] group-hover:text-accent-primary transition-colors" />
          </button>

          {/* 3. Phone Button */}
          <button
            onClick={() => setView('register-phone')}
            className="w-12 h-12 rounded-full bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-green-500 hover:bg-[var(--bg-hover)] flex items-center justify-center shadow-md hover:shadow-green-500/20 transition-all group"
            title="Phone"
          >
            <Smartphone size={20} className="text-[var(--text-muted)] group-hover:text-green-500 transition-colors" />
          </button>
        </div>
      </div>
    </div>
  );

  /* 2. Register Email View */
  const RegisterEmailView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up w-full">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors self-start" onClick={() => setView('login')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-xs font-bold uppercase tracking-wider">{isRTL ? 'الرجوع' : 'Back to Login'}</span>
      </div>

      <h2 className="text-xl font-bold text-center text-[var(--text-primary)] mb-4">
        {isRTL ? 'إنشاء حساب جديد' : 'Create Account'}
      </h2>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{isRTL ? 'الاسم' : 'Full Name'}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
            value={name} onChange={e => setName(e.target.value)}
            type="text" placeholder="Joe Doe" autoFocus
          />
          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{t('email')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
            value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="you@example.com"
          />
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{t('password')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
            value={password} onChange={e => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'} placeholder="••••••••"
          />
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
        </div>
      </div>

      <button
        onClick={() => handleRegister('email')}
        disabled={!name || !email || !password || loading}
        className="w-full h-12 mt-4 rounded-xl bg-accent-primary text-[var(--bg-dark)] font-bold text-sm tracking-wide shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <User size={18} />}
        <span>{isRTL ? 'إتمام التسجيل' : 'Complete Registration'}</span>
      </button>
    </div>
  );

  /* 3. Register Phone View */
  const RegisterPhoneView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up w-full">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors self-start" onClick={() => setView('login')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-xs font-bold uppercase tracking-wider">{isRTL ? 'الرجوع' : 'Back to Login'}</span>
      </div>

      <h2 className="text-xl font-bold text-center text-[var(--text-primary)] mb-4">
        {isRTL ? 'التسجيل برقم الهاتف' : 'Phone Registration'}
      </h2>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[var(--text-secondary)] uppercase ml-1">{isRTL ? 'رقم الهاتف' : 'Mobile Number'}</label>
        <div className="flex gap-3">
          <div className="relative w-28">
            <select
              className="w-full h-12 appearance-none bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-3 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-accent-primary transition-all cursor-pointer hover:bg-[var(--bg-hover)]"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {countryCodes.map(c => (
                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]">
              <ArrowRight size={10} className="rotate-90" />
            </div>
          </div>

          <div className="relative flex-1 group">
            <input
              className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
              value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" placeholder="50 000 0000" autoFocus
            />
            <Smartphone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-accent-primary transition-colors" />
          </div>
        </div>
      </div>

      <button
        onClick={() => handleRegister('phone')}
        disabled={!phone || loading}
        className="w-full h-12 mt-4 rounded-xl bg-accent-primary text-[var(--bg-dark)] font-bold text-sm tracking-wide shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <Smartphone size={18} />}
        <span>{isRTL ? 'إرسال الرمز' : 'Send OTP Code'}</span>
      </button>
    </div>
  );

  return (
    <div className="login-page-wrapper">
      <div className="login-bg-glow-1" />
      <div className="login-bg-glow-2" />

      <div className="login-container relative overflow-visible" style={{ maxWidth: '400px' }}>
        <button
          className="login-close-btn"
          onClick={() => nav('/')}
          title={t('close', 'Close')}
        >
          <X size={24} />
        </button>

        <div className="login-header mb-8">
          <div className="login-logo-wrapper mb-2">
            <div className="brand-text-3d" style={{ fontSize: '56px' }}>JOE</div>
          </div>
          <div className="brand-ai-badge inline-block text-[10px] tracking-[0.2em] mt-2">
            SECURE ACCESS
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* View Switcher */}
        {view === 'login' && <LoginForm />}
        {view === 'register-email' && <RegisterEmailView />}
        {view === 'register-phone' && <RegisterPhoneView />}

      </div>
    </div>
  );
}

