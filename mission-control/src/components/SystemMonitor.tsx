
import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Cpu, Database } from 'lucide-react';
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

    useEffect(() => {
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
        return () => clearInterval(interval);
    }, []);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-6 col-span-2 row-span-1"
        >
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-display font-bold flex items-center gap-2 neon-text">
                    <Activity className="text-cyan-400" /> SYSTEM VITALITY
                </h2>
                <div className="flex gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1"><Cpu size={16} /> CORE: ONLINE</span>
                    <span className="flex items-center gap-1"><Database size={16} /> MEM: STABLE</span>
                </div>
            </div>

            <div className="h-64 w-full">
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
