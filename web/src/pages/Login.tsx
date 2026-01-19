
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, X, Loader2,
    Smartphone, ArrowRight, User, AlertCircle
} from 'lucide-react';

export default function Login() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';

    // DEBUG: Tracking Deployment Version - v6 (Inline Style Fix)
    console.log('JOE System: Login Page Gold-v6-Inline Loaded');

    // State Machine
    const [view, setView] = useState<'login' | 'register-email' | 'register-phone'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [countryCode, setCountryCode] = useState('+966');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Constants
    const countryCodes = [
        { code: '+966', flag: '🇸🇦', name: 'KSA' },
        { code: '+971', flag: '🇦🇪', name: 'UAE' },
        { code: '+20', flag: '🇪🇬', name: 'Egypt' },
        { code: '+1', flag: '🇺🇸', name: 'USA' },
        { code: '+44', flag: '🇬🇧', name: 'UK' },
    ];

    // Auth Handlers
    async function handleLogin() {
        setError(null);
        setLoading(true);
        try {
            const emailNormalized = email.trim();
            const res = await fetch(`${API} /auth/login`, {
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
            alert(`Registration via ${type} Successful(Mock).Redirecting to Login...`);
            setView('login');
        }, 1500);
    }

    const handleSocialLogin = (provider: 'google') => {
        setLoading(true);
        setTimeout(() => {
            setLoading(false);
            alert(`Redirecting to ${provider} OAuth...`);
        }, 1000);
    };

    /* =========================================
       INLINE STYLES DEFINITION
       ========================================= */
    const S = {
        wrapper: {
            position: 'fixed' as 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#09090b', // Zinc 950
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: '#f8fafc',
            overflow: 'hidden',
            userSelect: 'none' as 'none',
        },
        bgGradient: {
            position: 'absolute' as 'absolute',
            width: '100%',
            height: '100%',
            background: 'radial-gradient(circle at center, #18181b 0%, #000 100%)',
            zIndex: 0,
            opacity: 0.9,
        },
        glowTop: {
            position: 'absolute' as 'absolute',
            top: '-20%', left: '-10%', width: '50%', height: '50%',
            background: 'rgba(217, 119, 6, 0.1)', // Amber 600
            filter: 'blur(120px)', borderRadius: '50%', zIndex: 0,
            animation: 'pulse 8s infinite alternate',
        },
        glowBottom: {
            position: 'absolute' as 'absolute',
            bottom: '-20%', right: '-10%', width: '50%', height: '50%',
            background: 'rgba(120, 53, 15, 0.1)', // Amber 900
            filter: 'blur(120px)', borderRadius: '50%', zIndex: 0,
            animation: 'pulse 12s infinite alternate',
        },
        card: {
            position: 'relative' as 'relative',
            zIndex: 10,
            width: '100%',
            maxWidth: '420px',
            padding: '40px',
            backgroundColor: 'rgba(9, 9, 11, 0.6)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            borderRadius: '24px',
            boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.7)',
            overflow: 'visible' as 'visible',
        },
        closeBtn: {
            position: 'absolute' as 'absolute',
            top: '20px', right: '20px',
            background: 'none', border: 'none', color: '#52525b', cursor: 'pointer',
            transition: 'color 0.2s',
        },
        titleWrapper: { textAlign: 'center' as 'center', marginBottom: '32px' },
        title: {
            fontSize: '48px', fontWeight: 900, marginBottom: '8px',
            background: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 50%, #b45309 100%)', // Gold Gradient
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            letterSpacing: '-2px',
            fontFamily: 'Inter, sans-serif',
            dropShadow: '0 1px 1px rgba(0,0,0,0.05)',
        },
        subtitle: {
            fontSize: '9px', fontWeight: 700, letterSpacing: '4px', color: 'rgba(245, 158, 11, 0.6)', textTransform: 'uppercase' as 'uppercase'
        },
        inputGroup: { marginBottom: '20px' },
        label: {
            display: 'block', marginBottom: '8px', fontSize: '12px', fontWeight: 700,
            color: 'rgba(245, 158, 11, 0.8)', textTransform: 'uppercase' as 'uppercase', letterSpacing: '1px',
            marginLeft: '4px',
        },
        inputWrapper: { position: 'relative' as 'relative' },
        input: {
            width: '100%', height: '48px',
            backgroundColor: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(245, 158, 11, 0.2)', // Amber border
            borderRadius: '12px',
            padding: isRTL ? '0 16px 0 44px' : '0 44px 0 16px', // Adjusted for icon position
            fontSize: '14px', color: '#fff', outline: 'none',
            transition: 'all 0.2s',
            boxSizing: 'border-box' as 'border-box',
            placeholderColor: '#71717a',
        },
        iconStart: {
            position: 'absolute' as 'absolute',
            top: '50%',
            left: isRTL ? 'auto' : '16px', right: isRTL ? '16px' : 'auto',
            transform: 'translateY(-50%)',
            color: '#71717a', // Zinc 500
            pointerEvents: 'none' as 'none',
            transition: 'color 0.2s',
        },
        iconEnd: {
            position: 'absolute' as 'absolute',
            top: '50%',
            right: isRTL ? '12px' : '12px', // Adjusted for better spacing
            transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: '#71717a', cursor: 'pointer',
            transition: 'color 0.2s',
        },
        submitBtn: {
            width: '100%', height: '48px', marginTop: '16px',
            background: 'linear-gradient(to right, #d97706 0%, #f59e0b 100%)', // Amber 600 -> 500
            border: 'none', borderRadius: '12px',
            color: '#000', fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: '0 10px 20px -5px rgba(180, 83, 9, 0.2)',
            transition: 'all 0.2s',
        },
        footer: {
            marginTop: '32px', paddingTop: '24px',
            borderTop: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' as 'center',
        },
        footerText: {
            fontSize: '10px', color: '#71717a', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as 'uppercase', marginBottom: '16px'
        },
        socialRow: { display: 'flex', justifyContent: 'center', gap: '16px' },
        socialBtn: {
            width: '48px', height: '48px', borderRadius: '50%',
            backgroundColor: '#18181b', border: '1px solid #27272a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s',
            color: '#a1a1aa',
            position: 'relative' as 'relative',
            overflow: 'hidden' as 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
        },
        socialBtnHoverOverlay: {
            position: 'absolute' as 'absolute', inset: 0, opacity: 0, transition: 'opacity 0.2s',
        },
        socialBtnIcon: {
            position: 'relative' as 'relative', zIndex: 10, transition: 'color 0.2s',
        },
        backButton: {
            display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px', cursor: 'pointer',
            color: '#71717a', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' as 'uppercase', letterSpacing: '2px',
            transition: 'color 0.2s', alignSelf: 'flex-start' as 'flex-start',
        },
        errorAlert: {
            marginBottom: '24px', padding: '12px', borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px',
            animation: 'shake 0.5s ease-in-out',
        },
        countryCodeSelect: {
            appearance: 'none' as 'none',
            backgroundColor: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(245, 158, 11, 0.2)',
            borderRadius: '12px',
            paddingLeft: '12px',
            paddingRight: '32px', // Space for custom arrow
            height: '48px',
            fontSize: '14px',
            color: '#fff',
            outline: 'none',
            transition: 'all 0.2s',
            cursor: 'pointer',
            boxSizing: 'border-box' as 'border-box',
        },
        selectArrow: {
            position: 'absolute' as 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%) rotate(90deg)',
            pointerEvents: 'none' as 'none',
            color: '#71717a',
        },
        copyright: {
            position: 'absolute' as 'absolute',
            bottom: '20px',
            fontSize: '10px',
            color: '#52525b',
            textTransform: 'uppercase' as 'uppercase',
            letterSpacing: '2px',
            textAlign: 'center' as 'center',
            width: '100%',
            maxWidth: '420px',
        }
    };

    /* 2. Sub-Components */
    const LoginForm = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeUp 0.5s ease-out', width: '100%' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: '8px', fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px' }}>
                {t('login_subtitle', 'Welcome back')}
            </h2>

            {/* Email */}
            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{t('email')}</label>
                <div style={S.inputWrapper}>
                    <input
                        style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '16px' }}
                        value={email} onChange={e => setEmail(e.target.value)}
                        type="email" placeholder="you@example.com"
                    />
                    <Mail size={18} style={S.iconStart} />
                </div>
            </div>

            {/* Password */}
            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{t('password')}</label>
                <div style={S.inputWrapper}>
                    <input
                        style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '44px' }}
                        value={password} onChange={e => setPassword(e.target.value)}
                        type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                    />
                    <Lock size={18} style={S.iconStart} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={S.iconEnd}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>

            <button
                onClick={handleLogin}
                disabled={loading || !email || !password}
                style={{ ...S.submitBtn, opacity: (loading || !email || !password) ? 0.5 : 1, cursor: (loading || !email || !password) ? 'not-allowed' : 'pointer', transform: (loading || !email || !password) ? 'none' : 'translateY(0)', boxShadow: (loading || !email || !password) ? 'none' : S.submitBtn.boxShadow }}
                onMouseEnter={(e) => { if (!(loading || !email || !password)) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { if (!(loading || !email || !password)) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
                {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
                <span>{t('login')}</span>
            </button>

            <div style={S.footer}>
                <p style={S.footerText}>
                    {isRTL ? 'مستخدم جديد؟ سجل عبر' : 'NEW USER? REGISTER VIA'}
                </p>

                <div style={S.socialRow}>
                    {/* Google */}
                    <button
                        onClick={() => handleSocialLogin('google')}
                        style={S.socialBtn}
                        title="Google"
                        onMouseEnter={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '1';
                            if (svg) svg.style.color = '#ef4444';
                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                        onMouseLeave={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '0';
                            if (svg) svg.style.color = '#a1a1aa';
                            e.currentTarget.style.borderColor = '#27272a';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                    >
                        <div style={{ ...S.socialBtnHoverOverlay, backgroundColor: 'rgba(239, 68, 68, 0.1)' }} />
                        <svg style={{ ...S.socialBtnIcon, width: '20px', height: '20px' }} viewBox="0 0 24 24">
                            <path fill="currentColor" d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z" />
                        </svg>
                    </button>

                    {/* Email */}
                    <button
                        onClick={() => setView('register-email')}
                        style={S.socialBtn}
                        title="Email"
                        onMouseEnter={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '1';
                            if (svg) svg.style.color = '#f59e0b';
                            e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                        onMouseLeave={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '0';
                            if (svg) svg.style.color = '#a1a1aa';
                            e.currentTarget.style.borderColor = '#27272a';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                    >
                        <div style={{ ...S.socialBtnHoverOverlay, backgroundColor: 'rgba(245, 158, 11, 0.1)' }} />
                        <Mail size={20} style={S.socialBtnIcon} />
                    </button>

                    {/* Phone */}
                    <button
                        onClick={() => setView('register-phone')}
                        style={S.socialBtn}
                        title="Phone"
                        onMouseEnter={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '1';
                            if (svg) svg.style.color = '#22c55e';
                            e.currentTarget.style.borderColor = 'rgba(34, 197, 94, 0.5)';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                        onMouseLeave={(e) => {
                            const div = e.currentTarget.querySelector('div') as HTMLElement;
                            const svg = e.currentTarget.querySelector('svg') as HTMLElement;
                            if (div) div.style.opacity = '0';
                            if (svg) svg.style.color = '#a1a1aa';
                            e.currentTarget.style.borderColor = '#27272a';
                            e.currentTarget.style.backgroundColor = '#18181b';
                        }}
                    >
                        <div style={{ ...S.socialBtnHoverOverlay, backgroundColor: 'rgba(34, 197, 94, 0.1)' }} />
                        <Smartphone size={20} style={S.socialBtnIcon} />
                    </button>
                </div>
            </div>
        </div>
    );

    /* 3. Register Email View */
    const RegisterEmailView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeUp 0.5s ease-out', width: '100%' }}>
            <div
                style={S.backButton}
                onClick={() => setView('login')}
                onMouseEnter={(e) => e.currentTarget.style.color = '#f59e0b'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#71717a'}
            >
                <ArrowRight size={14} style={{ transform: isRTL ? 'none' : 'rotate(180deg)' }} />
                <span>{isRTL ? 'الرجوع' : 'BACK TO LOGIN'}</span>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: '8px', fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px' }}>
                {isRTL ? 'إنشاء حساب جديد' : 'Create Account'}
            </h2>

            {/* Name */}
            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{isRTL ? 'الاسم' : 'Full Name'}</label>
                <div style={S.inputWrapper}>
                    <input
                        style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '16px' }}
                        value={name} onChange={e => setName(e.target.value)}
                        type="text" placeholder="Joe Doe" autoFocus
                    />
                    <User size={18} style={S.iconStart} />
                </div>
            </div>

            {/* Email */}
            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{t('email')}</label>
                <div style={S.inputWrapper}>
                    <input
                        style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '16px' }}
                        value={email} onChange={e => setEmail(e.target.value)}
                        type="email" placeholder="you@example.com"
                    />
                    <Mail size={18} style={S.iconStart} />
                </div>
            </div>

            {/* Password */}
            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{t('password')}</label>
                <div style={S.inputWrapper}>
                    <input
                        style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '16px' }}
                        value={password} onChange={e => setPassword(e.target.value)}
                        type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                    />
                    <Lock size={18} style={S.iconStart} />
                </div>
            </div>

            <button
                onClick={() => handleRegister('email')}
                disabled={!name || !email || !password || loading}
                style={{ ...S.submitBtn, opacity: (!name || !email || !password || loading) ? 0.5 : 1, cursor: (!name || !email || !password || loading) ? 'not-allowed' : 'pointer', transform: (!name || !email || !password || loading) ? 'none' : 'translateY(0)', boxShadow: (!name || !email || !password || loading) ? 'none' : S.submitBtn.boxShadow }}
                onMouseEnter={(e) => { if (!(!name || !email || !password || loading)) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { if (!(!name || !email || !password || loading)) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
                {loading ? <Loader2 size={18} className="spin" /> : <User size={18} />}
                <span>{isRTL ? 'إتمام التسجيل' : 'Complete Registration'}</span>
            </button>
        </div>
    );

    /* 4. Register Phone View */
    const RegisterPhoneView = () => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeUp 0.5s ease-out', width: '100%' }}>
            <div
                style={S.backButton}
                onClick={() => setView('login')}
                onMouseEnter={(e) => e.currentTarget.style.color = '#f59e0b'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#71717a'}
            >
                <ArrowRight size={14} style={{ transform: isRTL ? 'none' : 'rotate(180deg)' }} />
                <span>{isRTL ? 'الرجوع' : 'BACK TO LOGIN'}</span>
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: '8px', fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px' }}>
                {isRTL ? 'التسجيل برقم الهاتف' : 'Phone Registration'}
            </h2>

            <div style={{ ...S.inputGroup, marginBottom: '0' }}>
                <label style={S.label}>{isRTL ? 'رقم الهاتف' : 'Mobile Number'}</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative', width: '110px' }}>
                        <select
                            style={S.countryCodeSelect}
                            value={countryCode} onChange={e => setCountryCode(e.target.value)}
                        >
                            {countryCodes.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                        </select>
                        <div style={S.selectArrow}>
                            <ArrowRight size={10} />
                        </div>
                    </div>
                    <div style={{ ...S.inputWrapper, flex: 1 }}>
                        <input
                            style={{ ...S.input, paddingLeft: isRTL ? '16px' : '44px', paddingRight: isRTL ? '44px' : '16px' }}
                            value={phone} onChange={e => setPhone(e.target.value)}
                            type="tel" placeholder="50 000 0000" autoFocus
                        />
                        <Smartphone size={18} style={S.iconStart} />
                    </div>
                </div>
            </div>

            <button
                onClick={() => handleRegister('phone')}
                disabled={!phone || loading}
                style={{ ...S.submitBtn, opacity: (!phone || loading) ? 0.5 : 1, cursor: (!phone || loading) ? 'not-allowed' : 'pointer', transform: (!phone || loading) ? 'none' : 'translateY(0)', boxShadow: (!phone || loading) ? 'none' : S.submitBtn.boxShadow }}
                onMouseEnter={(e) => { if (!(!phone || loading)) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={(e) => { if (!(!phone || loading)) e.currentTarget.style.transform = 'translateY(0)'; }}
            >
                {loading ? <Loader2 size={18} className="spin" /> : <Smartphone size={18} />}
                <span>{isRTL ? 'إرسال الرمز' : 'Send OTP Code'}</span>
            </button>
        </div>
    );

    return (
        <div style={S.wrapper}>
            <style>{`
          @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
          @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
            20%, 40%, 60%, 80% { transform: translateX(5px); }
          }
          input:focus { border-color: #f59e0b !important; box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4); }
          select:focus { border-color: #f59e0b !important; box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.4); }
          button:hover { color: #fff; }
          button:hover svg { color: #f59e0b; }
          .group:hover .text-zinc-500 { color: #f59e0b; }
          .group-focus-within .text-zinc-500 { color: #f59e0b; }
        `}</style>
            <div style={S.bgGradient} />
            <div style={S.glowTop} />
            <div style={S.glowBottom} />

            <div style={{ ...S.card, paddingLeft: '24px', paddingRight: '24px' }}> {/* Adjusted padding for max-width */}
                <button
                    style={S.closeBtn}
                    onClick={() => nav('/')}
                    title={t('close', 'Close')}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                    onMouseLeave={(e) => e.currentTarget.style.color = '#52525b'}
                >
                    <X size={20} />
                </button>

                <div style={S.titleWrapper}>
                    <div style={S.title}>JOE</div>
                    <div style={S.subtitle}>Secure Access Portal</div>
                </div>

                {error && (
                    <div style={S.errorAlert}>
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
            <div style={S.copyright}>
                © 2025 Xelite Solutions
            </div>
        </div>
    );
}
