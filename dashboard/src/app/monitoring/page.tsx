'use client';

import { Activity, Clock, CheckCircle, XCircle } from 'lucide-react';
import { getSystemStats } from '@/lib/api';
import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function MonitoringPage() {
    const [data, setData] = useState<any[]>([]);

    // Simulate real-time data
    useEffect(() => {
        const interval = setInterval(() => {
            setData(prev => {
                const now = new Date();
                const time = now.getHours() + ':' + now.getMinutes() + ':' + now.getSeconds();
                const newItem = {
                    time,
                    cpu: Math.floor(Math.random() * 30) + 20, // Mock 20-50%
                    memory: Math.floor(Math.random() * 40) + 30, // Mock 30-70%
                    requests: Math.floor(Math.random() * 100),
                };
                const newData = [...prev, newItem];
                if (newData.length > 20) newData.shift();
                return newData;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-white mb-6">System Monitoring</h1>

            {/* Live Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* CPU Usage */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-gray-400 text-sm font-medium mb-4">CPU Usage (%)</h3>
                    <div className="h-64" style={{ minHeight: '250px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="time" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                                    itemStyle={{ color: '#E5E7EB' }}
                                />
                                <Line type="monotone" dataKey="cpu" stroke="#3B82F6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Memory Usage */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-gray-400 text-sm font-medium mb-4">Memory Usage (MB)</h3>
                    <div className="h-64" style={{ minHeight: '250px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="time" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                                    itemStyle={{ color: '#E5E7EB' }}
                                />
                                <Line type="monotone" dataKey="memory" stroke="#8B5CF6" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Detailed Metrics */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                    <h3 className="text-gray-200 font-medium">Tool Performance Metrics</h3>
                </div>
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-800 text-gray-200 uppercase font-medium">
                        <tr>
                            <th className="px-6 py-3">Tool Name</th>
                            <th className="px-6 py-3">Success Rate</th>
                            <th className="px-6 py-3">Avg Latency</th>
                            <th className="px-6 py-3">Total Calls</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        <tr className="hover:bg-gray-800/50">
                            <td className="px-6 py-4 font-medium text-white">python_builder</td>
                            <td className="px-6 py-4 text-green-400">98%</td>
                            <td className="px-6 py-4">450ms</td>
                            <td className="px-6 py-4">1,240</td>
                        </tr>
                        <tr className="hover:bg-gray-800/50">
                            <td className="px-6 py-4 font-medium text-white">git_ops</td>
                            <td className="px-6 py-4 text-yellow-400">92%</td>
                            <td className="px-6 py-4">1200ms</td>
                            <td className="px-6 py-4">850</td>
                        </tr>
                        <tr className="hover:bg-gray-800/50">
                            <td className="px-6 py-4 font-medium text-white">knowledge_search</td>
                            <td className="px-6 py-4 text-green-400">99%</td>
                            <td className="px-6 py-4">150ms</td>
                            <td className="px-6 py-4">5,300</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
