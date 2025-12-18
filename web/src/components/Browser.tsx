import { useState, useEffect, useRef } from 'react';
import { 
    Globe, ArrowLeft, ArrowRight, RotateCw, 
    Monitor, Code, Eye, Play, MousePointer2,
    X, Terminal, Activity, Sparkles, ChevronUp, ChevronDown,
    ShieldCheck, AlertTriangle, Smartphone, Tablet, Maximize2, Minimize2
} from 'lucide-react';
import { API_URL } from '../config';

interface LogEntry {
    type: 'log' | 'error' | 'warn' | 'info';
    message: string;
    timestamp: number;
    stackTrace?: string;
}

interface NetworkEntry {
    url: string;
    method: string;
    status?: number;
    type: string;
    timestamp: number;
    requestBody?: string;
    responseBody?: string;
}

interface AuditReport {
    score: number;
    issues: {
        severity: 'critical' | 'warning' | 'info';
        message: string;
        selector?: string;
    }[];
}

export function Browser() {
    // Core State
    const [url, setUrl] = useState('');
    const [currentUrl, setCurrentUrl] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    
    // UI State
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
    const [devToolsTab, setDevToolsTab] = useState<'console' | 'network' | 'script'>('console');
    const [showAiMenu, setShowAiMenu] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Data State
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [network, setNetwork] = useState<NetworkEntry[]>([]);
    
    // Feature State
    const [inspectMode, setInspectMode] = useState(false);
    const [inspectedElement, setInspectedElement] = useState<any>(null);
    const [script, setScript] = useState('');
    const [scriptResult, setScriptResult] = useState('');
    const [domAnalysis, setDomAnalysis] = useState('');
    const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
    const [selectedNetworkItem, setSelectedNetworkItem] = useState<NetworkEntry | null>(null);

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
                headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>
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
        const headers = (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>;

        try {
            const imgRes = await fetch(`${API_URL}/browser/screenshot`, { headers });
            const imgData = await imgRes.json();
            if (imgData.image) setImage(imgData.image);

            if (isDevToolsOpen) {
                const logRes = await fetch(`${API_URL}/browser/logs`, { headers });
                setLogs(await logRes.json());

                const netRes = await fetch(`${API_URL}/browser/network`, { headers });
                setNetwork(await netRes.json());
            }
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
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                } as Record<string, string>,
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
        if (!isConnected) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_URL}/browser/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                } as Record<string, string>,
                body: JSON.stringify({ type, ...payload })
            });
            const data = await res.json();
            if (data.success) {
                if (type === 'viewport') refreshData();
                else setTimeout(refreshData, 500);
            }
            return data;
        } catch (e) {
            console.error(e);
        }
    };

    const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
        if (!imageRef.current) return;
        const rect = imageRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const relX = x / rect.width;
        const relY = y / rect.height;
        
        const viewportW = 1280; 
        const viewportH = 800;
        
        const finalX = relX * viewportW;
        const finalY = relY * viewportH;

        if (inspectMode) {
            const data = await handleAction('inspect', { x: finalX, y: finalY });
            if (data?.info) {
                setInspectedElement(data.info);
                // Modal will open automatically when inspectedElement is set
            }
        } else {
            await handleAction('click', { x: finalX, y: finalY });
            setTimeout(refreshData, 500);
        }
    };

    const closeSession = async () => {
        const token = localStorage.getItem('token');
        await fetch(`${API_URL}/browser/close`, {
            method: 'POST',
            headers: (token ? { Authorization: `Bearer ${token}` } : {}) as Record<string, string>
        });
        setIsConnected(false);
        setImage(null);
        setLogs([]);
        setNetwork([]);
    };

    // AI Tools
    const runAudit = async () => {
        setShowAiMenu(false);
        const data = await handleAction('audit');
        if (data?.audit) {
            setAuditReport(data.audit);
        }
    };

    const analyzeDom = async () => {
        setShowAiMenu(false);
        const data = await handleAction('dom');
        if (data?.dom) {
            setDomAnalysis(JSON.stringify(data.dom, null, 2));
        }
    };

    return (
        <div className="h-full flex flex-col bg-zinc-950 relative overflow-hidden font-sans selection:bg-indigo-500/30">
            
            {/* Main Content Area - Full Screen */}
            <div className="flex-1 relative w-full h-full flex items-center justify-center overflow-hidden bg-zinc-900/50">
                {isConnected && image ? (
                    <div className={`relative transition-all duration-500 ease-in-out ${isFullscreen ? 'w-full h-full' : 'w-full h-full p-0'}`}>
                        <img 
                            ref={imageRef}
                            src={image} 
                            alt="Browser Content"
                            onClick={handleImageClick}
                            className={`w-full h-full object-contain transition-all duration-500 ${inspectMode ? 'cursor-crosshair scale-[0.98] opacity-90' : 'cursor-default'}`}
                        />
                        
                        {/* Modern Inspect Overlay */}
                        {inspectMode && (
                            <div className="absolute inset-0 bg-indigo-500/10 pointer-events-none flex items-center justify-center backdrop-blur-[1px] animate-in fade-in duration-300">
                                <div className="bg-indigo-600/90 backdrop-blur-md text-white px-6 py-2 rounded-full shadow-2xl font-medium animate-bounce flex items-center gap-2 border border-indigo-400/30">
                                    <MousePointer2 size={16} />
                                    <span>Select an element to inspect</span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-600 gap-6 animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-zinc-900 rounded-[2rem] flex items-center justify-center shadow-2xl border border-zinc-800">
                            <Globe size={48} className="text-zinc-700" />
                        </div>
                        <p className="text-zinc-500 font-medium tracking-wide">Enter a URL to start browsing</p>
                    </div>
                )}
            </div>

            {/* Floating Navigation Pill - The "Elegant" Control Center */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-4 w-full max-w-3xl pointer-events-none">
                
                {/* AI Menu Popup */}
                {showAiMenu && (
                    <div className="pointer-events-auto mb-2 bg-zinc-900/90 backdrop-blur-xl border border-zinc-700/50 rounded-2xl p-2 shadow-2xl flex flex-col gap-1 min-w-[200px] animate-in slide-in-from-bottom-5 fade-in duration-300">
                        <button onClick={() => setInspectMode(!inspectMode)} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${inspectMode ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-300 hover:bg-zinc-800'}`}>
                            <MousePointer2 size={16} /> 
                            <span>Inspect Element</span>
                            {inspectMode && <span className="ml-auto w-2 h-2 bg-white rounded-full animate-pulse" />}
                        </button>
                        <button onClick={runAudit} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-all">
                            <Activity size={16} /> UI/UX Audit
                        </button>
                        <button onClick={analyzeDom} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-all">
                            <Code size={16} /> Analyze DOM
                        </button>
                    </div>
                )}

                {/* Main Glass Bar */}
                <div className="pointer-events-auto flex items-center gap-2 p-2 rounded-full bg-zinc-950/80 backdrop-blur-2xl border border-zinc-800/50 shadow-2xl shadow-black/50 transition-all hover:bg-zinc-950/90 hover:scale-[1.01] hover:border-zinc-700/50 w-full max-w-2xl">
                    
                    {/* Navigation Actions */}
                    <div className="flex items-center gap-1 pl-2">
                        <button onClick={() => handleAction('back')} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95"><ArrowLeft size={18} /></button>
                        <button onClick={() => handleAction('forward')} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95"><ArrowRight size={18} /></button>
                        <button onClick={() => handleAction('reload')} className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95"><RotateCw size={18} /></button>
                    </div>

                    {/* Separator */}
                    <div className="w-px h-6 bg-zinc-800 mx-1" />

                    {/* URL Input */}
                    <form onSubmit={handleNavigate} className="flex-1 relative group">
                        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                            {isConnected ? <ShieldCheck className="w-4 h-4 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> : <Globe className="w-4 h-4 text-zinc-500" />}
                        </div>
                        <input 
                            type="text" 
                            value={url}
                            onChange={e => setUrl(e.target.value)}
                            className="w-full bg-zinc-900/50 text-sm text-zinc-200 rounded-full py-2.5 pl-10 pr-4 border border-transparent focus:border-indigo-500/50 focus:bg-zinc-900 focus:shadow-[0_0_20px_rgba(99,102,241,0.15)] outline-none transition-all placeholder:text-zinc-600 font-medium"
                            placeholder="Type a URL to visit..."
                        />
                    </form>

                    {/* Separator */}
                    <div className="w-px h-6 bg-zinc-800 mx-1" />

                    {/* Tools */}
                    <div className="flex items-center gap-1 pr-1">
                        <button 
                            onClick={() => setShowAiMenu(!showAiMenu)} 
                            className={`p-2.5 rounded-full transition-all active:scale-95 ${showAiMenu ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'text-zinc-400 hover:text-indigo-400 hover:bg-indigo-500/10'}`}
                            title="AI Tools"
                        >
                            <Sparkles size={18} />
                        </button>
                        
                        <button 
                            onClick={() => setIsDevToolsOpen(!isDevToolsOpen)} 
                            className={`p-2.5 rounded-full transition-all active:scale-95 ${isDevToolsOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                            title="Developer Tools"
                        >
                            <Terminal size={18} />
                        </button>

                        <button 
                            onClick={() => setIsFullscreen(!isFullscreen)} 
                            className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-all active:scale-95"
                            title="Fullscreen"
                        >
                            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                        </button>

                        {isConnected && (
                            <button 
                                onClick={closeSession} 
                                className="p-2.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-all active:scale-95 ml-1"
                                title="End Session"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modern Sliding DevTools Panel */}
            <div className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${isDevToolsOpen ? 'translate-y-0 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]' : 'translate-y-full'}`} style={{ height: '400px' }}>
                {/* Drag Handle / Close */}
                <div className="h-10 flex items-center justify-between px-6 border-b border-zinc-800/50 bg-white/5">
                    <div className="flex items-center gap-6">
                         <span className="text-xs font-bold text-zinc-500 tracking-widest uppercase">Developer Tools</span>
                         <div className="flex bg-zinc-900/50 rounded-lg p-1 border border-zinc-800">
                            {['console', 'network', 'script'].map((tab) => (
                                <button 
                                    key={tab}
                                    onClick={() => setDevToolsTab(tab as any)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-bold tracking-wider transition-all ${devToolsTab === tab ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {tab.toUpperCase()}
                                    {tab === 'console' && logs.length > 0 && <span className="ml-1.5 opacity-60">{logs.length}</span>}
                                    {tab === 'network' && network.length > 0 && <span className="ml-1.5 opacity-60">{network.length}</span>}
                                </button>
                            ))}
                         </div>
                    </div>
                    <button onClick={() => setIsDevToolsOpen(false)} className="p-1.5 text-zinc-500 hover:text-white transition-colors">
                        <ChevronDown size={16} />
                    </button>
                </div>

                <div className="h-[360px] overflow-hidden">
                    {/* Console Tab */}
                    {devToolsTab === 'console' && (
                        <div className="h-full overflow-auto p-4 font-mono text-xs space-y-2">
                            {logs.length === 0 && <div className="text-zinc-600 italic text-center mt-10">No logs captured yet</div>}
                            {logs.map((log, i) => (
                                <div key={i} className={`flex gap-3 p-2 rounded border border-transparent hover:bg-white/5 hover:border-white/5 transition-colors ${log.type === 'error' ? 'text-red-400 bg-red-500/5 border-red-500/10' : log.type === 'warn' ? 'text-amber-400' : 'text-zinc-300'}`}>
                                    <span className="text-zinc-600 w-16 shrink-0">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span className={`uppercase font-bold text-[10px] px-1.5 py-0.5 rounded w-12 shrink-0 text-center self-start ${log.type === 'error' ? 'bg-red-500/20' : log.type === 'warn' ? 'bg-amber-500/20' : 'bg-zinc-800'}`}>{log.type}</span>
                                    <span className="break-all whitespace-pre-wrap leading-relaxed">{log.message}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Network Tab */}
                    {devToolsTab === 'network' && (
                        <div className="h-full flex">
                            <div className={`${selectedNetworkItem ? 'w-1/2' : 'w-full'} h-full overflow-auto border-r border-zinc-800`}>
                                <table className="w-full text-left text-xs font-mono">
                                    <thead className="bg-white/5 text-zinc-500 sticky top-0 backdrop-blur-sm">
                                        <tr>
                                            <th className="p-3 font-medium">Status</th>
                                            <th className="p-3 font-medium">Method</th>
                                            <th className="p-3 font-medium">Name</th>
                                            <th className="p-3 font-medium">Type</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-800/50">
                                        {network.map((req, i) => (
                                            <tr key={i} onClick={() => setSelectedNetworkItem(req)} className={`cursor-pointer hover:bg-white/5 transition-colors ${selectedNetworkItem === req ? 'bg-indigo-500/10' : ''}`}>
                                                <td className={`p-3 ${req.status && req.status >= 400 ? 'text-red-400' : 'text-emerald-400'}`}>{req.status || '-'}</td>
                                                <td className="p-3 text-amber-400">{req.method}</td>
                                                <td className="p-3 text-zinc-300 truncate max-w-xs" title={req.url}>{req.url.split('/').pop() || req.url}</td>
                                                <td className="p-3 text-zinc-500">{req.type}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {selectedNetworkItem && (
                                <div className="w-1/2 h-full bg-zinc-900/50 p-6 overflow-auto font-mono text-xs">
                                    <div className="flex justify-between items-start mb-6">
                                        <h3 className="text-sm font-bold text-white">Request Details</h3>
                                        <button onClick={() => setSelectedNetworkItem(null)} className="text-zinc-500 hover:text-white"><X size={14}/></button>
                                    </div>
                                    <div className="space-y-6">
                                        <div>
                                            <div className="text-zinc-500 mb-1 text-[10px] uppercase tracking-wider">URL</div>
                                            <div className="text-indigo-300 break-all bg-zinc-950 p-2 rounded border border-zinc-800">{selectedNetworkItem.url}</div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <div className="text-zinc-500 mb-1 text-[10px] uppercase tracking-wider">Method</div>
                                                <div className="text-white">{selectedNetworkItem.method}</div>
                                            </div>
                                            <div>
                                                <div className="text-zinc-500 mb-1 text-[10px] uppercase tracking-wider">Status</div>
                                                <div className={selectedNetworkItem.status && selectedNetworkItem.status >= 400 ? 'text-red-400' : 'text-emerald-400'}>{selectedNetworkItem.status || 'Pending'}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Script Tab */}
                    {devToolsTab === 'script' && (
                        <div className="h-full flex flex-col p-4 gap-4">
                            <textarea 
                                value={script}
                                onChange={e => setScript(e.target.value)}
                                className="flex-1 bg-zinc-900 text-zinc-300 font-mono text-xs p-4 rounded-xl border border-zinc-800 focus:border-indigo-500 outline-none resize-none shadow-inner"
                                placeholder="// Enter JavaScript to execute in the browser page..."
                            />
                            <div className="flex justify-end gap-2">
                                <button onClick={async () => {
                                    const data = await handleAction('evaluate', { script });
                                    if (data?.result) setScriptResult(JSON.stringify(data.result, null, 2));
                                }} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-500/20">
                                    EXECUTE
                                </button>
                            </div>
                            {scriptResult && (
                                <div className="h-1/3 bg-zinc-950 rounded-xl border border-zinc-800 p-4 font-mono text-xs overflow-auto">
                                    <div className="text-zinc-500 mb-2 text-[10px] uppercase tracking-wider">Result</div>
                                    <pre className="text-emerald-400">{scriptResult}</pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Results Overlay Modal */}
            {(domAnalysis || auditReport || inspectedElement) && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 animate-in fade-in duration-200">
                    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                {inspectedElement ? <><MousePointer2 className="text-indigo-400"/> Element Inspection</> : 
                                 auditReport ? <><Activity className="text-indigo-400"/> UI/UX Audit Report</> : 
                                 <><Code className="text-indigo-400"/> DOM Analysis</>}
                            </h2>
                            <button 
                                onClick={() => { setDomAnalysis(''); setAuditReport(null); setInspectedElement(null); setIsDevToolsOpen(false); }}
                                className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 overflow-auto bg-zinc-950/50">
                            {inspectedElement && (
                                <div className="space-y-4 font-mono text-sm">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                            <div className="text-zinc-500 text-xs uppercase mb-2">Tag</div>
                                            <div className="text-indigo-400 font-bold text-lg">&lt;{inspectedElement.tagName.toLowerCase()}&gt;</div>
                                        </div>
                                        {inspectedElement.id && (
                                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                                <div className="text-zinc-500 text-xs uppercase mb-2">ID</div>
                                                <div className="text-emerald-400">#{inspectedElement.id}</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                        <div className="text-zinc-500 text-xs uppercase mb-2">Attributes</div>
                                        <div className="space-y-1">
                                            {Object.entries(inspectedElement.attributes || {}).map(([k, v]) => (
                                                <div key={k} className="flex gap-2">
                                                    <span className="text-amber-400">{k}=</span>
                                                    <span className="text-zinc-300">"{String(v)}"</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                        <div className="text-zinc-500 text-xs uppercase mb-2">Text Content</div>
                                        <div className="text-zinc-300 break-words">{inspectedElement.text?.slice(0, 200)}</div>
                                    </div>
                                </div>
                            )}

                            {auditReport && (
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 rounded-full flex items-center justify-center border-4 border-zinc-800 text-2xl font-bold relative">
                                            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                                                <circle cx="50" cy="50" r="46" fill="none" stroke="#27272a" strokeWidth="8" />
                                                <circle cx="50" cy="50" r="46" fill="none" stroke={auditReport.score > 80 ? '#10b981' : auditReport.score > 50 ? '#f59e0b' : '#ef4444'} strokeWidth="8" strokeDasharray={`${auditReport.score * 2.89} 289`} strokeLinecap="round" />
                                            </svg>
                                            {auditReport.score}
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold">Overall Score</h3>
                                            <p className="text-zinc-500">Based on accessibility, performance, and best practices.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        {auditReport.issues.map((issue, i) => (
                                            <div key={i} className="flex gap-4 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
                                                <div className={`w-2 h-full rounded-full self-stretch ${issue.severity === 'critical' ? 'bg-red-500' : issue.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                                                <div>
                                                    <div className={`text-xs font-bold uppercase mb-1 ${issue.severity === 'critical' ? 'text-red-400' : issue.severity === 'warning' ? 'text-amber-400' : 'text-blue-400'}`}>{issue.severity}</div>
                                                    <div className="text-zinc-200 font-medium">{issue.message}</div>
                                                    {issue.selector && <div className="text-zinc-500 text-xs font-mono mt-2 bg-black/30 p-1 rounded inline-block">{issue.selector}</div>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {domAnalysis && (
                                <pre className="font-mono text-xs text-zinc-300 bg-zinc-900 p-4 rounded-xl border border-zinc-800 overflow-auto max-h-[60vh]">
                                    {domAnalysis}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
