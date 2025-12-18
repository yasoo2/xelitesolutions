import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, Camera, FileText, 
    Smartphone, Tablet, Monitor, Code, Eye, Play, MousePointer2 
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
    const [activeTab, setActiveTab] = useState<'view' | 'console' | 'network' | 'script'>('view');
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [network, setNetwork] = useState<NetworkEntry[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    
    // Advanced features state
    const [viewport, setViewport] = useState({ w: 1280, h: 800, label: 'Desktop' });
    const [inspectMode, setInspectMode] = useState(false);
    const [inspectedElement, setInspectedElement] = useState<any>(null);
    const [script, setScript] = useState('');
    const [scriptResult, setScriptResult] = useState('');

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
            const res = await fetch(`${API_URL}/browser/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ type, ...payload })
            });
            
            if (['back', 'forward', 'reload', 'viewport'].includes(type)) {
                setTimeout(refreshData, 1000);
            }
            return await res.json();
        } catch (e) {
            console.error(e);
        }
    };

    const handleViewportChange = async (w: number, h: number, label: string) => {
        setViewport({ w, h, label });
        await handleAction('viewport', { width: w, height: h });
    };

    const handleRunScript = async () => {
        const data = await handleAction('evaluate', { script });
        if (data?.result) {
            setScriptResult(JSON.stringify(data.result, null, 2));
        }
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Scale coordinates to actual viewport
        const scaleX = viewport.w / rect.width;
        const scaleY = viewport.h / rect.height;
        
        const finalX = x * scaleX;
        const finalY = y * scaleY;

        if (inspectMode) {
            const data = await handleAction('inspect', { x: finalX, y: finalY });
            if (data?.info) {
                setInspectedElement(data.info);
            }
        } else {
            await handleAction('click', { x: finalX, y: finalY });
            setTimeout(refreshData, 500);
        }
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
                         onClick={() => setInspectMode(!inspectMode)}
                         disabled={!isConnected}
                         className={`p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 ${inspectMode ? 'bg-blue-900 text-blue-400' : 'text-gray-400 hover:text-white'}`}
                         title="Inspect Element"
                    >
                        <MousePointer2 size={16} />
                    </button>
                    <div className="flex bg-gray-900 rounded border border-gray-600">
                        <button 
                            onClick={() => handleViewportChange(1920, 1080, 'Desktop')} 
                            className={`p-1.5 ${viewport.label === 'Desktop' ? 'text-blue-400' : 'text-gray-400'}`}
                            title="Desktop (1920x1080)"
                        >
                            <Monitor size={16} />
                        </button>
                        <button 
                            onClick={() => handleViewportChange(768, 1024, 'Tablet')} 
                            className={`p-1.5 ${viewport.label === 'Tablet' ? 'text-blue-400' : 'text-gray-400'}`}
                            title="Tablet (768x1024)"
                        >
                            <Tablet size={16} />
                        </button>
                        <button 
                            onClick={() => handleViewportChange(375, 812, 'Mobile')} 
                            className={`p-1.5 ${viewport.label === 'Mobile' ? 'text-blue-400' : 'text-gray-400'}`}
                            title="Mobile (375x812)"
                        >
                            <Smartphone size={16} />
                        </button>
                    </div>

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
                <button 
                    onClick={() => setActiveTab('script')}
                    className={`px-4 py-2 text-sm font-medium flex items-center gap-2 ${activeTab === 'script' ? 'bg-gray-900 text-purple-400 border-t-2 border-purple-400' : 'text-gray-400 hover:text-gray-200'}`}
                >
                    <Code size={14} /> Script
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden relative bg-gray-950 flex">
                <div className={`flex-1 overflow-hidden relative ${inspectedElement ? 'w-2/3' : 'w-full'}`}>
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
                                        className={`max-w-none ${inspectMode ? 'cursor-help' : 'cursor-crosshair'}`}
                                        style={{ 
                                            width: viewport.w, 
                                            height: viewport.h, 
                                            transform: `scale(${viewport.w > 1000 ? 0.6 : 0.8})`, 
                                            transformOrigin: 'top center' 
                                        }}
                                    />
                                    <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
                                        {viewport.w}x{viewport.h}
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

                {activeTab === 'script' && (
                    <div className="h-full flex flex-col p-4">
                        <textarea 
                            value={script}
                            onChange={e => setScript(e.target.value)}
                            placeholder="// Write JavaScript code to run on the page...
// Example: return document.title;"
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-4 font-mono text-sm text-gray-300 focus:border-blue-500 outline-none resize-none mb-4"
                        />
                        <div className="flex justify-between items-center mb-4">
                            <button 
                                onClick={handleRunScript}
                                disabled={!script || !isConnected}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-white flex items-center gap-2 disabled:opacity-50"
                            >
                                <Play size={16} /> Run Script
                            </button>
                        </div>
                        {scriptResult && (
                            <div className="bg-gray-900 rounded-lg border border-gray-700 p-4 font-mono text-xs overflow-auto h-1/3">
                                <div className="text-gray-500 mb-2 uppercase text-[10px] tracking-wider font-bold">Result</div>
                                <pre className="text-green-400">{scriptResult}</pre>
                            </div>
                        )}
                    </div>
                )}
                </div>

                {/* Inspector Panel */}
                {inspectedElement && (
                    <div className="w-1/3 border-l border-gray-700 bg-gray-900 p-4 overflow-auto font-mono text-xs shadow-xl z-10">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-200 flex items-center gap-2">
                                <Eye className="text-blue-400" size={16} />
                                Inspector
                            </h3>
                            <button onClick={() => setInspectedElement(null)} className="text-gray-500 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="text-gray-500 mb-1">Element</div>
                                <div className="text-blue-300 break-all">
                                    &lt;{inspectedElement.tagName}
                                    {inspectedElement.id && <span className="text-yellow-300"> id="{inspectedElement.id}"</span>}
                                    {inspectedElement.className && <span className="text-green-300"> class="{inspectedElement.className}"</span>}
                                    &gt;
                                </div>
                            </div>

                            <div>
                                <div className="text-gray-500 mb-1">Dimensions</div>
                                <div className="grid grid-cols-2 gap-2 text-gray-300">
                                    <div>W: {Math.round(inspectedElement.rect.width)}px</div>
                                    <div>H: {Math.round(inspectedElement.rect.height)}px</div>
                                    <div>X: {Math.round(inspectedElement.rect.left)}px</div>
                                    <div>Y: {Math.round(inspectedElement.rect.top)}px</div>
                                </div>
                            </div>

                            <div>
                                <div className="text-gray-500 mb-1">Computed Styles</div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-800 space-y-1 text-gray-400">
                                    {Object.entries(inspectedElement.styles).map(([k, v]) => (
                                        v && <div key={k}><span className="text-purple-400">{k}:</span> <span className="text-gray-300">{v as string}</span></div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="text-gray-500 mb-1">Content</div>
                                <div className="bg-gray-950 p-2 rounded border border-gray-800 text-gray-400 break-words whitespace-pre-wrap max-h-40 overflow-auto">
                                    {inspectedElement.innerText || inspectedElement.innerHTML}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
