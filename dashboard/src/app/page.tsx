'use client';

import { Activity, Box, Server } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getSystemStats } from '@/lib/api';


interface SystemStats {
  status: string;
  toolsCount: number;
  uptime: string;
  activeRuns: number;
}

export default function Home() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const sysData = await getSystemStats();
      setStats(sysData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 2000);
    return () => clearInterval(interval);
  }, []);

  const cards = [
    {
      title: 'Active Runs',
      value: stats?.activeRuns ?? '-',
      icon: Activity,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
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
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stats?.status === 'ok' ? 'bg-green-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-3 w-3 ${stats?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}></span>
            </span>
            <span className="text-sm text-gray-400">Live Updates</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((card) => (
          <div key={card.title} className="bg-gray-900 border border-gray-800 rounded-xl p-6 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${card.bg}`}>
                <card.icon className={`w-6 h-6 ${card.color}`} />
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
            </div>
          </div>
        ))}
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
