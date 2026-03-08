import React, { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import {
    Globe, Terminal as TerminalIcon, Eye, Loader, Maximize2,
    ChevronDown, ChevronUp, FileOutput, AlertTriangle,
    Copy, CopyCheck, Trash2, Search, ArrowDownToLine
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

// Lazy load the heavy components
const EmbeddedTerminal = lazy(() => import('./EmbeddedTerminal'));
const EmbeddedBrowser = lazy(() => import('./EmbeddedBrowser'));
const PreviewPanel = lazy(() => import('./PreviewPanel'));


type WorkspaceTab = 'browser' | 'terminal' | 'preview' | 'logs' | 'problems';

interface WorkspacePanelProps {
    activeTab?: WorkspaceTab;
    onTabChange?: (tab: WorkspaceTab) => void;
    browserSessionId?: string;
    terminalId?: string;
    previewUrl?: string;
    children?: React.ReactNode;
    isMaximized?: boolean;
    onMaximizeToggle?: () => void;
    logs?: string[];
    problems?: any[];
    mobileCollapsed?: boolean;
    onMobileToggle?: () => void;
}

// ─── Inline Copy Button ────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { }
    }, [text]);

    return (
        <button
            onClick={handleCopy}
            title="نسخ"
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: copied ? 'var(--joe-gold-primary, #d4af37)' : 'var(--joe-text-muted, #888)',
                opacity: copied ? 1 : 0,
                transition: 'opacity 0.15s, color 0.2s',
                flexShrink: 0,
            }}
            className="log-copy-btn"
        >
            {copied ? <CopyCheck size={13} /> : <Copy size={13} />}
        </button>
    );
}

// ─── Panel Toolbar ─────────────────────────────────────────────────
function PanelToolbar({ filter, onFilterChange, onCopyAll, onClear, count, label }:
    { filter: string; onFilterChange: (v: string) => void; onCopyAll: () => void; onClear: () => void; count: number; label: string }) {

    const [copied, setCopied] = useState(false);
    const handleCopyAll = () => {
        onCopyAll();
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 8px', borderBottom: '1px solid var(--joe-border, rgba(255,255,255,0.08))',
            background: 'var(--joe-bg-secondary, rgba(0,0,0,0.2))',
            flexShrink: 0,
        }}>
            {/* Search */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 4, flex: 1,
                background: 'var(--joe-bg-tertiary, rgba(255,255,255,0.05))',
                borderRadius: 6, padding: '3px 8px',
            }}>
                <Search size={13} style={{ color: 'var(--joe-text-muted)', flexShrink: 0 }} />
                <input
                    type="text"
                    placeholder={`بحث في ${label}...`}
                    value={filter}
                    onChange={e => onFilterChange(e.target.value)}
                    style={{
                        background: 'none', border: 'none', outline: 'none',
                        color: 'var(--joe-text-primary, #fff)', fontSize: 12,
                        width: '100%', fontFamily: 'inherit',
                    }}
                />
            </div>

            {/* Count badge */}
            <span style={{
                fontSize: 11, color: 'var(--joe-text-muted)', whiteSpace: 'nowrap',
            }}>
                {count} {label}
            </span>

            {/* Copy All */}
            <button onClick={handleCopyAll} title="نسخ الكل" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: copied ? 'var(--joe-gold-primary, #d4af37)' : 'var(--joe-text-muted)',
                padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4,
                transition: 'color 0.2s',
            }}>
                {copied ? <CopyCheck size={14} /> : <Copy size={14} />}
            </button>

            {/* Clear */}
            <button onClick={onClear} title="مسح الكل" style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--joe-text-muted)', padding: 4, display: 'flex',
                alignItems: 'center', borderRadius: 4,
            }}>
                <Trash2 size={14} />
            </button>
        </div>
    );
}

