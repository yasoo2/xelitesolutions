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
import { DownloadCloud, Copy, Check } from 'lucide-react';
import { API_URL } from '../config';

export type UpdatePhase = 'idle' | 'starting' | 'working' | 'restarting' | 'failed' | 'stalled';

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
        /**
         * «نصف ساعه ولم يتم تحديث النظام» — AND THE BAR KEPT MOVING.
         *
         * The server can now say «it never started» and «it went silent», and
         * a progress bar that cannot say «I stopped» is decoration. This is
         * where the honest answer gets shown instead of an eternal step 1.
         */
        if (d?.stalled) {
            set({
                phase: 'stalled',
                error: d.stalled === 'never_started'
                    ? 'المحدِّث لم يكتب سطراً واحداً — يبدو أنه لم يبدأ أصلاً.'
                    : `المحدِّث توقّف عن الكتابة منذ ${Math.round(Number(d.silentForMs || 0) / 60000)} دقيقة.`,
            });
            return true;
        }
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
export function useUpdateAvailable(): { available: boolean; behind: number; known: boolean } {
    const [state, setState] = useState({ available: false, behind: 0, known: false });
    useEffect(() => {
        let alive = true;
        const ask = () => fetch(`${apiBase()}/system/update/check`)
            .then(r => r.json())
            .then(d => { if (alive) setState({ available: !!d?.available, behind: Number(d?.behind || 0), known: !!d?.known }); })
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
    const { available, behind, known } = useUpdateAvailable();
    if (!allowed) return null;
    /**
     * THREE STATES, AND THE NAME SAYS WHICH ONE.
     *
     * «الاسم لم يتغير على الزر» — and it could not: the first answer came from
     * a cold cache that had never asked git, so it always read «nothing new»,
     * and the row said «تحديث جو» forever. The server now answers for real,
     * and the row shows what it answered: something waiting, nothing waiting,
     * or (offline) an honest «I could not ask».
     */
    const label = available ? `تحديث متاح${behind > 1 ? ` · ${behind}` : ''}`
        : known ? 'جو محدَّث — أعد البناء'
            : 'تحديث جو';
    return (
        <button
            className={`joe-user-menu-item${available ? ' has-update' : ''}`}
            role="menuitem"
            data-testid="update-joe"
            onClick={() => { onBefore?.(); void startSelfUpdate(); }}
            title={available ? `${behind} تحديث جديد على GitHub` : known ? 'نسختك على آخر إصدار' : undefined}
        >
            <DownloadCloud size={16} />
            <span>{label}</span>
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
    const [copied, setCopied] = useState(false);
    /**
     * Copy the whole log. navigator.clipboard needs a secure context, and Joe
     * runs on plain http://localhost — which browsers DO treat as secure, but
     * a stray configuration should not cost him the button, so there is a
     * textarea fallback that has worked since forever.
     */
    const copyLog = async () => {
        const text = s.log || '';
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch { /* nothing more to try */ }
            document.body.removeChild(ta);
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
    };
    const secs = s.startedAt ? Math.max(0, Math.round((now - s.startedAt) / 1000)) : 0;
    const elapsed = secs < 60 ? `${secs} ثانية` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} دقيقة`;
    useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [s.log]);

    if (s.phase === 'idle') return null;

    const done = STEPS.filter(st => stepClass(st.key, s) === 'done').length;
    const current = STEPS.find(st => stepClass(st.key, s) === 'now');
    // A stalled run is a stopped run: it gets the failure face, not a bar.
    const bad = s.phase === 'failed' || s.phase === 'stalled';
    const percent = bad ? 100 : Math.min(96, Math.round(((done + 0.5) / STEPS.length) * 100));

    return createPortal(
        <div className="joe-update-overlay" role="dialog" aria-live="polite" data-testid="update-overlay">
            <div className={`joe-update-card${bad ? ' is-failed' : ''}`} data-phase={s.phase}>
                {/* ONE THING TO READ FIRST: what is happening, right now. The
                    old card led with a log box, so the eye landed on a
                    scrolling terminal and learned nothing. */}
                <div className="joe-update-hero">
                    <span className="joe-update-ring" aria-hidden="true">
                        <DownloadCloud size={20} />
                    </span>
                    <div className="joe-update-titles">
                        <b>
                            {s.phase === 'failed' ? 'تعذّر التحديث'
                                : s.phase === 'stalled' ? 'التحديث متوقّف'
                                    : (current?.label || 'يبدأ التحديث')}
                        </b>
                        <span>
                            {s.phase === 'failed' ? 'راجع التفاصيل بالأسفل'
                                : s.phase === 'stalled' ? `لا تقدّم منذ ${elapsed} — لن أدّعي غير ذلك`
                                    : s.phase === 'restarting' ? 'جو يعود الآن — ستُحدَّث الصفحة وحدها'
                                        : `الخطوة ${Math.min(done + 1, STEPS.length)} من ${STEPS.length}`}
                        </span>
                    </div>
                    {s.startedAt && !bad ? <span className="joe-update-clock">{elapsed}</span> : null}
                </div>

                {!bad && (
                    <>
                        <div className="joe-update-bar" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                            <span style={{ width: `${percent}%` }} />
                        </div>
                        <ol className="joe-update-steps">
                            {STEPS.map(st => (
                                <li key={st.key} className={stepClass(st.key, s)}>
                                    <span className="joe-step-dot" />{st.label}
                                </li>
                            ))}
                        </ol>
                        <p className="joe-update-note">ملفاتك محفوظة تلقائياً. لا تُغلق جو حتى تعود الصفحة وحدها.</p>
                    </>
                )}

                {s.error && <p className="joe-update-error" data-testid="update-error">{s.error}</p>}

                {/*
                    A DEAD END IS NOT AN END. When the updater cannot be made
                    to run, the one line that always works is right here to be
                    copied — the same line he used to paste before this button
                    existed, offered only when the button has failed him.
                */}
                {s.phase === 'stalled' && (
                    <div className="joe-update-rescue" data-testid="update-rescue">
                        <p>شغّله بنفسك في نافذة PowerShell وسترى السبب كاملاً:</p>
                        <code dir="ltr">cd $HOME\Documents\xelitesolutions ; .\update-joe.ps1</code>
                        <span>السجل بالأسفل يحمل اسم البرنامج والسكربت اللذين حاول جو تشغيلهما — انسخه كاملاً.</span>
                    </div>
                )}

                {/*
                    THE SAME LINES HE USED TO WATCH IN POWERSHELL.
                    «يجب ان تظهر اللوغز … في صندوق جميل ويوجد اشارة نسخ لكل
                    الكود» — so: a real console, always visible, scrolling
                    itself, and one button that takes the whole thing.
                */}
                <div className="joe-console">
                    <div className="joe-console-bar">
                        <span className="joe-console-title">سجل التحديث</span>
                        {s.lines ? <span className="joe-console-count">{s.lines} سطر</span> : null}
                        <button
                            type="button"
                            className="joe-console-copy"
                            data-testid="copy-log"
                            onClick={copyLog}
                            title="نسخ السجل كاملاً"
                            aria-label="نسخ السجل كاملاً"
                            disabled={!s.log}
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            <span>{copied ? 'نُسخ' : 'نسخ'}</span>
                        </button>
                    </div>
                    <pre className="joe-console-body" ref={logRef} dir="ltr">
                        {s.log || 'بدأ التحديث — لم يصل أول سطر بعد.'}
                    </pre>
                </div>

                {bad && (
                    <div className="joe-update-acts">
                        <button
                            className="joe-update-retry"
                            data-testid="update-retry"
                            onClick={() => { set({ phase: 'idle' }); void startSelfUpdate(); }}
                        >
                            حاول مرة أخرى
                        </button>
                        <button className="joe-update-close" onClick={() => set({ phase: 'idle' })}>إغلاق</button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
