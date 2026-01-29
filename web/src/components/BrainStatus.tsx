import { useState, useEffect } from 'react';
import { Brain, Play, Pause, Zap, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';
import { formatNumber } from '../utils/formatters';


interface BrainStats {
  reflexCount: number;
  status: 'running' | 'paused' | 'connecting';
  lastLearned?: string;
}

type HealthStatus = 'unknown' | 'ok' | 'degraded' | 'down';

export default function BrainStatus() {
  const [stats, setStats] = useState<BrainStats>({
    reflexCount: 0,
    status: 'connecting',
    lastLearned: 'Connecting...'
  });

  const [health, setHealth] = useState<HealthStatus>('unknown');
  const [dbState, setDbState] = useState<number | null>(null);

  const isRunning = stats.status === 'running';

  const toggleTraining = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/system/brain/toggle`, {

        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (e) {
      console.error('Toggle failed', e);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/system/brain/stats`, {

          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) return;
        const json = await res.json();
        setStats(json);
      } catch (e) {
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const controller = new AbortController();
      const to = window.setTimeout(() => controller.abort(), 900);
      try {
        const res = await fetch(`${API_URL}/health`, { cache: 'no-store', signal: controller.signal });
        if (!alive) return;
        if (!res.ok) {
          setHealth('down');
          setDbState(null);
          return;
        }
        const data: any = await res.json().catch(() => ({}));
        const db = typeof data?.db === 'number' ? data.db : null;
        setDbState(db);
        if (db === 1) setHealth('ok');
        else setHealth('degraded');
      } catch {
        if (!alive) return;
        setHealth('down');
        setDbState(null);
      } finally {
        window.clearTimeout(to);
      }
    };

    tick();
    const interval = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  const pillTone = (kind: 'ok' | 'degraded' | 'down' | 'unknown') => {
    if (kind === 'ok') {
      return {
        bg: 'rgba(16, 185, 129, 0.14)',
        border: 'rgba(16, 185, 129, 0.35)',
        text: 'rgb(16, 185, 129)',
      };
    }
    if (kind === 'degraded') {
      return {
        bg: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.35)',
        text: 'rgb(245, 158, 11)',
      };
    }
    if (kind === 'down') {
      return {
        bg: 'rgba(239, 68, 68, 0.14)',
        border: 'rgba(239, 68, 68, 0.35)',
        text: 'rgb(239, 68, 68)',
      };
    }
    return {
      bg: 'var(--bg-secondary)',
      border: 'var(--border-color)',
      text: 'var(--text-secondary)',
    };
  };

  const apiTone = pillTone(health);
  const dbTone = pillTone(dbState === 1 ? 'ok' : health === 'unknown' ? 'unknown' : 'down');

  return (
    <div
      className="rounded-xl p-3 m-2"
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
    >
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-lg"
          style={{
            background: 'rgba(var(--accent-primary-rgb), 0.10)',
            border: '1px solid rgba(var(--accent-primary-rgb), 0.18)',
          }}
        >
          <Brain
            size={18}
            className={isRunning ? 'animate-pulse' : ''}
            style={{ color: 'var(--accent-primary)' }}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            Neural Core
          </div>
          <div className="text-[10px] tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            {isRunning ? 'LEARNING' : stats.status === 'connecting' ? 'CONNECTING' : 'PAUSED'}
          </div>
        </div>

        <button
          onClick={toggleTraining}
          className="w-7 h-7 rounded-full grid place-items-center transition-transform active:scale-95"
          style={{
            background: isRunning ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
            border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
            color: isRunning ? 'rgb(16, 185, 129)' : 'rgb(239, 68, 68)',
          }}
          title={isRunning ? 'Pause Training' : 'Resume Training'}
          type="button"
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border"
          style={{ background: apiTone.bg, borderColor: apiTone.border, color: apiTone.text }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: apiTone.text }} />
          {health === 'ok' && 'API: متصل'}
          {health === 'degraded' && 'API: متصل جزئياً'}
          {health === 'down' && 'API: غير متصل'}
          {health === 'unknown' && 'API: جارٍ الفحص'}
        </div>

        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border"
          style={{ background: dbTone.bg, borderColor: dbTone.border, color: dbTone.text }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dbTone.text }} />
          {dbState === 1 ? 'DB: جاهزة' : health === 'unknown' ? 'DB: جارٍ الفحص' : 'DB: غير جاهزة'}
        </div>

        {health === 'down' ? (
          <div
            className="inline-flex items-center gap-1 text-[10px] font-medium"
            style={{ color: 'rgb(239, 68, 68)' }}
            title="تحقق من تشغيل خادم الـ API على المنفذ 3000"
          >
            <AlertTriangle size={12} />
            <span>لا يوجد اتصال بـ API</span>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Zap size={14} style={{ color: 'var(--accent-primary)' }} />
          <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {formatNumber(stats?.reflexCount || 0)}
          </span>
          <span className="text-[11px] tracking-wide" style={{ color: 'var(--text-muted)' }}>
            Reflexes
          </span>
        </div>

        <div
          className="text-[10px] font-bold tracking-widest px-2 py-1 rounded-md"
          style={{
            background: isRunning ? 'rgba(16, 185, 129, 0.14)' : 'rgba(148, 163, 184, 0.14)',
            border: `1px solid ${isRunning ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-color)'}`,
            color: isRunning ? 'rgb(16, 185, 129)' : 'var(--text-secondary)',
          }}
        >
          {isRunning ? 'ACTIVE' : 'IDLE'}
        </div>
      </div>

      {stats.lastLearned ? (
        <div
          className="mt-2 px-2.5 py-2 rounded-lg text-[11px] flex gap-2 overflow-hidden"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
            Latest:
          </span>
          <span className="truncate" style={{ color: 'var(--text-primary)' }}>
            {stats.lastLearned.replace('Learned: ', '')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
