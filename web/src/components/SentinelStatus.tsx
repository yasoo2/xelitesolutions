import React, { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle, ChevronUp, ChevronDown, Activity, AlertTriangle, Info } from 'lucide-react';
import { SocketService } from '../services/socket';
import { motion, AnimatePresence } from 'framer-motion';

export default function SentinelStatus() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsubscribe = SocketService.subscribe((msg) => {
      try {
        if (msg.type === 'sentinel:alert') {
          setAlerts(prev => {
            const newIds = new Set(msg.data.map((a: any) => a.id));
            const filtered = prev.filter(a => !newIds.has(a.id));
            // Keep latest 50 alerts
            return [...msg.data, ...filtered].slice(0, 50);
          });
        }
      } catch (e) {}
    });

    return () => { unsubscribe(); };
  }, []);

  const latest = alerts.length > 0 ? alerts[0] : null;

  // Determine severity and styles
  let severity = 'safe';
  if (alerts.some(a => a.severity === 'high')) severity = 'high';
  else if (alerts.some(a => a.severity === 'medium')) severity = 'medium';
  else if (alerts.length > 0) severity = 'info';

  const getStyles = () => {
    switch(severity) {
      case 'high': 
        return 'bg-red-500/10 border-red-500/50 text-red-600 dark:text-red-400 hover:border-red-500 hover:bg-red-500/20';
      case 'medium': 
        return 'bg-yellow-500/10 border-yellow-500/50 text-yellow-600 dark:text-yellow-400 hover:border-yellow-500 hover:bg-yellow-500/20';
      case 'info': 
        return 'bg-blue-500/10 border-blue-500/50 text-blue-600 dark:text-blue-400 hover:border-blue-500 hover:bg-blue-500/20';
      default: 
        return 'bg-green-500/10 border-green-500/50 text-green-600 dark:text-green-400 hover:border-green-500 hover:bg-green-500/20';
    }
  };

  const getIcon = () => {
      switch(severity) {
          case 'high': return <ShieldAlert size={14} className="animate-pulse" />;
          case 'medium': return <AlertTriangle size={14} />;
          case 'info': return <Info size={14} />;
          default: return <CheckCircle size={14} />;
      }
  };

  const statusText = latest ? latest.message : "System Normal";
  const statusTime = latest ? new Date(latest.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}) : "";

  return (
    <div className="w-full px-4 mt-2">
       {/* Expanded View (Top) */}
       <AnimatePresence>
         {expanded && (
           <motion.div
             initial={{ height: 0, opacity: 0, marginBottom: 0 }}
             animate={{ height: 'auto', opacity: 1, marginBottom: 8 }}
             exit={{ height: 0, opacity: 0, marginBottom: 0 }}
             className="overflow-hidden"
           >
              <div className={`bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar`}>
                  {alerts.length === 0 ? (
                      <div className="p-4 text-center text-[var(--text-muted)] text-xs font-mono">No active logs.</div>
                  ) : (
                      alerts.map((alert, i) => (
                          <div key={i} className="p-2 border-b border-[var(--border-color)] last:border-0 flex gap-3 items-start hover:bg-[var(--bg-hover)] transition-colors text-xs">
                              <div className="mt-0.5 flex-shrink-0">
                                  {alert.severity === 'high' ? <ShieldAlert size={14} className="text-red-500" /> : 
                                   alert.severity === 'medium' ? <AlertTriangle size={14} className="text-yellow-500" /> : 
                                   <Info size={14} className="text-blue-500" />}
                              </div>
                              <div className="flex-1 min-w-0 font-mono">
                                  <div className="flex justify-between items-baseline mb-0.5">
                                      <span className={`font-semibold truncate ${
                                          alert.severity === 'high' ? 'text-red-400' : 
                                          alert.severity === 'medium' ? 'text-yellow-400' : 'text-blue-400'
                                      }`}>{alert.message}</span>
                                      <span className="text-[10px] opacity-40 ml-2 whitespace-nowrap">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  {alert.file && <div className="text-[10px] opacity-60 truncate">File: {alert.file}</div>}
                              </div>
                          </div>
                      ))
                  )}
              </div>
           </motion.div>
         )}
       </AnimatePresence>

       {/* Collapsed View (Always visible bar) */}
       <div className={`flex items-center gap-0 border rounded-full pl-4 pr-1.5 py-1.5 text-xs shadow-sm transition-all group ${getStyles()}`}>
           <div className="flex items-center gap-3 overflow-hidden flex-1">
               <div className="flex-shrink-0">
                  {getIcon()}
               </div>
               
               <span className="truncate font-mono flex-1 flex items-center gap-2">
                   {statusTime && <span className="opacity-60 text-[10px] font-bold tracking-wider">[{statusTime}]</span>}
                   <span className="opacity-90 group-hover:opacity-100 transition-opacity font-medium">{statusText}</span>
               </span>
           </div>

           {/* Count Badge */}
           {alerts.length > 0 && (
               <div className="mx-2 px-1.5 py-0.5 rounded-full bg-black/10 dark:bg-white/10 text-[10px] font-bold flex items-center justify-center min-w-[20px]">
                   {alerts.length}
               </div>
           )}

           {/* Vertical Separator */}
           <div className="w-[1px] h-4 bg-current opacity-20 mx-1" />

           <button 
             onClick={() => setExpanded(!expanded)}
             className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all active:scale-95"
             title={expanded ? "Collapse Logs" : "Expand Logs"}
           >
             {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
           </button>
       </div>
    </div>
  );
}
