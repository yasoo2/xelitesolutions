import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
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
  Link as LinkIcon
} from 'lucide-react';

export default function CommandComposer({ sessionId, onSessionCreated }: { sessionId?: string; onSessionCreated?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<Array<{ type: string; data: any }>>([]);
  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    connectWS();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  function connectWS() {
    // if (!sessionId) return; // Allow connecting without session
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
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/sessions/${id}/messages`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json();
    if (data.messages) {
      const history = data.messages.map((m: any) => {
        const mid = m._id || m.id;
        seenIdsRef.current.add(mid);
        if (m.role === 'user') return { type: 'user_input', data: m.content, id: mid };
        if (m.role === 'assistant') return { type: 'text', data: m.content, id: mid };
        return { type: 'info', data: m.content, id: mid };
      });
      setEvents(history);
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
      // Fallback: reload messages to reflect assistant reply even if WS disconnected
      if (sessionId || data.sessionId) {
        await loadHistory(sessionId || data.sessionId);
      }
    } catch (e) {
      console.error(e);
      // Revert on failure? Or show error
      setEvents(prev => [...prev, { type: 'error', data: 'Failed to send command' }]);
      setText(currentText); // Restore text
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

  const getToolIcon = (name: string) => {
    if (name.includes('shell') || name.includes('exec')) return <Terminal size={16} />;
    if (name.includes('web') || name.includes('search')) return <Globe size={16} />;
    if (name.includes('file')) return <FileText size={16} />;
    if (name.includes('plan') || name.includes('thinking')) return <Cpu size={16} />;
    return <Cpu size={16} />;
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
              return (
                <div key={i} className="event-step done">
                  <span className="step-icon"><CheckCircle2 size={16} /></span>
                  {getToolIcon(e.data.name)}
                  <strong>{e.data.name}</strong>
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
                  <FileCode size={20} className="artifact-icon" />
                  <div className="artifact-info">
                    <div className="artifact-title">Created Artifact</div>
                    <div className="artifact-name">{e.data.name}</div>
                  </div>
                  <a href={e.data.href} target="_blank" rel="noopener noreferrer" className="artifact-link">
                    <LinkIcon size={14} /> Open
                  </a>
                </div>
              );
            }

            // Handle text events specifically to parse JSON content and avoid ugly escaping
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
                        <ReactMarkdown>{String(content)}</ReactMarkdown>
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