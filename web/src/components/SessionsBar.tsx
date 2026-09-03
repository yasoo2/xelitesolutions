/**
 * SessionsBar - Horizontal sessions list for quick switching
 * Shows at the bottom of the screen
 */

import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
    MessageSquare,
    Plus,
    X,
    Trash2,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

interface Session {
    id: string;
    title: string;
    preview?: string;
    timestamp: Date;
    isActive: boolean;
    /** Joe is still working in this conversation, even if you are not in it. */
    isRunning?: boolean;
}

interface SessionsBarProps {
    sessions: Session[];
    onSelect: (id: string) => void;
    onDelete: (id: string) => void;
    onDeleteAll?: () => void;
    onNew: () => void;
    showInAgentMode?: boolean; // If false, hide in agent mode
}

export default function SessionsBar({
    sessions,
    onSelect,
    onDelete,
    onDeleteAll,
    onNew,
    showInAgentMode = false
}: SessionsBarProps) {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const handleDeleteAll = () => {
        if (window.confirm(t('sidebar.deleteAllConfirm'))) {
            onDeleteAll?.();
        }
    };

    const scroll = useCallback((direction: 'left' | 'right') => {
        if (!scrollRef.current) return;
        const amount = direction === 'left' ? -200 : 200;
        scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }, []);

    return (
        <div
            className="joe-sessions-bar"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: 'color-mix(in srgb, var(--bg-card) 72%, transparent)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--border-color)',
                height: 42,
            }}
        >
            {/* Sessions Label */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                color: 'var(--text-muted)',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                paddingLeft: 4
            }}>
                <MessageSquare size={14} />
                <span className="hide-mobile">{t('sidebar.sessions')} · {sessions.length}</span>
            </div>

            {/* Scroll Left */}
            <button
                onClick={() => scroll('right')}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <ChevronRight size={16} />
            </button>

            {/* Sessions List */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    display: 'flex',
                    gap: 6,
                    overflow: 'auto',
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none',
                }}
                className="no-scrollbar"
            >
                {sessions.map(session => (
                    <SessionChip
                        key={session.id}
                        session={session}
                        onSelect={() => onSelect(session.id)}
                        onDelete={() => onDelete(session.id)}
                        isHovered={hoveredId === session.id}
                        onHover={(hovered) => setHoveredId(hovered ? session.id : null)}
                    />
                ))}

                {sessions.length === 0 && (
                    <div style={{
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        padding: '6px 12px',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        {t('sidebar.noResults')}
                    </div>
                )}
            </div>

            {/* Scroll Right */}
            <button
                onClick={() => scroll('left')}
                style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                <ChevronLeft size={16} />
            </button>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {sessions.length > 0 && onDeleteAll && (
                    <button
                        onClick={handleDeleteAll}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 32,
                            height: 32,
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        title={t('sidebar.deleteAll')}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                        }}
                    >
                        <Trash2 size={16} />
                    </button>
                )}

                {/* New Session Button */}
                <button
                    className="joe-sessions-new"
                    onClick={onNew}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        background: 'linear-gradient(135deg, var(--joe-gold-primary, var(--accent-primary)), var(--joe-gold-dark, var(--accent-primary)))',
                        color: 'var(--joe-on-accent, #08130d)',
                        border: 'none',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 650,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 10px rgba(52, 196, 139, 0.25)',
                    }}
                >
                    <Plus size={14} />
                    <span className="hide-mobile">{t('sidebar.newChat')}</span>
                </button>
            </div>

        </div>
    );
}

function SessionChip({
    session,
    onSelect,
    onDelete,
    isHovered,
    onHover
}: {
    session: Session;
    onSelect: () => void;
    onDelete: () => void;
    isHovered: boolean;
    onHover: (hovered: boolean) => void;
}) {
    const { t } = useTranslation();
    return (
        <motion.div
            className="joe-session-chip"
            layout
            /*
             *  A CHIP THAT DOES NOT SAY WHICH SESSION IT IS CANNOT BE MEASURED.
             *
             *  The row is drawn with inline styles and no handle, so an
             *  instrument checking «does this session show its own preview»
             *  had to guess by position and picked a search dropdown instead,
             *  reporting a session called «No results». A test that cannot
             *  name what it clicked cannot testify about what it saw.
             */
            data-session-id={session.id}
            data-session-active={session.isActive ? 'true' : 'false'}
            onMouseEnter={() => onHover(true)}
            onMouseLeave={() => onHover(false)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                background: session.isActive
                    ? 'rgba(var(--accent-primary-rgb), 0.15)'
                    : 'var(--bg-hover)',
                border: session.isActive
                    ? '1px solid var(--accent-primary)'
                    : '1px solid var(--border-color)',
                borderRadius: 8,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minWidth: 0,
                maxWidth: 180,
                flex: '0 0 auto',
            }}
            onClick={onSelect}
        >
            {/*
                WORKING IN THE BACKGROUND — one small breathing dot.
                He asked for something «انيق وعصري وبسيط»: not a spinner, not a
                badge, not a word. A 6px dot that pulses is readable at a glance
                across a whole row of chips and says nothing when there is
                nothing to say.
            */}
            {session.isRunning ? (
                <span
                    className="session-live-dot"
                    aria-label="working"
                    title="Joe is working here"
                    style={{
                        width: 6, height: 6, borderRadius: 999, flex: 'none',
                        background: '#10b981',
                    }}
                />
            ) : null}
            <span
                style={{
                    fontSize: 12,
                    color: session.isActive ? 'var(--accent-primary)' : 'var(--text-primary)',
                    fontWeight: session.isActive ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {/* Sessions created before naming kicks in were stored with a literal
                    English "New Session" title — show the localized label instead. */}
                {!session.title || /^new (session|chat)$/i.test(session.title.trim())
                    ? t('sidebar.newChat')
                    : session.title}
            </span>

            <AnimatePresence>
                {isHovered && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete();
                        }}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: 2,
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        <X size={12} />
                    </motion.button>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

// Time formatting helper
function formatTime(date: Date, t: any): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('time.now', 'Just now');
    if (minutes < 60) return t('time.minutes_ago', { count: minutes, defaultValue: '{{count}}m ago' });
    if (hours < 24) return t('time.hours_ago', { count: hours, defaultValue: '{{count}}h ago' });
    return t('time.days_ago', { count: days, defaultValue: '{{count}}d ago' });
}
