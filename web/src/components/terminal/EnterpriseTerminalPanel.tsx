import { useEffect, useRef, useState, useMemo } from 'react';
import { Terminal } from 'xterm';
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
    const cleanupRef = useRef<Record<string, (() => void) | null>>({});
    const isReadyRefs = useRef<Record<string, boolean>>({});

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

        term.open(container);
        termsRef.current[tabId] = term;

        // Handle Input
        term.onData((data) => {
            if (!isReadyRefs.current[tabId]) return;
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
            isReadyRefs.current[tabId] = true;
            setTabs(prev => prev.map(t => t.id === tabId ? { ...t, isReady: true } : t));
            term.focus();
        } else {
            term.writeln(`\x1b[1;34m🌐 Connecting to remote server...\x1b[0m`);
            connectRemote(tabId, serverId);
        }

        // Manual Resize Handling
        let isTabMounted = true;
        let lastCols = 0;
        let lastRows = 0;

        const performResize = () => {
            if (!isTabMounted) return;
            const container = containersRef.current[tabId];
            const term = termsRef.current[tabId];
            if (!container || !term) return;

            const rect = container.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;

            const approximateCharWidth = 7.8;
            const approximateRowHeight = 18;
            const cols = Math.max(20, Math.floor(rect.width / approximateCharWidth));
            const rows = Math.max(5, Math.floor(rect.height / approximateRowHeight));

            if (cols === lastCols && rows === lastRows) return;
            lastCols = cols;
            lastRows = rows;

            term.resize(cols, rows);
            SocketService.send({
                type: 'terminal_resize',
                id: tabId,
                serverId,
                cols,
                rows
            });
        };

        const resizeObserver = new ResizeObserver(() => {
            requestAnimationFrame(performResize);
        });
        resizeObserver.observe(container);
        const t = setTimeout(performResize, 350);

        const cleanup = () => {
            isTabMounted = false;
            resizeObserver.disconnect();
            clearTimeout(t);
            try {
                const term = termsRef.current[tabId];
                if (term) term.dispose();
            } catch { }
            delete termsRef.current[tabId];
            delete isReadyRefs.current[tabId];
            delete cleanupRef.current[tabId];
        };
        cleanupRef.current[tabId] = cleanup;
        return cleanup;
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
        cleanupRef.current[id]?.();
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
                        <span className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">Core Runtime</span>
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
                <div className="flex flex-1 overflow-hidden font-sans">
                    {/* Sidebar - Server List */}
                    <div className="w-56 bg-gradient-to-b from-[#0f1115] to-black border-r border-white/5 flex flex-col">
                        <div className="p-3 pl-4 flex items-center justify-between border-b border-white/5">
                            <span className="text-[10px] font-black text-[#F0B90B] uppercase tracking-[0.2em] opacity-80">Node Registry</span>
                            <button
                                onClick={() => setShowAddServer(true)}
                                className="p-1.5 hover:bg-[#F0B90B]/10 text-[#F0B90B] rounded-lg border border-[#F0B90B]/20 transition-all active:scale-95 hover:shadow-[0_0_10px_rgba(240,185,11,0.2)]"
                                title="Add New Server"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto p-2 flex flex-col gap-1">
                            <button
                                onClick={() => addTab()}
                                className="flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white transition-all group active:scale-95 border border-transparent hover:border-white/5"
                            >
                                <Monitor size={14} className="text-[#F0B90B] opacity-70 group-hover:opacity-100" />
                                <span className="text-xs font-bold tracking-wide">Localhost</span>
                            </button>

                            {servers.map(server => (
                                <button
                                    key={server.id}
                                    onClick={() => addTab(server)}
                                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 text-slate-300 hover:text-white transition-all group active:scale-95 border border-transparent hover:border-white/5"
                                >
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <Globe size={14} className="text-blue-400 opacity-70 group-hover:opacity-100" />
                                        <span className="text-xs font-medium truncate">{server.name}</span>
                                    </div>
                                    <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${server.isActive ? 'bg-green-500 text-green-500' : 'bg-slate-700 text-slate-700'}`}></div>
                                </button>
                            ))}

                            {isLoadingServers && (
                                <div className="flex justify-center p-4">
                                    <RefreshCw size={16} className="text-[#F0B90B] animate-spin" />
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-white/5 bg-white/[0.02]">
                            <div className="flex items-center gap-2 text-slate-400 hover:text-[#F0B90B] cursor-pointer transition-colors group">
                                <Settings size={14} className="group-hover:rotate-45 transition-transform duration-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Terminal Settings</span>
                            </div>
                        </div>
                    </div>

                    {/* Main Content Area */}
                    <div className="flex-1 flex flex-col bg-[#050505] relative">
                        {/* Tabs */}
                        <div className="flex items-center bg-[#0a0a0a] border-b border-white/5 overflow-x-auto no-scrollbar">
                            {tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    onClick={() => setActiveTabId(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2 border-r border-white/5 cursor-pointer transition-all min-w-[140px] max-w-[220px] relative group ${activeTabId === tab.id
                                        ? 'bg-[#151515] text-[#F0B90B]'
                                        : 'bg-transparent text-slate-500 hover:bg-white/5 hover:text-slate-300'
                                        }`}
                                >
                                    {activeTabId === tab.id && (
                                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#F0B90B] shadow-[0_0_10px_#F0B90B]" />
                                    )}
                                    {tab.serverId ? <Globe size={12} className={activeTabId === tab.id ? 'text-blue-400' : ''} /> : <Monitor size={12} className={activeTabId === tab.id ? 'text-[#F0B90B]' : ''} />}
                                    <span className="text-xs truncate font-bold tracking-tight">{tab.name}</span>
                                    <X
                                        size={12}
                                        className="ml-auto hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-white/10 rounded"
                                        onClick={(e) => closeTab(tab.id, e)}
                                    />
                                </div>
                            ))}
                            <button
                                onClick={() => addTab()}
                                className="px-3 py-2 text-slate-600 hover:text-[#F0B90B] transition-colors hover:bg-white/5"
                                title="New Tab"
                            >
                                <Plus size={14} />
                            </button>
                        </div>

                        {/* Terminal Viewports */}
                        <div className="flex-1 relative bg-black">
                            {tabs.map(tab => (
                                <div
                                    key={tab.id}
                                    ref={el => { containersRef.current[tab.id] = el; }}
                                    className={`absolute inset-0 p-3 pt-4 ${activeTabId === tab.id ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
                                />
                            ))}
                        </div>

                        {/* Status Footer */}
                        <div className="px-3 py-1 bg-[#0a0a0a] border-t border-white/5 flex items-center justify-between select-none">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 text-slate-500">
                                    <Wifi size={10} className="text-green-500" />
                                    <span className="text-[9px] font-bold uppercase tracking-wider">Connected</span>
                                </div>
                                <div className="h-2 w-[1px] bg-white/10"></div>
                                <div className="text-[9px] text-slate-400 font-mono tracking-wide opacity-50">
                                    {activeTabId.includes('local') ? 'local::core' : 'remote::ssh'}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-[#F0B90B] animate-pulse"></div>
                                <span className="text-[9px] text-[#F0B90B] font-bold tracking-wider opacity-80">ONLINE</span>
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
