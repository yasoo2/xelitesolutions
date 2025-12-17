import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { API_URL as API, WS_URL as WS } from '../config';
import { 
  Terminal, 
  FileText, 
  Globe, 
  Cpu, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  FileCode,
  Link as LinkIcon,
  ChevronDown,
  ChevronRight,
  Clock
} from 'lucide-react';

export default function CommandComposer({ sessionId, onSessionCreated }: { sessionId?: string; onSessionCreated?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<Array<{ type: string; data: any; duration?: number; expanded?: boolean }>>([]);
  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const stepStartTimes = useRef<Record<string, number>>({});

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);


  function connectWS() {
    try {
      console.log('Connecting to WS:', WS);
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) return;
        try { wsRef.current.close(); } catch {}
      }
      const ws = new WebSocket(WS);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimerRef.current = window.setTimeout(() => {
          connectWS();
        }, 2000);
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          
          if (msg.type === 'approval_required') {
            const { id, runId, risk, action } = msg.data;
            setApproval({ id, runId, risk, action });
          }

          if (msg.type === 'step_started') {
            stepStartTimes.current[msg.data.name] = Date.now();
          }

          if (msg.type === 'step_done' || msg.type === 'step_failed') {
            const start = stepStartTimes.current[msg.data.name];
            if (start) {
              msg.duration = Date.now() - start;
              delete stepStartTimes.current[msg.data.name];
            }
          }

          if (['step_started', 'step_done', 'step_failed', 'evidence_added', 'artifact_created', 'text', 'user_input'].includes(msg.type)) {
            setEvents(prev => [...prev, msg]);
          }
        } catch (e) {
          console.error('WS parse error:', e);
        }
      };
    } catch (e) {
      console.error('WS connect failed:', e);
      setIsConnected(false);
    }
  }

  useEffect(() => {
    if (sessionId) {
      loadHistory(sessionId);
    }
  }, [sessionId]);

  async function loadHistory(id: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API}/sessions/${id}/history`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events) && data.events.length > 0) {
          setEvents(data.events);
        } 
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }

  async function run() {
    if (!text.trim()) return;
    
    // Optimistic update
    const tempId = Date.now().toString();
    setEvents(prev => [...prev, { type: 'user_input', data: text, id: tempId }]);
    const currentText = text;
    setText(''); // Clear input immediately

    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/runs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: currentText, sessionId }),
      });
      const data = await res.json();
      if (data.sessionId && !sessionId && onSessionCreated) {
        onSessionCreated(data.sessionId);
      }
      if (sessionId || data.sessionId) {
        await loadHistory(sessionId || data.sessionId);
      }
    } catch (e) {
      console.error(e);
      setEvents(prev => [...prev, { type: 'error', data: 'فشل إرسال الأمر' }]);
      setText(currentText);
    }
  }

  async function plan() {
    const token = localStorage.getItem('token');
    await fetch(`${API}/runs/plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text }),
    });
  }

  async function approve(decision: 'approved' | 'denied') {
    if (!approval) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/approvals/${approval.id}/decision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ decision }),
    });
    setApproval(null);
  }

  const toggleExpand = (index: number) => {
    setEvents(prev => prev.map((e, i) => i === index ? { ...e, expanded: !e.expanded } : e));
  };

  const getToolIcon = (name: string) => {
    if (name.includes('shell') || name.includes('exec')) return <Terminal size={16} />;
    if (name.includes('web') || name.includes('search')) return <Globe size={16} />;
    if (name.includes('file')) return <FileText size={16} />;
    if (name.includes('plan') || name.includes('thinking')) return <Cpu size={16} />;
    return <Cpu size={16} />;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div className="composer">
      <div className="events">
        {events.length === 0 && <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 40 }}>Ready to start. Type a command below.</div>}
        <div className="eventlog">
          {events.map((e, i) => {
            if (typeof e === 'string') return <div key={i} className="event-item">{e}</div>;
            
            // Handle step events
            if (e.type === 'step_started') {
              return (
                <div key={i} className="event-step running">
                  <span className="step-icon spin"><Loader2 size={16} /></span>
                  {getToolIcon(e.data.name)}
                  <strong>{e.data.name}</strong>
                </div>
              );
            }
            if (e.type === 'step_done') {
              const hasDetails = e.data.plan || e.data.result;
              return (
                <div key={i} className={`event-step-wrapper ${e.expanded ? 'expanded' : ''}`}>
                  <div className="event-step done" onClick={() => hasDetails && toggleExpand(i)} style={{ cursor: hasDetails ? 'pointer' : 'default' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                      <span className="step-icon"><CheckCircle2 size={16} /></span>
                      {getToolIcon(e.data.name)}
                      <strong>{e.data.name}</strong>
                    </div>
                    {e.duration && (
                      <div className="step-duration">
                        <Clock size={12} />
                        {formatDuration(e.duration)}
                      </div>
                    )}
                    {hasDetails && (
                      <div className="step-toggle">
                        {e.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    )}
                  </div>
                  {e.expanded && hasDetails && (
                    <div className="step-details">
                      {e.data.plan && (
                        <div className="detail-section">
                          <div className="detail-label">
                            {String(e.data.name).includes('thinking') ? 'التحليل' : (String(e.data.name).includes('plan') ? 'التخطيط' : 'التخطيط')}
                          </div>
                          <pre>{JSON.stringify(e.data.plan.input, null, 2)}</pre>
                        </div>
                      )}
                      {e.data.result && (
                        <div className="detail-section">
                          <div className="detail-label">مخرجات التنفيذ</div>
                          <pre>{JSON.stringify(e.data.result.output || e.data.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            }
            if (e.type === 'step_failed') {
              return (
                <div key={i} className="event-step failed">
                  <span className="step-icon"><XCircle size={16} /></span>
                  <strong>{e.data.name}</strong>
                  {e.data.reason && <span>: {e.data.reason}</span>}
                </div>
              );
            }
            if (e.type === 'evidence_added') {
              if (e.data.kind === 'log') {
                return <div key={i} className="event-log">{e.data.text}</div>;
              }
              return null;
            }
            if (e.type === 'artifact_created') {
              return (
                <div key={i} className="event-artifact">
                  {/\.(png|jpg|jpeg|webp)$/i.test(e.data.name || '') ? (
                    <>
                      <img src={e.data.href} alt={e.data.name} style={{ width: 160, height: 'auto', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                      <div className="artifact-info">
                        <div className="artifact-title">صورة مُولَّدة</div>
                        <div className="artifact-name">{e.data.name}</div>
                      </div>
                      <a href={e.data.href} target="_blank" rel="noopener noreferrer" className="artifact-link">
                        <LinkIcon size={14} /> فتح
                      </a>
                    </>
                  ) : (
                    <>
                      <FileCode size={20} className="artifact-icon" />
                      <div className="artifact-info">
                        <div className="artifact-title">Created Artifact</div>
                        <div className="artifact-name">{e.data.name}</div>
                      </div>
                      <a href={e.data.href} target="_blank" rel="noopener noreferrer" className="artifact-link">
                        <LinkIcon size={14} /> Open
                      </a>
                    </>
                  )}
                </div>
              );
            }

            if (e.type === 'text') {
                let content = e.data;
                try {
                    if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                        const parsed = JSON.parse(content);
                        if (parsed.text) content = parsed.text;
                        else if (parsed.output) content = JSON.stringify(parsed.output, null, 2);
                        else content = JSON.stringify(parsed, null, 2);
                    }
                } catch {}
                return (
                    <div key={i} className="event-item markdown-content" style={{ position: 'relative' }}>
                        <ReactMarkdown
                          components={{
                            code(props) {
                              const {children, className, node, ref, ...rest} = props as any;
                              const match = /language-(\w+)/.exec(className || '');
                              return match ? (
                                <SyntaxHighlighter
                                  {...rest}
                                  PreTag="div"
                                  children={String(children).replace(/\n$/, '')}
                                  language={match[1]}
                                  style={vscDarkPlus}
                                />
                              ) : (
                                <code {...rest} className={className}>
                                  {children}
                                </code>
                              );
                            }
                          }}
                        >
                          {String(content)}
                        </ReactMarkdown>
                        <div 
                          className="copy-icon" 
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(String(content));
                          }}
                          title="Copy to clipboard"
                        >
                          <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                        </div>
                    </div>
                );
            }

            if (e.type === 'user_input') {
                return <div key={i} className="event-item user-input">{e.data}</div>;
            }
            
            if (e.type === 'error') {
                return <div key={i} className="event-item error">{e.data}</div>;
            }

            return null;
          })}
        </div>
      </div>
      
      {approval && (
        <div className="approval-modal">
          <div className="approval-content">
            <h3>Approval Required</h3>
            <div className="risk-badge">{approval.risk || 'Unknown Risk'}</div>
            <p>The agent wants to execute:</p>
            <pre>{approval.action}</pre>
            <div className="approval-actions">
              <button onClick={() => approve('denied')} className="btn deny">Deny</button>
              <button onClick={() => approve('approved')} className="btn approve">Approve</button>
            </div>
          </div>
        </div>
      )}

      <div className="input-area">
        <textarea 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="Describe your task..." 
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              run();
            }
          }}
        />
        <div className="input-actions">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ 
                width: 8, height: 8, 
                borderRadius: '50%', 
                backgroundColor: isConnected ? '#22c55e' : '#ef4444',
                boxShadow: isConnected ? '0 0 4px #22c55e' : 'none'
            }} title={isConnected ? "Connected to Live Updates" : "Disconnected"} />
            <button className="action-btn" onClick={plan}>Plan Only</button>
          </div>
          <button className="btn run-btn" onClick={run} disabled={!text.trim()}>
            RUN
          </button>
        </div>
      </div>
    </div>
  );
}
