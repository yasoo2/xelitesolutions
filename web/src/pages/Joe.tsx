import { createPortal } from 'react-dom';
import CommandComposer from '../components/CommandComposer';
import SessionItem from '../components/SessionItem';
import EliteFileExplorer from '../components/EliteFileExplorer';
import { SocketService } from '../services/socket';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API, getBrowserChromeEnabled } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, MessageSquare, Bot, Loader, Activity, Brain, Package, GitBranch, Camera, Wand2, Database, Play, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ModernBrowserStreamLazy = lazy(() => import('../components/ModernBrowserStream'));
const AgentCentralPanelLazy = lazy(() => import('../components/AgentCentralPanel'));

const PackageManagerLazy = lazy(() => import('../components/PackageManager'));
const GitPanelLazy = lazy(() => import('../components/GitPanel'));
const SocialPanelLazy = lazy(() => import('../components/SocialPanel'));
const ArtStudioLazy = lazy(() => import('../components/ArtStudio'));
const DatabasePanelLazy = lazy(() => import('../components/DatabasePanel'));
const ActionsPanelLazy = lazy(() => import('../components/ActionsPanel'));

import { useSessionStore } from '../store/sessionStore';
import { useSessionActions } from '../hooks/useSessionActions';
import BrowserChrome from '../components/BrowserChrome';
import BrowserControlPanel from '../components/BrowserControlPanel';
import TaskQueue from '../components/TaskQueue';
import { useTaskQueue } from '../hooks/useTaskQueue';
import BrainStatus from '../components/BrainStatus';
const MemoryPanelLazy = lazy(() => import('../components/MemoryPanel'));

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

  const {
    tasks: queuedTasks,
    removeTask,
    startTask
  } = useTaskQueue(selected || agentSelected || undefined);

  const { t } = useTranslation();

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
        } catch { }
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
        } catch { }
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
  const [agentSidebarOpen, setAgentSidebarOpen] = useState(true);
  const [agentComposerOpen, setAgentComposerOpen] = useState(false);
  const [agentBrowserSessionId, setAgentBrowserSessionId] = useState<string | null>(null);
  const [activeBrowserSession, setActiveBrowserSession] = useState<{ sessionId: string; wsUrl: string } | null>(null);

  useEffect(() => {
    const unsub = SocketService.subscribe((msg: any) => {
      if (msg.type === 'tool_start' && msg.tool === 'run_command') {
        setAgentCentralTab('terminal');
      }
      if (msg.type === 'terminal_output') {
        setAgentCentralTab('terminal');
      }
      if (msg.type === 'tool_start' && (
        msg.tool.startsWith('browser_') ||
        msg.tool === 'open_page' ||
        msg.tool === 'click_element' ||
        msg.tool === 'type_text' ||
        msg.tool === 'scroll' ||
        msg.tool === 'press_key'
      )) {
        setAgentCentralTab('browser');
      }
      if (msg.type === 'browser_screenshot' || msg.type === 'browser_update') {
        setAgentCentralTab('browser');
      }
    });
    return () => { unsub(); };
  }, []);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showFiles, setShowFiles] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [controlOpen, setControlOpen] = useState(false);

  const [agentCentralTab, setAgentCentralTab] = useState<'browser' | 'terminal'>('terminal');
  const [showPackages, setShowPackages] = useState(false);
  const [showGit, setShowGit] = useState(false);
  const [showSocial, setShowSocial] = useState(false);
  const [showArt, setShowArt] = useState(false);
  const [showDB, setShowDB] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const featureChrome = getBrowserChromeEnabled();

  const makeBrowserSessionId = useCallback(
    (kind: 'agent' | 'chat') => {
      const base = kind === 'agent' ? String(agentSelected || '').trim() : String(selected || '').trim();
      if (base) return base;
      return `browser:${kind}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    },
    [agentSelected, selected],
  );

  useEffect(() => {
    if (mode !== 'agent') return;
    if (agentBrowserSessionId && agentBrowserSessionId.trim()) return;
    setAgentBrowserSessionId(makeBrowserSessionId('agent'));
  }, [mode, agentBrowserSessionId, makeBrowserSessionId]);

  useEffect(() => {
    if (mode !== 'agent') return;
    const base = String(agentSelected || '').trim();
    if (!base) return;
    const desired = base;
    if (agentBrowserSessionId === desired) return;
    setAgentBrowserSessionId(desired);
  }, [mode, agentSelected, agentBrowserSessionId]);

  const agentBrowserSessionRef = useRef<string>('');
  useEffect(() => {
    agentBrowserSessionRef.current = String(agentBrowserSessionId || '').trim();
  }, [agentBrowserSessionId]);

  useEffect(() => {
    return () => {
      const sid = String(agentBrowserSessionRef.current || '').trim();
      if (!sid) return;
      const token = (() => {
        try {
          return localStorage.getItem('token');
        } catch {
          return null;
        }
      })();
      try {
        void fetch(`${API}/browser/stop`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId: sid }),
          keepalive: true,
        });
      } catch { }
    };
  }, [API]);

  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail || {};
      const rawUrl = typeof detail?.url === 'string' ? detail.url : '';
      const url = rawUrl.trim();
      if (!url) return;

      const sid =
        mode === 'agent'
          ? String(agentBrowserSessionId || '').trim() || makeBrowserSessionId('agent')
          : String(activeBrowserSession?.sessionId || '').trim() || makeBrowserSessionId('chat');

      if (mode === 'agent') {
        if (agentBrowserSessionId !== sid) setAgentBrowserSessionId(sid);
      } else {
        setActiveBrowserSession({ sessionId: sid, wsUrl: '' });
      }

      try {
        (window as any).__joeBrowserSession = { sessionId: sid };
      } catch { }

      const token = localStorage.getItem('token');
      try {
        await fetch(`${API}/tools/browser_open/execute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId: sid, url }),
        });
      } catch { }
    };

    window.addEventListener('joe:browser_open_request', handler as any);
    return () => window.removeEventListener('joe:browser_open_request', handler as any);
  }, [API, mode, agentBrowserSessionId, activeBrowserSession?.sessionId, makeBrowserSessionId]);

  const [rightPanelTab, setRightPanelTab] = useState<'files'>('files');
  const [agentPanelTab, setAgentPanelTab] = useState<'commands'>('commands');
  const [liveSteps, setLiveSteps] = useState<any[]>([]);
  const stepStatusByKeyRef = useRef<Map<string, string>>(new Map());
  const openedPaymentsRef = useRef<Set<string>>(new Set());

  const activeSessionKey = mode === 'chat' ? (selected || '') : (agentSelected || '');
  useEffect(() => {
    setLiveSteps([]);
    stepStatusByKeyRef.current = new Map();
  }, [activeSessionKey, mode]);

  const formatStepLabel = useCallback((step: any) => {
    const name = String(step?.name || '');
    if (!name) return '';
    if (name.startsWith('execute:')) {
      const tool = name.slice('execute:'.length).trim();
      const toolLabel = t(`tools.${tool}`, tool);
      return t('executePrefix', { tool: toolLabel });
    }
    return name;
  }, [t]);

  const handleStepsUpdate = useCallback((steps: any[]) => {
    setLiveSteps(Array.isArray(steps) ? steps : []);
    if (!Array.isArray(steps) || steps.length === 0) return;

    for (const s of steps) {
      const name = String(s?.name || '');
      if (!name || name === 'plan' || name.startsWith('thinking_step_')) continue;
      const status = String(s?.status || '');
      const key = String(s?.key || `${String(s?.runId || '')}::${name}`);
      const prev = stepStatusByKeyRef.current.get(key);
      if (prev === status) continue;
      stepStatusByKeyRef.current.set(key, status);

      const label = formatStepLabel(s);
      if (!label) continue;

      if (status === 'running') {
        if (name.includes('shell_') || name.includes('run_command') || name.includes('terminal')) {
          setAgentCentralTab('terminal');
        } else if (name.includes('browser_') || name.includes('screenshot') || name.includes('read_url')) {
          setAgentCentralTab('browser');
        }
      }
    }
  }, [formatStepLabel, setAgentCentralTab]);

  const nav = useNavigate();

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

  useEffect(() => {
    const release = SocketService.subscribe((event: any) => {
      const type = String(event?.type || '');
      if (type === 'artifact_created') {
        const href = String(event?.data?.href || '');
        const name = String(event?.data?.name || '');
        const isStripe = /stripe\.com/i.test(href) || /checkout/i.test(name);
        if (isStripe && href && !openedPaymentsRef.current.has(href)) {
          openedPaymentsRef.current.add(href);
          try { window.open(href, '_blank', 'noopener,noreferrer'); } catch { }
        }
      } else if (type === 'step_done') {
        const name = String(event?.data?.name || '');
        const isPayment = /execute:payments_create_checkout_session/.test(name);
        if (isPayment) {
          const url = String(event?.data?.result?.output?.checkoutUrl || '');
          if (url && !openedPaymentsRef.current.has(url)) {
            openedPaymentsRef.current.add(url);
            try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { }
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

  const {
    createSession,
    isCreatingChatSession,
    moveSessionToFolder,
    mergeSessions,
    deleteAllSessions,
    togglePin
  } = useSessionActions();

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
      if (agentSessions.length === 0) loadAllSessions();
    } else {
      if (sessions.length === 0) loadAllSessions();
    }
  }, [mode]);

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      setIsNarrow(mql.matches);
      if (mql.matches) setShowSidebar(false);
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
    const name = prompt(t('sidebar.newFolderPrompt', 'New Folder Name:'));
    if (!name) return;
    await createFolderAction(name);
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
        <aside className={`sidebar ${showSidebar ? 'open' : 'closed'} glass-panel`} aria-hidden={!showSidebar}>
          <div className="sidebar-header">
            <button
              className="action-icon-btn sidebar-toggle-docked"
              onClick={() => setShowSidebar(false)}
              title={t('sidebar.close', 'Close Sidebar')}
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                color: 'var(--text-secondary)'
              }}
            >
              <PanelLeftOpen size={18} />
            </button>
            <button className="new-chat-btn premium-btn" onClick={() => createSession()} disabled={isCreatingChatSession}>
              <Plus size={16} /> {t('sidebar.newChat', 'New Chat')}
            </button>
          </div>

          <div className="search-box-container">
            <div className="search-input-wrapper">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder={t('sidebar.searchPlaceholder', 'Search chats...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>

          <BrainStatus />

          {!searchQuery ? (
            <>
              <div className="section-header-container">
                <div className="section-title">{t('sidebar.folders', 'Folders')}</div>
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
                          <div className="empty-folder-msg">{t('sidebar.emptyFolder', 'Empty folder')}</div>
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
                  <div className="section-title">{t('sidebar.otherSessions', 'Other Sessions')}</div>
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
                  {t('sidebar.noResults', 'No results')}
                </div>
              ) : (
                searchResults.map(r => (
                  <button
                    key={r.messageId}
                    className="search-result-item"
                    onClick={() => {
                      setSelected(r.sessionId);
                      setSearchQuery('');
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
              <Trash2 size={16} /> {t('sidebar.deleteAll', 'Delete all sessions')}
            </button>
          </div>
        </aside>
      )}

      {!showSidebar && createPortal(
        <button
          className="sidebar-toggle-btn-floating"
          style={{
            position: 'fixed',
            top: '100px',
            insetInlineStart: '20px',
            zIndex: 2147483647,
            display: 'flex',
            width: '44px',
            height: '44px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px',
            cursor: 'pointer',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
            transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)'
          }}
          onClick={() => setShowSidebar(true)}
          title={t('sidebar.open', 'Open Sidebar')}
        >
          <PanelLeftOpen size={20} />
        </button>,
        document.body
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
                onClick={() => setShowFiles(v => {
                  const next = !v;
                  if (next) setRightPanelTab('files');
                  return next;
                })}
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
                  width: isNarrow ? '100%' : agentSidebarOpen ? 280 : 44,
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
                <div
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isNarrow ? 'space-between' : agentSidebarOpen ? 'space-between' : 'center',
                    gap: 8,
                  }}
                >
                  {isNarrow || agentSidebarOpen ? (
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>مستكشف النظام</div>
                  ) : null}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => {
                        if (isNarrow) setAgentSessionsOpen((v) => !v);
                        else setAgentSidebarOpen((v) => !v);
                      }}
                      style={{
                        width: 30,
                        height: 28,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 10,
                        border: '1px solid var(--border-color)',
                        background: 'rgba(255,255,255,0.03)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                      }}
                      title={isNarrow ? (agentSessionsOpen ? 'إخفاء' : 'إظهار') : agentSidebarOpen ? 'إخفاء' : 'إظهار'}
                      aria-label={isNarrow ? (agentSessionsOpen ? 'إخفاء' : 'إظهار') : agentSidebarOpen ? 'إخفاء' : 'إظهار'}
                    >
                      {isNarrow ? (agentSessionsOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />) : agentSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
                    </button>
                  </div>
                </div>
                {(isNarrow ? agentSessionsOpen : agentSidebarOpen) ? (
                  <div style={{ flex: 1, overflow: 'auto', padding: 6 }}>
                    <EliteFileExplorer />
                  </div>
                ) : null}
              </div>

              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {featureChrome && agentBrowserSessionId ? (
                  <BrowserChrome
                    sessionId={agentBrowserSessionId}
                    onToggleControl={() => setControlOpen(true)}
                    onToggleBoxes={() => setShowBoxes((v) => !v)}
                    showBoxes={showBoxes}
                  />
                ) : null}
                {featureChrome ? (
                  <BrowserControlPanel
                    sessionId={String(agentSelected || '').trim()}
                    open={controlOpen}
                    onClose={() => setControlOpen(false)}
                    showBoxes={showBoxes}
                    onToggleBoxes={() => setShowBoxes((v) => !v)}
                  />
                ) : null}
                <div className="agent-central-panel" style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative', background: 'var(--bg-secondary)' }}>
                  <Suspense fallback={<div className="flex h-full items-center justify-center text-slate-400"><Loader size={24} className="animate-spin" /></div>}>
                    <AgentCentralPanelLazy
                      sessionId={agentSelected || undefined}
                      browserSessionId={agentBrowserSessionId}
                      showBoxes={showBoxes}
                      activeTab={agentCentralTab}
                      onTabChange={setAgentCentralTab}
                    />
                  </Suspense>
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
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => setAgentPanelTab('commands')}
                      style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: agentPanelTab === 'commands' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      الأوامر
                    </button>
                  </div>
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
                        onStepsUpdate={handleStepsUpdate}
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
            <div className="chat-view" style={{ display: 'flex', gap: 12, height: '100%' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', background: 'var(--bg-secondary)' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>المحادثة</div>
                </div>
                <div style={{ display: 'flex', flexDirection: isNarrow ? 'column' : 'row', gap: 12, padding: 12, height: '100%', overflow: 'hidden' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto' }}>
                    <CommandComposer
                      sessionId={selected || undefined}
                      onSessionCreated={async (id) => {
                        await loadAllSessions();
                        setSelected(id);
                      }}
                    />
                  </div>
                </div>
              </div>
              {showFiles && (
                <div className="joe-right-panel" style={{ width: isNarrow ? '100%' : 420, minWidth: isNarrow ? undefined : 320, height: '100%', borderLeft: isNarrow ? undefined : '1px solid var(--border-color)', borderTop: isNarrow ? '1px solid var(--border-color)' : undefined, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                  <div className="joe-right-panel-header" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => setRightPanelTab('files')}
                        style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: rightPanelTab === 'files' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Folder size={14} /> {t('tools.file_read', 'Files')}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        onClick={() => setShowFiles(false)}
                        style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                      >
                        {t('close', 'Hide')}
                      </button>
                    </div>
                  </div>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    {rightPanelTab === 'files' && (
                      <div style={{ height: '100%', overflow: 'auto' }}>
                        <EliteFileExplorer />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <TaskQueue
        tasks={queuedTasks}
        onRemove={removeTask}
        onExecute={startTask}
      />

      {showPackages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f1117] w-full max-w-4xl h-[80vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowPackages(false)}
              className="absolute right-4 top-4 p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors z-10"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <PackageManagerLazy />
            </Suspense>
          </div>
        </div>
      )}

      {showGit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0f1117] w-full max-w-2xl h-[70vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowGit(false)}
              className="absolute right-4 top-4 p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors z-10"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <GitPanelLazy />
            </Suspense>
          </div>
        </div>
      )}

      {showSocial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-black w-full max-w-md h-[80vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowSocial(false)}
              className="absolute right-4 top-4 p-2 hover:bg-black/50 rounded-full text-white hover:text-white transition-colors z-20"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <SocialPanelLazy />
            </Suspense>
          </div>
        </div>
      )}

      {showArt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#1a0b2e] w-full max-w-5xl h-[90vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowArt(false)}
              className="absolute right-4 top-4 p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors z-10"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <ArtStudioLazy />
            </Suspense>
          </div>
        </div>
      )}

      {showDB && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0a0f1c] w-full max-w-5xl h-[85vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowDB(false)}
              className="absolute right-4 top-4 p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors z-10"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <DatabasePanelLazy />
            </Suspense>
          </div>
        </div>
      )}

      {showActions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0d1117] w-full max-w-3xl h-[60vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden relative">
            <button
              onClick={() => setShowActions(false)}
              className="absolute right-4 top-4 p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors z-10"
            >
              <PanelLeftClose size={20} />
            </button>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-white/30" /></div>}>
              <ActionsPanelLazy />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
