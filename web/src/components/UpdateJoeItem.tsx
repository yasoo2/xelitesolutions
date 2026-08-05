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

type UpdateState = { phase: UpdatePhase; log: string; error: string; startedAt: number; lines: number; stage: string };

let state: UpdateState = { phase: 'idle', log: '', error: '', startedAt: 0, lines: 0, stage: '' };
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
        // The log arrives whole each tick; an empty one is meaningful too — it
        // means the updater has started and not spoken yet.
        if (typeof d?.log === 'string') set({ log: d.log, lines: Number(d.lines || 0), stage: String(d.stage || '') });
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
    set({ phase: 'starting', log: '', error: '', startedAt: Date.now(), lines: 0, stage: '' });
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

/**
 * IS THERE A NEW JOE WAITING?
 *
 * «عند وجود تحديث جديد يجب ان تظهر علامة على الزر». Asked of git through the
 * server, cached there, and re-asked every ten minutes — so the marker means
 * «there really are commits you do not have», never «probably».
 */
export function useUpdateAvailable(): { available: boolean; behind: number } {
    const [state, setState] = useState({ available: false, behind: 0 });
    useEffect(() => {
        let alive = true;
        const ask = () => fetch(`${apiBase()}/system/update/check`)
            .then(r => r.json())
            .then(d => { if (alive) setState({ available: !!d?.available, behind: Number(d?.behind || 0) }); })
            .catch(() => { /* offline, or an older server: no claim either way */ });
        ask();
        const id = window.setInterval(ask, 10 * 60 * 1000);
        return () => { alive = false; window.clearInterval(id); };
    }, []);
    return state;
}

/** The four things an update does, in the order it does them. */
const STEPS = [
    { key: 'pulling', label: 'سحب التحديث من GitHub' },
    { key: 'stopping', label: 'إيقاف النسخة القديمة' },
    { key: 'building', label: 'بناء الخادم والواجهة' },
    { key: 'starting', label: 'تشغيل جو من جديد' },
];

function stepClass(key: string, s: UpdateState): string {
    const order = STEPS.map(x => x.key);
    // The updater names its own stage; before the first mark, the first step is
    // the one under way — which is true, and better than showing nothing.
    const current = s.stage || (s.phase === 'restarting' ? 'starting' : 'pulling');
    const i = order.indexOf(key), n = order.indexOf(current);
    if (i < n) return 'done';
    if (i === n) return 'now';
    return '';
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
    const { available, behind } = useUpdateAvailable();
    if (!allowed) return null;
    return (
        <button
            className={`joe-user-menu-item${available ? ' has-update' : ''}`}
            role="menuitem"
            data-testid="update-joe"
            onClick={() => { onBefore?.(); void startSelfUpdate(); }}
            title={available ? `${behind} تحديث جديد على GitHub` : undefined}
        >
            <DownloadCloud size={16} />
            {/* The name tells the truth about the moment: there is something to
                take, or there is not. «تحديث جو» on a machine that is already
                current invited a two-minute rebuild for nothing. */}
            <span>{available ? 'تحديث متاح' : 'تحديث جو'}</span>
            {available ? <span className="joe-update-dot" aria-label="تحديث جديد" /> : null}
        </button>
    );
}

/** Mounted beside the menu, not inside it, so closing the menu cannot kill the run. */
export function SelfUpdateOverlay() {
    const [s, setS] = useState<UpdateState>(state);
    const [now, setNow] = useState(Date.now());
    const logRef = useRef<HTMLPreElement | null>(null);
    useEffect(() => subscribeSelfUpdate(setS), []);
    // one tick a second, only while an update is on screen
    useEffect(() => {
        if (s.phase === 'idle') return;
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [s.phase]);
    const secs = s.startedAt ? Math.max(0, Math.round((now - s.startedAt) / 1000)) : 0;
    const elapsed = secs < 60 ? `${secs} ثانية` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} دقيقة`;
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
                    {/* A number that moves is the difference between «it is
                        working» and «it is stuck» — the overlay used to show
                        three motionless dots for two minutes. */}
                    {s.phase !== 'failed' && s.startedAt ? <span className="joe-update-clock">{elapsed}</span> : null}
                </div>
                {s.phase !== 'failed' && (
                    <>
                        {/* The named step. Even when the log is thin, this says
                            what is happening right now — «لا يوجد اي شيء يفيد
                            المستخدم ان تحديث يجري الان» was about this. */}
                        <ol className="joe-update-steps">
                            {STEPS.map(st => (
                                <li key={st.key} className={stepClass(st.key, s)}>
                                    <span className="joe-step-dot" />{st.label}
                                </li>
                            ))}
                        </ol>
                        <p className="joe-update-note">
                            ملفاتك محفوظة تلقائياً — لا حاجة لنسخ شيء يدوياً. ستُحدَّث الصفحة وحدها عند انتهاء التحديث.
                        </p>
                    </>
                )}
                {s.error && <p className="joe-update-error">{s.error}</p>}
                <pre className="joe-update-log" ref={logRef} dir={s.log ? 'ltr' : 'rtl'}>
                    {s.log || 'بدأ التحديث — لم يصل أول سطر بعد. أوّل خطوة (سحب التحديث من GitHub) قد تأخذ لحظات.'}
                </pre>
                {s.phase === 'failed' && (
                    <button className="joe-update-close" onClick={() => set({ phase: 'idle' })}>إغلاق</button>
                )}
            </div>
        </div>,
        document.body,
    );
}
