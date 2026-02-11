import React, { useState, useEffect } from 'react';

// Mock Data for Threat Map
const threatData = Array.from({ length: 20 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    level: Math.random() > 0.7 ? 'critical' : 'warning',
}));

// Mock Data for Live Log
const generateLog = () => {
    const actions = ['Packet Dropped', 'Intrusion Attempt', 'Firewall Update', 'User Login', 'Data Encrypted'];
    const targets = ['192.168.1.10', '10.0.0.5', 'Server-Alpha', 'DB-Main', 'Gateway-01'];
    return `[${new Date().toLocaleTimeString()}] ${actions[Math.floor(Math.random() * actions.length)]} -> ${targets[Math.floor(Math.random() * targets.length)]}`;
};

const CyberDashboard: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [activeDefenses, setActiveDefenses] = useState({ firewall: true, aiScanner: true, encryption: false });

    // Simulate Live Logs
    useEffect(() => {
        const interval = setInterval(() => {
            setLogs(prev => [generateLog(), ...prev].slice(0, 50));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const toggleDefense = (key: keyof typeof activeDefenses) => {
        setActiveDefenses(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="min-h-screen bg-black text-cyan-400 p-8 font-mono relative overflow-hidden selection:bg-fuchsia-500 selection:text-white">
            {/* Background Grid */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#083344_1px,transparent_1px),linear-gradient(to_bottom,#083344_1px,transparent_1px)] bg-[size:40px_40px] opacity-20 pointer-events-none"></div>

            {/* Header */}
            <header className="relative z-10 flex justify-between items-center mb-8 border-b border-cyan-800 pb-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">
                        CYBER_WATCH_V9
                    </h1>
                    <p className="text-sm text-cyan-700 mt-1">SYSTEM_STATUS: <span className="text-green-400 animate-pulse">ONLINE</span></p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-fuchsia-400">SECURE_CONNECTION</p>
                    <p className="text-xl font-mono">{new Date().toLocaleTimeString()}</p>
                </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">

                {/* Threat Map */}
                <div className="lg:col-span-2 relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-fuchsia-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative h-96 bg-black/80 backdrop-blur-xl border border-cyan-900/50 rounded-lg p-6 overflow-hidden">
                        <h2 className="text-xl font-bold mb-4 flex items-center text-fuchsia-400">
                            <span className="w-2 h-2 bg-fuchsia-500 rounded-full mr-2 animate-ping"></span>
                            GLOBAL_THREAT_MAP
                        </h2>
                        <div className="relative w-full h-full border border-cyan-900/30 rounded bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 to-black">
                            {/* Radar Sweep Effect */}
                            <div className="absolute inset-0 w-full h-full animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_340deg,rgba(34,211,238,0.1)_360deg)] rounded-full origin-center scale-150"></div>

                            {threatData.map((threat) => (
                                <div
                                    key={threat.id}
                                    className={`absolute w-3 h-3 rounded-full ${threat.level === 'critical' ? 'bg-red-500 shadow-[0_0_15px_red]' : 'bg-yellow-400'} animate-pulse`}
                                    style={{ top: `${threat.y}%`, left: `${threat.x}%` }}
                                    title={`Threat ID: ${threat.id} [${threat.level.toUpperCase()}]`}
                                ></div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Defense Controls */}
                <div className="space-y-6">
                    <div className="relative group">
                        <div className="absolute -inset-0.5 bg-gradient-to-r from-fuchsia-500 to-cyan-500 rounded-lg blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                        <div className="relative bg-black/80 backdrop-blur-xl border border-cyan-900/50 rounded-lg p-6">
                            <h2 className="text-xl font-bold mb-4 text-cyan-400 border-b border-cyan-900 pb-2">DEFENSE_MATRIX</h2>
                            <div className="space-y-4">
                                {Object.entries(activeDefenses).map(([key, active]) => (
                                    <div key={key} className="flex items-center justify-between">
                                        <span className="uppercase text-sm tracking-wider">{key.replace(/([A-Z])/g, ' $1')}</span>
                                        <button
                                            onClick={() => toggleDefense(key as any)}
                                            className={`px-4 py-1 rounded text-xs font-bold transition-all duration-300 ${active
                                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
                                                : 'bg-red-900/20 text-red-500 border border-red-900 grayscale'
                                                }`}
                                        >
                                            {active ? 'ACTIVE' : 'OFFLINE'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* System Stats */}
                    <div className="relative bg-black/80 backdrop-blur-xl border border-cyan-900/50 rounded-lg p-6">
                        <h2 className="text-xl font-bold mb-4 text-cyan-400">CPU_LOAD</h2>
                        <div className="w-full bg-gray-900 rounded-full h-2.5 mb-2">
                            <div className="bg-gradient-to-r from-cyan-400 to-fuchsia-500 h-2.5 rounded-full" style={{ width: '78%' }}></div>
                        </div>
                        <div className="flex justify-between text-xs text-slate-500">
                            <span>CORE_01: 78%</span>
                            <span>TEMP: 65°C</span>
                        </div>
                    </div>
                </div>

                {/* Live Log */}
                <div className="lg:col-span-3 relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-fuchsia-500 rounded-lg blur opacity-20"></div>
                    <div className="relative h-64 bg-black/90 backdrop-blur-md border border-cyan-900/50 rounded-lg p-4 font-mono text-xs overflow-hidden">
                        <h3 className="text-fuchsia-400 font-bold mb-2 sticky top-0 bg-black/90 p-1 border-b border-fuchsia-900/30">&gt;&gt; SYSTEM_LOG_STREAM</h3>
                        <div className="h-full overflow-y-auto pb-8 space-y-1 scrollbar-thin scrollbar-thumb-cyan-900 scrollbar-track-black">
                            {logs.map((log, i) => (
                                <div key={i} className="hover:bg-cyan-900/20 px-2 py-0.5 rounded transition-colors">
                                    <span className="text-fuchsia-600 mr-2">$</span>
                                    <span className={log.includes('Intrusion') ? 'text-red-400' : 'text-cyan-300'}>{log}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CyberDashboard;
