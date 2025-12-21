import { useState, useEffect, useRef } from 'react';
import { 
  Terminal, Activity, Globe, FileText, Cpu, List, BookOpen, 
  ChevronUp, ChevronDown, Maximize2, Minimize2, X, AlertCircle, 
  CheckCircle2, Loader2, Play, Pause, Square, MessageSquare
} from 'lucide-react';
import { API_URL as API } from '../config';

interface LivePanelProps {
  steps: any[];
  logs: string[];
  messages: any[];
  status: 'idle' | 'running' | 'paused' | 'error';
  onExpand?: (expanded: boolean) => void;
  expanded?: boolean;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
}

export function LiveInteractionPanel({ 
  steps, 
  logs, 
  messages = [], 
  status, 
  onExpand, 
  expanded = false,
  onPause,
  onResume,
  onStop
}: LivePanelProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [activeTab, setActiveTab] = useState<'LOGS' | 'STEPS' | 'THOUGHTS'>('STEPS');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsExpanded(expanded);
  }, [expanded]);

  useEffect(() => {
    if (onExpand) onExpand(isExpanded);
  }, [isExpanded, onExpand]);

  // Auto-scroll to bottom of logs
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, steps]);

  const getStatusColor = () => {
    switch (status) {
      case 'running': return '#3b82f6';
      case 'error': return '#ef4444';
      case 'paused': return '#f59e0b';
      default: return '#10b981';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running': return 'Processing...';
      case 'error': return 'Error Encountered';
      case 'paused': return 'Waiting for Input';
      default: return 'System Ready';
    }
  };

  return (
    <div 
      className={`live-panel ${isExpanded ? 'expanded' : ''}`}
      style={{
        position: 'relative',
        margin: '16px',
        marginTop: 0,
        height: isExpanded ? 'min(50%, 420px)' : 'clamp(96px, 18vh, 140px)',
        flexShrink: 0,
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(12px)',
        borderRadius: 12,
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        zIndex: 100
      }}
    >
      {/* Header / Status Bar */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(255, 255, 255, 0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', width: 8, height: 8 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: getStatusColor(),
              boxShadow: `0 0 8px ${getStatusColor()}`,
              animation: status === 'running' ? 'pulse 1.5s infinite' : 'none'
            }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {getStatusText()}
          </span>
          {status === 'running' && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
              • {steps.length > 0 ? steps[steps.length - 1]?.name || 'Working' : 'Initializing'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 2, marginRight: 8, paddingRight: 8, borderRight: '1px solid var(--border-color)' }}>
            {status === 'running' && (
              <button onClick={onPause} className="btn-icon-glass" title="Pause"><Pause size={12} /></button>
            )}
            {status === 'paused' && (
              <button onClick={onResume} className="btn-icon-glass" title="Resume"><Play size={12} /></button>
            )}
            <button onClick={onStop} className="btn-icon-glass" title="Stop" style={{ color: '#ef4444' }}><Square size={12} /></button>
          </div>

          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn-icon-glass"
            title={isExpanded ? "Minimize" : "Expand"}
          >
            {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Performance Stats (Visible when expanded) */}
      {isExpanded && (
        <div style={{
          display: 'flex', gap: 16, padding: '4px 16px', 
          background: 'rgba(0,0,0,0.1)', fontSize: 10, 
          color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)'
        }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <Activity size={10} /> <span>Steps: {steps.length}</span>
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <Cpu size={10} /> <span>Time: {steps.reduce((acc, s) => acc + (s.duration || 0), 0) / 1000}s</span>
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <BookOpen size={10} /> <span>Ctx: {messages.length} msgs</span>
           </div>
        </div>
      )}

      {/* Tabs (Only visible when expanded or explicitly needed) */}
      <div style={{
        display: 'flex',
        gap: 16,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        fontSize: 12,
        color: 'var(--text-secondary)'
      }}>
        <button 
          onClick={() => setActiveTab('STEPS')}
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === 'STEPS' ? 'var(--text-primary)' : 'inherit',
            fontWeight: activeTab === 'STEPS' ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <List size={12} /> Live Steps
        </button>
        <button 
          onClick={() => setActiveTab('LOGS')}
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === 'LOGS' ? 'var(--text-primary)' : 'inherit',
            fontWeight: activeTab === 'LOGS' ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <Terminal size={12} /> System Logs
        </button>
        <button 
          onClick={() => setActiveTab('THOUGHTS')}
          style={{ 
            background: 'none', border: 'none', cursor: 'pointer',
            color: activeTab === 'THOUGHTS' ? 'var(--text-primary)' : 'inherit',
            fontWeight: activeTab === 'THOUGHTS' ? 600 : 400,
            display: 'flex', alignItems: 'center', gap: 6
          }}
        >
          <MessageSquare size={12} /> Thoughts
        </button>
      </div>

      {/* Content Area */}
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: 12, 
          fontFamily: 'monospace', 
          fontSize: 12,
          color: 'var(--text-secondary)',
          direction: activeTab === 'THOUGHTS' ? 'inherit' : 'ltr'
        }}
      >
        {activeTab === 'STEPS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {steps.length === 0 && <div style={{ opacity: 0.5, fontStyle: 'italic' }}>Waiting for activity...</div>}
            {steps.map((step, i) => (
              <div key={i} style={{ 
                display: 'flex', gap: 8, 
                padding: '6px 8px', 
                background: 'var(--bg-secondary)', 
                borderRadius: 6,
                borderLeft: `2px solid ${step.status === 'done' ? '#10b981' : step.status === 'failed' ? '#ef4444' : '#3b82f6'}`
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{step.name}</span>
                    <span style={{ opacity: 0.5, fontSize: 10 }}>{step.duration ? `${(step.duration/1000).toFixed(1)}s` : step.status}</span>
                  </div>
                  {step.plan?.input && (
                     <div style={{ marginTop: 4, opacity: 0.7, fontSize: 11, whiteSpace: 'pre-wrap', overflow: 'hidden', textOverflow: 'ellipsis', maxHeight: 40 }}>
                       {JSON.stringify(step.plan.input)}
                     </div>
                  )}
                  {step.error && (
                    <div style={{ color: '#ef4444', marginTop: 4 }}>{step.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'LOGS' && (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: 4, borderBottom: '1px solid var(--border-light)', paddingBottom: 2 }}>
                <span style={{ color: 'var(--accent-secondary)' }}>[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))}
            {logs.length === 0 && <div style={{ opacity: 0.5 }}>System logs empty.</div>}
          </div>
        )}

        {activeTab === 'THOUGHTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             {messages.filter(m => m.role === 'assistant' && m.content).map((msg, i) => (
               <div key={i} style={{ background: 'var(--bg-secondary)', padding: 8, borderRadius: 6 }}>
                 <div style={{ color: 'var(--accent-primary)', marginBottom: 4, fontSize: 11 }}>Assistant</div>
                 <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, color: 'var(--text-primary)' }}>{msg.content}</div>
               </div>
             ))}
             {messages.length === 0 && <div style={{ opacity: 0.5 }}>No thoughts recorded.</div>}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 var(--accent-glow); }
          70% { box-shadow: 0 0 0 6px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
        .btn-icon-glass {
          background: rgba(255, 255, 255, 0.05);
          border: none;
          color: var(--text-secondary);
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon-glass:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--text-primary);
        }
      `}</style>
    </div>
  );
}
