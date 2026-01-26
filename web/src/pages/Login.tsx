import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import {
    LogIn, Mail, Lock, Eye, EyeOff, X, Loader2, AlertCircle, CheckCircle2, Wifi, WifiOff
} from 'lucide-react';

// VERSION: v17 (Total Purity - Ground Up)
console.log('JOE System: Login Page Gold-v17-TotalPurity Loaded');

export default function Login() {
    const { t } = useTranslation();
    const nav = useNavigate();

    const emailRef = useRef<HTMLInputElement>(null);
    const passRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [health, setHealth] = useState<{ status: string, db: number } | null>(null);
    const [mountTime] = useState(Date.now());

    // Health Check on mount
    useEffect(() => {
        const check = async () => {
            try {
                const pureApi = API.replace(/\/api$/, '');
                const res = await fetch(`${pureApi}/health`);
                const data = await res.json();
                setHealth(data);
                console.log('[SYSTEM] Health Check:', data);
            } catch (e) {
                console.error('[SYSTEM] Health check failed');
                setHealth({ status: 'FAIL', db: 0 });
            }
        };
        check();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const timestamp = Date.now();
        const duration = timestamp - mountTime;

        // PHYSICAL PROTECTION: Block instant bot submits
        if (duration < 2000) {
            console.warn('[SECURITY] Blocked rapid submission (potential bot).');
            return;
        }

        const email = emailRef.current?.value || '';
        const password = passRef.current?.value || '';

        if (!email || !password) {
            setError('Please provide all credentials.');
            return;
        }

        setError(null);
        setLoading(true);

        console.log(`[AUTH-v17] Manual Login Attempt: ${email}`);

        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                throw new Error(data.error || 'Authentication Failed');
            }

            console.log('[AUTH-v17] Success!');
            localStorage.setItem('token', data.token);
            nav('/joe');
        } catch (err: any) {
            console.error('[AUTH-v17] Error:', err.message);
            setError(err.message);
            setLoading(false);
        }
    };

    const S: any = {
        wrapper: { position: 'fixed' as 'fixed', inset: 0, backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: 'Inter, sans-serif' },
        card: { width: '100%', maxWidth: '400px', backgroundColor: '#0a0a0a', border: '1px solid #222', borderRadius: '16px', padding: '32px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' },
        title: { fontSize: '32px', fontWeight: 800, textAlign: 'center' as 'center', color: '#f59e0b', marginBottom: '8px' },
        subtitle: { fontSize: '10px', textAlign: 'center' as 'center', color: '#666', letterSpacing: '2px', marginBottom: '32px', textTransform: 'uppercase' },
        input: { width: '100%', height: '44px', backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px', padding: '0 12px', color: '#fff', fontSize: '14px', marginBottom: '16px', outline: 'none' },
        label: { display: 'block', fontSize: '11px', color: '#999', marginBottom: '6px', fontWeight: 600 },
        btn: { width: '100%', height: '44px', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
        healthBar: { position: 'absolute' as 'absolute', top: '24px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '10px', padding: '4px 12px', borderRadius: '20px', border: '1px solid #222', backgroundColor: '#050505' }
    };

    return (
        <div style={S.wrapper}>
            <div style={{ ...S.healthBar, borderColor: health?.status === 'OK' ? '#065f46' : '#991b1b' }}>
                {health?.status === 'OK' ? <Wifi size={12} color="#10b981" /> : <WifiOff size={12} color="#ef4444" />}
                <span style={{ color: health?.status === 'OK' ? '#10b981' : '#ef4444' }}>
                    API: {health?.status || 'CONNECTING...'} {health?.db === 1 && '(DB: READY)'}
                </span>
            </div>

            <div style={S.card}>
                <div style={S.title}>JOE</div>
                <div style={S.subtitle}>Secure Node Terminal</div>

                {error && (
                    <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#f87171', fontSize: '13px', marginBottom: '20px', border: '1px solid #450a0a' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <label style={S.label}>Email Address</label>
                    <input 
                        ref={emailRef}
                        type="email" 
                        autoFocus
                        autoComplete="off"
                        style={S.input} 
                        placeholder="admin@xelitesolutions.com"
                    />

                    <label style={S.label}>Access Password</label>
                    <div style={{ position: 'relative' }}>
                        <input 
                            ref={passRef}
                            type={showPassword ? 'text' : 'password'} 
                            autoComplete="off"
                            style={S.input} 
                            placeholder="••••••••"
                        />
                        <div 
                            onClick={() => setShowPassword(!showPassword)}
                            style={{ position: 'absolute', right: '12px', top: '13px', cursor: 'pointer', color: '#444' }}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </div>
                    </div>

                    <button type="submit" disabled={loading} style={S.btn}>
                        {loading ? <Loader2 size={18} className="spin" /> : <LogIn size={18} />}
                        <span>LOGIN TO NODE</span>
                    </button>
                </form>
            </div>

            <div style={{ position: 'absolute', bottom: '24px', fontSize: '10px', color: '#444' }}>
                &copy; 2025 XELITE SOLUTIONS. ALL RIGHTS RESERVED.
            </div>

            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                .spin { animation: spin 1s linear infinite; }
                input:focus { border-color: #f59e0b !important; }
            `}</style>
        </div>
    );
}
