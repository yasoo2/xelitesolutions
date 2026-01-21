import React, { useState, useEffect } from 'react';
import { Plus, Server, Check, AlertCircle, Trash2, Key, Lock, Globe } from 'lucide-react';
import { API_URL } from '../../config';

interface ServerConfig {
    id: string;
    name: string;
    host: string;
    username: string;
    authMethod: 'key' | 'password';
    isActive: boolean;
    connectionStatus?: {
        isConnected: boolean;
        lastError?: string;
    };
}

export default function ServerSelector({ onConnect }: { onConnect: (session: any) => void }) {
    const [servers, setServers] = useState<ServerConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [newServer, setNewServer] = useState({
        name: '',
        host: '',
        port: 22,
        username: '',
        authMethod: 'password' as const,
        password: '',
        keyPath: ''
    });

    const fetchServers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/servers`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setServers(data);
            }
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchServers();
    }, []);

    const handleAddServer = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/api/servers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(newServer)
            });
            if (res.ok) {
                setIsAdding(false);
                fetchServers();
            }
        } catch (error) {
            console.error('Failed to add server:', error);
        }
    };

    const handleConnect = (server: ServerConfig) => {
        onConnect({
            id: `ssh-${server.id}`,
            name: server.name,
            type: 'ssh',
            serverId: server.id,
            lastActive: new Date()
        });
    };

    const handleDeleteServer = async (id: string) => {
        if (!confirm('Are you sure you want to remove this server?')) return;
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/api/servers/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fetchServers();
        } catch (error) {
            console.error('Failed to delete server:', error);
        }
    };

    if (isAdding) {
        return (
            <form onSubmit={handleAddServer} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Display Name</label>
                        <input
                            type="text"
                            value={newServer.name}
                            onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="e.g. Production API"
                            required
                        />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Host / IP</label>
                        <input
                            type="text"
                            value={newServer.host}
                            onChange={e => setNewServer({ ...newServer, host: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="1.2.3.4"
                            required
                        />
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Username</label>
                        <input
                            type="text"
                            value={newServer.username}
                            onChange={e => setNewServer({ ...newServer, username: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="root"
                            required
                        />
                    </div>
                    <div className="col-span-2 space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Auth Method</label>
                        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
                            <button
                                type="button"
                                onClick={() => setNewServer({ ...newServer, authMethod: 'password' })}
                                className={`flex-1 flex items-center justify-center gap-2 py-1 rounded text-xs transition-colors ${newServer.authMethod === 'password' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                <Lock size={12} /> Password
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewServer({ ...newServer, authMethod: 'key' })}
                                className={`flex-1 flex items-center justify-center gap-2 py-1 rounded text-xs transition-colors ${newServer.authMethod === 'key' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                <Key size={12} /> SSH Key
                            </button>
                        </div>
                    </div>
                </div>

                {newServer.authMethod === 'password' ? (
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Password</label>
                        <input
                            type="password"
                            value={newServer.password}
                            onChange={e => setNewServer({ ...newServer, password: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="••••••••"
                        />
                    </div>
                ) : (
                    <div className="space-y-1">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Key Path (Local to API)</label>
                        <input
                            type="text"
                            value={newServer.keyPath}
                            onChange={e => setNewServer({ ...newServer, keyPath: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                            placeholder="/home/joe/.ssh/id_rsa"
                        />
                    </div>
                )}

                <div className="flex items-center gap-3 pt-4">
                    <button
                        type="submit"
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold py-2.5 rounded-lg transition-colors"
                    >
                        Save & Connect
                    </button>
                    <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        className="px-6 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-bold rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        );
    }

    return (
        <div className="space-y-3">
            <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 no-scrollbar">
                {servers.length === 0 && !loading && (
                    <div className="py-12 text-center space-y-3">
                        <Globe className="mx-auto text-slate-600" size={48} />
                        <p className="text-slate-400 text-sm">No remote servers configured yet.</p>
                    </div>
                )}

                {servers.map(server => (
                    <div
                        key={server.id}
                        className="group flex items-center justify-between p-3 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 rounded-xl transition-all cursor-pointer"
                        onClick={() => handleConnect(server)}
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                                <Server className="text-emerald-400" size={20} />
                            </div>
                            <div>
                                <h5 className="text-slate-100 font-bold text-sm tracking-tight">{server.name}</h5>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-slate-500 font-medium">{server.username}@{server.host}</span>
                                    {server.connectionStatus?.isConnected && (
                                        <Check size={10} className="text-emerald-500" />
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteServer(server.id); }}
                                className="p-2 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700 hover:border-blue-500/50 hover:bg-blue-500/5 rounded-xl text-slate-500 hover:text-blue-400 transition-all font-bold text-xs uppercase tracking-widest"
            >
                <Plus size={16} />
                Add New Server
            </button>
        </div>
    );
}
