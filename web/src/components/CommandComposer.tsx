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
  Clock,
  Image as ImageIcon,
  Video as VideoIcon
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
  const endRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new events
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events]);

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);


  function connectWS() {
    try {
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
      // Fallback for non-streaming response
      if (!isConnected && data?.result) {
         const r = data.result;
         if (r?.output) {
             const txt = typeof r.output === 'string' ? r.output : JSON.stringify(r.output);
             setEvents(prev => [...prev, { type: 'text', data: txt }]);
         }
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
    if (name.includes('shell') || name.includes('exec')) return <Terminal size={14} />;
    if (name.includes('web') || name.includes('search')) return <Globe size={14} />;
    if (name.includes('file')) return <FileText size={14} />;
    if (name.includes('plan') || name.includes('thinking')) return <Cpu size={14} />;
    return <Cpu size={14} />;
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const isThinking = isConnected && events.length > 0 && 
    (events[events.length - 1].type === 'user_input' || 
     events[events.length - 1].type === 'step_started');

  return (
    <div className="composer">
      <div className="events">
        {events.length === 0 && (
          <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 80, fontSize: 18, color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👋</div>
            مرحباً! أنا جو، مساعدك الذكي.<br/>كيف يمكنني مساعدتك اليوم؟
          </div>
        )}
        
        {events.map((e, i) => {
          // USER INPUT
          if (e.type === 'user_input') {
            return (
              <div key={i} className="message-row user">
                <div className="message-bubble" dir="auto">
                  {e.data}
                </div>
              </div>
            );
          }
          
          // JOE TEXT RESPONSE
          if (e.type === 'text') {
            let content = e.data;
            try {
              if (typeof content === 'string' && (content.startsWith('{') || content.startsWith('['))) {
                 const p = JSON.parse(content);
                 content = p.text || p.output || content;
              }
            } catch {}
            
            return (
              <div key={i} className="message-row joe">
                <div className="message-bubble markdown-content" dir="auto">
                  <ReactMarkdown
                    components={{
                      code(props) {
                        const {children, className, ...rest} = props as any;
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
                  
                  {/* Copy Button */}
                  <div 
                    className="copy-icon" 
                    onClick={() => navigator.clipboard.writeText(String(content))}
                    title="نسخ النص"
                  >
                    <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
                  </div>
                </div>
              </div>
            );
          }

          // STEPS (Thinking)
          if (e.type === 'step_started') {
            return (
              <div key={i} className="message-row joe" style={{ marginBottom: 4 }}>
                <div className="event-step running">
                  <span className="step-icon spin"><Loader2 size={14} /></span>
                  {getToolIcon(e.data.name)}
                  <strong>{e.data.name}</strong>
                  <span style={{ opacity: 0.5, fontSize: 11, marginLeft: 'auto' }}>جاري العمل...</span>
                </div>
              </div>
            );
          }

          if (e.type === 'step_done') {
            const hasDetails = e.data.plan || e.data.result;
            return (
              <div key={i} className="message-row joe" style={{ marginBottom: 4 }}>
                <div className={`steps-container`}>
                  <div 
                    className={`event-step done`} 
                    onClick={() => hasDetails && toggleExpand(i)}
                    style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                  >
                    <span className="step-icon"><CheckCircle2 size={14} color="#22c55e" /></span>
                    {getToolIcon(e.data.name)}
                    <strong style={{ marginRight: 8 }}>{e.data.name}</strong>
                    
                    {e.duration && (
                      <span className="step-duration">
                        {formatDuration(e.duration)}
                      </span>
                    )}
                    
                    {hasDetails && (
                      <div className="step-toggle" style={{ marginLeft: 'auto' }}>
                        {e.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>
                    )}
                  </div>
                  
                  {e.expanded && hasDetails && (
                    <div className="step-details">
                      {e.data.plan && (
                        <div className="detail-section">
                          <div className="detail-label">المدخلات</div>
                          <pre>{JSON.stringify(e.data.plan.input, null, 2)}</pre>
                        </div>
                      )}
                      {e.data.result && (
                        <div className="detail-section">
                          <div className="detail-label">المخرجات</div>
                          <pre>{typeof (e.data.result.output || e.data.result) === 'string' ? (e.data.result.output || e.data.result) : JSON.stringify(e.data.result.output || e.data.result, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (e.type === 'step_failed') {
            return (
              <div key={i} className="message-row joe">
                <div className="event-step failed">
                  <span className="step-icon"><XCircle size={14} color="#ef4444" /></span>
                  <strong>{e.data.name}</strong>
                  <span style={{ marginLeft: 8 }}>: {e.data.reason}</span>
                </div>
              </div>
            );
          }

          // ARTIFACTS
          if (e.type === 'artifact_created') {
            const isImage = /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.name || '') || /\.(png|jpg|jpeg|webp|gif)$/i.test(e.data.href || '');
            const isVideo = /\.(mp4|webm|mov)$/i.test(e.data.name || '') || /\.(mp4|webm|mov)$/i.test(e.data.href || '');
            
            return (
              <div key={i} className="message-row joe">
                <div className="event-artifact">
                  {isImage ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <ImageIcon size={16} className="artifact-icon" />
                        <div className="artifact-title">صورة</div>
                      </div>
                      <img src={e.data.href} alt={e.data.name} style={{ display: 'block' }} />
                    </>
                  ) : isVideo ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <VideoIcon size={16} className="artifact-icon" />
                        <div className="artifact-title">فيديو</div>
                      </div>
                      <video controls src={e.data.href} style={{ width: '100%', borderRadius: 8 }} />
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <FileCode size={20} className="artifact-icon" />
                        <div className="artifact-info">
                          <div className="artifact-title">ملف</div>
                          <div className="artifact-name">{e.data.name}</div>
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                    <a href={e.data.href} target="_blank" rel="noopener noreferrer" className="artifact-link">
                      <LinkIcon size={12} /> فتح في نافذة جديدة
                    </a>
                  </div>
                </div>
              </div>
            );
          }

          if (e.type === 'error') {
            return (
               <div key={i} className="message-row joe">
                 <div className="message-bubble" style={{ border: '1px solid #ef4444', background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                   ⚠️ {e.data}
                 </div>
               </div>
            );
          }

          return null;
        })}

        {/* Thinking Indicator */}
        {isThinking && (
          <div className="message-row joe">
             <div className="typing-indicator">
               <div className="typing-dot"></div>
               <div className="typing-dot"></div>
               <div className="typing-dot"></div>
             </div>
          </div>
        )}
        
        <div ref={endRef} />
      </div>
      
      {approval && (
        <div className="approval-modal">
          <div className="approval-content">
            <h3>موافقة مطلوبة</h3>
            <div className="risk-badge">{approval.risk}</div>
            <p>الإجراء: {approval.action}</p>
            <div className="approval-actions">
              <button onClick={() => approve('denied')} className="btn deny">رفض</button>
              <button onClick={() => approve('approved')} className="btn approve">موافقة</button>
            </div>
          </div>
        </div>
      )}

      <div className="input-area">
        <textarea 
          value={text} 
          onChange={(e) => setText(e.target.value)} 
          placeholder="أدخل أمرك هنا..." 
          dir="auto"
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
                boxShadow: isConnected ? '0 0 6px #22c55e' : 'none',
                transition: 'all 0.3s'
            }} title={isConnected ? "متصل" : "غير متصل"} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {isConnected ? 'متصل' : 'جاري الاتصال...'}
            </span>
          </div>
          <button className="run-btn" onClick={run} disabled={!text.trim()}>
            إرسال
          </button>
        </div>
      </div>
    </div>
  );
}
