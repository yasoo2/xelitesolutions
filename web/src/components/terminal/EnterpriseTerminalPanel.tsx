import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import { SocketService } from '../../services/socket';
import { API_URL } from '../../config';
import { Terminal as TerminalIcon, RefreshCw, Trash2, Maximize2, Minimize2, X, Copy, Download, Check, Search, ChevronUp, ChevronDown } from 'lucide-react';

// ANSI escape sequences are display, not content — strip them for copy/download.
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
const LOG_BUFFER_CAP = 2_000_000; // ~2 MB of scrollback kept for copy/download

interface EnterpriseTerminalPanelProps {
    onClose?: () => void;
    isEmbedded?: boolean;
    terminalId?: string;
    workspaceId?: string;
}

export default function EnterpriseTerminalPanel({ onClose, isEmbedded, terminalId, workspaceId }: EnterpriseTerminalPanelProps) {
    const activeTabId = terminalId || 'local_terminal';
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [isConnecting, setIsConnecting] = useState(true);
    // Bumping this remounts the xterm instance and re-creates the shell session —
    // reconnect used to window.location.reload() the ENTIRE app to do this.
    const [sessionEpoch, setSessionEpoch] = useState(0);
    const [justCopied, setJustCopied] = useState(false);
    const isReadyRef = useRef(false);
    const logBufferRef = useRef('');

    // Search across the scrollback (Ctrl+F). The addon highlights matches and
    // scrolls to them; the counter shows «الموضع/الإجمالي» honestly from the
    // addon's own results event — no fake numbers.
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<{ resultIndex: number; resultCount: number } | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const SEARCH_DECOR = {
        decorations: {
            matchOverviewRuler: '#f59e0b',
            activeMatchColorOverviewRuler: '#10b981',
            matchBackground: 'rgba(245, 158, 11, 0.35)',
            activeMatchBackground: 'rgba(16, 185, 129, 0.55)',
        },
    } as const;
    const runSearch = (q: string, dir: 'next' | 'prev' = 'next') => {
        const addon = searchAddonRef.current;
        if (!addon || !q) { setSearchResults(null); addon?.clearDecorations(); return; }
        if (dir === 'next') addon.findNext(q, SEARCH_DECOR);
        else addon.findPrevious(q, SEARCH_DECOR);
    };

    useEffect(() => {
        if (!containerRef.current || isMinimized) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 13,
            theme: {
                background: '#09090b', // Zinc-950
                foreground: '#f4f4f5', // Zinc-100
                cursor: '#10b981', // Emerald-500
                selectionBackground: 'rgba(16, 185, 129, 0.3)',
                black: '#09090b',
                red: '#ef4444',
                green: '#10b981',
                yellow: '#f59e0b',
                blue: '#3b82f6',
                magenta: '#8b5cf6',
                cyan: '#06b6d4',
                white: '#fafafa',
                brightBlack: '#52525b',
                brightRed: '#f87171',
                brightGreen: '#34d399',
                brightYellow: '#fbbf24',
                brightBlue: '#60a5fa',
                brightMagenta: '#a78bfa',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff'
            },
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        const searchAddon = new SearchAddon();
        term.loadAddon(searchAddon);
        searchAddonRef.current = searchAddon;
        // The addon reports the real match position/count as it searches.
        searchAddon.onDidChangeResults((r: any) => {
            setSearchResults(r && r.resultCount >= 0 ? { resultIndex: r.resultIndex, resultCount: r.resultCount } : null);
        });

        // Ctrl+F opens search instead of the browser's find (useless on canvas
        // scrollback); Escape is handled by the input itself.
        term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
            if (e.type === 'keydown' && e.ctrlKey && (e.key === 'f' || e.key === 'F')) {
                e.preventDefault();
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 50);
                return false;
            }
            return true;
        });

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // [FIX] Only open xterm once the container is actually visible/sized.
        // Opening on a hidden (0-size) tab leaves the renderer half-initialised and
        // xterm later crashes in Viewport._innerRefresh ("dimensions" of undefined).
        let openTries = 0;
        const openWhenVisible = () => {
            const el = containerRef.current;
            if (!el || termRef.current !== term) return; // unmounted or replaced
            if (el.clientWidth > 0 && el.clientHeight > 0) {
                try {
                    term.open(el);
                    if (el.clientWidth > 0 && el.clientHeight > 0) fitAddon.fit();
                } catch (err) {
                    console.warn('[Terminal] open/fit skipped:', err);
                }
            } else if (openTries++ < 600) {
                requestAnimationFrame(openWhenVisible);
            }
        };
        requestAnimationFrame(openWhenVisible);

        // Input handler
        term.onData((data) => {
            if (!isReadyRef.current) return;
            SocketService.send({
                type: 'terminal_input',
                id: activeTabId,
                data
            });
        });

        const initTerminal = async () => {
            setIsConnecting(true);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'create',
                        id: activeTabId,
                        shell: 'bash',
                        workspaceId,
                        cols: term.cols,
                        rows: term.rows
                    })
                });
                const data = await res.json();
                if (data.ok || (data.output && data.output.existing)) {
                    isReadyRef.current = true;
                    setIsReady(true);
                    term.focus();
                    term.writeln('\x1b[1;32m✓ Joe Terminal Session Ready\x1b[0m');
                } else {
                    term.writeln(`\x1b[1;31m✗ ${data.error || 'Failed to create session'}\x1b[0m`);
                }
            } catch (e) {
                term.writeln('\x1b[1;31m✗ Connection Failed\x1b[0m');
            } finally {
                setIsConnecting(false);
            }
        };

        initTerminal();

        // Handle Resize
        const handleResize = () => {
            if (!fitAddonRef.current || !termRef.current || !containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            try {
                fitAddonRef.current.fit();
                SocketService.send({
                    type: 'terminal_resize',
                    id: activeTabId,
                    cols: termRef.current.cols,
                    rows: termRef.current.rows
                });
            } catch (err) {
                console.warn('[Terminal] Resize error:', err);
            }
        };

        window.addEventListener('resize', handleResize);
        const resizeObserver = new ResizeObserver(() => handleResize());
        resizeObserver.observe(containerRef.current);

        return () => {
            window.removeEventListener('resize', handleResize);
            resizeObserver.disconnect();
            termRef.current = null;
            fitAddonRef.current = null;
            searchAddonRef.current = null;
            isReadyRef.current = false;
            try {
                term.dispose();
            } catch { }
        };
    }, [activeTabId, isMinimized, workspaceId, sessionEpoch]);

    // Handle incoming data
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            // 'joe-agent' carries the commands Joe runs autonomously — shown in
            // the SAME terminal so the user watches Joe work the shell in real
            // time, fulfilling the standing "use the terminal" promise visibly.
            if (msg.type === 'terminal_output' && (msg.id === activeTabId || msg.id === 'joe-agent' || !msg.id)) {
                termRef.current?.write(msg.data);
                // Keep a plain-text copy of everything shown, for copy/download.
                const plain = stripAnsi(String(msg.data || ''));
                const next = logBufferRef.current + plain;
                logBufferRef.current = next.length > LOG_BUFFER_CAP ? next.slice(-LOG_BUFFER_CAP) : next;
            }
        });
        return () => unsub();
    }, [activeTabId]);

    const handleClear = () => {
        termRef.current?.clear();
        logBufferRef.current = '';
    };

    const handleCopyAll = async () => {
        try {
            await navigator.clipboard.writeText(logBufferRef.current);
            setJustCopied(true);
            setTimeout(() => setJustCopied(false), 1500);
        } catch { /* clipboard permission denied — the button simply does nothing visible */ }
    };

    const handleDownload = () => {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const blob = new Blob([logBufferRef.current], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `joe-terminal-${stamp}.log`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    const handleReconnect = async () => {
        if (!termRef.current) return;
        termRef.current.writeln('\x1b[1;33m\n--- Reconnecting ---\x1b[0m');
        setIsConnecting(true);
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'kill', id: activeTabId })
            });
        } catch { /* the old session may already be gone — recreate regardless */ }
        // Remount the terminal (the main effect depends on sessionEpoch): the old
        // xterm is disposed and a fresh shell session is created — the rest of the
        // app keeps running, nothing reloads.
        setTimeout(() => setSessionEpoch(e => e + 1), 300);
    };

    // This project has NO Tailwind — the old markup styled everything with
    // Tailwind utility classes that silently did nothing. The worst casualty:
    // the xterm container ("absolute inset-2") collapsed to ZERO height, so the
    // terminal never opened and the user could not type a single command. Real
    // inline styles below; the ghost-button hover states live in the <style> tag.
    const ghostBtn: CSSProperties = {
        padding: 6, borderRadius: 8, border: 'none', background: 'transparent',
        color: '#94a3b8', cursor: 'pointer', display: 'grid', placeItems: 'center',
    };
    return (
        <div
            style={{
                ...(isEmbedded
                    ? { width: '100%', height: '100%' }
                    : {
                        position: 'fixed', bottom: 16, right: 16,
                        width: isMinimized ? 256 : 800, height: isMinimized ? 48 : 500,
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                        boxShadow: '0 25px 60px rgba(0,0,0,0.55)', transition: 'all 0.3s ease',
                    }),
                background: '#09090b',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                zIndex: isEmbedded ? 1 : 100,
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px', background: '#121214',
                borderBottom: '1px solid rgba(255,255,255,0.06)', userSelect: 'none', direction: 'ltr',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                        padding: 6, borderRadius: 8, display: 'grid', placeItems: 'center',
                        background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.2)',
                    }}>
                        <TerminalIcon size={14} color="#10b981" />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', letterSpacing: 2, textTransform: 'uppercase' }}>Terminal</span>
                        <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace', letterSpacing: 1 }}>JOE Shell</span>
                    </div>
                    <div style={{ height: 16, width: 1, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }}></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: isConnecting ? '#3b82f6' : isReady ? '#10b981' : '#ef4444',
                            boxShadow: isReady && !isConnecting ? '0 0 8px rgba(16,185,129,0.8)' : 'none',
                        }}></div>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#94a3b8', letterSpacing: 1, textTransform: 'uppercase' }}>
                            {isConnecting ? 'Connecting' : isReady ? 'Connected' : 'Offline'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                        onClick={() => {
                            setSearchOpen(v => !v);
                            if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
                            else { setSearchQuery(''); setSearchResults(null); searchAddonRef.current?.clearDecorations(); }
                        }}
                        className="joe-term-btn"
                        style={{ ...ghostBtn, ...(searchOpen ? { background: 'rgba(255,255,255,0.08)', color: '#fff' } : {}) }}
                        title="بحث في السجل (Ctrl+F)"
                    >
                        <Search size={14} />
                    </button>
                    <button onClick={handleCopyAll} className="joe-term-btn" style={ghostBtn} title="نسخ كل السجل">
                        {justCopied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                    </button>
                    <button onClick={handleDownload} className="joe-term-btn" style={ghostBtn} title="تنزيل السجل كملف">
                        <Download size={14} />
                    </button>
                    <button onClick={handleClear} className="joe-term-btn" style={ghostBtn} title="Clear Output">
                        <Trash2 size={14} />
                    </button>
                    <button onClick={handleReconnect} className="joe-term-btn" style={ghostBtn} title="Reconnect Session">
                        <RefreshCw size={14} className={isConnecting ? 'animate-spin' : ''} />
                    </button>

                    {!isEmbedded && (
                        <>
                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 4px' }}></div>
                            <button onClick={() => setIsMinimized(!isMinimized)} className="joe-term-btn" style={ghostBtn}>
                                {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                            </button>
                            <button onClick={onClose} className="joe-term-btn danger" style={ghostBtn}>
                                <X size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Search bar — appears under the header on Ctrl+F or the toolbar button */}
            {searchOpen && !isMinimized && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                    background: '#0e0e11', borderBottom: '1px solid rgba(255,255,255,0.06)', direction: 'ltr',
                }}>
                    <Search size={13} color="#64748b" />
                    <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(e) => {
                            const q = e.target.value;
                            setSearchQuery(q);
                            if (q) searchAddonRef.current?.findNext(q, { ...SEARCH_DECOR, incremental: true });
                            else { setSearchResults(null); searchAddonRef.current?.clearDecorations(); }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') runSearch(searchQuery, e.shiftKey ? 'prev' : 'next');
                            if (e.key === 'Escape') {
                                setSearchOpen(false); setSearchQuery(''); setSearchResults(null);
                                searchAddonRef.current?.clearDecorations();
                                termRef.current?.focus();
                            }
                        }}
                        placeholder="ابحث في مخرجات الطرفية…"
                        dir="auto"
                        style={{
                            flex: 1, maxWidth: 340, background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7,
                            padding: '4px 10px', color: '#e2e8f0', fontSize: 12.5,
                            fontFamily: 'inherit', outline: 'none',
                        }}
                    />
                    <span style={{ fontSize: 11, color: '#64748b', minWidth: 52, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {searchQuery
                            ? (searchResults && searchResults.resultCount > 0
                                ? `${searchResults.resultIndex + 1}/${searchResults.resultCount}`
                                : 'لا نتائج')
                            : ''}
                    </span>
                    <button onClick={() => runSearch(searchQuery, 'prev')} className="joe-term-btn" style={ghostBtn} title="السابق (Shift+Enter)">
                        <ChevronUp size={14} />
                    </button>
                    <button onClick={() => runSearch(searchQuery, 'next')} className="joe-term-btn" style={ghostBtn} title="التالي (Enter)">
                        <ChevronDown size={14} />
                    </button>
                    <button
                        onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null); searchAddonRef.current?.clearDecorations(); termRef.current?.focus(); }}
                        className="joe-term-btn danger" style={ghostBtn} title="إغلاق (Esc)"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Main Terminal Viewport — flex:1 + absolute inner box give xterm a
                REAL measured height, which is what lets it open and take input */}
            {!isMinimized && (
                <div style={{ flex: 1, background: '#09090b', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
                    <div ref={containerRef} style={{ position: 'absolute', top: 8, right: 8, bottom: 8, left: 8 }} />
                </div>
            )}
            
            {/* Global Styles for xterm overrides */}
            <style>{`
                .joe-term-btn:hover { background: rgba(255,255,255,0.06) !important; color: #ffffff !important; }
                .joe-term-btn.danger:hover { background: rgba(239,68,68,0.18) !important; color: #f87171 !important; }
                .animate-spin { animation: joeTermSpin 1s linear infinite; }
                @keyframes joeTermSpin { to { transform: rotate(360deg); } }
                .xterm-viewport {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
                }
                .xterm-viewport::-webkit-scrollbar {
                    width: 8px;
                }
                .xterm-viewport::-webkit-scrollbar-track {
                    background: transparent;
                }
                .xterm-viewport::-webkit-scrollbar-thumb {
                    background-color: rgba(255, 255, 255, 0.1);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}
