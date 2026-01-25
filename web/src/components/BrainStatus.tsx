import { useState, useEffect } from 'react';
import { Brain, Play, Pause, Zap } from 'lucide-react';
import { API_URL } from '../config';
import { formatNumber } from '../utils/formatters';


interface BrainStats {
  reflexCount: number;
  status: 'running' | 'paused' | 'connecting';
  lastLearned?: string;
}

export default function BrainStatus() {
  const [stats, setStats] = useState<BrainStats>({
    reflexCount: 0,
    status: 'connecting',
    lastLearned: 'Connecting...'
  });

  const isRunning = stats.status === 'running';

  const toggleTraining = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_URL}/api/system/brain/toggle`, {
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
        const res = await fetch(`${API_URL}/api/system/brain/stats`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const json = await res.json();
        setStats(json);
      } catch (e) {
        console.error('Brain stats failed', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 1000);
    return () => clearInterval(interval);
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
