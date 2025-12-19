import React, { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle, Bell } from 'lucide-react';
import { WS_URL } from '../config';

export default function SentinelStatus() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sentinel:alert') {
          // Merge new alerts
          setAlerts(prev => {
            const newIds = new Set(msg.data.map((a: any) => a.id));
            const filtered = prev.filter(a => !newIds.has(a.id));
            return [...msg.data, ...filtered].slice(0, 10);
          });
        }
      } catch (e) {}
    };

    return () => ws.close();
  }, []);

  const highSev = alerts.filter(a => a.severity === 'high').length;

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--bg-hover)] transition-colors">
        {highSev > 0 ? (
          <ShieldAlert size={16} className="text-red-500 animate-pulse" />
        ) : (
          <CheckCircle size={16} className="text-green-500" />
        )}
        <span className="text-xs font-medium">Sentinel</span>
        {alerts.length > 0 && (
          <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{alerts.length}</span>
        )}
      </button>

      {/* Dropdown */}
      <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl shadow-2xl p-0 hidden group-hover:block z-50 backdrop-blur-xl">
        <div className="p-3 border-b border-[var(--border-color)] font-bold text-sm flex justify-between items-center">
          <span>Sentinel Alerts</span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <div className="max-h-64 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-gray-500 text-xs">
              No active threats detected.
            </div>
          ) : (
            alerts.map(alert => (
              <div key={alert.id} className="p-3 border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)]">
                <div className="flex justify-between items-start mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                    alert.severity === 'high' ? 'bg-red-500/20 text-red-500' : 
                    alert.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-500' : 
                    'bg-blue-500/20 text-blue-500'
                  }`}>
                    {alert.severity}
                  </span>
                  <span className="text-[10px] text-gray-500">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-sm font-medium text-gray-200">{alert.message}</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">{alert.file}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
