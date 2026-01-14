import { useEffect, useMemo, useState } from 'react';
import { API_URL } from '../config';

type Props = {
  sessionId?: string;
  open: boolean;
  onClose: () => void;
  showBoxes: boolean;
  onToggleBoxes: () => void;
};

export default function BrowserControlPanel({ sessionId, open, onClose, showBoxes, onToggleBoxes }: Props) {
  const token = useMemo(() => {
    try {
      return localStorage.getItem('token') || '';
    } catch {
      return '';
    }
  }, []);
  const [runCfgLoading, setRunCfgLoading] = useState(false);
  const [runCfgError, setRunCfgError] = useState('');
  const [runCfg, setRunCfg] = useState<{ autoApproveAll?: boolean; autoApproveSafe?: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    let alive = true;
    setRunCfgLoading(true);
    setRunCfgError('');
    fetch(`${API_URL}/sessions/${encodeURIComponent(sid)}/run-config`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
      .then(async (res) => {
        if (res.status === 401) {
          try {
            window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          } catch {}
          throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => ({}));
        return data;
      })
      .then((data) => {
        if (!alive) return;
        setRunCfg(data?.config && typeof data.config === 'object' ? data.config : {});
      })
      .catch((e) => {
        if (!alive) return;
        setRunCfgError(e instanceof Error ? e.message : 'Failed to load');
      })
      .finally(() => {
        if (!alive) return;
        setRunCfgLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, sessionId, token]);

  const updateRunCfg = async (patch: { autoApproveAll?: boolean; autoApproveSafe?: boolean }) => {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    setRunCfgLoading(true);
    setRunCfgError('');
    try {
      const res = await fetch(`${API_URL}/sessions/${encodeURIComponent(sid)}/run-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        try {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        } catch {}
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setRunCfg(data?.config && typeof data.config === 'object' ? data.config : patch);
    } catch (e) {
      setRunCfgError(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setRunCfgLoading(false);
    }
  };

  if (!open) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        onClick={() => onClose()}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 'min(420px, 92vw)',
          height: '100%',
          background: 'var(--bg-secondary)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          padding: 14,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>السيطرة</div>
          <button
            onClick={() => onClose()}
            style={{
              height: 30,
              padding: '0 10px',
              borderRadius: 10,
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            إغلاق
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>Vision & Grounding</div>
          <button
            onClick={() => onToggleBoxes()}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: showBoxes ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            {showBoxes ? 'إخفاء bounding boxes' : 'إظهار bounding boxes'}
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>Safety</div>
          <button
            onClick={() => updateRunCfg({ autoApproveSafe: !Boolean(runCfg?.autoApproveSafe) })}
            disabled={runCfgLoading || !sessionId}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: runCfg?.autoApproveSafe ? 'rgba(37, 99, 235, 0.18)' : 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
              opacity: runCfgLoading || !sessionId ? 0.6 : 1,
            }}
          >
            {runCfg?.autoApproveSafe ? 'إيقاف الموافقة التلقائية الآمنة' : 'تفعيل الموافقة التلقائية الآمنة'}
          </button>
          <button
            onClick={() => updateRunCfg({ autoApproveAll: !Boolean(runCfg?.autoApproveAll) })}
            disabled={runCfgLoading || !sessionId}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: runCfg?.autoApproveAll ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
              opacity: runCfgLoading || !sessionId ? 0.6 : 1,
            }}
          >
            {runCfg?.autoApproveAll ? 'إيقاف الموافقة التلقائية للجميع' : 'تفعيل الموافقة التلقائية للجميع'}
          </button>
          {runCfgLoading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>جارٍ تحديث إعدادات التشغيل…</div>
          ) : null}
          {runCfgError ? (
            <div style={{ fontSize: 12, color: 'rgba(239,68,68,0.95)' }}>{runCfgError}</div>
          ) : null}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>Debug</div>
          <button
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('browser:details_toggle'));
              } catch {}
            }}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            إظهار/إخفاء سجل المتصفح
          </button>
          <button
            onClick={() => {
              try {
                window.dispatchEvent(new CustomEvent('browser:cancel_pending'));
              } catch {}
            }}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 12,
              border: '1px solid var(--border-color)',
              background: 'rgba(239,68,68,0.22)',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            إلغاء أوامر المتصفح المعلّقة
          </button>
        </div>
      </div>
    </div>
  );
}
