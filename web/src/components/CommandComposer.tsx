import { useEffect, useRef, useState } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const WS = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';

export default function CommandComposer({ sessionId }: { sessionId?: string }) {
  const [text, setText] = useState('');
  const [events, setEvents] = useState<Array<{ type: string; data: any }>>([]);
  const [approval, setApproval] = useState<{ id: string; runId: string; risk: string; action: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
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
    ws.onopen = () => setEvents((prev) => [...prev, { type: 'info', data: 'WS: open' }]);
    ws.onclose = () => setEvents((prev) => [...prev, { type: 'info', data: 'WS: close' }]);
    return () => ws.close();
  }, []);

  async function run() {
    const token = localStorage.getItem('token');
    await fetch(`${API}/runs/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ text, sessionId }),
    });
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="action-btn" onClick={plan}>Plan Only</button>
          </div>
          <button className="btn run-btn" onClick={run}>
            RUN
          </button>
        </div>
      </div>
    </div>
  );
}
