import { useState, useEffect } from 'react';
import { GitBranch, RefreshCw, Upload, Download, Check, X, File, FileText, Loader2, GitCommit, ArrowUp, ArrowDown } from 'lucide-react';
import { API_URL } from '../config';

interface GitStatus {
    branch: string;
    ahead: number;
    behind: number;
    files: Array<{ file: string; status: string }>;
}

export default function GitPanel() {
    const [status, setStatus] = useState<GitStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [committing, setCommitting] = useState(false);

    const loadStatus = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/git/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setStatus(await res.json());
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const handleCommit = async () => {
        if (!message.trim()) return;
        setCommitting(true);
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/git/commit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message, push: true })
            });
            setMessage('');
            loadStatus();
            alert('Changes committed and pushed!');
        } catch {
            alert('Failed to commit');
        }
        setCommitting(false);
    };

    const handleSync = async (action: 'pull' | 'push') => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            await fetch(`${API_URL}/git/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            loadStatus();
        } catch { }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#0f1117] text-white font-sans">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0f1117]/80 backdrop-blur z-10 glass-panel border-r-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/20 text-orange-500 flex items-center justify-center border border-orange-500/20">
                        <GitBranch size={18} />
                    </div>
                    <div>
                        <h2 className="font-bold text-sm tracking-wide">SOURCE CONTROL</h2>
                        {status && (
                            <div className="flex items-center gap-2 text-[10px] text-white/50">
                                <span className="flex items-center gap-1"><GitBranch size={10} /> {status.branch}</span>
                                {(status.ahead > 0 || status.behind > 0) && (
                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                                        <ArrowUp size={10} /> {status.ahead} <ArrowDown size={10} /> {status.behind}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <button
                    onClick={loadStatus}
                    disabled={loading}
                    className="p-2 rounded-lg hover:bg-white/5 text-white/50 hover:text-white transition-colors"
                >
                    <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {/* Actions Grid */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                        onClick={() => handleSync('pull')}
                        disabled={loading}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all text-xs font-medium gap-2 group"
                    >
                        <Download size={20} className="text-white/50 group-hover:text-blue-400 transition-colors" />
                        Pull Changes
                    </button>
                    <button
                        onClick={() => handleSync('push')}
                        disabled={loading}
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/10 transition-all text-xs font-medium gap-2 group"
                    >
                        <Upload size={20} className="text-white/50 group-hover:text-green-400 transition-colors" />
                        Push Changes
                    </button>
                </div>

                {/* Changed Files */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-3 px-1">
                        <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider">Changes ({status?.files.length || 0})</h3>
                    </div>

                    {status?.files.length === 0 ? (
                        <div className="text-center py-12 text-white/20 border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                            <Check size={32} className="mx-auto mb-2 opacity-50" />
                            <p className="text-xs">Working tree clean</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {status?.files.map((file, i) => (
                                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 group transition-colors cursor-default">
                                    <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${file.status.includes('M') ? 'bg-yellow-500/10 text-yellow-500' :
                                            file.status.includes('A') ? 'bg-green-500/10 text-green-500' :
                                                file.status.includes('D') ? 'bg-red-500/10 text-red-500' :
                                                    'bg-blue-500/10 text-blue-500'
                                        }`}>
                                        {file.status.trim()[0] || 'M'}
                                    </div>
                                    <span className="text-sm font-mediumtruncate flex-1 font-mono text-white/80">{file.file}</span>
                                    <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-white/10 rounded text-white/50 hover:text-white transition-all">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Commit Footer */}
            <div className="p-4 border-t border-white/5 bg-[#0f1117]/80 backdrop-blur z-10 glass-panel border-r-0">
                <div className="bg-white/5 rounded-xl border border-white/5 p-1 mb-3 focus-within:border-white/20 focus-within:bg-white/10 transition-all">
                    <input
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Commit message..."
                        className="w-full bg-transparent border-none p-2 text-sm focus:outline-none placeholder:text-white/20"
                    />
                </div>
                <button
                    onClick={handleCommit}
                    disabled={committing || !message.trim()}
                    className="premium-btn w-full"
                >
                    {committing ? <Loader2 size={16} className="animate-spin" /> : <GitCommit size={16} />}
                    Commit & Push
                </button>
            </div>
        </div>
    );
}
