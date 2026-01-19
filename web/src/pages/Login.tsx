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

  // DEBUG: Tracking Deployment Version - v5 (Style Fix)
  console.log('JOE System: Login Page Gold-v5-StyleFix Loaded');

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
    <div className="flex flex-col gap-6 animate-fade-in-up w-full">
      <h2 className="text-xl font-bold text-center text-amber-50 mb-2 font-display tracking-wide">
        {t('login_subtitle', 'Welcome back')}
      </h2>

      {/* Email Input */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{t('email')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600 group-hover:border-amber-500/40"
            value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="you@example.com"
          />
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
        </div>
      </div>

      {/* Password Input */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{t('password')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 pr-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600 group-hover:border-amber-500/40"
            value={password} onChange={e => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'} placeholder="••••••••"
          />
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-amber-500 transition-colors">
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleLogin}
        disabled={loading || !email || !password}
        className="w-full h-12 mt-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-900/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
        <span>{t('login')}</span>
      </button>

      {/* Footer: Register Options */}
      <div className="mt-8 pt-6 border-t border-white/5 text-center">
        <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold mb-4">
          {isRTL ? 'مستخدم جديد؟ سجل عبر' : 'NEW USER? REGISTER VIA'}
        </p>

        <div className="flex justify-center items-center gap-4">
          {/* 1. Google Button */}
          <button
            onClick={() => handleSocialLogin('google')}
            className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:border-red-500/50 hover:bg-zinc-800 flex items-center justify-center shadow-lg transition-all group relative overflow-hidden"
            title="Google"
          >
            <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <svg className="w-5 h-5 text-zinc-400 group-hover:text-red-500 transition-colors relative z-10" viewBox="0 0 24 24">
              <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
            </svg>
          </button>

          {/* 2. Email Button */}
          <button
            onClick={() => setView('register-email')}
            className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:border-amber-500/50 hover:bg-zinc-800 flex items-center justify-center shadow-lg transition-all group relative overflow-hidden"
            title="Email"
          >
            <div className="absolute inset-0 bg-amber-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Mail size={20} className="text-zinc-400 group-hover:text-amber-500 transition-colors relative z-10" />
          </button>

          {/* 3. Phone Button */}
          <button
            onClick={() => setView('register-phone')}
            className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 hover:border-green-500/50 hover:bg-zinc-800 flex items-center justify-center shadow-lg transition-all group relative overflow-hidden"
            title="Phone"
          >
            <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            <Smartphone size={20} className="text-zinc-400 group-hover:text-green-500 transition-colors relative z-10" />
          </button>
        </div>
      </div>
    </div>
  );

  /* 2. Register Email View */
  const RegisterEmailView = () => (
    <div className="flex flex-col gap-6 animate-fade-in-up w-full">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-zinc-500 hover:text-amber-500 transition-colors self-start" onClick={() => setView('login')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{isRTL ? 'الرجوع' : 'BACK TO LOGIN'}</span>
      </div>

      <h2 className="text-xl font-bold text-center text-amber-50 mb-2 font-display">
        {isRTL ? 'إنشاء حساب جديد' : 'Create Account'}
      </h2>

      {/* Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{isRTL ? 'الاسم' : 'Full Name'}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600"
            value={name} onChange={e => setName(e.target.value)}
            type="text" placeholder="Joe Doe" autoFocus
          />
          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
        </div>
      </div>

      {/* Email */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{t('email')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600"
            value={email} onChange={e => setEmail(e.target.value)}
            type="email" placeholder="you@example.com"
          />
          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
        </div>
      </div>

      {/* Password */}
      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{t('password')}</label>
        <div className="relative group">
          <input
            className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600"
            value={password} onChange={e => setPassword(e.target.value)}
            type={showPassword ? 'text' : 'password'} placeholder="••••••••"
          />
          <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
        </div>
      </div>

      <button
        onClick={() => handleRegister('email')}
        disabled={!name || !email || !password || loading}
        className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-900/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <User size={18} />}
        <span>{isRTL ? 'إتمام التسجيل' : 'Complete Registration'}</span>
      </button>
    </div>
  );

  /* 3. Register Phone View */
  const RegisterPhoneView = () => (
    <div className="flex flex-col gap-6 animate-fade-in-up w-full">
      <div className="flex items-center gap-2 mb-2 cursor-pointer text-zinc-500 hover:text-amber-500 transition-colors self-start" onClick={() => setView('login')}>
        <ArrowRight size={14} className={isRTL ? '' : 'rotate-180'} />
        <span className="text-[10px] font-bold uppercase tracking-widest">{isRTL ? 'الرجوع' : 'BACK TO LOGIN'}</span>
      </div>

      <h2 className="text-xl font-bold text-center text-amber-50 mb-2 font-display">
        {isRTL ? 'التسجيل برقم الهاتف' : 'Phone Registration'}
      </h2>

      <div className="space-y-1.5">
        <label className="text-xs font-bold text-amber-500/80 uppercase ml-1 tracking-wider">{isRTL ? 'رقم الهاتف' : 'Mobile Number'}</label>
        <div className="flex gap-3">
          <div className="relative w-32">
            <select
              className="w-full h-12 appearance-none bg-black/40 border border-amber-500/20 rounded-xl pl-3 pr-8 text-sm text-amber-50 outline-none focus:border-amber-500 transition-all cursor-pointer hover:bg-black/60"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
            >
              {countryCodes.map(c => (
                <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
              ))}
            </select>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
              <ArrowRight size={10} className="rotate-90" />
            </div>
          </div>

          <div className="relative flex-1 group">
            <input
              className="w-full h-12 rounded-xl bg-black/40 border border-amber-500/20 px-4 pl-11 text-amber-50 text-sm outline-none focus:border-amber-500 focus:bg-black/60 focus:ring-1 focus:ring-amber-500/50 transition-all placeholder-zinc-600"
              value={phone} onChange={e => setPhone(e.target.value)}
              type="tel" placeholder="50 000 0000" autoFocus
            />
            <Smartphone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
          </div>
        </div>
      </div>

      <button
        onClick={() => handleRegister('phone')}
        disabled={!phone || loading}
        className="w-full h-12 mt-4 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 text-black font-bold text-sm tracking-wide shadow-lg shadow-amber-900/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {loading ? <Loader2 size={18} className="spin" /> : <Smartphone size={18} />}
        <span>{isRTL ? 'إرسال الرمز' : 'Send OTP Code'}</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-black selection:bg-amber-500/30">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900 via-black to-black opacity-90" />
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-amber-600/10 blur-[120px] rounded-full animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-amber-900/10 blur-[120px] rounded-full animate-pulse" style={{ animationDuration: '12s' }} />

      <div className="relative z-10 w-full max-w-[420px] px-6">
        <div className="backdrop-blur-xl bg-black/40 border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-visible">

          {/* Close Button */}
          <button
            className="absolute top-4 right-4 text-zinc-600 hover:text-white transition-colors"
            onClick={() => nav('/')}
            title={t('close', 'Close')}
          >
            <X size={20} />
          </button>

          <div className="text-center mb-8">
            <div className="inline-block relative">
              <div className="text-5xl font-black bg-gradient-to-br from-amber-200 via-amber-400 to-amber-700 bg-clip-text text-transparent drop-shadow-sm tracking-tighter" style={{ fontFamily: 'Inter, sans-serif' }}>
                JOE
              </div>
            </div>
            <div className="text-[9px] text-amber-500/60 tracking-[0.4em] font-bold mt-2 uppercase">
              Secure Access Portal
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-6 p-3 rounded-xl bg-red-950/30 border border-red-500/20 flex items-center gap-3 text-red-400 text-xs font-bold animate-shake">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* View Switcher */}
          {view === 'login' && <LoginForm />}
          {view === 'register-email' && <RegisterEmailView />}
          {view === 'register-phone' && <RegisterPhoneView />}

        </div>

        {/* Footer Copyright */}
        <div className="text-center mt-6 text-zinc-700 text-[10px] uppercase tracking-widest">
          © 2025 Xelite Solutions
        </div>
      </div>
    </div>
  );
}
