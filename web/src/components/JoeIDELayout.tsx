import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import JoeHeader from './JoeHeader';
import TodosPanel from './TodosPanel';
import ChatPanel from './ChatPanel';
import WorkspacePanel from './WorkspacePanel';
import FileExplorerPanel from './FileExplorerPanel';
import GitHubPanel from './GitHubPanel';
import SessionsBar from './SessionsBar';
import CommandPalette, { Command } from './CommandPalette';
import { GitHubRepo, GitHubCommit, GitHubUser } from '../services/githubService';
import { FolderOpen } from 'lucide-react';
import '../styles/joe-premium.css';
import '../styles/accents.css';
import { useAutoOpen, PanelType } from '../services/AutoOpenManager';
import { ErrorBoundary } from './ErrorBoundary';
import { acceptPanelEventOnce, panelEventSessionId } from '../lib/panel-event-ownership';
interface Session {
    id: string;
    title: string;
    preview?: string;
    timestamp: Date;
    isActive: boolean;
    /** Joe is still working here, even from another conversation. */
    isRunning?: boolean;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp?: Date;
}

type WorkspaceTab = 'browser' | 'terminal' | 'preview' | 'logs' | 'problems';

interface JoeIDELayoutProps {


    // User
    userAvatar?: string;
    userName?: string;
    userEmail?: string;
    userRole?: string;

    // Chat
    messages: Message[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    isLoading?: boolean;

    // Workspace
    workspaceTab?: WorkspaceTab;
    onWorkspaceTabChange?: (tab: WorkspaceTab) => void;
    onDeploymentsClick?: () => void;
    onSystemClick?: () => void;
    browserSessionId?: string;
    terminalId?: string;
    workspaceId?: string;
    previewUrl?: string;

    // Session
    sessionId?: string;
    sessions?: Session[];
    onSelectSession?: (id: string) => void;
    onDeleteSession?: (id: string) => void;
    onDeleteAllSessions?: () => void;
    onNewSession?: () => void;
    sessionKind?: 'chat' | 'agent';

    // Callbacks
    onSettingsClick?: () => void;
    onNewProject?: () => void;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onGitChanges?: () => void;

    // GitHub Integration
    githubUser?: GitHubUser | null;
    githubRepos?: GitHubRepo[];
    activeRepo?: GitHubRepo | null;
    githubCommits?: GitHubCommit[];
    onSelectRepo?: (repo: GitHubRepo) => void;
    onRefreshGithub?: () => void;
    onConnectGithub?: () => void;
    onDisconnectGithub?: () => void;
    onCreateRepo?: () => void;
    githubLoading?: boolean;

    // Theme
    theme?: 'dark' | 'light';
    onThemeToggle?: () => void;

    // Connection
    isConnected?: boolean;
    branch?: string;

    // Custom content
    chatChildren?: React.ReactNode; // For CommandComposer
    workspaceChildren?: React.ReactNode;
    children?: React.ReactNode;
}

export default function JoeIDELayout({


    // User
    userAvatar,
    userName,
    userEmail,
    userRole,

    // Chat
    messages,
    inputValue,
    onInputChange,
    onSend,
    isLoading = false,

    // Workspace
    workspaceTab,
    onWorkspaceTabChange,
    onDeploymentsClick,
    onSystemClick,
    browserSessionId,
    terminalId,
    workspaceId,
    previewUrl,

    // Session
    sessionId,
    sessions = [],
    onSelectSession,
    onDeleteSession,
    onDeleteAllSessions,
    onNewSession,
    sessionKind = 'agent', // Default to agent

    // Callbacks
    onSettingsClick,
    onNewProject,
    onNewFile,
    onNewFolder,
    onGitChanges,

    // Theme
    theme = 'dark',
    onThemeToggle,

    // Connection
    isConnected = true,
    branch = 'main',

    // Custom content
    chatChildren,
    workspaceChildren,
    children,

    // GitHub Integration Props
    githubUser = null,
    githubRepos = [],
    activeRepo = null,
    githubCommits = [],
    onSelectRepo,
    onRefreshGithub,
    onConnectGithub,
    onDisconnectGithub,
    onCreateRepo,
    githubLoading = false
}: JoeIDELayoutProps) {
    const { t } = useTranslation();

    // Sidebar states
    const [sidebarView, setSidebarView] = useState<'explorer' | 'github'>('explorer');
    const [isChatCollapsed, setIsChatCollapsed] = useState(false);
    // The chat is the primary FULL-PAGE column by default; the workspace
    // (preview/terminal/browser) is a collapsible side CANVAS that stays hidden
    // until a task needs it (auto-opens) or the user opens it manually via the
    // header toggle. This gives a clean, chat-first, ChatGPT/Claude-style default.
    const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(true);
    // The File Explorer is now an on-demand slide-over DRAWER (overlay) on desktop
    // too — hidden by default so the chat and preview get the full width. It opens
    // over the workspace via the edge tab / header toggle / file actions, without
    // shrinking the preview. So it starts collapsed on every screen size.
    const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);

