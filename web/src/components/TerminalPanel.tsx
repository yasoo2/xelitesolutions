import { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
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
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [terminalId, setTerminalId] = useState<string>('default');
    const [isReady, setIsReady] = useState(false);
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

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Initialize connection
        const initTerminal = async () => {
            const token = localStorage.getItem('token');
            try {
                await fetch(`${API_URL}/tools/terminal_manager/execute`, {
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
                setIsReady(true);
                term.writeln('\x1b[1;32m✓ Joe Shell Ready\x1b[0m');
            } catch (e) {
                term.writeln('\x1b[1;31m✗ Connection Failed\x1b[0m');
            }
        };
        initTerminal();

        // Handle Input
        term.onData((data) => {
            SocketService.send({
                type: 'terminal_input',
                id: terminalId,
                data
            });
        });

        // Handle Resize with Debounce and Observer (Flattened)
        if (containerRef.current && termRef.current && fitAddonRef.current) {
            const performFit = () => {
                if (!fitAddonRef.current) return;
                try {
                    fitAddonRef.current.fit();
                    const dims = fitAddonRef.current.proposeDimensions();
                    if (dims && dims.cols && dims.rows) {
                        SocketService.send({
                            type: 'terminal_resize',
                            id: terminalId,
                            cols: dims.cols,
                            rows: dims.rows
                        });
                    }
                } catch (e) {
                    console.error('Terminal fit error:', e);
                }
            };

            const resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => performFit());
            });

            resizeObserver.observe(containerRef.current);

            // Also fit after transition ends
            const transitionTimeout = setTimeout(performFit, 350);

            // Add cleanup to the main effect's return
            const originalCleanup = () => {
                term.dispose();
            };

            // Override return to include observer cleanup
            return () => {
                resizeObserver.disconnect();
                clearTimeout(transitionTimeout);
                originalCleanup();
            };
        }

        return () => {
            term.dispose();
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

    // Ensure fit on visibility change
    useEffect(() => {
        if (!isMinimized && fitAddonRef.current && isReady) {
            const t = setTimeout(() => fitAddonRef.current?.fit(), 100);
            return () => clearTimeout(t);
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