// ─── Enhanced Logs Panel ───────────────────────────────────────────
function EnhancedLogsPanel({ logs }: { logs: string[] }) {
    const [filter, setFilter] = useState('');
    const [clearIndex, setClearIndex] = useState(0);
    const [autoScroll, setAutoScroll] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    const visibleLogs = logs.slice(clearIndex);
    const filtered = filter
        ? visibleLogs.filter(l => l.toLowerCase().includes(filter.toLowerCase()))
        : visibleLogs;

    // Auto-scroll
    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [filtered.length, autoScroll]);

    const handleCopyAll = () => {
        navigator.clipboard.writeText(filtered.join('\n')).catch(() => { });
    };

    const getLogColor = (log: string) => {
        if (log.includes('ERROR') || log.includes('SYSTEM ERROR')) return '#ef4444';
        if (log.includes('WARNING') || log.includes('WARN')) return '#eab308';
        if (log.includes('Step Started')) return '#3b82f6';
        if (log.includes('Step Done') || log.includes('Run Finished')) return '#22c55e';
        return 'var(--joe-text-secondary, #ccc)';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <PanelToolbar
                filter={filter}
                onFilterChange={setFilter}
                onCopyAll={handleCopyAll}
                onClear={() => setClearIndex(logs.length)}
                count={filtered.length}
                label="سجل"
            />

            <div
                ref={scrollRef}
                style={{
                    flex: 1, overflow: 'auto', padding: '4px 0',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 12, lineHeight: 1.6,
                }}
            >
                {filtered.length === 0 ? (
                    <div style={{
                        padding: 24, textAlign: 'center',
                        color: 'var(--joe-text-muted)', fontSize: 13,
                    }}>
                        ✓ لا توجد سجلات
                    </div>
                ) : (
                    filtered.map((log, i) => (
                        <div
                            key={clearIndex + i}
                            className="log-entry"
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 6,
                                padding: '3px 10px', color: getLogColor(log),
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                transition: 'background 0.1s',
                            }}
                        >
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log}</span>
                            <CopyBtn text={log} />
                        </div>
                    ))
                )}
            </div>

            {/* Auto-scroll toggle */}
            <div style={{
                display: 'flex', justifyContent: 'flex-end', padding: '4px 8px',
                borderTop: '1px solid var(--joe-border, rgba(255,255,255,0.08))',
                background: 'var(--joe-bg-secondary, rgba(0,0,0,0.2))',
                flexShrink: 0,
            }}>
                <button
                    onClick={() => setAutoScroll(!autoScroll)}
                    title={autoScroll ? 'إيقاف التمرير التلقائي' : 'تفعيل التمرير التلقائي'}
                    style={{
                        background: autoScroll ? 'var(--joe-gold-primary, #d4af37)' : 'transparent',
                        border: autoScroll ? 'none' : '1px solid var(--joe-text-muted)',
                        borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                        color: autoScroll ? '#000' : 'var(--joe-text-muted)',
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                        transition: 'all 0.2s',
                    }}
                >
                    <ArrowDownToLine size={12} />
                    <span className="hide-mobile">تمرير تلقائي</span>
                </button>
            </div>
        </div>
    );
}

