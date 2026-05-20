import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';
import { SocketService } from '../services/socket';
import { API_URL } from '../config';
import { Maximize2, Minimize2, Plus, Terminal as TerminalIcon, X } from 'lucide-react';

interface TerminalPanelProps {
    onClose?: () => void;
}

export default function TerminalPanel({ onClose }: TerminalPanelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const [terminalId, setTerminalId] = useState<string>('default');
    const [isReady, setIsReady] = useState(false);
    const isReadyRef = useRef(false);
    const [isMinimized, setIsMinimized] = useState(false);

    // Initialize Terminal
    useEffect(() => {
        if (!containerRef.current) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 14,
            theme: {
                background: '#0f172a', // Slate-900
                foreground: '#e2e8f0', // Slate-200
                cursor: '#38bdf8',
                selectionBackground: 'rgba(56, 189, 248, 0.3)',
            },
            allowProposedApi: true
        });

        term.open(containerRef.current);
        termRef.current = term;

        // Initialize connection
        const initTerminal = async () => {
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
                        rows: 30
                    })
                });
                const data = await res.json();
                if (data.ok) {
                    setIsReady(true);
                    isReadyRef.current = true;
                    term.writeln('\x1b[1;32m✓ Joe Shell Ready\x1b[0m');
                    term.focus();
                } else {
                    term.writeln(`\x1b[1;31m✗ ${data.error || 'unknown_tool'}\x1b[0m`);
                    term.writeln('\x1b[90mTip: Make sure the API server is running\x1b[0m');
                }
            } catch (e) {
                term.writeln('\x1b[1;31m✗ Connection Failed\x1b[0m');
            }
        };
        initTerminal();

        // Handle Input
        term.onData((data) => {
            if (!isReadyRef.current) return;
            SocketService.send({
                type: 'terminal_input',
                id: terminalId,
                data
            });
        });

        // Manual Resize Logic
        let lastCols = 0;
        let lastRows = 0;
        let isMounted = true;
        
        const performResize = () => {
            if (!isMounted || !containerRef.current || !termRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const approximateCharWidth = 8.2;
            const approximateRowHeight = 19;
            const cols = Math.max(20, Math.floor(rect.width / approximateCharWidth));
            const rows = Math.max(5, Math.floor(rect.height / approximateRowHeight));

            if (cols === lastCols && rows === lastRows) return;
            lastCols = cols;
            lastRows = rows;

            termRef.current.resize(cols, rows);
            SocketService.send({
                type: 'terminal_resize',
                id: terminalId,
                cols,
                rows
            });
        };

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(performResize);
        });

        resizeObserver.observe(containerRef.current);
        const t = setTimeout(performResize, 350);

        return () => {
            isMounted = false;
            resizeObserver.disconnect();
            clearTimeout(t);
            if (termRef.current) {
                termRef.current.dispose();
                termRef.current = null;
            }
        };
    }, [terminalId]);

    // Handle Incoming Data
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'terminal_output' && msg.id === terminalId) {
                termRef.current?.write(msg.data);
            }
        });
        return () => { unsub(); };
    }, [terminalId]);

    // Ensure focus/resize on visibility change
    useEffect(() => {
        if (!isMinimized && isReady) {
            termRef.current?.focus();
        }
    }, [isMinimized, isReady]);

    return (
        <div className={`fixed bottom-4 right-4 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden transition-all duration-300 flex flex-col ${isMinimized ? 'w-64 h-12' : 'w-[800px] h-[500px]'}`} style={{ zIndex: 50 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700 select-none cursor-move">
                <div className="flex items-center gap-2 text-slate-300">
                    <TerminalIcon size={16} className="text-blue-400" />
                    <span className="text-sm font-medium">System Terminal</span>
                    <span className={`w-2 h-2 rounded-full ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`} />
                </div>
                <div className="flex items-center gap-2">
                    {!isMinimized && (
                        <button
                            onClick={() => {
                                const id = prompt('Enter Terminal ID:', terminalId);
                                if (id && id !== terminalId) {
                                    termRef.current?.reset();
                                    setTerminalId(id);
                                }
                            }}
                            className="p-1 hover:bg-slate-700 rounded text-slate-400"
                            title="New Session"
                        >
                            <Plus size={14} />
                        </button>
                    )}
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1 hover:bg-slate-700 rounded text-slate-400"
                    >
                        {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-red-900/50 hover:text-red-400 rounded text-slate-400"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Terminal Container */}
            {!isMinimized && (
                <div className="flex-1 p-2 bg-[#0f172a] overflow-hidden relative">
                    <div ref={containerRef} className="h-full w-full" />
                </div>
            )}
        </div>
    );
}
