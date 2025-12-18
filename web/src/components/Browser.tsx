import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, Camera, FileText, 
    Terminal, Activity, X, MousePointer, Search, AlertCircle, CheckCircle2 
} from 'lucide-react';
import { API_URL } from '../config';

interface LogEntry {
    type: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
}

interface NetworkEntry {
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
}

export function Browser() {
    const [url, setUrl] = useState('');
    const [currentUrl, setCurrentUrl] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'view' | 'console' | 'network'>('view');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [network, setNetwork] = useState<NetworkEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const imageRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        checkStatus();
        const interval = setInterval(refreshData, 2000);
        return () => clearInterval(interval);
    }, []);

    const checkStatus = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/status`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const data = await res.json();
            if (data.active) {
                setIsConnected(true);
                setCurrentUrl(data.url);
                if (!url) setUrl(data.url);
                refreshData();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const refreshData = async () => {
        if (!isConnected) return;
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        try {
            // Get Screenshot
            if (activeTab === 'view') {
                const imgRes = await fetch(`${API_URL}/browser/screenshot`, { headers });
                const imgData = await imgRes.json();
                if (imgData.image) setImage(imgData.image);
            }

            // Get Logs
            const logRes = await fetch(`${API_URL}/browser/logs`, { headers });
            setLogs(await logRes.json());

            // Get Network
            const netRes = await fetch(`${API_URL}/browser/network`, { headers });
            setNetwork(await netRes.json());
        } catch (e) {
            console.error(e);
        }
    };

    const handleNavigate = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/navigate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (data.success) {
                setIsConnected(true);
                setCurrentUrl(data.url);
                setUrl(data.url);
                refreshData();
            }
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async (type: string, payload: any = {}) => {
        try {
            const token = localStorage.getItem('token');
            await fetch(`${API_URL}/browser/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ type, ...payload })
            });
            if (['back', 'forward', 'reload'].includes(type)) {
                setTimeout(refreshData, 1000);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale coordinates to actual 1280x800 viewport
        const scaleX = 1280 / rect.width;
        const scaleY = 800 / rect.height;

        await handleAction('click', { x: x * scaleX, y: y * scaleY });
        setTimeout(refreshData, 500);
    };

    const handleDownloadPdf = async () => {
        const token = localStorage.getItem('token');
        window.open(`${API_URL}/browser/pdf?token=${token}`, '_blank');
    };

    const closeSession = async () => {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/browser/close`, {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        setIsConnected(false);
        setImage(null);
        setLogs([]);
        setNetwork([]);
    };

    return (
        <div className="h-full flex flex-col bg-gray-900 text-gray-100">
            {/* Toolbar */}
            <div className="p-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <button onClick={() => handleAction('back')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                        <ArrowLeft size={16} />
                    </button>
                    <button onClick={() => handleAction('forward')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                        <ArrowRight size={16} />
                    </button>
                    <button onClick={() => handleAction('reload')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white">
                        <RotateCw size={16} />
                    </button>
                </div>

                <form onSubmit={handleNavigate} className="flex-1 flex gap-2">
                    <div className="flex-1 relative">
                        <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            placeholder="Enter URL..."
                            className="w-full bg-gray-900 border border-gray-600 rounded-md pl-9 pr-3 py-1.5 text-sm focus:border-blue-500 outline-none"
                        />
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Go'}
                    </button>
                </form>

                <div className="flex items-center gap-1 border-l border-gray-700 pl-2">
                    <button 
                        onClick={handleDownloadPdf}
                        disabled={!isConnected}
                        className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-white disabled:opacity-30"
                        title="Export PDF"
                    >
                        <FileText size={16} />
                    </button>
                    <button 
                        onClick={closeSession}
                        disabled={!isConnected}
                        className="p-1.5 rounded hover:bg-red-900/50 text-red-400 hover:text-red-300 disabled:opacity-30"
                        title="End Session"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-gray-800 border-b border-gray-700">
                <button 
                    onClick={() => setActiveTab('view')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'view' ? 'bg-gray-900 text-blue-400 border-t-2 border-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <MousePointer size={14} /> Interactive View
                </button>
                <button 
                    onClick={() => setActiveTab('console')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'console' ? 'bg-gray-900 text-yellow-400 border-t-2 border-yellow-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <Terminal size={14} /> Console <span className="text-xs bg-gray-700 px-1.5 rounded-full">{logs.length}</span>
                </button>
                <button 
                    onClick={() => setActiveTab('network')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'network' ? 'bg-gray-900 text-green-400 border-t-2 border-green-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <Activity size={14} /> Network <span className="text-xs bg-gray-700 px-1.5 rounded-full">{network.length}</span>
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative bg-gray-950">
                {activeTab === 'view' && (
                    <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                        {isConnected ? (
                            image ? (
                                <div className="relative shadow-2xl border border-gray-800 rounded-lg overflow-hidden">
                                    <img 
                                        ref={imageRef}
                                        src={image} 
                                        alt="Browser View" 
                                        onClick={handleImageClick}
                                        className="max-w-none cursor-crosshair"
                                        style={{ width: 1280, height: 800, transform: 'scale(0.8)', transformOrigin: 'top center' }}
                                    />
                                    <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                                        1280x800
                                    </div>
                                </div>
                            ) : (
                                <div className="text-gray-500 flex flex-col items-center">
                                    <Camera className="w-12 h-12 mb-4 opacity-20" />
                                    <p>Waiting for display...</p>
                                </div>
                            )
                        ) : (
                            <div className="text-center max-w-md">
                                <Globe className="w-16 h-16 mx-auto mb-6 text-gray-700" />
                                <h3 className="text-xl font-bold mb-2">Cloud Browser</h3>
                                <p className="text-gray-400 mb-6">Enter a URL in the toolbar to start a secure, interactive browsing session.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'console' && (
                    <div className="h-full overflow-auto p-4 font-mono text-xs">
                        {logs.length === 0 ? (
                            <div className="text-gray-500 italic">No console logs yet.</div>
                        ) : (
                            <div className="space-y-1">
                                {logs.map((log, i) => (
                                    <div key={i} className={`flex gap-2 py-1 border-b border-gray-800 ${
                                        log.type === 'error' ? 'text-red-400' :
                                        log.type === 'warn' ? 'text-yellow-400' :
                                        'text-gray-300'
                                    }`}>
                                        <span className="opacity-50 w-20 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                        <span className="uppercase font-bold w-16 shrink-0 text-[10px] tracking-wider opacity-70">{log.type}</span>
                                        <span className="break-all">{log.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'network' && (
                    <div className="h-full overflow-auto p-0">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-gray-800 text-gray-400 sticky top-0">
                                <tr>
                                    <th className="p-2 border-b border-gray-700">Status</th>
                                    <th className="p-2 border-b border-gray-700">Method</th>
                                    <th className="p-2 border-b border-gray-700">Type</th>
                                    <th className="p-2 border-b border-gray-700">Name</th>
                                    <th className="p-2 border-b border-gray-700">Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {network.map((req, i) => (
                                    <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                                        <td className="p-2">
                                            <span className={`px-1.5 py-0.5 rounded ${
                                                !req.status ? 'bg-gray-700 text-gray-300' :
                                                req.status < 300 ? 'bg-green-900/30 text-green-400' :
                                                req.status < 400 ? 'bg-blue-900/30 text-blue-400' :
                                                'bg-red-900/30 text-red-400'
                                            }`}>
                                                {req.status || '...'}
                                            </span>
                                        </td>
                                        <td className="p-2 font-mono">{req.method}</td>
                                        <td className="p-2 text-gray-400">{req.type}</td>
                                        <td className="p-2 truncate max-w-xs" title={req.url}>
                                            {req.url.split('/').pop() || req.url}
                                        </td>
                                        <td className="p-2 text-gray-500">{new Date(req.timestamp).toLocaleTimeString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
