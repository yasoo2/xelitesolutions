import CommandComposer from '../components/CommandComposer';
import SessionItem from '../components/SessionItem';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, MessageSquare, Bot, Loader } from 'lucide-react';
import BrowserView from '../components/BrowserView';

// const AgentBrowserStreamLazy = lazy(() => import('../components/AgentBrowserStream'));

function BrowserApp({
  onSession,
  autoOpen,
  minimal,
  initialSession,
}: {
  onSession?: (s: { sessionId: string; wsUrl: string }) => void;
  autoOpen?: boolean;
  minimal?: boolean;
  initialSession?: { sessionId: string; wsUrl: string } | null;
}) {
  const [url, setUrl] = useState('https://www.google.com');
  const [wsUrl, setWsUrl] = useState<string | null>(initialSession?.wsUrl || null);
  const [sessionId, setSessionId] = useState<string | null>(initialSession?.sessionId || null);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const didAutoOpen = useRef(false);

  useEffect(() => {
    if (initialSession?.wsUrl) {
      setWsUrl(initialSession.wsUrl);
      setSessionId(initialSession.sessionId);
    }
  }, [initialSession]);

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
        setSessionId(null);
        setError(String(data?.error || 'فشل فتح المتصفح'));
        return;
      }
      const sid = String(data?.output?.sessionId || '');
      const wsu = String(nextWsUrl);
      setWsUrl(wsu);
      setSessionId(sid);
      if (sid && wsu) {
        onSession?.({ sessionId: sid, wsUrl: wsu });
        window.dispatchEvent(new CustomEvent('joe:browser_opened', { detail: { sessionId: sid, wsUrl: wsu } }));
      }
    } catch (e: any) {
      setWsUrl(null);
      setSessionId(null);
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
        setSessionId(sid);
        onSession?.({ sessionId: sid, wsUrl: wsu });
      }
    };
    window.addEventListener('joe:browser_attached', handler as any);
    return () => window.removeEventListener('joe:browser_attached', handler as any);
  }, []);

  return (
    <div className="browser-app" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        {!sessionId ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, color: 'var(--text-secondary)' }} dir="auto">
            <div style={{ textAlign: 'center' }}>
              {error ? <div style={{ color: '#ef4444', marginBottom: 10 }}>{error}</div> : null}
              <div>
                {isOpening ? '...جاري فتح المتصفح' : 'سيتم فتح المتصفح تلقائياً عند الحاجة.'}
              </div>
            </div>
          </div>
        ) : (
          <BrowserView sessionId={sessionId} wsUrl={wsUrl} />
        )}
      </div>
    </div>
  );
}

import { useSessionStore } from '../store/sessionStore';

