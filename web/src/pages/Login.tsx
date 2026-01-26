import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, X, Loader2,
    AlertCircle, ShieldCheck
} from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { motion, useMotionValue, useTransform } from 'framer-motion';

// VERSION: v14 (Human-Key Defense)
console.log('JOE System: Login Page Gold-v14-HumanKey Loaded');

function GoogleLoginButton({ t, nav, setError, setLoading, S }: any) {
    const googleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse: any) => {
            setLoading(true);
            try {
                const res = await fetch(`${API}/auth/google`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenResponse.access_token }),
                });
                const raw = await res.text();
                let data: any = null;
                try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
                if (!res.ok) { setError(data?.error || raw || 'Google Login Failed'); return; }
                localStorage.setItem('token', data.token);
                nav('/joe');
            } catch (e) { console.error(e); setError('Google Login Error'); } finally { setLoading(false); }
        },
        onError: () => { setError('Google Login Failed'); setLoading(false); }
    });
    return (
        <button onClick={() => { setLoading(true); googleLogin(); }} style={S.socialBtn}>
            <div className="overlay" style={S.socialBtnHoverOverlay} />
            <svg style={S.socialBtnIcon} viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                <path fill="none" d="M0 0h48v48H0z" />
            </svg>
            <span style={S.socialBtnText}>{t('continue_with_google', 'Continue with Google')}</span>
        </button>
    );
}

const SwipeToUnlock = ({ onUnlock, S }: any) => {
    const x = useMotionValue(0);
    const trackRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(300);

    useEffect(() => {
        if (trackRef.current) setWidth(trackRef.current.offsetWidth - 56);
    }, []);

    const opacity = useTransform(x, [0, width * 0.8], [1, 0]);

    useEffect(() => {
        return x.on('change', (latest) => {
            if (latest >= width - 5) {
                // Generate a random "Human Key" to pass back
                const key = Math.random().toString(36).substring(2) + Date.now();
                onUnlock(key);
            }
        });
    }, [onUnlock, x, width]);

    return (
        <div ref={trackRef} style={{
            width: '100%', height: '56px', background: 'rgba(255,255,255,0.05)',
            borderRadius: '28px', position: 'relative', overflow: 'hidden',
            border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center',
            padding: '4px', marginBottom: '16px'
        }}>
            <motion.div style={{ position: 'absolute', width: '100%', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: 'rgba(245, 158, 11, 0.6)', opacity, pointerEvents: 'none', letterSpacing: '1px' }}>
                SWIPE RIGHT TO UNLOCK LOGIN
            </motion.div>
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: width }}
                dragElastic={0}
                style={{ x, width: '48px', height: '48px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', borderRadius: '24px', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', zIndex: 2 }}
                whileTap={{ cursor: 'grabbing' }}
            >
                <ShieldCheck size={20} color="#000" />
            </motion.div>
        </div>
    );
};

