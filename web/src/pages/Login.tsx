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

  // DEBUG: Tracking Deployment Version
  console.log('JOE System: Login Page Gold-v3 Loaded');

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
    <div className="flex flex-col gap-4 animate-fade-in-up w-full max-w-[320px] mx-auto">
      <h2 className="text-2xl font-bold text-center mb-4 tracking-tight text-[var(--text-primary)]">
        {isRTL ? 'تسجيل الدخول' : 'Sign In'}
      </h2>

      {/* Email Button */}
      <button
        onClick={() => setView('email')}
        className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-accent-primary hover:bg-[var(--bg-hover)] transition-all group w-full shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-0.5"
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
          <Mail size={20} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold text-[var(--text-primary)] text-sm">{isRTL ? 'البريد الإلكتروني' : 'Email Address'}</div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-wide">user@example.com</div>
        </div>
        <ArrowRight size={18} className={`text-[var(--text-muted)] group-hover:text-accent-primary transition-colors ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      {/* Phone Button */}
      <button
        onClick={() => setView('phone')}
        className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-color)] hover:border-accent-primary hover:bg-[var(--bg-hover)] transition-all group w-full shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.15)] hover:-translate-y-0.5"
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
          <Smartphone size={20} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold text-[var(--text-primary)] text-sm">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</div>
          <div className="text-[10px] text-[var(--text-muted)] tracking-wide">+966 50...</div>
        </div>
        <ArrowRight size={18} className={`text-[var(--text-muted)] group-hover:text-accent-primary transition-colors ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      {/* Divider */}
      <div className="relative my-4 w-full">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border-color)] opacity-30"></div>
        </div>
        <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-[0.2em] text-[var(--text-muted)]">
          <span className="bg-[var(--bg-dark)] px-3">{isRTL ? 'أو' : 'OR'}</span>
        </div>
      </div>

      {/* Social Buttons */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <button
          onClick={() => handleSocialLogin('google')}
          className="flex items-center justify-center gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-accent-primary transition-all shadow-md hover:shadow-lg group"
        >
          <svg className="w-5 h-5 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" className="text-[var(--text-primary)]" />
          </svg>
          <span className="font-bold text-xs tracking-wide text-[var(--text-primary)]">Google</span>
        </button>

        <button
          onClick={() => handleSocialLogin('github')}
          className="flex items-center justify-center gap-3 p-3.5 rounded-xl bg-[var(--bg-card)] hover:bg-[var(--bg-hover)] border border-[var(--border-color)] hover:border-accent-primary transition-all shadow-md hover:shadow-lg group"
        >
          <Github size={20} className="text-[var(--text-primary)] group-hover:scale-110 transition-transform" />
          <span className="font-bold text-xs tracking-wide text-[var(--text-primary)]">GitHub</span>
        </button>
      </div>
    </div>
  );

  const EmailView = () => (
    <form
      className="flex flex-col gap-4 animate-fade-in-up w-full max-w-[320px] mx-auto"
      onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
    >
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors self-start" onClick={() => setView('selection')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-xs font-bold uppercase tracking-wider">{isRTL ? 'الرجوع' : 'BACK'}</span>
      </div>

      <div className="space-y-4 w-full">
        <div>
          <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 ml-1">{t('email')}</label>
          <div className="relative">
            <input
              className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
              value={email} onChange={e => setEmail(e.target.value)}
              type="email" placeholder="you@example.com" autoFocus
            />
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 ml-1">{t('password')}</label>
          <div className="relative">
            <input
              className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 pr-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
              value={password} onChange={e => setPassword(e.target.value)}
              type={showPassword ? 'text' : 'password'} placeholder="••••••••"
            />
            <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
      </div>

      <button className="mt-4 w-full h-12 rounded-xl bg-accent-primary text-[var(--bg-dark)] font-bold text-sm tracking-wide shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2" type="submit" disabled={loading}>
        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
        <span>{t('login')}</span>
      </button>
    </form>
  );

  const PhoneView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up w-full max-w-[320px] mx-auto">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-[var(--text-muted)] hover:text-accent-primary transition-colors self-start" onClick={() => setView('selection')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-xs font-bold uppercase tracking-wider">{isRTL ? 'الرجوع' : 'BACK'}</span>
      </div>

      <div className="space-y-4 w-full">
        <div>
          <label className="block text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider mb-2 ml-1">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</label>
          <div className="flex gap-3">
            <div className="relative">
              <select
                className="appearance-none h-12 bg-[var(--bg-input)] border border-[var(--border-color)] rounded-xl pl-3 pr-8 text-sm text-[var(--text-primary)] outline-none focus:border-accent-primary transition-all cursor-pointer hover:bg-[var(--bg-hover)]"
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

            <div className="relative flex-1">
              <input
                className="w-full h-12 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)] px-4 pl-11 text-[var(--text-primary)] text-sm outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary transition-all placeholder-[var(--text-muted)]"
                value={phone} onChange={e => setPhone(e.target.value)}
                type="tel" placeholder="50 000 0000" autoFocus
              />
              <Smartphone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            </div>
          </div>
        </div>
      </div>

      <button className="mt-4 w-full h-12 rounded-xl bg-accent-primary text-[var(--bg-dark)] font-bold text-sm tracking-wide shadow-lg hover:shadow-[0_0_20px_rgba(var(--accent-rgb),0.3)] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2" onClick={() => alert('OTP Sent (Mock)')}>
        <span>{isRTL ? 'أرسل رمز التحقق' : 'Send OTP'}</span>
        <ArrowRight size={16} className={isRTL ? 'rotate-180' : ''} />
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
