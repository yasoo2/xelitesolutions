/**
 * BottomPanel - IDE-style collapsible bottom panel
 * Contains: Problems, Output, Terminal, Browser, Preview, Ports tabs
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertTriangle,
    Terminal,
    Globe,
    Eye,
    Plug,
    FileOutput,
    ChevronDown,
    ChevronUp,
    X,
    Maximize2,
    Minimize2,
    GripHorizontal
} from 'lucide-react';

export type PanelTab = 'problems' | 'output' | 'terminal' | 'browser' | 'preview' | 'ports';

interface TabConfig {
    id: PanelTab;
    label: string;
    labelAr: string;
    icon: React.ElementType;
    badge?: number;
}

const TABS: TabConfig[] = [
    { id: 'problems', label: 'Problems', labelAr: 'المشاكل', icon: AlertTriangle },
    { id: 'output', label: 'Output', labelAr: 'المخرجات', icon: FileOutput },
    { id: 'terminal', label: 'Terminal', labelAr: 'الطرفية', icon: Terminal },
    { id: 'browser', label: 'Browser', labelAr: 'المتصفح', icon: Globe },
    { id: 'preview', label: 'Preview', labelAr: 'المعاينة', icon: Eye },
    { id: 'ports', label: 'Ports', labelAr: 'المنافذ', icon: Plug },
];

interface BottomPanelProps {
    isOpen: boolean;
    onToggle: () => void;
    activeTab: PanelTab;
    onTabChange: (tab: PanelTab) => void;
    badges?: Partial<Record<PanelTab, number>>;
    children?: React.ReactNode;
    height?: number;
    onHeightChange?: (height: number) => void;
    isMaximized?: boolean;
    onMaximize?: () => void;
}

export default function BottomPanel({
    isOpen,
    onToggle,
    activeTab,
    onTabChange,
    badges = {},
    children,
    height = 300,
    onHeightChange,
    isMaximized = false,
    onMaximize
}: BottomPanelProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        dragStartY.current = e.clientY;
        dragStartHeight.current = height;
    }, [height]);

    useEffect(() => {
        if (!isDragging) return;

        const handleDrag = (e: MouseEvent) => {
            const delta = dragStartY.current - e.clientY;
            const newHeight = Math.min(Math.max(dragStartHeight.current + delta, 150), window.innerHeight * 0.7);
            onHeightChange?.(newHeight);
        };

        const handleDragEnd = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleDrag);
        window.addEventListener('mouseup', handleDragEnd);

        return () => {
            window.removeEventListener('mousemove', handleDrag);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging, onHeightChange]);

    return (
        <div
            ref={panelRef}
            className="bottom-panel"
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-card)',
                borderTop: '1px solid var(--border-color)',
                transition: isDragging ? 'none' : 'height 0.2s ease',
                height: isOpen ? (isMaximized ? '70vh' : height) : 'auto',
                minHeight: isOpen ? 150 : 'auto',
            }}
        >
            {/* Resize Handle */}
            {isOpen && !isMaximized && (
                <div
                    onMouseDown={handleDragStart}
                    style={{
                        position: 'absolute',
                        top: -4,
                        left: 0,
                        right: 0,
                        height: 8,
                        cursor: 'ns-resize',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                    }}
                >
                    <GripHorizontal
                        size={14}
                        style={{
                            color: 'var(--text-muted)',
                            opacity: isDragging ? 1 : 0.5,
                            transition: 'opacity 0.2s'
                        }}
                    />
                </div>
            )}

            {/* Tab Bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 8px',
                    height: 36,
                    borderBottom: isOpen ? '1px solid var(--border-color)' : 'none',
                    background: 'var(--bg-secondary)',
                    userSelect: 'none',
                }}
            >
                {/* Tabs */}
                <div style={{ display: 'flex', gap: 0, overflow: 'auto' }}>
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const badge = badges[tab.id];
                        const isActive = activeTab === tab.id && isOpen;

                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if (activeTab === tab.id && isOpen) {
                                        onToggle();
                                    } else {
                                        onTabChange(tab.id);
                                        if (!isOpen) onToggle();
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    padding: '6px 12px',
                                    background: isActive ? 'var(--bg-card)' : 'transparent',
                                    border: 'none',
                                    borderBottom: isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                    fontSize: 12,
                                    fontWeight: isActive ? 600 : 400,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <Icon size={14} />
                                <span className="hide-mobile">{tab.labelAr}</span>
                                {badge !== undefined && badge > 0 && (
                                    <span
                                        style={{
                                            background: tab.id === 'problems' ? 'var(--accent-danger, #ef4444)' : 'var(--accent-primary)',
                                            color: '#fff',
                                            fontSize: 10,
                                            fontWeight: 700,
                                            padding: '1px 5px',
                                            borderRadius: 99,
                                            minWidth: 16,
                                            textAlign: 'center',
                                        }}
                                    >
                                        {badge > 99 ? '99+' : badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isOpen && (
                        <button
                            onClick={onMaximize}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: 4,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            title={isMaximized ? 'تصغير' : 'تكبير'}
                        >
                            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                        </button>
                    )}
                    <button
                        onClick={onToggle}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                        title={isOpen ? 'إغلاق' : 'فتح'}
                    >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </button>
                </div>
            </div>

            {/* Content */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        style={{
                            flex: 1,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {children}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Tab Content Wrapper
export function PanelContent({
    show,
    children
}: {
    show: boolean;
    children: React.ReactNode;
}) {
    if (!show) return null;
    return (
        <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
            {children}
        </div>
    );
}

// Problems List Component
export function ProblemsPanel({
    problems = []
}: {
    problems: Array<{ type: 'error' | 'warning' | 'info'; message: string; file?: string; line?: number }>;
}) {
    if (problems.length === 0) {
        return (
            <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13
            }}>
                ✓ لا توجد مشاكل
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {problems.map((p, i) => (
                <div
                    key={i}
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 6,
                        background: 'var(--bg-hover)',
                        fontSize: 12,
                    }}
                >
                    <AlertTriangle
                        size={14}
                        style={{
                            color: p.type === 'error' ? 'var(--accent-danger, #ef4444)' :
                                p.type === 'warning' ? '#eab308' : 'var(--text-muted)',
                            flexShrink: 0,
                            marginTop: 2
                        }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: 'var(--text-primary)' }}>{p.message}</div>
                        {p.file && (
                            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>
                                {p.file}{p.line ? `:${p.line}` : ''}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Output Panel Component
export function OutputPanel({
    logs = []
}: {
    logs: string[];
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <div
            ref={containerRef}
            style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                color: 'var(--text-secondary)',
                height: '100%',
                overflow: 'auto',
            }}
        >
            {logs.length === 0 ? (
                <span style={{ color: 'var(--text-muted)' }}>لا توجد مخرجات</span>
            ) : (
                logs.map((log, i) => <div key={i}>{log}</div>)
            )}
        </div>
    );
}

// Ports Panel Component
export function PortsPanel({
    ports = []
}: {
    ports: Array<{ port: number; process: string; url?: string }>;
}) {
    if (ports.length === 0) {
        return (
            <div style={{
                padding: 24,
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: 13
            }}>
                لا توجد منافذ نشطة
            </div>
        );
    }

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>المنفذ</th>
                    <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>العملية</th>
                    <th style={{ textAlign: 'right', padding: 8, color: 'var(--text-muted)' }}>الرابط</th>
                </tr>
            </thead>
            <tbody>
                {ports.map((p, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: 8, color: 'var(--accent-primary)' }}>{p.port}</td>
                        <td style={{ padding: 8, color: 'var(--text-primary)' }}>{p.process}</td>
                        <td style={{ padding: 8 }}>
                            {p.url ? (
                                <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener"
                                    style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}
                                >
                                    فتح
                                </a>
                            ) : '-'}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
