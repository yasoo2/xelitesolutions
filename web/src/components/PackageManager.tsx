
import React, { useState, useEffect } from 'react';
import { Package, Search, Download, Trash2, Loader2, ArrowRight, CheckCircle, ExternalLink } from 'lucide-react';
import { API_URL } from '../config';

interface PackageInfo {
    name: string;
    version: string;
    description: string;
    keywords: string[];
    date: string;
    links: { npm: string; repository?: string; homepage?: string };
    status?: 'installed' | 'installing' | 'error';
}

interface InstalledPackages {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}

export default function PackageManager() {
    const [activeTab, setActiveTab] = useState<'installed' | 'search'>('installed');
    const [installed, setInstalled] = useState<InstalledPackages>({ dependencies: {}, devDependencies: {} });
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PackageInfo[]>([]);
    const [searching, setSearching] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);

    const fetchInstalled = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/packages`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setInstalled(data);
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        fetchInstalled();
    }, []);

    useEffect(() => {
        if (!query.trim() || activeTab !== 'search') return;
        const handler = setTimeout(async () => {
            setSearching(true);
            const token = localStorage.getItem('token');
            try {
                const res = await fetch(`${API_URL}/packages/search?q=${encodeURIComponent(query)}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const data = await res.json();
                setSearchResults(data.results || []);
            } catch { }
            setSearching(false);
        }, 800);
        return () => clearTimeout(handler);
    }, [query, activeTab]);

    const handleAction = async (pkgName: string, action: 'install' | 'uninstall' | 'install-dev') => {
        setInstalling(pkgName);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/packages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    package: pkgName,
                    action: action === 'uninstall' ? 'uninstall' : 'install',
                    dev: action === 'install-dev'
                })
            });
            if (res.ok) {
                // Refresh installed list
                await fetchInstalled();
                // Update search results status if needed (mock for now or refetch)
            } else {
                alert('Operation failed. Check server logs.');
            }
        } catch (e) {
            alert('Network error');
        }
        setInstalling(null);
    };

    const isInstalled = (name: string) => {
        return !!(installed.dependencies[name] || installed.devDependencies[name]);
    };

    const renderItem = (name: string, version: string, type: 'dep' | 'dev') => (
        <div key={name} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-lg hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded ${type === 'dep' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    <Package size={18} />
                </div>
                <div>
                    <div className="font-medium text-sm text-white/90">{name}</div>
                    <div className="text-xs text-white/40 font-mono">{version} • {type === 'dep' ? 'Dependency' : 'DevDependency'}</div>
                </div>
            </div>
            <button
                onClick={() => {
                    if (confirm(`Uninstall ${name}?`)) handleAction(name, 'uninstall');
                }}
                disabled={!!installing}
                className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-white/30 transition-colors"
                title="Uninstall"
            >
                {installing === name ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            </button>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-[#0f1117] text-white/90 select-none">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-red-500/20 text-red-500 p-2 rounded-lg">
                        <Package size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold">Package Manager</h2>
                        <div className="text-xs text-white/40">NPM Registry GUI</div>
                    </div>
                </div>
                <div className="flex bg-white/5 rounded-lg p-1 gap-1">
                    <button
                        onClick={() => setActiveTab('installed')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'installed' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                        Installed
                    </button>
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${activeTab === 'search' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'}`}
                    >
                        Browse Registry
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4 content-area">
                {activeTab === 'installed' ? (
                    <div className="space-y-2">
                        {loading && <div className="text-center py-10 opacity-50"><Loader2 className="animate-spin mx-auto mb-2" />Loading packages...</div>}

                        {!loading && Object.keys(installed.dependencies).length === 0 && Object.keys(installed.devDependencies).length === 0 && (
                            <div className="text-center py-20 text-white/30">No packages found.</div>
                        )}

                        {Object.entries(installed.dependencies).map(([k, v]) => renderItem(k, v, 'dep'))}
                        {Object.entries(installed.devDependencies).map(([k, v]) => renderItem(k, v, 'dev'))}
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search packages (e.g. react, lodash, three)..."
                                className="w-full bg-black/20 text-white border border-white/10 rounded-xl pl-10 pr-4 py-3 focus:border-blue-500/50 outline-none transition-colors"
                            />
                            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 className="animate-spin text-white/30" size={16} /></div>}
                        </div>

                        <div className="space-y-2">
                            {searchResults.map((pkg) => {
                                const installedVer = installed.dependencies[pkg.name] || installed.devDependencies[pkg.name];
                                return (
                                    <div key={pkg.name} className="flex flex-col gap-2 p-4 bg-white/5 border border-white/5 rounded-xl hover:border-white/10 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-blue-400">{pkg.name}</span>
                                                    <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] text-white/60">v{pkg.version}</span>
                                                    {installedVer && <span className="flex items-center gap-1 text-[10px] text-green-400"><CheckCircle size={10} /> Installed</span>}
                                                </div>
                                                <p className="text-sm text-white/60 mt-1 line-clamp-2">{pkg.description}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {pkg.links.npm && (
                                                    <a href={pkg.links.npm} target="_blank" rel="noreferrer" className="p-2 hover:bg-white/10 rounded-lg text-white/30 hover:text-white transition-colors">
                                                        <ExternalLink size={16} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                                            <button
                                                onClick={() => handleAction(pkg.name, 'install')}
                                                disabled={!!installing || !!installedVer}
                                                className="flex-1 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                {installing === pkg.name ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                                Install
                                            </button>
                                            <button
                                                onClick={() => handleAction(pkg.name, 'install-dev')}
                                                disabled={!!installing || !!installedVer}
                                                className="flex-1 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
                                            >
                                                {installing === pkg.name ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                                Install Dev
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                            {query && !searching && searchResults.length === 0 && (
                                <div className="text-center py-10 text-white/30">No results found.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
