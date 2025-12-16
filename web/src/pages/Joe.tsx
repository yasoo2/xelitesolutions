import CommandComposer from '../components/CommandComposer';
import { useEffect, useState } from 'react';

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  async function loadSessions() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/sessions`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
    const data = await res.json();
    setSessions(data.sessions || []);
    if (!selected && data.sessions?.[0]) setSelected(data.sessions[0].id);
  }
  async function createSession() {
    const token = localStorage.getItem('token');
    const title = `جلسة ${new Date().toLocaleString()}`;
    const res = await fetch(`${API}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ title, mode: 'ADVISOR' }),
    });
    if (res.ok) {
      await loadSessions();
    }
  }

  useEffect(() => { loadSessions(); }, []);

  return (
    <div className="joe-layout">
      <aside className="sidebar">
        <div className="section">Sessions</div>
        <button className="btn" onClick={createSession}>+ New Chat</button>
        <div>
          {sessions.map(s => (
            <div key={s.id} className="session-item">
              <button className={`btn ${selected===s.id?'btn-yellow':''}`} onClick={()=>setSelected(s.id)}>{s.title}</button>
            </div>
          ))}
        </div>
        <input placeholder="Search chats…" />
      </aside>
      <main className="center">
        <CommandComposer sessionId={selected || undefined} />
      </main>
      <aside className="rightpanel">
        <div className="tabs">
          <button className="tab active">LIVE RUN</button>
          <button className="tab">BROWSER LIVE</button>
          <button className="tab">ARTIFACTS</button>
          <button className="tab">MEMORY</button>
          <button className="tab">COSTS</button>
          <button className="tab">OBSERVABILITY</button>
        </div>
      </aside>
    </div>
  );
}
