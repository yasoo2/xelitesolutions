/**
 * IDELayout - Main IDE layout container
 * Combines all IDE components: Sidebar, Main Area, Bottom Panel, Sessions
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import BottomPanel, { PanelTab, PanelContent, ProblemsPanel, OutputPanel, PortsPanel } from './BottomPanel';
import IDESidebar from './IDESidebar';
import SessionsBar from './SessionsBar';
import EmbeddedTerminal from './EmbeddedTerminal';
import EmbeddedBrowser from './EmbeddedBrowser';
import PreviewPanel from './PreviewPanel';

import { useAutoOpen, AutoOpenManager, PanelType } from '../services/AutoOpenManager';
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';

interface Session {
    id: string;
    title: string;
    preview?: string;
    timestamp: Date;
    isActive: boolean;
}

interface Repository {
    id: string;
    name: string;
    path: string;
    isActive: boolean;
    branch?: string;
}

interface Commit {
    hash: string;
    message: string;
    author: string;
    date: string;
    isCurrent?: boolean;
}

interface FileChange {
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed';
    staged: boolean;
}

interface Problem {
    type: 'error' | 'warning' | 'info';
    message: string;
    file?: string;
    line?: number;
}

interface IDELayoutProps {
    children: React.ReactNode; // The main chat/agent content
    mode: 'chat' | 'agent';
    sessions?: Session[];
    onSelectSession?: (id: string) => void;
    onDeleteSession?: (id: string) => void;
    onNewSession?: () => void;
    repositories?: Repository[];
    commits?: Commit[];
    changes?: FileChange[];
    onSelectRepo?: (id: string) => void;
    onRefreshGit?: () => void;
    onStageFile?: (path: string) => void;
    onUnstageFile?: (path: string) => void;
    onDiscardChanges?: (path: string) => void;
    onCommit?: (message: string) => void;
    onConnectRepo?: () => void;
    problems?: Problem[];
    logs?: string[];
}

export default function IDELayout({
    children,
    mode,
    sessions = [],
    onSelectSession,
    onDeleteSession,
    onNewSession,
    repositories = [],
    commits = [],
    changes = [],
    onSelectRepo,
    onRefreshGit,
    onStageFile,
    onUnstageFile,
    onDiscardChanges,
    onCommit,
    onConnectRepo,
    problems = [],
    logs = [],
}: IDELayoutProps) {
    // Sidebar state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
    const [sidebarWidth, setSidebarWidth] = useState(280);

    // Bottom panel state
    const [bottomPanelOpen, setBottomPanelOpen] = useState(false);
    const [bottomPanelHeight, setBottomPanelHeight] = useState(300);
    const [bottomPanelMaximized, setBottomPanelMaximized] = useState(false);
    const [activeTab, setActiveTab] = useState<PanelTab>('terminal');

    // Track badges
    const [badges, setBadges] = useState<Partial<Record<PanelTab, number>>>({
        problems: problems.length,
    });

    // Update badges when problems change
    useEffect(() => {
        setBadges(prev => ({ ...prev, problems: problems.length }));
    }, [problems.length]);

    // Auto-open handler
    const handleAutoOpen = useCallback((panel: PanelType) => {
        const tabMap: Partial<Record<PanelType, PanelTab>> = {
            terminal: 'terminal',
            browser: 'browser',
            preview: 'preview',
            problems: 'problems',
            output: 'output',
        };
        const tab = tabMap[panel];
        if (tab) {
            setActiveTab(tab);
            setBottomPanelOpen(true);
        }
    }, []);

    useAutoOpen(handleAutoOpen);

    // Toggle sidebar
    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => !prev);
    }, []);

    // Toggle bottom panel
    const toggleBottomPanel = useCallback(() => {
        setBottomPanelOpen(prev => !prev);
    }, []);

    // Toggle maximize
    const toggleMaximize = useCallback(() => {
        setBottomPanelMaximized(prev => !prev);
    }, []);

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                width: '100%',
                overflow: 'hidden',
                background: 'var(--bg-primary)',
            }}
        >
            {/* Main Content Area */}
            <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
                {/* Main Chat/Agent Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                        {children}
                    </div>

                    {/* Bottom Panel */}
                    <BottomPanel
                        isOpen={bottomPanelOpen}
                        onToggle={toggleBottomPanel}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        badges={badges}
                        height={bottomPanelHeight}
                        onHeightChange={setBottomPanelHeight}
                        isMaximized={bottomPanelMaximized}
                        onMaximize={toggleMaximize}
                    >
                        {/* Problems Tab */}
                        <PanelContent show={activeTab === 'problems'}>
                            <ProblemsPanel problems={problems} />
                        </PanelContent>

                        {/* Output Tab */}
                        <PanelContent show={activeTab === 'output'}>
                            <OutputPanel logs={logs} />
                        </PanelContent>

                        {/* Terminal Tab */}
                        <PanelContent show={activeTab === 'terminal'}>
                            <div style={{ height: '100%' }}>
                                <EmbeddedTerminal />
                            </div>
                        </PanelContent>

                        {/* Browser Tab */}
                        <PanelContent show={activeTab === 'browser'}>
                            <div style={{ height: '100%' }}>
                                <EmbeddedBrowser />
                            </div>
                        </PanelContent>

                        {/* Preview Tab */}
                        <PanelContent show={activeTab === 'preview'}>
                            <div style={{ height: '100%' }}>
                                <PreviewPanel />

                            </div>
                        </PanelContent>

                        {/* Ports Tab */}
                        <PanelContent show={activeTab === 'ports'}>
                            <PortsPanel ports={[]} />
                        </PanelContent>
                    </BottomPanel>
                </div>

                {/* Sidebar (Source Control) */}
                <IDESidebar
                    repositories={repositories}
                    commits={commits}
                    changes={changes}
                    onSelectRepo={onSelectRepo || (() => { })}
                    onRefresh={onRefreshGit || (() => { })}
                    onStageFile={onStageFile || (() => { })}
                    onUnstageFile={onUnstageFile || (() => { })}
                    onDiscardChanges={onDiscardChanges || (() => { })}
                    onCommit={onCommit || (() => { })}
                    onConnectRepo={onConnectRepo || (() => { })}
                    isCollapsed={sidebarCollapsed}
                    onToggleCollapse={toggleSidebar}
                    width={sidebarWidth}
                />
            </div>

            {/* Sessions Bar - Only show in Chat mode */}
            {mode === 'chat' && (
                <SessionsBar
                    sessions={sessions}
                    onSelect={onSelectSession || (() => { })}
                    onDelete={onDeleteSession || (() => { })}
                    onNew={onNewSession || (() => { })}
                />
            )}
        </div>
    );
}

// Export typed panel opener for external use
export function openIDEPanel(panel: PanelType, data?: any) {
    AutoOpenManager.openPanel(panel, data);
}

// Hook for components that want to trigger panel opens
export function useIDEPanels() {
    const openTerminal = useCallback(() => AutoOpenManager.openPanel('terminal'), []);
    const openBrowser = useCallback((url?: string) => AutoOpenManager.openPanel('browser', { url }), []);
    const openPreview = useCallback((url?: string) => AutoOpenManager.openPanel('preview', { url }), []);
    const openProblems = useCallback(() => AutoOpenManager.openPanel('problems'), []);
    const openOutput = useCallback(() => AutoOpenManager.openPanel('output'), []);

    return {
        openTerminal,
        openBrowser,
        openPreview,
        openProblems,
        openOutput,
    };
}
