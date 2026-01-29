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

  return (
    <div className="brain-status-widget">
      <div className="brain-header">
        <Brain size={18} className={isRunning ? 'brain-icon-active' : 'brain-icon'} />
        <span className="brain-title">Neural Core</span>
        <button
          onClick={toggleTraining}
          className={`brain-toggle ${isRunning ? 'running' : 'paused'}`}
          title={isRunning ? 'Pause Training' : 'Resume Training'}
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div className="brain-health-row">
        <div className={`brain-health-pill health-${health}`}>
          <span className="dot" />
          {health === 'ok' && 'API: متصل'}
          {health === 'degraded' && 'API: متصل جزئياً'}
          {health === 'down' && 'API: غير متصل'}
          {health === 'unknown' && 'API: جارٍ الفحص'}
        </div>
        <div className={`brain-health-pill ${dbState === 1 ? 'health-ok' : health === 'unknown' ? 'health-unknown' : 'health-down'}`}>
          <span className="dot" />
          {dbState === 1 ? 'DB: جاهزة' : health === 'unknown' ? 'DB: جارٍ الفحص' : 'DB: غير جاهزة'}
        </div>
        {health === 'down' && (
          <div className="brain-health-warning" title="تحقق من تشغيل خادم الـ API على المنفذ 3000">
            <AlertTriangle size={12} />
            <span>لا يوجد اتصال بـ API</span>
          </div>
        )}
      </div>

      <div className="brain-stats">
        <div className="brain-count">
          <Zap size={14} className="zap-icon" />
          <span className="count-value">{formatNumber(stats?.reflexCount || 0)}</span>

          <span className="count-label">Reflexes</span>
        </div>

        <div className={`brain-status-indicator ${isRunning ? 'active' : 'inactive'}`}>
          {isRunning ? 'LEARNING' : 'PAUSED'}
        </div>
      </div>

      {stats.lastLearned && (
        <div className="brain-ticker">
          <span className="ticker-label">Latest:</span>
          <span className="ticker-content">{stats.lastLearned.replace('Learned: ', '')}</span>
        </div>
      )}

      <style>{`
        .brain-status-widget {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(6, 182, 212, 0.1));
          border: 1px solid rgba(139, 92, 246, 0.3);
          border-radius: 12px;
          padding: 12px;
          margin: 8px;
        }
        .brain-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .brain-icon { color: #666; }
        .brain-icon-active { color: #8b5cf6; animation: pulse 1.5s infinite; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .brain-title {
          flex: 1;
          font-weight: 600;
          font-size: 14px;
          color: #e2e8f0;
        }
        .brain-toggle {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .brain-toggle.running {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .brain-toggle.paused {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .brain-toggle:hover {
          transform: scale(1.1);
        }
        .brain-stats {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .brain-health-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
          gap: 6px;
        }
        .brain-health-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 500;
        }
        .brain-health-pill .dot {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          background: #9ca3af;
        }
        .brain-health-pill.health-ok {
          background: rgba(22, 163, 74, 0.18);
          color: #4ade80;
        }
        .brain-health-pill.health-ok .dot {
          background: #22c55e;
        }
        .brain-health-pill.health-degraded {
          background: rgba(245, 158, 11, 0.18);
          color: #fde68a;
        }
        .brain-health-pill.health-degraded .dot {
          background: #f59e0b;
        }
        .brain-health-pill.health-down {
          background: rgba(239, 68, 68, 0.18);
          color: #fecaca;
        }
        .brain-health-pill.health-down .dot {
          background: #ef4444;
        }
        .brain-health-pill.health-unknown {
          background: rgba(148, 163, 184, 0.18);
          color: #e5e7eb;
        }
        .brain-health-pill.health-unknown .dot {
          background: #9ca3af;
        }
        .brain-health-warning {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          color: #fecaca;
          opacity: 0.9;
        }
        .brain-count {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .zap-icon { color: #facc15; }
        .count-value {
          font-size: 20px;
          font-weight: 700;
          color: #8b5cf6;
          font-family: monospace;
        }
        .count-label {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
        }
        .brain-status-indicator {
          font-size: 10px;
          font-weight: 600;
          padding: 4px 8px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .brain-status-indicator.active {
          background: rgba(34, 197, 94, 0.2);
          color: #22c55e;
        }
        .brain-status-indicator.inactive {
          background: rgba(100, 116, 139, 0.2);
          color: #94a3b8;
        }
        .brain-ticker {
          font-size: 11px;
          color: #94a3b8;
          padding: 6px 8px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          display: flex;
          gap: 6px;
          overflow: hidden;
        }
        .ticker-label {
          color: #64748b;
          flex-shrink: 0;
        }
        .ticker-content {
          color: #06b6d4;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>
    </div>
  );
}
