import React, { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle } from 'lucide-react';
import { SocketService } from '../services/socket';

export default function SentinelStatus() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [connected, setConnected] = useState(true); // Assumed true via service

  useEffect(() => {
    const unsubscribe = SocketService.subscribe((msg) => {
      try {
        if (msg.type === 'sentinel:alert') {
          // Merge new alerts
          setAlerts(prev => {
            const newIds = new Set(msg.data.map((a: any) => a.id));
            const filtered = prev.filter(a => !newIds.has(a.id));
            return [...msg.data, ...filtered].slice(0, 10);
          });
        }
      } catch (e) {}
    });

    return () => { unsubscribe(); };
  }, []);

  const highSev = alerts.filter(a => a.severity === 'high').length;

  return (
    <div className="relative group">
      <button 
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--bg-hover)] transition-all relative"
        title="Sentinel Security Status"
      >
        {highSev > 0 ? (
          <ShieldAlert size={20} className="text-[var(--accent-danger)]" />
        ) : (
          <CheckCircle size={20} className="text-[var(--accent-success)] opacity-60" />
        )}
        
        {alerts.length > 0 && (
          <span className="absolute top-0 right-0 flex h-3 w-3">
            {highSev > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-danger)] opacity-75"></span>}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${highSev > 0 ? 'bg-[var(--accent-danger)]' : 'bg-[var(--accent-primary)]'}`}></span>
          </span>
        )}
      </button>

      {/* Dropdown */}
      <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-0 hidden group-hover:block z-50 backdrop-blur-xl">
        <div className="p-3 border-b border-[var(--border-color)] font-bold text-sm flex justify-between items-center">
          <span>Sentinel Alerts</span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-[var(--accent-success)]' : 'bg-[var(--accent-danger)]'}`} />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-[var(--text-muted)] text-xs">
              No active threats detected.
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)]">
                <div className="flex justify-between items-start mb-1">
                  <span 
                    className="text-[10px] px-1.5 py-0.5 rounded uppercase font-bold"
                    style={{
                      backgroundColor: alert.severity === 'high' ? 'color-mix(in srgb, var(--accent-danger), transparent 85%)' : 
                                     alert.severity === 'medium' ? 'color-mix(in srgb, var(--accent-warning), transparent 85%)' : 
                                     'color-mix(in srgb, var(--accent-primary), transparent 85%)',
                      color: alert.severity === 'high' ? 'var(--accent-danger)' : 
                             alert.severity === 'medium' ? 'var(--accent-warning)' : 
                             'var(--accent-primary)'
                    }}
                  >
                    {alert.severity}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm font-medium text-[var(--text-primary)]">{alert.message}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">{alert.file}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
