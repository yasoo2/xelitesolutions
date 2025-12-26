import CommandComposer from '../components/CommandComposer';
import SessionItem from '../components/SessionItem';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, MessageSquare, Bot } from 'lucide-react';

const AgentBrowserStreamLazy = lazy(() => import('../components/AgentBrowserStream'));

function BrowserApp({
  onSession,
  autoOpen,
  minimal,
}: {
  onSession?: (s: { sessionId: string; wsUrl: string }) => void;
  autoOpen?: boolean;
  minimal?: boolean;
}) {
  const [url, setUrl] = useState('https://www.google.com');
  const [wsUrl, setWsUrl] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoOpen = useRef(false);

  async function openBrowser(nextUrl?: string) {
    setIsOpening(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const effectiveUrl = (typeof nextUrl === 'string' && nextUrl.trim()) ? nextUrl.trim() : url;
      const res = await fetch(`${API}/tools/browser_open/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: effectiveUrl }),
      });
      const data = await res.json();
      const nextWsUrl = data?.output?.wsUrl || data?.artifacts?.find?.((a: any) => a?.kind === 'browser_stream')?.href;
      if (!data?.ok || !nextWsUrl) {
        setWsUrl(null);
        setError(String(data?.error || 'فشل فتح المتصفح'));
        return;
      }
      const sid = String(data?.output?.sessionId || '');
      const wsu = String(nextWsUrl);
      setWsUrl(wsu);
      if (sid && wsu) {
        onSession?.({ sessionId: sid, wsUrl: wsu });
        window.dispatchEvent(new CustomEvent('joe:browser_opened', { detail: { sessionId: sid, wsUrl: wsu } }));
      }
    } catch (e: any) {
      setWsUrl(null);
      setError(String(e?.message || e));
    } finally {
      setIsOpening(false);
    }
  }

  useEffect(() => {
    if (!autoOpen) return;
    if (didAutoOpen.current) return;
    didAutoOpen.current = true;
    openBrowser();
  }, [autoOpen]);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const nextUrl = typeof detail?.url === 'string' ? detail.url : undefined;
      if (typeof nextUrl === 'string' && nextUrl.trim()) setUrl(nextUrl.trim());
      openBrowser(nextUrl);
    };
    window.addEventListener('joe:browser_open_request', handler as any);
    return () => window.removeEventListener('joe:browser_open_request', handler as any);
  }, []);

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const sid = String(detail?.sessionId || '');
      const wsu = String(detail?.wsUrl || '');
      if (sid && wsu) {
        setWsUrl(wsu);
        onSession?.({ sessionId: sid, wsUrl: wsu });
      }
    };
    window.addEventListener('joe:browser_attached', handler as any);
    return () => window.removeEventListener('joe:browser_attached', handler as any);
  }, []);

  return (
    <div className="browser-app" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {!wsUrl ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, color: 'var(--text-secondary)' }} dir="auto">
            <div style={{ textAlign: 'center' }}>
              {error ? <div style={{ color: '#ef4444', marginBottom: 10 }}>{error}</div> : null}
              <div>
                {isOpening ? '...جاري فتح المتصفح' : 'سيتم فتح المتصفح تلقائياً عند الحاجة.'}
              </div>
            </div>
          </div>
        ) : (
          <Suspense fallback={<div style={{ padding: 12, color: 'var(--text-secondary)' }}>Loading Stream...</div>}>
            <AgentBrowserStreamLazy wsUrl={wsUrl} minimal={minimal} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default function Joe() {
  const [sessions, setSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string; isPinned?: boolean; folderId?: string; terminalState?: string }>>([]);
  const [agentSessions, setAgentSessions] = useState<Array<{ id: string; title: string; lastSnippet?: string; isPinned?: boolean }>>([]);
  const [folders, setFolders] = useState<Array<{ _id: string; name: string }>>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [agentSelected, setAgentSelected] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mode, setMode] = useState<'agent' | 'chat'>('agent');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [isNarrow, setIsNarrow] = useState(false);
  const [agentBrowserSessionId, setAgentBrowserSessionId] = useState<string | null>(null);

  const nav = useNavigate();

  function createSession() {
    setSelected(null);
    setSearchQuery('');
    setSearchResults([]);
  }

  async function loadSessions() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/sessions?kind=chat`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
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

  async function loadAgentSessions() {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API}/sessions?kind=agent`, { headers: { Authorization: token ? `Bearer ${token}` : '' } });
      if (res.status === 401) {
        localStorage.removeItem('token');
        nav('/login');
        return;
      }
      const data = await res.json();
      const mapped = (data.sessions || []).map((s: any) => ({ ...s, id: s.id || s._id }));
      setAgentSessions(mapped);
      if (!agentSelected && mapped[0]) setAgentSelected(mapped[0].id);
    } catch (e) {
      console.error('Failed to load agent sessions', e);
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
    loadAgentSessions();
    loadFolders();
  }, []);

  useEffect(() => {
    if (mode === 'agent') {
      setShowSidebar(false);
      if (agentSessions.length === 0) loadAgentSessions();
    } else {
      setShowSidebar(!isNarrow);
      if (sessions.length === 0) loadSessions();
    }
  }, [mode]);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 900px)');
    const apply = () => {
      setIsNarrow(mql.matches);
      setShowSidebar(!mql.matches);
    };
    apply();
    const onChange = () => apply();
    if (typeof mql.addEventListener === 'function') mql.addEventListener('change', onChange);
    else (mql as any).addListener?.(onChange);
    return () => {
      if (typeof mql.removeEventListener === 'function') mql.removeEventListener('change', onChange);
      else (mql as any).removeListener?.(onChange);
    };
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

  async function deleteAgentSession(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه الجلسة؟')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await loadAgentSessions();
    if (agentSelected === id) setAgentSelected(null);
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

  async function toggleAgentPin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    await loadAgentSessions();
  }

  function shareSession(id: string) {
    alert('تم نسخ رابط الجلسة');
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
        const res = await fetch(`${API}/sessions/search?q=${encodeURIComponent(searchQuery)}&kind=chat`, {
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
      {mode === 'chat' && showSidebar && isNarrow && <div className="sidebar-backdrop" onClick={() => setShowSidebar(false)} />}
      {mode === 'chat' && showSidebar && (
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
                           onSelect={() => {
                             setSelected(s.id);
                             if (isNarrow) setShowSidebar(false);
                           }}
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
                  onSelect={() => {
                    setSelected(s.id);
                    if (isNarrow) setShowSidebar(false);
                  }}
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
                       if (isNarrow) setShowSidebar(false);
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
      {mode === 'chat' && !showSidebar && (
        <button className="sidebar-toggle-btn" style={{ position: 'absolute', left: 16, top: 16 }} onClick={() => setShowSidebar(true)}>
          <PanelLeftOpen size={20} />
        </button>
      )}

      <main className="center" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div className="joe-modebar" style={{ 
          height: 48, 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0 16px',
          gap: 8,
          background: 'var(--bg-secondary)',
          flexShrink: 0,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          whiteSpace: 'nowrap',
        }}>
           <button 
             onClick={() => setMode('agent')}
             style={{ 
               background: 'none', 
               border: 'none', 
               color: mode === 'agent' ? 'var(--accent-primary)' : 'var(--text-secondary)',
               fontWeight: mode === 'agent' ? 600 : 400,
               cursor: 'pointer',
               display: 'flex', alignItems: 'center', gap: 6,
               padding: '6px 12px',
               borderRadius: 6,
               backgroundColor: mode === 'agent' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
             }}
           >
             <Bot size={16} /> الوكيل
           </button>
           <button 
             onClick={() => setMode('chat')}
             style={{ 
               background: 'none', 
               border: 'none', 
               color: mode === 'chat' ? 'var(--accent-primary)' : 'var(--text-secondary)',
               fontWeight: mode === 'chat' ? 600 : 400,
               cursor: 'pointer',
               display: 'flex', alignItems: 'center', gap: 6,
               padding: '6px 12px',
               borderRadius: 6,
               backgroundColor: mode === 'chat' ? 'rgba(37, 99, 235, 0.1)' : 'transparent'
             }}
           >
             <MessageSquare size={16} /> Chat
           </button>
        </div>
        
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {mode === 'agent' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: isNarrow ? 'column' : 'row' }}>
            <div
              style={{
                width: isNarrow ? '100%' : 280,
                flex: '0 0 auto',
                minHeight: isNarrow ? 180 : 0,
                overflow: 'hidden',
                borderRight: isNarrow ? undefined : '1px solid var(--border-color)',
                borderBottom: isNarrow ? '1px solid var(--border-color)' : undefined,
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>جلسات الوكيل</div>
                <button
                  onClick={() => setAgentSelected(null)}
                  style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                >
                  جلسة جديدة
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
                {agentSessions.length === 0 ? (
                  <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>لا توجد جلسات بعد</div>
                ) : (
                  agentSessions.map((s) => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      isActive={agentSelected === s.id}
                      onSelect={() => setAgentSelected(s.id)}
                      onDelete={() => deleteAgentSession(s.id)}
                      onPin={() => toggleAgentPin(s.id, !!s.isPinned)}
                      onShare={() => shareSession(s.id)}
                    />
                  ))
                )}
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              <BrowserApp minimal={true} autoOpen={false} onSession={(s) => { setAgentBrowserSessionId(s.sessionId); }} />
            </div>

            <div
              style={{
                width: isNarrow ? '100%' : 420,
                flex: '0 0 auto',
                minHeight: isNarrow ? 340 : 0,
                overflow: 'hidden',
                borderLeft: isNarrow ? undefined : '1px solid var(--border-color)',
                borderTop: isNarrow ? '1px solid var(--border-color)' : undefined,
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
              }}
            >
              <CommandComposer
                sessionId={agentSelected || undefined}
                sessionKind="agent"
                browserSessionId={agentBrowserSessionId}
                onSessionCreated={async (id) => {
                  await loadAgentSessions();
                  setAgentSelected(id);
                }}
              />
            </div>
          </div>
        )}
        {mode === 'chat' && (
          <CommandComposer
            sessionId={selected || undefined}
            sessionKind="chat"
            onSessionCreated={async (id) => {
              await loadSessions();
              setSelected(id);
            }}
          />
        )}
        </div>
      </main>
    </div>
  );
}
