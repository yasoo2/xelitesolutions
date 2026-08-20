import { stripPictographs } from '../lib/plainText';
import React, { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Globe, Terminal as TerminalIcon, Eye, Loader, Maximize2,
    ChevronDown, ChevronUp, FileOutput, AlertTriangle,
    Copy, CopyCheck, Trash2, Search, ArrowDownToLine, Columns2
} from 'lucide-react';
import { ErrorBoundary } from './ErrorBoundary';

// Lazy load the heavy components
const EnterpriseTerminalPanel = lazy(() => import('./terminal/EnterpriseTerminalPanel'));
const EmbeddedBrowser = lazy(() => import('./EmbeddedBrowser'));
const PreviewPanel = lazy(() => import('./PreviewPanel'));


type WorkspaceTab = 'browser' | 'terminal' | 'preview' | 'logs' | 'problems';

/**
 * A file Joe is building, streamed into the Logs panel as it truly grows.
 *
 * `content` is appended from `file_stream` events, each carrying a section's
 * real HTML the moment it was accepted; `done` flips when the file hit disk.
 * Nothing here is animated for effect — the panel shows exactly what exists,
 * when it exists.
 */
export interface LiveFile {
    file: string;
    content: string;
    done: boolean;
    label?: string;
    bytes: number;
    updatedAt: number;
}

/**
 * The build's current stage, as reported by the server the moment the log
 * line proving it was pushed. `scores` accumulates audit results so they stay
 * visible after the build moves past the audits.
 */
export interface BuildStatusState {
    current: {
        stage: string;
        labelAr: string;
        label: string;
        detail: string;
        score?: number;
        section?: { index: number; id: string };
        terminal?: boolean;
    };
    scores: Record<string, number>;
    done: boolean;
}

interface WorkspacePanelProps {
    activeTab?: WorkspaceTab;
    onTabChange?: (tab: WorkspaceTab) => void;
    sessionId?: string;
    browserSessionId?: string;
    terminalId?: string;
    workspaceId?: string;
    previewUrl?: string;
    children?: React.ReactNode;
    isMaximized?: boolean;
    onMaximizeToggle?: () => void;
    logs?: string[];
    liveFiles?: LiveFile[];
    buildStatus?: BuildStatusState | null;
    problems?: any[];
    mobileCollapsed?: boolean;
    onMobileToggle?: () => void;
}

// ─── Inline Copy Button ────────────────────────────────────────────
function CopyBtn({ text }: { text: string }) {
    const { t } = useTranslation();
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
            title={t('copy')}
            style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                color: copied ? 'var(--joe-gold-primary, #2ba179)' : 'var(--joe-text-muted, #888)',
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

/**
 * Copy that actually lands. navigator.clipboard silently rejects when the
 * document has lost focus or the permission is denied — the old handler
 * swallowed that rejection, so the button LOOKED like it did nothing (the
 * user reported exactly that). The textarea + execCommand path works in
 * every browser context this app runs in, so it is the fallback.
 */
function copyTextRobustly(text: string): void {
    const fallback = () => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            ta.remove();
        } catch { /* nothing else to try */ }
    };
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(fallback);
    } else {
        fallback();
    }
}

