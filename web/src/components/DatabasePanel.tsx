
import { useState } from 'react';
import { Database, Zap, Archive, Play, Activity } from 'lucide-react';
import { API_URL } from '../config';
import { formatNumber } from '../utils/formatters';


export default function DatabasePanel() {
    const [activeTab, setActiveTab] = useState<'migrate' | 'seed' | 'optimize'>('migrate');
    const [rows, setRows] = useState(1000);
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);

    const log = (msg: string) => setLogs(p => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleAction = async (endpoint: string, body: any) => {
        setLoading(true);
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${API_URL}/database/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (data.ok) {
                log(`Success: ${JSON.stringify(data.output || data)}`);
            } else {
                log(`Error: ${data.error}`);
            }
        } catch {
            log('Network Error');
        }
        setLoading(false);
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0f1c] text-white font-mono">
            <div className="p-4 border-b border-blue-900/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Database className="text-blue-400" />
                    <h2 className="font-bold">DB Commander</h2>
                </div>
                <div className="flex bg-blue-900/20 rounded p-1 gap-1">
                    {['migrate', 'seed', 'optimize'].map(t => (
                        <button
                            key={t}
                            onClick={() => setActiveTab(t as any)}
                            className={`px-3 py-1 rounded text-xs uppercase ${activeTab === t ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-blue-900/40'}`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 p-6 overflow-auto">
                    {activeTab === 'migrate' && (
                        <div className="space-y-4 max-w-md">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Archive /> Schema Management</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => handleAction('migrate', { action: 'status' })} className="p-4 bg-white/5 hover:bg-white/10 rounded border border-white/10 text-left">
                                    <div className="font-bold">Check Status</div>
                                    <div className="text-xs text-white/50 mt-1">Verify sync state</div>
                                </button>
                                <button onClick={() => handleAction('migrate', { action: 'push' })} className="p-4 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded text-left">
                                    <div className="font-bold">Push Schema</div>
                                    <div className="text-xs opacity-70 mt-1">Sync w/o migration</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'seed' && (
                        <div className="space-y-4 max-w-md">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Zap /> Chaos Lab</h3>
                            <div className="p-4 bg-white/5 rounded border border-white/10">
                                <label className="block text-xs uppercase text-white/50 mb-2">Rows to Generate</label>
                                <input
                                    type="number"
                                    value={rows}
                                    onChange={(e) => setRows(Number(e.target.value))}
                                    className="w-full bg-black border border-white/20 p-2 rounded mb-4"
                                />
                                <button
                                    onClick={() => handleAction('seed', { rows, outputPath: '/tmp/seed.csv', format: 'csv' })}
                                    disabled={loading}
                                    className="w-full py-3 bg-red-600 hover:bg-red-500 rounded font-bold flex items-center justify-center gap-2"
                                >
                                    <Zap size={16} /> Generate {formatNumber(rows)} Rows

                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'optimize' && (
                        <div className="space-y-4">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><Activity /> Performance Tuner</h3>
                            <textarea
                                placeholder="Paste SQL query to analyze..."
                                className="w-full h-32 bg-black border border-white/20 p-4 rounded font-mono text-sm"
                            />
                            <button className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded font-bold">Analyze</button>
                        </div>
                    )}
                </div>

                <div className="w-80 bg-black/50 border-l border-white/10 p-4 flex flex-col">
                    <h4 className="text-xs uppercase text-white/40 mb-2 font-bold">Console Output</h4>
                    <div className="flex-1 overflow-auto font-mono text-xs space-y-1 text-green-400">
                        {logs.map((l, i) => <div key={i}>{l}</div>)}
                        {logs.length === 0 && <div className="text-white/20 italic">Ready...</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
