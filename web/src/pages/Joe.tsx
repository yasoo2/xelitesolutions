import CommandComposer from '../components/CommandComposer';
import RightPanel from '../components/RightPanel';
import { useEffect, useState } from 'react';

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'LIVE' | 'BROWSER' | 'ARTIFACTS'>('LIVE');
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
        <button className="new-chat-btn" onClick={createSession}>
          <span>+</span> New Chat
        </button>
        
        <div className="section-title" style={{ marginTop: 24 }}>Recent Sessions</div>
        <div className="session-list">
          {sessions.map(s => (
            <div key={s.id} className="session-item">
              <button className={selected===s.id?'active':''} onClick={()=>setSelected(s.id)}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
                {s.lastSnippet && <div style={{ opacity: 0.6, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.lastSnippet}</div>}
              </button>
            </div>
          ))}
        </div>
      </aside>
      <main className="center">
        <CommandComposer sessionId={selected || undefined} />
      </main>
      <aside className="rightpanel">
        <div className="tabs">
          <button className={`tab ${tab==='LIVE'?'active':''}`} onClick={()=>setTab('LIVE')}>Live Run</button>
          <button className={`tab ${tab==='BROWSER'?'active':''}`} onClick={()=>setTab('BROWSER')}>Browser</button>
          <button className={`tab ${tab==='ARTIFACTS'?'active':''}`} onClick={()=>setTab('ARTIFACTS')}>Artifacts</button>
          <button className={`tab ${tab==='MEMORY'?'active':''}`} onClick={()=>setTab('MEMORY')}>Memory</button>
        </div>
        <div className="panel-content">
          <RightPanel active={tab} sessionId={selected || undefined} />
        </div>
      </aside>
    </div>
  );
}
