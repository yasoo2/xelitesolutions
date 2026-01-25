'use client';

import { Activity, Box, Cpu, Server, Brain, Play, Pause, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSystemStats, getBrainStats, toggleBrainTraining } from '@/lib/api';
import { formatNumber } from './utils/formatters';


export default function Home() {
  const [stats, setStats] = useState<any>(null);
  const [brainStats, setBrainStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [sysData, brainData] = await Promise.all([
        getSystemStats(),
        getBrainStats()
      ]);
      setStats(sysData);
      setBrainStats(brainData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // Poll every 2 seconds for brain high-speed feeling
    const interval = setInterval(fetchAll, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async () => {
    try {
      await toggleBrainTraining();
      // Optimization fetch
      const d = await getBrainStats();
      setBrainStats(d);
    } catch (e) {
      console.error(e);
    }
  };

  const isLearning = brainStats?.status === 'running';

  const cards = [
    {
      title: 'Active Runs',
      value: stats?.activeRuns ?? '-',
      icon: Activity,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Neural Synapses',
      value: formatNumber(brainStats?.reflexCount || 0),

      icon: Brain,
      color: isLearning ? 'text-purple-500' : 'text-gray-500',
      bg: isLearning ? 'bg-purple-500/10' : 'bg-gray-500/10',
      suffix: isLearning ? ' (Learning)' : ' (Paused)'
    },
    {
      title: 'Total Tools',
      value: stats?.toolsCount ?? '-',
      icon: Box,
      color: 'text-cyan-500',
      bg: 'bg-cyan-500/10',
    },
    {
      title: 'System Status',
      value: stats?.status === 'ok' ? 'Online' : (stats?.status || 'Offline'),
      icon: Server,
      color: stats?.status === 'ok' ? 'text-green-500' : 'text-red-500',
      bg: stats?.status === 'ok' ? 'bg-green-500/10' : 'bg-red-500/10',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">System Overview</h2>
        <div className="flex items-center gap-4">
          {/* Neural Control Toggle */}
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Neural Training</span>
            <button
              onClick={handleToggle}
              className={`p-1.5 rounded-md transition-all ${isLearning ? 'bg-green-500/20 text-green-500 hover:bg-green-500/30' : 'bg-red-500/20 text-red-500 hover:bg-red-500/30'}`}
            >
              {isLearning ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stats?.status === 'ok' ? 'bg-green-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${stats?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-sm text-gray-400">Live Updates</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => (
          <div key={card.title} className={`bg-gray-900 border border-gray-800 rounded-xl p-6 transition-all ${card.title.includes('Synapses') && isLearning ? 'shadow-[0_0_15px_rgba(168,85,247,0.15)] border-purple-500/30' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.bg}`}>
                <card.icon className={`w-6 h-6 ${card.color} ${card.title.includes('Synapses') && isLearning ? 'animate-pulse' : ''}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 bg-gray-800 px-2 py-1 rounded">
                Real-time
              </span>
            </div>
            <h3 className="text-gray-400 text-sm font-medium">{card.title}</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <p className="text-2xl font-bold text-white">
                {loading ? (
                  <span className="animate-pulse bg-gray-800 h-8 w-16 block rounded"></span>
                ) : (
                  card.value
                )}
              </p>
              {card.suffix && <span className="text-xs text-gray-500 font-mono tracking-tighter">{card.suffix}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* INTELLIGENCE TICKER */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 overflow-hidden shadow-inner">
        <div className="flex items-center gap-2 text-purple-400 font-bold text-xs uppercase tracking-widest shrink-0">
          <Zap size={14} className="fill-current animate-bounce" />
          Latest Intel
        </div>
        <div className="h-6 w-px bg-gray-800 shrink-0" />
        <div className="text-sm text-gray-400 font-mono truncate animate-in slide-in-from-right duration-500">
          {brainStats?.lastLearned || "Watching for neural patterns..."}
        </div>
      </div>

      {/* Charts section remains ... */}

      {/* Placeholder for more charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-96 flex items-center justify-center text-gray-500">
          Activity Chart Placeholder
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-96 flex items-center justify-center text-gray-500">
          Recent Logs Placeholder
        </div>
      </div>
    </div>
  );
}
