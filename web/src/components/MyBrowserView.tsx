/**
 * MyBrowserView — shows the user's OWN real browser (driven by the Joe extension)
 * LIVE inside Joe's panel, and forwards clicks/keystrokes back to it. This is the
 * "my personal browser, inside Joe" experience for the online/extension path.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, RefreshCw } from 'lucide-react';
import { SocketService } from '../services/socket';
import { API_URL } from '../config';

export default function MyBrowserView({ sessionId }: { sessionId: string }) {
    const { t } = useTranslation();
    const [frame, setFrame] = useState<string>('');
    const [url, setUrl] = useState<string>('');
    const [connected, setConnected] = useState<boolean>(false);
    const [inputUrl, setInputUrl] = useState<string>('');
    const activeSid = String(sessionId || '').trim();
    const imgRef = useRef<HTMLImageElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);

    const token = () => localStorage.getItem('token') || '';
    const action = useCallback(async (cmd: string, args?: any) => {
        try {
            const res = await fetch(`${API_URL}/extension/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token()}` },
                body: JSON.stringify({ cmd, args: args || {}, sessionId }),
            });
            return await res.json().catch(() => ({ ok: false }));
        } catch { return { ok: false }; }
        }, [sessionId]);
    // Live frames from the user's real browser.
    useEffect(() => {
        // A browser frame is a session-owned resource. Clear the previous
        // session before subscribing so a fast switch cannot flash stale pixels.
        setFrame('');
        setUrl('');
        setInputUrl('');
        setConnected(false);
        const unsub = SocketService.subscribe((data: any) => {
            const eventSid = String(data?.sessionId || data?.data?.sessionId || '').trim();
            if (!activeSid || eventSid !== activeSid) return;
            if (data?.type === 'user_browser_frame') {
                const d = data.data || data;
                if (d?.dataUrl) { setFrame(d.dataUrl); setConnected(true); }
                if (d?.url) { setUrl(d.url); if (!document.activeElement || (document.activeElement as HTMLElement).tagName !== 'INPUT') setInputUrl(d.url); }
            }
        }, sessionId);
        // Ask the extension to start streaming, and check connection.
        (async () => {
            const st = await (async () => { try { const r = await fetch(`${API_URL}/extension/status`, { headers: { Authorization: `Bearer ${token()}` } }); return await r.json(); } catch { return { connected: false }; } })();
            setConnected(!!st?.connected);
            if (st?.connected) action('startStream');
        })();
        return () => { try { (unsub as any)?.(); } catch { /* ignore */ } try { action('stopStream'); } catch { /* ignore */ } };
    }, [action, activeSid, sessionId]);

    // Forward a click at the same relative position into the real page.
    const onClick = (e: React.MouseEvent) => {
        const img = imgRef.current; if (!img) return;
        const rect = img.getBoundingClientRect();
        const xRatio = (e.clientX - rect.left) / rect.width;
        const yRatio = (e.clientY - rect.top) / rect.height;
        if (xRatio < 0 || xRatio > 1 || yRatio < 0 || yRatio > 1) return;
        action('click_xy', { xRatio, yRatio });
    };

    // Forward typing into the focused element of the real page.
    const onKeyDown = (e: React.KeyboardEvent) => {
        let text = '';
        if (e.key === 'Enter') text = '\n';
        else if (e.key === 'Backspace') text = '\b';
        else if (e.key === 'Tab') { text = '\t'; e.preventDefault(); }
        else if (e.key.length === 1) text = e.key;
        else return;
        e.preventDefault();
        action('type_keys', { text });
    };

    const navigate = (u: string) => {
        let target = (u || '').trim(); if (!target) return;
        if (!/^https?:\/\//i.test(target)) target = target.includes('.') && !target.includes(' ') ? `https://${target}` : `https://www.google.com/search?q=${encodeURIComponent(target)}`;
        action('navigate', { url: target });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0b0f14' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Globe size={14} style={{ color: connected ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
                <input
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigate(inputUrl); }}
                    placeholder={t('myBrowserPlaceholder')}
                    dir="ltr"
                    style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 10px', color: '#e6edf3', fontSize: 12, fontFamily: 'monospace' }}
                />
                <RefreshCw size={14} style={{ color: '#9aa4b2', cursor: 'pointer' }} onClick={() => action('startStream')} />
            </div>
            <div
                ref={wrapRef}
                tabIndex={0}
                onKeyDown={onKeyDown}
                style={{ flex: 1, overflow: 'hidden', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: connected ? 'crosshair' : 'default' }}
            >
                {frame ? (
                    <img ref={imgRef} src={frame} onClick={onClick} alt="متصفحك" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
                ) : (
                    <div style={{ color: '#9aa4b2', textAlign: 'center', fontSize: 13, padding: 24, lineHeight: 1.8 }}>
                        {connected
                            ? '⏳ بانتظار أول لقطة من متصفحك… اكتب رابطاً بالأعلى أو قل لجو «افتح يوتيوب في متصفحي».'
                            : '🧩 متصفحك غير متصل. ثبّت إضافة «Joe Browser Connector» وافتح تبويب جو — ستظهر نقطة خضراء على أيقونة الإضافة.'}
                    </div>
                )}
            </div>
        </div>
    );
}
