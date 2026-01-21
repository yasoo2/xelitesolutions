import React, { useState, useEffect, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { Terminal as TerminalIcon, Server, Shield, Plus, X, Maximize2, Minimize2, ChevronDown, Activity } from 'lucide-react';
import 'xterm/css/xterm.css';
import ServerSelector from './ServerSelector';
import { SocketService } from '../../services/socket';
import { API_URL } from '../../config';

interface TerminalSession {
    id: string;
    name: string;
    type: 'local' | 'ssh';
    serverId?: string;
    lastActive: Date;
}

export default function EnterpriseTerminalPanel({ onClose }: { onClose?: () => void }) {
    const [sessions, setSessions] = useState<TerminalSession[]>([
        { id: 'local-main', name: 'Local Shell', type: 'local', lastActive: new Date() }
    ]);
    const [activeSessionId, setActiveSessionId] = useState<string>('local-main');
    const [isMinimized, setIsMinimized] = useState(false);
    const [showServerSelector, setShowServerSelector] = useState(false);

    const activeSession = sessions.find(s => s.id === activeSessionId);

    const handleAddSession = (session: TerminalSession) => {
        setSessions(prev => [...prev, session]);
        setActiveSessionId(session.id);
        setShowServerSelector(false);
    };

    const handleCloseSession = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (sessions.length === 1) return;
        const newSessions = sessions.filter(s => s.id !== id);
        setSessions(newSessions);
        if (activeSessionId === id) {
            setActiveSessionId(newSessions[newSessions.length - 1].id);
        }
    };

    return (
        <div className={`fixed bottom-4 right-4 bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl transition-all duration-300 flex flex-col overflow-hidden ${isMinimized ? 'w-80 h-14' : 'w-[900px] h-[600px]'}`} style={{ zIndex: 1000 }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700/50 backdrop-blur-md select-none">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-blue-500/10 rounded-lg">
                        <TerminalIcon size={18} className="text-blue-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-200">Enterprise Terminal</h3>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Connected</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowServerSelector(!showServerSelector)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-600/50"
                    >
                        <Server size={14} className="text-emerald-400" />
                        <span>Servers</span>
                        <ChevronDown size={12} className={`transition-transform duration-300 ${showServerSelector ? 'rotate-180' : ''}`} />
                    </button>

                    <div className="w-px h-6 bg-slate-700/50 mx-1" />

                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button onClick={onClose} className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg text-slate-400 transition-colors">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <>
                    {/* Tabs */}
                    <div className="flex items-center gap-1 px-2 py-1.5 bg-slate-800/30 border-b border-slate-700/30 overflow-x-auto no-scrollbar">
                        {sessions.map(session => (
                            <button
                                key={session.id}
                                onClick={() => setActiveSessionId(session.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${activeSessionId === session.id
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-lg shadow-blue-500/5'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 border border-transparent'
                                    }`}
                            >
                                {session.type === 'ssh' ? <Shield size={12} /> : <Activity size={12} />}
                                <span>{session.name}</span>
                                {sessions.length > 1 && (
                                    <X
                                        size={12}
                                        className="ml-1 opacity-50 hover:opacity-100 hover:text-red-400"
                                        onClick={(e) => handleCloseSession(session.id, e)}
                                    />
                                )}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowServerSelector(true)}
                            className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-500 hover:text-blue-400 transition-colors"
                        >
                            <Plus size={16} />
                        </button>
                    </div>

                    {/* Terminal Display */}
                    <div className="flex-1 bg-[#0b0f1a] relative p-1">
                        {sessions.map(session => (
                            <TerminalInstance
                                key={session.id}
                                session={session}
                                isActive={session.id === activeSessionId}
                            />
                        ))}
                    </div>
                </>
            )}

            {/* Server Selector Overlay */}
            {showServerSelector && !isMinimized && (
                <div className="absolute inset-x-0 top-[110px] bottom-0 z-10 bg-[#0f172a]/80 backdrop-blur-sm p-4">
                    <div className="max-w-lg mx-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h4 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                                <Server className="text-emerald-400" />
                                Connect to Server
                            </h4>
                            <button onClick={() => setShowServerSelector(false)} className="text-slate-400 hover:text-slate-200">
                                <X size={20} />
                            </button>
                        </div>

                        <ServerSelector onConnect={handleAddSession} />
                    </div>
                </div>
            )}
        </div>
    );
}

function TerminalInstance({ session, isActive }: { session: TerminalSession, isActive: boolean }) {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const termRef = React.useRef<XTerm | null>(null);
    const fitAddonRef = React.useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!containerRef.current || termRef.current) return;

        const term = new XTerm({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 13,
            lineHeight: 1.4,
            theme: {
                background: '#0b0f1a',
                foreground: '#cbd5e1',
                cursor: '#38bdf8',
                selectionBackground: 'rgba(56, 189, 248, 0.2)',
                black: '#1e293b',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#eab308',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#f1f5f9',
            },
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        termRef.current = term;
        fitAddonRef.current = fitAddon;

        // Message to terminal
        term.writeln(`\x1b[1;34m[*] Initializing ${session.name}...\x1b[0m`);

        // Handle Input
        term.onData((data) => {
            SocketService.send({
                type: 'terminal_input',
                id: session.id,
                data
            });
        });

        // Resize
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                if (fitAddonRef.current) {
                    try {
                        fitAddonRef.current.fit();
                        const dims = fitAddonRef.current.proposeDimensions();
                        if (dims) {
                            SocketService.send({
                                type: 'terminal_resize',
                                id: session.id,
                                cols: dims.cols,
                                rows: dims.rows
                            });
                        }
                    } catch (e) { }
                }
            });
        });
        resizeObserver.observe(containerRef.current);

        // Subscribe to output
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'terminal_output' && msg.id === session.id) {
                term.write(msg.data);
            }
        });

        // Initialize (Dummy for now, will connect to backend)
        const init = async () => {
            const token = localStorage.getItem('token');
            try {
                // If SSH, we might need a different endpoint or payload
                const endpoint = session.type === 'ssh' ? '/api/servers/' + session.serverId + '/connect' : '/tools/terminal_manager/execute';
                const body = session.type === 'ssh' ? {} : { action: 'create', id: session.id };

                // For now, let's just make sure the backend knows we are here
                term.writeln(`\x1b[1;32m[+] ${session.name} Session Active\x1b[0m`);
            } catch (e) {
                term.writeln(`\x1b[1;31m[-] Failed to connect to ${session.name}\x1b[0m`);
            }
        };
        init();

        return () => {
            resizeObserver.disconnect();
            unsub();
            term.dispose();
            termRef.current = null;
        };
    }, []);

    return (
        <div className={`w-full h-full p-2 ${isActive ? 'block' : 'hidden'}`}>
            <div ref={containerRef} className="w-full h-full" />
        </div>
    );
}
