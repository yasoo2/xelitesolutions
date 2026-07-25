import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * CommandPalette — a ⌘K / Ctrl+K quick launcher (Linear/Raycast/VS Code style).
 *
 * Fully keyboard-driven: type to filter, ↑/↓ to move, Enter to run, Esc to close.
 * Styled entirely through the app's emerald design tokens so it matches the theme
 * and adapts to light/dark automatically. Presentational + generic — the command
 * list is supplied by the parent.
 */

export interface Command {
    id: string;
    label: string;      // Arabic label (primary)
    hint?: string;      // small right-side hint (English/shortcut)
    icon?: React.ReactNode;
    keywords?: string;  // extra search terms
    run: () => void;
}

interface Props {
    open: boolean;
    onClose: () => void;
    commands: Command[];
    isArabic?: boolean;
}

export const CommandPalette: React.FC<Props> = ({ open, onClose, commands, isArabic = true }) => {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return commands;
        return commands.filter(c =>
            c.label.toLowerCase().includes(q) ||
            (c.hint || '').toLowerCase().includes(q) ||
            (c.keywords || '').toLowerCase().includes(q)
        );
    }, [query, commands]);

    useEffect(() => {
        if (open) {
            setQuery('');
            setActive(0);
            // focus after the panel mounts
            const t = setTimeout(() => inputRef.current?.focus(), 30);
            return () => clearTimeout(t);
        }
    }, [open]);

    useEffect(() => { setActive(0); }, [query]);

    if (!open) return null;

    const run = (c?: Command) => {
        if (!c) return;
        onClose();
        // let the overlay close before the action mutates layout
        setTimeout(() => { try { c.run(); } catch { /* noop */ } }, 0);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); run(filtered[active]); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };

    return (
        <div
            onMouseDown={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 4000,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: '12vh', animation: 'joeCmdFade .14s ease',
            }}
        >
            <div
                dir={isArabic ? 'rtl' : 'ltr'}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={onKeyDown}
                style={{
                    width: 'min(620px, 92vw)', maxHeight: '68vh', display: 'flex', flexDirection: 'column',
                    background: 'var(--joe-bg-card, #232428)',
                    border: '1px solid var(--joe-border, rgba(52,196,139,0.3))',
                    borderRadius: 16, overflow: 'hidden',
                    boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
                    animation: 'joeCmdPop .16s cubic-bezier(0.4,0,0.2,1)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--joe-border, rgba(255,255,255,0.08))' }}>
                    <span style={{ color: 'var(--joe-gold-primary, #34c48b)', fontSize: 18 }}>⌘</span>
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={isArabic ? 'ابحث أو نفّذ أمراً…' : 'Search or run a command…'}
                        style={{
                            flex: 1, background: 'transparent', border: 'none', outline: 'none',
                            color: 'var(--joe-text-primary, #eceef0)', fontSize: 15, fontFamily: 'inherit',
                        }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--joe-text-muted, #6e7178)', border: '1px solid var(--joe-border)', borderRadius: 6, padding: '2px 7px' }}>ESC</span>
                </div>

                <div ref={listRef} style={{ overflowY: 'auto', padding: 6 }}>
                    {filtered.length === 0 ? (
                        <div style={{ padding: '26px 16px', textAlign: 'center', color: 'var(--joe-text-muted, #6e7178)', fontSize: 13.5 }}>
                            {isArabic ? 'لا نتائج' : 'No results'}
                        </div>
                    ) : filtered.map((c, i) => (
                        <button
                            key={c.id}
                            onMouseEnter={() => setActive(i)}
                            onClick={() => run(c)}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', gap: 11,
                                padding: '10px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'start',
                                border: 'none', fontFamily: 'inherit', fontSize: 14,
                                color: i === active ? 'var(--joe-text-primary, #eceef0)' : 'var(--joe-text-secondary, #a2a5ad)',
                                background: i === active ? 'var(--joe-gold-subtle, rgba(52,196,139,0.14))' : 'transparent',
                            }}
                        >
                            <span style={{ width: 22, textAlign: 'center', color: 'var(--joe-gold-primary, #34c48b)', flex: '0 0 auto' }}>{c.icon || '›'}</span>
                            <span style={{ flex: 1 }}>{c.label}</span>
                            {c.hint && <span style={{ fontSize: 11.5, color: 'var(--joe-text-muted, #6e7178)' }}>{c.hint}</span>}
                        </button>
                    ))}
                </div>

                <style>{`
                  @keyframes joeCmdFade { from { opacity: 0 } to { opacity: 1 } }
                  @keyframes joeCmdPop { from { opacity: 0; transform: translateY(-8px) scale(.98) } to { opacity: 1; transform: none } }
                `}</style>
            </div>
        </div>
    );
};

export default CommandPalette;