// ─── Enhanced Problems Panel ───────────────────────────────────────
function EnhancedProblemsPanel({ problems }: { problems: any[] }) {
    const [filter, setFilter] = useState('');
    const [clearIndex, setClearIndex] = useState(0);

    const visible = problems.slice(clearIndex);
    const filtered = filter
        ? visible.filter(p => p.message?.toLowerCase().includes(filter.toLowerCase()))
        : visible;

    const handleCopyAll = () => {
        const text = filtered.map(p =>
            `[${p.type?.toUpperCase() || 'ERROR'}] ${p.message}${p.file ? ` (${p.file}${p.line ? `:${p.line}` : ''})` : ''}`
        ).join('\n');
        navigator.clipboard.writeText(text).catch(() => { });
    };

    const getTypeColor = (type: string) => {
        if (type === 'error') return '#ef4444';
        if (type === 'warning') return '#eab308';
        return 'var(--joe-text-muted)';
    };

    const getTypeIcon = (type: string) => {
        return type === 'error' ? '🔴' : type === 'warning' ? '🟡' : 'ℹ️';
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <PanelToolbar
                filter={filter}
                onFilterChange={setFilter}
                onCopyAll={handleCopyAll}
                onClear={() => setClearIndex(problems.length)}
                count={filtered.length}
                label="مشكلة"
            />

            <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
                {filtered.length === 0 ? (
                    <div style={{
                        padding: 24, textAlign: 'center',
                        color: 'var(--joe-text-muted)', fontSize: 13,
                    }}>
                        ✓ لا توجد مشاكل
                    </div>
                ) : (
                    filtered.map((p, i) => (
                        <div
                            key={clearIndex + i}
                            className="log-entry"
                            style={{
                                display: 'flex', alignItems: 'flex-start', gap: 8,
                                padding: '8px 10px',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                transition: 'background 0.1s',
                            }}
                        >
                            <span style={{ fontSize: 14, flexShrink: 0, lineHeight: '20px' }}>
                                {getTypeIcon(p.type)}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    color: getTypeColor(p.type),
                                    fontSize: 13, fontWeight: 500,
                                }}>
                                    {p.message}
                                </div>
                                {p.file && (
                                    <div style={{
                                        color: 'var(--joe-text-muted)', fontSize: 11, marginTop: 2,
                                        fontFamily: "'JetBrains Mono', monospace",
                                    }}>
                                        {p.file}{p.line ? `:${p.line}` : ''}
                                    </div>
                                )}
                                {p.time && (
                                    <div style={{
                                        color: 'var(--joe-text-muted)', fontSize: 10, marginTop: 2,
                                    }}>
                                        {new Date(p.time).toLocaleTimeString()}
                                    </div>
                                )}
                            </div>
                            <CopyBtn text={`[${p.type?.toUpperCase() || 'ERROR'}] ${p.message}`} />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

// ─── Main WorkspacePanel ───────────────────────────────────────────
export default function WorkspacePanel({
    activeTab: controlledTab,
    onTabChange,
    browserSessionId,
    terminalId,
    previewUrl,
    children,
    isMaximized,
    onMaximizeToggle,
    logs = [],
    problems = [],
    mobileCollapsed,
    onMobileToggle
}: WorkspacePanelProps) {
    const [internalCollapsed, setInternalCollapsed] = useState(false);
    const [internalTab, setInternalTab] = useState<WorkspaceTab>('browser');

    // Use external mobileCollapsed if provided, otherwise use internal state
    const isMobileCollapsed = mobileCollapsed !== undefined ? mobileCollapsed : internalCollapsed;

    const activeTab = controlledTab ?? internalTab;
    const handleTabChange = (tab: WorkspaceTab) => {
        if (onTabChange) {
            onTabChange(tab);
        } else {
            setInternalTab(tab);
        }
    };

    const handleMobileToggle = () => {
        if (onMobileToggle) {
            onMobileToggle();
        } else {
            setInternalCollapsed(!internalCollapsed);
        }
    };

    const tabs: { id: WorkspaceTab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { id: 'browser', label: 'Browser', icon: <Globe size={16} /> },
        { id: 'terminal', label: 'Terminal', icon: <TerminalIcon size={16} /> },
        { id: 'preview', label: 'Preview', icon: <Eye size={16} /> },
        { id: 'logs', label: 'Logs', icon: <FileOutput size={16} />, badge: logs.length > 0 ? logs.length : undefined },
        { id: 'problems', label: 'Problems', icon: <AlertTriangle size={16} />, badge: problems.length > 0 ? problems.length : undefined },
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
                            style={{ position: 'relative' }}
                        >
                            {tab.icon}
                            <span className="hide-mobile">{tab.label}</span>
                            {/* Badge */}
                            {tab.badge !== undefined && tab.badge > 0 && (
                                <span style={{
                                    background: tab.id === 'problems' ? '#ef4444' : 'var(--joe-gold-primary, #d4af37)',
                                    color: '#fff',
                                    fontSize: 9,
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 99,
                                    minWidth: 14,
                                    textAlign: 'center',
                                    lineHeight: '14px',
                                    marginLeft: 4,
                                }}>
                                    {tab.badge > 99 ? '99+' : tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Mobile Collapse Toggle */}
                <button
                    className="joe-header-btn show-mobile-only"
                    onClick={handleMobileToggle}
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
                    <ErrorBoundary fallbackTitle="تعذّر تحميل المتصفح">
                        <Suspense fallback={<LoadingFallback />}>
                            <EmbeddedBrowser sessionId={browserSessionId || 'panel-browser'} />
                        </Suspense>
                    </ErrorBoundary>
                )}

                {/* Terminal Tab */}
                {activeTab === 'terminal' && (
                    <ErrorBoundary fallbackTitle="تعذّر تحميل الطرفية (Terminal)">
                        <Suspense fallback={<LoadingFallback />}>
                            <EmbeddedTerminal terminalId={terminalId} />
                        </Suspense>
                    </ErrorBoundary>
                )}

                {/* Preview Tab - Always mounted so event listeners stay active */}
                <div style={{ display: activeTab === 'preview' ? 'contents' : 'none' }}>
                    <ErrorBoundary fallbackTitle="تعذّر تحميل المعاينة">
                        <Suspense fallback={<LoadingFallback />}>
                            <PreviewPanel url={previewUrl} />
                        </Suspense>
                    </ErrorBoundary>
                </div>

                {/* Logs Tab */}
                {activeTab === 'logs' && (
                    <EnhancedLogsPanel logs={logs} />
                )}

                {/* Problems Tab */}
                {activeTab === 'problems' && (
                    <EnhancedProblemsPanel problems={problems} />
                )}

                {/* Custom children */}
                {children}
            </div>
        </main>
    );
}
