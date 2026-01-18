
import { useState, useEffect } from 'react';
import { GitBranch, GitCommit, GitPullRequest, RefreshCw, UploadCloud, DownloadCloud, Check, Plus, Minus, FileText } from 'lucide-react';
import { API_URL } from '../config';

interface GitFile {
    status: string;
    file: string;
}

export default function GitPanel() {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<GitFile[]>([]);
    const [branch, setBranch] = useState('');
    const [ahead, setAhead] = useState(0);
    const [behind, setBehind] = useState(0);
    const [message, setMessage] = useState('');
    const [committing, setCommitting] = useState(false);
    const [pushing, setPushing] = useState(false);
    const [pulling, setPulling] = useState(false);

    const loadStatus = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/git/status`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.initialized) {
                    setStatus(data.files || []);
                    setBranch(data.branch || 'unknown');
                    setAhead(data.ahead || 0);
                    setBehind(data.behind || 0);
                }
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        loadStatus();
    }, []);

    const handleStage = async (file: string) => {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/git/stage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ files: file })
        });
        loadStatus();
    };

    const handleUnstage = async (file: string) => {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/git/unstage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ files: file })
        });
        loadStatus();
    };

    const handleCommit = async () => {
        if (!message.trim()) return;
        setCommitting(true);
        const token = localStorage.getItem('token');
        // Stage all tracked changes first for convenience if user wants "commit all"
        // But let's assume user staged them or we auto-stage -A via Agent.
        // For this simple UI, we rely on user staging or we stage all if none staged?
        // Let's implement "Stage All & Commit" logic implicitly or explicitly.
        // For now, simpler: Just commit what is staged.

        // Wait, standard git commit only commits staged.
        // Let's add a "Stage All" button? Or just stage all by default.
        // Better UX: "Commit & Sync" button stages all.
        try {
            // Auto-stage all for MVP ease of use
            await fetch(`${API_URL}/git/stage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ files: '.' })
            });

            const res = await fetch(`${API_URL}/git/commit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message })
            });
            if (res.ok) {
                setMessage('');
                loadStatus();
            } else {
                alert('Commit failed');
            }
        } catch {
            alert('Network error');
        }
        setCommitting(false);
    };

    const handlePush = async () => {
        setPushing(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/git/push`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            loadStatus();
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || 'Push failed');
        }
        setPushing(false);
    };

    const handlePull = async () => {
        setPulling(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/git/pull`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
            loadStatus();
        } else {
            alert('Pull failed');
        }
        setPulling(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#0f1117] text-white/90 select-none">
            {/* Header */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="bg-orange-500/20 text-orange-500 p-2 rounded-lg">
                        <GitBranch size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold">Source Control</h2>
                        <div className="text-xs text-white/40 flex items-center gap-2">
                            <span>{branch}</span>
                            {ahead > 0 && <span className="text-green-400">↑{ahead}</span>}
                            {behind > 0 && <span className="text-red-400">↓{behind}</span>}
                        </div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <button onClick={loadStatus} disabled={loading} className="p-2 hover:bg-white/5 rounded text-white/40 hover:text-white">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Changes List */}
            <div className="flex-1 overflow-auto p-4 space-y-2">
                {status.length === 0 && !loading && (
                    <div className="text-center py-10 text-white/30 text-sm">No changes detected.</div>
                )}

                {status.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded hover:bg-white/10 group">
                        <div className="flex items-center gap-2 overflow-hidden">
                            <span className={`font-mono text-[10px] px-1 rounded ${item.status.includes('M') ? 'bg-yellow-500/20 text-yellow-500' : item.status.includes('?') ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                {item.status.trim() || '?'}
                            </span>
                            <span className="text-sm truncate" title={item.file}>{item.file}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Staging actions could go here */}
                            <button className="p-1 hover:text-white text-white/40" title="Diff (Coming Soon)">
                                <FileText size={14} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions Footer */}
            <div className="p-4 border-t border-white/5 space-y-3">
                <div className="flex gap-2">
                    <button
                        onClick={handlePull}
                        disabled={pulling}
                        className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded flex items-center justify-center gap-2 text-xs font-medium transition-colors"
                    >
                        {pulling ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                        Pull
                    </button>
                    <button
                        onClick={handlePush}
                        disabled={pushing}
                        className="flex-1 bg-white/5 hover:bg-white/10 py-2 rounded flex items-center justify-center gap-2 text-xs font-medium transition-colors"
                    >
                        {pushing ? <RefreshCw size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                        Push
                    </button>
                </div>

                <div className="flex flex-col gap-2">
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Commit message..."
                        className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-sm focus:border-orange-500/50 outline-none resize-none h-20"
                    />
                    <button
                        onClick={handleCommit}
                        disabled={committing || !message.trim()}
                        className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                        {committing ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                        Commit All & Push
                    </button>
                </div>
            </div>
        </div>
    );
}
