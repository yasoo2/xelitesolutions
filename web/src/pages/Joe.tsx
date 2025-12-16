import CommandComposer from '../components/CommandComposer';
import RightPanel from '../components/RightPanel';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY'>('LIVE');
  const nav = useNavigate();

  async function loadSessions() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/sessions`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (res.status === 401) {
        localStorage.removeItem('token');
        nav('/login');
        return;
      }
      const data = await res.json();
      setSessions(data.sessions || []);
      if (!selected && data.sessions?.[0]) setSelected(data.sessions[0].id);
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
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

  async function mergeSessions(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    if (!confirm('Are you sure you want to merge these sessions? This cannot be undone.')) return;
    
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/sessions/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ sourceId, targetId }),
    });
    
    if (res.ok) {
      await loadSessions();
      if (selected === sourceId) setSelected(targetId);
    }
  }

  return (
    <div className="joe-layout">
      <aside className="sidebar">
        <button className="new-chat-btn" onClick={createSession}>
          <span>+</span> New Chat
        </button>
        
        <div className="section-title" style={{ marginTop: 24 }}>Recent Sessions</div>
        <div className="session-list">
          {sessions.map(s => (
            <div 
              key={s.id} 
              className="session-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('sessionId', s.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault(); // Allow drop
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const sourceId = e.dataTransfer.getData('sessionId');
                if (sourceId && sourceId !== s.id) {
                   mergeSessions(sourceId, s.id);
                }
              }}
            >
              <button className={selected===s.id?'active':''} onClick={()=>setSelected(s.id)}>
                <div style={{ fontWeight: 500, marginBottom: 2 }}>{s.title}</div>
                {s.lastSnippet && <div style={{ opacity: 0.6, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.lastSnippet}</div>}
              </button>
            </div>
          ))}
        </div>
      </aside>
      <main className="center">
        <CommandComposer 
          sessionId={selected || undefined} 
          onSessionCreated={async (id) => {
            await loadSessions();
            setSelected(id);
          }}
        />
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
