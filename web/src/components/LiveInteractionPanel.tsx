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
  compact?: boolean;
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
  onStop,
  compact = false
}: LivePanelProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [activeTab, setActiveTab] = useState<'LOGS' | 'STEPS' | 'THOUGHTS'>('STEPS');
  const scrollRef = useRef<HTMLDivElement>(null);
  const visibleSteps = steps.filter((s) => {
    const name = String((s as any)?.name || '');
    return name !== 'plan' && !name.startsWith('thinking_step_');
  });

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
      case 'running': return 'var(--accent-primary)';
      case 'error': return 'var(--accent-danger)';
      case 'paused': return 'var(--accent-secondary)';
      default: return 'var(--accent-success)';
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
        margin: compact ? '8px' : '16px',
        marginTop: 0,
        height: isExpanded ? (compact ? 'min(45%, 360px)' : 'min(50%, 420px)') : (compact ? 'clamp(72px, 14vh, 120px)' : 'clamp(96px, 18vh, 140px)'),
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
        padding: compact ? '6px 10px' : '8px 12px',
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
          <span style={{ fontSize: compact ? 12 : 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            {getStatusText()}
          </span>
          {status === 'running' && (
            <span style={{ fontSize: compact ? 10 : 11, color: 'var(--text-secondary)', marginLeft: 4 }}>
              • {steps.length > 0 ? steps[steps.length - 1]?.name || 'Working' : 'Initializing'}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Controls */}
          <div style={{ display: 'flex', gap: 2, marginRight: 8, paddingRight: 8, borderRight: '1px solid var(--border-color)' }}>
            {status === 'running' && (
              <button onClick={onPause} className="btn-icon-glass" title="Pause" style={{ width: compact ? 22 : 24, height: compact ? 22 : 24 }}><Pause size={compact ? 11 : 12} /></button>
            )}
            {status === 'paused' && (
              <button onClick={onResume} className="btn-icon-glass" title="Resume" style={{ width: compact ? 22 : 24, height: compact ? 22 : 24 }}><Play size={compact ? 11 : 12} /></button>
            )}
            <button onClick={onStop} className="btn-icon-glass" title="Stop" style={{ color: '#ef4444', width: compact ? 22 : 24, height: compact ? 22 : 24 }}><Square size={compact ? 11 : 12} /></button>
          </div>

          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="btn-icon-glass"
            title={isExpanded ? "Minimize" : "Expand"}
            style={{ width: compact ? 22 : 24, height: compact ? 22 : 24 }}
          >
            {isExpanded ? <Minimize2 size={compact ? 12 : 14} /> : <Maximize2 size={compact ? 12 : 14} />}
          </button>
        </div>
      </div>

      {/* Performance Stats (Visible when expanded) */}
      {isExpanded && (
        <div style={{
          display: 'flex', gap: compact ? 12 : 16, padding: compact ? '4px 12px' : '4px 16px', 
          background: 'rgba(0,0,0,0.1)', fontSize: compact ? 9 : 10, 
          color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)'
        }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <Activity size={compact ? 9 : 10} /> <span>Steps: {visibleSteps.length}</span>
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <Cpu size={compact ? 9 : 10} /> <span>Time: {visibleSteps.reduce((acc, s) => acc + ((s as any).duration || 0), 0) / 1000}s</span>
           </div>
           <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
             <BookOpen size={compact ? 9 : 10} /> <span>Ctx: {messages.length} msgs</span>
           </div>
        </div>
      )}

      {/* Tabs (Only visible when expanded or explicitly needed) */}
      {(isExpanded || !compact) && (
      <div style={{
        display: 'flex',
        gap: compact ? 12 : 16,
        padding: compact ? '6px 12px' : '8px 16px',
        borderBottom: '1px solid var(--border-color)',
        fontSize: compact ? 11 : 12,
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
          <List size={compact ? 11 : 12} /> Live Steps
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
          <Terminal size={compact ? 11 : 12} /> System Logs
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
          <MessageSquare size={compact ? 11 : 12} /> Thoughts
        </button>
      </div>
      )}

      {/* Content Area */}
      {(isExpanded || !compact) && (
      <div 
        ref={scrollRef}
        style={{ 
          flex: 1, 
          overflowY: 'auto', 
          padding: compact ? 8 : 12, 
          fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace', 
          fontSize: compact ? 11 : 12,
          color: 'var(--text-secondary)',
          direction: activeTab === 'THOUGHTS' ? 'inherit' : 'ltr'
        }}
      >
        {activeTab === 'STEPS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleSteps.length === 0 && <div style={{ opacity: 0.5, fontStyle: 'italic' }}>Waiting for activity...</div>}
            {visibleSteps.map((step, i) => (
              <div key={i} style={{ 
                display: 'flex', gap: 8, 
                padding: compact ? '4px 6px' : '6px 8px', 
                background: 'var(--bg-secondary)', 
                borderRadius: 6,
                borderLeft: `2px solid ${step.status === 'done' ? 'var(--accent-success)' : step.status === 'failed' ? 'var(--accent-danger)' : 'var(--accent-primary)'}`
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: compact ? 11 : 12 }}>{step.name}</span>
                    <span style={{ opacity: 0.5, fontSize: compact ? 9 : 10 }}>{step.duration ? `${(step.duration/1000).toFixed(1)}s` : step.status}</span>
                  </div>
                  {step.error && (
                    <div style={{ color: 'var(--accent-danger)', marginTop: 4, fontSize: compact ? 11 : 12 }}>{step.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'LOGS' && (
          <div style={{ whiteSpace: 'pre-wrap' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: compact ? 3 : 4, borderBottom: '1px solid var(--border-light)', paddingBottom: compact ? 1 : 2 }}>
                <span style={{ color: 'var(--accent-secondary)' }}>[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))}
            {logs.length === 0 && <div style={{ opacity: 0.5 }}>System logs empty.</div>}
          </div>
        )}

        {activeTab === 'THOUGHTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
             {messages.filter(m => m.role === 'assistant' && m.content).map((msg, i) => (
               <div key={i} style={{ background: 'var(--bg-secondary)', padding: compact ? 6 : 8, borderRadius: 6 }}>
                 <div style={{ color: 'var(--accent-primary)', marginBottom: 4, fontSize: compact ? 10 : 11 }}>Assistant</div>
                 <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, color: 'var(--text-primary)' }}>{msg.content}</div>
               </div>
             ))}
             {messages.length === 0 && <div style={{ opacity: 0.5 }}>No thoughts recorded.</div>}
          </div>
        )}
      </div>
      )}

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
