import CommandComposer from '../components/CommandComposer';
import SessionItem from '../components/SessionItem';
import FileExplorer from '../components/FileExplorer';
import { SocketService } from '../services/socket';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, MessageSquare, Bot, Loader, Activity } from 'lucide-react';

const AgentBrowserStreamLazy = lazy(() => import('../components/AgentBrowserStream'));

function BrowserApp({
  onSession,
  autoOpen,
  minimal,
  initialSession,
  headless,
}: {
  onSession?: (s: { sessionId: string; wsUrl: string }) => void;
  autoOpen?: boolean;
  minimal?: boolean;
  initialSession?: { sessionId: string; wsUrl: string } | null;
  headless?: boolean;
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      const currentSessionId = String(sessionId || '').trim();
      const currentWsUrl = String(wsUrl || '').trim();

      if (currentSessionId && effectiveUrl) {
        const navRes = await fetch(`${API}/tools/browser_run/execute`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            sessionId: currentSessionId,
            actions: [{ type: 'goto', url: effectiveUrl, waitUntil: 'domcontentloaded' }],
          }),
        });
        if (navRes.status === 401) {
          localStorage.removeItem('token');
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          setWsUrl(null);
          setSessionId(null);
          const err = 'غير مصرح';
          setError(err);
          window.dispatchEvent(new CustomEvent('joe:browser_open_failed', { detail: { url: effectiveUrl, error: err } }));
          return;
        }
        const navData = await navRes.json().catch(() => ({} as any));
        if (!navData?.ok) {
          const err = String(navData?.error || 'فشل فتح المتصفح');
          setError(err);
          window.dispatchEvent(new CustomEvent('joe:browser_open_failed', { detail: { url: effectiveUrl, error: err } }));
          return;
        }
        if (currentWsUrl) {
          window.dispatchEvent(new CustomEvent('joe:browser_opened', { detail: { sessionId: currentSessionId, wsUrl: currentWsUrl } }));
          window.dispatchEvent(new CustomEvent('joe:browser_attached', { detail: { sessionId: currentSessionId, wsUrl: currentWsUrl } }));
        }
        return;
      }

      const res = await fetch(`${API}/tools/browser_open/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ url: effectiveUrl }),
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        setWsUrl(null);
        setSessionId(null);
        const err = 'غير مصرح';
        setError(err);
        window.dispatchEvent(new CustomEvent('joe:browser_open_failed', { detail: { url: effectiveUrl, error: err } }));
        return;
      }
      const data = await res.json().catch(() => ({} as any));
      const nextWsUrl = data?.output?.wsUrl || data?.artifacts?.find?.((a: any) => a?.kind === 'browser_stream')?.href;
      if (!data?.ok || !nextWsUrl) {
        setWsUrl(null);
        setSessionId(null);
        const err = String(data?.error || 'فشل فتح المتصفح');
        setError(err);
        window.dispatchEvent(new CustomEvent('joe:browser_open_failed', { detail: { url: effectiveUrl, error: err } }));
        return;
      }
      const sid = String(data?.output?.sessionId || '');
      const wsu = String(nextWsUrl);
      setWsUrl(wsu);
      setSessionId(sid);
      if (sid && wsu) {
        onSession?.({ sessionId: sid, wsUrl: wsu });
        window.dispatchEvent(new CustomEvent('joe:browser_opened', { detail: { sessionId: sid, wsUrl: wsu } }));
        window.dispatchEvent(new CustomEvent('joe:browser_attached', { detail: { sessionId: sid, wsUrl: wsu } }));
      }
    } catch (e: any) {
      setWsUrl(null);
      setSessionId(null);
      const err = String(e?.message || e);
      setError(err);
      const effectiveUrl = (typeof nextUrl === 'string' && nextUrl.trim()) ? nextUrl.trim() : url;
      window.dispatchEvent(new CustomEvent('joe:browser_open_failed', { detail: { url: effectiveUrl, error: err } }));
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
      const wsuRaw = String(detail?.wsUrl || '');
      const wsu = wsuRaw || (sid ? `/browser/ws/${encodeURIComponent(sid)}` : '');
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
        ) : headless ? null : (
          <Suspense fallback={<div style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}><Loader size={18} /> Loading stream...</div>}>
            <AgentBrowserStreamLazy wsUrl={wsUrl!} />
          </Suspense>
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

  const [showEmbeddedPreview, setShowEmbeddedPreview] = useState(true);
  const [previewUrl, setPreviewUrl] = useState(() => {
    try {
      return `${new URL(window.location.href).origin}/`;
    } catch {
      return 'http://localhost:5173/';
    }
  });
  const didDetectPreviewRef = useRef(false);
  // Only enable auto-detect in development (localhost)
  const isProduction = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
  const [autoDetectPreview, setAutoDetectPreview] = useState(!isProduction);
  async function pingUrl(u: string): Promise<boolean> {
    try {
      const head = new URL(u);
      head.pathname = '/';
      head.search = '';
      await fetch(head.toString(), { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
      return true;
    } catch {
      return false;
    }
  }
  useEffect(() => {
    // Skip auto-detection in production
    if (isProduction) return;
    
    async function detect() {
      if (didDetectPreviewRef.current) return;
      didDetectPreviewRef.current = true;
      const bases = [
        'http://localhost:5173/',
        'http://127.0.0.1:5173/',
        'http://localhost:3000/',
        'http://127.0.0.1:3000/',
        'http://localhost:5174/',
        'http://127.0.0.1:5174/',
      ];
      for (const b of bases) {
        try {
          const bo = new URL(b).origin;
          if (bo === window.location.origin) continue;
        } catch {}
        const ok = await pingUrl(b);
        if (ok) {
          setPreviewUrl(b);
          break;
        }
      }
    }
    detect();
  }, [isProduction]);
  useEffect(() => {
    // Skip auto-detection in production
    if (isProduction || !autoDetectPreview) return;
    
    let alive = true;
    const bases = [
      'http://localhost:5173/',
      'http://127.0.0.1:5173/',
      'http://localhost:3000/',
      'http://127.0.0.1:3000/',
      'http://localhost:5174/',
      'http://127.0.0.1:5174/',
    ];
    const tick = async () => {
      for (const b of bases) {
        if (!alive) return;
        try {
          const bo = new URL(b).origin;
          if (bo === window.location.origin) continue;
        } catch {}
        const ok = await pingUrl(b);
        if (ok) {
          if (b !== previewUrl) setPreviewUrl(b);
          break;
        }
      }
    };
    const id = setInterval(tick, 6000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [autoDetectPreview, previewUrl, isProduction]);

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
  const [showFiles, setShowFiles] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  
  // ===== نظام عرض سلسلة التفكير والحوار الداخلي =====
  const [thinkingChain, setThinkingChain] = useState<Array<{
    id: string;
    type: 'thought' | 'decision' | 'action' | 'result' | 'error';
    content: string;
    timestamp: number;
    details?: any;
  }>>([]);
  const [showThinkingPanel, setShowThinkingPanel] = useState(true);
  const thinkingPanelRef = useRef<HTMLDivElement>(null);

  const openedPaymentsRef = useRef<Set<string>>(new Set());
  
  // ===== معالج أحداث سلسلة التفكير =====
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      if (detail.type && detail.content) {
        setThinkingChain(prev => [...prev, {
          id: `thought-${Date.now()}-${Math.random()}`,
          type: detail.type,
          content: detail.content,
          timestamp: Date.now(),
          details: detail.details
        }]);
        // تمرير تلقائي إلى آخر العناصر
        setTimeout(() => {
          thinkingPanelRef.current?.scrollTo({
            top: thinkingPanelRef.current.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      }
    };
    window.addEventListener('joe:thinking_update', handler as any);
    return () => window.removeEventListener('joe:thinking_update', handler as any);
  }, []);

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

  useEffect(() => {
    const update = () => {
      const nodes = Array.from(document.querySelectorAll('.composer-footer')) as HTMLElement[];
      let maxH = 0;
      for (const n of nodes) {
        const rect = n.getBoundingClientRect();
        const h = rect?.height || n.offsetHeight || 0;
        if (h > maxH) maxH = h;
      }
      setComposerHeight(maxH);
    };
    update();
    let ro: ResizeObserver | null = null;
    const nodes = Array.from(document.querySelectorAll('.composer-footer')) as HTMLElement[];
    if (nodes.length && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => update());
      for (const el of nodes) ro.observe(el);
    }
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const nodes = document.querySelectorAll('.composer-footer');
    const el = nodes[nodes.length - 1] as HTMLElement | null;
    setComposerHeight(el?.offsetHeight || 0);
  }, [mode, showSidebar, agentComposerOpen, showFiles, selected]);

  useEffect(() => {}, [isNarrow, composerHeight]);

  useEffect(() => {
    const release = SocketService.subscribe((event: any) => {
      const type = String(event?.type || '');
      if (type === 'artifact_created') {
        const href = String(event?.data?.href || '');
        const name = String(event?.data?.name || '');
        const isStripe = /stripe\.com/i.test(href) || /checkout/i.test(name);
        if (isStripe && href && !openedPaymentsRef.current.has(href)) {
          openedPaymentsRef.current.add(href);
          try { window.open(href, '_blank', 'noopener,noreferrer'); } catch {}
        }
      } else if (type === 'step_done') {
        const name = String(event?.data?.name || '');
        const isPayment = /execute:payments_create_checkout_session/.test(name);
        if (isPayment) {
          const url = String(event?.data?.result?.output?.checkoutUrl || '');
          if (url && !openedPaymentsRef.current.has(url)) {
            openedPaymentsRef.current.add(url);
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch {}
          }
        }
      }
    });
    return () => { release(); };
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      nav('/login');
      return;
    }
    const onUnauthorized = () => nav('/login');
    window.addEventListener('auth:unauthorized', onUnauthorized as any);
    return () => window.removeEventListener('auth:unauthorized', onUnauthorized as any);
  }, []);

  const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);

  async function createSession() {
    setSearchQuery('');
    setSearchResults([]);

    const token = localStorage.getItem('token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }

    setIsCreatingChatSession(true);
    try {
      const res = await fetch(`${API}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'جلسة جديدة' }),
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        return;
      }
      const data = await res.json();
      const id = String(data?.id || data?._id || '').trim();
      if (!id) return;

      setSelected(id);
      await loadAllSessions();
      if (isNarrow) setShowSidebar(false);
    } finally {
      setIsCreatingChatSession(false);
    }
  }

  useEffect(() => { 
    const token = localStorage.getItem('token');
    if (!token) return;
    loadAllSessions();
    loadFolders();
  }, []);

  const sessionsRefreshTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const onRefresh = () => {
      if (sessionsRefreshTimerRef.current != null) {
        window.clearTimeout(sessionsRefreshTimerRef.current);
      }
      sessionsRefreshTimerRef.current = window.setTimeout(() => {
        sessionsRefreshTimerRef.current = null;
        loadAllSessions();
      }, 250);
    };

    window.addEventListener('sessions:refresh', onRefresh as any);
    return () => {
      window.removeEventListener('sessions:refresh', onRefresh as any);
      if (sessionsRefreshTimerRef.current != null) window.clearTimeout(sessionsRefreshTimerRef.current);
      sessionsRefreshTimerRef.current = null;
    };
  }, [loadAllSessions]);

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
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/sessions/${sessionId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folderId }),
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    await loadAllSessions();
  }


  async function mergeSessions(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    if (!confirm('Are you sure you want to merge these sessions? This cannot be undone.')) return;
    
    const token = localStorage.getItem('token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/sessions/merge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ sourceId, targetId }),
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    
    if (res.ok) {
      await loadAllSessions();
      if (selected === sourceId) setSelected(targetId);
    }
  }

  



  async function deleteAllSessions() {
    if (!confirm('هل أنت متأكد من حذف جميع الجلسات؟ لا يمكن التراجع عن هذا الإجراء.')) return;
    const token = localStorage.getItem('token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/sessions`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    await loadAllSessions();
    setSelected(null);
  }

  async function togglePin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    await loadAllSessions();
  }

  async function toggleAgentPin(id: string, currentPinned: boolean) {
    const token = localStorage.getItem('token');
    if (!token) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
    const res = await fetch(`${API}/sessions/${id}/pin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ isPinned: !currentPinned }),
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      return;
    }
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
      if (!token) {
        setIsSearching(false);
        setSearchResults([]);
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        return;
      }
      try {
        const res = await fetch(`${API}/sessions/search?q=${encodeURIComponent(searchQuery)}&kind=chat`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          localStorage.removeItem('token');
          setIsSearching(false);
          setSearchResults([]);
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
          return;
        }
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
      {mode === 'chat' && (
        <aside className={`sidebar ${showSidebar ? 'open' : 'closed'}`} aria-hidden={!showSidebar}>
          <div className="sidebar-header">
            <button className="new-chat-btn" onClick={createSession} disabled={isCreatingChatSession}>
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
                           folders={folders}
                           onMoveToFolder={(folderId) => moveSessionToFolder(s.id, folderId)}
                           showInlineDelete
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
                  folders={folders}
                  onMoveToFolder={(folderId) => moveSessionToFolder(s.id, folderId)}
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
        

        <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', paddingTop: 56 }}>
          <div className="mode-switch mode-switch-floating">
            <div className="mode-fabs">
              <button 
                onClick={() => setMode('agent')}
                className={`mode-fab ${mode === 'agent' ? 'active' : ''}`}
                title="Agent Mode"
              >
                <Bot size={16} />
                <span className="mode-fab-label">الوكيل</span>
              </button>
              <button 
                onClick={() => setMode('chat')}
                className={`mode-fab ${mode === 'chat' ? 'active' : ''}`}
                title="Chat Mode"
              >
                <MessageSquare size={16} />
                <span className="mode-fab-label">المحادثة</span>
              </button>
              <button 
                onClick={() => setShowFiles(v => !v)}
                className={`mode-fab ${showFiles ? 'active' : ''}`}
                title="Files"
              >
                <Folder size={16} />
                <span className="mode-fab-label">الملفات</span>
              </button>
            </div>
          </div>
          
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

            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', background: 'var(--bg-secondary)' }}>
                {showEmbeddedPreview ? (
                  <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 0 }}>
                    <BrowserApp
                      minimal={false}
                      autoOpen={true}
                      onSession={(s) => { 
                 setAgentBrowserSessionId(s.sessionId);
                 setActiveBrowserSession(s);
                 setMode('agent');
               }}
                      initialSession={activeBrowserSession}
                    />
                  </div>
                ) : (
                  <BrowserApp
                    minimal={false}
                    autoOpen={true}
                    onSession={(s) => { setAgentBrowserSessionId(s.sessionId); }}
                    initialSession={activeBrowserSession}
                  />
                )}
              </div>
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
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>الأوامر</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {isNarrow ? (
                    <button
                      onClick={() => setAgentComposerOpen(v => !v)}
                      style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                    >
                      {agentComposerOpen ? 'إخفاء' : 'إظهار'}
                    </button>
                  ) : null}
                </div>
              </div>
              {(!isNarrow || agentComposerOpen) ? (
                <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 12, padding: 12, height: '100%', overflow: 'hidden' }}>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <CommandComposer
                      sessionId={agentSelected || undefined}
                      sessionKind="agent"
                      browserSessionId={agentBrowserSessionId}
                      onSessionCreated={async (id) => {
                          await loadAllSessions();
                          setAgentSelected(id);
                        }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
        {mode === 'chat' && (
        <>
          <div style={{ display: 'none' }}>
            <BrowserApp
               minimal={false}
               autoOpen={false}
               headless={true}
               onSession={(s) => { 
                 setAgentBrowserSessionId(s.sessionId);
                 setActiveBrowserSession(s);
                 setMode('agent');
               }}
               initialSession={activeBrowserSession}
            />
          </div>
          <div className="chat-view" style={{ display: 'flex', gap: 12, height: '100%' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>المحادثة</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 12, padding: 12, height: '100%', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto' }}>
                  {/* ===== عرض سلسلة التفكير في وضع المحادثة ===== */}
                  <CommandComposer
                    key={selected || 'new'}
                    sessionId={selected || undefined}
                    sessionKind="chat"
                    previewBaseUrl={previewUrl}
                    onSessionCreated={async (id) => {
                        await loadAllSessions();
                        setSelected(id);
                      }}
                  />
                </div>
              </div>
            </div>
            {showFiles ? (
              <div style={{ width: 420, minWidth: 320, height: '100%', borderLeft: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                <FileExplorer />
              </div>
            ) : null}
          </div>
        </>
      )}
        </div>
      </main>
    </div>
  );
}