    // Handle initial mobile state for chat
    const [wasMobileInitChecked, setWasMobileInitChecked] = useState(false);
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 900 : false);

    useEffect(() => {
        if (!wasMobileInitChecked && typeof window !== 'undefined') {
            const isMob = window.innerWidth <= 900;
            if (isMob) {
                setIsExplorerCollapsed(true);
                setIsChatCollapsed(false);
            }
            setWasMobileInitChecked(true);
        }
    }, [wasMobileInitChecked]);

    // Track viewport for mobile toggle button
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 900);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Auto-open is disabled for the first moment after load, so the terminal's
    // idle "Connected" banner and initial tool wiring don't pop the canvas over the
    // full-page chat. Real tasks (which happen after the user acts) still open it.
    const canAutoOpen = useRef(false);
    useEffect(() => {
        const t = setTimeout(() => { canAutoOpen.current = true; }, 2500);
        return () => clearTimeout(t);
    }, []);

    // When a live preview URL arrives, reveal the canvas so the user sees the result.
    useEffect(() => {
        if (previewUrl) setIsWorkspaceCollapsed(false);
    }, [previewUrl]);

    // A real browser session is a direct visibility contract: the live stream must
    // not remain hidden behind the collapsed canvas. This effect intentionally does
    // not run on close, so a user's manual collapse is respected until a new session
    // or a new browser-tab selection arrives.
    useEffect(() => {
        if (browserSessionId || workspaceTab === 'browser') {
            setIsWorkspaceCollapsed(false);
        }
    }, [browserSessionId, workspaceTab]);

    // SMART AUTO-OPEN: when the active workspace tab CHANGES because a task needs
    // it (Joe.tsx switches to terminal/preview/browser as work runs), reveal the
    // canvas. Guarded so it does NOT fire on the initial mount — the chat must stay
    // full-page by default until a real task or the user opens the canvas.
    const firstTabRender = useRef(true);
    useEffect(() => {
        if (firstTabRender.current) { firstTabRender.current = false; return; }
        if (canAutoOpen.current && workspaceTab) setIsWorkspaceCollapsed(false);
    }, [workspaceTab]);
    useEffect(() => {
        const openCanvas = () => setIsWorkspaceCollapsed(false);
        window.addEventListener('preview:ready', openCanvas);
        return () => window.removeEventListener('preview:ready', openCanvas);
    }, []);

    // Force uncollapse when an explicit action requires it (e.g. from Joe.tsx tools or CommandComposer icons)
    useEffect(() => {
        // The workspace is always visible now; 'workspace-uncollapse' should reveal
        // the workspace, not force the file drawer open over the preview. No-op kept
        // as a named handler in case other code dispatches it.
        const handleUncollapse = () => { /* workspace is always visible in overlay layout */ };
        window.addEventListener('joe:workspace-uncollapse', handleUncollapse);
        return () => window.removeEventListener('joe:workspace-uncollapse', handleUncollapse);
    }, []);

    useEffect(() => {
        const handleOpenBrowserTab = () => {
            if (canAutoOpen.current) setIsWorkspaceCollapsed(false);
            if (onWorkspaceTabChange) {
                onWorkspaceTabChange('browser');
            } else {
                setInternalWorkspaceTab('browser');
            }
        };
        window.addEventListener('joe:open-browser-tab', handleOpenBrowserTab);
        return () => window.removeEventListener('joe:open-browser-tab', handleOpenBrowserTab);
    }, [onWorkspaceTabChange]);

    useEffect(() => {
        // Live code arriving means the user should be WATCHING it arrive.
        const handleOpenLogsTab = () => {
            if (canAutoOpen.current) setIsWorkspaceCollapsed(false);
            if (onWorkspaceTabChange) onWorkspaceTabChange('logs');
            else setInternalWorkspaceTab('logs');
        };
        window.addEventListener('joe:open-logs-tab', handleOpenLogsTab);
        return () => window.removeEventListener('joe:open-logs-tab', handleOpenLogsTab);
    }, [onWorkspaceTabChange]);

    // Internal state for workspace tab if not controlled
    // 'logs', not 'terminal': showing a tab must never START anything. The
    // terminal panel boots a shell the moment it mounts.
    const [internalWorkspaceTab, setInternalWorkspaceTab] = useState<WorkspaceTab>('logs');

    const activeWorkspaceTab = workspaceTab ?? internalWorkspaceTab;
    const handleWorkspaceTabChange = useCallback((tab: WorkspaceTab) => {
        // Activating a tab reveals the canvas (in case it was collapsed).
        setIsWorkspaceCollapsed(false);
        if (onWorkspaceTabChange) {
            onWorkspaceTabChange(tab);
        } else {
            setInternalWorkspaceTab(tab);
        }
    }, [onWorkspaceTabChange]);



    // ... inside component ...

    // Logs and Problems State
    /** A long build streams thousands of lines; the panel keeps the last
     *  MAX_LOG_LINES so a two-hour session cannot grow the tab out of memory. */
    const MAX_LOG_LINES = 4000;
    const capLogs = (next: string[]) => (next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next);
    const [logs, setLogs] = useState<string[]>([]);
    const [problems, setProblems] = useState<any[]>([]);
    /**
     * Files Joe is building right now, streamed section by section.
     * «أن تتكوّن داخلها الكودات بشكل حي» — each chunk is real content the
     * moment it exists on the server, appended per file.
     */
    const [liveFiles, setLiveFiles] = useState<import('./WorkspacePanel').LiveFile[]>([]);
    /**
     * The build's current stage — derived server-side from the real log line
     * that just happened (never a timer). Audit scores accumulate so the strip
     * can keep showing them after the stage moves on.
     */
    const [buildStatus, setBuildStatus] = useState<import('./WorkspacePanel').BuildStatusState | null>(null);

    /**
     * THE PANELS BELONG TO A SESSION — they are not one global surface.
     *
     * Reported from the field, and it was right: build in session one, open a
     * SECOND chat, and its Logs and Preview still showed the first session's
     * work. Worse, a run still going in session one kept writing into the
     * panels of session two and flipping its tabs, because every panel event
     * was applied to whatever conversation happened to be on screen.
     *
     * A session's panel state is now archived when you leave it and restored
     * when you come back — and an event that names another session is ignored
     * here rather than painted over the one you are reading.
     */
    const sessionRef = useRef<string | undefined>(sessionId);
    const seenPanelEventKeys = useRef<Map<string, Set<string>>>(new Map());
    const panelArchive = useRef<Map<string, {
        liveFiles: import('./WorkspacePanel').LiveFile[];
        logs: string[];
        problems: any[];
        buildStatus: import('./WorkspacePanel').BuildStatusState | null;
    }>>(new Map());

    /**
     * Fold one event into the archived state of a session that is NOT on
     * screen. Deliberately narrow: the panels a returning user needs to see
     * are the live files, the log lines and the build status.
     */
    const recordForBackgroundSession = useCallback((event: any) => {
        const sid = panelEventSessionId(event);
        if (!sid || /^panel-/.test(sid) || sid === 'local_terminal') return;
        const cur = panelArchive.current.get(sid)
            || { liveFiles: [] as any[], logs: [] as string[], problems: [] as any[], buildStatus: null as any };

        if (event.type === 'file_stream' && event.data?.file) {
            const d = event.data;
            const i = cur.liveFiles.findIndex((f: any) => f.file === d.file);
            if (i === -1) {
                cur.liveFiles = [...cur.liveFiles, {
                    file: String(d.file), content: String(d.chunk || ''), done: !!d.done,
                    label: d.label, bytes: d.bytes || 0, updatedAt: d.at || Date.now(),
                }];
            } else {
                const next = cur.liveFiles.slice();
                const f = next[i];
                next[i] = {
                    ...f,
                    content: d.done ? String(d.chunk || f.content) : f.content + String(d.chunk || ''),
                    done: !!d.done || f.done,
                    label: d.label || f.label,
                    updatedAt: d.at || Date.now(),
                };
                cur.liveFiles = next;
            }
        } else if (event.type === 'terminal_output' || event.type === 'log') {
            const line = String(event.data?.line ?? event.data?.text ?? event.data?.chunk ?? '');
            if (line) cur.logs = [...cur.logs, line].slice(-500);
        } else if (event.type === 'build_status' && event.data) {
            cur.buildStatus = event.data;
        } else if (event.type === 'problems' && Array.isArray(event.data?.problems)) {
            cur.problems = event.data.problems;
        }
        panelArchive.current.set(sid, cur);
    }, []);

    useEffect(() => {
        const previous = sessionRef.current;
        if (previous === sessionId) return;
        // The state still on screen is the one being LEFT — archive it as it is.
        if (previous) panelArchive.current.set(previous, { liveFiles, logs, problems, buildStatus });
        sessionRef.current = sessionId;
        const saved = sessionId ? panelArchive.current.get(sessionId) : undefined;
        setLiveFiles(saved?.liveFiles || []);
        setLogs(saved?.logs || []);
        setProblems(saved?.problems || []);
        setBuildStatus(saved?.buildStatus || null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    useEffect(() => {
        /**
         * A rendered workspace event must carry the exact active session id.
         * Unscoped events are transport/global state and are never painted into
         * a session workspace. Other sessions are archived by their own id.
         */
        const belongsHere = (event: any): boolean => {
            const sid = panelEventSessionId(event);
            const active = String(sessionRef.current || '').trim();
            return Boolean(active && sid && sid === active);
        };

        // Subscribe to socket events for logs
        const unsubscribe = import('../services/socket').then(({ SocketService }) => {
            return SocketService.subscribe((event: any) => {
                if (!event || !acceptPanelEventOnce(event, seenPanelEventKeys.current)) return;
                /**
                 * A BACKGROUND RUN IS RECORDED, NOT DISCARDED.
                 *
                 * This used to `return` on any event from another conversation
                 * — correct about not PAINTING it, wrong about forgetting it.
                 * The run kept going on the server while its logs and files
                 * were dropped on the floor, so coming back showed the frozen
                 * snapshot from the moment he left and the task looked dead.
                 *
                 * Now the event lands in that session's archive instead. When
                 * he returns, the panels restore everything that happened
                 * while he was away.
                 */
                if (!belongsHere(event)) {
                    recordForBackgroundSession(event);
                    return;
                }

                // SMART AUTO-OPEN: when a real task/tool STARTS, reveal the canvas so
                // the user watches the work happen. We do NOT open on terminal_output
                // (the shell prints an idle banner on load — that must not pop the
                // canvas over the full-page chat).
                if (canAutoOpen.current && (event.type === 'step_started' || event.type === 'tool_started'
                    || event.type === 'run_started')) {
                    setIsWorkspaceCollapsed(false);
                }

                // When a BROWSER tool runs, reveal the canvas AND switch to the
                // browser tab so the user actually sees the live stream (otherwise it
                // opens on the terminal and the browser work stays hidden).
                const toolName = String(
                    event?.data?.tool?.name || event?.data?.name || event?.tool || event?.data?.toolName || ''
                ).toLowerCase();
                if ((event.type === 'step_started' || event.type === 'tool_started'
                    || event.type === 'browser_screenshot' || event.type === 'stream_frame')
                    && (toolName.includes('browser') || event.type === 'browser_screenshot' || event.type === 'stream_frame')) {
                    window.dispatchEvent(new Event('joe:open-browser-tab'));
                }

                /**
                 * THE CODE, LIVE. A file_stream event carries a section's real
                 * HTML the moment it was accepted, or a file's final text the
                 * moment it hit disk. The Logs tab is where the user watches
                 * the build happen, so the first chunk of a build reveals it.
                 */
                if (event.type === 'file_stream' && event.data?.file) {
                    const d = event.data;
                    setLiveFiles(prev => {
                        const i = prev.findIndex(f => f.file === d.file);
                        if (i === -1) {
                            return [...prev, {
                                file: String(d.file), content: String(d.chunk || ''),
                                done: !!d.done, label: d.label, bytes: d.bytes || 0,
                                updatedAt: d.at || Date.now(),
                            }];
                        }
                        const next = prev.slice();
                        const cur = next[i];
                        next[i] = {
                            ...cur,
                            // A `done` event carries the WHOLE file as written —
                            // it replaces the accumulated draft rather than
                            // doubling it. Chunks append.
                            content: d.done ? String(d.chunk || cur.content)
                                : cur.content + String(d.chunk || ''),
                            done: !!d.done || cur.done,
                            label: d.label || cur.label,
                            updatedAt: d.at || Date.now(),
                        };
                        return next;
                    });
                    if (canAutoOpen.current) {
                        setIsWorkspaceCollapsed(false);
                        window.dispatchEvent(new Event('joe:open-logs-tab'));
                    }
                }

                // A fresh run starts with a clean slate — files from the last
                // build would otherwise sit above the new ones forever.
                if (event.type === 'run_started' || event.type === 'user_input') {
                    setLiveFiles([]);
                    setBuildStatus(null);
                }

                // The build's stage strip: each event is the structured form of
                // a log line that JUST happened. Scores stick; the stage moves.
                if (event.type === 'build_status' && event.data?.stage) {
                    const d = event.data;
                    setBuildStatus(prev => ({
                        current: d,
                        scores: {
                            ...(prev?.scores || {}),
                            ...(typeof d.score === 'number' ? { [d.stage]: d.score } : {}),
                        },
                        done: !!d.terminal,
                    }));
                }

                // Logs
                if (event.type === 'step_started') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step Started: ${event.data?.name || 'Unknown'}`]);
                } else if (event.type === 'step_done') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step Done`]);
                } else if (event.type === 'run_finished') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Run Finished`]);
                } else if (event.type === 'text') {
                    // event.data is { text, sessionId } — logging the object
                    // printed a literal "[object Object]" line in the panel.
                    const t = typeof event.data === 'string' ? event.data : String(event.data?.text ?? '');
                    if (t) setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${t}`]);
                } else if (event.type === 'terminal_output') {
                    // THE BUILD'S REAL VOICE. Every builder narrates through
                    // terminal_output — npm install, the vite build, the photo
                    // notes, the audit verdict. The Logs panel used to ignore
                    // all of it and showed four generic lines instead.
                    //
                    // The server may fan a session-owned line to several terminal
                    // ids; taking one canonical id keeps it from landing here
                    // multiple times without making the id a cross-session scope.
                    if (event.id === 'panel-terminal') {
                        const lines = String(event.data ?? '')
                            .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')     // ANSI colours never reach the DOM
                            .split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
                        if (lines.length) {
                            const stamp = new Date().toLocaleTimeString();
                            setLogs(prev => capLogs([...prev, ...lines.map(l => `[${stamp}] ${l}`)]));
                        }
                    }
                } else if (event.type === 'thinking_detail' && event.data?.detail) {
                    // The stage narration the user already sees in chat — in
                    // the log it is the spine the terminal lines hang from.
                    setLogs(prev => capLogs([...prev, `[${new Date().toLocaleTimeString()}] ${String(event.data.detail)}`]));
                } else if (event.type === 'tool_started' && (event.data?.name || event.data?.tool)) {
                    setLogs(prev => capLogs([...prev, `[${new Date().toLocaleTimeString()}] ▶ ${String(event.data.name || event.data.tool)}`]));
                }

                // Problems
                if (event.type === 'step_failed') {
                    let errorMsg = 'Unknown error';
                    if (typeof event.data === 'string') errorMsg = event.data;
                    else if (event.data) {
                        errorMsg = event.data.result?.error || event.data.result?.message || event.data.error || event.data.message || 'Unknown error';
                        if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
                    }
                    setProblems(prev => [...prev, { type: 'error', message: errorMsg, time: new Date() }]);
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${errorMsg}`]);
                } else if (event.type === 'error') {
                    let errorMsg = 'System error';
                    if (typeof event.data === 'string') errorMsg = event.data;
                    else if (event.data) {
                        errorMsg = event.data.message || event.data.error || 'System error';
                        if (typeof errorMsg === 'object') errorMsg = JSON.stringify(errorMsg);
                    }
                    setProblems(prev => [...prev, { type: 'error', message: errorMsg, time: new Date() }]);
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] SYSTEM ERROR: ${errorMsg}`]);
                }
            }, sessionId);
        });

        return () => {
            unsubscribe.then(unsub => unsub && unsub());
        };
    }, []);

    const toggleChat = useCallback(() => setIsChatCollapsed(prev => !prev), []);
    const toggleExplorer = useCallback(() => setIsExplorerCollapsed(prev => !prev), []);
    const toggleWorkspace = useCallback(() => setIsWorkspaceCollapsed(prev => !prev), []);

    // ⌘K / Ctrl+K Command Palette
    const [isPaletteOpen, setIsPaletteOpen] = useState(false);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                setIsPaletteOpen(v => !v);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    // Auto-open handler for Neural Interconnection. Switches the tab, and reveals
    // the canvas ONLY after the initial settle window (so it doesn't fight the
    // full-page-chat default on load).
    const handleAutoOpen = useCallback((panel: PanelType, data?: any) => {
        const tab: WorkspaceTab | null = panel === 'preview' ? 'preview' : panel === 'browser' ? 'browser' : panel === 'terminal' ? 'terminal' : null;
        if (!tab) return;
        if (onWorkspaceTabChange) onWorkspaceTabChange(tab); else setInternalWorkspaceTab(tab);
        if (canAutoOpen.current) setIsWorkspaceCollapsed(false);
    }, [onWorkspaceTabChange]);

    useAutoOpen(handleAutoOpen);

    const handleGitChanges = useCallback(() => {
        setSidebarView('github');
        setIsExplorerCollapsed(false);
        if (onGitChanges) onGitChanges();
    }, [onGitChanges]);

    const handleMaximizeToggle = useCallback(() => {
        const nextState = !(isChatCollapsed && isExplorerCollapsed);
        setIsChatCollapsed(nextState);
        setIsExplorerCollapsed(nextState);
    }, [isChatCollapsed, isExplorerCollapsed]);

    const isMaximized = isChatCollapsed && isExplorerCollapsed;

    // Command Palette actions — wired to the real app actions in scope.
    const paletteCommands: Command[] = React.useMemo(() => [
        { id: 'new-chat', label: 'محادثة جديدة', hint: 'New chat', icon: '＋', keywords: 'session جلسة جديد', run: () => onNewSession && onNewSession() },
        { id: 'new-project', label: 'مشروع جديد', hint: 'New project', icon: '📁', keywords: 'project onboarding', run: () => onNewProject && onNewProject() },
        { id: 'tab-preview', label: 'فتح المعاينة', hint: 'Preview', icon: '👁', keywords: 'preview معاينة', run: () => handleWorkspaceTabChange('preview') },
        { id: 'tab-terminal', label: 'فتح الطرفية', hint: 'Terminal', icon: '⌘', keywords: 'terminal طرفية shell', run: () => handleWorkspaceTabChange('terminal') },
        { id: 'tab-browser', label: 'فتح المتصفح', hint: 'Browser', icon: '🌐', keywords: 'browser متصفح', run: () => handleWorkspaceTabChange('browser') },
        { id: 'toggle-canvas', label: 'إظهار/إخفاء مساحة العمل', hint: 'Canvas', icon: '▣', keywords: 'workspace canvas كانفاس', run: () => toggleWorkspace() },
        { id: 'toggle-files', label: 'مستكشف الملفات', hint: 'Files', icon: '🗂', keywords: 'files explorer ملفات', run: () => toggleExplorer() },
        { id: 'git', label: 'تغييرات Git', hint: 'Git', icon: '⎇', keywords: 'git github changes', run: () => handleGitChanges() },
        { id: 'theme', label: 'تبديل المظهر (فاتح/داكن)', hint: 'Theme', icon: '◐', keywords: 'theme dark light مظهر', run: () => onThemeToggle && onThemeToggle() },
        { id: 'settings', label: 'الإعدادات', hint: 'Settings', icon: '⚙', keywords: 'settings إعدادات', run: () => onSettingsClick && onSettingsClick() },
    ], [onNewSession, onNewProject, handleWorkspaceTabChange, toggleWorkspace, toggleExplorer, handleGitChanges, onThemeToggle, onSettingsClick]);

    // For CommandComposer, we need an active session ID and browser session ID
    const activeSessionId = sessionId; // Assuming sessionId is the active one
    const activeBrowserSessionId = browserSessionId; // Assuming browserSessionId is the active one

    return (
        <div className="joe-ide-layout" data-theme={theme}>
            {/* Header */}
            <JoeHeader

                userAvatar={userAvatar}
                userName={userName}
                userEmail={userEmail}
                userRole={userRole}
                onSettingsClick={onSettingsClick}
                onDeploymentsClick={onDeploymentsClick}
                onSystemClick={onSystemClick}
                theme={theme}
                onThemeToggle={onThemeToggle}
                onToggleChat={toggleChat}
                onToggleExplorer={toggleExplorer}
                onToggleWorkspace={toggleWorkspace}
                isChatCollapsed={isChatCollapsed}
                isExplorerCollapsed={isExplorerCollapsed}
                isWorkspaceCollapsed={isWorkspaceCollapsed}
                onNewProject={onNewProject}
            />

            {/* Main Content Area */}
            <div className="joe-main">
                {/* Left: Chat Panel */}
                <ErrorBoundary fallbackTitle="تعذّر تحميل المحادثة">
                    <ChatPanel
                        messages={messages}
                        inputValue={inputValue}
                        onInputChange={onInputChange}
                        onSend={onSend}
                        isLoading={isLoading}
                        isCollapsed={isChatCollapsed}
                        sessionId={sessionId}
                    >
                        {chatChildren}
                    </ChatPanel>
                </ErrorBoundary>

                {/* Center: Workspace CANVAS (collapsible, overlay on mobile) */}
                <ErrorBoundary fallbackTitle="تعذّر تحميل منطقة العمل">
                    <div className={`joe-workspace-container relative h-full ${isWorkspaceCollapsed ? 'canvas-collapsed' : ''}`}>
                        {/* Manual close button (always available while the canvas is open) */}
                        <button
                            className="joe-canvas-close"
                            onClick={toggleWorkspace}
                            title="إغلاق مساحة العمل"
                            aria-label="close workspace canvas"
                        >✕</button>
                        <WorkspacePanel
                            activeTab={activeWorkspaceTab}
                            onTabChange={handleWorkspaceTabChange}
                            sessionId={sessionId}
                            browserSessionId={browserSessionId}
                            terminalId={terminalId}
                            workspaceId={workspaceId}
                            previewUrl={previewUrl}
                            isMaximized={isMaximized}
                            onMaximizeToggle={handleMaximizeToggle}
                            logs={logs}
                            liveFiles={liveFiles}
                            buildStatus={buildStatus}
                            problems={problems}
                            mobileCollapsed={isExplorerCollapsed}
                            onMobileToggle={toggleExplorer}
                        >
                            {workspaceChildren}
                        </WorkspacePanel>

                    </div>
                </ErrorBoundary>

                {/* Right: File Explorer / GitHub as an on-demand SLIDE-OVER DRAWER.
                    Overlays the workspace instead of taking a permanent column, so
                    chat + preview keep full width. Opened via the gold edge tab,
                    header toggle, or file/git actions. */}
                <div
                    className={`joe-files-drawer ${isExplorerCollapsed ? 'collapsed' : 'open'} ${isMobile ? 'mobile' : 'desktop'}`}
                    aria-hidden={isExplorerCollapsed}
                >
                    <ErrorBoundary fallbackTitle="تعذّر تحميل الشريط الجانبي">
                        {sidebarView === 'explorer' ? (
                            <FileExplorerPanel
                                onNewFile={onNewFile}
                                onNewFolder={onNewFolder}
                                onGitChanges={handleGitChanges}
                                activeRepo={activeRepo}
                                githubUser={githubUser}
                                isCollapsed={false}
                            />
                        ) : (
                            <GitHubPanel
                                user={githubUser}
                                repos={githubRepos}
                                activeRepo={activeRepo}
                                commits={githubCommits}
                                onSelectRepo={onSelectRepo || (() => { })}
                                onRefresh={onRefreshGithub || (() => { })}
                                onConnect={onConnectGithub || (() => { })}
                                onDisconnect={onDisconnectGithub || (() => { })}
                                onCreateRepo={onCreateRepo || (() => { })}
                                onBackToFileExplorer={() => setSidebarView('explorer')}
                                isLoading={githubLoading}
                            />
                        )}
                    </ErrorBoundary>
                </div>

                {/* Backdrop while the drawer is open (desktop; mobile has its own below) */}
                {!isMobile && !isExplorerCollapsed && (
                    <div className="joe-files-drawer-backdrop" onClick={toggleExplorer} aria-hidden="true" />
                )}

                {/* (Removed the floating gold edge tab that overlapped the browser —
                    the file explorer is opened from the header's Files button instead.) */}
            </div>

            {/* Sessions Bar */}
            <SessionsBar
                sessions={sessions}
                onSelect={onSelectSession || (() => { })}
                onDelete={onDeleteSession || (() => { })}
                onDeleteAll={onDeleteAllSessions}
                onNew={onNewSession || (() => { })}
                showInAgentMode={true}
            />

            {/* Mobile File Explorer Toggle Button */}
            {isMobile && (
                <button
                    className="joe-mobile-explorer-toggle"
                    onClick={toggleExplorer}
                    title={isExplorerCollapsed ? t('openFileExplorer') : t('closeFileExplorer')}
                    style={{
                        display: 'flex',
                        position: 'fixed',
                        // 60px sat EXACTLY on the composer's send button and
                        // swallowed its taps — measured on a real 390px view.
                        bottom: 176,
                        right: 12,
                        zIndex: 1001,
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        border: '2px solid var(--joe-gold-primary, #34c48b)',
                        background: 'linear-gradient(135deg, #34c48b 0%, #1f7d5c 100%)',
                        color: '#0a0c10',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 20px rgba(52, 196, 139, 0.4), 0 0 30px rgba(52, 196, 139, 0.2)',
                        fontSize: 20,
                    }}
                >
                    <FolderOpen size={22} />
                </button>
            )}

            {/* Mobile Backdrop (when explorer is open on small screens) */}
            {isMobile && !isExplorerCollapsed && (
                <div
                    onClick={toggleExplorer}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        zIndex: 999,
                        background: 'rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(2px)',
                    }}
                />
            )}

            {children}

            {/* ⌘K Command Palette */}
            <CommandPalette
                open={isPaletteOpen}
                onClose={() => setIsPaletteOpen(false)}
                commands={paletteCommands}
                isArabic
            />
        </div>
    );
}
