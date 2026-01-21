import CommandComposer from '../components/CommandComposer';
import SessionItem from '../components/SessionItem';
import FileExplorer from '../components/FileExplorer';
import { SocketService } from '../services/socket';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL as API, getBrowserChromeEnabled } from '../config';
import { PanelLeftClose, PanelLeftOpen, Trash2, Search, FolderPlus, Folder, ChevronRight, ChevronDown, MessageSquare, Bot, Loader, Activity, Brain, Terminal as TerminalIcon, Package, GitBranch, Camera, Wand2, Database, Play, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ModernBrowserStreamLazy = lazy(() => import('../components/ModernBrowserStream'));
const AgentCentralPanelLazy = lazy(() => import('../components/AgentCentralPanel'));
const EnterpriseTerminalPanelLazy = lazy(() => import('../components/terminal/EnterpriseTerminalPanel'));
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

  const [showSidebar, setShowSidebar] = useState(() => window.innerWidth >= 1024);
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
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [showFiles, setShowFiles] = useState(false);
  const [composerHeight, setComposerHeight] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [controlOpen, setControlOpen] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [agentCentralTab, setAgentCentralTab] = useState<'browser' | 'terminal' | 'logs' | 'flow'>('browser');
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
        void fetch(`${API}/api/browser/stop`, {
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

  // ===== نظام عرض سلسلة التفكير والحوار الداخلي =====
  const [thinkingChain, setThinkingChain] = useState<Array<{
    id: string;
    type: 'thought' | 'decision' | 'action' | 'result' | 'error';
    content: string;
    timestamp: number;
    details?: any;
  }>>([]);

  // Mobile Optimization: Default closed on small screens
  const isMobileInitial = window.innerWidth < 1024;
  const [showThinkingPanel, setShowThinkingPanel] = useState(!isMobileInitial);
  const [rightPanelTab, setRightPanelTab] = useState<'thinking' | 'files' | 'memory'>('thinking');
  const [agentPanelTab, setAgentPanelTab] = useState<'commands' | 'thinking'>('commands');
  const [liveSteps, setLiveSteps] = useState<any[]>([]);
  const thinkingPanelRef = useRef<HTMLDivElement>(null);
  const stepStatusByKeyRef = useRef<Map<string, string>>(new Map());

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

  const activeSessionKey = mode === 'chat' ? (selected || '') : (agentSelected || '');
  useEffect(() => {
    setThinkingChain([]);
    setLiveSteps([]);
    stepStatusByKeyRef.current = new Map();
  }, [activeSessionKey, mode]);

  useEffect(() => {
    if (rightPanelTab === 'thinking' && !showThinkingPanel) {
      if (showFiles) setRightPanelTab('files');
      else setRightPanelTab('memory');
    }
    if (rightPanelTab === 'files' && !showFiles && showThinkingPanel) setRightPanelTab('thinking');
  }, [rightPanelTab, showFiles, showThinkingPanel]);

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

    const additions: Array<{
      id: string;
      type: 'thought' | 'decision' | 'action' | 'result' | 'error';
      content: string;
      timestamp: number;
      details?: any;
    }> = [];

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

      const base = {
        id: `think-${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        details: { step: s },
      };

      if (status === 'running') {
        additions.push({ ...base, type: 'action', content: label });

        // Auto-switch tabs based on the running tool
        if (name.includes('shell_execute')) {
          setAgentCentralTab('terminal');
        } else if (name.startsWith('browser_')) {
          setAgentCentralTab('browser');
        }
      } else if (status === 'done') {
        additions.push({ ...base, type: 'result', content: label });
      } else if (status === 'failed') {
        const err = typeof s?.error === 'string' ? s.error : typeof s?.result?.error === 'string' ? s.result.error : '';
        additions.push({ ...base, type: 'error', content: err ? `${label} — ${err}` : label });
      }
    }

    if (additions.length === 0) return;
    setThinkingChain((prev) => {
      const next = [...prev, ...additions];
      return next.length > 260 ? next.slice(next.length - 260) : next;
    });
    window.setTimeout(() => {
      thinkingPanelRef.current?.scrollTo({ top: thinkingPanelRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);
  }, [formatStepLabel, setAgentCentralTab]);

  const renderThinkingPanel = useCallback(() => {
    const visible = liveSteps.filter((s: any) => {
      const name = String(s?.name || '');
      return name && name !== 'plan' && !name.startsWith('thinking_step_');
    });
    const total = visible.length;
    const done = visible.filter((s: any) => s?.status === 'done').length;
    const failed = visible.filter((s: any) => s?.status === 'failed').length;
    const running = visible.filter((s: any) => s?.status === 'running').length;
    const pct = total ? Math.round(((done + failed) / total) * 100) : 0;

    return (
      <div className="joe-thinking-panel">
        <div className="joe-thinking-summary">
          <div className="joe-thinking-summary-row">
            <div className="joe-thinking-summary-title">{t('liveSteps', 'Live Steps')}</div>
            <div className="joe-thinking-summary-badges">
              <span className="joe-thinking-badge">{t('statusRunning', 'قيد التنفيذ')}: {running}</span>
              <span className="joe-thinking-badge">{t('statusDone', 'تم')}: {done}</span>
              <span className="joe-thinking-badge">{t('statusFailed', 'فشل')}: {failed}</span>
            </div>
          </div>
          <div className="joe-thinking-progress">
            <div className="joe-thinking-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div ref={thinkingPanelRef} className="joe-thinking-list" dir="auto">
          {thinkingChain.length === 0 ? (
            <div className="joe-thinking-empty">{t('waitingForActivity', 'Waiting for activity...')}</div>
          ) : (
            thinkingChain.map((item) => {
              const time = new Date(item.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={item.id} className={`joe-thinking-item joe-thinking-${item.type}`}>
                  <div className="joe-thinking-dot" />
                  <div className="joe-thinking-body">
                    <div className="joe-thinking-text">{item.content}</div>
                    <div className="joe-thinking-meta">{time}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }, [liveSteps, thinkingChain, t]);

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

  useEffect(() => { }, [isNarrow, composerHeight]);

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

  // Session Actions Hook
  const {
    createSession,
    isCreatingChatSession,
    moveSessionToFolder,
    mergeSessions,
    deleteAllSessions,
    togglePin
  } = useSessionActions();

  // Alias for toggleAgentPin (as they share same logic essentially, or we can use togglePin directly below in JSX)
  const toggleAgentPin = togglePin;

  // Old isCreatingChatSession state removed (now from hook)


  // createSession moved to hook

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
    const mql = window.matchMedia('(max-width: 1024px)');
    const apply = () => {
      setIsNarrow(mql.matches);
      // Don't auto-toggle sidebar here on resize to avoid annoyance, just set narrow state
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

  // moveSessionToFolder moved to hook


  // mergeSessions moved to hook





  // deleteAllSessions moved to hook

  // togglePin and toggleAgentPin moved to hook

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
                  {t('sidebar.noResults', 'No results')}
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
              <Trash2 size={16} /> {t('sidebar.deleteAll', 'Delete all sessions')}
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
              <button
                onClick={() => setShowThinkingPanel(v => {
                  const next = !v;
                  if (next) {
                    setRightPanelTab('thinking');
                    setAgentPanelTab('thinking');
                  }
                  return next;
                })}
                className={`mode-fab ${showThinkingPanel ? 'active' : ''}`}
                title="Thinking"
              >
                <Activity size={16} />
                <span className="mode-fab-label">التفكير</span>
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
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>جلسات الوكيل</div>
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
                    {isNarrow || agentSidebarOpen ? (
                      <button
                        onClick={() => setAgentSelected(null)}
                        style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(37, 99, 235, 0.12)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                      >
                        جلسة جديدة
                      </button>
                    ) : null}
                  </div>
                </div>
                {(isNarrow ? agentSessionsOpen : agentSidebarOpen) ? (
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
                      thinkingChain={thinkingChain}
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
                    {showThinkingPanel ? (
                      <button
                        onClick={() => setAgentPanelTab('thinking')}
                        style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: agentPanelTab === 'thinking' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <Activity size={14} /> التفكير
                      </button>
                    ) : null}
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
                      {agentPanelTab === 'thinking' && showThinkingPanel ? (
                        renderThinkingPanel()
                      ) : (
                        <CommandComposer
                          sessionId={agentSelected || undefined}
                          sessionKind="agent"
                          browserSessionId={agentBrowserSessionId}
                          onStepsUpdate={handleStepsUpdate}
                          onSessionCreated={async (id) => {
                            await loadAllSessions();
                            setAgentSelected(id);
                          }}
                          showTerminal={agentCentralTab === 'terminal'}
                          onTerminalToggle={() => setAgentCentralTab(agentCentralTab === 'terminal' ? 'browser' : 'terminal')}
                        />
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          {mode === 'chat' && (
            <>
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
                        onSessionCreated={async (id) => {
                          await loadAllSessions();
                          setSelected(id);
                        }}
                        showTerminal={showTerminal}
                        onTerminalToggle={() => setShowTerminal(!showTerminal)}
                      />
                    </div>
                  </div>
                </div>
                {(showFiles || showThinkingPanel) ? (
                  <div className="joe-right-panel" style={{ width: isNarrow ? '100%' : 420, minWidth: isNarrow ? undefined : 320, height: '100%', borderLeft: isNarrow ? undefined : '1px solid var(--border-color)', borderTop: isNarrow ? '1px solid var(--border-color)' : undefined, background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    <div className="joe-right-panel-header" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {showThinkingPanel ? (
                          <button
                            onClick={() => setRightPanelTab('thinking')}
                            style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: rightPanelTab === 'thinking' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Activity size={14} /> {t('liveSteps', 'Thinking Chain')}
                          </button>
                        ) : null}
                        {showFiles ? (
                          <button
                            onClick={() => setRightPanelTab('files')}
                            style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: rightPanelTab === 'files' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Folder size={14} /> {t('tools.file_read', 'Files')}
                          </button>
                        ) : null}
                        {true ? (
                          <button
                            onClick={() => setRightPanelTab('memory')}
                            style={{ height: 28, padding: '0 10px', borderRadius: 999, border: '1px solid var(--border-color)', background: rightPanelTab === 'memory' ? 'rgba(var(--accent-primary-rgb), 0.14)' : 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Brain size={14} /> {t('memory.title', 'Memory')}
                          </button>
                        ) : null}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {rightPanelTab === 'thinking' && showThinkingPanel ? (
                          <button
                            onClick={() => {
                              setThinkingChain([]);
                              stepStatusByKeyRef.current = new Map();
                            }}
                            style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                          >
                            {t('tools.clear', 'Clear')}
                          </button>
                        ) : null}
                        {rightPanelTab === 'thinking' ? (
                          <button
                            onClick={() => setShowThinkingPanel(false)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                          >
                            {t('close', 'Hide')}
                          </button>
                        ) : (
                          <button
                            onClick={() => setShowFiles(false)}
                            style={{ height: 28, padding: '0 10px', borderRadius: 10, border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}
                          >
                            {t('close', 'Hide')}
                          </button>
                        )}
                      </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                      {rightPanelTab === 'files' && showFiles ? (
                        <div style={{ height: '100%', overflow: 'auto' }}>
                          <FileExplorer />
                        </div>
                      ) : null}

                      {rightPanelTab === 'thinking' && showThinkingPanel ? (
                        renderThinkingPanel()
                      ) : null}

                      {rightPanelTab === 'memory' ? (
                        <Suspense fallback={<div className="flex justify-center p-4">Loading...</div>}>
                          <MemoryPanelLazy sessionId={selected || undefined} />
                        </Suspense>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>

      {showTerminal && mode === 'chat' && (
        <Suspense fallback={null}>
          <EnterpriseTerminalPanelLazy onClose={() => setShowTerminal(false)} />
        </Suspense>
      )}
      {/* Package Manager Modal */}
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

      {/* Git Modal */}
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

      {/* Social Modal */}
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

      {/* Art Modal */}
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

      {/* DB Modal */}
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

      {/* Actions Modal */}
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
