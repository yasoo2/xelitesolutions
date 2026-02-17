import React, { Suspense, lazy, useState } from 'react';
import { Globe, Terminal as TerminalIcon, Eye, Code, Loader, Maximize2, ChevronDown, ChevronUp } from 'lucide-react';

// Lazy load the heavy components
const EmbeddedTerminal = lazy(() => import('./EmbeddedTerminal'));
const EmbeddedBrowser = lazy(() => import('./EmbeddedBrowser'));
const PreviewPanel = lazy(() => import('./PreviewPanel'));
const ModernBrowserStream = lazy(() => import('./ModernBrowserStream'));

type WorkspaceTab = 'browser' | 'terminal' | 'preview';

interface WorkspacePanelProps {
    activeTab?: WorkspaceTab;
    onTabChange?: (tab: WorkspaceTab) => void;
    browserSessionId?: string;
    terminalId?: string;
    previewUrl?: string;
    children?: React.ReactNode;
    isMaximized?: boolean;
    onMaximizeToggle?: () => void;
}

export default function WorkspacePanel({
    activeTab: controlledTab,
    onTabChange,
    browserSessionId,
    terminalId,
    previewUrl,
    children,
    isMaximized,
    onMaximizeToggle
}: WorkspacePanelProps) {
    const [internalTab, setInternalTab] = useState<WorkspaceTab>('browser');
    const [isMobileCollapsed, setIsMobileCollapsed] = useState(false);

    const activeTab = controlledTab ?? internalTab;
    const handleTabChange = (tab: WorkspaceTab) => {
        if (onTabChange) {
            onTabChange(tab);
        } else {
            setInternalTab(tab);
        }
    };

    const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode }[] = [
        { id: 'browser', label: 'Browser', icon: <Globe size={16} /> },
        { id: 'terminal', label: 'Terminal', icon: <TerminalIcon size={16} /> },
        { id: 'preview', label: 'Preview', icon: <Eye size={16} /> },
    ];

    const LoadingFallback = () => (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--joe-text-muted)',
            gap: 12
        }}>
            <Loader size={24} className="animate-spin" />
            <span>Loading...</span>
        </div>
    );

    return (
        <main className={`joe-workspace ${isMobileCollapsed ? 'collapsed-mobile' : ''}`}>
            {/* Tabs */}
            <div className="joe-workspace-tabs">
                <div style={{ display: 'flex', gap: 6, flex: 1, overflowX: 'auto', minWidth: 0 }}>
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`joe-workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => handleTabChange(tab.id)}
                        >
                            {tab.icon}
                            <span className="hide-mobile">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Mobile Collapse Toggle */}
                <button
                    className="joe-header-btn show-mobile-only"
                    onClick={() => setIsMobileCollapsed(!isMobileCollapsed)}
                    title={isMobileCollapsed ? "Expand" : "Collapse"}
                    style={{ border: 'none', background: 'transparent', marginLeft: 4 }}
                >
                    {isMobileCollapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {onMaximizeToggle && (
                    <button
                        className="joe-header-btn hide-mobile"
                        onClick={onMaximizeToggle}
                        title={isMaximized ? "Restore" : "Maximize"}
                        style={{ border: 'none', background: 'transparent' }}
                    >
                        <Maximize2 size={16} style={{ transform: isMaximized ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }} />
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="joe-workspace-content">
                {/* Browser Tab */}
                {activeTab === 'browser' && (
                    <Suspense fallback={<LoadingFallback />}>
                        <EmbeddedBrowser sessionId={browserSessionId || 'panel-browser'} />
                    </Suspense>
                )}

                {/* Terminal Tab */}
                {activeTab === 'terminal' && (
                    <Suspense fallback={<LoadingFallback />}>
                        <EmbeddedTerminal terminalId={terminalId} />
                    </Suspense>
                )}

                {/* Preview Tab */}
                {activeTab === 'preview' && (
                    <Suspense fallback={<LoadingFallback />}>
                        <PreviewPanel url={previewUrl} />
                    </Suspense>
                )}

                {/* Custom children */}
                {children}
            </div>
        </main>
    );
}
