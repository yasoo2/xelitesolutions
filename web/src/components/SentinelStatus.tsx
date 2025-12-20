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

  if (!latest) return null;

  return (
    <div className="w-full px-4 mb-2">
       {/* Collapsed View (Always visible bar) */}
       <div className="flex items-center gap-0 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-full pl-4 pr-1.5 py-1.5 text-xs shadow-sm transition-all hover:border-[var(--accent-primary)] hover:shadow-md group">
           <div className="flex items-center gap-3 overflow-hidden flex-1">
               {latest.severity === 'high' ? (
                   <div className="relative flex h-2 w-2">
                     <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                   </div>
               ) : latest.severity === 'medium' ? (
                   <div className="relative flex h-2 w-2">
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                   </div>
               ) : (
                   <div className="relative flex h-2 w-2">
                     <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                   </div>
               )}
               
               <span className="truncate font-mono text-[var(--text-primary)] flex-1 flex items-center gap-2">
                   <span className="opacity-40 text-[10px] font-bold tracking-wider">[{new Date(latest.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}]</span>
                   <span className="opacity-90 group-hover:opacity-100 transition-opacity">{latest.message}</span>
               </span>
           </div>

           {/* Vertical Separator */}
           <div className="w-[1px] h-4 bg-[var(--border-color)] mx-3" />

           <button 
             onClick={() => setExpanded(!expanded)}
             className="w-7 h-7 flex items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--accent-primary)] hover:text-white transition-all active:scale-95"
             title={expanded ? "Collapse Logs" : "Expand Logs"}
           >
             {expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
           </button>
       </div>

       {/* Expanded View */}
       <AnimatePresence>
         {expanded && (
           <motion.div
             initial={{ height: 0, opacity: 0, marginTop: 0 }}
             animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
             exit={{ height: 0, opacity: 0, marginTop: 0 }}
             className="overflow-hidden"
           >
              <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
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
    </div>
  );
}
