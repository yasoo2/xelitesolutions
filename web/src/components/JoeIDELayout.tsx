import React, { useState, useCallback, Suspense, lazy } from 'react';
import JoeHeader from './JoeHeader';
import ChatPanel from './ChatPanel';
import WorkspacePanel from './WorkspacePanel';
import FileExplorerPanel from './FileExplorerPanel';
import SessionsBar from './SessionsBar';
import StatusBar from './StatusBar';
import '../styles/joe-premium.css';

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

type WorkspaceTab = 'browser' | 'terminal' | 'preview';

interface JoeIDELayoutProps {


    // User
    userAvatar?: string;
    userName?: string;

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
    onNewSession?: () => void;

    // Callbacks
    onSettingsClick?: () => void;
    onNewFile?: () => void;
    onNewFolder?: () => void;
    onGitChanges?: () => void;

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
    onNewSession,

    // Callbacks
    onSettingsClick,
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
    children
}: JoeIDELayoutProps) {

    // Internal state for workspace tab if not controlled
    const [internalWorkspaceTab, setInternalWorkspaceTab] = useState<WorkspaceTab>('terminal');

    // Sidebar states
    const [isChatCollapsed, setIsChatCollapsed] = useState(false);
    const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

    const activeWorkspaceTab = workspaceTab ?? internalWorkspaceTab;
    const handleWorkspaceTabChange = useCallback((tab: WorkspaceTab) => {
        if (onWorkspaceTabChange) {
            onWorkspaceTabChange(tab);
        } else {
            setInternalWorkspaceTab(tab);
        }
    }, [onWorkspaceTabChange]);

    const toggleChat = useCallback(() => setIsChatCollapsed(prev => !prev), []);
    const toggleExplorer = useCallback(() => setIsExplorerCollapsed(prev => !prev), []);

    const handleMaximizeToggle = useCallback(() => {
        const nextState = !(isChatCollapsed && isExplorerCollapsed);
        setIsChatCollapsed(nextState);
        setIsExplorerCollapsed(nextState);
    }, [isChatCollapsed, isExplorerCollapsed]);

    const isMaximized = isChatCollapsed && isExplorerCollapsed;

    return (
        <div className="joe-ide-layout" data-theme={theme}>
            {/* Header */}
            <JoeHeader

                userAvatar={userAvatar}
                userName={userName}
                onSettingsClick={onSettingsClick}
                theme={theme}
                onThemeToggle={onThemeToggle}
                onToggleChat={toggleChat}
                onToggleExplorer={toggleExplorer}
                isChatCollapsed={isChatCollapsed}
                isExplorerCollapsed={isExplorerCollapsed}
            />

            {/* Main Content Area */}
            <div className="joe-main">
                {/* Left: Chat Panel */}
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

                {/* Center: Workspace */}
                <WorkspacePanel
                    activeTab={activeWorkspaceTab}
                    onTabChange={handleWorkspaceTabChange}
                    browserSessionId={browserSessionId}
                    terminalId={terminalId}
                    previewUrl={previewUrl}
                    isMaximized={isMaximized}
                    onMaximizeToggle={handleMaximizeToggle}
                >
                    {workspaceChildren}
                </WorkspacePanel>

                {/* Right: File Explorer */}
                <FileExplorerPanel
                    onNewFile={onNewFile}
                    onNewFolder={onNewFolder}
                    onGitChanges={onGitChanges}
                    isCollapsed={isExplorerCollapsed}
                />
            </div>

            {/* Sessions Bar */}
            <SessionsBar
                sessions={sessions}
                onSelect={onSelectSession || (() => { })}
                onDelete={onDeleteSession || (() => { })}
                onNew={onNewSession || (() => { })}
                showInAgentMode={true}
            />

            {/* Status Bar */}
            <StatusBar
                isConnected={isConnected}
                branch={branch}
                sessionId={sessionId}
                language="TypeScript"
            />

            {children}
        </div>
    );
}