export default function Login() {
    const { t, i18n } = useTranslation();
    const nav = useNavigate();
    const isRTL = i18n.language === 'ar';
    const googleEnabled = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
    const idSuffix = useMemo(() => Math.random().toString(36).substring(7), []);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isUnlocked, setIsUnlocked] = useState(false);
    
    // THE CRYPTOGRAPHIC KEY
    const humanKeyRef = useRef<string | null>(null);

    async function performManualAuthentication(e: any) {
        // SECURITY LAYER 1: Key Check
        if (!humanKeyRef.current) {
            console.error('[SECURITY] Blocked non-human execution. No Key found.');
            return;
        }

        // SECURITY LAYER 2: Coordinate Check
        // Bots usually trigger clicks at 0,0 or without detail.
        const isSynthetic = e.clientX === 0 && e.clientY === 0 && e.detail === 0;
        if (isSynthetic && e.type === 'click') {
            console.error('[SECURITY] Blocked synthetic click event.');
            return;
        }

        if (!email || !password) return;
        setError(null); setLoading(true);

        console.log('[SECURITY] Physical verification passed. Proceeding to fetch...');

        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const raw = await res.text();
            let data: any = null;
            try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
            if (!res.ok) { setError(data?.error || raw || t('login_failed', 'Login failed')); return; }
            localStorage.setItem('token', data.token);
            nav('/joe');
        } catch (e) { setError('Network error'); } finally { setLoading(false); }
    }

    const S: any = {
        wrapper: { position: 'fixed' as 'fixed', inset: 0, backgroundColor: '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', color: '#f8fafc', overflow: 'hidden' },
        bgGradient: { position: 'absolute' as 'absolute', inset: 0, background: 'radial-gradient(circle at center, #18181b 0%, #000 100%)', opacity: 0.9 },
        glowTop: { position: 'absolute' as 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%', background: 'rgba(217,119,6,0.05)', filter: 'blur(100px)', borderRadius: '50%' },
        card: { position: 'relative' as 'relative', zIndex: 10, width: '100%', maxWidth: '420px', padding: '40px', backgroundColor: 'rgba(9, 9, 11, 0.6)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.05)', borderRadius: '24px', boxShadow: '0 25px 60px -10px rgba(0, 0, 0, 0.7)' },
        titleWrapper: { textAlign: 'center' as 'center', marginBottom: '32px' },
        title: { fontSize: '48px', fontWeight: 900, marginBottom: '8px', background: 'linear-gradient(135deg, #fef3c7 0%, #f59e0b 50%, #b45309 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-2px' },
        subtitle: { fontSize: '9px', fontWeight: 700, letterSpacing: '4px', color: 'rgba(245, 158, 11, 0.6)', textTransform: 'uppercase' },
        inputGroup: { marginBottom: '20px' },
        label: { display: 'block', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: 'rgba(245, 158, 11, 0.8)', textTransform: 'uppercase', letterSpacing: '1px' },
        input: { width: '100%', height: '48px', backgroundColor: 'rgba(0,0,0,0.4)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '12px', padding: isRTL ? '0 16px 0 44px' : '0 44px 0 16px', fontSize: '14px', color: '#fff', outline: 'none' },
        submitBtn: { width: '100%', height: '48px', marginTop: '16px', background: 'linear-gradient(to right, #d97706 0%, #f59e0b 100%)', border: 'none', borderRadius: '12px', color: '#000', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 10px 20px -5px rgba(180, 83, 9, 0.2)' },
        socialBtn: { width: '100%', height: '48px', borderRadius: '12px', backgroundColor: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', cursor: 'pointer', position: 'relative' as 'relative', overflow: 'hidden' as 'hidden' },
        socialBtnIcon: { width: '20px', height: '20px' },
        socialBtnText: { fontSize: '14px', fontWeight: 600, color: '#1f2937' },
        divider: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', margin: '24px 0' },
        dividerLine: { height: '1px', flex: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
        dividerText: { fontSize: '11px', fontWeight: 600, color: '#71717a' },
        errorAlert: { marginBottom: '24px', padding: '12px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '12px' },
    };

    return (
        <div style={S.wrapper}>
            <div style={S.bgGradient} />
            <div style={S.glowTop} />
            <div style={S.card}>
                <div style={S.titleWrapper}>
                    <div style={S.title}>JOE</div>
                    <div style={S.subtitle}>Shielded Access Portal</div>
                </div>

                {error && <div style={S.errorAlert}><AlertCircle size={16} /><span>{error}</span></div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                        <label style={S.label}>{t('email')}</label>
                        <input autoComplete="off" id={`u_${idSuffix}`} style={S.input} value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" />
                    </div>
                    <div>
                        <label style={S.label}>{t('password')}</label>
                        <div style={{ position: 'relative' }}>
                            <input autoComplete="off" id={`p_${idSuffix}`} style={S.input} value={password} onChange={e => setPassword(e.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Password" />
                            <button onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>
                    </div>

                    {!isUnlocked ? (
                        <SwipeToUnlock onUnlock={(key: string) => { 
                            humanKeyRef.current = key;
                            setIsUnlocked(true); 
                            console.log('[SECURITY] Human Key Generated. Motion Verified.'); 
                        }} S={S} />
                    ) : (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                            <button onClick={performManualAuthentication} disabled={loading || !email || !password} style={S.submitBtn}>
                                {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
                                <span>{t('login')}</span>
                            </button>
                        </motion.div>
                    )}

                    {googleEnabled && isUnlocked && (
                        <>
                            <div style={S.divider}><div style={S.dividerLine} /><span style={S.dividerText}>OR</span><div style={S.dividerLine} /></div>
                            <GoogleLoginButton t={t} nav={nav} setError={setError} setLoading={setLoading} S={S} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
