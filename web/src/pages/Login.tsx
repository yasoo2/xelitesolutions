import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API, GOOGLE_CLIENT_ID } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LanguageSwitcher from '../components/LanguageSwitcher';

// VERSION: v18-Premium-Global
console.log('JOE System: Login Page v18-Premium-Global Loaded');

export default function Login() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();


    const emailRef = useRef<HTMLInputElement>(null);
    const passRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [health, setHealth] = useState<{ status: string, db: number } | null>(null);
    const [googleState, setGoogleState] = useState<{
        ready: boolean;
        clientIdAvailable: boolean;
        secretConfigured: boolean;
    } | null>(null);


    // Health Check on mount
    useEffect(() => {
        const check = async () => {
            try {
                const res = await fetch(`${API}/health`, { cache: 'no-store' });
                const data = await res.json();
                setHealth(data);
            } catch (e) {
                setHealth({ status: 'FAIL', db: 0 });
            }
        };
        check();
    }, []);

    useEffect(() => {
        let alive = true;
        const check = async () => {
            try {
                const u = new URL(`${API}/auth/google/config`);
                if (GOOGLE_CLIENT_ID) u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
                const res = await fetch(u.toString(), { cache: 'no-store' });
                const data = await res.json().catch(() => ({}));
                if (!alive) return;
                const serverClientId = String(data?.clientId || '').trim();
                const secretConfigured = !!data?.secretConfigured;
                const clientIdAvailable = !!serverClientId || !!GOOGLE_CLIENT_ID;
                const ready = clientIdAvailable && secretConfigured;
                setGoogleState({ ready, clientIdAvailable, secretConfigured });
            } catch {
                if (!alive) return;
                setGoogleState(null);
            }
        };
        check();
        return () => {
            alive = false;
        };
    }, []);

    useEffect(() => {
        const hash = String(window.location.hash || '').replace(/^#/, '');
        if (!hash) return;
        const params = new URLSearchParams(hash);
        const token = String(params.get('token') || '').trim();
        const err = String(params.get('error') || '').trim();

        if (token) {
            try {
                localStorage.setItem('token', token);
            } catch { }
            window.location.hash = '';
            nav('/joe', { replace: true });
            return;
        }

        if (err) {
            const msg =
                err === 'google_client_id_missing'
                    ? 'Google OAuth غير مضبوط: client_id مفقود.'
                    : err === 'google_client_secret_missing'
                        ? 'Google OAuth غير مضبوط: client_secret مفقود.'
                        : err === 'access_denied'
                            ? 'تم إلغاء تسجيل الدخول عبر Google.'
                            : `Google OAuth error: ${err}`;
            setError(msg);
            window.location.hash = '';
        }
    }, [nav]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const email = emailRef.current?.value || '';
        const password = passRef.current?.value || '';

        if (!email || !password) {
            setError(t('login_error_missing'));
            return;
        }

        if (health?.status && health.status !== 'OK') {
            setError(t('api_unreachable'));
            return;
        }

        setError(null);
        setLoading(true);

        try {
            const endpoint = mode === 'register' ? `${API}/auth/register` : `${API}/auth/login`;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Language': i18n.language || 'en'
                },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                const serverError = String(data?.error || '').trim();
                if (res.status === 401) {
                    throw new Error(i18n.language?.startsWith('ar') ? 'بيانات الدخول غير صحيحة أو الحساب غير موجود.' : 'Invalid credentials.');
                }
                if (res.status === 403 && /registration is currently closed/i.test(serverError)) {
                    throw new Error(i18n.language?.startsWith('ar') ? 'التسجيل مغلق حالياً.' : 'Registration is currently closed.');
                }
                throw new Error(serverError || t('httpRequestFailed', { status: res.status }));
            }

            if (mode === 'register') {
                setMode('login');
                const res2 = await fetch(`${API}/auth/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept-Language': i18n.language || 'en'
                    },
                    body: JSON.stringify({ email, password }),
                });
                const data2 = await res2.json().catch(() => ({}));
                if (!res2.ok) throw new Error(String(data2?.error || '').trim() || t('login_error_auth'));
                localStorage.setItem('token', String(data2?.token || ''));
                nav('/joe');
                return;
            }

            localStorage.setItem('token', String(data?.token || ''));
            nav('/joe');
        } catch (err: any) {
            const msg = String(err?.message || '');
            if (/failed to fetch/i.test(msg) || /network/i.test(msg)) {
                setError(t('api_unreachable'));
            } else {
                setError(msg || t('login_error_auth'));
            }
        }
        setLoading(false);
    };

    const S: any = {
        wrapper: {
            position: 'fixed' as 'fixed', inset: 0,
            background: 'linear-gradient(135deg, #09090b 0%, #18181b 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Inter, sans-serif', overflow: 'hidden'
        },
        // Animated background orb
        orb: {
            position: 'absolute', width: '600px', height: '600px',
            background: 'radial-gradient(circle, rgba(245, 158, 11, 0.15) 0%, rgba(0,0,0,0) 70%)',
            top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 0, pointerEvents: 'none'
        },
        card: {
            position: 'relative', zIndex: 10,
            width: '100%', maxWidth: '420px',
            backgroundColor: 'rgba(24, 24, 27, 0.6)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '40px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        },
        header: { textAlign: 'center', marginBottom: '32px' },
        logo: {
            fontSize: '42px', fontWeight: 900, color: '#f59e0b',
            letterSpacing: '-1px', marginBottom: '8px',
            background: 'linear-gradient(to right, #f59e0b, #d97706)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
        },
        subtitle: { fontSize: '13px', color: '#a1a1aa', fontWeight: 500 },

        inputGroup: { marginBottom: '20px', position: 'relative' },
        input: {
            width: '100%', height: '50px',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px', padding: '0 16px 0 48px',
            color: '#fff', fontSize: '15px', outline: 'none',
            transition: 'all 0.2s ease'
        },
        icon: { position: 'absolute', left: '16px', top: '15px', color: '#71717a' },

        btn: {
            width: '100%', height: '50px',
            background: 'linear-gradient(to right, #f59e0b, #d97706)',
            color: '#fff', border: 'none', borderRadius: '12px',
            cursor: 'pointer', fontWeight: 600, fontSize: '15px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
            boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.2)',
            transition: 'all 0.2s'
        },

        googleBtn: {
            width: '100%', height: '50px',
            backgroundColor: '#ffffff',
            color: '#18181b', border: 'none', borderRadius: '12px',
            cursor: 'pointer', fontWeight: 600, fontSize: '14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
            transition: 'all 0.2s'
        }
    };

    return (
        <div style={S.wrapper}>
            {/* Ambient Background */}
            <motion.div
                style={S.orb}
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />

            <LanguageSwitcher />

            <div style={{ position: 'absolute', top: 24, right: 24, display: 'flex', gap: 8 }}>
                <div style={{
                    padding: '6px 12px', borderRadius: '20px',
                    background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                    fontSize: '11px', color: health?.status === 'OK' ? '#10b981' : '#ef4444',
                    display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)'
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: health?.status === 'OK' ? '#10b981' : '#ef4444' }} />
                    {t('system')} {health?.status || t('connecting')}
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                style={S.card}
            >
                <div style={S.header}>
                    <div style={S.logo}>JOE</div>
                    <div style={S.subtitle}>{t('login_subtitle')}</div>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                            style={{ marginBottom: 20, overflow: 'hidden' }}
                        >
                            <div style={{
                                padding: '12px', borderRadius: '8px',
                                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                                color: '#fca5a5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 10
                            }}>
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSubmit}>
                    <div style={S.inputGroup}>
                        <Mail size={18} style={S.icon} />
                        <input
                            ref={emailRef}
                            type="email"
                            placeholder="admin@xelitesolutions.com"
                            style={S.input}
                            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                        />
                    </div>

                    <div style={S.inputGroup}>
                        <Lock size={18} style={S.icon} />
                        <input
                            ref={passRef}
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            style={S.input}
                            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: 16, top: 15, background: 'none', border: 'none', cursor: 'pointer', color: '#71717a', padding: 0 }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={loading}
                        style={S.btn}
                    >
                        {loading ? <Loader2 size={20} className="spin" /> : <LogIn size={20} />}
                        <span>{mode === 'register' ? t('register') : t('login')}</span>
                    </motion.button>
                </form>

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                            setError(null);
                            setMode((m) => (m === 'login' ? 'register' : 'login'));
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#a1a1aa',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            fontSize: 13,
                            fontWeight: 600,
                            textDecoration: 'underline',
                            padding: 0,
                        }}
                    >
                        {mode === 'login' ? t('register') : t('login')}
                    </button>
                </div>


                <div style={{ display: 'flex', alignItems: 'center', margin: '24px 0', gap: '16px' }}>
                    <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: '12px', color: '#52525b', fontWeight: 500 }}>OR CONTINUE WITH</span>
                    <div style={{ height: '1px', flex: 1, background: 'rgba(255,255,255,0.1)' }} />
                </div>

                <motion.button
                    whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                        if (googleState?.ready === false) {
                            setError(
                                googleState.secretConfigured === false
                                    ? 'Google OAuth غير مضبوط على الخادم: السر (Client Secret) مفقود.'
                                    : googleState.clientIdAvailable === false
                                        ? 'Google OAuth غير مضبوط: معرف العميل (Client ID) مفقود.'
                                        : 'تكوين Google OAuth غير مكتمل على الخادم.'
                            );
                            return;
                        }
                        const u = new URL(`${API}/auth/google`);
                        u.searchParams.set('returnTo', window.location.origin);
                        if (GOOGLE_CLIENT_ID) u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
                        window.location.href = u.toString();
                    }}
                    style={{
                        ...S.googleBtn,
                        opacity: googleState?.ready === false ? 0.7 : 1,
                        cursor: 'pointer'
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26.81-.58z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    <span>{t('google_login')}</span>
                </motion.button>
            </motion.div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
                input::placeholder { color: #52525b; }
            `}</style>
        </div>
    );
}
// Deploy trigger: 1769843084
