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
      {approval && (
        <div className="approval">
          <div>Approval Required — Risk: {approval.risk}</div>
          <div>Action: {approval.action}</div>
          <div className="row">
            <button className="btn btn-yellow" onClick={() => approve('approved')}>Approve</button>
            <button className="btn" onClick={() => approve('denied')}>Deny</button>
          </div>
        </div>
      )}
      <div className="row">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type instruction..." rows={5} />
        <div className="col">
          <button className="btn btn-yellow" onClick={run}>RUN</button>
        </div>
      </div>
      <div className="events">
        <h4>LIVE RUN</h4>
        <div className="eventlog">
          {events.slice(-50).map((e, i) => {
            if (typeof e === 'string') return <pre key={i}>{e}</pre>;
            if (e.type === 'evidence_added' && e.data?.kind === 'artifact' && e.data?.href) {
              const href = e.data.href;
              const url = (API + href).replace(/([^:]\/)\/+/g, '$1');
              return (
                <div key={i} className="artifact">
                  <a href={url} target="_blank" rel="noreferrer">Artifact: {e.data.name}</a>
                </div>
              );
            }
            return <pre key={i}>{JSON.stringify(e, null, 2)}</pre>;
          })}
        </div>
      </div>
    </div>
  );
}
