
import { useState, useEffect } from 'react';
import { Play, CheckCircle, XCircle, Clock, GitCommit } from 'lucide-react';
import { API_URL } from '../config';

export default function ActionsPanel() {
    const [runs, setRuns] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const loadRuns = async () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/actions/runs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.ok && data.output?.runs) {
                    setRuns(data.output.runs);
                }
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => {
        loadRuns();
    }, []);

    return (
        <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] font-sans">
            <div className="p-4 border-b border-[#30363d] flex items-center justify-between">
                <h2 className="font-bold flex items-center gap-2"><Play size={20} /> Workflow Runs</h2>
                <button onClick={loadRuns} disabled={loading} className="text-xs text-blue-400 hover:underline">Refresh</button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
                {runs.length === 0 && !loading && (
                    <div className="text-center py-10 opacity-50">
                        No recent workflow runs found.
                        <div className="text-xs mt-2">Check backend configuration for GITHUB_TOKEN</div>
                    </div>
                )}

                {runs.map((run: any) => (
                    <div key={run.id} className="p-3 border border-[#30363d] rounded-md bg-[#161b22] hover:bg-[#1f242c] transition-colors">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                {run.status === 'completed' && run.conclusion === 'success' ? <CheckCircle className="text-green-500" size={18} /> :
                                    run.status === 'completed' && run.conclusion === 'failure' ? <XCircle className="text-red-500" size={18} /> :
                                        <Clock className="text-yellow-500 animate-pulse" size={18} />}

                                <div>
                                    <div className="font-semibold text-sm">{run.name}</div>
                                    <div className="text-xs text-[#8b949e] flex items-center gap-2 mt-1">
                                        <span>{run.head_branch}</span>
                                        <GitCommit size={10} />
                                        <span className="font-mono">{run.head_sha.substring(0, 7)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-xs text-[#8b949e]">
                                {new Date(run.created_at).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
