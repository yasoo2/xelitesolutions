/**
 * The owner's computers: this one, the ones he linked, and how to link another
 * (api/routes/devices.ts).
 *
 * A computer is linked FOR GOOD under the name he gives it (the owner,
 * 2026-11-08: «a computer in another city — how would Joe know it is there?»):
 * one line run on it once, and it calls Joe by itself at every Windows start,
 * with Joe's icon by its clock. The list says which of his computers are on
 * and which are off. A link for this session only stays available, smaller.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Laptop, Link2, Unlink, RefreshCw, Monitor, Trash2 } from 'lucide-react';
import { API_URL } from '../config';

interface Linked { id: string; name: string; os: string; user: string; screen: string; connectedAt: number; lastSeen?: number; kept?: boolean; online?: boolean }
interface Pairing { command: string; expiresAt: number; localOnly: boolean; via?: string; keep: boolean; name?: string }

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json' });

const DevicesPanel: React.FC<{ t: (k: string, f: string) => string }> = ({ t }) => {
    const [here, setHere] = useState<{ name: string; os: string; desktop: boolean } | null>(null);
    const [linked, setLinked] = useState<Linked[]>([]);
    const [pairing, setPairing] = useState<Pairing | null>(null);
    const [name, setName] = useState('');
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

    //  The wait ends when the computer is online: a kept one under its name, a session one by its time.
    useEffect(() => {
        if (!pairing) return;
        const joined = pairing.keep
            ? linked.some(d => d.kept && d.online !== false && d.name === pairing.name)
            : linked.some(d => !d.kept && d.connectedAt >= pairing.expiresAt - 10 * 60_000);
        if (joined) setPairing(null);
    }, [linked, pairing]);

    const pair = async (keep: boolean) => {
        setBusy(true); setError(''); setCopied(false);
        try {
            const wanted = name.trim();
            const res = await fetch(`${API_URL}/devices/pair`, { method: 'POST', headers: auth(), body: JSON.stringify(keep ? { keep: true, name: wanted } : {}) });
            const d = await res.json();
            if (!d?.ok) throw new Error(d?.error || 'pair_failed');
            setPairing({ command: d.command, expiresAt: d.expiresAt, localOnly: !!d.localOnly, via: d.via, keep: !!d.keep, name: d.name });
        } catch {
            setError(t('devicesPairFailed', 'Joe could not make a pairing code. Try again.'));
        } finally { setBusy(false); }
    };

    const copy = async () => {
        if (!pairing) return;
        try { await navigator.clipboard.writeText(pairing.command); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* the line stays selectable */ }
    };

    const unlink = async (d: Linked) => {
        if (d.kept && !window.confirm(t('devicesForgetConfirm', 'Unlink this computer from Joe for good? To link it again, the line must be run on it once more.'))) return;
        setBusy(true);
        try { await fetch(`${API_URL}/devices/${encodeURIComponent(d.id)}/${d.kept ? 'forget' : 'disconnect'}`, { method: 'POST', headers: auth() }); } catch { /* the list says what is true */ }
        setBusy(false); void load();
    };

    const minutesLeft = pairing ? Math.max(0, Math.ceil((pairing.expiresAt - Date.now()) / 60_000)) : 0;
    const seen = (d: Linked) => {
        if (d.online !== false) return t('devicesOnline', 'Online now');
        if (!d.lastSeen) return t('devicesNeverSeen', 'Off — not seen yet');
        const m = Math.round((Date.now() - d.lastSeen) / 60_000);
        return `${t('devicesOffline', 'Off')} · ${m < 120 ? `${m} ${t('devicesMinutes', 'min')}` : `${Math.round(m / 60)} ${t('devicesHours', 'h')}`}`;
    };

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
                            <span className="dev-name">{d.name}{d.kept ? <span className="dev-tag">{t('devicesKeptTag', 'linked for good')}</span> : null}</span>
                            <span className="dev-sub">{[seen(d), d.os, d.user, d.screen].filter(Boolean).join(' · ')}</span>
                        </div>
                        <span className={`dev-dot ${d.online !== false ? 'on' : ''}`} title={seen(d)} />
                        <button className="dev-btn ghost" disabled={busy} onClick={() => unlink(d)} title={d.kept ? t('devicesForget', 'Unlink for good') : t('devicesUnlink', 'Disconnect')}>
                            {d.kept ? <Trash2 size={15} /> : <Unlink size={15} />}<span>{d.kept ? t('devicesForget', 'Unlink for good') : t('devicesUnlink', 'Disconnect')}</span>
                        </button>
                    </div>
                </div>
            ))}

            {!pairing ? (
                <div className="dev-card dev-keep">
                    <div className="dev-section-title">{t('devicesKeepTitle', 'Link a computer for good')}</div>
                    <div className="dev-sub">{t('devicesKeepWhy', 'Give it a name, run one line on it once, and it calls Joe by itself every time it starts — from anywhere Joe is reachable.')}</div>
                    <div className="dev-keep-row">
                        <input
                            className="dev-input"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder={t('devicesKeepPlaceholder', 'Its name, e.g. office computer')}
                            aria-label={t('devicesKeepPlaceholder', 'Its name, e.g. office computer')}
                            maxLength={60}
                            dir="auto"
                        />
                        <button className="dev-btn primary" disabled={busy || !name.trim()} onClick={() => pair(true)}>
                            <Link2 size={16} /><span>{t('devicesKeepButton', 'Link for good')}</span>
                        </button>
                    </div>
                    <button className="dev-link-btn" disabled={busy} onClick={() => pair(false)}>{t('devicesLinkSession', 'Or link a computer for this session only')}</button>
                </div>
            ) : (
                <div className="dev-card dev-pairing">
                    <div className="dev-steps">
                        <span>1. {t('devicesStep1', 'On the other computer, open PowerShell.')}</span>
                        <span>2. {t('devicesStep2', 'Paste this line and press Enter.')}</span>
                        <span>3. {pairing.keep
                            ? `${t('devicesKeepStep3', 'That is all, once: from now on it stays linked as')} «${pairing.name}». ${t('devicesKeepStep3b', "Joe's icon by its clock stops it or unlinks it.")}`
                            : t('devicesStep3', 'A window there says Joe is in control. Closing it ends the link at once.')}</span>
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
                    <button className="dev-link-btn" onClick={() => setPairing(null)}>{t('devicesCancel', 'Cancel')}</button>
                </div>
            )}
            {error && <div className="dev-warn">{error}</div>}
        </div>
    );
};

export default DevicesPanel;
