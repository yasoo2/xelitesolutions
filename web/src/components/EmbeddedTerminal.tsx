/**
 * EmbeddedTerminal - Terminal component for BottomPanel
 * Uses xterm.js with WebSocket connection
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
// import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../services/socket';
import { API_URL } from '../config';
import { RefreshCw, Trash2 } from 'lucide-react';

interface EmbeddedTerminalProps {
    terminalId?: string;
    workspaceId?: string;
    onReady?: () => void;
}

export default function EmbeddedTerminal({
    terminalId = 'panel-terminal',
    workspaceId,
    onReady
}: EmbeddedTerminalProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    // const fitAddonRef = useRef<FitAddon | null>(null);
    const isOpenRef = useRef(false);
    const [isReady, setIsReady] = useState(false);
    const isReadyRef = useRef(false);
    const [isConnecting, setIsConnecting] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const setTerminalReady = useCallback((ready: boolean) => {
        setIsReady(ready);
        isReadyRef.current = ready;
    }, []);

    // Get theme-based colors
    const getTerminalTheme = useCallback(() => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        return {
            background: isDark ? '#0d1117' : '#f6f8fa',
            foreground: isDark ? '#c9d1d9' : '#24292f',
            cursor: isDark ? '#58a6ff' : '#0969da',
            cursorAccent: isDark ? '#0d1117' : '#f6f8fa',
            selectionBackground: isDark ? 'rgba(56, 139, 253, 0.3)' : 'rgba(9, 105, 218, 0.2)',
            black: isDark ? '#484f58' : '#24292f',
            red: '#f85149',
            green: '#3fb950',
            yellow: '#d29922',
            blue: '#58a6ff',
            magenta: '#bc8cff',
            cyan: '#39c5cf',
            white: isDark ? '#b1bac4' : '#6e7781',
            brightBlack: isDark ? '#6e7681' : '#57606a',
            brightRed: '#ff7b72',
            brightGreen: '#56d364',
            brightYellow: '#e3b341',
            brightBlue: '#79c0ff',
            brightMagenta: '#d2a8ff',
            brightCyan: '#56d4dd',
            brightWhite: isDark ? '#f0f6fc' : '#8c959f',
        };
    }, []);

    // Initialize terminal
    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
            fontSize: 13,
            lineHeight: 1.4,
            theme: getTerminalTheme(),
            allowProposedApi: true,
            scrollback: 10000,
        });

        // const fitAddon = new FitAddon();
        // term.loadAddon(fitAddon);

        // Track mounted state
        let isMounted = true;
        let initRetries = 0;
        const MAX_INIT_RETRIES = 50; // ~5 seconds max waiting

        const tryInit = () => {
            if (!containerRef.current || !isMounted) return;

            // Wait for container to have dimensions
            if (containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) {
                if (initRetries < MAX_INIT_RETRIES) {
                    initRetries++;
                    setTimeout(tryInit, 100);
                }
                return;
            }

            // Ensure DOM is fully painted
            requestAnimationFrame(() => {
                if (!containerRef.current || !isMounted) return;

                try {
                    term.open(containerRef.current);
                    termRef.current = term;
                    // fitAddonRef.current = fitAddon;
                    isOpenRef.current = true;

                    // Initial fit safely
                    setTimeout(() => {
                        if (isMounted && isOpenRef.current && term.element && containerRef.current) {
                            try {
                                // Double check visibility
                                const rect = containerRef.current.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    // Manual initial resize
                                    const cols = Math.max(20, Math.floor(rect.width / 8.5));
                                    const rows = Math.max(5, Math.floor(rect.height / 20));
                                    term.resize(cols, rows);
                                }
                            } catch (e) {
                                if (import.meta.env.DEV) {
                                    console.debug('[Terminal] Initial fit skipped:', e);
                                }
                            }
                        }
                    }, 200);

                    initTerminal();
                } catch (e) {
                    console.error('[Terminal] Open failed:', e);
                    setError(String(e));
                    setIsConnecting(false);
                }
            });
        };

        // Create terminal session
        const initTerminal = async () => {
            setIsConnecting(true);
            setError(null);

            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        action: 'create',
                        id: terminalId,
                        shell: 'bash',
                        cols: 80,
                        rows: 24,
                        workspaceId
                    })
                });

                const data = await res.json();

                if (data.ok || data.error?.includes('already exists')) {
                    setTerminalReady(true);
                    setIsConnecting(false);
                    term.writeln('\x1b[1;32m● Terminal Ready\x1b[0m');
                    term.writeln('');
                    onReady?.();
                    // Ensure focus after ready
                    setTimeout(() => term.focus(), 100);
                } else {
                    throw new Error(data.error || 'Failed to create terminal');
                }
            } catch (e: any) {
                setError(e.message);
                setIsConnecting(false);
                term.writeln(`\x1b[1;31m✗ ${e.message}\x1b[0m`);
                term.writeln('\x1b[90mTip: Make sure the API server is running\x1b[0m');
            }
        };

        tryInit();

        // Handle input [Wakil 5.2: Block during Hard Quiet Mode]
        term.onData((data) => {
            if (!isReadyRef.current) {
                if (import.meta.env.DEV) {
                    console.debug('[Terminal] Input blocked: not ready');
                }
                return;
            }
            // [Wakil 5.2] HARD FREEZE: No input during agent run
            if (SocketService.isQuietMode()) {
                return;
            }
            if (import.meta.env.DEV) {
                console.debug(`[Terminal] Input sent: ${data.length} bytes`);
            }
            SocketService.send({
                type: 'terminal_input',
                id: terminalId,
                data
            });
        });

        // Handle resize with debounce [Wakil 5.1]
        let lastCols = 0;
        let lastRows = 0;
        let resizeTimeout: any = null;

        const resizeObserver = new ResizeObserver(() => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            if (!isMounted) return;

            resizeTimeout = setTimeout(() => {
                if (!isMounted || !isOpenRef.current || !termRef.current) return;

                const container = containerRef.current;
                const term = termRef.current;

                if (!container || !term) return;

                try {
                    // [Wakil 5.1] Block resize during Quiet Mode
                    if (SocketService.isQuietMode()) return;

                    // Defensive checks for xterm internals
                    if (!term.element || !term.textarea || !term.element.parentElement) return;

                    // Skip if container is hidden or has no size
                    const rect = container.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) return;

                    // [REMOVED FIT-ADDON CRASH SOURCE]
                    // Calculate manual dimensions
                    const approximateCharWidth = 8.2;
                    const approximateRowHeight = 19;
                    const cols = Math.max(20, Math.floor(rect.width / approximateCharWidth));
                    const rows = Math.max(5, Math.floor(rect.height / approximateRowHeight));

                    if (isNaN(cols) || isNaN(rows)) return;

                    // Strict deduplication at source
                    if (cols === lastCols && rows === lastRows) return;

                    lastCols = cols;
                    lastRows = rows;

                    if (import.meta.env.DEV) {
                        console.debug(`[Terminal] Manual resize: ${cols}x${rows}`);
                    }

                    term.resize(cols, rows);

                    SocketService.send({
                        type: 'terminal_resize',
                        id: terminalId,
                        cols,
                        rows
                    });
                } catch (e) {
                    if (import.meta.env.DEV) {
                        console.warn('[Terminal] Resize error:', e);
                    }
                }
            }, 300);
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        // Listen for theme changes
        const themeObserver = new MutationObserver(() => {
            term.options.theme = getTerminalTheme();
        });
        themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });

        return () => {
            isMounted = false;
            isOpenRef.current = false;
            setTerminalReady(false);
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeObserver.disconnect();
            themeObserver.disconnect();

            const termToDispose = term; // Keep local ref
            termRef.current = null;
            // fitAddonRef.current = null;

            try {
                if (termToDispose) {
                    termToDispose.dispose();
                }
            } catch {
            }
        };
    }, [terminalId, getTerminalTheme, onReady]);

    // Handle incoming data
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'terminal_output' && msg.id === terminalId) {
                const t = termRef.current as any;
                if (t && t._core && !t._core.isDisposed) {
                    t.write(msg.data);
                }
            }

            // [SHELL-FEEDBACK] Write tool results to the terminal window if they are shell commands
            if ((msg.type === 'step_done' || msg.type === 'step_failed') && msg.data?.name?.includes('shell_execute')) {
                const result = msg.data.result;
                const output = result?.output?.stdout || result?.output?.output || result?.output?.stderr || '';
                const ok = msg.type === 'step_done';
                const color = ok ? '\x1b[32m' : '\x1b[31m';

                if (output) {
                    const t = termRef.current as any;
                    if (t && t._core && !t._core.isDisposed) {
                        t.write(`\r\n${color}--- [Executed: ${msg.data.name}] ---\x1b[0m\r\n`);
                        t.write(output.replace(/\n/g, '\r\n'));
                        t.write(`\r\n${color}--- [End of Output] ---\x1b[0m\r\n`);
                    }
                }
            }
        });
        return () => { unsub(); };
    }, [terminalId]);

    // Retry connection
    const handleRetry = useCallback(async () => {
        if (!termRef.current) return;

        setIsConnecting(true);
        setError(null);
        termRef.current.clear();
        termRef.current.writeln('\x1b[90mReconnecting...\x1b[0m');

        const token = localStorage.getItem('token');
        try {
            // Kill existing first
            await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action: 'kill', id: terminalId })
            }).catch(() => { });

            // Create new
            const res = await fetch(`${API_URL}/tools/terminal_manager/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    action: 'create',
                    id: terminalId,
                    shell: 'bash',
                    cols: 80,
                    rows: 24,
                    workspaceId
                })
            });

            const data = await res.json();
            if (data.ok) {
                setTerminalReady(true);
                setIsConnecting(false);
                termRef.current?.writeln('\x1b[1;32m● Terminal Ready\x1b[0m\n');
                setTimeout(() => termRef.current?.focus(), 100);
            } else {
                throw new Error(data.error);
            }
        } catch (e: any) {
            setError(e.message);
            setTerminalReady(false);
            setIsConnecting(false);
            termRef.current?.writeln(`\x1b[1;31m✗ ${e.message}\x1b[0m`);
        }
    }, [terminalId]);

    // Clear terminal
    const handleClear = useCallback(() => {
        termRef.current?.clear();
    }, []);

    return (
        <div className="joe-terminal-container" 
          onClick={() => termRef.current?.focus()}
          tabIndex={0}
          style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '0 0 var(--joe-border-radius) var(--joe-border-radius)',
            overflow: 'hidden',
            outline: 'none'
        }}>
            {/* Toolbar */}
            <div className="joe-terminal-toolbar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderBottom: '1px solid var(--joe-border)',
                background: 'var(--joe-bg-card)',
                backdropFilter: 'blur(10px)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace'
                    }}>
                        {terminalId}
                    </span>
                    <span style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: isReady ? '#22c55e' : isConnecting ? '#eab308' : '#ef4444',
                    }} />
                </div>

                <div style={{ display: 'flex', gap: 4 }}>
                    <TerminalButton
                        icon={RefreshCw}
                        tooltip="إعادة الاتصال"
                        onClick={handleRetry}
                        disabled={isConnecting}
                    />
                    <TerminalButton
                        icon={Trash2}
                        tooltip="مسح"
                        onClick={handleClear}
                    />
                </div>
            </div>

            {/* Terminal Container */}
            <div
                ref={containerRef}
                style={{
                    flex: 1,
                    padding: 4,
                    overflow: 'hidden'
                }}
            />
        </div>
    );
}

function TerminalButton({
    icon: Icon,
    tooltip,
    onClick,
    disabled = false
}: {
    icon: React.ElementType;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            title={tooltip}
            style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: '1px solid transparent',
                background: 'transparent',
                color: disabled ? 'var(--joe-text-muted)' : 'var(--joe-text-secondary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseOver={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = 'var(--joe-bg-hover)';
                    e.currentTarget.style.color = 'var(--joe-gold-primary)';
                    e.currentTarget.style.borderColor = 'var(--joe-gold-border)';
                }
            }}
            onMouseOut={(e) => {
                if (!disabled) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--joe-text-secondary)';
                    e.currentTarget.style.borderColor = 'transparent';
                }
            }}
        >
            <Icon size={14} />
        </button>
    );
}
