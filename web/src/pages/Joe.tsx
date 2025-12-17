import CommandComposer from '../components/CommandComposer';
import RightPanel from '../components/RightPanel';
import SessionItem from '../components/SessionItem';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2 } from 'lucide-react';

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string; isPinned?: boolean }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'LIVE' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'QA'>('LIVE');
  const [showSidebar, setShowSidebar] = useState(true);
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

  async function deleteSession(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه الجلسة؟')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await loadSessions();
    if (selected === id) setSelected(null);
  }

  async function deleteAllSessions() {
    if (!confirm('هل أنت متأكد من حذف جميع الجلسات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await loadSessions();
    setSelected(null);
  }

  async function togglePin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    await loadSessions();
  }

  function shareSession(id: string) {
    alert('تم نسخ رابط الجلسة');
  }

  return (
    <div className={`joe-layout ${showSidebar ? 'sidebar-open' : 'sidebar-closed'}`}>
      {showSidebar && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <button className="new-chat-btn" onClick={createSession}>
              <span>+</span> محادثة جديدة
            </button>
            <button className="close-sidebar-btn" onClick={() => setShowSidebar(false)}>
              <PanelLeftClose size={20} />
            </button>
          </div>
          
          <div className="section-title" style={{ marginTop: 24 }}>الجلسات الأخيرة</div>
          <div className="session-list">
            {sessions.map(s => (
              <div 
                key={s.id} 
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('sessionId', s.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
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
                <SessionItem 
                  session={s}
                  isActive={selected === s.id}
                  onSelect={() => setSelected(s.id)}
                  onDelete={() => deleteSession(s.id)}
                  onPin={() => togglePin(s.id, !!s.isPinned)}
                  onShare={() => shareSession(s.id)}
                />
              </div>
            ))}
          </div>

          <div className="sidebar-footer">
            <button className="delete-all-btn" onClick={deleteAllSessions}>
              <Trash2 size={16} /> حذف جميع الجلسات
            </button>
          </div>
        </aside>
      )}
      {!showSidebar && (
        <button className="open-sidebar-btn" onClick={() => setShowSidebar(true)}>
          <PanelLeftOpen size={24} />
        </button>
      )}

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
          <button className={`tab ${tab==='LIVE'?'active':''}`} onClick={()=>setTab('LIVE')}>مباشر</button>
          <button className={`tab ${tab==='BROWSER'?'active':''}`} onClick={()=>setTab('BROWSER')}>متصفح</button>
          <button className={`tab ${tab==='ARTIFACTS'?'active':''}`} onClick={()=>setTab('ARTIFACTS')}>ملفات</button>
          <button className={`tab ${tab==='MEMORY'?'active':''}`} onClick={()=>setTab('MEMORY')}>ذاكرة</button>
          <button className={`tab ${tab==='QA'?'active':''}`} onClick={()=>setTab('QA')}>أسئلة</button>
        </div>
        <RightPanel active={tab} sessionId={selected || undefined} />
      </aside>
    </div>
  );
}
