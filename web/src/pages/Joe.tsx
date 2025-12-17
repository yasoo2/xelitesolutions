import CommandComposer from '../components/CommandComposer';
import RightPanel from '../components/RightPanel';
import SessionItem from '../components/SessionItem';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, ChevronLeft } from 'lucide-react';

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string; isPinned?: boolean; folderId?: string }>>([]);
  const [folders, setFolders] = useState<Array<{ _id: string; name: string }>>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [tab, setTab] = useState<'PREVIEW' | 'BROWSER' | 'ARTIFACTS' | 'MEMORY' | 'STEPS'>('PREVIEW');
  const [steps, setSteps] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [previewData, setPreviewData] = useState<{ content: string; language: string; } | null>(null);

  const nav = useNavigate();

  function createSession() {
    setSelected(null);
    setSearchQuery('');
    setSearchResults([]);
  }

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
      const mapped = (data.sessions || []).map((s: any) => ({ ...s, id: s.id || s._id }));
      setSessions(mapped);
      if (!selected && mapped[0]) setSelected(mapped[0].id);
    } catch (e) {
      console.error('Failed to load sessions', e);
    }
  }

  async function loadFolders() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/folders`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (res.ok) {
        const data = await res.json();
        setFolders(data);
      }
    } catch (e) {
      console.error('Failed to load folders', e);
    }
  }

  useEffect(() => { 
    loadSessions(); 
    loadFolders();
  }, []);

  async function createFolder() {
    const name = prompt('اسم المجلد الجديد:');
    if (!name) return;
    const token = localStorage.getItem('token');
    const res = await fetch(`${API}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      await loadFolders();
    }
  }

  async function deleteFolder(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذا المجلد؟ سيتم نقل الجلسات إلى القائمة الرئيسية.')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/folders/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await loadFolders();
    await loadSessions(); // Refresh sessions as they might have moved
  }

  async function moveSessionToFolder(sessionId: string, folderId: string | null) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${sessionId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ folderId }),
    });
    await loadSessions();
  }


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

  function handlePreviewArtifact(content: string, language: string) {
    setPreviewData({ content, language });
    setTab('PREVIEW');
  }

  useEffect(() => {
    if (!searchQuery) {
      setIsSearching(false);
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const token = localStorage.getItem('token');
      try {
        const res = await fetch(`${API}/sessions/search?q=${encodeURIComponent(searchQuery)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch (e) {
        console.error(e);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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
          
          <div className="search-box-container" style={{ padding: '0 4px', marginBottom: 16 }}>
            <div className="search-input-wrapper">
               <Search size={14} className="search-icon" />
               <input 
                 type="text" 
                 placeholder="بحث في المحادثات..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 className="search-input"
               />
            </div>
          </div>

          {!searchQuery ? (
          <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px', marginBottom: 8 }}>
            <div className="section-title" style={{ margin: 0 }}>المجلدات</div>
            <button 
              onClick={createFolder}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              title="مجلد جديد"
            >
              <FolderPlus size={16} />
            </button>
          </div>

          <div className="session-list">
            {folders.map(folder => (
              <div 
                key={folder._id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,215,0,0.1)';
                }}
                onDragLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                  const sessionId = e.dataTransfer.getData('sessionId');
                  if (sessionId) moveSessionToFolder(sessionId, folder._id);
                }}
              >
                <div 
                  className="folder-header" 
                  style={{ display: 'flex', alignItems: 'center', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  onClick={() => setExpandedFolders(p => ({ ...p, [folder._id]: !p[folder._id] }))}
                >
                  {expandedFolders[folder._id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={14} style={{ margin: '0 8px', color: 'var(--accent-primary)' }} />
                  <span style={{ fontSize: 13, flex: 1 }}>{folder.name}</span>
                  <button 
                     onClick={(e) => { e.stopPropagation(); deleteFolder(folder._id); }}
                     style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.5 }}
                     className="folder-delete-btn"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                {expandedFolders[folder._id] && (
                  <div style={{ paddingRight: 16 }}>
                    {sessions.filter(s => s.folderId === folder._id).map(s => (
                       <div 
                         key={s.id}
                         draggable
                         onDragStart={(e) => {
                           e.dataTransfer.setData('sessionId', s.id);
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
                    {sessions.filter(s => s.folderId === folder._id).length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 8px 8px' }}>مجلد فارغ</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div 
              className="section-title" 
              style={{ marginTop: 16 }}
              onDragOver={(e) => {
                 e.preventDefault();
                 e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                 e.preventDefault();
                 const sessionId = e.dataTransfer.getData('sessionId');
                 if (sessionId) moveSessionToFolder(sessionId, null);
              }}
            >
              جلسات أخرى
            </div>
            {sessions.filter(s => !s.folderId).map(s => (
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
                     // Check if source session has no folder, otherwise move it here
                     // But we also support merge. Let's prioritize folder move if dropped on a folder, merge if dropped on session
                     // Actually, if we drop on session, it's merge. If we drop on "Other Sessions" header, it's move to root.
                     // But here we are dropping on a session item.
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
          </>
          ) : (
            <div className="session-list">
               {searchResults.length === 0 ? (
                 <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                   لا توجد نتائج
                 </div>
               ) : (
                 searchResults.map(r => (
                   <button 
                     key={r.messageId} 
                     className="search-result-item"
                     onClick={() => {
                       setSelected(r.sessionId);
                       setSearchQuery(''); // Clear search on select
                     }}
                   >
                     <div className="result-session-title">{r.sessionTitle}</div>
                     <div className="result-content">{r.content}</div>
                     <div className="result-date">{new Date(r.createdAt).toLocaleDateString()}</div>
                   </button>
                 ))
               )}
            </div>
          )}

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
          onPreviewArtifact={handlePreviewArtifact}
          onStepsUpdate={(newSteps) => {
            setSteps(newSteps);
            // Auto-switch to STEPS tab if a new step starts and panel is open
            if (newSteps.length > 0 && newSteps[newSteps.length - 1].type === 'step_started' && showRightPanel && tab !== 'STEPS') {
               // Optional: Auto-switch? Maybe not, might be annoying. Let's just update the state.
               // User asked for "Transparency", so maybe auto-switch is good?
               // Let's stick to updating state for now.
            }
          }}
        />
      </main>
      
      {showRightPanel && (
        <aside className="rightpanel">
          <div className="tabs">
            <button className={`tab ${tab==='STEPS'?'active':''}`} onClick={()=>setTab('STEPS')}>المعالج</button>
            <button className={`tab ${tab==='PREVIEW'?'active':''}`} onClick={()=>setTab('PREVIEW')}>معاينة</button>
            <button className={`tab ${tab==='BROWSER'?'active':''}`} onClick={()=>setTab('BROWSER')}>متصفح</button>
            <button className={`tab ${tab==='ARTIFACTS'?'active':''}`} onClick={()=>setTab('ARTIFACTS')}>ملفات</button>
            <button className={`tab ${tab==='MEMORY'?'active':''}`} onClick={()=>setTab('MEMORY')}>ذاكرة</button>
            <button className="tab-icon" onClick={() => setShowRightPanel(false)} title="إخفاء اللوحة">
              <ChevronRight size={16} />
            </button>
          </div>
          <RightPanel active={tab} sessionId={selected || undefined} previewData={previewData} steps={steps} />
        </aside>
      )}
      {!showRightPanel && (
        <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
          <button 
            className="btn-icon" 
            onClick={() => setShowRightPanel(true)}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', padding: 8, borderRadius: 4, cursor: 'pointer' }}
            title="إظهار اللوحة"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
      )}
    </div>
  );
}
