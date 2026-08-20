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
import { isRunBusy, subscribeRunBusy } from '../lib/run-activity';

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
/**
 * ONE shared answer to «is a newer Joe waiting?» — polled at MODULE level,
 * never per component. The dropdown row used to run its own fetch on every
 * mount: the menu opened with nothing, the answer arrived a second later,
 * and closing the menu threw it away («وبعد ثانية يظهر... واذا اغلقنا
 * اختفى»). Now the avatar dot, the menu row and the autopilot all read the
 * same live state, it outlives every mount, and the poll starts the moment
 * the app loads — so the menu shows the truth instantly on open.
 */
type UpdateCheckState = { available: boolean; behind: number; known: boolean; latest: string };
let updateCheck: UpdateCheckState = { available: false, behind: 0, known: false, latest: '' };
const updateCheckListeners = new Set<(s: UpdateCheckState) => void>();
let updateCheckTimer: number | null = null;

async function refreshUpdateCheckState(): Promise<void> {
    try {
        const r = await fetch(`${apiBase()}/system/update/check`);
        const d = await r.json();
        updateCheck = {
            available: !!d?.available,
            behind: Number(d?.behind || 0),
            known: !!d?.known,
            latest: String(d?.latest || ''),
        };
        updateCheckListeners.forEach(l => { try { l(updateCheck); } catch { /* one bad listener must not stop the rest */ } });
    } catch { /* offline, or an older server: keep the last honest answer */ }
}

function ensureUpdateCheckLoop(): void {
    if (updateCheckTimer !== null) return;
    void refreshUpdateCheckState();
    // The server caches its own git fetch for ten minutes, so a two-minute
    // client poll is cheap and keeps the dot at most ~12 minutes behind.
    updateCheckTimer = window.setInterval(() => { void refreshUpdateCheckState(); }, 2 * 60 * 1000);
}

export function useUpdateAvailable(): UpdateCheckState {
    const [state, setState] = useState(updateCheck);
    useEffect(() => {
        ensureUpdateCheckLoop();
        updateCheckListeners.add(setState);
        setState(updateCheck);
        return () => { updateCheckListeners.delete(setState); };
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

/**
 * «May this installation update itself?» is a fact about the machine, not
 * about a mount: asked once, remembered at module level, so the menu row
 * renders on the first frame of every open instead of appearing a beat late.
 */
let selfUpdateAllowed: boolean | null = null;
const allowedListeners = new Set<(b: boolean) => void>();

function ensureSelfUpdateAllowed(): void {
    fetch(`${apiBase()}/system/update/status`)
        .then(r => r.json())
        .then(d => {
            selfUpdateAllowed = !!d?.allowed;
            allowedListeners.forEach(l => { try { l(!!selfUpdateAllowed); } catch { /* keep notifying */ } });
        })
        .catch(() => { /* stays unknown; the next consumer asks again */ });
}

export function useSelfUpdateAllowed(): boolean {
    const [allowed, setAllowed] = useState(!!selfUpdateAllowed);
    useEffect(() => {
        if (selfUpdateAllowed !== null) { setAllowed(selfUpdateAllowed); return; }
        allowedListeners.add(setAllowed);
        ensureSelfUpdateAllowed();
        return () => { allowedListeners.delete(setAllowed); };
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

/**
 * THE AUTOPILOT — «لماذا التحديث التلقائي لا يعمل في جو».
 *
 * It never did: what existed was a dot on the avatar and a row inside a
 * dropdown — an update that waits to be discovered is a manual update with
 * extra steps. This banner is the automatic half. When the server confirms
 * commits are waiting, it appears on its own, counts down, and starts the
 * SAME startSelfUpdate the menu row uses — one updater, two doors.
 *
 * Three rules keep it safe:
 *   - it never fires while a task is running (run-activity says busy);
 *   - «ليس الآن» silences THIS version only — a new commit brings it back;
 *   - the countdown only ever starts when the page is truly idle, and any
 *     busy signal resets it, so a restart cannot land mid-thought.
 */
const AUTO_PREF_KEY = 'joe-auto-update';
const DISMISS_KEY = 'joe-update-dismissed';
const AUTO_DELAY_S = 45;

function autoUpdateEnabled(): boolean {
    try { return localStorage.getItem(AUTO_PREF_KEY) !== '0'; } catch { return true; }
}

export function UpdateAutoPilot() {
    const allowed = useSelfUpdateAllowed();
    const { available, behind, known, latest } = useUpdateAvailable();
    const [busy, setBusy] = useState(isRunBusy());
    const [phase, setPhase] = useState<UpdatePhase>(state.phase);
    const [auto, setAuto] = useState(autoUpdateEnabled());
    const [dismissed, setDismissed] = useState('');
    const [left, setLeft] = useState(AUTO_DELAY_S);

    useEffect(() => subscribeRunBusy(setBusy), []);
    useEffect(() => subscribeSelfUpdate(s => setPhase(s.phase)), []);
    useEffect(() => { try { setDismissed(localStorage.getItem(DISMISS_KEY) || ''); } catch { /* no storage, no memory */ } }, []);

    const show = allowed && known && available && phase === 'idle' && (!latest || latest !== dismissed);

    // The countdown lives only while the banner is visible, auto is on and Joe
    // is idle — any busy flicker starts it over from the top.
    useEffect(() => {
        if (!show || !auto || busy) { setLeft(AUTO_DELAY_S); return; }
        setLeft(AUTO_DELAY_S);
        const id = window.setInterval(() => {
            setLeft(prev => {
                if (prev <= 1) {
                    window.clearInterval(id);
                    void startSelfUpdate();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => window.clearInterval(id);
    }, [show, auto, busy, latest]);

    if (!show) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, latest || String(Date.now())); } catch { /* best effort */ }
        setDismissed(latest || String(Date.now()));
    };
    const toggleAuto = () => {
        const next = !auto;
        setAuto(next);
        try { localStorage.setItem(AUTO_PREF_KEY, next ? '1' : '0'); } catch { /* best effort */ }
    };

    return createPortal(
        <div className="joe-autoupdate-banner" role="status" data-testid="autoupdate-banner">
            <DownloadCloud size={16} />
            <span className="joe-autoupdate-text">
                {`تحديث جديد لجو${behind > 1 ? ` (${behind} تحديثات)` : ''}${latest ? ` — ${latest}` : ''}`}
                {busy ? ' · ينتظر انتهاء المهمة الجارية'
                    : auto ? ` · يبدأ تلقائياً بعد ${left} ثانية`
                        : ''}
            </span>
            <button type="button" className="joe-autoupdate-now" data-testid="autoupdate-now"
                onClick={() => void startSelfUpdate()} disabled={busy}>
                حدّث الآن
            </button>
            <button type="button" className="joe-autoupdate-later" onClick={dismiss}>
                ليس الآن
            </button>
            <button type="button" className="joe-autoupdate-toggle" onClick={toggleAuto}
                title="عند الإيقاف يبقى الإشعار ويصبح التحديث بضغطة يدوية">
                {auto ? 'التلقائي: مفعّل' : 'التلقائي: موقف'}
            </button>
        </div>,
        document.body,
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
