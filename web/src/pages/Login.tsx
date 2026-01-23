
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, X, Loader2,
    Smartphone, ArrowRight, User, AlertCircle
} from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

export default function Login() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';

    // DEBUG: Tracking Deployment Version - v7 (Google Only)
    console.log('JOE System: Login Page Gold-v7-GoogleOnly Loaded');

    // State Machine
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Auth Handlers
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

    const googleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse: any) => {
            setLoading(true);
            try {
                // Modified: Only send the access_token, which is what implicit flow returns.
                const res = await fetch(`${API}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenResponse.access_token }),
                });

                const raw = await res.text();
                let data: any = null;
                try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }

                if (!res.ok) {
                    setError(data?.error || raw || 'Google Login Failed');
                    return;
                }

                localStorage.setItem('token', data.token);
                nav('/joe');
            } catch (e) {
                console.error(e);
                setError('Google Login Error');
            } finally {
                setLoading(false);
            }
        },
        onError: () => {
            setError('Google Login Failed');
            setLoading(false);
        }
    });

    // We will use a custom function that calls googleLogin()
    const handleSocialLogin = () => {
        setLoading(true); // temporary visual feedback
        googleLogin();
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
            fontSize: '13px', color: '#a1a1aa', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as 'uppercase', marginBottom: '20px'
        },
        socialRow: { display: 'flex', justifyContent: 'center' },
        socialBtn: {
            width: '100%', height: '48px', borderRadius: '12px',
            backgroundColor: '#fff', // White standard
            border: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            cursor: 'pointer', transition: 'all 0.2s',
            position: 'relative' as 'relative',
            overflow: 'hidden' as 'hidden',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        },
        socialBtnText: {
            fontSize: '14px', fontWeight: 600, color: '#1f2937', fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.2px',
        },
        socialBtnHoverOverlay: {
            position: 'absolute' as 'absolute', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.05)',
            opacity: 0, transition: 'opacity 0.2s',
        },
        socialBtnIcon: {
            position: 'relative' as 'relative', zIndex: 10,
            width: '20px', height: '20px',
        },
        divider: {
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
            margin: '24px 0', width: '100%',
        },
        dividerLine: {
            height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.1)',
        },
        dividerText: {
            fontSize: '11px', fontWeight: 600, color: '#71717a', textTransform: 'uppercase' as 'uppercase', letterSpacing: '1px',
        },
        errorAlert: {
            marginBottom: '24px', padding: '12px', borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px',
            animation: 'shake 0.5s ease-in-out',
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

            <div style={S.divider}>
                <div style={S.dividerLine} />
                <span style={S.dividerText}>{t('or_continue_with', 'OR')}</span>
                <div style={S.dividerLine} />
            </div>

            {/* Google Login Button */}
            <button
                onClick={() => handleSocialLogin()}
                style={S.socialBtn}
                title="Continue with Google"
                onMouseEnter={(e) => {
                    const div = e.currentTarget.querySelector('.overlay') as HTMLElement;
                    if (div) div.style.opacity = '1';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                    const div = e.currentTarget.querySelector('.overlay') as HTMLElement;
                    if (div) div.style.opacity = '0';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                }}
            >
                <div className="overlay" style={S.socialBtnHoverOverlay} />
                <svg style={S.socialBtnIcon} viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span style={S.socialBtnText}>
                    {t('continue_with_google', 'Continue with Google')}
                </span>
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

                    <div style={S.divider}>
                        <div style={S.dividerLine} />
                        <span style={S.dividerText}>{t('or_continue_with', 'OR')}</span>
                        <div style={S.dividerLine} />
                    </div>

                    {/* Google Login Button */}
                    <button
                        onClick={() => handleSocialLogin()}
                        style={S.socialBtn}
                        title="Continue with Google"
                        onMouseEnter={(e) => {
                            const div = e.currentTarget.querySelector('.overlay') as HTMLElement;
                            if (div) div.style.opacity = '1';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.15)';
                        }}
                        onMouseLeave={(e) => {
                            const div = e.currentTarget.querySelector('.overlay') as HTMLElement;
                            if (div) div.style.opacity = '0';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
                        }}
                    >
                        <div className="overlay" style={S.socialBtnHoverOverlay} />
                        <svg style={S.socialBtnIcon} viewBox="0 0 48 48">
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                        <span style={S.socialBtnText}>
                            {t('continue_with_google', 'Continue with Google')}
                        </span>
                    </button>
                </div>
            </div>

            {/* Footer Copyright */}
            <div style={S.copyright}>
                © 2025 Xelite Solutions
            </div>
        </div>
    );
}
