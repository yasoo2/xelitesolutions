import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../../services/socket';
import { API_URL } from '../../config';
import { Terminal as TerminalIcon, RefreshCw, Trash2, Maximize2, Minimize2, X, Copy, Download, Check } from 'lucide-react';

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
            isReadyRef.current = false;
            try {
                term.dispose();
            } catch { }
        };
    }, [activeTabId, isMinimized, workspaceId, sessionEpoch]);

    // Handle incoming data
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'terminal_output' && (msg.id === activeTabId || !msg.id)) {
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

    return (
        <div
            className={`${isEmbedded
                ? 'w-full h-full'
                : `fixed bottom-4 right-4 bg-[#09090b] border border-white/10 rounded-xl shadow-2xl transition-all duration-300 ${isMinimized ? 'w-64 h-12' : 'w-[800px] h-[500px]'}`
                } overflow-hidden flex flex-col`}
            style={{ zIndex: isEmbedded ? 1 : 100 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-[#121214] border-b border-white/5 select-none">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]">
                        <TerminalIcon size={14} className="text-emerald-500" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[11px] font-bold text-slate-200 uppercase tracking-widest leading-tight">Terminal</span>
                        <span className="text-[9px] text-slate-500 font-mono tracking-wider">JOE Autonomous Shell</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-2"></div>
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isConnecting ? 'bg-blue-500 animate-pulse' : isReady ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {isConnecting ? 'Connecting' : isReady ? 'Connected' : 'Offline'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyAll}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
                        title="نسخ كل السجل"
                    >
                        {justCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                    </button>
                    <button
                        onClick={handleDownload}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
                        title="تنزيل السجل كملف"
                    >
                        <Download size={14} />
                    </button>
                    <button
                        onClick={handleClear}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Clear Output"
                    >
                        <Trash2 size={14} />
                    </button>
                    <button
                        onClick={handleReconnect}
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Reconnect Session"
                    >
                        <RefreshCw size={14} className={isConnecting ? 'animate-spin' : ''} />
                    </button>
                    
                    {!isEmbedded && (
                        <>
                            <div className="w-[1px] h-4 bg-white/10 mx-1"></div>
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all"
                            >
                                {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-slate-400 transition-all"
                            >
                                <X size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Main Terminal Viewport */}
            {!isMinimized && (
                <div className="flex-1 bg-[#09090b] relative p-2 overflow-hidden">
                    <div ref={containerRef} className="absolute inset-2" />
                </div>
            )}
            
            {/* Global Styles for xterm overrides */}
            <style>{`
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
