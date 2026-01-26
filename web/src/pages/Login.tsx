import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, X, Loader2, AlertCircle
} from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';

// VERSION: v16 (Zero-Trust Ground-Up Build)
console.log('JOE System: Login Page Gold-v16-CleanBuild Loaded');

export default function Login() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';
    const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

    // Refs for physical input values (Defense against stale React state via autofill)
    const emailRef = useRef<HTMLInputElement>(null);
    const passRef = useRef<HTMLInputElement>(null);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [mountTime] = useState(Date.now());

    // Google Auth
    const googleLogin = useGoogleLogin({
        onSuccess: async (tk: any) => {
            setLoading(true);
            try {
                const res = await fetch(`${API}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tk.access_token }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Google Auth Failed');
                localStorage.setItem('token', data.token);
                nav('/joe');
            } catch (err: any) {
                setError(err.message);
                setLoading(false);
            }
        },
        onError: () => setError('Google Login Failed')
    });

    const handleLogin = async (e: any) => {
        if (e) {
           e.preventDefault();
           e.stopPropagation();
        }

        // ABSOLUTE PROTECTION LAYER
        const timeSinceMount = Date.now() - mountTime;
        const isSynthetic = e?.clientX === 0 && e?.clientY === 0;

        console.log('[DEBUG-v16] handleLogin called', {
            type: e?.type,
            isTrusted: e?.isTrusted,
            isSynthetic,
            timeSinceMount,
            source: 'Manual Button'
        });

        // 1. Block immediate mount-time clicks (Bots/Extensions)
        if (timeSinceMount < 1500 && !e?.isTrusted) {
            console.error('[SECURITY] Blocked rapid un-trusted trigger.');
            return;
        }

        // 2. Extract values from DOM (Bypass React state lag/autofill issues)
        const typedEmail = emailRef.current?.value || email;
        const typedPass = passRef.current?.value || password;

        if (!typedEmail || !typedPass) {
            console.warn('[SECURITY] Blocked login with missing credentials.');
            return;
        }

        setError(null);
        setLoading(true);

        try {
            console.log('[SECURITY] Fetching auth token...');
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: typedEmail.trim(), password: typedPass }),
            });
            const data = await res.json().catch(() => ({}));
            
            if (!res.ok) {
                throw new Error(data.error || 'Authentication Failed');
            }

            localStorage.setItem('token', data.token);
            nav('/joe');
        } catch (err: any) {
            console.error('[SECURITY] Login error:', err.message);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const S: any = {
        wrapper: { position: 'fixed' as 'fixed', inset: 0, backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f8fafc', overflow: 'hidden', fontFamily: 'Inter, sans-serif' },
        bg: { position: 'absolute' as 'absolute', inset: 0, background: 'radial-gradient(circle at center, #18181b 0%, #000 100%)', opacity: 0.9, zIndex: 0 },
        card: { position: 'relative' as 'relative', zIndex: 10, width: '100%', maxWidth: '420px', padding: '40px', backgroundColor: 'rgba(9, 9, 11, 0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '24px', boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.7)' },
        title: { fontSize: '42px', fontWeight: 900, textAlign: 'center' as 'center', background: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 50%, #b45309 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px' },
        subtitle: { fontSize: '10px', fontWeight: 700, textAlign: 'center' as 'center', color: 'rgba(245, 158, 11, 0.6)', textTransform: 'uppercase', letterSpacing: '4px', marginBottom: '32px' },
        input: { width: '100%', height: '48px', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: '0 16px', color: '#fff', outline: 'none', transition: 'all 0.2s', fontSize: '14px' },
        label: { display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: 'rgba(245, 158, 11, 0.8)', textTransform: 'uppercase' },
        btn: { width: '100%', height: '48px', background: 'linear-gradient(to right, #d97706 0%, #f59e0b 100%)', border: 'none', borderRadius: '12px', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '16px' },
        googleBtn: { width: '100%', height: '48px', backgroundColor: '#fff', border: 'none', borderRadius: '12px', color: '#1f2937', fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer', marginTop: '24px' },
        error: { padding: '12px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }
    };

    return (
        <div style={S.wrapper}>
            <div style={S.bg} />
            <div style={S.card}>
                <div style={S.title}>JOE</div>
                <div style={S.subtitle}>Secure Access Node</div>

                {error && <div style={S.error}><AlertCircle size={16} /><span>{error}</span></div>}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={S.label}>{t('email')}</label>
                        <input 
                            ref={emailRef}
                            type="email" 
                            name="email"
                            autoComplete="username"
                            style={S.input} 
                            value={email} 
                            onChange={e => setEmail(e.target.value)} 
                            placeholder="you@domain.com"
                        />
                    </div>
                    <div>
                        <label style={S.label}>{t('password')}</label>
                        <div style={{ position: 'relative' }}>
                            <input 
                                ref={passRef}
                                type={showPassword ? 'text' : 'password'} 
                                name="password"
                                autoComplete="current-password"
                                style={S.input} 
                                value={password} 
                                onChange={e => setPassword(e.target.value)} 
                                placeholder="••••••••"
                            />
                            <div 
                                onClick={() => setShowPassword(!showPassword)}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#71717a' }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </div>
                        </div>
                    </div>

                    <button type="submit" disabled={loading} style={{ ...S.btn, opacity: loading ? 0.6 : 1 }}>
                        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
                        <span>{t('login')}</span>
                    </button>
                </form>

                {googleEnabled && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
                           <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                           <span style={{ fontSize: '11px', color: '#71717a', fontWeight: 600 }}>OR</span>
                           <div style={{ height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                        </div>
                        <button onClick={() => googleLogin()} style={S.googleBtn}>
                            <svg width="20" height="20" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                            </svg>
                            <span>{t('continue_with_google', 'Continue with Google')}</span>
                        </button>
                    </>
                )}
            </div>
            <div style={{ position: 'absolute', bottom: '24px', fontSize: '10px', color: '#52525b', letterSpacing: '2px' }}>
                © 2025 Xelite Solutions
            </div>
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
            `}</style>
        </div>
    );
}
