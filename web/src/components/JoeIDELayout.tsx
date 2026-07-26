import React, { useState, useCallback, useEffect, useRef, Suspense, lazy } from 'react';
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
import { useAutoOpen, PanelType } from '../services/AutoOpenManager';
import { ErrorBoundary } from './ErrorBoundary';
interface Session {
    id: string;
    title: string;
    preview?: string;
    timestamp: Date;
    isActive: boolean;
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

    // Internal state for workspace tab if not controlled
    const [internalWorkspaceTab, setInternalWorkspaceTab] = useState<WorkspaceTab>('terminal');

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
    const [logs, setLogs] = useState<string[]>([]);
    const [problems, setProblems] = useState<any[]>([]);

    useEffect(() => {
        // Subscribe to socket events for logs
        const unsubscribe = import('../services/socket').then(({ SocketService }) => {
            return SocketService.subscribe((event: any) => {
                if (!event) return;

                // SMART AUTO-OPEN: when a real task/tool STARTS, reveal the canvas so
                // the user watches the work happen. We do NOT open on terminal_output
                // (the shell prints an idle banner on load — that must not pop the
                // canvas over the full-page chat).
                if (canAutoOpen.current && (event.type === 'step_started' || event.type === 'tool_started'
                    || event.type === 'run_started')) {
                    setIsWorkspaceCollapsed(false);
                }

                // Logs
                if (event.type === 'step_started') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step Started: ${event.data?.name || 'Unknown'}`]);
                } else if (event.type === 'step_done') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Step Done`]);
                } else if (event.type === 'run_finished') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Run Finished`]);
                } else if (event.type === 'text') {
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${event.data}`]);
                } else if (event.type === 'terminal_output') {
                    // Optional: Add terminal output to logs? Maybe too noisy.
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
            });
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
                            browserSessionId={browserSessionId}
                            terminalId={terminalId}
                            workspaceId={workspaceId}
                            previewUrl={previewUrl}
                            isMaximized={isMaximized}
                            onMaximizeToggle={handleMaximizeToggle}
                            logs={logs}
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

                {/* Always-visible gold edge tab to open/close the drawer (desktop) */}
                {!isMobile && (
                    <button
                        className={`joe-files-edge-tab ${isExplorerCollapsed ? '' : 'open'}`}
                        onClick={toggleExplorer}
                        title={isExplorerCollapsed ? 'فتح مستكشف الملفات' : 'إغلاق مستكشف الملفات'}
                        aria-label="toggle file explorer"
                    >
                        <FolderOpen size={16} />
                        <span className="joe-files-edge-tab-label">الملفات</span>
                    </button>
                )}
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
                    title={isExplorerCollapsed ? "فتح مستكشف الملفات" : "إغلاق مستكشف الملفات"}
                    style={{
                        display: 'flex',
                        position: 'fixed',
                        bottom: 60,
                        right: 16,
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
