import { useEffect, useRef, useState } from 'react';
import { API_URL as API, WS_URL as WS } from '../config';

export default function CommandComposer({ sessionId, onSessionCreated }: { sessionId?: string; onSessionCreated?: (id: string) => void }) {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<Array<{ type: string; data: any }>>([]);
  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);

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

  function connectWS() {
    if (!sessionId) return;
    try {
      console.log('Connecting to WS:', WS);
      const ws = new WebSocket(WS);
      wsRef.current = ws;
  
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data.toString());
          setEvents((prev) => [...prev, msg]);
          if (msg.type === 'approval_required') {
            setApproval({ id: msg.data.id, runId: msg.data.runId, risk: msg.data.risk, action: msg.data.action });
          }
          if (msg.type === 'approval_result') {
            setApproval(null);
          }
        } catch {
          setEvents((prev) => [...prev, { type: 'text', data: ev.data.toString() }]);
        }
      };
  
      ws.onopen = () => {
        setIsConnected(true);
      };
  
      ws.onclose = () => {
        setIsConnected(false);
        // Attempt reconnect after 2s
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          if (sessionId) connectWS();
        }, 2000);
      };
  
      ws.onerror = (err) => {
        console.error('WS Error:', err);
        setIsConnected(false);
        try { ws.close(); } catch {}
      };
    } catch (e) {
      console.error('WS connect failed:', e);
      setIsConnected(false);
    }
  }

  useEffect(() => {
    if (!sessionId) {
      setEvents([]);
      return;
    }

    loadHistory(sessionId).catch(err => console.error('Failed to load history:', err));
    connectWS();
    return () => {
        try { wsRef.current?.close(); } catch {}
        setIsConnected(false);
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
    };
  }, [sessionId]);

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
  }

  return (
    <div className="composer">
      <div className="events">
        {events.length === 0 && <div style={{ opacity: 0.5, textAlign: 'center', marginTop: 40 }}>Ready to start. Type a command below.</div>}
        <div className="eventlog">
          {events.map((e, i) => {
            if (typeof e === 'string') return <div key={i} className="event-item">{e}</div>;
            
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
                return <div key={i} className="event-item" style={{ whiteSpace: 'pre-wrap' }}>{String(content)}</div>;
            }

            if (e.type === 'evidence_added' && e.data?.kind === 'artifact' && e.data?.href) {
              const href = e.data.href;
              const url = (API + href).replace(/([^:]\/)\/+/g, '$1');
              return (
                <div key={i} className="event-item" style={{ borderColor: 'var(--accent-secondary)' }}>
                  <div className="artifact-link">
                    <span>📦 Artifact Created:</span>
                    <a href={url} target="_blank" rel="noreferrer">{e.data.name}</a>
                  </div>
                </div>
              );
            }
            if (e.type === 'user_input') {
              return <div key={i} className="event-item user">{e.data}</div>;
            }
            // Simplify other events
            return <div key={i} className="event-item">
              <span style={{ opacity: 0.5, marginRight: 8 }}>[{e.type}]</span>
              {JSON.stringify(e.data || e)}
            </div>;
          })}
        </div>
      </div>

      {approval && (
        <div className="approval card" style={{ borderColor: 'var(--accent-primary)', background: 'rgba(234, 179, 8, 0.1)' }}>
          <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)', marginBottom: 8 }}>⚠️ Approval Required</div>
          <div style={{ marginBottom: 4 }}>Risk: {approval.risk}</div>
          <div style={{ marginBottom: 12 }}>Action: {approval.action}</div>
          <div className="row" style={{ gap: 12 }}>
            <button className="btn btn-yellow" onClick={() => approve('approved')}>Approve</button>
            <button className="btn" style={{ background: '#ef4444', border: 'none', color: 'white' }} onClick={() => approve('denied')}>Deny</button>
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
          <button className="btn run-btn" onClick={run} disabled={!isConnected && !sessionId}>
            RUN
          </button>
        </div>
      </div>
    </div>
  );
}
