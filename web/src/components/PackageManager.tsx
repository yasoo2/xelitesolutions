import { useState, useEffect } from 'react';
import { Package, Download, Trash2, Search, ExternalLink, Loader2, Layers, CheckCircle, AlertCircle } from 'lucide-react';
import { API_URL } from '../config';

interface Pkg {
    name: string;
    version: string;
    description?: string;
}

export default function PackageManager() {
    const [installed, setInstalled] = useState<Pkg[]>([]);
    const [searchResults, setSearchResults] = useState<Pkg[]>([]);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [searching, setSearching] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed');

    const loadInstalled = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/packages/installed`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInstalled(data.packages || []);
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        loadInstalled();
    }, []);

    const searchPackages = async () => {
        if (!query.trim()) return;
        setSearching(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/packages/search?q=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data.results || []);
            }
        } catch { }
        setSearching(false);
    };

    const handleAction = async (name: string, action: 'install' | 'uninstall') => {
        setInstalling(name);
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/packages/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ name })
            });
            await loadInstalled();
            if (action === 'install') setActiveTab('installed');
            alert(`Successfully ${action}ed ${name}`);
        } catch {
            alert(`Failed to ${action} ${name}`);
        }
        setInstalling(null);
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query && activeTab === 'browse') searchPackages();
        }, 600);
        return () => clearTimeout(timer);
    }, [query, activeTab]);

    return (
        <div className="flex flex-col h-full bg-[#0f1117] text-white font-sans">
            {/* Header */}
            <div className="p-4 border-b border-white/5 sticky top-0 bg-[#0f1117]/80 backdrop-blur z-10 glass-panel border-r-0">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-500 flex items-center justify-center border border-blue-500/20">
                        <Package size={18} />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm tracking-wide">PACKAGE MANAGER</h2>
                    </div>
                </div>

                <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                    <button
                        onClick={() => setActiveTab('installed')}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'installed' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                    >
                        Installed ({installed.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('browse')}
                        className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${activeTab === 'browse' ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/70'}`}
                    >
                        Browse Registry
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'browse' && (
                    <div className="mb-6 relative">
                        <input
                            type="text"
                            placeholder="Search npm..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-colors"
                        />
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                        {searching && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />}
                    </div>
                )}

                <div className="space-y-3">
                    {activeTab === 'installed' ? (
                        <>
                            {loading ? (
                                <div className="flex justify-center py-10"><Loader2 className="animate-spin opacity-50" /></div>
                            ) : installed.length === 0 ? (
                                <div className="text-center py-10 opacity-50">No packages installed</div>
                            ) : (
                                installed.map((pkg, i) => (
                                    <div key={i} className="group bg-white/5 hover:bg-white/[0.07] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <div className="font-bold text-sm text-white/90 flex items-center gap-2">
                                                    {pkg.name}
                                                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20">{pkg.version}</span>
                                                </div>
                                                {pkg.description && <div className="text-xs text-white/50 mt-1 line-clamp-1">{pkg.description}</div>}
                                            </div>
                                            <button
                                                onClick={() => { if (confirm(`Uninstall ${pkg.name}?`)) handleAction(pkg.name, 'uninstall'); }}
                                                disabled={!!installing}
                                                className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                                                title="Uninstall"
                                            >
                                                {installing === pkg.name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </>
                    ) : (
                        <>
                            {query && searchResults.length === 0 && !searching && (
                                <div className="text-center py-10 opacity-50">No results found</div>
                            )}

                            {!query && (
                                <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-3">
                                    <Search size={48} className="opacity-20" />
                                    <p className="text-sm">Search the npm registry...</p>
                                </div>
                            )}

                            {searchResults.map((pkg, i) => {
                                const installedVer = installed.find(p => p.name === pkg.name)?.version;
                                return (
                                    <div key={i} className="group bg-white/5 hover:bg-white/[0.07] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-sm text-white/90 truncate">{pkg.name}</span>
                                                    {installedVer && <CheckCircle size={12} className="text-green-500" />}
                                                </div>
                                                {pkg.description && <div className="text-xs text-white/50 line-clamp-2">{pkg.description}</div>}
                                                <div className="flex items-center gap-3 mt-3 text-xs text-white/30">
                                                    <span className="flex items-center gap-1"><Layers size={10} /> {pkg.version}</span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleAction(pkg.name, 'install')}
                                                disabled={!!installing || !!installedVer}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${installedVer
                                                        ? 'bg-green-500/10 text-green-500 cursor-default'
                                                        : 'bg-white/10 hover:bg-blue-500 hover:text-white text-white/70'
                                                    }`}
                                            >
                                                {installing === pkg.name ? (
                                                    <Loader2 size={12} className="animate-spin" />
                                                ) : installedVer ? (
                                                    'Installed'
                                                ) : (
                                                    <>
                                                        <Download size={12} /> Install
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
