/**
 * «بدي طريقة ما احطها ولا مرة».
 *
 * Six lines of PowerShell, pasted by hand, every single time he wanted the
 * latest Joe. This is the end of that: one item in his own menu.
 *
 * It only appears when the server says it is allowed to appear, and the server
 * only says yes to a request that came from the machine Joe is running on. So
 * on the public deployment that is coming, this button does not exist for
 * anyone — there is nothing to hide in the UI, because the UI is asking.
 *
 * The interesting part is what happens after the click: the updater kills this
 * very server, rebuilds it, and starts it again. The page cannot wait for a
 * reply, cannot hold a socket, and cannot trust a "done" message. It watches
 * three states instead — still answering, gone, back — and reloads on the third.
 *
 * WHY THE STATE LIVES OUTSIDE REACT: the button sits inside a dropdown that
 * unmounts the moment it closes, and an update that vanishes because a menu
 * closed is worse than no button at all. The run is kept in a module-level
 * store; the overlay is mounted beside the menu, not inside it, and simply
 * subscribes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DownloadCloud } from 'lucide-react';
import { API_URL } from '../config';

export type UpdatePhase = 'idle' | 'starting' | 'working' | 'restarting' | 'failed';

type UpdateState = { phase: UpdatePhase; log: string; error: string };

let state: UpdateState = { phase: 'idle', log: '', error: '' };
const listeners = new Set<(s: UpdateState) => void>();
let timer: number | null = null;
let wentAway = false;

function set(next: Partial<UpdateState>) {
    state = { ...state, ...next };
    listeners.forEach(l => { try { l(state); } catch { /* one bad listener must not stop the rest */ } });
}

function apiBase(): string {
    const raw = String(API_URL || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw.replace(/\/+$/, '');
    const p = raw.startsWith('/') ? raw : `/${raw}`;
    return `${window.location.origin}${p}`.replace(/\/+$/, '');
}

/** One tick: the only fact the browser can establish is whether the server answered. */
async function tick(): Promise<boolean> {
    try {
        const r = await fetch(`${apiBase()}/system/update/status`, { cache: 'no-store' });
        const d = await r.json();
        if (typeof d?.log === 'string' && d.log) set({ log: d.log });
        if (wentAway) {
            // it died and came back — that, and only that, means a new Joe
            set({ phase: 'restarting' });
            window.setTimeout(() => window.location.reload(), 1200);
            return true;
        }
        if (d?.failed) { set({ phase: 'failed', error: 'انتهى التحديث بخطأ — التفاصيل في السجل أدناه.' }); return true; }
        set({ phase: 'working' });
    } catch {
        // The server is being rebuilt. This is expected, and is the signal.
        wentAway = true;
        set({ phase: 'restarting' });
    }
    return false;
}

export async function startSelfUpdate() {
    if (state.phase !== 'idle' && state.phase !== 'failed') return;
    wentAway = false;
    set({ phase: 'starting', log: '', error: '' });
    try {
        const r = await fetch(`${apiBase()}/system/update`, { method: 'POST' });
        if (!r.ok) {
            const d = await r.json().catch(() => ({}));
            throw new Error(d?.message || d?.error || `HTTP ${r.status}`);
        }
    } catch (e: any) {
        set({ phase: 'failed', error: e?.message || 'تعذّر بدء التحديث.' });
        return;
    }
    set({ phase: 'working' });
    if (timer) window.clearInterval(timer);
    timer = window.setInterval(async () => {
        if (await tick() && timer) { window.clearInterval(timer); timer = null; }
    }, 1500);
}

export function subscribeSelfUpdate(l: (s: UpdateState) => void): () => void {
    listeners.add(l);
    l(state);
    return () => { listeners.delete(l); };
}

export function useSelfUpdateAllowed(): boolean {
    const [allowed, setAllowed] = useState(false);
    useEffect(() => {
        let alive = true;
        fetch(`${apiBase()}/system/update/status`)
            .then(r => r.json())
            .then(d => { if (alive) setAllowed(!!d?.allowed); })
            .catch(() => { /* an older server, or none: simply no button */ });
        return () => { alive = false; };
    }, []);
    return allowed;
}

/** The menu row. Safe to unmount — it owns nothing. */
export default function UpdateJoeItem({ onBefore }: { onBefore?: () => void }) {
    const allowed = useSelfUpdateAllowed();
    if (!allowed) return null;
    return (
        <button
            className="joe-user-menu-item"
            role="menuitem"
            data-testid="update-joe"
            onClick={() => { onBefore?.(); void startSelfUpdate(); }}
        >
            <DownloadCloud size={16} />
            <span>تحديث جو</span>
        </button>
    );
}

/** Mounted beside the menu, not inside it, so closing the menu cannot kill the run. */
export function SelfUpdateOverlay() {
    const [s, setS] = useState<UpdateState>(state);
    const logRef = useRef<HTMLPreElement | null>(null);
    useEffect(() => subscribeSelfUpdate(setS), []);
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [s.log]);

    if (s.phase === 'idle') return null;
    return createPortal(
        <div className="joe-update-overlay" role="dialog" aria-live="polite" data-testid="update-overlay">
            <div className="joe-update-card">
                <div className="joe-update-head">
                    <DownloadCloud size={18} />
                    <span>
                        {s.phase === 'starting' && 'يبدأ التحديث…'}
                        {s.phase === 'working' && 'جارٍ تحديث جو…'}
                        {s.phase === 'restarting' && 'جو يعود الآن…'}
                        {s.phase === 'failed' && 'تعذّر التحديث'}
                    </span>
                </div>
                {s.phase !== 'failed' && (
                    <p className="joe-update-note">
                        ملفاتك محفوظة تلقائياً — لا حاجة لنسخ شيء يدوياً. ستُحدَّث الصفحة وحدها عند انتهاء التحديث.
                    </p>
                )}
                {s.error && <p className="joe-update-error">{s.error}</p>}
                <pre className="joe-update-log" ref={logRef} dir="ltr">{s.log || '…'}</pre>
                {s.phase === 'failed' && (
                    <button className="joe-update-close" onClick={() => set({ phase: 'idle' })}>إغلاق</button>
                )}
            </div>
        </div>,
        document.body,
    );
}
