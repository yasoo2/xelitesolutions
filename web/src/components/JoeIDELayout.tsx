import React, { useState, useCallback, useEffect, Suspense, lazy } from 'react';
import JoeHeader from './JoeHeader';
import TodosPanel from './TodosPanel';
import ChatPanel from './ChatPanel';
import WorkspacePanel from './WorkspacePanel';
import FileExplorerPanel from './FileExplorerPanel';
import GitHubPanel from './GitHubPanel';
import SessionsBar from './SessionsBar';
import { GitHubRepo, GitHubCommit, GitHubUser } from '../services/githubService';
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

    // Chat
    messages: Message[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSend: () => void;
    isLoading?: boolean;

    // Workspace
    workspaceTab?: WorkspaceTab;
    onWorkspaceTabChange?: (tab: WorkspaceTab) => void;
    browserSessionId?: string;
    terminalId?: string;
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

    // Chat
    messages,
    inputValue,
    onInputChange,
    onSend,
    isLoading = false,

    // Workspace
    workspaceTab,
    onWorkspaceTabChange,
    browserSessionId,
    terminalId,
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
    const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

    // Internal state for workspace tab if not controlled
    const [internalWorkspaceTab, setInternalWorkspaceTab] = useState<WorkspaceTab>('terminal');

    const activeWorkspaceTab = workspaceTab ?? internalWorkspaceTab;
    const handleWorkspaceTabChange = useCallback((tab: WorkspaceTab) => {
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
                    const errorMsg = event.data?.error || 'Unknown error';
                    setProblems(prev => [...prev, { type: 'error', message: errorMsg, time: new Date() }]);
                    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${errorMsg}`]);
                } else if (event.type === 'error') {
                    const errorMsg = event.data?.message || 'System error';
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

    // Auto-open handler for Neural Interconnection
    const handleAutoOpen = useCallback((panel: PanelType, data?: any) => {
        if (panel === 'preview') {
            handleWorkspaceTabChange('preview');
        } else if (panel === 'browser') {
            handleWorkspaceTabChange('browser');
        } else if (panel === 'terminal') {
            handleWorkspaceTabChange('terminal');
        }
    }, [handleWorkspaceTabChange]);

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
                onSettingsClick={onSettingsClick}
                theme={theme}
                onThemeToggle={onThemeToggle}
                onToggleChat={toggleChat}
                onToggleExplorer={toggleExplorer}
                isChatCollapsed={isChatCollapsed}
                isExplorerCollapsed={isExplorerCollapsed}
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

                {/* Center: Workspace */}
                <ErrorBoundary fallbackTitle="تعذّر تحميل منطقة العمل">
                    <div className="joe-workspace-container relative flex-1 w-full h-full">
                        <WorkspacePanel
                            activeTab={activeWorkspaceTab}
                            onTabChange={handleWorkspaceTabChange}
                            browserSessionId={browserSessionId}
                            terminalId={terminalId}
                            previewUrl={previewUrl}
                            isMaximized={isMaximized}
                            onMaximizeToggle={handleMaximizeToggle}
                            logs={logs}
                            problems={problems}
                        >
                            {workspaceChildren}
                        </WorkspacePanel>

                        {/* Overlay Agent Tasks */}
                        <TodosPanel sessionId={sessionId} />
                    </div>
                </ErrorBoundary>

                {/* Right: File Explorer / GitHub Panel */}
                <ErrorBoundary fallbackTitle="تعذّر تحميل الشريط الجانبي">
                    {sidebarView === 'explorer' ? (
                        <FileExplorerPanel
                            onNewFile={onNewFile}
                            onNewFolder={onNewFolder}
                            onGitChanges={handleGitChanges}
                            activeRepo={activeRepo}
                            githubUser={githubUser}
                            isCollapsed={isExplorerCollapsed}
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

            {/* Sessions Bar */}
            <SessionsBar
                sessions={sessions}
                onSelect={onSelectSession || (() => { })}
                onDelete={onDeleteSession || (() => { })}
                onDeleteAll={onDeleteAllSessions}
                onNew={onNewSession || (() => { })}
                showInAgentMode={true}
            />

            {children}
        </div>
    );
}
