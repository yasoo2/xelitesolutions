import React, { useState, useEffect } from 'react';
import { Activity, Cpu, Server, Play, XOctagon, RefreshCw, Box } from 'lucide-react';
import { API_URL as API } from '../config';

export default function ProcessManager() {
    const [stats, setStats] = useState<any>(null);
    const [processes, setProcesses] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: token ? `Bearer ${token}` : '' };

            const [statsRes, procRes] = await Promise.all([
                fetch(`${API}/system/stats`, { headers }),
                fetch(`${API}/system/processes`, { headers })
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (procRes.ok) setProcesses((await procRes.json()).processes);

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, []);

    const killProcess = async (pid: string) => {
        if (!confirm(`Kill process ${pid}?`)) return;
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API}/system/processes/${pid}`, {
                method: 'DELETE',
                headers: { Authorization: token ? `Bearer ${token}` : '' }
            });
            fetchData();
        } catch (e) {
            alert('Failed to kill process');
        }
    };

    if (!stats) return <div className="p-4 text-center text-[var(--text-muted)]">Loading system stats...</div>;

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)]">
            <div className="p-4 border-b border-[var(--border-color)] grid grid-cols-3 gap-4">
                <div className="card p-3 flex flex-col items-center">
                    <div className="text-[var(--text-muted)] text-xs uppercase mb-1 flex items-center gap-1">
                        <Cpu size={12} /> CPU Load
                    </div>
                    <div className="text-xl font-bold">{stats.cpu.load.toFixed(2)}</div>
                    <div className="text-xs text-[var(--text-secondary)]">{stats.cpu.cores} Cores</div>
                </div>
                <div className="card p-3 flex flex-col items-center">
                    <div className="text-[var(--text-muted)] text-xs uppercase mb-1 flex items-center gap-1">
                        <Box size={12} /> Memory
                    </div>
                    <div className="text-xl font-bold">{stats.memory.percent}%</div>
                    <div className="text-xs text-[var(--text-secondary)]">
                        {Math.round(stats.memory.used / 1024 / 1024)}MB / {Math.round(stats.memory.total / 1024 / 1024)}MB
                    </div>
                </div>
                <div className="card p-3 flex flex-col items-center">
                    <div className="text-[var(--text-muted)] text-xs uppercase mb-1 flex items-center gap-1">
                        <Activity size={12} /> Uptime
                    </div>
                    <div className="text-xl font-bold">{Math.floor(stats.uptime / 3600)}h {Math.floor((stats.uptime % 3600) / 60)}m</div>
                    <div className="text-xs text-[var(--text-secondary)]">{stats.platform}</div>
                </div>
            </div>

            <div className="p-3 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex justify-between items-center">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                    <Server size={14} /> Active Processes
                </h3>
                <button onClick={fetchData} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                </button>
            </div>

            <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-xs text-left">
                    <thead className="bg-[var(--bg-secondary)] text-[var(--text-muted)] sticky top-0">
                        <tr>
                            <th className="p-2">PID</th>
                            <th className="p-2">User</th>
                            <th className="p-2">%CPU</th>
                            <th className="p-2">%Mem</th>
                            <th className="p-2">Command</th>
                            <th className="p-2">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processes.map(p => (
                            <tr key={p.pid} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-hover)] font-mono">
                                <td className="p-2 text-[var(--accent-primary)]">{p.pid}</td>
                                <td className="p-2">{p.user}</td>
                                <td className="p-2">{p.cpu}</td>
                                <td className="p-2">{p.mem}</td>
                                <td className="p-2 truncate max-w-[200px]" title={p.command}>{p.command}</td>
                                <td className="p-2">
                                    <button 
                                        onClick={() => killProcess(p.pid)}
                                        className="text-[var(--accent-danger)] hover:text-red-400 p-1 rounded hover:bg-[var(--bg-active)]"
                                        title="Kill Process"
                                    >
                                        <XOctagon size={14} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
