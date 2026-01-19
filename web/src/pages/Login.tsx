import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
  LogIn, UserPlus, Mail, Lock, Eye, EyeOff, Sparkles, X, Loader2,
  Github, Smartphone, ArrowRight, User
} from 'lucide-react';

export default function Login() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const isRTL = i18n.language === 'ar';

  // State Machine: 'selection' | 'email' | 'phone' | 'register-details'
  const [view, setView] = useState<'selection' | 'email' | 'phone' | 'register-details'>('selection');

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

  const handleNextStep = () => {
    if (view === 'email' && email) {
      if (email.includes('new')) {
        setView('register-details');
      } else {
        handleLogin();
      }
    } else if (view === 'register-details') {
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        alert(`Welcome ${name}! Registration Complete (Mock).`);
        nav('/joe');
      }, 1500);
    }
  }

  const handleSocialLogin = (provider: 'google' | 'github') => {
    setLoading(true);
    setTimeout(() => {
      alert(`Redirecting to ${provider} OAuth... (Backend Integration Required)`);
      setLoading(false);
    }, 1000);
  };

  /* =========================================
     Sub-Components
     ========================================= */

  const SelectionView = () => (
    <div className="flex flex-col gap-3 animate-fade-in-up">
      <h2 className="text-xl font-bold text-center mb-1">
        {isRTL ? 'تسجيل الدخول' : 'Sign In'}
      </h2>

      {/* Email Button - Gold/Luxury */}
      <button
        onClick={() => setView('email')}
        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-[var(--border-color)] hover:border-accent-primary hover:bg-[var(--bg-hover)] transition-all group"
      >
        <div className="p-2 rounded-lg bg-[var(--bg-hover)] text-accent-primary group-hover:scale-110 transition-transform">
          <Mail size={20} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold text-sm">{isRTL ? 'البريد الإلكتروني' : 'Email Address'}</div>
        </div>
        <ArrowRight size={16} className={`text-[var(--text-muted)] group-hover:text-accent-primary ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      {/* Phone Button - Gold/Luxury */}
      <button
        onClick={() => setView('phone')}
        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-[var(--border-color)] hover:border-accent-primary hover:bg-[var(--bg-hover)] transition-all group"
      >
        <div className="p-2 rounded-lg bg-[var(--bg-hover)] text-accent-primary group-hover:scale-110 transition-transform">
          <Smartphone size={20} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold text-sm">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</div>
        </div>
        <ArrowRight size={16} className={`text-[var(--text-muted)] group-hover:text-accent-primary ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--border-color)]"></div></div>
        <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest"><span className="bg-[var(--bg-card)] px-2 text-[var(--text-muted)]">OR</span></div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Google Button */}
        <button
          onClick={() => handleSocialLogin('google')}
          className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-all group"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
          </svg>
          <span className="font-semibold text-sm">Google</span>
        </button>

        {/* GitHub Button */}
        <button
          onClick={() => handleSocialLogin('github')}
          className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-[var(--bg-hover)] border border-[var(--border-color)] transition-all group"
        >
          <Github size={20} className="group-hover:scale-110 transition-transform" />
          <span className="font-semibold text-sm">GitHub</span>
        </button>
      </div>
    </div>
  );

  const EmailView = () => (
    <form
      className="flex flex-col gap-4 animate-fade-in-up"
      onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
    >
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors" onClick={() => setView('selection')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-sm font-medium">{isRTL ? 'الرجوع' : 'Back'}</span>
      </div>

      <div className="login-input-group">
        <label className="login-label">{t('email')}</label>
        <div className="login-input-wrapper">
          <input
            className="login-input"
            value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="you@example.com" autoFocus
          />
          <Mail size={18} className="input-icon-start" />
        </div>
      </div>

      <div className="login-input-group">
        <label className="login-label">{t('password')}</label>
        <div className="login-input-wrapper">
          <input
            className="login-input"
            value={password} onChange={e => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'} placeholder="••••••••"
          />
          <Lock size={18} className="input-icon-start" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="input-icon-end">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      <button className="login-submit-btn mt-2" type="submit" disabled={loading}>
        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={20} />}
        <span>{t('login')}</span>
      </button>
    </form>
  );

  const PhoneView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors" onClick={() => setView('selection')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-sm font-medium">{isRTL ? 'الرجوع' : 'Back'}</span>
      </div>

      <div className="login-input-group">
        <label className="login-label">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</label>
        <div className="flex gap-2">
          <select
            className="bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl px-2 text-sm outline-none focus:border-accent-primary text-[var(--text-primary)]"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            {countryCodes.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
            ))}
          </select>
          <div className="login-input-wrapper flex-1">
            <input
              className="login-input"
              value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" placeholder="50 000 0000" autoFocus
            />
            <Smartphone size={18} className="input-icon-start" />
          </div>
        </div>
      </div>

      <button className="login-submit-btn mt-2" onClick={() => alert('OTP Sent (Mock)')}>
        <span>{isRTL ? 'أرسل رمز التحقق' : 'Send OTP'}</span>
      </button>
    </div>
  );

  const NameView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <h2 className="text-xl font-bold text-center mb-1">
        {isRTL ? 'مرحباً بك!' : 'Welcome!'}
      </h2>
      <p className="text-center text-[var(--text-muted)] text-sm mb-4">
        {isRTL ? 'دعنا نتعرف عليك أكثر' : 'Let us get to know you'}
      </p>

      <div className="login-input-group">
        <label className="login-label">{isRTL ? 'الاسم الكامل' : 'Full Name'}</label>
        <div className="login-input-wrapper">
          <input
            className="login-input"
            value={name} onChange={e => setName(e.target.value)}
            type="text" placeholder="Joe Doe" autoFocus
          />
          <User size={18} className="input-icon-start" />
        </div>
      </div>

      <button className="login-submit-btn mt-2" onClick={handleNextStep} disabled={!name}>
        <span>{isRTL ? 'دخول' : 'Enter'}</span>
      </button>
    </div>
  );

  return (
    <div className="login-page-wrapper">
      <div className="login-bg-glow-1" />
      <div className="login-bg-glow-2" />

      <div className="login-container relative overflow-visible">
        <button className="login-close-btn" onClick={() => nav('/')}>
          <X size={20} />
        </button>

        <div className="login-header mb-6">
          <div className="login-logo-wrapper mb-2">
            <div className="brand-text-3d" style={{ fontSize: '42px', animationDuration: '8s' }}>JOE</div>
          </div>
          <div className="brand-ai-badge inline-block text-[10px] mt-1 tracking-[0.2em]">ACCESS PORTAL</div>
        </div>

        {error && <div className="login-error mb-4">{error}</div>}

        {view === 'selection' && <SelectionView />}
        {view === 'email' && <EmailView />}
        {view === 'phone' && <PhoneView />}
        {view === 'register-details' && <NameView />}
      </div>
    </div>
  );
}
