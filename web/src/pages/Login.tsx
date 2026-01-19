import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
  LogIn, UserPlus, Mail, Lock, Eye, EyeOff, Sparkles, X, Loader2,
  Github, Globe, Smartphone, ArrowRight, User
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

  /* =========================================
     Mock Registration Flow
     ========================================= */
  const handleNextStep = () => {
    // In a real flow, checking if user exists would happen here.
    // For this UI demo, we simulate a "New User" flow leading to Name input.
    if (view === 'email' && email) {
      // Assume new user for demo purposes if email contains 'new'
      if (email.includes('new')) {
        setView('register-details');
      } else {
        handleLogin();
      }
    } else if (view === 'register-details') {
      // Mock Registration
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        alert(`Welcome ${name}! Registration Complete (Mock).`);
        nav('/joe'); // Bypass for demo
      }, 1500);
    }
  }

  // Simulated Social Login
  const handleSocialLogin = (provider: 'google' | 'github') => {
    setLoading(true);
    // In a real app, this would redirect to OAuth endpoints
    setTimeout(() => {
      // Mock successful login for visual demonstration
      alert(`Redirecting to ${provider} OAuth... (Backend Integration Required)`);
      setLoading(false);
    }, 1000);
  };

  /* =========================================
     Sub-Components
     ========================================= */

  // 1. Method Selection View
  const SelectionView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <h2 className="text-2xl font-bold text-center mb-2">
        {isRTL ? 'تسجيل الدخول' : 'Sign In'}
      </h2>

      <button
        onClick={() => setView('email')}
        className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-accent-primary/50 transition-all group"
      >
        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 group-hover:scale-110 transition-transform">
          <Mail size={24} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold">{isRTL ? 'البريد الإلكتروني' : 'Email Address'}</div>
          <div className="text-xs text-slate-400">user@example.com</div>
        </div>
        <ArrowRight size={20} className={`text-slate-500 group-hover:text-accent-primary ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      <button
        onClick={() => setView('phone')}
        className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-accent-primary/50 transition-all group"
      >
        <div className="p-2 rounded-lg bg-green-500/20 text-green-400 group-hover:scale-110 transition-transform">
          <Smartphone size={24} />
        </div>
        <div className="flex-1 text-start">
          <div className="font-bold">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</div>
          <div className="text-xs text-slate-400">+966 50 000 0000</div>
        </div>
        <ArrowRight size={20} className={`text-slate-500 group-hover:text-accent-primary ${isRTL ? 'rotate-180' : ''}`} />
      </button>

      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0f172a] px-2 text-slate-500">Or continue with</span></div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => handleSocialLogin('google')}
          className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
        >
          <Globe size={20} className="text-red-400" />
          <span>Google</span>
        </button>
        <button
          onClick={() => handleSocialLogin('github')}
          className="flex items-center justify-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
        >
          <Github size={20} />
          <span>GitHub</span>
        </button>
      </div>
    </div>
  );

  // 2. Email Login View
  const EmailView = () => (
    <form
      className="flex flex-col gap-4 animate-fade-in-up"
      onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
    >
      <div className="flex items-center gap-2 mb-4 cursor-pointer text-slate-400 hover:text-white" onClick={() => setView('selection')}>
        <ArrowRight size={16} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-sm">{isRTL ? 'الرجوع' : 'Back'}</span>
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

  // 3. Phone View (Mock)
  const PhoneView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-4 cursor-pointer text-slate-400 hover:text-white" onClick={() => setView('selection')}>
        <ArrowRight size={16} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-sm">{isRTL ? 'الرجوع' : 'Back'}</span>
      </div>

      <div className="login-input-group">
        <label className="login-label">{isRTL ? 'رقم الهاتف' : 'Phone Number'}</label>
        <div className="flex gap-2">
          <select
            className="bg-zinc-900 border border-slate-700 rounded-xl px-2 text-sm outline-none focus:border-accent-primary"
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

  // 4. Name Input (For New Users)
  const NameView = () => (
    <div className="flex flex-col gap-4 animate-fade-in-up">
      <h2 className="text-xl font-bold text-center mb-2">
        {isRTL ? 'مرحباً بك!' : 'Welcome!'}
      </h2>
      <p className="text-center text-slate-400 text-sm mb-4">
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
          <X size={24} />
        </button>

        {/* Header only shown on main view or compacted elsewhere */}
        <div className="login-header mb-8">
          <div className="login-logo-wrapper">
            <div className="brand-text-3d" style={{ fontSize: '48px', animationDuration: '8s' }}>JOE</div>
          </div>
          <div className="brand-ai-badge inline-block text-[10px] mt-2 tracking-[0.2em]">ACCESS PORTAL</div>
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
