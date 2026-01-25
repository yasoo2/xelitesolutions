
import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, Database, Play, Pause, BrainCircuit } from 'lucide-react';
import { motion } from 'framer-motion';

const generateData = () => {
    const data = [];
    for (let i = 0; i < 20; i++) {
        data.push({
            time: i,
            cpu: 30 + Math.random() * 40,
            memory: 50 + Math.random() * 20,
        });
    }
    return data;
};

export const SystemMonitor = () => {
    const [data, setData] = useState(generateData());
    const [brainStats, setBrainStats] = useState({
        reflexCount: 0,
        status: 'connecting',
        lastLearned: 'Initializing neural link...'
    });

    const isRunning = brainStats.status === 'running';

    const toggleTraining = async () => {
        try {
            await fetch('/api/system/brain/toggle', { method: 'POST' });
            // Immediate optimistic update not needed as polling handles it
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('/api/system/brain/stats');
                const json = await res.json();
                setBrainStats(prev => {
                    // Reduce flicker: If data is same, don't trigger rerender if purely identical object
                    return json;
                });
            } catch (e) {
                console.error('Brain stats failed', e);
            }
        };
        fetchStats();
        // HYPER-REALTIME POLLING (1s)
        const statInterval = setInterval(fetchStats, 1000);

        const interval = setInterval(() => {
            setData(prev => {
                const newData = [...prev.slice(1), {
                    time: prev[prev.length - 1].time + 1,
                    cpu: 30 + Math.random() * 40,
                    memory: 50 + Math.random() * 20,
                }];
                return newData;
            });
        }, 1000);
        return () => {
            clearInterval(interval);
            clearInterval(statInterval);
        };
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-6 col-span-2 row-span-1 relative overflow-hidden"
        >
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xl font-display font-bold flex items-center gap-2 neon-text">
                    <Activity className="text-cyan-400" /> SYSTEM VITALITY
                </h2>
                <div className="flex gap-4 text-sm text-gray-400 items-center">
                    <span className="flex items-center gap-1"><Cpu size={16} /> CORE: ONLINE</span>

                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/10">
                        <Database size={16} className={isRunning ? "text-green-400 animate-pulse" : "text-gray-500"} />
                        <span className={`font-mono font-bold ${isRunning ? "text-green-400" : "text-gray-400"}`}>
                            REFLEXES: {brainStats.reflexCount.toLocaleString()}
                        </span>

                        <button
                            onClick={toggleTraining}
                            className={`ml-2 p-1 rounded-full transition-colors ${isRunning ? 'bg-green-500/20 hover:bg-green-500/40 text-green-400' : 'bg-red-500/20 hover:bg-red-500/40 text-red-400'}`}
                            title={isRunning ? "Pause Auto-Training" : "Resume Auto-Training"}
                        >
                            {isRunning ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* LIVE KNOWLEDGE TICKER */}
            <div className="mb-4 text-xs font-mono flex items-center gap-2 text-cyan-300/80 bg-cyan-900/20 p-2 rounded border border-cyan-800/30">
                <BrainCircuit size={14} className={isRunning ? "animate-spin-slow" : ""} />
                <span className="opacity-50">LATEST INTEL:</span>
                <span className="truncate flex-1">{brainStats.lastLearned || "Waiting for signal..."}</span>
            </div>

            <div className="h-56 w-full min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="time" hide />
                        <YAxis hide domain={[0, 100]} />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid #333' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="cpu" stroke="#06b6d4" fillOpacity={1} fill="url(#colorCpu)" />
                        <Area type="monotone" dataKey="memory" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorMem)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
};