export default function Joe() {
  const {
    sessions,
    agentSessions,
    folders,
    selected,
    agentSelected,
    loadingStates,
    loadAllSessions,
    loadFolders,
    createFolder: createFolderAction,
    deleteFolder,
    deleteSession,
    setSelected,
    setAgentSelected,
  } = useSessionStore();

  const [showSidebar, setShowSidebar] = useState(true);
  const [mode, setMode] = useState<'agent' | 'chat'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [isNarrow, setIsNarrow] = useState(false);
  const [agentSessionsOpen, setAgentSessionsOpen] = useState(false);
  const [agentComposerOpen, setAgentComposerOpen] = useState(false);
  const [agentBrowserSessionId, setAgentBrowserSessionId] = useState<string | null>(null);
  const [activeBrowserSession, setActiveBrowserSession] = useState<{ sessionId: string; wsUrl: string } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const nav = useNavigate();

  useEffect(() => {
    const handler = (ev: Event) => {
       const detail = (ev as CustomEvent)?.detail || {};
       if (detail.sessionId && detail.wsUrl) {
          setActiveBrowserSession({ sessionId: detail.sessionId, wsUrl: detail.wsUrl });
          setAgentBrowserSessionId(detail.sessionId);
          setMode('agent');
       }
    };
    window.addEventListener('joe:browser_attached', handler as any);
    return () => window.removeEventListener('joe:browser_attached', handler as any);
  }, []);

  function createSession() {
    setSelected(null);
    setSearchQuery('');
    setSearchResults([]);
  }

  useEffect(() => { 
    loadAllSessions(); 
    loadFolders();
  }, []);

  useEffect(() => {
    if (mode === 'agent') {
      setShowSidebar(false);
      if (agentSessions.length === 0) loadAllSessions();
    } else {
      setShowSidebar(!isNarrow);
      if (sessions.length === 0) loadAllSessions();
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

  useEffect(() => {
    if (!isNarrow) return;
    setAgentSessionsOpen(false);
    setAgentComposerOpen(false);
  }, [isNarrow]);

  async function createFolder() {
    const name = prompt('اسم المجلد الجديد:');
    if (!name) return;
    await createFolderAction(name);
  }

  async function moveSessionToFolder(sessionId: string, folderId: string | null) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${sessionId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ folderId }),
    });
    await loadAllSessions();
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
      await loadAllSessions();
      if (selected === sourceId) setSelected(targetId);
    }
  }

  



  async function deleteAllSessions() {
    if (!confirm('هل أنت متأكد من حذف جميع الجلسات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions`, {
      method: 'DELETE',
      headers: { Authorization: token ? `Bearer ${token}` : '' },
    });
    await loadAllSessions();
    setSelected(null);
  }

  async function togglePin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    await loadAllSessions();
  }

  async function toggleAgentPin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    await loadAllSessions();
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
          
          <div className="search-box-container">
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
          <div className="section-header-container">
            <div className="section-title">المجلدات</div>
            <button 
              onClick={createFolder}
              className="action-icon-btn"
              title="مجلد جديد"
              disabled={loadingStates.creatingFolder}
            >
              {loadingStates.creatingFolder ? 'جاري...' : <FolderPlus size={16} />}
            </button>
          </div>

          <div className="session-list">
            {folders.map(folder => (
              <div 
                key={folder._id}
                className="folder-container"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  (e.currentTarget as HTMLElement).style.background = 'var(--accent-glow)';
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
                  onClick={() => setExpandedFolders(p => ({ ...p, [folder._id]: !p[folder._id] }))}
                >
                  {expandedFolders[folder._id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Folder size={16} className="folder-icon" />
                  <span className="folder-name">{folder.name}</span>
                  <button 
                     onClick={(e) => { e.stopPropagation(); if (confirm('هل أنت متأكد من حذف هذا المجلد؟')) deleteFolder(folder._id); }}
                     className="action-icon-btn folder-delete-btn"
                     title="حذف المجلد"
                     disabled={loadingStates[`deleting-folder-${folder._id}`]}
                  >
                    {loadingStates[`deleting-folder-${folder._id}`] ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
                {expandedFolders[folder._id] && (
                  <div className="folder-content">
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
                           isLoading={loadingStates[`deleting-session-${s.id}`]}
                           onSelect={() => {
                             setSelected(s.id);
                             setSearchQuery('');
                             if (isNarrow) setShowSidebar(false);
                           }}
                           onDelete={() => {
                             if (!confirm('هل أنت متأكد من حذف هذه الجلسة؟')) return;
                             deleteSession(s.id);
                             if (selected === s.id) setSelected(null);
                           }}
                           onPin={() => togglePin(s.id, !!s.isPinned)}
                           onShare={() => shareSession(s.id)}
                         />
                       </div>
                    ))}
                    {sessions.filter(s => s.folderId === folder._id).length === 0 && (
                      <div className="empty-folder-msg">مجلد فارغ</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div 
              className="section-header-container"
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
              <div className="section-title">جلسات أخرى</div>
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
                  onDelete={() => {
                    if (!confirm('هل أنت متأكد من حذف هذه الجلسة؟')) return;
                    deleteSession(s.id);
                    if (selected === s.id) setSelected(null);
                  }}
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
        

        <div className="mode-switch">
          <div className="segmented">
            <button 
              onClick={() => setMode('agent')}
              className={`seg-btn ${mode === 'agent' ? 'active' : ''}`}
              title="Agent Mode"
            >
              <Bot size={18} /> الوكيل
            </button>
            <button 
              onClick={() => setMode('chat')}
              className={`seg-btn ${mode === 'chat' ? 'active' : ''}`}
              title="Chat Mode"
            >
              <MessageSquare size={18} /> المحادثة
            </button>
          </div>
        </div>
        
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {mode === 'agent' && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: isNarrow ? 'column' : 'row' }}>
            <div
              style={{
                width: isNarrow ? '100%' : 280,
                flex: isNarrow ? `0 0 ${agentSessionsOpen ? '35%' : '44px'}` : '0 0 auto',
                height: isNarrow && !agentSessionsOpen ? 44 : undefined,
                minHeight: 0,
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
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isNarrow ? (
                    <button
                      onClick={() => setAgentSessionsOpen(v => !v)}
                      style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                    >
                      {agentSessionsOpen ? 'إخفاء' : 'إظهار'}
                    </button>
                  ) : null}
                  <button
                    onClick={() => setAgentSelected(null)}
                    style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                  >
                    جلسة جديدة
                  </button>
                </div>
              </div>
              {(!isNarrow || agentSessionsOpen) ? (
                <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
                  {agentSessions.length === 0 ? (
                    <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 13 }}>لا توجد جلسات بعد</div>
                  ) : (
                    agentSessions.map((s) => (
                      <SessionItem
                        key={s.id}
                        session={s}
                        isActive={agentSelected === s.id}
                        onSelect={() => {
                          setAgentSelected(s.id);
                          if (isNarrow) setAgentSessionsOpen(false);
                        }}
                        onDelete={() => {
                          if (!confirm('هل أنت متأكد من حذف هذه الجلسة؟')) return;
                          deleteSession(s.id);
                          if (agentSelected === s.id) setAgentSelected(null);
                        }}
                        onPin={() => toggleAgentPin(s.id, !!s.isPinned)}
                        onShare={() => shareSession(s.id)}
                      />
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              <BrowserApp 
                minimal={true} 
                autoOpen={true} 
                onSession={(s) => { setAgentBrowserSessionId(s.sessionId); }} 
                initialSession={activeBrowserSession}
              />
            </div>

            <div
              style={{
                width: isNarrow ? '100%' : 420,
                flex: isNarrow ? `0 0 ${agentComposerOpen ? '45%' : '44px'}` : '0 0 auto',
                height: isNarrow ? (agentComposerOpen ? undefined : 44) : '100%',
                minHeight: 0,
                overflow: 'hidden',
                borderLeft: isNarrow ? undefined : '1px solid var(--border-color)',
                borderTop: isNarrow ? '1px solid var(--border-color)' : undefined,
                background: 'var(--bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {isNarrow ? (
                <div style={{ padding: '10px 12px', borderBottom: agentComposerOpen ? '1px solid var(--border-color)' : undefined, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>الأوامر</div>
                  <button
                    onClick={() => setAgentComposerOpen(v => !v)}
                    style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                  >
                    {agentComposerOpen ? 'إخفاء' : 'إظهار'}
                  </button>
                </div>
              ) : null}
              {(!isNarrow || agentComposerOpen) ? (
                <CommandComposer
                  sessionId={agentSelected || undefined}
                  sessionKind="agent"
                  browserSessionId={agentBrowserSessionId}
                  onSessionCreated={async (id) => {
                      await loadAllSessions();
                      setAgentSelected(id);
                    }}
                />
              ) : null}
            </div>
          </div>
        )}
        {mode === 'chat' && (
          <div className="chat-view">
            {!selected ? (
              <div className="welcome-view">
                <div className="welcome-logo-wrapper">
                  <div className="welcome-logo">J</div>
                </div>
                <div className="welcome-title">JOE AI</div>
                <div className="welcome-subtitle">
                  ابدأ محادثة جديدة أو اختر واحدة من القائمة للبدء.
                </div>
              </div>
            ) : (
              <CommandComposer
                key={selected}
                sessionId={selected}
                sessionKind="chat"
                onSessionCreated={async (id) => {
                    await loadAllSessions();
                    setSelected(id);
                  }}
              />
            )}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
