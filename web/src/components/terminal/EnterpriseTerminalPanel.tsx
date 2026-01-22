import { useEffect, useRef, useState, useMemo } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { SocketService } from '../../services/socket';
import { ServerService, ServerConfig } from '../../services/server';
import {
    Maximize2,
    Minimize2,
    Plus,
    Terminal as TerminalIcon,
    X,
    Server,
    Globe,
    Monitor,
    Activity,
    Settings,
    ChevronDown,
    RefreshCw,
    Trash2,
    Wifi,
    WifiOff
} from 'lucide-react';

interface TerminalTab {
    id: string;
    name: string;
    serverId?: string; // undefined for local
    isReady: boolean;
}

interface EnterpriseTerminalPanelProps {
    onClose?: () => void;
    isEmbedded?: boolean;
}

export default function EnterpriseTerminalPanel({ onClose, isEmbedded }: EnterpriseTerminalPanelProps) {
    const [tabs, setTabs] = useState<TerminalTab[]>([
        { id: 'local', name: 'Localhost', isReady: false }
    ]);
    const [activeTabId, setActiveTabId] = useState('local');
    const [isMinimized, setIsMinimized] = useState(false);
    const [showAddServer, setShowAddServer] = useState(false);
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const [isLoadingServers, setIsLoadingServers] = useState(false);

    // Form state for adding server
    const [newServer, setNewServer] = useState<Partial<ServerConfig>>({
        name: '',
        host: '',
        port: 22,
        username: '',
        authMethod: 'password'
    });

    const containersRef = useRef<Record<string, HTMLDivElement | null>>({});
    const termsRef = useRef<Record<string, Terminal | null>>({});
    const fitAddonsRef = useRef<Record<string, FitAddon | null>>({});

    useEffect(() => {
        loadServers();
    }, []);

    const loadServers = async () => {
        setIsLoadingServers(true);
        try {
            const data = await ServerService.listServers();
            setServers(data);
        } catch (error) {
            console.error('Failed to load servers:', error);
        } finally {
            setIsLoadingServers(false);
        }
    };

    const createTerminal = (tabId: string, serverId?: string): (() => void) | void => {
        if (termsRef.current[tabId]) return;

        const container = containersRef.current[tabId];
        if (!container) return;

        const term = new Terminal({
            cursorBlink: true,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 13,
            theme: {
                background: '#09090b', // Zinc-950 (Deep Black)
                foreground: '#ffffff', // Pure White
                cursor: '#22c55e', // Green-500
                selectionBackground: 'rgba(34, 197, 94, 0.3)',
                black: '#09090b',
                red: '#ef4444',
                green: '#22c55e',
                yellow: '#eab308',
                blue: '#3b82f6',
                magenta: '#a855f7',
                cyan: '#06b6d4',
                white: '#ffffff',
                brightBlack: '#71717a',
                brightRed: '#f87171',
                brightGreen: '#4ade80',
                brightYellow: '#fde047',
                brightBlue: '#60a5fa',
                brightMagenta: '#c084fc',
                brightCyan: '#22d3ee',
                brightWhite: '#ffffff'
            },
            allowProposedApi: true
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(container);
        fitAddon.fit();

        termsRef.current[tabId] = term;
        fitAddonsRef.current[tabId] = fitAddon;

        // Handle Input
        term.onData((data) => {
            SocketService.send({
                type: 'terminal_input',
                id: tabId,
                serverId,
                data
            });
        });

        // Initialize Connection (Local or Remote)
        if (!serverId) {
            term.writeln('\x1b[1;35m🚀 Joe Enterprise Shell [Local]\x1b[0m');
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isReady: true } : t));
        } else {
            term.writeln(`\x1b[1;34m🌐 Connecting to remote server...\x1b[0m`);
            connectRemote(tabId, serverId);
        }

        // Resize Handling
        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                fitAddon.fit();
                const dims = fitAddon.proposeDimensions();
                if (dims && dims.cols && dims.rows) {
                    SocketService.send({
                        type: 'terminal_resize',
                        id: tabId,
                        serverId,
                        cols: dims.cols,
                        rows: dims.rows
                    });
                }
            });
        });
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            term.dispose();
            delete termsRef.current[tabId];
        };
    };

    const connectRemote = async (tabId: string, serverId: string) => {
        try {
            await ServerService.connect(serverId);
            termsRef.current[tabId]?.writeln('\x1b[1;32m✓ SSH Connection Established\x1b[0m');
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isReady: true } : t));
        } catch (error: any) {
            termsRef.current[tabId]?.writeln(`\x1b[1;31m✗ Connection Failed: ${error.message}\x1b[0m`);
        }
    };

    const addTab = (server?: ServerConfig) => {
        const id = server ? `remote_${server.id}_${Date.now()}` : `local_${Date.now()}`;
        const newTab: TerminalTab = {
            id,
            name: server ? server.name : 'Localhost',
            serverId: server?.id,
            isReady: false
        };
        setTabs([...tabs, newTab]);
        setActiveTabId(id);
    };

    const closeTab = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (tabs.length === 1) return; // Keep last tab

        const newTabs = tabs.filter(t => t.id !== id);
        setTabs(newTabs);

        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }

        // Clean up
        if (termsRef.current[id]) {
            termsRef.current[id]?.dispose();
            delete termsRef.current[id];
        }
    };

    const handleAddServer = async () => {
        try {
            const added = await ServerService.addServer(newServer);
            setServers([...servers, added]);
            setShowAddServer(false);
            setNewServer({ name: '', host: '', port: 22, username: '', authMethod: 'password' });
        } catch (error) {
            alert('Failed to add server');
        }
    };

    // Effect to initialize terminal when tab changes or container is available
    useEffect(() => {
        if (!isMinimized) {
            const cleanup = createTerminal(activeTabId, tabs.find(t => t.id === activeTabId)?.serverId);
            if (cleanup) return cleanup;
        }
    }, [activeTabId, isMinimized]);

    // Sync terminal output
    useEffect(() => {
        const unsub = SocketService.subscribe((msg: any) => {
            if (msg.type === 'terminal_output') {
                termsRef.current[msg.id]?.write(msg.data);
            }
        });
        return () => { unsub(); };
    }, []);

    return (
        <div
            className={`${isEmbedded
                ? 'w-full h-full'
                : `fixed bottom-4 right-4 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl transition-all duration-300 ${isMinimized ? 'w-64 h-12' : 'w-[900px] h-[600px]'}`
                } overflow-hidden flex flex-col bg-slate-900`}
            style={{ zIndex: isEmbedded ? 1 : 100, backdropFilter: isEmbedded ? 'none' : 'blur(10px)' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-950 border-b border-white/5 select-none">
                <div className="flex items-center gap-4">
                    <div className="p-2 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 shadow-[0_0_15px_rgba(var(--accent-primary-rgb),0.1)]">
                        <Activity size={20} className="text-[var(--accent-primary)] animate-pulse" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-black text-slate-100 tracking-widest uppercase leading-tight">Joe Elite Shell</span>
                        <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Neural Logic Core</span>
                    </div>
                    <div className="h-6 w-[1px] bg-white/5 mx-2"></div>
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 border border-white/5 shadow-inner">
                        <Server size={12} className="text-slate-400" />
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enterprise Stream</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {!isEmbedded && (
                        <>
                            <button
                                onClick={() => setIsMinimized(!isMinimized)}
                                className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all"
                            >
                                {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-xl text-slate-400 transition-all"
                            >
                                <X size={16} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {!isMinimized && (
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar - Server List */}
                    <div className="w-56 bg-slate-950 border-r border-slate-800 flex flex-col">
                        <div className="p-3 flex items-center justify-between border-b border-slate-800 bg-slate-900/40">
                            <span className="text-[10px] font-black text-slate-200 uppercase tracking-[0.2em]">Node Registry</span>
                            <button
                                onClick={() => setShowAddServer(true)}
                                className="p-1.5 hover:bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded-lg border border-[var(--accent-primary)]/10 transition-all active:scale-90"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
                            <button
                                onClick={() => addTab()}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-[var(--accent-primary)] hover:text-slate-900 text-slate-200 transition-all group active:scale-95"
                            >
                                <Monitor size={14} className="group-hover:text-slate-900 text-slate-400" />
                                <span className="text-sm font-medium">Localhost</span>
                            </button>

                            {servers.map(server => (
                                <button
                                    key={server.id}
                                    onClick={() => addTab(server)}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[var(--accent-primary)] hover:text-slate-900 text-slate-200 transition-all group active:scale-95"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Globe size={14} className="group-hover:text-slate-900 shrink-0 text-slate-400" />
                                        <span className="text-sm font-medium truncate">{server.name}</span>
                                    </div>
                                    <div className={`w-1.5 h-1.5 rounded-full ${server.isActive ? 'bg-green-500' : 'bg-slate-600'}`}></div>
                                </button>
                            ))}

                            {isLoadingServers && (
                                <div className="flex justify-center p-4">
                                    <RefreshCw size={16} className="text-slate-300 animate-spin" />
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-slate-700/30">
                            <div className="flex items-center gap-2 text-slate-200 hover:text-white cursor-pointer transition-colors">
                                <Settings size={14} />
                                <span className="text-[11px] font-medium uppercase tracking-wider">Settings</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 flex flex-col bg-[#0f172a]">
                        {/* Tabs */}
                        <div className="flex items-center bg-slate-900 border-b border-slate-700/50 overflow-x-auto no-scrollbar">
                            {tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    onClick={() => setActiveTabId(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 border-r border-slate-700/50 cursor-pointer transition-all min-w-[140px] max-w-[220px] ${activeTabId === tab.id
                                        ? 'bg-[#0f172a] border-t-2 border-t-[var(--accent-primary)] text-[var(--accent-primary)] shadow-[inset_0_2px_10px_rgba(var(--accent-primary-rgb),0.1)]'
                                        : 'bg-slate-800/30 text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                                        }`}
                                >
                                    {tab.serverId ? <Globe size={12} className={activeTabId === tab.id ? 'text-[var(--accent-primary)]' : ''} /> : <Monitor size={12} className={activeTabId === tab.id ? 'text-[var(--accent-primary)]' : ''} />}
                                    <span className="text-xs truncate font-bold tracking-tight">{tab.name}</span>
                                    <X
                                        size={10}
                                        className="ml-auto hover:text-red-400 opacity-50 hover:opacity-100 transition-opacity"
                                        onClick={(e) => closeTab(tab.id, e)}
                                    />
                                </div>
                            ))}
                            <button
                                onClick={() => addTab()}
                                className="p-2 text-slate-500 hover:text-[var(--accent-primary)] transition-colors"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        {/* Terminal Viewports */}
                        <div className="flex-1 relative">
                            {tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    ref={el => (containersRef.current[tab.id] = el)}
                                    className={`absolute inset-0 p-2 ${activeTabId === tab.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                                />
                            ))}
                        </div>

                        {/* Status Footer */}
                        <div className="px-3 py-1.5 bg-slate-900 border-t border-slate-700/50 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <Wifi size={12} className="text-green-500" />
                                    <span className="text-[10px] font-medium uppercase tracking-tighter">Socket Connected</span>
                                </div>
                                <div className="h-3 w-[1px] bg-slate-700"></div>
                                <div className="text-[10px] text-slate-300 font-mono">joe-term@enterprise:~</div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-300">UTF-8</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Server Modal Overlay */}
            {showAddServer && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/30">
                            <div className="flex items-center gap-2">
                                <Server size={18} className="text-purple-400" />
                                <h3 className="font-bold text-slate-100">Add New Server</h3>
                            </div>
                            <button onClick={() => setShowAddServer(false)} className="text-slate-300 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-slate-200 uppercase">Server Name</label>
                                <input
                                    type="text"
                                    placeholder="Production API"
                                    value={newServer.name}
                                    onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all"
                                />
                            </div>

                            <div className="grid grid-cols-4 gap-4">
                                <div className="col-span-3 flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-200 uppercase">Hostname / IP</label>
                                    <input
                                        type="text"
                                        placeholder="192.168.1.100"
                                        value={newServer.host}
                                        onChange={e => setNewServer({ ...newServer, host: e.target.value })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-200 uppercase">Port</label>
                                    <input
                                        type="number"
                                        value={newServer.port}
                                        onChange={e => setNewServer({ ...newServer, port: parseInt(e.target.value) })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all text-center"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-slate-200 uppercase">Username</label>
                                <input
                                    type="text"
                                    placeholder="root"
                                    value={newServer.username}
                                    onChange={e => setNewServer({ ...newServer, username: e.target.value })}
                                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-bold text-slate-200 uppercase">Authentication</label>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setNewServer({ ...newServer, authMethod: 'password' })}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${newServer.authMethod === 'password' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                    >Password</button>
                                    <button
                                        onClick={() => setNewServer({ ...newServer, authMethod: 'key' })}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${newServer.authMethod === 'key' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                                    >SSH Key</button>
                                </div>
                            </div>

                            {newServer.authMethod === 'password' ? (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-200 uppercase">Password</label>
                                    <input
                                        type="password"
                                        placeholder="••••••••"
                                        value={newServer.password}
                                        onChange={e => setNewServer({ ...newServer, password: e.target.value })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all"
                                    />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-bold text-slate-200 uppercase">Private Key Path</label>
                                    <input
                                        type="text"
                                        placeholder="~/.ssh/id_rsa"
                                        value={newServer.keyPath}
                                        onChange={e => setNewServer({ ...newServer, keyPath: e.target.value })}
                                        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition-all"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-950/30 border-t border-slate-800 flex gap-3">
                            <button
                                onClick={() => setShowAddServer(false)}
                                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-400 font-semibold text-sm hover:bg-slate-800 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddServer}
                                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow-lg shadow-purple-600/20 transition-all"
                            >
                                Save Server
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