// ─── Panel Toolbar ─────────────────────────────────────────────────
function PanelToolbar({ filter, onFilterChange, onCopyAll, onClear, count, label }:
    { filter: string; onFilterChange: (v: string) => void; onCopyAll: () => void; onClear: () => void; count: number; label: string }) {

    const { t } = useTranslation();
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
                    placeholder={t('searchIn', { label })}
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
            <button onClick={handleCopyAll} title={t('copyAll')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: copied ? 'var(--joe-gold-primary, #2ba179)' : 'var(--joe-text-muted)',
                padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4,
                transition: 'color 0.2s',
            }}>
                {copied ? <CopyCheck size={14} /> : <Copy size={14} />}
            </button>

            {/* Clear */}
            <button onClick={onClear} title={t('clearAll')} style={{
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
/** One growing file: name, size, state, and the code itself. */
function LiveFileCard({ f }: { f: LiveFile }) {
    const [open, setOpen] = useState(true);
    const preRef = useRef<HTMLPreElement>(null);
    // Follow the code as it arrives, like a terminal does.
    useEffect(() => {
        if (open && preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
    }, [f.content.length, open]);

    return (
        <div style={{
            margin: '6px 10px', borderRadius: 8, overflow: 'hidden',
            border: `1px solid ${f.done ? 'rgba(34,197,94,.35)' : 'rgba(59,130,246,.35)'}`,
            background: 'rgba(0,0,0,.25)',
        }}>
            <button
                onClick={() => setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '6px 10px', background: 'rgba(255,255,255,.04)',
                    border: 'none', cursor: 'pointer', color: 'inherit',
                    fontFamily: 'inherit', fontSize: 12, textAlign: 'start',
                }}
            >
                <FileOutput size={13} style={{ flex: 'none', color: f.done ? '#22c55e' : '#3b82f6' }} />
                <span style={{ fontWeight: 600, direction: 'ltr' }}>{f.file}</span>
                <span style={{ color: 'var(--joe-text-muted)', fontSize: 11 }}>
                    {(f.content.length / 1024).toFixed(1)} KB
                </span>
                <span style={{
                    marginInlineStart: 'auto', fontSize: 11,
                    color: f.done ? '#22c55e' : '#3b82f6',
                }}>
                    {f.done ? '✓ اكتمل' : (f.label || '⋯ يُكتب الآن')}
                </span>
            </button>
            {open && (
                <pre
                    ref={preRef}
                    dir="ltr"
                    style={{
                        margin: 0, padding: '8px 12px', maxHeight: 260, overflow: 'auto',
                        fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word', color: 'var(--joe-text-secondary, #cbd5e1)',
                        borderTop: '1px solid rgba(255,255,255,.05)',
                    }}
                >{stripPictographs(f.content)}{!f.done && <span className="joe-live-caret">▌</span>}</pre>
            )}
        </div>
    );
}

const LIVE_CARET_CSS = `
@keyframes joeLiveCaret { 0%,49%{opacity:1} 50%,100%{opacity:0} }
.joe-live-caret{ animation: joeLiveCaret 1s step-start infinite; color:#3b82f6 }
@media (prefers-reduced-motion: reduce){ .joe-live-caret{ animation:none } }
`;

/**
 * One line of truth about the running build: the stage that JUST produced a
 * log line, plus every audit score seen so far. There is no percentage bar
 * because the server does not know one — a stalled build shows a stalled
 * strip, which is exactly what the user should see.
 */
function BuildStatusStrip({ status }: { status: BuildStatusState }) {
    const scoreColor = (n: number) => (n >= 90 ? '#10b981' : n >= 70 ? '#f59e0b' : '#ef4444');
    const scoreLabel: Record<string, string> = {
        'audit-visual': 'بصري',
        'audit-behaviour': 'تفاعل',
    };
    return (
        <div dir="rtl" style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '8px 12px', marginBottom: 6, borderRadius: 8,
            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.18)',
            fontSize: 12,
        }}>
            {!status.done && (
                <span className="joe-live-caret" aria-hidden style={{ fontWeight: 700 }}>●</span>
            )}
            {status.done && <span aria-hidden style={{ color: 'var(--joe-text-muted, #6e7178)', fontWeight: 700 }}>·</span>}
            <span style={{ fontWeight: 600, color: 'var(--joe-text, #e4e4e7)' }}>
                {status.current.labelAr}
            </span>
            {Object.entries(status.scores).map(([stage, n]) => (
                <span key={stage} style={{
                    padding: '1px 8px', borderRadius: 999, fontWeight: 700,
                    color: scoreColor(n), border: `1px solid ${scoreColor(n)}55`,
                    background: `${scoreColor(n)}14`,
                }}>
                    {scoreLabel[stage] || stage} {n}/100
                </span>
            ))}
            <span dir="ltr" style={{
                color: 'var(--joe-text-muted, #71717a)',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                flex: 1, minWidth: 120, textAlign: 'left',
            }}>
                {status.current.detail}
            </span>
        </div>
    );
}

