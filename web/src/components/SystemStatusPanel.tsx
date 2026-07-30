import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API_URL } from '../config';

/* An honest, elegant system self-check. Every row reflects a real probe from
   GET /api/status — no cheerful placeholders. Theme-aware (light/dark), RTL. */

type Level = 'ok' | 'warn' | 'error';
type Row = { key: string; icon: string; title: string; value: string; detail: string; level: Level };

type StatusData = {
  uptimeSeconds: number;
  persistence: { mode: string; mockDb: boolean };
  tools: { count: number };
  ai: { mode: string; provider: string; model: string; reachable: boolean | null; ok: boolean; detail: string };
  browser: { ok: boolean; engine: string | null; detail: string };
  google: { configured: boolean; connected: boolean; email: string | null; ok: boolean; detail: string };
  extension: { connected: boolean; totalUsers: number; ok: boolean; detail: string };
};

const dot: Record<Level, string> = { ok: '#22c55e', warn: '#f59e0b', error: '#ef4444' };

function toRows(d: StatusData, t: (k: string) => string): Row[] {
  return [
    {
      key: 'ai', icon: '🧠', title: t('sysAiEngine'),
      value: d.ai.mode === 'local' ? `${d.ai.model} (${t('sysLocal')})` : d.ai.provider,
      detail: d.ai.detail,
      level: d.ai.ok ? 'ok' : 'error',
    },
    {
      key: 'browser', icon: '🌐', title: t('sysBrowserEngine'),
      value: d.browser.engine || t('sysNotInstalled'),
      detail: d.browser.detail,
      level: d.browser.ok ? 'ok' : 'error',
    },
    {
      key: 'google', icon: '📧', title: t('googleAccount'),
      value: d.google.connected ? (d.google.email || t('sysLinked')) : d.google.configured ? t('sysNotLinked') : t('sysNotConfigured'),
      detail: d.google.detail,
      level: d.google.connected ? 'ok' : 'warn',
    },
    {
      key: 'extension', icon: '🧩', title: t('sysMyBrowserExt'),
      value: d.extension.connected ? t('sysConnected') : t('sysDisconnected'),
      detail: d.extension.detail,
      level: d.extension.connected ? 'ok' : 'warn',
    },
  ];
}

export default function SystemStatusPanel() {
  const { t } = useTranslation();
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
    try {
      const r = await fetch(`${API_URL}/status`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) { setError(t('sysFetchFailed')); }
    finally { setLoading(false); }
  }, [t]);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const rows = data ? toRows(data, t) : [];
  const allOk = rows.every(r => r.level === 'ok');
  const anyErr = rows.some(r => r.level === 'error');
  const headLevel: Level = anyErr ? 'error' : allOk ? 'ok' : 'warn';

  return (
    <div className="joe-status" dir="rtl">
      <style>{`
        .joe-status { --bg:#ffffff; --panel:#f8fafc; --line:#e6ebf2; --text:#0f172a; --muted:#64748b; --shadow:0 10px 34px -18px rgba(15,23,42,.35);
          font-family: system-ui, 'Segoe UI', Tahoma, Arial; color:var(--text); }
        @media (prefers-color-scheme: dark) { .joe-status { --bg:#0e1420; --panel:#131c2b; --line:#233046; --text:#e8eef7; --muted:#93a4bd; --shadow:0 12px 40px -18px rgba(0,0,0,.6); } }
        :root[data-theme="dark"] .joe-status { --bg:#0e1420; --panel:#131c2b; --line:#233046; --text:#e8eef7; --muted:#93a4bd; }
        :root[data-theme="light"] .joe-status { --bg:#ffffff; --panel:#f8fafc; --line:#e6ebf2; --text:#0f172a; --muted:#64748b; }
        .joe-status .card { background:var(--bg); border:1px solid var(--line); border-radius:18px; box-shadow:var(--shadow); overflow:hidden; }
        .joe-status .head { display:flex; align-items:center; gap:12px; padding:16px 18px; border-bottom:1px solid var(--line);
          background:linear-gradient(180deg, color-mix(in srgb, var(--hc) 10%, transparent), transparent); }
        .joe-status .badge { width:11px; height:11px; border-radius:50%; background:var(--hc); box-shadow:0 0 0 4px color-mix(in srgb, var(--hc) 18%, transparent); }
        .joe-status .head h3 { margin:0; font-size:16px; font-weight:700; flex:1; }
        .joe-status .head .sub { font-size:12px; color:var(--muted); }
        .joe-status .refresh { border:1px solid var(--line); background:var(--panel); color:var(--muted); border-radius:10px; padding:6px 10px; font-size:12px; cursor:pointer; transition:.15s; }
        .joe-status .refresh:hover { color:var(--text); }
        .joe-status .rows { padding:8px; display:flex; flex-direction:column; gap:6px; }
        .joe-status .row { display:flex; align-items:center; gap:12px; padding:12px 12px; border-radius:12px; transition:background .15s; }
        .joe-status .row:hover { background:var(--panel); }
        .joe-status .ricon { width:38px; height:38px; flex:none; display:grid; place-items:center; font-size:19px; border-radius:11px; background:var(--panel); border:1px solid var(--line); }
        .joe-status .rmid { flex:1; min-width:0; }
        .joe-status .rtitle { font-size:13.5px; font-weight:650; }
        .joe-status .rdetail { font-size:11.5px; color:var(--muted); margin-top:2px; line-height:1.5; }
        .joe-status .rval { display:flex; align-items:center; gap:8px; flex:none; max-width:45%; }
        .joe-status .rdot { width:9px; height:9px; border-radius:50%; flex:none; }
        .joe-status .rvtext { font-size:12px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .joe-status .foot { display:flex; flex-wrap:wrap; gap:8px 18px; padding:12px 18px; border-top:1px solid var(--line); color:var(--muted); font-size:11.5px; }
        .joe-status .foot b { color:var(--text); font-weight:650; }
        .joe-status .empty { padding:26px; text-align:center; color:var(--muted); font-size:13px; }
      `}</style>

      <div className="card" style={{ ['--hc' as any]: dot[headLevel] }}>
        <div className="head">
          <span className="badge" />
          <div style={{ flex: 1 }}>
            <h3>{t('systemStatus')}</h3>
            <div className="sub">{data ? (allOk ? t('sysAllOk') : anyErr ? t('sysNeedsAttention') : t('sysReadyOptional')) : t('sysChecking')}</div>
          </div>
          <button className="refresh" onClick={load} disabled={loading}>{loading ? '…' : `↻ ${t('browserRefresh')}`}</button>
        </div>

        {error && !data ? <div className="empty">{error}</div> : null}

        {data ? (
          <>
            <div className="rows">
              {rows.map(r => (
                <div className="row" key={r.key}>
                  <div className="ricon">{r.icon}</div>
                  <div className="rmid">
                    <div className="rtitle">{r.title}</div>
                    <div className="rdetail">{r.detail}</div>
                  </div>
                  <div className="rval">
                    <span className="rdot" style={{ background: dot[r.level], boxShadow: `0 0 8px ${dot[r.level]}` }} />
                    <span className="rvtext">{r.value}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="foot">
              <span>الأدوات: <b>{data.tools.count}</b></span>
              <span>التخزين: <b>{data.persistence.mode}</b></span>
              <span>مدّة التشغيل: <b>{Math.floor(data.uptimeSeconds / 60)}د {data.uptimeSeconds % 60}ث</b></span>
            </div>
          </>
        ) : (!error ? <div className="empty">جارٍ الفحص…</div> : null)}
      </div>
    </div>
  );
}
