/**
 * The owner's computers: this one, the ones he linked, and how to link another
 * (api/routes/devices.ts). Linking is one line run on the other computer; that
 * computer shows a window saying Joe is in control, and closing it ends the link.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Laptop, Link2, Unlink, RefreshCw, Monitor } from 'lucide-react';
import { API_URL } from '../config';

interface Linked { id: string; name: string; os: string; user: string; screen: string; connectedAt: number }
interface Pairing { command: string; expiresAt: number; localOnly: boolean; via?: string }

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

const DevicesPanel: React.FC<{ t: (k: string, f: string) => string }> = ({ t }) => {
    const [here, setHere] = useState<{ name: string; os: string; desktop: boolean } | null>(null);
    const [linked, setLinked] = useState<Linked[]>([]);
    const [pairing, setPairing] = useState<Pairing | null>(null);
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/devices`, { headers: auth() });
            const d = await res.json();
            if (d?.ok) { setHere(d.here); setLinked(Array.isArray(d.linked) ? d.linked : []); }
        } catch { /* the list stays as it was */ }
    }, []);

    //  While a code waits, the list is asked every few seconds: the new computer appears by itself.
    useEffect(() => {
        void load();
        const every = window.setInterval(load, pairing ? 3000 : 15000);
        return () => window.clearInterval(every);
    }, [load, pairing]);

    //  A computer that joined after the code was made (both times are the server's) ends the wait.
    useEffect(() => {
        if (pairing && linked.some(d => d.connectedAt >= pairing.expiresAt - 10 * 60_000)) setPairing(null);
    }, [linked, pairing]);

    const pair = async () => {
        setBusy(true); setError(''); setCopied(false);
        try {
            const res = await fetch(`${API_URL}/devices/pair`, { method: 'POST', headers: auth() });
            const d = await res.json();
            if (!d?.ok) throw new Error(d?.error || 'pair_failed');
            setPairing({ command: d.command, expiresAt: d.expiresAt, localOnly: !!d.localOnly, via: d.via });
        } catch {
            setError(t('devicesPairFailed', 'Joe could not make a pairing code. Try again.'));
        } finally { setBusy(false); }
    };

    const copy = async () => {
        if (!pairing) return;
        try { await navigator.clipboard.writeText(pairing.command); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* the line stays selectable */ }
    };

    const unlink = async (id: string) => {
        setBusy(true);
        try { await fetch(`${API_URL}/devices/${encodeURIComponent(id)}/disconnect`, { method: 'POST', headers: auth() }); } catch { /* the list says what is true */ }
        setBusy(false); void load();
    };

    const minutesLeft = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 60_000)) : 0;

    return (
        <div className="dev-panel">
            <div className="dev-card">
                <div className="dev-row">
                    <Monitor size={20} />
                    <div className="dev-text">
                        <span className="dev-name">{t('devicesThisComputer', 'This computer')}{here ? ` · ${here.name}` : ''}</span>
                        <span className="dev-sub">{here ? (here.desktop ? t('devicesHereDesktop', 'Joe can see its screen and work its windows') : t('devicesHereNoDesktop', 'No desktop control on this system')) : '…'}</span>
                    </div>
                    <span className={`dev-dot ${here?.desktop ? 'on' : ''}`} aria-hidden="true" />
                </div>
            </div>

            {/* The chat is where he works (the owner, 2026-11-07): this panel is only another way. */}
            <div className="dev-hint">{t('devicesAskInChat', 'You can simply ask Joe in the chat: «what devices can you reach?» or «connect to my office computer».')}</div>

            <div className="dev-section-title">{t('devicesLinked', 'Linked computers')}</div>
            {linked.length === 0 && <div className="dev-empty">{t('devicesNoneLinked', 'No other computer is linked yet.')}</div>}
            {linked.map(d => (
                <div className="dev-card" key={d.id}>
                    <div className="dev-row">
                        <Laptop size={20} />
                        <div className="dev-text">
                            <span className="dev-name">{d.name}</span>
                            <span className="dev-sub">{[d.os, d.user, d.screen].filter(Boolean).join(' · ')}</span>
                        </div>
                        <span className="dev-dot on" title={t('devicesConnected', 'Connected')} />
                        <button className="dev-btn ghost" disabled={busy} onClick={() => unlink(d.id)} title={t('devicesUnlink', 'Disconnect')}>
                            <Unlink size={15} /><span>{t('devicesUnlink', 'Disconnect')}</span>
                        </button>
                    </div>
                </div>
            ))}

            {!pairing ? (
                <button className="dev-btn primary" disabled={busy} onClick={pair}>
                    <Link2 size={16} /><span>{t('devicesLinkAnother', 'Link another computer')}</span>
                </button>
            ) : (
                <div className="dev-card dev-pairing">
                    <div className="dev-steps">
                        <span>1. {t('devicesStep1', 'On the other computer, open PowerShell.')}</span>
                        <span>2. {t('devicesStep2', 'Paste this line and press Enter.')}</span>
                        <span>3. {t('devicesStep3', 'A window there says Joe is in control. Closing it ends the link at once.')}</span>
                    </div>
                    <div className="dev-command" dir="ltr">
                        <code>{pairing.command}</code>
                        <button className="dev-btn icon" onClick={copy} aria-label={t('devicesCopy', 'Copy')} title={t('devicesCopy', 'Copy')}>
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                    </div>
                    <div className="dev-sub">
                        <RefreshCw size={12} className="dev-spin" /> {t('devicesWaiting', 'Waiting for the computer…')} {t('devicesValidFor', 'The line works once, for')} {minutesLeft} {t('devicesMinutes', 'min')}
                    </div>
                    {pairing.via === 'lan' && <div className="dev-sub">{t('devicesSameNetwork', 'This line uses this computer\'s address on its network: it works from a computer on the same network (home or office).')}</div>}
                    {pairing.localOnly && <div className="dev-warn">{t('devicesLocalOnly', 'Joe is opened at a local address. Another computer reaches it only through this computer\'s network address or a public one.')}</div>}
                </div>
            )}
            {error && <div className="dev-warn">{error}</div>}
        </div>
    );
};

export default DevicesPanel;