/** A sticky divider so the files and the log lines read as two ORDERED
 *  sections instead of one undifferentiated stream. */
function SectionHeading({ label, note }: { label: string; note?: string }) {
    return (
        <div dir="rtl" style={{
            position: 'sticky', top: 0, zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 12px', margin: '2px 0 4px',
            background: 'var(--joe-bg-secondary, rgba(15,15,18,.92))',
            borderBottom: '1px solid rgba(255,255,255,.07)',
            fontSize: 11, fontWeight: 700, letterSpacing: 0,
            color: 'var(--joe-text-muted, #a1a1aa)',
        }}>
            <span>{label}</span>
            {note ? <span style={{ marginInlineStart: 'auto', fontWeight: 500 }}>{note}</span> : null}
        </div>
    );
}

function EnhancedLogsPanel({ logs, liveFiles = [], buildStatus = null }: { logs: string[]; liveFiles?: LiveFile[]; buildStatus?: BuildStatusState | null }) {
    const { t } = useTranslation();
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
    }, [filtered.length, autoScroll, liveFiles.reduce((n, f) => n + f.content.length, 0)]);

    const handleCopyAll = () => {
        // Everything the panel SHOWS is what "copy all" copies: the live file
        // contents too, not just the log lines — copying half the screen and
        // reporting success read as "the button does not work".
        const parts: string[] = [];
        for (const f of liveFiles) {
            parts.push(`===== ${f.file}${f.done ? '' : ' (still building)'} =====`);
            parts.push(f.content);
        }
        parts.push(...filtered);
        copyTextRobustly(parts.join('\n'));
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
            <style>{LIVE_CARET_CSS}</style>
            <PanelToolbar
                filter={filter}
                onFilterChange={setFilter}
                onCopyAll={handleCopyAll}
                onClear={() => setClearIndex(logs.length)}
                count={filtered.length}
                label={t('logLabel')}
            />

            <div
                ref={scrollRef}
                style={{
                    flex: 1, overflow: 'auto', padding: '4px 0',
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontSize: 12, lineHeight: 1.6,
                }}
            >
                {buildStatus && <BuildStatusStrip status={buildStatus} />}
                {liveFiles.length > 0 && (
                    <div style={{ paddingBottom: 4 }}>
                        <SectionHeading
                            label={`الملفات (${liveFiles.length})`}
                            note={`${liveFiles.filter(f => f.done).length} مكتمل`}
                        />
                        {liveFiles.map(f => <LiveFileCard key={f.file} f={f} />)}
                    </div>
                )}
                {liveFiles.length > 0 && filtered.length > 0 && (
                    <SectionHeading label={`السجل (${filtered.length})`} />
                )}
                {filtered.length === 0 && liveFiles.length === 0 ? (
                    <div style={{
                        padding: 24, textAlign: 'center',
                        color: 'var(--joe-text-muted)', fontSize: 13,
                    }}>
                        لا توجد سجلات
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
                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{stripPictographs(log)}</span>
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
                    title={autoScroll ? t('autoScrollOff') : t('autoScrollOn')}
                    style={{
                        background: autoScroll ? 'var(--joe-gold-primary, #2ba179)' : 'transparent',
                        border: autoScroll ? 'none' : '1px solid var(--joe-text-muted)',
                        borderRadius: 4, padding: '2px 6px', cursor: 'pointer',
                        color: autoScroll ? 'var(--joe-on-accent, #08130d)' : 'var(--joe-text-muted)',
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
    const { t } = useTranslation();
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
        copyTextRobustly(text);
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
                label={t('problemLabel')}
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
    sessionId,
    browserSessionId,
    terminalId,
    workspaceId,
    previewUrl,
    children,
    isMaximized,
    onMaximizeToggle,
    logs = [],
    liveFiles = [],
    buildStatus = null,
    problems = [],
    mobileCollapsed,
    onMobileToggle
}: WorkspacePanelProps) {
    const { t } = useTranslation();
    const [internalCollapsed, setInternalCollapsed] = useState(false);
    // 'logs', not 'browser': the browser panel opens a real Chromium when it
    // mounts, and a default must never do that.
    const [internalTab, setInternalTab] = useState<WorkspaceTab>('logs');

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

    // Split view: Logs + Preview side by side — watch the code being written
    // and the page taking shape at the same moment, no tab hopping. The
    // preference survives reloads.
    const [splitView, setSplitView] = useState<boolean>(() => {
        try { return localStorage.getItem('joe-split-view') === '1'; } catch { return false; }
    });
    const toggleSplit = () => {
        setSplitView(v => {
            try { localStorage.setItem('joe-split-view', v ? '0' : '1'); } catch { }
            return !v;
        });
    };
    const splitActive = splitView && (activeTab === 'logs' || activeTab === 'preview');

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
        { id: 'logs', label: 'Logs', icon: <FileOutput size={16} />, badge: (logs.length + liveFiles.length) > 0 ? logs.length + liveFiles.length : undefined },
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
                {/* One segmented control: every tab lives inside the same rounded
                    rail and the active one is a raised thumb — instead of loose
                    labels floating in the bar. */}
                <div className="joe-tab-segment">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            className={`joe-workspace-tab ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => handleTabChange(tab.id)}
                        >
                            {tab.icon}
                            <span className="hide-mobile">{tab.label}</span>
                            {tab.badge !== undefined && tab.badge > 0 && (
                                <span className={`joe-tab-badge ${tab.id === 'problems' ? 'danger' : ''}`}>
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

                {/* Split: Logs + Preview side by side (active on those tabs) */}
                {(activeTab === 'logs' || activeTab === 'preview') && (
                    <button
                        className="joe-header-btn hide-mobile"
                        onClick={toggleSplit}
                        title={splitView ? 'عرض مفرد' : 'السجلات + المعاينة معاً'}
                        style={{
                            border: 'none',
                            background: splitActive ? 'rgba(52,196,139,0.12)' : 'transparent',
                            color: splitActive ? 'var(--joe-gold-primary)' : undefined,
                            borderRadius: 8,
                        }}
                    >
                        <Columns2 size={16} />
                    </button>
                )}

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
                    <ErrorBoundary fallbackTitle={t('loadBrowserFailed')}>
                        <Suspense fallback={<LoadingFallback />}>
                            <EmbeddedBrowser sessionId={browserSessionId || (sessionId ? `browser:${sessionId}` : '')} />
                        </Suspense>
                    </ErrorBoundary>
                )}

                {/* Terminal Tab */}
                {activeTab === 'terminal' && (
                    <ErrorBoundary fallbackTitle={t('loadTerminalFailed')}>
                        <Suspense fallback={<LoadingFallback />}>
                            <EnterpriseTerminalPanel sessionId={sessionId} terminalId={terminalId} workspaceId={workspaceId} isEmbedded={true} />
                        </Suspense>
                    </ErrorBoundary>
                )}

                {/* Logs + Preview share a split-capable area. The preview stays
                    ALWAYS mounted (its event listeners must survive tab hops);
                    in split mode each pane takes half, logs beside preview. */}
                <div
                    style={splitActive
                        ? { display: 'flex', width: '100%', height: '100%', minHeight: 0 }
                        : { display: 'contents' }}
                >
                    {(activeTab === 'logs' || splitActive) && (
                        <div style={splitActive
                            ? { flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', borderInlineEnd: '1px solid var(--joe-border)' }
                            : { display: 'contents' }}>
                            <EnhancedLogsPanel logs={logs} liveFiles={liveFiles} buildStatus={buildStatus} />
                        </div>
                    )}
                    <div style={splitActive
                        ? { flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column' }
                        : { display: activeTab === 'preview' ? 'contents' : 'none' }}>
                        <ErrorBoundary fallbackTitle={t('loadPreviewFailed')}>
                            <Suspense fallback={<LoadingFallback />}>
                                <PreviewPanel url={previewUrl} />
                            </Suspense>
                        </ErrorBoundary>
                    </div>
                </div>

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
