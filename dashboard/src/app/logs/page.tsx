'use client';

import { Search, Filter, Download } from 'lucide-react';

export default function LogsPage() {
    const logs = [
        { id: 'log_1', level: 'info', message: 'API Server started on port 3000', timestamp: '2024-01-20 10:00:01', source: 'system' },
        { id: 'log_2', level: 'info', message: 'MongoDB connected successfully', timestamp: '2024-01-20 10:00:02', source: 'db' },
        { id: 'log_3', level: 'warn', message: 'High latency detected on /tools endpoint', timestamp: '2024-01-20 10:15:30', source: 'monitoring' },
        { id: 'log_4', level: 'error', message: 'Authentication failed for user admin', timestamp: '2024-01-20 10:20:11', source: 'auth' },
        { id: 'log_5', level: 'info', message: 'Tool execution: python_builder', timestamp: '2024-01-20 10:25:00', source: 'tools' },
    ];

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'error': return 'text-red-400 bg-red-400/10';
            case 'warn': return 'text-yellow-400 bg-yellow-400/10';
            case 'info': return 'text-blue-400 bg-blue-400/10';
            default: return 'text-gray-400 bg-gray-400/10';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-white">System Logs</h1>
                <div className="flex gap-2">
                    <button className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors">
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                    <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                        <Download className="w-4 h-4" /> Export
                    </button>
                </div>
            </div>

            {/* Log Viewer */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Toolbar */}
                <div className="p-4 border-b border-gray-800 flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Search logs..."
                            className="w-full bg-gray-950 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    <select className="bg-gray-950 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500">
                        <option>All Levels</option>
                        <option>Info</option>
                        <option>Warn</option>
                        <option>Error</option>
                    </select>
                </div>

                {/* Logs List */}
                <div className="divide-y divide-gray-800 font-mono text-sm">
                    {logs.map(log => (
                        <div key={log.id} className="p-4 hover:bg-gray-800/50 flex gap-4 items-start cursor-pointer transition-colors">
                            <span className="text-gray-500 w-40 shrink-0">{log.timestamp}</span>
                            <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold w-16 text-center ${getLevelColor(log.level)}`}>
                                {log.level}
                            </span>
                            <span className="text-gray-400 w-24 shrink-0">[{log.source}]</span>
                            <span className="text-gray-300 flex-1">{log.message}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
