import React, { useState, useEffect } from 'react';
import { Network, Play, RotateCcw, Search, ArrowUp, ArrowDown, Clock } from 'lucide-react';
import { WS_URL } from '../config';

interface NetworkRequest {
    id: string;
    method: string;
    url: string;
    status: number;
    duration: number;
    timestamp: string;
    query: any;
    body: any;
}

export default function NetworkInspector() {
    const [requests, setRequests] = useState<NetworkRequest[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        // Connect to WS to listen for requests
        const ws = new WebSocket(WS_URL);
        
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'network:request') {
                    setRequests(prev => [msg.data, ...prev].slice(0, 100)); // Keep last 100
                }
            } catch (e) {}
        };

        return () => ws.close();
    }, []);

    const selectedRequest = requests.find(r => r.id === selectedId);

    const getMethodColor = (method: string) => {
        switch (method) {
            case 'GET': return 'text-blue-500';
            case 'POST': return 'text-green-500';
            case 'PUT': return 'text-yellow-500';
            case 'DELETE': return 'text-red-500';
            default: return 'text-gray-500';
        }
    };

    const getStatusColor = (status: number) => {
        if (status >= 500) return 'text-red-500';
        if (status >= 400) return 'text-yellow-500';
        if (status >= 200) return 'text-green-500';
        return 'text-gray-500';
    };

    const filteredRequests = requests.filter(r => 
        r.url.toLowerCase().includes(filter.toLowerCase()) || 
        r.method.toLowerCase().includes(filter.toLowerCase())
    );

    return (
        <div className="flex h-full bg-[var(--bg-primary)]">
            {/* List */}
            <div className={`${selectedId ? 'w-1/2' : 'w-full'} flex flex-col border-r border-[var(--border-color)] transition-all duration-300`}>
                <div className="p-3 border-b border-[var(--border-color)] flex gap-2">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-2 top-2 text-[var(--text-muted)]" />
                        <input 
                            type="text" 
                            placeholder="Filter requests..." 
                            value={filter}
                            onChange={e => setFilter(e.target.value)}
                            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded pl-8 pr-2 py-1 text-xs"
                        />
                    </div>
                    <button 
                        onClick={() => setRequests([])}
                        className="p-1 text-[var(--text-muted)] hover:text-red-500"
                        title="Clear"
                    >
                        <RotateCcw size={14} />
                    </button>
                </div>
                <div className="flex-1 overflow-auto">
                    {filteredRequests.map(req => (
                        <div 
                            key={req.id}
                            onClick={() => setSelectedId(req.id)}
                            className={`p-3 border-b border-[var(--border-color)] cursor-pointer hover:bg-[var(--bg-hover)] ${selectedId === req.id ? 'bg-[var(--bg-active)]' : ''}`}
                        >
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-bold text-xs ${getMethodColor(req.method)}`}>{req.method}</span>
                                <span className={`text-xs ${getStatusColor(req.status)}`}>{req.status}</span>
                            </div>
                            <div className="text-xs truncate mb-1" title={req.url}>{req.url}</div>
                            <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                                <span>{new Date(req.timestamp).toLocaleTimeString()}</span>
                                <span>{req.duration}ms</span>
                            </div>
                        </div>
                    ))}
                    {filteredRequests.length === 0 && (
                        <div className="p-8 text-center text-[var(--text-muted)] text-xs">
                            No requests captured
                        </div>
                    )}
                </div>
            </div>

            {/* Details */}
            {selectedId && selectedRequest && (
                <div className="w-1/2 flex flex-col h-full bg-[var(--bg-secondary)]">
                    <div className="p-3 border-b border-[var(--border-color)] flex justify-between items-center bg-[var(--bg-primary)]">
                        <span className="font-semibold text-xs">Request Details</span>
                        <button onClick={() => setSelectedId(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">Close</button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-4">
                        <div>
                            <div className="text-[10px] uppercase text-[var(--text-muted)] font-bold mb-1">General</div>
                            <div className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] text-xs font-mono">
                                <div className="mb-1"><span className="text-blue-400">Request URL:</span> {selectedRequest.url}</div>
                                <div className="mb-1"><span className="text-blue-400">Request Method:</span> {selectedRequest.method}</div>
                                <div className="mb-1"><span className="text-blue-400">Status Code:</span> {selectedRequest.status}</div>
                            </div>
                        </div>

                        {selectedRequest.query && Object.keys(selectedRequest.query).length > 0 && (
                            <div>
                                <div className="text-[10px] uppercase text-[var(--text-muted)] font-bold mb-1">Query Params</div>
                                <pre className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] text-xs font-mono overflow-auto">
                                    {JSON.stringify(selectedRequest.query, null, 2)}
                                </pre>
                            </div>
                        )}

                        {selectedRequest.body && (
                            <div>
                                <div className="text-[10px] uppercase text-[var(--text-muted)] font-bold mb-1">Request Body</div>
                                <pre className="bg-[var(--bg-primary)] p-2 rounded border border-[var(--border-color)] text-xs font-mono overflow-auto max-h-60">
                                    {JSON.stringify(selectedRequest.body, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
