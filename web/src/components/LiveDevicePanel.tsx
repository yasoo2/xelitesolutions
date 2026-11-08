/**
 * WHAT JOE IS WORKING ON, LIVE, IN THE PREVIEW.
 *
 * The owner, 2026-11-08: «why doesn't Joe's preview show live what Joe is
 * doing?» — and then: «on the same preview, no more menus: the preview shows
 * everything Joe does, on the computer, the phone, the browser…». While Joe
 * works the phone or this computer, the Preview shows that screen as it is
 * now — framed like a phone, or like a screen — asking for a new frame as
 * soon as the last one arrived (GET /api/devices/{phone|computer}/screen; the
 * server shares one capture between asks). It asks only while it is shown,
 * and says plainly when there is no phone, no adb, or the screen is off.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, Monitor, RefreshCw, X } from 'lucide-react';
import { API_URL } from '../config';

const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

/** What the Preview shows live: a device here, or Joe's own browser (shown by EmbeddedBrowser itself). */
export type LiveSource = 'phone' | 'computer' | 'browser';
export type DeviceSource = Exclude<LiveSource, 'browser'>;
type Status = 'connecting' | 'live' | 'no_phone' | 'no_adb' | 'not_windows' | 'failed';

/** The pause between two frames: a phone needs about two seconds to take one anyway. */
const NEXT_FRAME_MS = 300;
/** After a failure, ask again more slowly. */
const RETRY_MS = 4000;
/**
 * Each source's own route (api/routes/devices.ts: GET /phone/screen, GET /computer/screen),
 * written out whole. `/devices/${source}/screen` read, to the HTTP contract check
 * (api/src/tests/routeMap.ts), as /devices/x/screen — a route nothing serves — and it would
 * have built a path for any value `source` ever carried (2026-11-08).
 */
const SCREEN_URL: Record<DeviceSource, string> = {
    phone: `${API_URL}/devices/phone/screen`,
    computer: `${API_URL}/devices/computer/screen`,
};

/** Joe's browser shown in the Preview: a small floating chip says so, and leads back to the page. */
export function LiveBrowserChip({ onClose }: { onClose?: () => void }) {
    const { t } = useTranslation();
    return (
        <div className="joe-live-chip" dir="auto">
            <span className="joe-live-badge"><span className="joe-live-dot" /> {t('dev_browserLive')}</span>
            {onClose && (
                <button type="button" className="joe-live-close" onClick={onClose} title={t('dev_backToPreview')} aria-label={t('dev_backToPreview')}>
                    <X size={14} />
                </button>
            )}
        </div>
    );
}

export default function LiveDevicePanel({ source, visible, onClose }: { source: DeviceSource; visible: boolean; onClose?: () => void }) {
    const { t } = useTranslation();
    const [src, setSrc] = useState<string>('');
    const [status, setStatus] = useState<Status>('connecting');
    const [model, setModel] = useState('');
    const [awake, setAwake] = useState<boolean | null>(null);
    const [frameAt, setFrameAt] = useState<number>(0);
    const [now, setNow] = useState(Date.now());
    const [nonce, setNonce] = useState(0);
    const lastUrl = useRef('');

    useEffect(() => {
        if (!visible) return;
        let stopped = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const controller = new AbortController();
        const next = (ms: number) => { if (!stopped) timer = setTimeout(ask, ms); };
        async function ask() {
            try {
                const res = await fetch(SCREEN_URL[source], { headers: auth(), cache: 'no-store', signal: controller.signal });
                if (stopped) return;
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    const code = String(body?.code || '');
                    setStatus(code === 'no_phone' || code === 'no_adb' || code === 'not_windows' ? code as Status : 'failed');
                    return next(RETRY_MS);
                }
                const blob = await res.blob();
                if (stopped) return;
                const url = URL.createObjectURL(blob);
                if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
                lastUrl.current = url;
                setSrc(url);
                setModel(decodeURIComponent(res.headers.get('X-Joe-Phone-Model') || ''));
                const a = res.headers.get('X-Joe-Screen-Awake');
                setAwake(a === 'true' ? true : a === 'false' ? false : null);
                setFrameAt(Number(res.headers.get('X-Joe-Frame-At')) || Date.now());
                setStatus('live');
                next(NEXT_FRAME_MS);
            } catch {
                if (!stopped) { setStatus('failed'); next(RETRY_MS); }
            }
        }
        setStatus(s => (s === 'live' ? s : 'connecting'));
        ask();
        return () => { stopped = true; controller.abort(); if (timer) clearTimeout(timer); };
    }, [visible, nonce, source]);

    //  A new source starts from nothing: the phone's last frame never passes for the computer.
    useEffect(() => { setSrc(''); setModel(''); setAwake(null); setFrameAt(0); setStatus('connecting'); }, [source]);

    //  The age of the frame on screen, so a stale picture never passes for live.
    useEffect(() => {
        if (!visible) return;
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [visible]);

    useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);

    const age = frameAt ? Math.max(0, Math.round((now - frameAt) / 1000)) : 0;
    const stale = status === 'live' && age > 8;
    const phone = source === 'phone';
    const message = status === 'no_phone' ? t('dev_noPhone') : status === 'no_adb' ? t('dev_noAdb')
        : status === 'not_windows' ? t('dev_notWindows') : status === 'failed' ? t('dev_failed') : '';
    const Icon = phone ? Smartphone : Monitor;
    const showFrame = src && status !== 'no_phone' && status !== 'no_adb' && status !== 'not_windows';

    return (
        <div className="joe-live-device" dir="auto">
            <div className="joe-live-device-bar">
                <span className="joe-live-device-title"><Icon size={15} /> {phone ? (model || t('dev_phone')) : t('dev_computer')}</span>
                {status === 'live' && (
                    <span className={`joe-live-badge ${stale ? 'is-stale' : ''}`}>
                        <span className="joe-live-dot" /> {stale ? t('dev_lastSeen', { s: age }) : t('dev_live')}
                    </span>
                )}
                {status !== 'live' && status !== 'connecting' && (
                    <button type="button" className="joe-live-retry" onClick={() => setNonce(n => n + 1)}>
                        <RefreshCw size={13} /> {t('dev_retry')}
                    </button>
                )}
                {onClose && (
                    <button type="button" className="joe-live-close" onClick={onClose} title={t('dev_backToPreview')} aria-label={t('dev_backToPreview')}>
                        <X size={14} />
                    </button>
                )}
            </div>
            <div className="joe-live-device-stage">
                {showFrame ? (
                    <div className={phone ? 'joe-phone-frame' : 'joe-screen-frame'}>
                        <img src={src} alt={phone ? t('dev_screenAlt') : t('dev_computerAlt')} className={phone ? 'joe-phone-screen' : 'joe-computer-screen'} draggable={false} />
                        {phone && awake === false && <div className="joe-phone-asleep">{t('dev_screenOff')}</div>}
                    </div>
                ) : (
                    <div className="joe-live-empty">
                        <Icon size={34} />
                        <p>{status === 'connecting' ? (phone ? t('dev_connecting') : t('dev_connectingComputer')) : message}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
